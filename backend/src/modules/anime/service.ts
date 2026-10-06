/**
 * Anime service (P1/P2/P4).
 *
 * The read-through/write-through boundary lives here, not in the routes: a
 * route decides *what* to return, the service decides *where the data comes
 * from*. That split is what lets an endpoint serve from Postgres while still
 * backfilling from AniList on a miss.
 */

import { cache } from "../../cache/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import { AnilistProvider } from "../../providers/metadata/anilist.js";
import type { BrowseQuery, ProviderEpisode } from "../../providers/metadata/types.js";
import { AnimeRepository, type AnimeListOptions } from "./repository.js";
import { toCard, type DiscoveryCard } from "./discovery.js";

/** Discovery buckets and their TTLs, from P2. */
const DISCOVERY_TTL: Record<string, number> = {
  trending: config.CACHE_TTL_DISCOVERY_S,
  popular: config.CACHE_TTL_DISCOVERY_S,
  seasonal: config.CACHE_TTL_DISCOVERY_S * 4,
  topRated: config.CACHE_TTL_DISCOVERY_S * 4,
  updated: config.CACHE_TTL_DISCOVERY_S,
};

export type DiscoveryBucket = "trending" | "popular" | "seasonal" | "topRated" | "updated";

export interface DiscoveryOptions {
  page?: number;
  perPage?: number;
  season?: string;
  seasonYear?: number;
}

export class AnimeService {
  readonly #anilist = new AnilistProvider();

  constructor(private readonly repo: AnimeRepository) {}

  /**
   * Ensure a title is in the database, fetching it if it is not.
   *
   * This is the read-through half of "AniList is a cache": a request for an
   * uncached title pays one upstream call and leaves the row behind for every
   * request after it.
   */
  async ensureCached(anilistId: string): Promise<string> {
    const localId = await this.repo.getLocalIdByAnilistId(anilistId);
    if (localId) return localId;

    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);

    return this.repo.upsert(detail);
  }

  /** Detail for one title, backfilled on a cache miss. */
  async getByAnilistId(anilistId: string): Promise<Record<string, any>> {
    const cached = await this.repo.getByAnilistId(anilistId);
    if (cached) return cached;

    await this.ensureCached(anilistId);

    const fresh = await this.repo.getByAnilistId(anilistId);
    if (!fresh) throw AppError.notFound(`anime ${anilistId} not found`);

    return fresh;
  }

  /** Detail plus relations and episodes, always hitting AniList. */
  async getFull(anilistId: string): Promise<Record<string, any>> {
    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);

    const localId = await this.repo.upsert(detail);
    await this.repo.replaceRelations(localId, detail);

    return { ...detail, id: localId };
  }

/**
   * Discovery list: serve from cache, otherwise fetch and persist.
   *
   * The database write on a discovery miss is deliberate. A trending page is the
   * cheapest way to seed a catalogue, and those rows are needed anyway the
   * moment a user opens one of the titles.
   */
  async discovery(
    bucket: DiscoveryBucket,
    options: DiscoveryOptions = {},
  ): Promise<{ items: Record<string, any>[]; source: string }> {
    const ttl = DISCOVERY_TTL[bucket];
    const key = [
      "discovery",
      bucket,
      options.season ?? "all",
      options.seasonYear ?? "all",
      options.page ?? 1,
      options.perPage ?? 20,
    ].join(":");

    const { value, hit } = await cache.remember(key, ttl, async () => ({
      items: await this.#fetchDiscovery(bucket, options),
    }));

    return { items: value.items, source: hit ? "cache" : "provider" };
  }

  /** Map a discovery bucket onto an AniList sort, then persist the results. */
  async #fetchDiscovery(
    bucket: DiscoveryBucket,
    options: DiscoveryOptions,
  ): Promise<Record<string, any>[]> {
    const sortMap: Record<DiscoveryBucket, NonNullable<BrowseQuery["sort"]>> = {
      trending: "TRENDING",
      popular: "POPULARITY_DESC",
      seasonal: "POPULARITY_DESC",
      topRated: "SCORE_DESC",
      updated: "START_DATE_DESC",
    };

    const page = await this.#anilist.browse({
      sort: sortMap[bucket],
      page: options.page ?? 1,
      perPage: options.perPage ?? 20,
      season: options.season,
      seasonYear: options.seasonYear,
    });

    // Persist before returning. A write failure must not break the response:
    // the caller already holds usable data, and the next request will retry.
    await Promise.all(
      page.items.map((summary) =>
        this.repo.upsert(summary).catch(() => undefined),
      ),
    );

    return page.items as unknown as Record<string, any>[];
  }

  /**
   * Aggregate home-page payload.
   *
   * One request returns every section the home screen needs, so the frontend
   * does not fire five parallel discovery calls on page load.
   */
  async home(): Promise<Record<string, unknown>> {
    const [trending, popular, seasonal, topRated] = await Promise.all([
      this.discovery("trending", { perPage: 20 }),
      this.discovery("popular", { perPage: 20 }),
      this.discovery("seasonal", { perPage: 20 }),
      this.discovery("topRated", { perPage: 20 }),
    ]);

    return {
      trending: trending.items,
      popular: popular.items,
      seasonal: seasonal.items,
      topRated: topRated.items,
    };
  }

  /** All distinct genres in the catalogue, alphabetically. */
  async genres(): Promise<string[]> {
    const rows = await this.repo.listGenres();
    return rows;
  }

  /** Catalogue listing straight from the database. */
  async list(options: AnimeListOptions): Promise<{ items: DiscoveryCard[]; total: number }> {
    return this.repo.list(options);
  }

  /**
   * Title search, with a provider fallback when the database has no match.
   *
   * Both branches answer with canonical cards (P15). The endpoint used to return
   * raw catalogue rows from Postgres and raw provider objects from AniList, so
   * its response type depended on cache state and no single client schema could
   * describe it honestly. Cards make the contract the same either way.
   */
  async search(query: string, limit: number): Promise<DiscoveryCard[]> {
    const local = await this.repo.search(query, limit);
    if (local.length > 0) return local;

    const page = await this.#anilist.browse({ search: query, perPage: limit });

    // Persist before returning so the catalogue grows from search traffic. A
    // write failure must not fail the response: the caller already holds usable
    // data and the next request will retry.
    const localIds = await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => null)),
    );

    return page.items.map((summary, index) => toCard(summary, localIds[index] ?? null));
  }

  /** Episode catalog for a title, seeding it from AniList's count if empty. */
  async getEpisodes(anilistId: string): Promise<Record<string, any>[]> {
    const localId = await this.ensureCached(anilistId);
    const existing = await this.repo.listEpisodes(localId);
    if (existing.length > 0) return existing;

    const detail = await this.#anilist.getByAnilistId(anilistId);
    const seeded: ProviderEpisode[] = detail?.episodes ?? [];
    if (seeded.length === 0) return [];

    await this.repo.upsertEpisodes(localId, seeded);
    return this.repo.listEpisodes(localId);
  }

  /** Single episode by local id. */
  async getEpisode(episodeId: string): Promise<Record<string, any> | null> {
    return this.repo.getEpisode(episodeId);
  }
}
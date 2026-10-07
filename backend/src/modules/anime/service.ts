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
    try {
      const localId = await this.repo.getLocalIdByAnilistId(anilistId);
      if (localId) return localId;
    } catch {
      // DB offline
    }

    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);

    return this.repo.upsert(detail).catch(() => anilistId);
  }

  /** Detail for one title, backfilled on a cache miss. */
  async getByAnilistId(anilistId: string): Promise<Record<string, any>> {
    try {
      const cached = await this.repo.getByAnilistId(anilistId);
      if (cached) return cached;
    } catch {
      // DB offline
    }

    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found`);

    const localId = await this.repo.upsert(detail).catch(() => anilistId);
    return { ...detail, id: localId };
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
    try {
      const rows = await this.repo.listGenres();
      if (rows && rows.length > 0) return rows;
    } catch {
      // Database offline/unreachable fallback
    }
    return [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Ecchi",
      "Fantasy",
      "Horror",
      "Mahou Shoujo",
      "Mecha",
      "Music",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller",
    ];
  }

  /** Catalogue listing straight from the database, falling back to AniList browse on DB offline. */
  async list(options: AnimeListOptions): Promise<{ items: DiscoveryCard[]; total: number }> {
    try {
      return await this.repo.list(options);
    } catch {
      const page = await this.#anilist.browse({
        page: Math.floor(options.offset / options.limit) + 1,
        perPage: options.limit,
        season: options.season,
        seasonYear: options.seasonYear,
      });

      return {
        items: page.items.map((summary) => toCard(summary, null)),
        total: page.total ?? page.items.length,
      };
    }
  }

  /**
   * Title search, with a provider fallback when the database has no match or is down.
   */
  async search(query: string, limit: number): Promise<DiscoveryCard[]> {
    let local: DiscoveryCard[] = [];
    try {
      local = await this.repo.search(query, limit);
    } catch {
      local = [];
    }
    if (local.length > 0) return local;

    const page = await this.#anilist.browse({ search: query, perPage: limit });

    const localIds = await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => null)),
    );

    return page.items.map((summary, index) => toCard(summary, localIds[index] ?? null));
  }

  /** Episode catalog for a title, seeding it from AniList's count if empty or DB offline. */
  async getEpisodes(anilistId: string): Promise<Record<string, any>[]> {
    try {
      const localId = await this.ensureCached(anilistId).catch(() => null);
      if (localId) {
        const existing = await this.repo.listEpisodes(localId).catch(() => []);
        if (existing.length > 0) return existing;
      }
    } catch {
      // DB offline fallback
    }

    const detail = await this.#anilist.getByAnilistId(anilistId);
    const seeded: ProviderEpisode[] = detail?.episodes ?? [];
    return seeded.map((ep) => ({
      id: `ep-${anilistId}-${ep.episodeNumber}`,
      animeId: anilistId,
      episodeNumber: ep.episodeNumber,
      title: ep.title ?? `Episode ${ep.episodeNumber}`,
      thumbnailUrl: ep.thumbnailUrl ?? null,
      airDate: ep.airDate ? new Date(ep.airDate * 1000) : null,
      isFiller: ep.isFiller ?? false,
    }));
  }

  /** Single episode by local id. */
  async getEpisode(episodeId: string): Promise<Record<string, any> | null> {
    try {
      return await this.repo.getEpisode(episodeId);
    } catch {
      return null;
    }
  }
}
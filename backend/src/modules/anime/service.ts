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
import type { AnimeDetail, BrowseQuery, ProviderEpisode } from "../../providers/metadata/types.js";
import type { ProviderEpisodeInfo, ResolveRequest, StreamingProvider } from "../../providers/streaming/types.js";
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
  readonly #anilist: AnilistProvider;

  constructor(
    private readonly repo: AnimeRepository,
    private readonly providers: StreamingProvider[] = [],
    anilist?: AnilistProvider,
  ) {
    this.#anilist = anilist ?? new AnilistProvider();
  }

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

  /** Detail plus relations and episodes, cached with metadata TTL. */
  async getFull(anilistId: string): Promise<Record<string, any>> {
    const key = `anime:full:${anilistId}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      const detail = await this.#anilist.getByAnilistId(anilistId);
      if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);

      let localId: string = anilistId;
      try {
        localId = await this.repo.upsert(detail);
        await this.repo.replaceRelations(localId, detail);
      } catch {
        // Database offline/unreachable fallback
      }

      return { ...detail, id: localId };
    });

    return value;
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

  /**
   * Synchronize episode catalog for a title using the provider architecture.
   *
   * Fetches available episode records from metadata (AniList) and registered streaming providers.
   * Follows provider pagination, merges richer provider metadata without destroying stored fields,
   * ensures expected episode counts are met, persists the resulting catalogue idempotently,
   * and refreshes stale caches.
   */
  async syncEpisodes(anilistId: string): Promise<Record<string, any>[]> {
    const key = `anime:episodes:${anilistId}`;

    let localId: string | null = null;
    try {
      localId = await this.ensureCached(anilistId).catch(() => null);
    } catch {
      // DB offline
    }

    let existingRows: Record<string, any>[] = [];
    if (localId) {
      try {
        existingRows = await this.repo.listEpisodes(localId).catch(() => []);
      } catch {
        existingRows = [];
      }
    }

    let detail: AnimeDetail | null = null;
    try {
      detail = await this.#anilist.getByAnilistId(anilistId);
      if (detail && localId) {
        await this.repo.upsert(detail).catch(() => {});
      }
    } catch {
      // Upstream AniList transient error
    }

    const totalEpisodes = detail?.totalEpisodes ?? null;
    const nextAiring = detail?.nextAiringEpisode ?? null;
    const expectedCount =
      totalEpisodes && totalEpisodes > 0
        ? totalEpisodes
        : nextAiring && nextAiring.episode > 1
        ? nextAiring.episode - 1
        : null;

    // Build the merged episode map by episodeNumber
    const episodeMap = new Map<number, ProviderEpisode>();

    // 1. Seed from AniList placeholder episodes if available
    const seeded: ProviderEpisode[] = detail?.episodes ?? [];
    for (const ep of seeded) {
      episodeMap.set(ep.episodeNumber, {
        episodeNumber: ep.episodeNumber,
        absoluteNumber: ep.absoluteNumber,
        title: ep.title,
        description: ep.description,
        durationSeconds: ep.durationSeconds,
        thumbnailUrl: ep.thumbnailUrl,
        airDate: ep.airDate,
        isFiller: ep.isFiller ?? false,
      });
    }

    // 2. Query streaming providers for verified episode info and handle pagination
    const resolveReq: ResolveRequest = {
      animeId: localId ?? anilistId,
      anilistId,
      animeTitle: detail?.canonicalTitle,
      language: "sub",
      episodeNumber: 1,
    };

    for (const provider of this.providers) {
      const fetchFn =
        typeof provider.listEpisodes === "function"
          ? (provider.listEpisodes as any).bind(provider)
          : typeof (provider as any).getEpisodes === "function"
          ? ((provider as any).getEpisodes as any).bind(provider)
          : null;

      if (fetchFn) {
        try {
          const providerEpisodes = await this.#fetchEpisodesFromProvider(fetchFn, resolveReq);
          for (const ep of providerEpisodes) {
            const current = episodeMap.get(ep.episodeNumber);
            episodeMap.set(ep.episodeNumber, {
              episodeNumber: ep.episodeNumber,
              title: ep.title ?? current?.title,
              thumbnailUrl: ep.thumbnailUrl ?? current?.thumbnailUrl,
              description: ep.description ?? current?.description,
              durationSeconds: ep.durationSeconds ?? current?.durationSeconds,
              airDate: ep.airDate ?? current?.airDate,
              isFiller: ep.isFiller ?? current?.isFiller ?? false,
              externalId: ep.providerEpisodeId ?? current?.externalId,
            });
          }
        } catch {
          // One provider failure must not break synchronization
        }
      }
    }

    // 3. Ensure all numbers up to expectedCount exist
    if (expectedCount && expectedCount > 0) {
      const cap = Math.min(expectedCount, 3000);
      for (let num = 1; num <= cap; num++) {
        if (!episodeMap.has(num)) {
          episodeMap.set(num, {
            episodeNumber: num,
            title: `Episode ${num}`,
            isFiller: false,
          });
        }
      }
    }

    // 4. Merge existing database records, ensuring richer existing metadata is never destroyed
    for (const row of existingRows) {
      const num = row.episodeNumber;
      const incoming = episodeMap.get(num);
      if (!incoming) {
        // Keep stored episode that wasn't in provider list
        episodeMap.set(num, {
          episodeNumber: num,
          absoluteNumber: row.absoluteNumber ?? undefined,
          title: row.title ?? undefined,
          description: row.description ?? undefined,
          durationSeconds: row.durationSeconds ?? undefined,
          thumbnailUrl: row.thumbnailUrl ?? undefined,
          airDate: row.airDate ? Math.floor(new Date(row.airDate).getTime() / 1000) : undefined,
          isFiller: Boolean(row.isFiller),
        });
      } else {
        const isIncomingGenericTitle = !incoming.title || /^Episode \d+$/i.test(incoming.title.trim());
        const isStoredRichTitle = row.title && !/^Episode \d+$/i.test(row.title.trim());

        episodeMap.set(num, {
          episodeNumber: num,
          absoluteNumber: incoming.absoluteNumber ?? row.absoluteNumber ?? undefined,
          title: isStoredRichTitle && isIncomingGenericTitle ? row.title : (incoming.title ?? row.title ?? undefined),
          description: incoming.description ?? row.description ?? undefined,
          durationSeconds: incoming.durationSeconds ?? row.durationSeconds ?? undefined,
          thumbnailUrl: incoming.thumbnailUrl ?? row.thumbnailUrl ?? undefined,
          airDate: incoming.airDate ?? (row.airDate ? Math.floor(new Date(row.airDate).getTime() / 1000) : undefined),
          isFiller: incoming.isFiller ?? Boolean(row.isFiller),
          externalId: incoming.externalId,
        });
      }
    }

    const mergedEpisodes = Array.from(episodeMap.values()).sort(
      (a, b) => a.episodeNumber - b.episodeNumber,
    );

    // 5. Persist to repository if we have a local ID
    if (localId && mergedEpisodes.length > 0) {
      try {
        await this.repo.upsertEpisodes(localId, mergedEpisodes);
      } catch {
        // DB offline or transient write issue
      }
    }

    // 6. Invalidate caches
    await cache.delete(key).catch(() => {});
    await cache.delete(`anime:full:${anilistId}`).catch(() => {});

    // 7. If DB is online, return fresh rows from DB; otherwise return synthesized records
    if (localId) {
      try {
        const fresh = await this.repo.listEpisodes(localId);
        if (fresh.length > 0) return fresh;
      } catch {
        // DB offline fallback
      }
    }

    return mergedEpisodes.map((ep) => ({
      id: `ep-${anilistId}-${ep.episodeNumber}`,
      animeId: anilistId,
      episodeNumber: ep.episodeNumber,
      title: ep.title ?? `Episode ${ep.episodeNumber}`,
      thumbnailUrl: ep.thumbnailUrl ?? null,
      airDate: ep.airDate ? new Date(ep.airDate * 1000) : null,
      isFiller: ep.isFiller ?? false,
    }));
  }

  /** Retrieve paginated episodes from a provider supporting single-array or paged results. */
  async #fetchEpisodesFromProvider(
    fetchFn: (request: ResolveRequest, page?: number) => Promise<any>,
    request: ResolveRequest,
  ): Promise<ProviderEpisodeInfo[]> {
    const episodes: ProviderEpisodeInfo[] = [];
    const seenNumbers = new Set<number>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const pageRequest = { ...request, page };
      let result: any = null;
      try {
        result = await fetchFn(pageRequest, page);
      } catch {
        break;
      }

      if (!result) break;

      let items: any[] = [];
      if (Array.isArray(result)) {
        items = result;
        hasMore = false;
      } else if (typeof result === "object") {
        const rawItems = result.items ?? result.episodes ?? [];
        if (Array.isArray(rawItems)) items = rawItems;
        hasMore = Boolean(
          result.hasNextPage ||
          (result.totalPages && page < result.totalPages) ||
          (result.total && items.length > 0 && episodes.length + items.length < result.total)
        );
      }

      if (items.length === 0) break;

      for (const item of items) {
        const epNum = item?.episodeNumber ?? item?.number;
        if (item && Number.isFinite(epNum) && !seenNumbers.has(epNum)) {
          seenNumbers.add(epNum);
          episodes.push({
            providerEpisodeId: item.providerEpisodeId ?? item.id ?? String(epNum),
            episodeNumber: epNum,
            title: item.title ?? null,
            thumbnailUrl: item.thumbnailUrl ?? item.image ?? null,
            isFiller: Boolean(item.isFiller),
          });
        }
      }

      page++;
    }

    return episodes;
  }

  /** Episode catalog for a title, synchronizing from providers and database. */
  async getEpisodes(anilistId: string): Promise<Record<string, any>[]> {
    return this.syncEpisodes(anilistId);
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
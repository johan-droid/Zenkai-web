/**
 * Anime discovery (P2).
 *
 * Discovery is deliberately split in two, because the two halves have very
 * different freshness and failure characteristics and conflating them is how a
 * home page ends up lying:
 *
 *   Provider-derived  trending / popular / seasonal / top
 *     These are *rankings*, and a ranking is a claim about the whole catalogue.
 *     Postgres only holds the titles this service has happened to cache, so it
 *     cannot compute "what is trending". They come from AniList, are cached,
 *     and fall back to the cached copy when the provider is unreachable.
 *
 *   Canonical         recent / recently-updated / genres / genre filter
 *     These are facts about what this service holds, so they are answered from
 *     Postgres and never touch the provider. They stay correct when AniList is
 *     down, which is the entire point of having a canonical domain.
 *
 * No provider concept reaches the HTTP layer: routes call this service, the
 * service calls an `AnimeMetadataProvider`, and what comes back is the P1
 * canonical summary rendered into a card.
 */

import { cache } from "../../cache/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import type { AnimeMetadataProvider, AnimeSummary } from "../../providers/metadata/types.js";
import type { AnimeRepository } from "./repository.js";

/** Where a section's data actually came from. Never a provider name. */
export type DiscoverySource = "provider" | "cache" | "database";

/**
 * A discovery row: the smallest shape that renders a card.
 *
 * Deliberately not the full anime detail. A home page asks for five sections at
 * twenty rows each, and shipping relations, external ids and studio credits for
 * every card is payload nobody reads.
 */
export interface DiscoveryCard {
  /** Zenkai's own id when the title is in the catalogue; null until it is. */
  id: string | null;
  anilistId: string;
  title: string;
  titles: AnimeSummary["titles"];
  coverUrl: string | null;
  coverImageLarge: string | null;
  bannerUrl: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  year: number | null;
  averageScore: number | null;
  totalEpisodes: number | null;
  popularity: number | null;
  genres: string[];
  isAdult: boolean;
}

/** The public discovery contract. Provider pagination is normalised into this. */
export interface DiscoveryResult {
  items: DiscoveryCard[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
  /** Best effort. AniList caps this, so it is not relied upon for paging. */
  total: number | null;
  source: DiscoverySource;
}

export type DiscoveryBucket = "trending" | "popular" | "seasonal" | "topRated";

/** Bounds applied before anything reaches the provider or the database. */
export const MAX_PER_PAGE = 50;
export const DEFAULT_PER_PAGE = 20;

/**
 * Cache lifetimes, in seconds.
 *
 * Trending moves hourly, so it is the shortest. Seasonal and top are effectively
 * fixed for a season, so they can be held far longer. AniList is a rate limited
 * public service, so every one of these also protects the upstream budget rather
 * than only saving latency.
 */
const TTL: Record<DiscoveryBucket, number> = {
  trending: config.CACHE_TTL_DISCOVERY_S,
  popular: config.CACHE_TTL_DISCOVERY_S,
  seasonal: config.CACHE_TTL_DISCOVERY_S * 4,
  topRated: config.CACHE_TTL_DISCOVERY_S * 4,
};

/** Canonical sections are a cheap indexed query, so they are cached only briefly. */
const CANONICAL_TTL_S = 300;

/** The four seasons and the months that belong to each. */
const SEASON_BY_MONTH: Array<{ season: string; months: number[] }> = [
  { season: "WINTER", months: [12, 1, 2] },
  { season: "SPRING", months: [3, 4, 5] },
  { season: "SUMMER", months: [6, 7, 8] },
  { season: "FALL", months: [9, 10, 11] },
];

export interface SeasonWindow {
  season: string;
  year: number;
}

/**
 * The season a viewer is currently living in.
 *
 * Derived from the clock rather than hard-coded, so the endpoint keeps meaning
 * "this season" as time passes instead of silently reporting a stale window. The
 * clock is injected by callers so the rule is testable without a fake timer.
 *
 * Winter straddles the new year (December belongs to the winter that ends in
 * January), so December is reported as the *upcoming* year rather than the
 * current one.
 */
export function currentSeason(now: Date = new Date()): SeasonWindow {
  const month = now.getUTCMonth() + 1;
  const match = SEASON_BY_MONTH.find((entry) => entry.months.includes(month))!;
  const year = month === 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return { season: match.season, year };
}

/** Clamp page/perPage so an absurd request cannot become a giant upstream query. */
export function normalisePaging(
  page?: number,
  perPage?: number,
): { page: number; perPage: number } {
  const safePage =
    Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1;
  const requested = Number.isFinite(perPage) ? Math.floor(perPage as number) : DEFAULT_PER_PAGE;
  const safePerPage = Math.min(Math.max(requested, 1), MAX_PER_PAGE);
  return { page: safePage, perPage: safePerPage };
}

/**
 * Remove repeats of the same canonical title.
 *
 * Identity is the provider id, not the display title: two genuinely different
 * anime can share a title and collapsing them would hide a real result. AniList
 * does not normally repeat a title within one page, but a later multi-provider
 * merge will, so this is enforced at the seam rather than assumed.
 */
export function dedupeByIdentity(items: DiscoveryCard[]): DiscoveryCard[] {
  const seen = new Set<string>();
  const out: DiscoveryCard[] = [];

  for (const item of items) {
    if (seen.has(item.anilistId)) continue;
    seen.add(item.anilistId);
    out.push(item);
  }

  return out;
}

/** Render a provider summary as a card. The only place this mapping happens. */
export function toCard(summary: AnimeSummary, localId: string | null = null): DiscoveryCard {
  return {
    id: localId,
    anilistId: summary.anilistId,
    title: summary.canonicalTitle,
    titles: summary.titles,
    coverUrl: summary.coverUrl ?? null,
    coverImageLarge: summary.coverImageLarge ?? null,
    bannerUrl: summary.bannerUrl ?? null,
    format: summary.format ?? null,
    status: summary.status ?? null,
    season: summary.season ?? null,
    seasonYear: summary.seasonYear ?? null,
    year: summary.year ?? null,
    // No score from the provider means "unrated", which is not a score of zero.
    // Null keeps the two apart for the client.
    averageScore: summary.averageScore ?? null,
    totalEpisodes: summary.totalEpisodes ?? null,
    popularity: summary.popularity ?? null,
    genres: summary.genres ?? [],
    isAdult: summary.isAdult,
  };
}

/**
 * The subset of the schedule the home page needs.
 *
 * Declared here rather than imported from the schedule module so discovery does
 * not depend on it. The two features are peers that meet at the composition
 * root, which is what keeps "home" from becoming the place where every domain
 * has to be wired.
 */
export interface UpcomingSource {
  upcoming(options: { limit: number }): Promise<UpcomingItem[]>;
}

export interface UpcomingItem {
  anilistId: number | null;
  title: string;
  coverUrl: string | null;
  episodeNumber: number;
  airingAt: string | Date;
}

export class DiscoveryService {
  constructor(
    private readonly repo: AnimeRepository,
    private readonly provider: AnimeMetadataProvider,
    /** Injected so the default-season rule is testable without a fake timer. */
    private readonly now: () => Date = () => new Date(),
    /** Optional: home degrades that shelf when the schedule is not wired. */
    private readonly upcomingSource?: UpcomingSource,
  ) {}

  /**
   * Provider-derived ranking.
   *
   * `seasonal` without an explicit window resolves to the season the server is
   * currently in. Without that default, "seasonal" and "popular" become the same
   * query with no season filter applied, which is exactly the bug it prevents.
   */
  async ranking(
    bucket: DiscoveryBucket,
    options: {
      page?: number;
      perPage?: number;
      season?: string;
      year?: number;
      genre?: string;
      format?: string;
      status?: string;
    } = {},
  ): Promise<DiscoveryResult> {
    const { page, perPage } = normalisePaging(options.page, options.perPage);
    const window = this.#seasonWindow(bucket, options.season, options.year);

    // Deterministic key: the same request always produces the same key. Built
    // only from values already validated and clamped above, so no raw user input
    // ever reaches a cache key.
    const key = [
      // v3: the filters below joined the key. Two browse pages differing only by
      // genre used to collide on one cache entry and serve each other's shelf.
      "discovery:v3",
      bucket,
      window ? `${window.year}-${window.season}` : "all",
      options.genre ?? "-",
      options.format ?? "-",
      options.status ?? "-",
      `p${page}`,
      `n${perPage}`,
    ].join(":");

    const { value, hit } = await cache.remember<DiscoveryResult>(key, TTL[bucket], () =>
      this.#fetchRanking(bucket, page, perPage, window, options),
    );

    return { ...value, source: hit ? "cache" : value.source };
  }

  #seasonWindow(bucket: DiscoveryBucket, season?: string, year?: number): SeasonWindow | null {
    if (bucket !== "seasonal") return null;
    if (season && year) return { season, year };
    const current = currentSeason(this.now());
    return { season: season ?? current.season, year: year ?? current.year };
  }

  async #fetchRanking(
    bucket: DiscoveryBucket,
    page: number,
    perPage: number,
    window: SeasonWindow | null,
    options: { genre?: string; format?: string; status?: string } = {},
  ): Promise<DiscoveryResult> {
    const sortMap = {
      trending: "TRENDING",
      popular: "POPULARITY_DESC",
      seasonal: "POPULARITY_DESC",
      topRated: "SCORE_DESC",
    } as const;

    const result = await this.provider.browse({
      sort: sortMap[bucket],
      page,
      perPage,
      season: window?.season,
      seasonYear: window?.year,
      // Trending is an upstream signal, so browse has to keep it on this route
      // rather than downgrading it to a popularity sort. That means the filters
      // a browse page offers have to work here too, or selecting Trending would
      // silently drop the user's genre/format/status choice (P17).
      genre: options.genre,
      format: options.format,
      status: options.status,
    });

    // Persist before returning so the catalogue grows from discovery traffic. A
    // write failure must not fail the response: the caller already holds usable
    // data and the next request will retry.
    const localIds = await Promise.all(
      result.items.map((summary) => this.repo.upsert(summary).catch(() => null)),
    );

    return {
      items: dedupeByIdentity(
        result.items.map((summary, index) => toCard(summary, localIds[index] ?? null)),
      ),
      page: result.page,
      perPage: result.perPage,
      hasNextPage: result.hasNextPage,
      total: result.total ?? null,
      source: "provider",
    };
  }

  /**
   * Recently added to the catalogue, newest first.
   *
   * Ordered by `created_at`: when *this service* first learned about the title.
   * That is a canonical fact and keeps working when AniList is unreachable.
   */
  async recent(options: { page?: number; perPage?: number } = {}): Promise<DiscoveryResult> {
    return this.#canonical("recent", options, (limit, offset) =>
      this.repo.listCards({ limit, offset, order: "recent" }),
    );
  }

  /**
   * Titles whose *upstream metadata* changed most recently.
   *
   * Ordered by `source_updated_at`, which is AniList's own `updatedAt`. This is
   * deliberately not `updated_at`: that column records when we last synchronised,
   * so ranking by it would return whatever title a background job happened to
   * touch, which is not the question a reader is asking. A null marker (never
   * reported upstream) sorts last rather than being treated as epoch zero.
   */
  async recentlyUpdated(
    options: { page?: number; perPage?: number } = {},
  ): Promise<DiscoveryResult> {
    return this.#canonical("recently-updated", options, (limit, offset) =>
      this.repo.listCards({ limit, offset, order: "updated" }),
    );
  }

  async #canonical(
    key: string,
    options: { page?: number; perPage?: number },
    load: (limit: number, offset: number) => Promise<{ items: DiscoveryCard[]; total: number }>,
  ): Promise<DiscoveryResult> {
    const { page, perPage } = normalisePaging(options.page, options.perPage);
    const cacheKey = `discovery:v2:${key}:p${page}:n${perPage}`;

    const { value, hit } = await cache.remember<DiscoveryResult>(
      cacheKey,
      CANONICAL_TTL_S,
      async () => {
        const { items, total } = await load(perPage, (page - 1) * perPage);
        return {
          items,
          page,
          perPage,
          hasNextPage: (page - 1) * perPage + perPage < total,
          total,
          source: "database" as const,
        };
      },
    );

    return { ...value, source: hit ? "cache" : value.source };
  }

  /**
   * Distinct genres in the catalogue.
   *
   * Served from Postgres, never from the provider. P1 collapses case variants
   * within a single provider payload; this collapses them across the whole
   * catalogue for the same reason, so "Action", "action" and "ACTION" cannot
   * appear as three separate genres in a filter list.
   */
  async genres(): Promise<string[]> {
    return this.repo.listGenres();
  }

  /**
   * Home aggregation.
   *
   * Sections run concurrently and degrade independently. One provider timeout
   * must not turn the whole home page into a 500, and must not be disguised as an
   * empty shelf either: a failed section reports `unavailable` with its reason,
   * which a client can render differently from "no results right now".
   */
  async home(perPage = 10): Promise<HomePayload> {
    const size = normalisePaging(1, perPage).perPage;

    const section = async (load: () => Promise<DiscoveryResult>): Promise<HomeSection> => {
      try {
        const result = await load();
        return { status: "ok", items: result.items };
      } catch (error) {
        const reason = error instanceof AppError ? error.reason : "upstream_error";
        return { status: "unavailable", items: [], reason };
      }
    };

    // Upcoming is a different shape to a discovery card, so it gets its own
    // section type rather than being forced through DiscoveryCard.
    const upcoming = async (): Promise<HomeSection> => {
      if (!this.upcomingSource) {
        return { status: "unavailable", items: [], reason: "not_configured" };
      }
      try {
        const rows = await this.upcomingSource.upcoming({ limit: size });
        return {
          status: "ok",
          items: rows.map((row) => ({
            id: null,
            anilistId: row.anilistId != null ? String(row.anilistId) : "",
            title: row.title,
            titles: { romaji: null, english: null, native: null, synonyms: [] },
            coverUrl: row.coverUrl,
            coverImageLarge: null,
            bannerUrl: null,
            format: null,
            status: null,
            season: null,
            seasonYear: null,
            year: null,
            averageScore: null,
            totalEpisodes: null,
            popularity: null,
            genres: [],
            isAdult: false,
            // Carried through so a client can show "in 3 days" without a
            // second request, and so the shelf is not ambiguous about which
            // episode it is listing.
            episodeNumber: row.episodeNumber,
            airingAt: new Date(row.airingAt).toISOString(),
          })) as unknown as DiscoveryCard[],
        };
      } catch (error) {
        const reason = error instanceof AppError ? error.reason : "internal";
        return { status: "unavailable", items: [], reason };
      }
    };

    const [trending, popular, seasonal, recent, topRated, upcomingShelf] = await Promise.all([
      section(() => this.ranking("trending", { perPage: size })),
      section(() => this.ranking("popular", { perPage: size })),
      section(() => this.ranking("seasonal", { perPage: size })),
      section(() => this.recent({ perPage: size })),
      section(() => this.ranking("topRated", { perPage: size })),
      upcoming(),
    ]);

    return {
      trending,
      popular,
      seasonal,
      recent,
      topRated,
      upcoming: upcomingShelf,
    };
  }
}

/** One section of the home payload, carrying its own availability. */
export interface HomeSection {
  status: "ok" | "unavailable";
  items: DiscoveryCard[];
  /** Why the section is unavailable. Absent when status is "ok". */
  reason?: string;
}

export interface HomePayload {
  trending: HomeSection;
  popular: HomeSection;
  seasonal: HomeSection;
  recent: HomeSection;
  topRated: HomeSection;
  upcoming: HomeSection;
}

/**
 * The Zenkai API client (P12).
 *
 * This is the frontend's single boundary to the canonical backend. Home and
 * discovery read every card from here; nothing in the migrated path talks to a
 * metadata provider directly. It is not a provider abstraction: the backend
 * already owns provider selection, caching and ranking, so this module only
 * knows the public contract (P2) — endpoints, response shapes and section
 * availability — and maps it onto the provider-neutral UI model.
 *
 * Response validation is deliberate. A response that does not match the
 * contract is rejected rather than rendered with fabricated defaults: an
 * unvalidated payload is how a provider outage turns into a plausible-looking
 * page of invented anime.
 */

import { z } from "zod";

import { fetchJson, HttpError } from "./http";
import type { DetailData, MediaFormat, MediaKind, MediaSeason, MediaStatus, MediaSummary } from "@/lib/media";

/** Backend origin. Overridable at build time; defaults to local development. */
export const ZENKAI_API_URL =
  process.env.NEXT_PUBLIC_ZENKAI_API_URL ?? "http://localhost:4000";

/** Thrown when a response fails contract validation. Never rendered as data. */
export class ZenkaiContractError extends Error {
  readonly url: string;
  readonly issues: string[];

  constructor(url: string, issues: string[]) {
    super(`Response from ${url} does not match the Zenkai API contract: ${issues.join("; ")}`);
    this.name = "ZenkaiContractError";
    this.url = url;
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ */
/* P2 discovery contract (mirrors backend/src/modules/anime/discovery) */
/* ------------------------------------------------------------------ */

const titlesSchema = z.object({
  romaji: z.string().nullable(),
  english: z.string().nullable(),
  native: z.string().nullable(),
  synonyms: z.array(z.string()),
});

/**
 * One discovery card: the smallest shape that renders a card. Upcoming items
 * carry two extra fields so a client can show "in 3 days" without a second
 * request; they are optional because other sections omit them.
 */
export const discoveryCardSchema = z.object({
  /** Zenkai's own id once the title is catalogued; null until then. */
  id: z.string().nullable(),
  /** Canonical cross-reference id from the backend contract. */
  anilistId: z.string(),
  title: z.string(),
  titles: titlesSchema,
  coverUrl: z.string().nullable(),
  coverImageLarge: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  format: z.string().nullable(),
  status: z.string().nullable(),
  season: z.string().nullable(),
  seasonYear: z.number().nullable(),
  year: z.number().nullable(),
  /** Null means unrated — never a score of zero. */
  averageScore: z.number().nullable(),
  totalEpisodes: z.number().nullable(),
  popularity: z.number().nullable(),
  genres: z.array(z.string()),
  isAdult: z.boolean(),
  // Upcoming-only fields (see the backend's home aggregation).
  episodeNumber: z.number().optional(),
  airingAt: z.string().optional(),
});

export const discoveryResultSchema = z.object({
  items: z.array(discoveryCardSchema),
  page: z.number(),
  perPage: z.number(),
  hasNextPage: z.boolean(),
  total: z.number().nullable(),
  source: z.enum(["provider", "cache", "database"]),
});

export type DiscoveryCard = z.infer<typeof discoveryCardSchema>;
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

/** `GET /api/v1/anime/search` response body (P15). */
export interface AnimeSearchResult {
  query: string;
  limit: number;
  items: DiscoveryCard[];
}

/**
 * One home section carries its own availability. The backend refuses to
 * disguise a provider outage as an empty shelf, and so does this client: an
 * `unavailable` section keeps its reason so the UI can render it differently
 * from "no content right now".
 */
export const homeSectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), items: z.array(discoveryCardSchema) }),
  z.object({
    status: z.literal("unavailable"),
    items: z.array(discoveryCardSchema),
    reason: z.string().optional(),
  }),
]);

export const homePayloadSchema = z.object({
  trending: homeSectionSchema,
  popular: homeSectionSchema,
  seasonal: homeSectionSchema,
  recent: homeSectionSchema,
  topRated: homeSectionSchema,
  upcoming: homeSectionSchema,
});

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomePayload = z.infer<typeof homePayloadSchema>;

const mangaCatalogueSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      mangadexId: z.string().nullable(),
      canonicalTitle: z.string(),
      coverUrl: z.string().nullable(),
      coverImageLarge: z.string().nullable(),
      bannerUrl: z.string().nullable(),
      description: z.string().nullable().optional(),
      status: z.string(),
      year: z.number().nullable(),
      totalChapters: z.number().nullable(),
      totalVolumes: z.number().nullable(),
    }),
  ),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type MangaCatalogueItem = z.infer<
  (typeof mangaCatalogueSchema)["shape"]["items"]
>[number];
export type MangaCatalogueResult = z.infer<typeof mangaCatalogueSchema>;

/* ------------------------------------------------------------------ */
/* P13 anime detail contract (mirrors GET /api/v1/anime/:id)           */
/* ------------------------------------------------------------------ */

/**
 * A relation as the backend's `getFull` returns it: a cross-reference id plus
 * display data. `anilistId` arrives as a number from the provider normaliser,
 * but the routing contract treats ids as strings, so both are accepted rather
 * than rejecting a valid payload over a JSON numeric/string difference.
 */
const animeRelationSchema = z.object({
  type: z.string(),
  anilistId: z.union([z.string(), z.number()]),
  title: z.string().nullish(),
  coverUrl: z.string().nullish(),
});

/**
 * The canonical anime detail payload.
 *
 * Only fields the detail surface consumes are declared; every backend key not
 * listed here is stripped by Zod rather than passed through, so the UI can
 * never grow an undeclared dependency on an incidental field. Fields the
 * provider may legitimately omit are `nullish()`, because a missing key and an
 * explicit null both mean "the provider did not say" — rejecting the former
 * would fail every partial payload the backend considers valid.
 */
export const animeDetailSchema = z.object({
  /** Cross-reference id: the routing id detail/watch URLs address by. */
  anilistId: z.string(),
  titles: z.object({
    romaji: z.string().nullish(),
    english: z.string().nullish(),
    native: z.string().nullish(),
    synonyms: z.array(z.string()),
  }),
  canonicalTitle: z.string(),
  description: z.string().nullish(),
  coverUrl: z.string().nullish(),
  coverImageLarge: z.string().nullish(),
  bannerUrl: z.string().nullish(),
  format: z.string().nullish(),
  status: z.string().nullish(),
  year: z.number().nullish(),
  season: z.string().nullish(),
  seasonYear: z.number().nullish(),
  averageScore: z.number().nullish(),
  popularity: z.number().nullish(),
  totalEpisodes: z.number().nullish(),
  durationMinutes: z.number().nullish(),
  genres: z.array(z.string()).nullish(),
  relations: z.array(animeRelationSchema),
  nextAiringEpisode: z
    .object({
      episode: z.number(),
      airingAt: z.number(),
      timeUntilAiring: z.number(),
    })
    .nullish(),
});

export type AnimeDetail = z.infer<typeof animeDetailSchema>;

/**
 * One episode row of the canonical catalogue (P4). `airingState` is an
 * enum rather than a free string: `aired`, `upcoming` and `unknown` are the
 * only states the backend can assert, and `unknown` must stay distinct from
 * `upcoming` because "no schedule" is not "scheduled for later".
 */
export const episodeCardSchema = z.object({
  id: z.string(),
  episodeNumber: z.number(),
  absoluteNumber: z.number().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  durationSeconds: z.number().nullish(),
  thumbnailUrl: z.string().nullish(),
  isFiller: z.boolean(),
  airingAt: z.string().nullish(),
  airingState: z.enum(["aired", "upcoming", "unknown"]),
  airingSource: z.string().nullish(),
  providerStatus: z.string().nullish(),
});

/**
 * The canonical episode catalogue (GET /api/v1/anime/:id/episodes).
 *
 * Three counts stay separate on purpose, exactly as the backend defines them:
 * `catalogueCount` (rows we hold), `airedCount` (rows past their slot) and
 * `knownTotal` (the provider's stated total, null when not established).
 */
export const episodeCatalogueSchema = z.object({
  anilistId: z.string(),
  episodes: z.array(episodeCardSchema),
  catalogueCount: z.number(),
  airedCount: z.number(),
  knownTotal: z.number().nullish(),
});

export type EpisodeCatalogue = z.infer<typeof episodeCatalogueSchema>;
export type EpisodeCard = z.infer<typeof episodeCardSchema>;

/** Deterministic previous/next navigation; null means no such neighbour. */
export const episodeNavigationSchema = z.object({
  previous: z.number().nullable(),
  next: z.number().nullable(),
});

export type EpisodeNavigation = z.infer<typeof episodeNavigationSchema>;

/* ------------------------------------------------------------------ */
/* P14 playback contract (mirrors backend/src/modules/playback)        */
/* ------------------------------------------------------------------ */

/**
 * The canonical audio shelves. These are the only language values the client
 * may send; provider-specific labels (ENG, SUBTITLE, ...) are backend
 * vocabulary and never reach the wire from here.
 */
export const playbackLanguageSchema = z.enum(["sub", "dub", "multi"]);
export type PlaybackLanguage = z.infer<typeof playbackLanguageSchema>;

const playbackAccessSchema = z.enum(["hls", "mp4", "direct", "embed"]);
const playbackMechanismSchema = z.enum(["hls", "progressive", "iframe"]);
const playbackDeliverySchema = z.enum(["client", "proxied"]);

const subtitleTrackSchema = z.object({
  language: z.string(),
  url: z.string(),
  kind: z.string().optional(),
});

/** A validated, ranked canonical source (P7), as the client may see it. */
const playbackSourceSchema = z.object({
  id: z.string(),
  providerSlug: z.string(),
  providerName: z.string(),
  endpointSlug: z.string(),
  accessType: playbackAccessSchema,
  playbackUrl: z.string(),
  quality: z.string().optional(),
  resolution: z.number().optional(),
  language: playbackLanguageSchema,
  subtitles: z.array(subtitleTrackSchema).optional(),
  referer: z.string().optional(),
  priority: z.number(),
  validated: z.boolean().optional(),
  rank: z.number(),
});

/**
 * The canonical "how to play it" for one source (P8 plan).
 *
 * `plans[i]` describes `sources[i]` in the backend's ranked order, so list order
 * *is* the ranking: the client plays `plans[0]` and falls back down the list.
 * It never re-ranks, and it never reads a source's `playbackUrl` — only an
 * execution returned by `POST /playback/execute` is a playback authority.
 */
const playbackPlanSchema = z.object({
  sourceId: z.string(),
  providerSlug: z.string(),
  providerName: z.string(),
  endpointSlug: z.string(),
  access: playbackAccessSchema,
  mechanism: playbackMechanismSchema,
  mediaType: z.string().nullable(),
  url: z.string(),
  delivery: playbackDeliverySchema,
  proxyUrl: z.string().optional(),
  language: playbackLanguageSchema,
  quality: z.string().optional(),
  resolution: z.number().optional(),
  validated: z.boolean(),
  playable: z.boolean(),
  capabilities: z.object({
    seekable: z.boolean().nullable(),
    ranged: z.boolean().nullable(),
  }),
  subtitles: z.array(subtitleTrackSchema).optional(),
});

const providerAttemptSchema = z.object({
  providerSlug: z.string(),
  outcome: z.enum(["ok", "empty", "error", "timeout", "quarantined"]),
  count: z.number().int(),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});

const skippedProviderSchema = z.object({
  providerSlug: z.string(),
  reason: z.string(),
  detail: z.string().optional(),
});

/**
 * `GET /api/v1/episodes/:episodeId/sources` response body (P7).
 *
 * An empty shelf is a 200 with `emptyReason` when providers genuinely have
 * nothing; a 503 `no_sources` (all providers failed) is thrown by the fetcher as
 * an `HttpError(503)` so the UI can tell "no streams" from "try again shortly".
 */
export const playbackSourcesResponseSchema = z.object({
  episode: z.object({
    id: z.string(),
    episodeNumber: z.number().int(),
    title: z.string().nullish(),
    durationSeconds: z.number().nullish(),
    thumbnailUrl: z.string().nullish(),
    isFiller: z.boolean().nullish(),
  }),
  sources: z.array(playbackSourceSchema),
  sourceCount: z.number().int().nonnegative(),
  plans: z.array(playbackPlanSchema),
  planCount: z.number().int().nonnegative(),
  attempts: z.array(providerAttemptSchema),
  skipped: z.array(skippedProviderSchema),
  emptyReason: z.enum(["no_streams", "all_failed", "quarantined"]).optional(),
  resolutionTimeMs: z.number().nonnegative(),
});

export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
export type PlaybackPlan = z.infer<typeof playbackPlanSchema>;
export type PlaybackSourcesResponse = z.infer<typeof playbackSourcesResponseSchema>;

/**
 * What a client is allowed to play (P8 execution).
 *
 * Two deliberately disjoint kinds: `media` opens a `<video>` element (hls or
 * progressive), `embed` frames an `<iframe>`. The kind comes from the plan's
 * mechanism — never from the URL — so an embed can never widen into media.
 */
export const playbackExecutionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("media"),
    mechanism: z.enum(["hls", "progressive"]),
    url: z.string(),
    mediaType: z.string().nullable(),
    delivery: playbackDeliverySchema,
    proxyUrl: z.string().optional(),
    sourceId: z.string(),
    providerSlug: z.string(),
    providerName: z.string(),
    language: playbackLanguageSchema,
    quality: z.string().optional(),
    resolution: z.number().optional(),
    validated: z.boolean(),
    playable: z.boolean(),
    capabilities: z.object({
      seekable: z.boolean().nullable(),
      ranged: z.boolean().nullable(),
    }),
    subtitles: z.array(subtitleTrackSchema).optional(),
  }),
  z.object({
    kind: z.literal("embed"),
    mechanism: z.literal("iframe"),
    url: z.string(),
    mediaType: z.string().nullable(),
    sourceId: z.string(),
    providerSlug: z.string(),
    providerName: z.string(),
    language: playbackLanguageSchema,
    validated: z.boolean(),
    playable: z.boolean(),
    subtitles: z.array(subtitleTrackSchema).optional(),
  }),
]);

export type PlaybackExecution = z.infer<typeof playbackExecutionSchema>;

/** Skip markers and subtitles from the canonical metadata service (P10). */
export const episodeMetadataSchema = z.object({
  episodeId: z.string(),
  subtitles: z.array(subtitleTrackSchema),
  intro: z.object({ start: z.number(), end: z.number() }).optional(),
  outro: z.object({ start: z.number(), end: z.number() }).optional(),
  sourceUpdatedAt: z.number().int().nullable(),
});

export type EpisodeMetadata = z.infer<typeof episodeMetadataSchema>;

/** One server option in the switcher: canonical identity plus display facts. */
export interface ServerOption {
  sourceId: string;
  label: string;
  quality: string | null;
  resolution: number | null;
  language: PlaybackLanguage;
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a response against a schema or reject it.
 *
 * Fetch-level retries stay off: the browser's query layer owns retry policy,
 * and two retry layers on the same request multiply load during an outage.
 */
async function getValidated<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  params?: Record<string, string | number | undefined>,
): Promise<z.infer<T>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const url = `${ZENKAI_API_URL}${path}${suffix}`;

  const raw = await fetchJson<unknown>(url, { retries: 0 });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ZenkaiContractError(
      url,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return parsed.data;
}

/**
 * The composed home payload.
 *
 * One request rather than five: the backend aggregates the shelves
 * server-side, and each section degrades independently, so one failing
 * provider must not turn the whole home page into an error.
 */
export function fetchHome(perPage = 10): Promise<HomePayload> {
  return getValidated("/api/v1/home", homePayloadSchema, { perPage });
}

/** Genres present in the catalogue, from the backend's database. */
export async function fetchGenres(): Promise<string[]> {
  const payload = await getValidated(
    "/api/v1/genres",
    z.object({ items: z.array(z.string()) }),
  );
  return payload.items;
}

/** Manga catalogue listing, ordered by popularity, from the backend. */
export function fetchMangaCatalogue(limit = 14): Promise<MangaCatalogueResult> {
  return getValidated("/api/v1/manga", mangaCatalogueSchema, { limit });
}

/** A single discovery bucket (trending / popular / seasonal / topRated). */
export function fetchDiscovery(
  bucket: "trending" | "popular" | "seasonal" | "topRated",
  options: { page?: number; perPage?: number } = {},
): Promise<DiscoveryResult> {
  return getValidated(`/api/v1/anime/${bucket}`, discoveryResultSchema, {
    page: options.page,
    perPage: options.perPage,
  });
}

/**
 * Canonical title search (P15).
 *
 * One boundary for the whole app: the search page and the ⌘K palette both come
 * through here, so there is exactly one frontend search implementation and one
 * place where a provider call could be reintroduced.
 *
 * Results are the same discovery cards home renders, validated by the same
 * schema. Search is not a second media model — a title that appears in a shelf
 * and a title that appears in search results are the same record.
 *
 * Failures stay typed: a 400 is a bad request, a network failure is a transport
 * error and a malformed payload is a contract violation. None of them is an
 * empty result set, which is a 200 with `items: []`.
 */
export function fetchAnimeSearch(
  query: string,
  limit = 30,
): Promise<AnimeSearchResult> {
  return getValidated(
    "/api/v1/anime/search",
    z.object({
      query: z.string(),
      limit: z.number().int(),
      items: z.array(discoveryCardSchema),
    }),
    { q: query, limit },
  );
}

/* ------------------------------------------------------------------ */
/* P17 manga detail contract (mirrors GET /api/v1/manga/by-anilist/:id) */
/* ------------------------------------------------------------------ */

/**
 * The canonical manga detail payload.
 *
 * Addresses manga by the same AniList id the reader and detail URLs already
 * use; the backend bridges that id to the MangaDex catalogue internally.
 * Fields the provider may legitimately omit are `nullish()` for the same
 * reason the anime detail schema uses it: a missing key and an explicit null
 * both mean "the provider did not say".
 */
export const mangaDetailSchema = z.object({
  /** Local canonical id; the reader holds chapter ids derived from this. */
  id: z.string(),
  /** The MangaDex uuid, when the title has one; null until then. */
  mangadexId: z.string().nullable(),
  /** Cross-reference ids from the provider that owned the title. */
  externalIds: z.record(z.string(), z.string().nullable()).optional(),
  titles: z.object({
    primary: z.string(),
    alternates: z.array(z.string()),
  }),
  canonicalTitle: z.string(),
  description: z.string().nullish(),
  coverUrl: z.string().nullish(),
  coverImageLarge: z.string().nullish(),
  bannerUrl: z.string().nullish(),
  status: z.string().nullish(),
  contentRating: z.string().nullish(),
  year: z.number().nullish(),
  genres: z.array(
    z.object({
      name: z.string(),
      group: z.string().nullable(),
    }),
  ).nullish(),
  authors: z.array(z.string()).nullish(),
  artists: z.array(z.string()).nullish(),
  totalChapters: z.number().nullish(),
  totalVolumes: z.number().nullish(),
  relations: z.array(
    z.object({
      type: z.string(),
      providerId: z.string(),
      title: z.string().nullish(),
      coverUrl: z.string().nullish(),
    }),
  ).nullish(),
});

export type MangaDetail = z.infer<typeof mangaDetailSchema>;

/**
 * Full canonical manga detail (P17).
 *
 * Addressed by AniList id so the reader and detail routes can keep using the
 * same cross-reference id the anime side uses. A 404 is a missing title; a 400
 * is a malformed id; everything else is a transport/contract problem.
 */
export function fetchMangaDetail(anilistId: string): Promise<MangaDetail> {
  return getValidated(
    `/api/v1/manga/by-anilist/${encodeURIComponent(anilistId)}`,
    mangaDetailSchema,
  );
}

/**
 * One chapter in the canonical feed.
 *
 * `chapterNumber` is a string because upstream can publish "12.5" or "extra".
 * The reader resolves a requested number to the closest feed entry.
 */
export const mangaChapterSchema = z.object({
  id: z.string(),
  chapterNumber: z.string(),
  volume: z.string().nullish(),
  title: z.string().nullish(),
  language: z.string().nullish(),
  pages: z.number().nullish(),
  publishedAt: z.string().nullish(),
  scanlationGroup: z.string().nullish(),
});

export type MangaChapter = z.infer<typeof mangaChapterSchema>;

/**
 * The canonical chapter feed for one manga (GET /api/v1/manga/:id/chapters).
 *
 * Addressed by the MangaDex id from the detail payload; oldest first so the
 * reader can walk the series in order.
 */
export const mangaChapterFeedSchema = z.object({
  mangaId: z.string(),
  language: z.string(),
  items: z.array(mangaChapterSchema),
});

export type MangaChapterFeed = z.infer<typeof mangaChapterFeedSchema>;

/**
 * The canonical page list for one chapter (GET /api/v1/manga/chapters/:id/pages).
 *
 * Page URLs are signed and short-lived upstream, so the backend returns them
 * with no-store and the client must treat them as ephemeral: render them now,
 * do not persist them. A 404 is a missing chapter; a 502 is an upstream image
 * provider being unavailable.
 */
export const mangaChapterPagesSchema = z.object({
  pageCount: z.number(),
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      url: z.string(),
    }),
  ),
});

export type MangaChapterPages = z.infer<typeof mangaChapterPagesSchema>;

/** Canonical chapter feed for one manga (P17). */
export function fetchMangaChapters(
  mangadexId: string,
  language = "en",
): Promise<MangaChapterFeed> {
  return getValidated(
    `/api/v1/manga/${encodeURIComponent(mangadexId)}/chapters`,
    mangaChapterFeedSchema,
    { language },
  );
}

/** Canonical page list for one chapter (P17). */
export function fetchMangaChapterPages(chapterId: string): Promise<MangaChapterPages> {
  return getValidated(
    `/api/v1/manga/chapters/${encodeURIComponent(chapterId)}/pages`,
    mangaChapterPagesSchema,
  );
}

/**
 * Why a manga request failed, for UI that must not lie.
 *
 * "Not found" is a fact about the title; every other failure is a loading
 * problem. Collapsing these is how a provider outage becomes a missing manga.
 */
export type MangaFailure = "not_found" | "invalid_response" | "unavailable";

export function classifyMangaError(error: unknown): MangaFailure {
  if (error instanceof ZenkaiContractError) return "invalid_response";
  if (error instanceof HttpError && error.status === 404) return "not_found";
  return "unavailable";
}

/* ------------------------------------------------------------------ */
/* Schedule contract (GET /api/v1/schedule/week, /api/v1/anime/:id/schedule) */
/* ------------------------------------------------------------------ */

/**
 * One airing slot, as the canonical schedule endpoints return it.
 *
 * The backend derives `airingState` from the stored timestamp on every read,
 * never from the provider's stored label, so a slot written as "not yet aired"
 * still reads correctly weeks after it aired. `secondsUntil` is computed per
 * read so a cached day view still shows a live countdown.
 */
export const scheduleEntrySchema = z.object({
  scheduleId: z.string(),
  episodeNumber: z.number(),
  airingAt: z.coerce.date(),
  airingState: z.enum(["aired", "upcoming", "unknown"]),
  providerStatus: z.string(),
  source: z.string(),
  secondsUntil: z.number(),
  /** The joined title metadata the schedule query attaches. */
  animeId: z.string(),
  anilistId: z.string(),
  title: z.string(),
  coverUrl: z.string().nullable(),
  totalEpisodes: z.number().nullable(),
  slug: z.string(),
  /** Present on week/day views; absent on single-title schedule. */
  dayOfWeek: z.string().optional(),
});

export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

/**
 * The week view payload.
 *
 * Groups slots by local calendar day in `SCHEDULE_TIMEZONE` so a client can
 * label each day without recomputing the zone. `from`/`to` are UTC isot so the
 * client can compute a range; `timeZone` tells the client which civil zone the
 * days were grouped in.
 */
export const scheduleWeekSchema = z.object({
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      dayOfWeek: z.string(),
      entries: z.array(scheduleEntrySchema),
    }),
  ),
});

export type ScheduleWeek = z.infer<typeof scheduleWeekSchema>;

/** Canonical week schedule (P3). */
export function fetchScheduleWeek(): Promise<ScheduleWeek> {
  return getValidated("/api/v1/schedule/week", scheduleWeekSchema);
}

/**
 * Schedule for one title.
 *
 * Addressed by AniList id so the detail page can show airing history without
 * the client reconstructing it from AniList.
 */
export const scheduleForAnimeSchema = z.array(scheduleEntrySchema);

export function fetchAnimeSchedule(anilistId: string): Promise<ScheduleEntry[]> {
  return getValidated(
    `/api/v1/anime/${encodeURIComponent(anilistId)}/schedule`,
    scheduleForAnimeSchema,
  );
}

/**
 * Why a schedule request failed, for UI that must not lie.
 */
export type ScheduleFailure = "invalid_response" | "unavailable";

export function classifyScheduleError(error: unknown): ScheduleFailure {
  if (error instanceof ZenkaiContractError) return "invalid_response";
  return "unavailable";
}

/** Full canonical anime detail (P13).
 *
 * Failures are never collapsed: a 404 throws `HttpError(404)`, a malformed
 * payload throws `ZenkaiContractError`, and a network failure throws the
 * transport error — `classifyDetailError` turns those into distinct UI states
 * instead of one shared "not found".
 */
export function fetchAnimeDetail(id: string): Promise<AnimeDetail> {
  return getValidated(
    `/api/v1/anime/${encodeURIComponent(id)}`,
    animeDetailSchema,
  );
}

/** The canonical episode catalogue for a title (P4 contract, P13 client). */
export function fetchAnimeEpisodes(id: string): Promise<EpisodeCatalogue> {
  return getValidated(
    `/api/v1/anime/${encodeURIComponent(id)}/episodes`,
    episodeCatalogueSchema,
  );
}

/**
 * Canonical previous/next episode numbers (P4 contract, P13 client).
 *
 * The backend honours gaps and catalogue boundaries; the frontend must never
 * recompute `episode ± 1` itself (P14 step 12).
 */
export function fetchEpisodeNavigation(
  id: string,
  episodeNumber: number,
): Promise<EpisodeNavigation> {
  return getValidated(
    `/api/v1/anime/${encodeURIComponent(id)}/episodes/${episodeNumber}/navigation`,
    episodeNavigationSchema,
  );
}

/**
 * POST a JSON body and validate the response. The playback execution boundary
 * is the only canonical endpoint the browser writes to.
 */
async function postValidated<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  body: unknown,
): Promise<z.infer<T>> {
  const url = `${ZENKAI_API_URL}${path}`;
  const raw = await fetchJson<unknown>(url, { method: "POST", body, retries: 0 });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ZenkaiContractError(
      url,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return parsed.data;
}

/**
 * Ranked sources and plans for one canonical episode (P7).
 *
 * The episode is addressed by its canonical catalogue id — never by a number
 * the client invented. Failures stay distinguishable: 404 is a missing episode,
 * 503 is a provider outage (retryable), a malformed payload is a contract
 * violation, and a network failure is a transport error.
 */
export function fetchEpisodeSources(
  episodeId: string,
  language: PlaybackLanguage,
): Promise<PlaybackSourcesResponse> {
  return getValidated(
    `/api/v1/episodes/${encodeURIComponent(episodeId)}/sources`,
    playbackSourcesResponseSchema,
    { language },
  );
}

/**
 * Execute a canonical selection (P8).
 *
 * The request body carries only `episodeId`, `sourceId` and `language` — the
 * strict server schema rejects any URL, provider or header field with a 400, so
 * a buggy client cannot steer execution toward a caller-chosen upstream. The
 * backend re-resolves the plan and returns the only playback URL the client
 * ever sees.
 */
export function executePlayback(selection: {
  episodeId: string;
  sourceId: string;
  language: PlaybackLanguage;
}): Promise<PlaybackExecution> {
  return postValidated(
    "/api/v1/playback/execute",
    z.object({ execution: playbackExecutionSchema }),
    selection,
  ).then((payload) => payload.execution);
}

/**
 * Skip markers and subtitles for one canonical episode (P10).
 *
 * This replaces the legacy AniSkip call: the markers come from the canonical
 * metadata service, keyed by the same canonical episode id as sources.
 */
export function fetchEpisodeMetadata(episodeId: string): Promise<EpisodeMetadata> {
  return getValidated(
    `/api/v1/episodes/${encodeURIComponent(episodeId)}/metadata`,
    episodeMetadataSchema,
  );
}

/* ------------------------------------------------------------------ */
/* Watch playback flow (P14)                                           */
/* ------------------------------------------------------------------ */

/**
 * Why a playback request failed, for UI that must not lie.
 *
 * `no_sources` (503) is a retryable outage and must never be rendered as
 * "this episode has no streams"; `selection_stale` (409) means the ranked list
 * moved and the selection can be retried; `not_found` is a fact about the
 * episode; `invalid_response` means the backend answered outside the contract.
 */
export type PlaybackFailure =
  | "not_found"
  | "no_sources"
  | "selection_stale"
  | "invalid_response"
  | "unavailable";

export function classifyPlaybackError(error: unknown): PlaybackFailure {
  if (error instanceof ZenkaiContractError) return "invalid_response";
  if (error instanceof HttpError) {
    if (error.status === 404) return "not_found";
    if (error.status === 409) return "selection_stale";
    if (error.status === 503) return "no_sources";
  }
  return "unavailable";
}

/**
 * The airing gate: an episode the backend schedules for the future is not
 * playable, and "not released yet" must never be reported as "no streams".
 *
 * `unknown` is deliberately *not* unreleased: an episode with no schedule is
 * not claimed to be in the future, and if the canonical backend can resolve
 * sources for it, it plays. The client invents no release date either way.
 */
export function isUnreleased(
  episode: Pick<EpisodeCard, "airingState"> | null | undefined,
): boolean {
  return episode?.airingState === "upcoming";
}

/**
 * The backend's top-ranked plan is the default selection. List order is the
 * ranking (P7); the client applies no ranking of its own.
 */
export function initialPlanSelection(plans: PlaybackPlan[]): string | null {
  return plans[0]?.sourceId ?? null;
}

/**
 * The next canonical plan after one that failed at the playback layer.
 *
 * Bounded by the plan list: when the last plan fails there is nothing left to
 * try, and the caller reports the failure instead of looping.
 */
export function fallbackPlanSelection(
  plans: PlaybackPlan[],
  failedSourceId: string | null,
): string | null {
  const index = plans.findIndex((plan) => plan.sourceId === failedSourceId);
  // An unknown source has no successor: -1 would silently wrap to plans[0].
  if (index < 0) return null;
  return plans[index + 1]?.sourceId ?? null;
}

/**
 * Map a canonical plan onto a switcher option.
 *
 * Only canonical display facts are exposed — server position, quality,
 * resolution, language. Provider slugs, endpoints and health details stay
 * server-side: the user picks "Server 2", never a provider implementation.
 */
export function planToServerOption(plan: PlaybackPlan, index: number): ServerOption {
  return {
    sourceId: plan.sourceId,
    label: `Server ${index + 1}`,
    quality: plan.quality ?? null,
    resolution: plan.resolution ?? null,
    language: plan.language,
  };
}

/* ------------------------------------------------------------------ */
/* Search states (P15)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Why a search failed. Search has no 404: a query that matches nothing is a
 * 200 with an empty list, so every failure here is the backend being unable to
 * answer rather than the catalogue being empty.
 */
export type SearchFailure = "bad_request" | "invalid_response" | "unavailable";

export function classifySearchError(error: unknown): SearchFailure {
  if (error instanceof ZenkaiContractError) return "invalid_response";
  if (error instanceof HttpError && error.status === 400) return "bad_request";
  return "unavailable";
}

/**
 * Every state search is allowed to be in (P15).
 *
 * The point of modelling them is that they stay separate. A provider outage and
 * a genuinely empty catalogue are different problems with different remedies,
 * and collapsing both into `results = []` tells a user searching for a typo that
 * the title does not exist when in fact nothing was able to answer.
 */
export type SearchState =
  /** Below the minimum query length. No request is made at all. */
  | { kind: "idle" }
  | { kind: "loading" }
  /** A successful search that matched nothing. */
  | { kind: "empty"; query: string }
  | { kind: "items"; items: MediaSummary[] }
  | { kind: "error"; reason: SearchFailure; message: string };

/** Below this many characters a search is not worth sending. */
export const SEARCH_MIN_LENGTH = 2;

/**
 * Failure copy. None of these may read as an empty result: the distinction
 * between "nothing matched" and "nothing could answer" is carried by the state
 * and the heading, so the sentence underneath must not restate it as a count.
 */
const SEARCH_ERROR_COPY: Record<SearchFailure, string> = {
  bad_request: "That search could not be understood. Try a shorter query.",
  invalid_response: "Search returned data this page could not understand.",
  unavailable: "The search service could not answer just now. Please try again in a moment.",
};

/**
 * Fold a query's lifecycle into one state.
 *
 * Error outranks data on purpose: a failed refetch must not leave the previous
 * query's results on screen looking like the answer to the new one.
 */
export function searchState(input: {
  term: string;
  flags: { isLoading: boolean; isError: boolean; error?: unknown };
  items?: MediaSummary[];
  minLength?: number;
}): SearchState {
  const term = input.term.trim();
  if (term.length < (input.minLength ?? SEARCH_MIN_LENGTH)) return { kind: "idle" };

  if (input.flags.isError) {
    const reason = classifySearchError(input.flags.error);
    return { kind: "error", reason, message: SEARCH_ERROR_COPY[reason] };
  }
  if (input.flags.isLoading) return { kind: "loading" };
  if (!input.items) return { kind: "loading" };
  if (input.items.length === 0) return { kind: "empty", query: term };
  return { kind: "items", items: input.items };
}

/* ------------------------------------------------------------------ */
/* Canonical contract → provider-neutral UI model                      */
/* ------------------------------------------------------------------ */

const FORMAT_VALUES = new Set<string>([
  "TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC",
  "MANGA", "NOVEL", "ONE_SHOT",
]);

const STATUS_VALUES = new Set<string>([
  "FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS",
]);

const SEASON_VALUES = new Set<string>(["WINTER", "SPRING", "SUMMER", "FALL"]);

/** Unknown enum values render as unknown rather than being guessed. */
function enumOr<T extends string>(
  value: string | null | undefined,
  allowed: Set<string>,
  fallback: T,
): T {
  return value !== null && value !== undefined && allowed.has(value)
    ? (value as T)
    : fallback;
}

/**
 * Map a discovery card onto the shared media model.
 *
 * Only canonical contract fields are read: a card that lacks every optional
 * field still renders. Unavailable metadata stays null so the card shows an
 * explicit unknown state instead of an invented zero.
 *
 * The card's cross-reference id is the routing id: the detail and watch
 * routes address titles by it today (P13/P14 will revisit that addressing).
 */
export function discoveryCardToMedia(
  card: DiscoveryCard,
  kind: MediaKind = "anime",
): MediaSummary {
  const { titles } = card;
  // displayTitle prefers english over romaji; the canonical title is the
  // fallback so a card with empty title variants still has a name.
  const preferred =
    titles.english ?? titles.romaji ?? titles.native ?? card.title ?? null;

  return {
    id: card.anilistId || card.id || "",
    malId: null,
    kind,
    provider: "zenkai",
    title: {
      romaji: titles.romaji,
      english: titles.english,
      native: titles.native,
      preferred,
    },
    cover: {
      url: card.coverUrl ?? card.coverImageLarge,
      color: null,
    },
    banner: card.bannerUrl,
    description: null,
    // Unknown enum values render as UNKNOWN rather than being guessed; the
    // season stays null because the card hides an absent season.
    format: enumOr<MediaFormat>(card.format, FORMAT_VALUES, "UNKNOWN"),
    status: enumOr<MediaStatus>(card.status, STATUS_VALUES, "UNKNOWN"),
    season:
      card.season && SEASON_VALUES.has(card.season)
        ? (card.season as MediaSeason)
        : null,
    seasonYear: card.seasonYear ?? card.year ?? null,
    episodes: card.totalEpisodes,
    chapters: null,
    volumes: null,
    durationMinutes: null,
    averageScore: card.averageScore,
    popularity: card.popularity,
    genres: card.genres,
  };
}

const MANGA_STATUS_MAP: Record<string, MediaStatus> = {
  ONGOING: "RELEASING",
  COMPLETED: "FINISHED",
  HIATUS: "HIATUS",
  CANCELLED: "CANCELLED",
};

/**
 * Map a manga catalogue row onto the shared media model.
 *
 * The catalogue row has no score field, so `averageScore` stays null: a
 * rating the backend never sent is never displayed. The detail route
 * addresses manga by its cross-reference id (the backend's rule).
 */
export function mangaCatalogueItemToMedia(item: MangaCatalogueItem): MediaSummary {
  return {
    id: item.mangadexId || item.id,
    malId: null,
    kind: "manga",
    provider: "zenkai",
    title: { preferred: item.canonicalTitle },
    cover: { url: item.coverUrl ?? item.coverImageLarge, color: null },
    banner: item.bannerUrl,
    description: item.description ?? null,
    format: "MANGA",
    status: MANGA_STATUS_MAP[item.status] ?? "UNKNOWN",
    season: null,
    seasonYear: item.year,
    episodes: null,
    chapters: item.totalChapters,
    volumes: item.totalVolumes,
    durationMinutes: null,
    averageScore: null,
    popularity: null,
    genres: [],
  };
}

/**
 * Map canonical anime detail onto the shared media model (P13).
 *
 * The routing id is the cross-reference id (`anilistId`), matching how the
 * discovery cards address titles — the backend's local UUID never appears in a
 * URL. Null metadata stays null (never zero), an unknown enum renders as
 * `UNKNOWN`, and the episode count is the canonical `totalEpisodes` — the UI
 * does not compute its own.
 */
export function animeDetailToMedia(detail: AnimeDetail): MediaSummary {
  return {
    id: detail.anilistId,
    malId: null,
    kind: "anime",
    provider: "zenkai",
    title: {
      romaji: detail.titles.romaji ?? null,
      english: detail.titles.english ?? null,
      native: detail.titles.native ?? null,
      preferred: detail.canonicalTitle,
    },
    // Largest artwork for the detail hero; the small cover only as fallback.
    cover: { url: detail.coverImageLarge ?? detail.coverUrl ?? null, color: null },
    banner: detail.bannerUrl ?? null,
    description: detail.description ?? null,
    format: enumOr<MediaFormat>(detail.format, FORMAT_VALUES, "UNKNOWN"),
    status: enumOr<MediaStatus>(detail.status, STATUS_VALUES, "UNKNOWN"),
    season:
      detail.season && SEASON_VALUES.has(detail.season)
        ? (detail.season as MediaSeason)
        : null,
    seasonYear: detail.seasonYear ?? detail.year ?? null,
    episodes: detail.totalEpisodes ?? null,
    chapters: null,
    volumes: null,
    durationMinutes: detail.durationMinutes ?? null,
    averageScore: detail.averageScore ?? null,
    popularity: detail.popularity ?? null,
    genres: detail.genres ?? [],
  };
}

/**
 * Map one canonical relation onto a card the grid can render.
 *
 * The backend contract carries id/title/cover only, so score, format and
 * season stay null — absent data, never invented defaults.
 */
export function animeRelationToMedia(relation: AnimeDetail["relations"][number]): MediaSummary {
  return {
    id: String(relation.anilistId),
    malId: null,
    kind: "anime",
    provider: "zenkai",
    title: { preferred: relation.title ?? null },
    cover: { url: relation.coverUrl ?? null, color: null },
    banner: null,
    description: null,
    format: "UNKNOWN",
    status: "UNKNOWN",
    season: null,
    seasonYear: null,
    episodes: null,
    chapters: null,
    volumes: null,
    durationMinutes: null,
    averageScore: null,
    popularity: null,
    genres: [],
  };
}

/**
 * Assemble the detail view-model from the canonical payload (P13).
 *
 * `recommendations` and `characters` are empty because the backend contract
 * has no such fields: an empty list hides the section, whereas a fabricated
 * list would render content nobody can verify. `airing` carries the canonical
 * next-episode slot verbatim — the UI never derives airing state itself.
 */
export function animeDetailToDetailData(detail: AnimeDetail): DetailData {
  return {
    summary: animeDetailToMedia(detail),
    relations: detail.relations.map((relation) => ({
      relationType: relation.type,
      media: animeRelationToMedia(relation),
    })),
    recommendations: [],
    characters: [],
    airing: detail.nextAiringEpisode ?? null,
  };
}

/**
 * Why a detail request failed, for UI that must not lie.
 *
 * "Not found" is a fact about the title; "invalid response" means the backend
 * answered with something outside the contract (never rendered as data); every
 * other failure is a loading problem. Collapsing these into one message is how
 * a backend outage gets presented to the user as a missing anime.
 */
export type DetailFailure = "not_found" | "invalid_response" | "unavailable";

export function classifyDetailError(error: unknown): DetailFailure {
  if (error instanceof ZenkaiContractError) return "invalid_response";
  if (error instanceof HttpError && error.status === 404) return "not_found";
  return "unavailable";
}

/* ------------------------------------------------------------------ */
/* Shelf state                                                          */
/* ------------------------------------------------------------------ */

/**
 * What a shelf is allowed to tell the user, in order of specificity.
 *
 * These states are the whole point of the P12 migration: the backend's
 * contract already distinguishes "empty" from "unavailable" and the UI must
 * not flatten them, because "nothing is trending right now" and "the
 * provider is down" are different problems with different remedies.
 */
export type ShelfState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; reason?: string }
  | { kind: "empty" }
  | { kind: "items"; items: MediaSummary[] };

export interface QueryFlags {
  isLoading: boolean;
  isError: boolean;
}

/**
 * Classify one home section. A missing section is an unavailable section:
 * the payload validated, so its absence is a backend-side gap, not empty
 * content the backend chose to report.
 */
export function homeSectionToShelfState(
  section: HomeSection | undefined,
  flags: QueryFlags,
  kind: MediaKind = "anime",
): ShelfState {
  if (flags.isLoading) return { kind: "loading" };
  if (flags.isError) return { kind: "error", message: "The Zenkai API could not be reached." };
  if (!section) return { kind: "unavailable", reason: "missing_section" };
  if (section.status === "unavailable") {
    return { kind: "unavailable", reason: section.reason };
  }
  const items = section.items.map((card) => discoveryCardToMedia(card, kind));
  return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
}

/**
 * Classify a plain catalogue listing (no per-section status field, e.g. the
 * manga shelf). Loading and error states come from the query flags; an empty
 * successful page is genuinely empty because the endpoint is database-backed.
 */
export function catalogueToShelfState(
  items: MediaSummary[] | undefined,
  flags: QueryFlags,
): ShelfState {
  if (flags.isLoading) return { kind: "loading" };
  if (flags.isError) return { kind: "error", message: "The Zenkai API could not be reached." };
  if (!items) return { kind: "unavailable", reason: "missing_section" };
  return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
}

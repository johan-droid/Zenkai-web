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

import { fetchJson } from "./http";
import type { MediaFormat, MediaKind, MediaSeason, MediaStatus, MediaSummary } from "@/lib/media";

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

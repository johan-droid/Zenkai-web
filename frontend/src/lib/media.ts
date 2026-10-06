/**
 * The canonical, provider-neutral media model.
 *
 * Provider clients (AniList, MangaDex, Jikan, TMDB) map their payloads into
 * these shapes so the UI never depends on a specific upstream schema.
 */

export type MediaKind = "anime" | "manga";

export type MediaFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "SPECIAL"
  | "OVA"
  | "ONA"
  | "MUSIC"
  | "MANGA"
  | "NOVEL"
  | "ONE_SHOT"
  | "UNKNOWN";

export type MediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS"
  | "UNKNOWN";

export type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

/**
 * Where a media record came from. `zenkai` marks records served by the
 * canonical backend, which is the boundary Home and discovery use (P12).
 */
export type MediaProvider = "zenkai" | "anilist" | "mangadex" | "jikan" | "tmdb";

export interface MediaTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  /** Prefers the user's chosen title language when the provider supplies it. */
  preferred?: string | null;
}

export interface MediaImage {
  url?: string | null;
  color?: string | null;
}

export interface MediaSummary {
  /** Provider-scoped id (AniList id, MangaDex UUID, TMDB id, ...). */
  id: string;
  /** MyAnimeList id, when the provider exposes one. */
  malId: number | null;
  kind: MediaKind;
  provider: MediaProvider;
  title: MediaTitle;
  cover: MediaImage;
  banner: string | null;
  description: string | null;
  format: MediaFormat;
  status: MediaStatus;
  season: MediaSeason | null;
  seasonYear: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  durationMinutes: number | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
}

/** Canonical next-airing information as the backend reports it (P13). */
export interface DetailAiring {
  episode: number;
  /** Epoch seconds, exactly as the backend returns it. */
  airingAt: number;
  timeUntilAiring: number;
}

/**
 * The detail view-model every detail surface renders.
 *
 * Anime fills this from the canonical backend (P13); manga still fills it from
 * the legacy client until P17. `airing` is optional because only the canonical
 * payload carries it, and the character/recommendation lists are empty rather
 * than fabricated when the backend contract has no such field.
 */
export interface DetailData {
  summary: MediaSummary;
  relations: { relationType: string; media: MediaSummary }[];
  recommendations: MediaSummary[];
  characters: { id: number; name: string; image: string | null; role: string }[];
  airing?: DetailAiring | null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * AniList descriptions are HTML. Strip tags and decode the common entities so
 * they can be rendered as plain text.
 */
export function stripHtml(input?: string | null): string | null {
  if (!input) return null;

  const withoutTags = input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const decoded = withoutTags.replace(
    /&[a-z#0-9]+;/gi,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
  const trimmed = decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return trimmed.length > 0 ? trimmed : null;
}

/** Best available human-readable title, in a stable preference order. */
export function displayTitle(title: MediaTitle, fallback = "Untitled"): string {
  const candidate =
    title.preferred ?? title.english ?? title.romaji ?? title.native ?? null;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/** AniList scores are 0-100; present them as a 0-10 rating with one decimal. */
export function formatScore(score?: number | null): string | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return (score / 10).toFixed(1);
}

export function seasonLabel(season?: MediaSeason | null, year?: number | null): string | null {
  if (!season && !year) return null;
  if (!season) return String(year);
  const name = season.charAt(0) + season.slice(1).toLowerCase();
  return year ? `${name} ${year}` : name;
}

export function fuzzyDateToIso(
  date?: { year?: number | null; month?: number | null; day?: number | null } | null,
): string | null {
  if (!date?.year) return null;
  const month = date.month ?? 1;
  const day = date.day ?? 1;
  return `${date.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mediaHref(media: Pick<MediaSummary, "kind" | "id">): string {
  return media.kind === "anime" ? `/anime/${media.id}` : `/manga/${media.id}`;
}

export function watchHref(id: string | number, episode: string | number): string {
  return `/watch/${id}/${episode}`;
}

export function readHref(id: string | number, chapter: string | number): string {
  return `/read/${id}/${chapter}`;
}

/** Placeholder used when a provider has no artwork for a title. */
export const FALLBACK_COVER_COLOR = "#1f2937";

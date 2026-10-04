/**
 * Canonical media model, shared by every domain module.
 *
 * Provider payloads (AniList, Jikan, MangaDex) are mapped into these shapes so
 * the rest of the service never depends on an upstream schema.
 */

export type MediaKind = "anime" | "manga" | "novel";

export type MediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS"
  | "UNKNOWN";

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

export interface MediaTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  /** Best available display title, resolved once during enrichment. */
  preferred?: string | null;
}

export interface MediaSummary {
  kind: MediaKind;
  /** Provider-scoped id on the provider this was fetched from. */
  providerId: string;
  title: MediaTitle;
  description?: string | null;
  coverUrl?: string | null;
  bannerUrl?: string | null;
  format?: MediaFormat | null;
  status?: MediaStatus | null;
  year?: number | null;
  season?: string | null;
  score?: number | null;
  genres?: string[];
  totalEpisodes?: number | null;
  totalChapters?: number | null;
  totalVolumes?: number | null;
  durationMinutes?: number | null;
  /** Ids for this title on other providers. */
  externalIds?: Record<string, string>;
  /** How the canonical record was chosen when merging providers. */
  canonicalFrom?: string;
}

/** Strip HTML tags and decode the common entities. */
export function stripHtml(input?: string | null): string | null {
  if (!input) return null;
  const withoutTags = input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  const decoded = withoutTags.replace(
    /&[a-z#0-9]+;/gi,
    (entity) => entities[entity.toLowerCase()] ?? entity,
  );
  const trimmed = decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Best available human-readable title, in a stable preference order. */
export function displayTitle(title: MediaTitle, fallback = "Untitled"): string {
  const candidate = title.preferred ?? title.english ?? title.romaji ?? title.native ?? null;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Normalize a title for matching across providers.
 *
 * AniList, Jikan and MangaDex spell the same work differently ("Kimi no Na wa",
 * "Your Name", "Kimi No Na Wa."), and the providers share no id space, so the
 * title text is the only join available.
 */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\b(the|a|an|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score two titles 0-1, ignoring case, punctuation and articles. */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    return 0.75 + ratio * 0.2;
  }

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (shared === 0) return 0;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

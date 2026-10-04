import { fetchJson } from "@/lib/api/http";
import {
  chapterPageUrls,
  mangadexAtHomeSchema,
  mangadexChapterListResponseSchema,
  mangadexMangaListResponseSchema,
  mangadexMangaResponseSchema,
  mangaToMediaSummary,
  relationshipFilename,
  relationshipId,
  type ChapterQuality,
  type MangaDexChapter,
  type MangaDexManga,
} from "@/lib/schemas/mangadex";
import type { MediaSummary } from "@/lib/media";

/**
 * MangaDex API client.
 *
 * REST API, no auth required for public catalogue reads. Cover images live on
 * the separate `uploads.mangadex.org` CDN and are addressed by the manga id plus
 * the `cover_art` relationship's filename.
 */

export const MANGADEX_API = "https://api.mangadex.org";
export const MANGADEX_UPLOADS = "https://uploads.mangadex.org";

/** Resolve a cover URL from a manga resource's `cover_art` relationship. */
export function coverUrl(manga: MangaDexManga, size: 256 | 512 = 512): string | null {
  const filename = relationshipFilename(manga.relationships, "cover_art");
  if (!filename) return null;
  return `${MANGADEX_UPLOADS}/covers/${manga.id}/${filename}.${size}.jpg`;
}

export interface MangaBrowseParams {
  limit?: number;
  offset?: number;
  title?: string;
  includedTags?: string[];
  status?: string[];
  contentRating?: string[];
  order?: Record<string, "asc" | "desc">;
}

export interface MangaListResult {
  items: MediaSummary[];
  limit: number;
  offset: number;
  total: number;
}

/** Browse or search the manga catalogue. */
export async function browseManga(params: MangaBrowseParams = {}): Promise<MangaListResult> {
  const data = await fetchJson<unknown>(`${MANGADEX_API}/manga`, {
    params: {
      limit: params.limit ?? 30,
      offset: params.offset ?? 0,
      title: params.title,
      "includedTags[]": params.includedTags,
      "status[]": params.status,
      "contentRating[]": params.contentRating ?? ["safe", "suggestive"],
      "order[relevance]": params.title ? "desc" : undefined,
      "order[followedCount]": params.title ? undefined : "desc",
      "includes[]": ["cover_art", "author", "artist"],
    },
  });

  const parsed = mangadexMangaListResponseSchema.parse(data);

  return {
    items: (parsed.data ?? []).map((manga) => {
      const summary = mangaToMediaSummary(manga);
      summary.cover.url = coverUrl(manga);
      return summary;
    }),
    limit: parsed.limit ?? params.limit ?? 30,
    offset: parsed.offset ?? params.offset ?? 0,
    total: parsed.total ?? 0,
  };
}

export async function searchManga(
  title: string,
  params: Omit<MangaBrowseParams, "title"> = {},
): Promise<MangaListResult> {
  return browseManga({ ...params, title });
}

export interface MangaDetail {
  summary: MediaSummary;
  manga: MangaDexManga;
  authors: string[];
}

/** Full detail for a single manga by its MangaDex UUID. */
export async function getMangaById(id: string): Promise<MangaDetail | null> {
  const data = await fetchJson<unknown>(`${MANGADEX_API}/manga/${id}`, {
    params: { "includes[]": ["cover_art", "author", "artist"] },
  });

  const parsed = mangadexMangaResponseSchema.safeParse(data);
  if (!parsed.success) return null;

  const manga = parsed.data.data;
  const summary = mangaToMediaSummary(manga);
  summary.cover.url = coverUrl(manga);

  const authors = (manga.relationships ?? [])
    .filter((relationship) => relationship.type === "author" || relationship.type === "artist")
    .map((relationship) => {
      const name = relationship.attributes?.name;
      return typeof name === "string" ? name : null;
    })
    .filter((name): name is string => Boolean(name));

  return { summary, manga, authors };
}

export interface ChapterFeedParams {
  limit?: number;
  offset?: number;
  translatedLanguage?: string[];
  order?: Record<string, "asc" | "desc">;
  includeExternalUrl?: boolean;
}

export interface ChapterEntry {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  language: string | null;
  pages: number | null;
  publishedAt: string | null;
  externalUrl: string | null;
}

export interface ChapterFeedResult {
  items: ChapterEntry[];
  limit: number;
  offset: number;
  total: number;
}

/** The chapter feed for a manga, newest or oldest first. */
export async function getChapterFeed(
  mangaId: string,
  params: ChapterFeedParams = {},
): Promise<ChapterFeedResult> {
  const data = await fetchJson<unknown>(`${MANGADEX_API}/manga/${mangaId}/feed`, {
    params: {
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      "translatedLanguage[]": params.translatedLanguage ?? ["en"],
      "order[chapter]": params.order?.chapter ?? "desc",
      "includes[]": ["scanlation_group"],
      includeExternalUrl: params.includeExternalUrl ? 1 : 0,
      "contentRating[]": ["safe", "suggestive"],
    },
  });

  const parsed = mangadexChapterListResponseSchema.parse(data);

  return {
    items: (parsed.data ?? []).map(toChapterEntry),
    limit: parsed.limit ?? params.limit ?? 100,
    offset: parsed.offset ?? params.offset ?? 0,
    total: parsed.total ?? 0,
  };
}

export async function getChapterById(id: string): Promise<ChapterEntry | null> {
  const data = await fetchJson<unknown>(`${MANGADEX_API}/chapter/${id}`);
  const parsed = mangadexChapterListResponseSchema.safeParse(data);
  const chapter = parsed.success ? parsed.data.data?.[0] : undefined;
  return chapter ? toChapterEntry(chapter) : null;
}

/**
 * Fetch the at-home image server metadata for a chapter and return ordered
 * absolute page URLs. Base URLs are short-lived (~15 min), so resolve pages
 * close to when they are displayed rather than caching long-term.
 */
export async function getChapterPages(
  chapterId: string,
  quality: ChapterQuality = "data",
): Promise<string[]> {
  const data = await fetchJson<unknown>(`${MANGADEX_API}/at-home/server/${chapterId}`);
  const parsed = mangadexAtHomeSchema.parse(data);
  return chapterPageUrls(parsed, quality);
}

/**
 * Report an image load result to the MangaDex@Home network so unhealthy nodes
 * get taken out of rotation. Only needed for non-`mangadex.org` base URLs.
 * Best-effort: failures here are swallowed.
 */
export async function reportAtHomeResult(report: {
  url: string;
  success: boolean;
  bytes?: number;
  durationMs?: number;
  cached?: boolean;
}): Promise<void> {
  if (report.url.includes("mangadex.org")) return;

  try {
    await fetchJson("https://api.mangadex.network/report", {
      method: "POST",
      retries: 0,
      timeoutMs: 5_000,
      body: {
        url: report.url,
        success: report.success,
        bytes: report.bytes ?? 0,
        duration: report.durationMs ?? 0,
        cached: report.cached ?? false,
      },
    });
  } catch {
    // Reporting is advisory; never let it break reading.
  }
}

function toChapterEntry(chapter: MangaDexChapter): ChapterEntry {
  const attributes = chapter.attributes;
  return {
    id: chapter.id,
    chapter: attributes?.chapter ?? null,
    volume: attributes?.volume ?? null,
    title: attributes?.title ?? null,
    language: attributes?.translatedLanguage ?? null,
    pages: attributes?.pages ?? null,
    publishedAt: attributes?.publishAt ?? null,
    externalUrl: attributes?.externalUrl ?? null,
  };
}

export { relationshipId, relationshipFilename, coverUrl as getCoverUrl };
export type { MangaDexChapter, MangaDexManga, ChapterQuality };

/**
 * Find the MangaDex entry that best matches a title from another provider.
 *
 * AniList and MangaDex have unrelated id spaces with no shared identifier, so a
 * title fetched from AniList cannot be read directly. The title text is the only
 * join available, so we search MangaDex and rank by how closely the titles agree.
 *
 * This is a heuristic: it can pick the wrong entry for titles that are
 * ambiguous or that differ in punctuation. Callers should surface the match so
 * the reader can show which edition it opened.
 */
export async function findMangaDexByTitle(
  title: string,
  options: { limit?: number; signals?: (string | null | undefined)[] } = {},
): Promise<{ id: string; title: string; score: number } | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Try each alternative title spelling, best first.
  const queries = options.signals?.length
    ? options.signals.map((signal) => signal?.trim() ?? "").filter(Boolean)
    : [trimmed];

  const seen = new Set<string>();
  let best: { id: string; title: string; score: number } | null = null;

  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const result = await browseManga({
      title: query,
      limit: options.limit ?? 10,
      contentRating: ["safe", "suggestive", "erotica", "pornographic"],
    });

    for (const item of result.items) {
      const candidateTitle = item.title.english ?? item.title.romaji;
      if (!candidateTitle) continue;

      const score = titleSimilarity(trimmed, candidateTitle);
      if (!best || score > best.score) {
        best = { id: item.id, title: candidateTitle, score };
      }
    }

    // A confident first-pass match is good enough; stop searching.
    if (best && best.score >= 0.92) break;
  }

  return best && best.score >= MIN_MATCH_SCORE ? best : null;
}

/** Below this, two titles are too different to assume they are the same work. */
const MIN_MATCH_SCORE = 0.62;

export interface MangaTitleSignal {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

/**
 * Compare two titles, ignoring case, punctuation and articles, and score the
 * result 0-1. Returns 1 only for an exact match after normalization.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  // One title fully containing the other is a strong signal ("Naruto" vs
  // "Naruto: Shippuden").
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    return 0.75 + ratio * 0.2;
  }

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (shared === 0) return 0;

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return shared / union;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\b(the|a|an|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

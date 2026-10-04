/**
 * Jikan adapter (MyAnimeList REST).
 *
 * Used to enrich AniList records: Jikan exposes fields AniList omits (MAL
 * popularity, members, synopsis length) and, more usefully, is keyed by MAL id,
 * which is what most playback providers expect.
 *
 * Jikan is rate limited (3 req/s, 60/min) and returns 429 readily, so every
 * call is best-effort: a failure here degrades the enriched record but must
 * never fail the request.
 */

import type { MediaSummary } from "../../media.js";

const BASE = process.env.JIKAN_ENDPOINT ?? "https://api.jikan.moe/v4";
const TIMEOUT_MS = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 5000);

/** Simple throttle so a burst of enrichments does not trip the rate limit. */
let lastCall = 0;
const MIN_GAP_MS = 1_100;

async function throttledFetch<T>(path: string): Promise<T | null> {
  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    lastCall = Date.now();

    if (!response.ok) {
      // 429 means we are going too fast; treat as a miss, not a hard error.
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface JikanAnime {
  mal_id: number;
  title: string | null;
  title_english: string | null;
  title_japanese: string | null;
  synopsis: string | null;
  type: string | null;
  status: string | null;
  year: number | null;
  season: string | null;
  episodes: number | null;
  duration: string | null;
  score: number | null;
  members: number | null;
  popularity: number | null;
  genres: { mal_id: number; name: string }[] | null;
  studios: { mal_id: number; name: string }[] | null;
}

export interface JikanManga {
  mal_id: number;
  title: string | null;
  title_english: string | null;
  title_japanese: string | null;
  synopsis: string | null;
  type: string | null;
  status: string | null;
  published: { from: string | null } | null;
  chapters: number | null;
  volumes: number | null;
  score: number | null;
  members: number | null;
  popularity: number | null;
  genres: { mal_id: number; name: string }[] | null;
}

export interface MalEnrichment {
  malId: number;
  popularity: number | null;
  members: number | null;
  studios: string[];
  /** Minutes, parsed from MAL's free-text duration like "24 min per ep". */
  durationMinutes: number | null;
  /** MAL's synopsis, kept separate so the caller can prefer AniList's. */
  synopsis: string | null;
  score: number | null;
}

/** MAL reports duration as free text; take the first integer as minutes. */
function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function getAnime(malId: number): Promise<MalEnrichment | null> {
  const data = await throttledFetch<{ data: JikanAnime }>(`/anime/${malId}/full`);
  if (!data?.data) return null;

  const anime = data.data;
  return {
    malId: anime.mal_id,
    popularity: anime.popularity,
    members: anime.members,
    studios: (anime.studios ?? []).map((studio) => studio.name),
    durationMinutes: parseDuration(anime.duration),
    synopsis: anime.synopsis,
    score: anime.score,
  };
}

export async function getManga(malId: number): Promise<MalEnrichment | null> {
  const data = await throttledFetch<{ data: JikanManga }>(`/manga/${malId}/full`);
  if (!data?.data) return null;

  const manga = data.data;
  return {
    malId: manga.mal_id,
    popularity: manga.popularity,
    members: manga.members,
    studios: [],
    durationMinutes: null,
    synopsis: manga.synopsis,
    score: manga.score,
  };
}

/**
 * Fold MAL data into an AniList summary.
 *
 * AniList stays the canonical record: its values win, and MAL only fills gaps.
 */
export function mergeEnrichment(
  summary: MediaSummary,
  enrichment: MalEnrichment | null,
): MediaSummary {
  if (!enrichment) return summary;

  return {
    ...summary,
    description: summary.description ?? enrichment.synopsis,
    durationMinutes: summary.durationMinutes ?? enrichment.durationMinutes,
    score: summary.score ?? enrichment.score,
    totalChapters: summary.totalChapters,
    externalIds: { ...summary.externalIds, mal: String(enrichment.malId) },
  };
}

/**
 * Jikan (MyAnimeList) adapter — enrichment only (P2).
 *
 * Jikan is a MAL proxy, not a primary catalogue. It earns its place for two
 * things AniList cannot do:
 *
 *  - reverse lookup by MAL id, which AniList has no index for;
 *  - `trailer` plus finer-grained `studios`/`relations`.
 *
 * It is deliberately not used for browsing or search: Jikan allows 3 requests
 * per second and 60 per minute, which is not enough to serve a discovery page
 * directly. Those read through AniList and the database instead.
 */

import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import {
  displayTitle,
  stripHtml,
  type MediaFormat,
  type MediaStatus,
} from "../../domain/media.js";
import type { AiringSlot, AnimeDetail, AnimeSummary } from "./types.js";

interface JikanAnime {
  mal_id: number;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  titles?: Array<{ type: string; title: string }>;
  type?: string | null;
  episodes?: number | null;
  status?: string | null;
  airing?: boolean;
  duration?: string | null;
  score?: number | null;
  popularity?: number;
  members?: number;
  synopsis?: string | null;
  season?: string | null;
  year?: number | null;
  genres?: Array<{ name: string; id: number }>;
  themes?: Array<{ name: string; id: number }>;
  demographics?: Array<{ name: string; id: number }>;
  relations?: Array<{
    relation: string;
    entry: Array<{ mal_id: number; name: string; type: string }>;
  }>;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  broadcast?: {
    day?: string;
    time?: string;
    timezone?: string;
  };
}

/** Jikan reports status in prose; map it onto the canonical enum. */
function toStatus(entry: JikanAnime): MediaStatus {
  const raw = (entry.status ?? "").toLowerCase();
  if (entry.airing || raw.includes("currently airing")) return "RELEASING";
  if (raw.includes("not yet aired")) return "NOT_YET_RELEASED";
  if (raw.includes("finished")) return "FINISHED";
  if (raw.includes("on hold")) return "HIATUS";
  if (raw.includes("discontinued")) return "CANCELLED";
  return "UNKNOWN";
}

/** "24 min per ep" -> 24. */
function toMinutes(duration: string | undefined | null): number | null {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*min/i);
  return match ? Number(match[1]) : null;
}

function formatToEnum(format: string | undefined | null): MediaFormat | null {
  switch ((format ?? "").toUpperCase()) {
    case "TV":
      return "TV";
    case "TV SHORT":
      return "TV_SHORT";
    case "MOVIE":
    case "FILM":
      return "MOVIE";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "SPECIAL":
      return "SPECIAL";
    case "MUSIC":
      return "MUSIC";
    default:
      return null;
  }
}

/** MAL spells a title several ways; all of them help cross-provider matching. */
function synonymsOf(entry: JikanAnime): string[] {
  const fromTitles = (entry.titles ?? []).map((item) => item.title);
  return Array.from(
    new Set(
      [entry.title, entry.title_english, entry.title_japanese, ...fromTitles].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

export class JikanProvider {
  readonly slug = "jikan";
  readonly name = "Jikan (MyAnimeList)";
  readonly priority = 2;

  readonly #endpoint = config.JIKAN_ENDPOINT;

  /** Fetch one MAL entry by id, with relations. Returns null for a 404. */
  async getByMalId(malId: string | number): Promise<AnimeDetail | null> {
    const response = await fetchJson<{ data: JikanAnime }>(
      `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}/full`,
    );

    if (!response?.data) return null;
    return this.#toDetail(response.data);
  }

  /** Cheap existence check used before paying for a full enrichment fetch. */
  async hasMalId(malId: string | number): Promise<boolean> {
    const response = await fetchJson<{ data: JikanAnime }>(
      `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}`,
    );
    return Boolean(response?.data);
  }

  /**
   * Airing slots from Jikan, used as a fallback when AniList has no data.
   *
   * Jikan reports `airing: true/false` and a `broadcast` object with the day and
   * time, but no episode number. The slot returned here is a best-effort
   * projection: episode 1 at the next broadcast time. The schedule service
   * extrapolates from there.
   */
  async getAiringSlots(malId: string | number): Promise<AiringSlot[]> {
    const response = await fetchJson<{ data: JikanAnime }>(
      `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}`,
    );

    const entry = response?.data;
    if (!entry?.airing) return [];

    const broadcast = entry.broadcast as
      | { day?: string; time?: string; timezone?: string }
      | undefined;
    if (!broadcast?.day || !broadcast?.time) return [];

    const dayMap: Record<string, number> = {
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
    };
    const targetDay = dayMap[broadcast.day.toLowerCase()] ?? 0;
    const [hours, minutes] = broadcast.time.split(":").map(Number);

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hours, minutes, 0, 0);

    const currentDay = now.getUTCDay();
    let delta = targetDay - currentDay;
    if (delta < 0) delta += 7;
    if (delta === 0 && next.getTime() <= now.getTime()) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);

    return [
      {
        episodeNumber: 1,
        airingAt: Math.floor(next.getTime() / 1000),
        status: "NOT_YET_AIRRED",
      },
    ];
  }

  #toSummary(entry: JikanAnime): AnimeSummary {
    const titles = {
      romaji: entry.title ?? null,
      english: entry.title_english ?? null,
      native: entry.title_japanese ?? null,
      synonyms: synonymsOf(entry),
    };

    return {
      // Jikan has no AniList id. An empty string marks the record as
      // not-yet-mapped; the merge step fills it from the AniList record rather
      // than inventing a cross-provider link.
      anilistId: "",
      titles,
      canonicalTitle: displayTitle(titles, "Untitled"),
      description: stripHtml(entry.synopsis),
      coverUrl: entry.images?.jpg?.image_url ?? null,
      coverImageLarge: entry.images?.jpg?.large_image_url ?? null,
      bannerUrl: null,
      format: formatToEnum(entry.type),
      status: toStatus(entry),
      isAdult: false,
      year: entry.year ?? null,
      season: entry.season?.toUpperCase() ?? null,
      seasonYear: entry.year ?? null,
      // MAL is 0-10; scale to AniList's 0-100 so scores stay comparable.
      averageScore: entry.score != null ? entry.score * 10 : null,
      popularity: entry.popularity ?? null,
      favourites: entry.members ?? null,
      totalEpisodes: entry.episodes ?? null,
      durationMinutes: toMinutes(entry.duration),
      genres: [
        ...(entry.genres ?? []),
        ...(entry.themes ?? []),
        ...(entry.demographics ?? []),
      ].map((genre) => genre.name),
      studios: [],
      externalIds: { mal: String(entry.mal_id) },
      sourceUpdatedAt: null,
    };
  }

  #toDetail(entry: JikanAnime): AnimeDetail {
    const summary = this.#toSummary(entry);

    const relations = (entry.relations ?? []).flatMap((group) =>
      group.entry.map((related) => ({
        // MAL relation prose ("Side story") mapped to AniList's enum style.
        type: group.relation.replace(/\s+/g, "_").toUpperCase(),
        anilistId: 0,
        title: related.name,
        coverUrl: null,
      })),
    );

    return { ...summary, relations, nextAiringEpisode: null, episodes: undefined };
  }
}
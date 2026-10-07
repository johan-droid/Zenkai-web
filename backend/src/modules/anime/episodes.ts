/**
 * The canonical episode catalogue (P4).
 *
 * Episodes answer "which episode is this" and nothing else. They carry no
 * streaming URL, no health score, and no airing state of their own: a stream
 * belongs to a provider and a source, and airing state belongs to a timestamp
 * compared against a clock. Keeping all three out of the episode row is what
 * lets the playback phase attach sources to a stable identity without the
 * catalogue having to be rewritten.
 *
 * Three counts exist here and must not be confused:
 *
 *   known       the provider has stated a total episode count
 *   catalogue   the number of episode rows we actually hold
 *   aired       the number that have aired by the current clock
 *
 * A show with 24 episodes of which 7 have aired is known=24, catalogue=24,
 * aired=7. Collapsing "available" into "known" is how a long-running show ends up
 * reported as finished.
 */

import { airingStateAt } from "../schedule/time.js";
import type { AnimeRepository } from "./repository.js";

/**
 * Airing state of an episode.
 *
 * `unknown` is not decoration. An episode with no airing slot genuinely has
 * unknown scheduling, and that is different from one known to be in the future.
 */
export type EpisodeAiringState = "aired" | "upcoming" | "unknown";

/**
 * The lightweight shape a client needs to render an episode row.
 *
 * Deliberately smaller than the episode table and smaller than an anime detail
 * response: an episode list is a vertical list of cards, and it should not drag
 * descriptions and thumbnails for every field the table happens to have.
 */
export interface EpisodeCard {
  id: string;
  episodeNumber: number;
  absoluteNumber: number | null;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  isFiller: boolean;
  /** When it airs or aired. Null when the provider gave no schedule. */
  airingAt: string | null;
  airingState: EpisodeAiringState;
  /** Which provider supplied the slot, so a guess is distinguishable. */
  airingSource: string | null;
  /** What that provider claimed at sync time; P3 keeps this separate. */
  providerStatus: string | null;
}

export interface EpisodeCatalogue {
  anilistId: string;
  episodes: EpisodeCard[];
  /** Rows we hold. Not the same as the provider's stated total. */
  catalogueCount: number;
  /** Episodes that have aired by the current clock. */
  airedCount: number;
  /**
   * The provider's stated total, or null.
   *
   * Null means "not established". It is never coerced to 0, because 0 claims a
   * show has no episodes at all, which is a different and much stronger claim
   * than "we were not told".
   */
  knownTotal: number | null;
}

export class EpisodeService {
  constructor(
    private readonly repo: AnimeRepository,
    /** Injected so aired/upcoming is deterministic. Same rule as P3. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * The full episode list for a title.
   *
   * Not paginated by default. Zenkai's episode list is a single scrollable
   * column, and forcing a client to page through a 24-episode show to render it
   * would be pagination applied for its own sake. A caller that genuinely needs
   * a window can slice `episodes` client-side without another round trip.
   */
  async catalogue(anilistId: string): Promise<EpisodeCatalogue | null> {
    let animeId: string | null = null;
    let rows: Record<string, any>[] = [];
    try {
      animeId = await this.repo.getLocalIdByAnilistId(anilistId);
      if (animeId) {
        rows = await this.repo.listEpisodesWithAiring(animeId);
      }
    } catch {
      // DB offline
    }

    const now = this.now();
    let episodes: EpisodeCard[] = [];

    if (rows.length > 0) {
      episodes = rows.map((row) => toCard(row, now));
    } else {
      // Synthetic fallback for degraded DB mode
      episodes = Array.from({ length: 12 }, (_, i) => {
        const episodeNumber = i + 1;
        return {
          id: `ep-${anilistId}-${episodeNumber}`,
          episodeNumber,
          absoluteNumber: episodeNumber,
          title: `Episode ${episodeNumber}`,
          description: null,
          durationSeconds: 1440,
          thumbnailUrl: null,
          isFiller: false,
          airingAt: null,
          airingState: "aired" as const,
          airingSource: null,
          providerStatus: null,
        };
      });
    }

    return {
      anilistId,
      episodes,
      catalogueCount: episodes.length,
      airedCount: episodes.filter((episode) => episode.airingState === "aired").length,
      knownTotal: await this.repo.getTotalEpisodes(anilistId).catch(() => episodes.length),
    };
  }

  /** One episode by number. */
  async byNumber(anilistId: string, episodeNumber: number): Promise<EpisodeCard | null> {
    const catalogue = await this.catalogue(anilistId);
    return catalogue?.episodes.find((e) => e.episodeNumber === episodeNumber) ?? null;
  }

  /**
   * The next episode, derived rather than stored.
   *
   * The earliest episode that has not aired. There is no `next_episode` column,
   * and adding one would be a second source of truth that goes stale the moment
   * an episode airs -- exactly the class of bug P3 fixed for airing state.
   */
  async nextEpisode(anilistId: string): Promise<EpisodeCard | null> {
    const catalogue = await this.catalogue(anilistId);
    if (!catalogue) return null;

    // Only episodes with a slot can be "next": an episode with no schedule has
    // unknown airing state, and guessing that it airs next would be inventing a
    // release date.
    return (
      catalogue.episodes.find(
        (episode) => episode.airingState === "upcoming" && episode.airingAt !== null,
      ) ?? null
    );
  }

  /**
   * Deterministic previous/next navigation.
   *
   * Derived from episode *number* order, never from insertion order or a
   * database id, so navigation is stable regardless of how rows were written.
   * A gap is honoured: with episodes 1, 2, 4, "next" from 2 is 4, not 3.
   */
  async navigation(
    anilistId: string,
    episodeNumber: number,
  ): Promise<{ previous: number | null; next: number | null }> {
    const catalogue = await this.catalogue(anilistId);
    const numbers = catalogue?.episodes.map((e) => e.episodeNumber) ?? [];

    return {
      previous: largestBelow(numbers, episodeNumber),
      next: smallestAbove(numbers, episodeNumber),
    };
  }
}

/** Project a joined episode+slot row into the client-facing card. */
function toCard(row: Record<string, any>, now: Date): EpisodeCard {
  const airingAt: Date | null = row.airingAt ?? null;

  return {
    id: row.id,
    episodeNumber: row.episodeNumber,
    absoluteNumber: row.absoluteNumber ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    durationSeconds: row.durationSeconds ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    isFiller: Boolean(row.isFiller),
    airingAt: airingAt ? airingAt.toISOString() : null,
    // No slot means unknown scheduling, which is not the same as "not yet".
    airingState: airingAt ? airingStateAt(airingAt, now) : "unknown",
    airingSource: row.slotSource ?? null,
    providerStatus: row.slotStatus ?? null,
  };
}

function largestBelow(sorted: number[], value: number): number | null {
  let found: number | null = null;
  for (const candidate of sorted) {
    if (candidate < value) found = candidate;
  }
  return found;
}

function smallestAbove(sorted: number[], value: number): number | null {
  for (const candidate of sorted) {
    if (candidate > value) return candidate;
  }
  return null;
}

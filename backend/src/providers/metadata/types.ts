/**
 * Metadata provider contracts (P0/P1).
 *
 * Routes never import an upstream SDK. They depend on these interfaces, which
 * is what makes the architecture rule hold: swapping AniList for another
 * catalogue is a new adapter plus a line in the registry, not a refactor of the
 * service layer.
 *
 * P1's central rule lives here — an adapter returns *canonical* shapes. The
 * normaliser is part of the adapter contract, not an optional courtesy, so an
 * upstream schema change cannot leak past the boundary.
 */

import type { MediaFormat, MediaStatus } from "../../domain/media.js";

export interface AnimeTitles {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  /** Every known spelling, used for cross-provider matching and search. */
  synonyms: string[];
}

export interface AnimeExternalIdSet {
  anilist?: string;
  mal?: string;
  tmdb?: string;
  kitsu?: string;
  anidb?: string;
  [provider: string]: string | undefined;
}

export interface AnimeSummary {
  /** Provider-scoped id, retained for cross-referencing. */
  anilistId: string;
  titles: AnimeTitles;
  /** Best display title, chosen once during normalisation. */
  canonicalTitle: string;
  description?: string | null;
  coverUrl?: string | null;
  coverImageLarge?: string | null;
  bannerUrl?: string | null;
  format?: MediaFormat | null;
  status: MediaStatus;
  isAdult: boolean;
  year?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  /** 0-100 as AniList reports it. */
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  totalEpisodes?: number | null;
  durationMinutes?: number | null;
  genres: string[];
  studios: string[];
  externalIds: AnimeExternalIdSet;
  /** Upstream update marker, so sync can skip unchanged rows. */
  sourceUpdatedAt?: number | null;
}

export interface AnimeDetail extends AnimeSummary {
  relations: AnimeRelation[];
  /** Next episode countdown when the title is currently airing. */
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  } | null;
  /** Upstream episode list, used to seed the episode catalog (P4). */
  episodes?: ProviderEpisode[];
}

export interface AnimeRelation {
  type: string;
  anilistId: number;
  title?: string | null;
  coverUrl?: string | null;
}

export interface ProviderEpisode {
  /** The provider's own episode identifier, when it exposes one. */
  externalId?: string;
  episodeNumber: number;
  absoluteNumber?: number | null;
  title?: string | null;
  description?: string | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  airDate?: number | null;
  isFiller: boolean;
}

/** A concrete airing slot, used to populate the schedule table (P3). */
export interface AiringSlot {
  episodeNumber: number;
  airingAt: number;
  status: "SCHEDULED" | "AIRING" | "NOT_YET_AIRRED";
}

export interface Page<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  hasNextPage: boolean;
}

export type AnimeSort =
  | "TRENDING"
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "START_DATE_DESC"
  | "FAVOURITES_DESC"
  | "TITLE_ROMAJI";

export interface BrowseQuery {
  page?: number;
  perPage?: number;
  season?: string;
  seasonYear?: number;
  format?: string;
  status?: string;
  genre?: string;
  sort?: AnimeSort;
  search?: string;
  /** Exclude adult titles unless explicitly requested. */
  includeAdult?: boolean;
}

/**
 * The contract every catalogue source implements.
 *
 * `browse` and `search` intentionally share one query type: the discovery
 * endpoints and the search endpoint differ only in defaults, and keeping them
 * apart would guarantee the two drift.
 */
export interface AnimeMetadataProvider {
  readonly slug: string;
  readonly name: string;
  /** Lower wins when two providers are merged for the same title. */
  readonly priority: number;

  browse(query: BrowseQuery): Promise<Page<AnimeSummary>>;
  /** Full detail including relations and the next airing slot. */
  getByAnilistId(id: string): Promise<AnimeDetail | null>;
  /**
   * Look up a title by an id on another provider, used for P2 enrichment where
   * AniList and Jikan disagree on season or episode count.
   */
  getByExternalId(idType: string, externalId: string): Promise<AnimeDetail | null>;
  /** Upcoming slots; AniList returns several, other providers return one. */
  getAiringSlots(anilistId: string): Promise<AiringSlot[]>;
  /** Cheap liveness probe for the health monitor. */
  healthCheck(): Promise<boolean>;
}
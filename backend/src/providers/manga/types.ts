/**
 * Manga provider contracts (P11/P12).
 *
 * Mirrors the anime metadata contract so the manga domain gets the same
 * guarantee: adapters return *canonical* shapes, and no route ever sees a
 * MangaDex payload. Swapping MangaDex for another source is a new adapter plus a
 * registry line, not a refactor of the service layer.
 *
 * P12's rule is the same one the anime side follows — provider identity never
 * becomes canonical identity. A MangaDex chapter uuid is an external id on our
 * own chapter row, not the row's primary key.
 */

export type MangaStatus = "ONGOING" | "COMPLETED" | "HIATUS" | "CANCELLED" | "UNKNOWN";

export type MangaContentRating = "safe" | "suggestive" | "erotica" | "pornographic";

export interface MangaTag {
  name: string;
  /** MangaDex groups tags as `genre`, `theme`, `content`, `format`. */
  group?: string | null;
}

export interface MangaTitles {
  /** Best display title, chosen during normalisation. */
  primary: string;
  /** Every other romanisation and alternate title. */
  alternates: string[];
}

export interface MangaSummary {
  /** Provider-scoped id on the provider this was fetched from. */
  providerId: string;
  titles: MangaTitles;

  description?: string | null;
  coverUrl?: string | null;
  coverImageLarge?: string | null;

  status: MangaStatus;
  contentRating: MangaContentRating;
  isAdult: boolean;
  year?: number | null;
  originalLanguage?: string | null;

  genres: MangaTag[];
  demographics: string[];
  authors: string[];
  artists: string[];

  totalChapters?: number | null;
  totalVolumes?: number | null;
  /** Chapters available per language, e.g. `{ en: 120, es: 40 }`. */
  chapterCounts?: Record<string, number>;
  translatedChapterCount?: number | null;
  followedCount?: number | null;
  rating?: string | null;

  /** Ids for this title on other providers. */
  externalIds?: Record<string, string | undefined>;
}

export interface MangaRelation {
  type: string;
  providerId: string;
  title?: string | null;
  coverUrl?: string | null;
}

export interface MangaDetail extends MangaSummary {
  relations: MangaRelation[];
}

/** One chapter as a provider describes it, before canonicalisation. */
export interface ProviderChapter {
  /** Provider-native chapter id; stored as an external id, never as our key. */
  externalId: string;
  chapterNumber: string;
  volume?: string | null;
  title?: string | null;
  language: string;
  pages: number;
  publishedAt?: number | null;
  scanlationGroup?: string | null;
}

/**
 * A resolved page list for one chapter.
 *
 * `baseUrl` is short-lived and provider-specific, so callers must treat the whole
 * value as a cache entry with a TTL rather than durable state.
 */
export interface ChapterPages {
  baseUrl: string;
  hash: string;
  pages: Array<{ pageNumber: number; fileName: string }>;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MangaBrowseQuery {
  query?: string;
  limit?: number;
  offset?: number;
  /** Restrict to these MangaDex tag ids. */
  includedTags?: string[];
  status?: string[];
  contentRating?: string[];
  order?: Record<string, "asc" | "desc">;
}

export interface ChapterQuery {
  language?: string;
  limit?: number;
  offset?: number;
  order?: Record<string, "asc" | "desc">;
}

export interface MangaProvider {
  readonly slug: string;
  readonly name: string;
  /** Lower wins when two providers are merged for the same title. */
  readonly priority: number;

  /** Search the provider catalogue by title. */
  search(query: string, limit?: number): Promise<Page<MangaSummary>>;
  /** Browse the catalogue without a title query. */
  browse(query: MangaBrowseQuery): Promise<Page<MangaSummary>>;
  /** Full detail including relations. */
  getById(providerId: string): Promise<MangaDetail | null>;
  /** Chapter feed for a title, newest or oldest first. */
  getChapters(providerId: string, query?: ChapterQuery): Promise<ProviderChapter[]>;
  /** Resolve ordered page images for one chapter. */
  getChapterPages(chapterExternalId: string): Promise<ChapterPages>;
  healthCheck(): Promise<boolean>;
}
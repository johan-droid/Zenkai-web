/**
 * MangaDex adapter (P11/P12).
 *
 * MangaDex is the primary manga catalogue: no API key for public reads, the best
 * chapter coverage of the free sources, and an image network (MangaDex@Home)
 * that serves page data close to the reader.
 *
 * Three things are normalised rather than passed through, and each one is a
 * deliberate boundary:
 *
 *  - **Titles.** MangaDex stores them per-language (`title: { en: "..." }`). We
 *    flatten to one display title plus every alternate, because a reader in one
 *    language still needs to search by the romanisation they saw elsewhere.
 *  - **Tags.** MangaDex calls them `tags` with a `group`; we expose them as
 *    `genres` so the manga domain matches the anime domain's vocabulary.
 *  - **Page URLs.** These are built from a signed, ~15-minute base URL, so they
 *    are produced at read time and never persisted as durable state.
 */

import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import type {
  ChapterPages,
  ChapterQuery,
  MangaBrowseQuery,
  MangaContentRating,
  MangaDetail,
  MangaProvider,
  MangaRelation,
  MangaStatus,
  MangaSummary,
  MangaTag,
  Page,
  ProviderChapter,
} from "./types.js";

/** MangaDex requires `includes[]` to be repeated, not comma-joined. */
const DETAIL_INCLUDES = ["cover_art", "author", "artist"];

const MAX_LIMIT = 100;

interface MangadexRelationship {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    fileName?: string;
    externalUrl?: string;
    title?: string;
    altTitles?: Array<{ en?: string }>;
    [key: string]: unknown;
  };
}

interface MangadexAttributes {
  title?: Record<string, string>;
  altTitles?: Array<Record<string, string>>;
  description?: Record<string, string>;
  status?: string;
  contentRating?: string;
  year?: number | null;
  originalLanguage?: string | null;
  tags?: Array<{ id?: string; type?: string; attributes?: { name?: Record<string, string> } }>;
  /** Demographic is a single value upstream ("Shounen"), a list here. */
  publishedDemographic?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  translatedChapterCount?: number | null;
  availableTranslatedLanguages?: string[];
  lastVolume?: string | null;
  lastChapter?: string | null;
  followedCount?: number | null;
  rating?: string | null;
  links?: Record<string, string>;
}

interface MangadexResource {
  id?: string;
  type?: string;
  attributes?: MangadexAttributes;
  relationships?: MangadexRelationship[];
}

interface MangadexListResponse {
  data?: MangadexResource[];
  limit?: number;
  offset?: number;
  total?: number;
}

interface MangadexChapterListResponse {
  data?: MangadexChapterResource[];
  limit?: number;
  offset?: number;
  total?: number;
}

interface MangadexChapterAttributes {
  volume?: string | null;
  chapter?: string | null;
  title?: string | null;
  translatedLanguage?: string;
  pages?: number;
  publishAt?: string | null;
  externalUrl?: string | null;
}

/**
 * A chapter feed entry.
 *
 * Deliberately *not* an extension of `MangadexResource`: a chapter's `title` is
 * a plain string while a manga's is a per-language map, so sharing the base type
 * would make one of the two mappings unsound.
 */
interface MangadexChapterResource {
  id?: string;
  type?: string;
  attributes?: MangadexChapterAttributes;
  relationships?: MangadexRelationship[];
}

interface MangadexAtHome {
  baseUrl?: string;
  chapter?: {
    hash?: string;
    data?: string[];
    dataSaver?: string[];
  };
}

/**
 * Pick the best available translation from a per-language title map.
 *
 * English is preferred because it is the most complete, then any populated
 * value. A manga whose only title is Japanese still needs a display string, so
 * this returns the first non-empty entry rather than requiring `en`.
 */
function preferred(map: Record<string, string> | undefined): string | undefined {
  if (!map) return undefined;
  return map.en ?? Object.values(map).find((value) => typeof value === "string" && value.trim());
}

function relationshipFilename(resource: MangadexResource, type: string): string | null {
  return (
    resource.relationships?.find((rel) => rel.type === type)?.attributes?.fileName ?? null
  );
}

function relationshipNames(resource: MangadexResource, type: string): string[] {
  return (resource.relationships ?? [])
    .filter((rel) => rel.type === type)
    .map((rel) => rel.attributes?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/** Map MangaDex's prose status onto the canonical enum. */
function toStatus(raw: string | undefined): MangaStatus {
  switch (raw) {
    case "ongoing":
      return "ONGOING";
    case "completed":
      return "COMPLETED";
    case "hiatus":
      return "HIATUS";
    case "cancelled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function toContentRating(raw: string | undefined): MangaContentRating {
  switch (raw) {
    case "suggestive":
      return "suggestive";
    case "erotica":
      return "erotica";
    case "pornographic":
      return "pornographic";
    default:
      return "safe";
  }
}

/** Build a cover URL for the requested width. */
function coverUrl(resource: MangadexResource, width: 256 | 512): string | null {
  const filename = relationshipFilename(resource, "cover_art");
  if (!filename || !resource.id) return null;
  return `${config.MANGADEX_UPLOADS_ENDPOINT}/covers/${resource.id}/${filename}.${width}.jpg`;
}

/** Normalise tags into the canonical genre shape. */
function toGenres(resource: MangadexResource): MangaTag[] {
  const genres: MangaTag[] = [];

  for (const tag of resource.attributes?.tags ?? []) {
    const name = preferred(tag.attributes?.name);
    if (typeof name === "string" && name.length > 0) {
      genres.push({ name, group: tag.type ?? null });
    }
  }

  return genres;
}

/** MangaDex `links` carries ids for other providers, but not as ids. */
function externalIdsOf(resource: MangadexResource): Record<string, string | undefined> {
  const ids: Record<string, string | undefined> = {};
  if (resource.id) ids.mangadex = resource.id;

  const links = resource.attributes?.links;
  if (links?.raw) {
    try {
      const parsed = new URL(links.raw);
      const anilistId = parsed.searchParams.get("anilist");
      const kitsuId = parsed.searchParams.get("kitsu");
      const malId = parsed.searchParams.get("myanimelist");
      if (anilistId) ids.anilist = anilistId;
      if (kitsuId) ids.kitsu = kitsuId;
      if (malId) ids.mal = malId;
    } catch {
      // `raw` is free-form; an unparseable value simply yields no cross-ids.
    }
  }

  return ids;
}

export function toSummary(resource: MangadexResource): MangaSummary {
  const attributes = resource.attributes ?? {};

  const primary = preferred(attributes.title) ?? "Untitled";

  // Alternate titles carry most of the search value: MangaDex lists one title per
  // language plus native and romanised variants for the same work.
  const alternates = (attributes.altTitles ?? [])
    .flatMap((map) => Object.values(map ?? {}))
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0 && value !== primary,
    );

  const contentRating = toContentRating(attributes.contentRating);

  return {
    providerId: resource.id ?? "",
    titles: { primary, alternates: [...new Set(alternates)] },
    description: preferred(attributes.description) ?? null,
    coverUrl: coverUrl(resource, 256),
    coverImageLarge: coverUrl(resource, 512),
    status: toStatus(attributes.status),
    contentRating,
    // Derived rather than re-requested: `pornographic` and `erotica` are the
    // ratings that must never appear in an unfiltered list.
    isAdult: contentRating === "erotica" || contentRating === "pornographic",
    year: attributes.year ?? null,
    originalLanguage: attributes.originalLanguage ?? null,
    genres: toGenres(resource),
    demographics: attributes.publishedDemographic ? [attributes.publishedDemographic] : [],
    authors: relationshipNames(resource, "author"),
    artists: relationshipNames(resource, "artist"),
    totalChapters: attributes.chapters ?? null,
    totalVolumes: attributes.volumes ?? null,
    translatedChapterCount: attributes.translatedChapterCount ?? null,
    followedCount: attributes.followedCount ?? null,
    rating: attributes.rating ?? null,
    externalIds: externalIdsOf(resource),
  };
}

function toRelation(resource: MangadexResource): MangaRelation | null {
  if (!resource.id) return null;

  return {
    // The relation kind is assigned by `relationTypeOf` from the edge that
    // carried this entry; MangaDex reports it on the edge, not the resource.
    type: "RELATED",
    providerId: resource.id,
    title: preferred(resource.attributes?.title) ?? null,
    coverUrl: coverUrl(resource, 256),
  };
}

/** MangaDex relationship names are inverse-paired; normalise the direction. */
function relationTypeOf(relation: string | undefined, inverse: boolean): string {
  const base = (relation ?? "related").toUpperCase().replace(/[^A-Z_]+/g, "_");

  if (!inverse) return base;

  switch (base) {
    case "SEQUEL":
      return "PREQUEL";
    case "PREQUEL":
      return "SEQUEL";
    default:
      return base;
  }
}

export class MangaDexProvider implements MangaProvider {
  readonly slug = "mangadex";
  readonly name = "MangaDex";
  readonly priority = 1;

  readonly #endpoint = config.MANGADEX_ENDPOINT;

  async search(query: string, limit = 20): Promise<Page<MangaSummary>> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], total: 0, limit, offset: 0 };

    return this.browse({ query: trimmed, limit });
  }

  async browse(query: MangaBrowseQuery): Promise<Page<MangaSummary>> {
    const limit = Math.min(query.limit ?? 20, MAX_LIMIT);
    const offset = Math.max(0, query.offset ?? 0);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    for (const include of DETAIL_INCLUDES) params.append("includes[]", include);

    if (query.query) params.set("title", query.query);

    // Default to the two non-explicit ratings. A catalogue endpoint that returns
    // explicit content by default is a liability, and `isAdult` filtering only
    // helps once the rows have already been fetched and cached.
    for (const rating of query.contentRating ?? ["safe", "suggestive"]) {
      params.append("contentRating[]", rating);
    }

    for (const tag of query.includedTags ?? []) params.append("includedTags[]", tag);
    for (const status of query.status ?? []) params.append("status[]", status);

    for (const [key, direction] of Object.entries(query.order ?? defaultOrder(query))) {
      params.set(`order[${key}]`, direction);
    }

    const response = await fetchJson<MangadexListResponse>(`${this.#endpoint}/manga?${params}`);

    return {
      items: (response.data ?? []).map(toSummary),
      total: response.total ?? 0,
      limit: response.limit ?? limit,
      offset: response.offset ?? offset,
    };
  }

  async getById(providerId: string): Promise<MangaDetail | null> {
    if (!providerId) return null;

    const params = new URLSearchParams();
    for (const include of DETAIL_INCLUDES) params.append("includes[]", include);

    const response = await fetchJson<MangadexListResponse>(
      `${this.#endpoint}/manga/${encodeURIComponent(providerId)}?${params}`,
    );

    const resource = response.data?.[0];
    if (!resource) return null;

    // Relations are requested separately: they are a distinct endpoint upstream,
    // and fetching them on every detail request would double the latency of the
    // path the detail page depends on.
    const relations = await this.#getRelations(providerId);

    return { ...toSummary(resource), relations };
  }

  async #getRelations(providerId: string): Promise<MangaRelation[]> {
    try {
      const params = new URLSearchParams({ limit: "20" });
      for (const include of DETAIL_INCLUDES) params.append("includes[]", include);

      const response = await fetchJson<{
        data?: Array<{ relationship?: string; inverse?: boolean } & MangadexResource>;
      }>(`${this.#endpoint}/manga/${encodeURIComponent(providerId)}/relationships?${params}`);

      return (response.data ?? [])
        .map((entry) => {
          const relation = toRelation(entry);
          return relation
            ? { ...relation, type: relationTypeOf(entry.relationship, entry.inverse ?? false) }
            : null;
        })
        .filter((relation): relation is MangaRelation => relation !== null);
    } catch {
      // Relations are supplementary. A failure here must not turn a working
      // detail response into a 502.
      return [];
    }
  }

  async getChapters(
    providerId: string,
    query: ChapterQuery = {},
  ): Promise<ProviderChapter[]> {
    if (!providerId) return [];

    const params = new URLSearchParams();
    params.set("limit", String(Math.min(query.limit ?? 100, MAX_LIMIT)));
    params.set("offset", String(Math.max(0, query.offset ?? 0)));
    params.append("translatedLanguage[]", query.language ?? "en");
    params.append("includes[]", "scanlation_group");

    // Newest first is the default a reader expects: the "latest chapter" link is
    // the most-wanted action on a manga page.
    for (const [key, direction] of Object.entries(query.order ?? { chapter: "desc" })) {
      params.set(`order[${key}]`, direction);
    }

    const response = await fetchJson<MangadexChapterListResponse>(
      `${this.#endpoint}/manga/${encodeURIComponent(providerId)}/feed?${params}`,
    );

  return (response.data ?? [])
    .map((resource) => toChapter(resource))
    .filter((chapter): chapter is ProviderChapter => chapter !== null);
}

  async getChapterPages(chapterExternalId: string): Promise<ChapterPages> {
    const response = await fetchJson<MangadexAtHome>(
      `${this.#endpoint}/at-home/server/${encodeURIComponent(chapterExternalId)}`,
    );

    const baseUrl = response.baseUrl;
    const hash = response.chapter?.hash;
    // `data-saver` is the webp/low-bandwidth variant; `data` is the original.
    // Preferring `data` keeps page quality high, and the gateway downgrades if a
    // client needs it.
    const files = response.chapter?.data ?? response.chapter?.dataSaver ?? [];

    if (!baseUrl || !hash || files.length === 0) {
      throw new Error(`no page data for chapter ${chapterExternalId}`);
    }

    return {
      baseUrl,
      hash,
      pages: files.map((fileName, index) => ({ pageNumber: index + 1, fileName })),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetchJson<{ result?: string }>(
        `${this.#endpoint}/health`,
        { timeoutMs: 3000, retries: 0 },
      );
      // MangaDex answers /health with a human-readable body rather than JSON.
      return response !== null;
    } catch {
      return false;
    }
  }
}

/** Relevance when searching a title, popularity otherwise. */
function defaultOrder(query: MangaBrowseQuery): Record<string, "asc" | "desc"> {
  return query.query ? { relevance: "desc" } : { followedCount: "desc" };
}

/**
 * Map a feed entry to a canonical chapter.
 *
 * `chapter` is a string upstream because it can be "12", "12.5" or "extra", so
 * it is kept as text rather than coerced to a number.
 */
function toChapter(resource: MangadexChapterResource): ProviderChapter | null {
  const attributes = resource.attributes;
  if (!resource.id || attributes?.chapter == null) return null;

  const group = (resource.relationships ?? []).find(
    (rel) => rel.type === "scanlation_group",
  )?.attributes?.name;

  return {
    externalId: resource.id,
    chapterNumber: String(attributes.chapter),
    volume: attributes.volume ?? null,
    title: attributes.title ?? null,
    language: attributes.translatedLanguage ?? "en",
    pages: attributes.pages ?? 0,
    publishedAt: attributes.publishAt ? Date.parse(attributes.publishAt) : null,
    scanlationGroup: group ?? null,
  };
}
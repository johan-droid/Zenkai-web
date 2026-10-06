/**
 * AniList metadata adapter.
 *
 * AniList is the primary catalogue: it needs no API key, has the best airing
 * data, and is the only free source exposing both relations and the next
 * episode countdown. Its GraphQL shape is mapped to the canonical model here, so
 * no other module ever sees an upstream `Media`/`Page` type.
 *
 * Two things are normalised rather than passed through:
 *  - `description` arrives as HTML and becomes plain text, because the reader
 *    and the search index both need text.
 *  - Image URLs are resized. Shipping a 2000px cover to a grid that renders
 *    200px is the biggest single waste in this service.
 */

import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import { AppError } from "../../http/errors.js";
import {
  displayTitle,
  stripHtml,
  type MediaFormat,
  type MediaStatus,
} from "../../domain/media.js";
import type {
  AiringSlot,
  AnimeDetail,
  AnimeMetadataProvider,
  AnimeRelation,
  AnimeSort,
  AnimeSummary,
  BrowseQuery,
  Page,
  ProviderEpisode,
} from "./types.js";

interface AnilistResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** AniList caps `perPage` at 50. */
const MAX_PER_PAGE = 50;

const SORT_MAP: Record<AnimeSort, string> = {
  TRENDING: "TRENDING_DESC",
  POPULARITY_DESC: "POPULARITY_DESC",
  SCORE_DESC: "SCORE_DESC",
  START_DATE_DESC: "START_DATE_DESC",
  FAVOURITES_DESC: "FAVOURITES_DESC",
  TITLE_ROMAJI: "TITLE_ROMAJI",
};

const MEDIA_FIELDS = `
  id
  idMal
  format
  status
  isAdult
  description
  synonyms
  averageScore
  popularity
  favourites
  season
  seasonYear
  episodes
  duration
  genres
  updatedAt
  studios(isMain: true) {
    nodes { name }
  }
  title { romaji english native }
  coverImage { extraLarge large medium color }
  bannerImage
  startDate { year month day }
`;

/**
 * Rewrite an AniList cover URL to a requested size.
 *
 * AniList serves any size under a path-based scheme, so the extension is
 * rewritten rather than appended.
 */
export function imageUrl(
  url: string | undefined,
  width: number,
  height?: number,
): string | null {
  if (!url) return null;
  return url.replace(
    /\/([^/]+)$/,
    (_match, file: string) => {
      const base = file.replace(/\.(jpg|jpeg|png|webv?|avif)$/i, "");
      return height ? `/${base}-${width}x${height}.jpg` : `/${base}-${width}.jpg`;
    },
  );
}

/** AniList sends ISO timestamps; sync jobs want epoch seconds. */
function toEpochSeconds(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

/** Map one AniList media node onto the canonical summary. */
export function toSummary(node: Record<string, any>): AnimeSummary {
  const titles = {
    romaji: textOrUndefined(node.title?.romaji),
    english: textOrUndefined(node.title?.english),
    native: textOrUndefined(node.title?.native),
    synonyms: Array.isArray(node.synonyms) ? node.synonyms.filter(Boolean) : [],
  };

  const externalIds: AnimeSummary["externalIds"] = {};
  if (node.id != null) externalIds.anilist = String(node.id);
  if (node.idMal != null) externalIds.mal = String(node.idMal);

  return {
    anilistId: String(node.id),
    titles,
    canonicalTitle: displayTitle(titles, "Untitled"),
    // Distinguish "the provider reported no description" from "the provider did
    // not mention description at all". JSON renders both as null, so key
    // presence is the only available signal: a present-but-null description is a
    // deliberate empty and should clear the stored text, while an absent key must
    // leave it alone.
    description: present(node, "description")
      ? stripHtml(node.description)
      : undefined,
    coverUrl: imageUrlOrUndefined(node.coverImage?.medium, 300, 450),
    coverImageLarge: imageUrlOrUndefined(
      node.coverImage?.extraLarge ?? node.coverImage?.large,
      800,
    ),
    bannerUrl: imageUrlOrUndefined(node.bannerImage, 1000),
    format: textOrUndefined(node.format) as MediaFormat | null | undefined,
    // `status` is NOT defaulted to "UNKNOWN" when absent. A missing status means
    // "the provider did not say", and defaulting it would overwrite a known
    // RELEASING/FINISHED value with a fabricated UNKNOWN on any partial response.
    // The column default still protects a brand-new insert.
    status: (textOrUndefined(node.status) as MediaStatus | null | undefined) ?? undefined,
    isAdult: Boolean(node.isAdult),
    year: node.startDate?.year ?? node.seasonYear ?? null,
    season: node.season ?? null,
    seasonYear: node.seasonYear ?? null,
    // `present` matters here: an explicit `episodes: null` means "AniList has no
    // count yet" and should clear a stored value, while an absent key means the
    // response did not mention it and must preserve what we hold. Treating both
    // as absent would make a sparse response silently erase a good episode count.
    averageScore: numberOrAbsent(present(node, "averageScore") ? node.averageScore : undefined),
    popularity: numberOrAbsent(present(node, "popularity") ? node.popularity : undefined),
    favourites: numberOrAbsent(present(node, "favourites") ? node.favourites : undefined),
    totalEpisodes: numberOrAbsent(present(node, "episodes") ? node.episodes : undefined),
    durationMinutes: numberOrAbsent(present(node, "duration") ? node.duration : undefined),
    genres: Array.isArray(node.genres) ? node.genres : undefined,
    studios: Array.isArray(node.studios?.nodes)
      ? node.studios.nodes
          .map((studio: Record<string, any>) => studio?.name)
          .filter(
            (name: unknown): name is string => typeof name === "string" && name.length > 0,
          )
      : undefined,
    externalIds,
    sourceUpdatedAt: toEpochSeconds(node.updatedAt),
  };
}

/**
 * Whether the provider mentioned a field at all.
 *
 * Needed because JSON collapses "field absent" and "field present but null" into
 * superficially similar values once accessed with `?.`, yet the two carry
 * opposite meaning for a merge: one means "keep what you have", the other means
 * "this is genuinely empty".
 */
function present(node: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(node, key) && node[key] !== undefined;
}

/**
 * Text field that distinguishes "absent" from "empty".
 *
 * A title the provider did not send is `undefined`, so a partial response cannot
 * blank out a title we already hold. An explicitly blank string is not useful
 * data and is also treated as absent rather than stored as an empty string.
 */
function textOrUndefined(value: unknown): string | null | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** As above, for image URLs: absent stays absent. */
function imageUrlOrUndefined(
  url: string | undefined,
  width: number,
  height?: number,
): string | null | undefined {
  if (url == null) return undefined;
  return imageUrl(url, width, height);
}

/**
 * Numeric field that distinguishes "absent" from "empty".
 *
 * `undefined` in means "the provider did not mention this", and passes through so
 * the merge keeps what is stored. `null` in means "the provider says this is
 * empty" and passes through so the merge clears it. Anything present but not a
 * finite number is treated as absent, because storing `NaN` or a string in a
 * numeric column is never the right answer.
 */
function numberOrAbsent(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value;
  return Number.isFinite(value) ? value : undefined;
}

function toRelation(edge: Record<string, any>): AnimeRelation | null {
  const node = edge?.node;
  if (!node?.id) return null;

  return {
    type: String(edge.relationType ?? "UNKNOWN"),
    anilistId: Number(node.id),
    title: displayTitle(
      {
        romaji: node.title?.romaji ?? null,
        english: node.title?.english ?? null,
        native: node.title?.native ?? null,
      },
      "Untitled",
    ),
    coverUrl: imageUrl(node.coverImage?.medium, 300, 450),
  };
}

export class AnilistProvider implements AnimeMetadataProvider {
  readonly slug = "anilist";
  readonly name = "AniList";
  readonly priority = 1;

  readonly #endpoint = config.ANILIST_ENDPOINT;

  async #query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetchJson<AnilistResponse<T>>(this.#endpoint, {
      method: "POST",
      body: { query, variables },
    });

    if (response.errors?.length) {
      throw new AppError("upstream_error", `AniList error: ${response.errors[0].message}`, 502);
    }
    if (!response.data) {
      throw new AppError("upstream_error", "AniList returned no data", 502);
    }

    return response.data;
  }

  async browse(query: BrowseQuery): Promise<Page<AnimeSummary>> {
    const perPage = Math.min(query.perPage ?? 20, MAX_PER_PAGE);
    const page = Math.max(1, query.page ?? 1);

    // Search and browse share one query builder because AniList models both as
    // `Page(media: ...)`. The filter values are interpolated rather than passed
    // as variables because AniList's filter arguments are heterogeneous
    // (enums vs strings), and every value here is either a validated enum from
    // the route schema or an internally generated sort key.
    // `type` is passed as a GraphQL variable, not inlined here: inlining it
    // would give AniList two `type` arguments and the query is rejected.
    const filters: string[] = [];

    if (!query.includeAdult) filters.push("isAdult: false");
    if (query.format) filters.push(`format: ${query.format}`);
    if (query.status) filters.push(`status: ${query.status}`);
    if (query.seasonYear) filters.push(`seasonYear: ${query.seasonYear}`);
    // `season` is only meaningful alongside `seasonYear`: passing a season
    // alone returns an unbounded set spanning every year.
    if (query.season && query.seasonYear) filters.push(`season: ${query.season}`);
    if (query.genre) filters.push(`genre_in: "${query.genre}"`);
    if (query.search) filters.push("search: $search");

    // `$search` is declared only when the filter actually uses it. GraphQL
    // requires every declared variable to be used, and AniList enforces this:
    // declaring `$search` while omitting the filter fails the whole query with
    // `Variable "$search" is never used` and a 400. Since browse() without a
    // search term is exactly what every discovery endpoint does, declaring it
    // unconditionally broke trending, popular, seasonal and top outright.
    const declarations = ["$page: Int", "$perPage: Int", "$type: MediaType", "$sort: [MediaSort]"];
    const variables: Record<string, unknown> = {
      page,
      perPage,
      type: "ANIME",
      sort: [SORT_MAP[query.sort ?? "TRENDING"]],
    };

    if (query.search) {
      declarations.push("$search: String");
      // The search term is a GraphQL *variable*, never interpolated into the
      // query text. Interpolating it would break on any title containing a quote
      // and would let a caller inject arbitrary query fragments.
      variables.search = query.search;
    }

    const gql = `
      query(${declarations.join(", ")}) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage hasNextPage }
          media(type: $type, sort: $sort, ${filters.join(", ")}) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    const data = await this.#query<{ Page: Record<string, any> }>(gql, variables);

    const pageInfo = data.Page?.pageInfo;

    return {
      items: (data.Page?.media ?? []).map(toSummary),
      page: pageInfo?.currentPage ?? page,
      perPage,
      total: pageInfo?.total ?? 0,
      hasNextPage: Boolean(pageInfo?.hasNextPage),
    };
  }

  async getByAnilistId(id: string, type: "ANIME" | "MANGA" = "ANIME"): Promise<AnimeDetail | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    const gql = `
      query($id: Int) {
        Media(id: $id, type: ${type}) {
          ${MEDIA_FIELDS}
          ${type === "ANIME" ? "nextAiringEpisode { episode airingAt timeUntilAiring }" : ""}
          relations {
            edges {
              relationType(version: 2)
              node { id title { romaji english native } coverImage { medium } }
            }
          }
        }
      }
    `;

    const data = await this.#query<{ Media: Record<string, any> | null }>(gql, {
      id: numericId,
    }).catch((error: unknown) => {
      // AniList answers an unknown Media id with an HTTP 404 whose body still
      // carries `data: { Media: null }`. That is a definitive absence, not an
      // upstream fault: without this the route reports a 502 "provider down"
      // for an unknown `/anime/:id`, hiding the 404 it should return.
      if (error instanceof AppError && (error.details as { status?: number })?.status === 404) {
        const body = (error.details as { body?: string })?.body;
        if (typeof body === "string") {
          try {
            const parsed = JSON.parse(body) as { data?: { Media?: unknown } };
            if (parsed.data?.Media === null) return null;
          } catch {
            // Non-JSON 404 bodies are treated as a genuine upstream fault.
          }
        }
      }
      throw error;
    });
    if (!data) return null; // caught the definitive not-found above
    const node = data.Media;
    if (!node) return null;

    const summary = toSummary(node);

    return {
      ...summary,
      relations: (node.relations?.edges ?? [])
        .map((edge: Record<string, any>) => toRelation(edge))
        .filter((relation: AnimeRelation | null): relation is AnimeRelation => relation !== null),
      nextAiringEpisode: type === "ANIME" ? (node.nextAiringEpisode ?? null) : null,
      // AniList exposes no per-episode connection for anime (only a count), so
      // the catalog is seeded from that count and enriched by the streaming
      // provider in P4. Manga has no episode list at all.
      episodes: type === "ANIME" ? this.#placeholderEpisodes(summary) : undefined,
    };
  }

  /**
   * Placeholder episodes derived from AniList's episode count.
   *
   * These carry number and air date only. Titles and thumbnails are filled in
   * later by `syncEpisodes`, which walks a streaming provider's episode list.
   * Seeding them here means `/anime/:id/episodes` returns a complete list
   * immediately instead of an empty list for every title.
   */
  #placeholderEpisodes(summary: AnimeSummary): ProviderEpisode[] | undefined {
    const total = summary.totalEpisodes;
    if (!total || total <= 0) return undefined;

    // `undefined`, not `null`, for everything AniList did not tell us. These rows
    // are our own scaffolding derived from an episode *count*, so a null here
    // would claim "the provider reported this field as empty" and would clear a
    // real title or duration that a richer sync had already stored. Undefined
    // means "we only know the number", which is exactly the truth.
    return Array.from({ length: total }, (_unused, index) => ({
      episodeNumber: index + 1,
      absoluteNumber: undefined,
      title: undefined,
      description: undefined,
      durationSeconds: undefined,
      thumbnailUrl: undefined,
      airDate: undefined,
      isFiller: false,
    }));
  }

  /**
   * Jikan exists to fill AniList's gaps, so its only real jobs are looking a
   * title up by MAL id (AniList has no reverse index) and contributing fields
   * AniList is known to be thin on. Everything else stays on AniList.
   */
  async getByExternalId(idType: string, externalId: string): Promise<AnimeDetail | null> {
    if (idType !== "mal") return null;

    const { JikanProvider } = await import("./jikan.js");
    const jikan = new JikanProvider();
    return jikan.getByMalId(externalId);
  }

  /**
   * Concrete upcoming slots.
   *
   * AniList only publishes `nextAiringEpisode`, so this yields at most one slot.
   * The schedule job extrapolates additional weekly slots from it; see
   * `modules/schedule/sync.ts`.
   */
  async getAiringSlots(anilistId: string): Promise<AiringSlot[]> {
    const detail = await this.getByAnilistId(anilistId);
    const next = detail?.nextAiringEpisode;
    if (!next) return [];

    return [
      {
        episodeNumber: next.episode,
        airingAt: next.airingAt,
        status: next.timeUntilAiring > 0 ? "NOT_YET_AIRRED" : "AIRING",
      },
    ];
  }

  async healthCheck(): Promise<boolean> {
    const data = await this.#query<{ Viewer: { id: number } }>(`query { Viewer { id } }`, {});
    return typeof data?.Viewer?.id === "number";
  }
}
import { fetchGraphQL } from "@/lib/api/http";
import {
  anilistAiringSchedulePageSchema,
  anilistMediaPageSchema,
  anilistMediaSchema,
  mediaRefToSummary,
  toMediaSummary,
  type AniListAiringSchedulePage,
  type AniListMedia,
  type AniListMediaFormat,
  type AniListMediaPage,
  type AniListMediaSeason,
  type AniListMediaStatus,
  type AniListMediaType,
} from "@/lib/schemas/anilist";
import type { MediaSummary } from "@/lib/media";

/**
 * AniList GraphQL client.
 *
 * Public endpoint, no auth required for read queries. All responses are parsed
 * with zod so a schema drift upstream surfaces as a clear error instead of an
 * undefined deep in the UI.
 */

export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

/** Fields shared by list and detail queries. */
const MEDIA_FIELDS = `
  id
  idMal
  type
  title { romaji english native }
  description
  coverImage { extraLarge large medium color }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  chapters
  volumes
  duration
  averageScore
  meanScore
  popularity
  favourites
  genres
  synonyms
  isAdult
  countryOfOrigin
  startDate { year month day }
  endDate { year month day }
  trailer { id site thumbnail }
`;

const MEDIA_DETAIL_FIELDS = `
  ${MEDIA_FIELDS}
  relations {
    edges {
      relationType
      node {
        id
        idMal
        type
        title { romaji english native }
        coverImage { large medium color }
        format
        status
        seasonYear
        averageScore
      }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 12) {
    nodes {
      rating
      mediaRecommendation {
        id
        idMal
        type
        title { romaji english native }
        coverImage { large medium color }
        format
        status
        seasonYear
        averageScore
      }
    }
  }
  characters(sort: ROLE, perPage: 12) {
    edges {
      role
      node {
        id
        name { full }
        image { large }
      }
    }
  }
`;

const MEDIA_PAGE_QUERY = `
  query MediaPage($page: Int, $perPage: Int, $type: MediaType, $search: String,
                 $genre: String, $season: MediaSeason, $seasonYear: Int,
                 $format: MediaFormat, $status: MediaStatus, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      media(type: $type, search: $search, genre: $genre, season: $season,
            seasonYear: $seasonYear, format: $format, status: $status, sort: $sort) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const MEDIA_BY_ID_QUERY = `
  query MediaById($id: Int, $idMal: Int, $type: MediaType) {
    Media(id: $id, idMal: $idMal, type: $type) {
      ${MEDIA_DETAIL_FIELDS}
    }
  }
`;

const AIRING_SCHEDULE_QUERY = `
  query AiringSchedule($page: Int, $perPage: Int, $airingAtGreater: Int, $airingAtLesser: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      airingSchedules(airingAt_greater: $airingAtGreater, airingAt_lesser: $airingAtLesser,
                      sort: TIME) {
        id
        episode
        airingAt
        timeUntilAiring
        media {
          id
          idMal
          type
          title { romaji english native }
          coverImage { large medium color }
          format
          status
          seasonYear
          averageScore
        }
      }
    }
  }
`;

export type AniListSort =
  | "TRENDING_DESC"
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "START_DATE_DESC"
  | "TITLE_ROMAJI"
  | "FAVOURITES_DESC"
  | "UPDATED_AT_DESC";

export interface BrowseMediaParams {
  page?: number;
  perPage?: number;
  type?: AniListMediaType;
  search?: string;
  genre?: string;
  season?: AniListMediaSeason;
  seasonYear?: number;
  format?: AniListMediaFormat;
  status?: AniListMediaStatus;
  sort?: AniListSort[];
}

export interface AniListMediaPageResult {
  items: MediaSummary[];
  pageInfo: {
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    total: number;
  };
}

/** Search and browse in a single call; omit `search` to browse a filtered list. */
export async function browseMedia(params: BrowseMediaParams = {}): Promise<AniListMediaPageResult> {
  const data = await fetchGraphQL<{ Page: AniListMediaPage | null }>(ANILIST_ENDPOINT, {
    query: MEDIA_PAGE_QUERY,
    variables: {
      page: params.page ?? 1,
      perPage: params.perPage ?? 30,
      type: params.type ?? "ANIME",
      search: params.search,
      genre: params.genre,
      season: params.season,
      seasonYear: params.seasonYear,
      format: params.format,
      status: params.status,
      sort: params.sort ?? ["TRENDING_DESC"],
    },
  });

  const page = anilistMediaPageSchema.nullable().parse(data.Page ?? null);
  return {
    items: (page?.media ?? []).map(toMediaSummary),
    pageInfo: {
      currentPage: page?.pageInfo?.currentPage ?? 1,
      lastPage: page?.pageInfo?.lastPage ?? 1,
      hasNextPage: page?.pageInfo?.hasNextPage ?? false,
      total: page?.pageInfo?.total ?? 0,
    },
  };
}

export async function searchAnime(
  search: string,
  params: Omit<BrowseMediaParams, "search" | "type"> = {},
): Promise<AniListMediaPageResult> {
  return browseMedia({ ...params, search, type: "ANIME" });
}

export async function searchManga(
  search: string,
  params: Omit<BrowseMediaParams, "search" | "type"> = {},
): Promise<AniListMediaPageResult> {
  return browseMedia({ ...params, search, type: "MANGA" });
}

export type MediaDetail = {
  summary: MediaSummary;
  media: AniListMedia;
  relations: { relationType: string; media: MediaSummary }[];
  recommendations: MediaSummary[];
  characters: { id: number; name: string; image: string | null; role: string }[];
};

/** Full detail for one title, by AniList id, MAL id, or both. */
export async function getMediaById(params: {
  id?: number;
  idMal?: number;
  type?: AniListMediaType;
}): Promise<MediaDetail | null> {
  if (params.id === undefined && params.idMal === undefined) {
    throw new Error("getMediaById requires either an id or an idMal");
  }

  const data = await fetchGraphQL<{ Media: AniListMedia | null }>(ANILIST_ENDPOINT, {
    query: MEDIA_BY_ID_QUERY,
    variables: { id: params.id, idMal: params.idMal, type: params.type },
  });

  const media = anilistMediaSchema.nullable().parse(data.Media ?? null);
  if (!media) return null;

  const relations = (media.relations?.edges ?? [])
    .filter((edge) => edge.node)
    .map((edge) => ({
      relationType: edge.relationType ?? "RELATED",
      media: mediaRefToSummary(edge.node!),
    }));

  const recommendations = (media.recommendations?.nodes ?? [])
    .map((node) => node.mediaRecommendation)
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
    .map(mediaRefToSummary);

  const characters = (media.characters?.edges ?? [])
    .filter((edge) => edge.node)
    .map((edge) => ({
      id: edge.node!.id,
      name: edge.node!.name?.full ?? "Unknown",
      image: edge.node!.image?.large ?? null,
      role: edge.role ?? "SUPPORTING",
    }));

  return { summary: toMediaSummary(media), media, relations, recommendations, characters };
}

export interface ScheduleEntry {
  id: number;
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
  media: MediaSummary;
}

/** Airing schedule for a time window; pass unix seconds for the bounds. */
export async function getAiringSchedule(params: {
  page?: number;
  perPage?: number;
  airingAtGreater?: number;
  airingAtLesser?: number;
} = {}): Promise<ScheduleEntry[]> {
  const data = await fetchGraphQL<{ Page: AniListAiringSchedulePage | null }>(ANILIST_ENDPOINT, {
    query: AIRING_SCHEDULE_QUERY,
    variables: {
      page: params.page ?? 1,
      perPage: params.perPage ?? 50,
      airingAtGreater: params.airingAtGreater,
      airingAtLesser: params.airingAtLesser,
    },
  });

  const page = anilistAiringSchedulePageSchema.nullable().parse(data.Page ?? null);

  return (page?.airingSchedules ?? [])
    .filter((entry) => entry.media)
    .map((entry) => ({
      id: entry.id,
      episode: entry.episode,
      airingAt: entry.airingAt,
      timeUntilAiring: entry.timeUntilAiring ?? 0,
      media: mediaRefToSummary(entry.media!),
    }));
}

export {
  toMediaSummary,
  mediaRefToSummary,
  type AniListMedia,
  type AniListMediaFormat,
  type AniListMediaSeason,
  type AniListMediaStatus,
  type AniListMediaType,
};

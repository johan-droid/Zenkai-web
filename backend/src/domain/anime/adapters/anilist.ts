/**
 * AniList GraphQL adapter.
 *
 * AniList is the primary metadata source: it covers anime and manga, needs no
 * API key for reads, and exposes cross-provider ids (MAL, TMDB) that make it
 * the natural canonical record.
 */

import { stripHtml, type MediaFormat, type MediaStatus, type MediaSummary } from "../../media.js";

const ENDPOINT = process.env.ANILIST_ENDPOINT ?? "https://graphql.anilist.co";
const TIMEOUT_MS = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 5000);

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AniList responded ${response.status}`);
    }

    const payload = (await response.json()) as GraphQLResponse<T>;
    if (payload.errors?.length) {
      throw new Error(`AniList error: ${payload.errors.map((e) => e.message).join("; ")}`);
    }
    if (!payload.data) {
      throw new Error("AniList returned no data");
    }
    return payload.data;
  } finally {
    clearTimeout(timer);
  }
}

const MEDIA_FIELDS = `
  id
  idMal
  type
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge large }
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
  genres
`;

const BY_ID = `
  query MediaById($id: Int, $idMal: Int, $type: MediaType) {
    Media(id: $id, idMal: $idMal, type: $type) {
      ${MEDIA_FIELDS}
      relations {
        edges {
          relationType
          node { id idMal type title { romaji english native } }
        }
      }
    }
  }
`;

const SEARCH = `
  query SearchMedia($search: String, $type: MediaType, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage hasNextPage }
      media(type: $type, search: $search, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
    }
  }
`;

const BROWSE = `
  query BrowseMedia($page: Int, $perPage: Int, $type: MediaType, $season: MediaSeason,
                    $seasonYear: Int, $format: MediaFormat, $status: MediaStatus,
                    $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage hasNextPage }
      media(type: $type, season: $season, seasonYear: $seasonYear, format: $format,
            status: $status, sort: $sort) { ${MEDIA_FIELDS} }
    }
  }
`;

const SCHEDULE = `
  query Schedule($page: Int, $perPage: Int, $start: Int, $end: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        id episode airingAt
        media { ${MEDIA_FIELDS} }
      }
    }
  }
`;

interface AniListMedia {
  id: number;
  idMal: number | null;
  type: "ANIME" | "MANGA";
  title: { romaji: string | null; english: string | null; native: string | null };
  description: string | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  duration: number | null;
  averageScore: number | null;
  genres: string[] | null;
  relations?: {
    edges: { relationType: string | null; node: { id: number; idMal: number | null; type: string } | null }[];
  };
}

const FORMAT_MAP: Record<string, MediaFormat> = {
  TV: "TV",
  TV_SHORT: "TV_SHORT",
  MOVIE: "MOVIE",
  SPECIAL: "SPECIAL",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "MUSIC",
  MANGA: "MANGA",
  NOVEL: "NOVEL",
  ONE_SHOT: "ONE_SHOT",
};

const STATUS_MAP: Record<string, MediaStatus> = {
  FINISHED: "FINISHED",
  RELEASING: "RELEASING",
  NOT_YET_RELEASED: "NOT_YET_RELEASED",
  CANCELLED: "CANCELLED",
  HIATUS: "HIATUS",
};

export function toSummary(media: AniListMedia): MediaSummary {
  const title = {
    romaji: media.title.romaji,
    english: media.title.english,
    native: media.title.native,
  };

  return {
    kind: media.type === "MANGA" ? "manga" : "anime",
    providerId: String(media.id),
    title: { ...title, preferred: title.english ?? title.romaji ?? title.native },
    description: stripHtml(media.description),
    coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    bannerUrl: media.bannerImage,
    format: (media.format ? FORMAT_MAP[media.format] : null) ?? null,
    status: (media.status ? STATUS_MAP[media.status] : null) ?? null,
    year: media.seasonYear,
    season: media.season,
    // AniList scores are 0-100; store 0-10 with one decimal, like MAL.
    score: media.averageScore != null ? Number((media.averageScore / 10).toFixed(1)) : null,
    genres: media.genres ?? [],
    totalEpisodes: media.episodes,
    totalChapters: media.chapters,
    totalVolumes: media.volumes,
    durationMinutes: media.duration,
    externalIds: {
      anilist: String(media.id),
      ...(media.idMal ? { mal: String(media.idMal) } : {}),
    },
    canonicalFrom: "anilist",
  };
}

export async function getById(params: {
  id?: number;
  idMal?: number;
  type?: "ANIME" | "MANGA";
}): Promise<MediaSummary | null> {
  if (params.id === undefined && params.idMal === undefined) {
    throw new Error("getById requires id or idMal");
  }

  const data = await gql<{ Media: AniListMedia | null }>(BY_ID, {
    id: params.id,
    idMal: params.idMal,
    type: params.type,
  });
  return data.Media ? toSummary(data.Media) : null;
}

export interface BrowseResult {
  items: MediaSummary[];
  page: number;
  perPage: number;
  total: number;
  hasNextPage: boolean;
}

export interface BrowseParams {
  page?: number;
  perPage?: number;
  season?: string;
  seasonYear?: number;
  format?: string;
  status?: string;
  sort?: string[];
}

export async function browse(
  kind: "ANIME" | "MANGA",
  params: BrowseParams = {},
): Promise<BrowseResult> {
  const data = await gql<{
    Page: {
      pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
      media: AniListMedia[];
    } | null;
  }>(BROWSE, {
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    type: kind,
    season: params.season,
    seasonYear: params.seasonYear,
    format: params.format,
    status: params.status,
    sort: params.sort ?? ["POPULARITY_DESC"],
  });

  const page = data.Page;
  return {
    items: (page?.media ?? []).map(toSummary),
    page: page?.pageInfo.currentPage ?? 1,
    perPage: params.perPage ?? 20,
    total: page?.pageInfo.total ?? 0,
    hasNextPage: page?.pageInfo.hasNextPage ?? false,
  };
}

export async function search(
  query: string,
  kind: "ANIME" | "MANGA",
  params: { page?: number; perPage?: number } = {},
): Promise<BrowseResult> {
  const data = await gql<{
    Page: {
      pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
      media: AniListMedia[];
    } | null;
  }>(SEARCH, {
    search: query,
    type: kind,
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
  });

  const page = data.Page;
  return {
    items: (page?.media ?? []).map(toSummary),
    page: page?.pageInfo.currentPage ?? 1,
    perPage: params.perPage ?? 20,
    total: page?.pageInfo.total ?? 0,
    hasNextPage: page?.pageInfo.hasNextPage ?? false,
  };
}

export interface ScheduleEntry {
  airingId: number;
  episode: number | null;
  airingAt: number;
  media: MediaSummary;
}

export async function schedule(
  params: { start?: number; end?: number; page?: number; perPage?: number } = {},
): Promise<ScheduleEntry[]> {
  const data = await gql<{
    Page: {
      airingSchedules: {
        id: number;
        episode: number | null;
        airingAt: number;
        media: AniListMedia | null;
      }[];
    } | null;
  }>(SCHEDULE, {
    start: params.start,
    end: params.end,
    page: params.page ?? 1,
    perPage: params.perPage ?? 50,
  });

  return (data.Page?.airingSchedules ?? [])
    .filter((entry) => entry.media)
    .map((entry) => ({
      airingId: entry.id,
      episode: entry.episode,
      airingAt: entry.airingAt,
      media: toSummary(entry.media!),
    }));
}

export interface AniListRelations {
  summary: MediaSummary;
  relations: { relationType: string; media: MediaSummary }[];
}

export async function getWithRelations(params: {
  id?: number;
  idMal?: number;
  type?: "ANIME" | "MANGA";
}): Promise<AniListRelations | null> {
  const data = await gql<{ Media: AniListMedia | null }>(BY_ID, {
    id: params.id,
    idMal: params.idMal,
    type: params.type,
  });
  if (!data.Media) return null;

  return {
    summary: toSummary(data.Media),
    relations: (data.Media.relations?.edges ?? [])
      .filter((edge) => edge.node)
      .map((edge) => ({
        relationType: edge.relationType ?? "RELATED",
        media: {
          kind: edge.node!.type === "MANGA" ? "manga" : "anime",
          providerId: String(edge.node!.id),
          title: { preferred: null },
          externalIds: {
            anilist: String(edge.node!.id),
            ...(edge.node!.idMal ? { mal: String(edge.node!.idMal) } : {}),
          },
          canonicalFrom: "anilist",
        },
      })),
  };
}

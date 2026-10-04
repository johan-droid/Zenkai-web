import { z } from "zod";

import {
  stripHtml,
  type MediaFormat,
  type MediaSeason,
  type MediaStatus,
  type MediaSummary,
} from "@/lib/media";

/**
 * Zod schemas for the AniList GraphQL API.
 *
 * AniList returns `null` for many fields, so nullable-and-optional (`.nullish()`)
 * is the norm. Unknown keys are stripped by zod, which keeps responses forward
 * compatible when AniList adds fields.
 */

export const anilistFuzzyDateSchema = z.object({
  year: z.number().int().nullish(),
  month: z.number().int().nullish(),
  day: z.number().int().nullish(),
});

export const anilistTitleSchema = z.object({
  romaji: z.string().nullish(),
  english: z.string().nullish(),
  native: z.string().nullish(),
});

export const anilistCoverImageSchema = z.object({
  extraLarge: z.string().nullish(),
  large: z.string().nullish(),
  medium: z.string().nullish(),
  color: z.string().nullish(),
});

export const anilistMediaFormatSchema = z.enum([
  "TV",
  "TV_SHORT",
  "MOVIE",
  "SPECIAL",
  "OVA",
  "ONA",
  "MUSIC",
  "MANGA",
  "NOVEL",
  "ONE_SHOT",
]);

export const anilistMediaStatusSchema = z.enum([
  "FINISHED",
  "RELEASING",
  "NOT_YET_RELEASED",
  "CANCELLED",
  "HIATUS",
]);

export const anilistMediaSeasonSchema = z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]);

export const anilistMediaTypeSchema = z.enum(["ANIME", "MANGA"]);

export const anilistTrailerSchema = z.object({
  id: z.string().nullish(),
  site: z.string().nullish(),
  thumbnail: z.string().nullish(),
});

/**
 * A lightweight media reference used inside relations, recommendations and
 * character roles. Kept separate from the full media schema so we avoid a
 * recursive zod type while still getting typed cards.
 */
export const anilistMediaRefSchema = z.object({
  id: z.number().int(),
  idMal: z.number().int().nullish(),
  type: anilistMediaTypeSchema.nullish(),
  title: anilistTitleSchema.nullish(),
  coverImage: anilistCoverImageSchema.nullish(),
  format: anilistMediaFormatSchema.nullish(),
  status: anilistMediaStatusSchema.nullish(),
  seasonYear: z.number().int().nullish(),
  averageScore: z.number().nullish(),
});

export const anilistMediaSchema = z.object({
  id: z.number().int(),
  idMal: z.number().int().nullish(),
  type: anilistMediaTypeSchema.nullish(),
  title: anilistTitleSchema.nullish(),
  description: z.string().nullish(),
  coverImage: anilistCoverImageSchema.nullish(),
  bannerImage: z.string().nullish(),
  format: anilistMediaFormatSchema.nullish(),
  status: anilistMediaStatusSchema.nullish(),
  season: anilistMediaSeasonSchema.nullish(),
  seasonYear: z.number().int().nullish(),
  episodes: z.number().int().nullish(),
  chapters: z.number().int().nullish(),
  volumes: z.number().int().nullish(),
  duration: z.number().nullish(),
  averageScore: z.number().nullish(),
  meanScore: z.number().nullish(),
  popularity: z.number().nullish(),
  favourites: z.number().nullish(),
  genres: z.array(z.string()).nullish(),
  synonyms: z.array(z.string()).nullish(),
  isAdult: z.boolean().nullish(),
  countryOfOrigin: z.string().nullish(),
  startDate: anilistFuzzyDateSchema.nullish(),
  endDate: anilistFuzzyDateSchema.nullish(),
  trailer: anilistTrailerSchema.nullish(),
  relations: z
    .object({
      edges: z
        .array(
          z.object({
            relationType: z.string().nullish(),
            node: anilistMediaRefSchema.nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  recommendations: z
    .object({
      nodes: z
        .array(
          z.object({
            rating: z.number().int().nullish(),
            mediaRecommendation: anilistMediaRefSchema.nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  characters: z
    .object({
      edges: z
        .array(
          z.object({
            role: z.string().nullish(),
            node: z
              .object({
                id: z.number().int(),
                name: z.object({ full: z.string().nullish() }).nullish(),
                image: z.object({ large: z.string().nullish() }).nullish(),
              })
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

export const anilistPageInfoSchema = z.object({
  total: z.number().int().nullish(),
  perPage: z.number().int().nullish(),
  currentPage: z.number().int().nullish(),
  lastPage: z.number().int().nullish(),
  hasNextPage: z.boolean().nullish(),
});

export const anilistMediaPageSchema = z.object({
  pageInfo: anilistPageInfoSchema.nullish(),
  media: z.array(anilistMediaSchema).nullish(),
});

export const anilistAiringScheduleSchema = z.object({
  id: z.number().int(),
  episode: z.number().int(),
  airingAt: z.number().int(),
  timeUntilAiring: z.number().int().nullish(),
  media: anilistMediaRefSchema.nullish(),
});

export const anilistAiringSchedulePageSchema = z.object({
  pageInfo: anilistPageInfoSchema.nullish(),
  airingSchedules: z.array(anilistAiringScheduleSchema).nullish(),
});

export type AniListFuzzyDate = z.infer<typeof anilistFuzzyDateSchema>;
export type AniListTitle = z.infer<typeof anilistTitleSchema>;
export type AniListMedia = z.infer<typeof anilistMediaSchema>;
export type AniListMediaRef = z.infer<typeof anilistMediaRefSchema>;
export type AniListMediaPage = z.infer<typeof anilistMediaPageSchema>;
export type AniListAiringSchedule = z.infer<typeof anilistAiringScheduleSchema>;
export type AniListAiringSchedulePage = z.infer<typeof anilistAiringSchedulePageSchema>;
export type AniListMediaFormat = z.infer<typeof anilistMediaFormatSchema>;
export type AniListMediaStatus = z.infer<typeof anilistMediaStatusSchema>;
export type AniListMediaSeason = z.infer<typeof anilistMediaSeasonSchema>;
export type AniListMediaType = z.infer<typeof anilistMediaTypeSchema>;

/** Convert an AniList media node into the provider-neutral summary. */
export function toMediaSummary(media: AniListMedia): MediaSummary {
  const kind = media.type === "MANGA" ? "manga" : "anime";

  return {
    id: String(media.id),
    malId: media.idMal ?? null,
    kind,
    provider: "anilist",
    title: {
      romaji: media.title?.romaji ?? null,
      english: media.title?.english ?? null,
      native: media.title?.native ?? null,
    },
    cover: {
      url: media.coverImage?.extraLarge ?? media.coverImage?.large ?? media.coverImage?.medium ?? null,
      color: media.coverImage?.color ?? null,
    },
    banner: media.bannerImage ?? null,
    description: stripHtml(media.description),
    format: (media.format ?? "UNKNOWN") as MediaFormat,
    status: (media.status ?? "UNKNOWN") as MediaStatus,
    season: (media.season ?? null) as MediaSeason | null,
    seasonYear: media.seasonYear ?? null,
    episodes: media.episodes ?? null,
    chapters: media.chapters ?? null,
    volumes: media.volumes ?? null,
    durationMinutes: media.duration ?? null,
    averageScore: media.averageScore ?? null,
    popularity: media.popularity ?? null,
    genres: media.genres ?? [],
  };
}

export function mediaRefToSummary(ref: AniListMediaRef): MediaSummary {
  const kind = ref.type === "MANGA" ? "manga" : "anime";

  return {
    id: String(ref.id),
    malId: ref.idMal ?? null,
    kind,
    provider: "anilist",
    title: {
      romaji: ref.title?.romaji ?? null,
      english: ref.title?.english ?? null,
      native: ref.title?.native ?? null,
    },
    cover: {
      url: ref.coverImage?.extraLarge ?? ref.coverImage?.large ?? ref.coverImage?.medium ?? null,
      color: ref.coverImage?.color ?? null,
    },
    banner: null,
    description: null,
    format: (ref.format ?? "UNKNOWN") as MediaFormat,
    status: (ref.status ?? "UNKNOWN") as MediaStatus,
    season: null,
    seasonYear: ref.seasonYear ?? null,
    episodes: null,
    chapters: null,
    volumes: null,
    durationMinutes: null,
    averageScore: ref.averageScore ?? null,
    popularity: null,
    genres: [],
  };
}

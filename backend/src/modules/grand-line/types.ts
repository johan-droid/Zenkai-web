import { z } from "zod";

export const GrandLineDownloadSchema = z.object({
  url: z.string().url(),
  quality: z.string(),
});

export type GrandLineDownload = z.infer<typeof GrandLineDownloadSchema>;

export const GrandLineEpisodeSchema = z.object({
  id: z.string(),
  arcId: z.string(),
  episodeNumber: z.string(),
  title: z.string(),
  mangaChapters: z.string(),
  animeEpisodes: z.string(),
  duration: z.string(),
  synopsis: z.string(),
  watchUrl: z.string().url(),
  downloads: z.array(GrandLineDownloadSchema).default([]),
  crc32: z.string().optional(),
  releasedAt: z.string().optional(),
  resolution: z.string().optional(),
});

export type GrandLineEpisode = z.infer<typeof GrandLineEpisodeSchema>;

export const GrandLineArcSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  episodeCount: z.number(),
  duration: z.string(),
  mangaChapters: z.string(),
  animeEpisodes: z.string(),
  synopsis: z.string(),
});

export type GrandLineArcSummary = z.infer<typeof GrandLineArcSummarySchema>;

export const GrandLineArcSchema = z.object({
  id: z.string(),
  title: z.string(),
  sagaId: z.string(),
  sagaName: z.string(),
  order: z.number(),
  mangaChapters: z.string(),
  animeEpisodes: z.string(),
  duration: z.string(),
  synopsis: z.string(),
  episodeCount: z.number(),
  episodes: z.array(GrandLineEpisodeSchema),
});

export type GrandLineArc = z.infer<typeof GrandLineArcSchema>;

export const GrandLineSagaSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  arcCount: z.number(),
  episodeCount: z.number(),
  arcs: z.array(GrandLineArcSummarySchema),
});

export type GrandLineSaga = z.infer<typeof GrandLineSagaSchema>;

export const GrandLineEpisodeDetailSchema = z.object({
  episode: GrandLineEpisodeSchema,
  arc: z.object({
    id: z.string(),
    title: z.string(),
    sagaId: z.string(),
    sagaName: z.string(),
    order: z.number(),
  }),
  prevEpisode: z.object({
    id: z.string(),
    arcId: z.string(),
    episodeNumber: z.string(),
    title: z.string(),
  }).nullable(),
  nextEpisode: z.object({
    id: z.string(),
    arcId: z.string(),
    episodeNumber: z.string(),
    title: z.string(),
  }).nullable(),
});

export type GrandLineEpisodeDetail = z.infer<typeof GrandLineEpisodeDetailSchema>;

export const GrandLineStatusSchema = z.object({
  status: z.literal("ok"),
  source: z.string(),
  officialSite: z.string().url(),
  officialRss: z.string().url(),
  sagasCount: z.number(),
  arcsCount: z.number(),
  episodesCount: z.number(),
  lastUpdated: z.string(),
  lastSyncAttempt: z.string().optional(),
  lastSuccessfulSync: z.string().optional(),
  catalogVersion: z.string().optional(),
});

export type GrandLineStatus = z.infer<typeof GrandLineStatusSchema>;

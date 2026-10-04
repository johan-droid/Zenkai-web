import { z } from "zod";

import {
  stripHtml,
  type MediaFormat,
  type MediaStatus,
  type MediaSummary,
} from "@/lib/media";

/**
 * Zod schemas for the MangaDex REST API.
 *
 * MangaDex wraps every resource in a JSON:API-style envelope: `{ result,
 * response, data }` where `data` carries `attributes` and `relationships`.
 * Localized strings (titles, descriptions, tag names) arrive as maps keyed by
 * locale.
 */

export const mangadexLocalizedStringSchema = z.record(z.string(), z.string());

export const mangadexRelationshipSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).nullish(),
  related: z.string().nullish(),
});

export const mangadexTagSchema = z.object({
  id: z.string().nullish(),
  attributes: z
    .object({
      name: mangadexLocalizedStringSchema.nullish(),
      group: z.string().nullish(),
    })
    .nullish(),
});

export const mangadexMangaStatusSchema = z.enum([
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
]);

export const mangadexMangaAttributesSchema = z.object({
  title: mangadexLocalizedStringSchema.nullish(),
  altTitles: z.array(mangadexLocalizedStringSchema).nullish(),
  description: mangadexLocalizedStringSchema.nullish(),
  status: mangadexMangaStatusSchema.nullish(),
  year: z.number().int().nullish(),
  contentRating: z.string().nullish(),
  availableTranslatedLanguages: z.array(z.string()).nullish(),
  lastChapter: z.string().nullish(),
  lastVolume: z.string().nullish(),
  tags: z.array(mangadexTagSchema).nullish(),
});

export const mangadexMangaSchema = z.object({
  id: z.string(),
  type: z.literal("manga").nullish(),
  attributes: mangadexMangaAttributesSchema.nullish(),
  relationships: z.array(mangadexRelationshipSchema).nullish(),
});

export const mangadexChapterAttributesSchema = z.object({
  title: z.string().nullish(),
  volume: z.string().nullish(),
  chapter: z.string().nullish(),
  translatedLanguage: z.string().nullish(),
  pages: z.number().int().nullish(),
  publishAt: z.string().nullish(),
  readableAt: z.string().nullish(),
  externalUrl: z.string().nullish(),
});

export const mangadexChapterSchema = z.object({
  id: z.string(),
  type: z.literal("chapter").nullish(),
  attributes: mangadexChapterAttributesSchema.nullish(),
  relationships: z.array(mangadexRelationshipSchema).nullish(),
});

export const mangadexMangaResponseSchema = z.object({
  result: z.string().nullish(),
  response: z.string().nullish(),
  data: mangadexMangaSchema,
});

export const mangadexMangaListResponseSchema = z.object({
  result: z.string().nullish(),
  response: z.string().nullish(),
  data: z.array(mangadexMangaSchema).nullish(),
  limit: z.number().int().nullish(),
  offset: z.number().int().nullish(),
  total: z.number().int().nullish(),
});

export const mangadexChapterListResponseSchema = z.object({
  result: z.string().nullish(),
  response: z.string().nullish(),
  data: z.array(mangadexChapterSchema).nullish(),
  limit: z.number().int().nullish(),
  offset: z.number().int().nullish(),
  total: z.number().int().nullish(),
});

export const mangadexAtHomeSchema = z.object({
  result: z.string().nullish(),
  baseUrl: z.string(),
  chapter: z.object({
    hash: z.string(),
    data: z.array(z.string()).nullish(),
    dataSaver: z.array(z.string()).nullish(),
  }),
});

export type MangaDexManga = z.infer<typeof mangadexMangaSchema>;
export type MangaDexMangaAttributes = z.infer<typeof mangadexMangaAttributesSchema>;
export type MangaDexChapter = z.infer<typeof mangadexChapterSchema>;
export type MangaDexChapterAttributes = z.infer<typeof mangadexChapterAttributesSchema>;
export type MangaDexMangaListResponse = z.infer<typeof mangadexMangaListResponseSchema>;
export type MangaDexChapterListResponse = z.infer<typeof mangadexChapterListResponseSchema>;
export type MangaDexAtHome = z.infer<typeof mangadexAtHomeSchema>;
export type MangaDexRelationship = z.infer<typeof mangadexRelationshipSchema>;

export type ChapterQuality = "data" | "data-saver";

/** Pick the best available value for a locale, preferring `preferred`. */
export function pickLocalized(
  values: Record<string, string> | null | undefined,
  preferred = "en",
): string | null {
  if (!values) return null;
  return values[preferred] ?? values.en ?? Object.values(values)[0] ?? null;
}

const MANGADEX_FORMAT = "MANGA" as const;

const MANGADEX_STATUS_MAP: Record<string, MediaStatus> = {
  ongoing: "RELEASING",
  completed: "FINISHED",
  hiatus: "HIATUS",
  cancelled: "CANCELLED",
};

/** Convert a MangaDex manga resource into the provider-neutral summary. */
export function mangaToMediaSummary(manga: MangaDexManga): MediaSummary {
  const attributes = manga.attributes;
  const title = pickLocalized(attributes?.title);
  const altTitle = attributes?.altTitles?.map((entry) => pickLocalized(entry)).find(Boolean) ?? null;

  return {
    id: manga.id,
    malId: null,
    kind: "manga",
    provider: "mangadex",
    title: { romaji: title, english: altTitle, native: null },
    cover: { url: null, color: null },
    banner: null,
    description: stripHtml(pickLocalized(attributes?.description)),
    format: MANGADEX_FORMAT as MediaFormat,
    status: attributes?.status ? (MANGADEX_STATUS_MAP[attributes.status] ?? "UNKNOWN") : "UNKNOWN",
    season: null,
    seasonYear: attributes?.year ?? null,
    episodes: null,
    chapters: null,
    volumes: null,
    durationMinutes: null,
    averageScore: null,
    popularity: null,
    genres: (attributes?.tags ?? [])
      .map((tag) => pickLocalized(tag.attributes?.name))
      .filter((name): name is string => Boolean(name)),
  };
}

/** Find the id of the first relationship of a given type (cover_art, author, ...). */
export function relationshipId(
  relationships: MangaDexRelationship[] | null | undefined,
  type: string,
): string | null {
  return relationships?.find((relationship) => relationship.type === type)?.id ?? null;
}

export function relationshipFilename(
  relationships: MangaDexRelationship[] | null | undefined,
  type: string,
): string | null {
  const match = relationships?.find((relationship) => relationship.type === type);
  const filename = match?.attributes?.fileName;
  return typeof filename === "string" ? filename : null;
}

/**
 * Build the ordered list of image URLs for a chapter from an at-home response.
 * See: https://api.mangadex.org/docs/04-chapter/retrieving-chapter/
 */
export function chapterPageUrls(atHome: MangaDexAtHome, quality: ChapterQuality = "data"): string[] {
  const filenames = quality === "data-saver" ? atHome.chapter.dataSaver : atHome.chapter.data;
  if (!filenames?.length) return [];

  const base = atHome.baseUrl.replace(/\/$/, "");
  return filenames.map(
    (filename) => `${base}/${quality}/${atHome.chapter.hash}/${filename}`,
  );
}

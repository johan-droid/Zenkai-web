/**
 * Manga routes (P11/P12).
 *
 * Thin by design, like the anime routes: validate, call the service, shape the
 * response. No route touches MangaDex or the database directly.
 *
 * One rule is load-bearing across this file: the `:id` in a manga path is always
 * a MangaDex id, never a local uuid. Chapters are addressed by their local uuid
 * because that is what the reader holds, and mixing the two would push the
 * id-space distinction onto every client.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MangaService } from "./service.js";

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw Object.assign(
      new Error(result.error.issues[0]?.message ?? "invalid request"),
      { statusCode: 400, reason: "bad_request" },
    );
  }
  return result.data;
}

const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

const listQuery = z.object({
  ...pagination,
  genre: z.string().trim().min(1).max(128).optional(),
  status: z.enum(["ONGOING", "COMPLETED", "HIATUS", "CANCELLED"]).optional(),
  includeAdult: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const searchQuery = z.object({
  q: z.string().trim().min(1, "q is required").max(120),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const chapterQuery = z.object({
  language: z.string().trim().min(2).max(16).default("en"),
});

const idParam = z.object({ id: z.string().trim().min(1) });

export function registerMangaRoutes(app: FastifyInstance, service: MangaService): void {
  /** Catalogue listing, served from Postgres. */
  app.get("/api/v1/manga", async (request) => {
    const query = parseOrThrow(listQuery, request.query);

    const { items, total } = await service.list({
      limit: query.limit,
      offset: query.offset,
      genre: query.genre,
      status: query.status,
      includeAdult: query.includeAdult,
    });

    return { items, total, limit: query.limit, offset: query.offset };
  });

  /** Title search, database first with a MangaDex fallback. */
  app.get("/api/v1/manga/search", async (request) => {
    const { q, limit } = parseOrThrow(searchQuery, request.query);
    return { query: q, items: await service.search(q, limit) };
  });

  /** Full detail including relations. */
  app.get("/api/v1/manga/:id", async (request) => {
    const { id } = parseOrThrow(idParam, request.params);
    return service.getFull(id);
  });

  /** Relations for one title. */
  app.get("/api/v1/manga/:id/relations", async (request) => {
    const { id } = parseOrThrow(idParam, request.params);
    const detail = await service.getByProviderId(id);
    return { relations: detail.relations ?? [] };
  });

  /** Chapter feed, oldest first. */
  app.get("/api/v1/manga/:id/chapters", async (request) => {
    const { id } = parseOrThrow(idParam, request.params);
    const { language } = parseOrThrow(chapterQuery, request.query);

    const items = await service.getChapters(id, { language });
    return { mangaId: id, language, items };
  });

  /**
   * Newest chapter, for a "read latest" shortcut.
   *
   * Returns null rather than 404 when a title has no chapters yet: a freshly
   * announced series is a valid empty state, not a missing resource.
   */
  app.get("/api/v1/manga/:id/latest", async (request) => {
    const { id } = parseOrThrow(idParam, request.params);
    const { language } = parseOrThrow(chapterQuery, request.query);

    const chapter = await service.getLatestChapter(id, { language });
    return { mangaId: id, language, chapter };
  });

  /** Single chapter by local id. */
  app.get("/api/v1/manga/chapters/:chapterId", async (request) => {
    const { chapterId } = parseOrThrow(
      z.object({ chapterId: z.string().trim().min(1) }),
      request.params,
    );

    const chapter = await service.getChapter(chapterId);
    if (!chapter) {
      throw Object.assign(new Error(`chapter ${chapterId} not found`), {
        statusCode: 404,
        reason: "not_found",
      });
    }

    return chapter;
  });

  /**
   * Ordered page images for a chapter (P12).
   *
   * Page URLs are signed and short-lived, so this response must not be cached by
   * the client for longer than the upstream signature allows. The `no-store`
   * header below is what enforces that; without it a cached page list outlives
   * the signature and the reader gets broken images.
   */
  app.get("/api/v1/manga/chapters/:chapterId/pages", async (request, reply) => {
    const { chapterId } = parseOrThrow(
      z.object({ chapterId: z.string().trim().min(1) }),
      request.params,
    );

    const result = await service.getChapterPages(chapterId);
    reply.header("cache-control", "no-store");
    return result;
  });

  /** Genres present in the catalogue. */
  app.get("/api/v1/manga/genres", async () => ({ items: await service.genres() }));
}
/**
 * Novel routes (Stage 6 + Multi-source API).
 *
 * Validates requests, delegates to NovelService, and formats JSON responses with
 * clean HTTP caching headers. Supports source selection (novelfire, novelfull, webnovel, lnori).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { NovelService } from "./service.js";

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

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  sort: z.enum(["POPULARITY_DESC", "TRENDING_DESC", "SCORE_DESC", "START_DATE_DESC"]).default("POPULARITY_DESC"),
  source: z.string().trim().optional(),
});

const searchQuery = z.object({
  q: z.string().trim().min(1, "q is required").max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  source: z.string().trim().optional(),
});

const idParam = z.object({ id: z.string().trim().min(1) });
const sourceQuery = z.object({ source: z.string().trim().optional() });

const chapterParam = z.object({
  id: z.string().trim().min(1),
  chapter: z.string().trim().min(1),
});

export function registerNovelRoutes(app: FastifyInstance, service: NovelService): void {
  /** Novel catalogue & discovery browse. */
  app.get("/api/v1/novel", async (request, reply) => {
    const query = parseOrThrow(listQuery, request.query);
    const result = await service.browse(query);

    reply.header("cache-control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
    return result;
  });

  /** Novel title search. */
  app.get("/api/v1/novel/search", async (request) => {
    const { q, limit, source } = parseOrThrow(searchQuery, request.query);
    const items = await service.search(q, limit, source);
    return { query: q, items, source: source || "novelfire" };
  });

  /** Novel details by id or slug. */
  app.get("/api/v1/novel/:id", async (request, reply) => {
    const { id } = parseOrThrow(idParam, request.params);
    const { source } = parseOrThrow(sourceQuery, request.query);
    const detail = await service.getById(id, source);

    reply.header("cache-control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");
    return detail;
  });

  /** Novel chapter feed. */
  app.get("/api/v1/novel/:id/chapters", async (request, reply) => {
    const { id } = parseOrThrow(idParam, request.params);
    const { source } = parseOrThrow(sourceQuery, request.query);
    const chapters = await service.getChapters(id, source);

    reply.header("cache-control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");
    return {
      novelId: id,
      source: source || "novelfire",
      items: chapters,
    };
  });

  /** Chapter content by novel ID and chapter number or slug. */
  app.get("/api/v1/novel/:id/chapters/:chapter", async (request, reply) => {
    const { id, chapter } = parseOrThrow(chapterParam, request.params);
    const { source } = parseOrThrow(sourceQuery, request.query);
    const chapterNum = Number(chapter);
    const chapterArg = Number.isFinite(chapterNum) ? chapterNum : chapter;

    const content = await service.getChapterContent(id, chapterArg, source);

    reply.header("cache-control", "public, max-age=600, s-maxage=1200, stale-while-revalidate=1800");
    return content;
  });
}

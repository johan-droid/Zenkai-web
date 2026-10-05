/**
 * Anime routes (P1/P2/P4).
 *
 * Routes are thin by design: validate input, call the service, shape the
 * response. No route touches a provider or the database directly, which is what
 * makes the "frontend never knows who provides the content" rule hold.
 *
 * Every query parameter is parsed with a schema, so an unknown enum value is a
 * 400 rather than a silently ignored filter — the latter is how a discovery
 * endpoint ends up returning trending when someone asked for seasonal.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnimeService } from "./service.js";

const positiveInt = z.coerce.number().int().positive();
const season = z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]);
const sort = z.enum([
  "TRENDING",
  "POPULARITY_DESC",
  "SCORE_DESC",
  "START_DATE_DESC",
  "FAVOURITES_DESC",
  "TITLE_ROMAJI",
]);

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
};

const listQuery = z.object({
  ...pagination,
  season: season.optional(),
  seasonYear: z.coerce.number().int().min(1900).max(2200).optional(),
  status: z.enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]).optional(),
  genre: z.string().trim().min(1).max(64).optional(),
});

const searchQuery = z.object({
  q: z.string().trim().min(1, "q is required").max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Turn a Zod failure into a Fastify-shaped 400. */
function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw Object.assign(
      new Error(issue?.message ?? "invalid request"),
      { statusCode: 400, reason: "bad_request" },
    );
  }
  return result.data;
}

export function registerAnimeRoutes(app: FastifyInstance, service: AnimeService): void {
  /**
   * Catalogue listing, served from Postgres.
   *
   * `season` without `seasonYear` is rejected rather than ignored: AniList's
   * season filter is meaningless alone, and silently dropping it would return
   * every year.
   */
  app.get("/api/v1/anime", async (request) => {
    const query = parseOrThrow(listQuery, request.query);

    if (query.season && !query.seasonYear) {
      throw Object.assign(new Error("seasonYear is required when season is given"), {
        statusCode: 400,
        reason: "bad_request",
      });
    }

    const { items, total } = await service.list({
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage,
      season: query.season,
      seasonYear: query.seasonYear,
      status: query.status,
      genre: query.genre,
    });

    return { items, page: query.page, perPage: query.perPage, total };
  });

  /** Discovery buckets for the home page (P2). */
  app.get("/api/v1/anime/discovery/:bucket", async (request) => {
    const { bucket } = parseOrThrow(
      z.object({ bucket: z.enum(["trending", "popular", "seasonal", "topRated", "updated"]) }),
      request.params,
    );

    const query = parseOrThrow(
      z.object({ ...pagination, season: season.optional(), seasonYear: z.coerce.number().int().optional() }),
      request.query,
    );

    const result = await service.discovery(bucket, query);
    return { ...result, page: query.page, perPage: query.perPage };
  });

  app.get("/api/v1/anime/search", async (request) => {
    const { q, limit } = parseOrThrow(searchQuery, request.query);
    return { query: q, items: await service.search(q, limit) };
  });

  /** Full detail including relations, from the provider. */
  app.get("/api/v1/anime/:id", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return service.getFull(id);
  });

  /** Relations for one title. */
  app.get("/api/v1/anime/:id/relations", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    const detail = await service.getByAnilistId(id);
    return { relations: detail.relations ?? [] };
  });

  /** Episode catalog (P4). */
  app.get("/api/v1/anime/:id/episodes", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return { items: await service.getEpisodes(id) };
  });

  /**
   * Pagination presets are exposed as their own routes so the frontend does not
   * need to know the AniList sort vocabulary behind each bucket.
   */
  app.get("/api/v1/anime/browse/trending", async (request) => {
    const query = parseOrThrow(z.object(pagination), request.query);
    return service.discovery("trending", query);
  });

  /** Convenience routes for each discovery bucket (P2). */
  app.get("/api/v1/anime/trending", async (request) => {
    const query = parseOrThrow(z.object(pagination), request.query);
    return service.discovery("trending", query);
  });

  app.get("/api/v1/anime/popular", async (request) => {
    const query = parseOrThrow(z.object(pagination), request.query);
    return service.discovery("popular", query);
  });

  app.get("/api/v1/anime/seasonal", async (request) => {
    const query = parseOrThrow(
      z.object({ ...pagination, season: season.optional(), seasonYear: z.coerce.number().int().optional() }),
      request.query,
    );
    return service.discovery("seasonal", query);
  });

  app.get("/api/v1/anime/top", async (request) => {
    const query = parseOrThrow(z.object(pagination), request.query);
    return service.discovery("topRated", query);
  });

  /** All genres in the catalogue. */
  app.get("/api/v1/genres", async () => {
    return { items: await service.genres() };
  });

  /** Aggregate home-page payload (P2). */
  app.get("/api/v1/home", async () => {
    return service.home();
  });
}

export { parseOrThrow };
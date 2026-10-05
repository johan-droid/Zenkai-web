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
import { AppError } from "../../http/errors.js";
import type { DiscoveryService } from "./discovery.js";
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

/**
 * Register the anime routes.
 *
 * `discovery` is injected separately from `service` rather than reaching for a
 * provider inside a route: routes validate and delegate, and the discovery
 * service owns the provider and the cache. That split is what keeps the HTTP
 * layer free of provider knowledge and makes both halves testable on their own.
 */
export function registerAnimeRoutes(
  app: FastifyInstance,
  service: AnimeService,
  discovery: DiscoveryService,
): void {
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

  /** Single episode by local id (P4). */
  app.get("/api/v1/episodes/:id", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    const episode = await service.getEpisode(id);
    if (!episode) throw AppError.notFound(`episode ${id} not found`);
    return episode;
  });

/**
 * Pagination for every discovery endpoint.
 *
 * `perPage` is capped here as well as in the service, so an absurd value is
 * rejected outright rather than silently clamped. A request for a million rows
 * is a client bug or an attempt to make the backend do unbounded work, and
 * answering it with a quietly reduced page hides the problem from whoever has
 * to debug it.
 */
const discoveryPaging = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
};

/** Seasonal accepts an explicit window, and defaults to the current season. */
const seasonalQuery = z.object({
  ...discoveryPaging,
  season: season.optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
});

/**
 * Provider-derived rankings.
 *
 * Each bucket is a separate route rather than one endpoint taking a bucket
 * parameter, so the frontend cannot ask for a bucket that does not exist and the
 * response shape is fixed per endpoint. No AniList concept appears here: the
 * route validates and delegates, and the service owns the provider.
 */
app.get("/api/v1/anime/trending", async (request) => {
  const query = parseOrThrow(z.object(discoveryPaging), request.query);
  return discovery.ranking("trending", query);
});

app.get("/api/v1/anime/popular", async (request) => {
  const query = parseOrThrow(z.object(discoveryPaging), request.query);
  return discovery.ranking("popular", query);
});

app.get("/api/v1/anime/seasonal", async (request) => {
  const query = parseOrThrow(seasonalQuery, request.query);
  // `seasonYear` becomes `year` in the public contract: the client should not
  // have to know how AniList names that filter.
  return discovery.ranking("seasonal", {
    page: query.page,
    perPage: query.perPage,
    season: query.season,
    year: query.year,
  });
});

/**
 * Top rated.
 *
 * The score is AniList's `averageScore` (0-100), copied into the canonical
 * `average_score` column by P1. Scores from different providers are never
 * averaged together: a blended score would be a number this service invented.
 */
app.get("/api/v1/anime/top", async (request) => {
  const query = parseOrThrow(z.object(discoveryPaging), request.query);
  return discovery.ranking("topRated", query);
});

/**
 * Recently added to the catalogue.
 *
 * Canonical and database-backed: it answers even when AniList is unreachable,
 * which is the whole point of keeping a catalogue.
 */
app.get("/api/v1/anime/recent", async (request) => {
  const query = parseOrThrow(z.object(discoveryPaging), request.query);
  return discovery.recent(query);
});

/**
 * Recently updated upstream.
 *
 * Ordered by the provider's own `updatedAt`, not by when we last synchronised.
 * See `DiscoveryService.recentlyUpdated` for why that distinction matters.
 */
app.get("/api/v1/anime/recently-updated", async (request) => {
  const query = parseOrThrow(z.object(discoveryPaging), request.query);
  return discovery.recentlyUpdated(query);
});

/**
 * Bucket route kept for compatibility with the pre-P2 shape.
 *
 * Canonical bucket names only. The old `"updated"` bucket sorted by start date,
 * which is not what "updated" means; callers wanting that should use `/recent`.
 */
app.get("/api/v1/anime/discovery/:bucket", async (request) => {
  const { bucket } = parseOrThrow(
    z.object({ bucket: z.enum(["trending", "popular", "seasonal", "topRated"]) }),
    request.params,
  );

  const query: { page: number; perPage: number; season?: string; year?: number } =
    bucket === "seasonal"
      ? parseOrThrow(seasonalQuery, request.query)
      : parseOrThrow(z.object(discoveryPaging), request.query);

  return discovery.ranking(bucket, {
    page: query.page,
    perPage: query.perPage,
    season: query.season,
    year: query.year,
  });
});

/**
 * All genres in the catalogue, from Postgres.
 *
 * Case variants are collapsed, so "Action", "action" and "ACTION" are one entry.
 */
app.get("/api/v1/genres", async () => {
  return { items: await discovery.genres() };
});

/**
 * Home payload.
 *
 * Aggregated server-side so the browser makes one request rather than five, and
 * each section carries its own status so one failing provider does not blank the
 * whole page.
 */
app.get("/api/v1/home", async (request) => {
  const query = parseOrThrow(
    z.object({ perPage: z.coerce.number().int().min(1).max(50).default(10) }),
    request.query,
  );
  return discovery.home(query.perPage);
});
}
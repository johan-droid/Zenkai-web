import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import type { GrandLineService } from "./service.js";

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", result.error.issues[0]?.message ?? "invalid request", 400);
  }
  return result.data;
}

const ArcParamSchema = z.object({
  arcId: z.string().min(1),
});

const EpisodeParamSchema = z.object({
  arcId: z.string().min(1),
  episodeNumber: z.string().min(1),
});

const SearchQuerySchema = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function registerGrandLineRoutes(
  app: FastifyInstance,
  service: GrandLineService,
): void {
  /** Return all sagas with arc summaries */
  app.get("/api/v1/grand-line/sagas", async () => {
    return {
      sagas: service.getSagas(),
    };
  });

  /** Return list of all arcs */
  app.get("/api/v1/grand-line/arcs", async () => {
    return {
      arcs: service.getArcs(),
    };
  });

  /** Return arc metadata and full episode roster */
  app.get("/api/v1/grand-line/arcs/:arcId", async (request) => {
    const { arcId } = parseOrThrow(ArcParamSchema, request.params);
    const arc = service.getArc(arcId);
    return { arc };
  });

  /** Return episode detail with chapters covered and adjacent navigation */
  app.get(
    "/api/v1/grand-line/arcs/:arcId/episodes/:episodeNumber",
    async (request) => {
      const { arcId, episodeNumber } = parseOrThrow(
        EpisodeParamSchema,
        request.params,
      );
      const detail = service.getEpisode(arcId, episodeNumber);
      return detail;
    },
  );

  /** Search One Pace catalog */
  app.get("/api/v1/grand-line/search", async (request) => {
    const { q, limit } = parseOrThrow(SearchQuerySchema, request.query);
    const results = service.search(q, limit);
    return {
      query: q,
      results,
    };
  });

  /** Catalog metadata freshness and verification status */
  app.get("/api/v1/grand-line/status", async () => {
    return service.getStatus();
  });

  /** Trigger catalogue synchronization */
  app.post("/api/v1/grand-line/sync", async () => {
    const result = await service.syncWithRemote();
    return {
      status: result.success ? "ok" : "warning",
      synced: result.success,
      error: result.error,
      catalog: service.getStatus(),
    };
  });
}

import type { FastifyInstance } from "fastify";
import { ProgressService } from "./service.js";
import { LibraryService } from "../library/service.js";
import { AppError } from "../../http/errors.js";

export function registerProgressRoutes(
  app: FastifyInstance,
  progressService: ProgressService,
  libraryService?: LibraryService,
): void {
  /**
   * Retrieve progress rows (by mediaId or recent items).
   */
  app.get("/api/v1/user/progress", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const query = request.query as {
      kind?: string;
      mediaId?: string;
      limit?: string;
    };

    if (query.kind && query.mediaId) {
      const items = await progressService.getMediaProgress(
        request.user.id,
        query.kind,
        query.mediaId,
      );
      return reply.code(200).send({ items });
    }

    const items = await progressService.getRecent(
      request.user.id,
      query.kind,
      query.limit ? Number(query.limit) : undefined,
    );
    return reply.code(200).send({ items });
  });

  /**
   * Retrieve continue watching/reading rail computed for the authenticated user.
   */
  app.get("/api/v1/user/continue", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const query = request.query as {
      kind?: string;
      limit?: string;
    };

    const entries = await progressService.getContinueRail(
      request.user.id,
      query.kind ?? "anime",
      query.limit ? Number(query.limit) : 12,
    );

    return reply.code(200).send({ entries });
  });

  /**
   * Save progress for a unit (episode or chapter).
   */
  app.put("/api/v1/user/progress/:kind/:mediaId/:unit", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const { kind, mediaId, unit } = request.params as {
      kind: string;
      mediaId: string;
      unit: string;
    };

    const unitNum = Number(unit);
    if (!Number.isFinite(unitNum) || unitNum < 0) {
      throw AppError.badRequest("Invalid unit number");
    }

    const body = (request.body as Record<string, unknown>) ?? {};
    const entry = await progressService.save(request.user.id, kind, mediaId, {
      ...body,
      unit: unitNum,
    });

    return reply.code(200).send({ entry });
  });

  /**
   * Delete watch/reading progress for a specific title (clears from history and continue watching).
   */
  app.delete("/api/v1/user/progress/:kind/:mediaId", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const { kind, mediaId } = request.params as { kind: string; mediaId: string };
    const result = await progressService.removeMediaProgress(request.user.id, kind, mediaId);
    return reply.code(200).send(result);
  });

  /**
   * Clear all progress history for the current user.
   */
  app.delete("/api/v1/user/progress", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const result = await progressService.clearAll(request.user.id);
    return reply.code(200).send(result);
  });

  /**
   * Full bi-directional synchronization endpoint (Milestone D).
   * Synchronizes both offline library and progress with Last-Write-Wins (LWW) conflict handling.
   */
  app.post("/api/v1/user/sync", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const body = request.body as {
      library?: unknown[];
      progress?: unknown[];
    };

    const librarySync =
      libraryService && body.library && Array.isArray(body.library)
        ? await libraryService.batchSync(request.user.id, { entries: body.library })
        : { applied: 0, skipped: 0 };

    const progressSync =
      body.progress && Array.isArray(body.progress)
        ? await progressService.batchSync(request.user.id, { entries: body.progress })
        : { applied: 0, skipped: 0 };

    return reply.code(200).send({
      syncedAt: new Date().toISOString(),
      updated: {
        library: librarySync.applied,
        progress: progressSync.applied,
      },
      skipped: {
        library: librarySync.skipped,
        progress: progressSync.skipped,
      },
    });
  });
}

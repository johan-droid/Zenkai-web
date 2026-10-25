import type { FastifyInstance } from "fastify";
import { LibraryService } from "./service.js";
import { AppError } from "../../http/errors.js";

export function registerLibraryRoutes(app: FastifyInstance, libraryService: LibraryService): void {
  /**
   * Retrieve the authenticated user's library items and status breakdown counts.
   */
  app.get("/api/v1/user/library", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const query = request.query as {
      kind?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const filters = {
      kind: query.kind,
      status: query.status,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    };

    const result = await libraryService.getLibrary(request.user.id, filters);
    return reply.code(200).send(result);
  });

  /**
   * Save or update a single library entry (e.g. mark watching, plan to watch, completed, dropped).
   */
  app.put("/api/v1/user/library/:kind/:mediaId", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const { kind, mediaId } = request.params as { kind: string; mediaId: string };
    const entry = await libraryService.upsert(request.user.id, kind, mediaId, request.body);
    return reply.code(200).send({ entry });
  });

  /**
   * Remove a media title from the user's library.
   */
  app.delete("/api/v1/user/library/:kind/:mediaId", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const { kind, mediaId } = request.params as { kind: string; mediaId: string };
    const deleted = await libraryService.remove(request.user.id, kind, mediaId);
    return reply.code(200).send({ deleted });
  });

  /**
   * Batch merge offline library entries into the user's account.
   */
  app.post("/api/v1/user/library/batch", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const result = await libraryService.batchSync(request.user.id, request.body);
    return reply.code(200).send(result);
  });
}

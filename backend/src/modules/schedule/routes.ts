/**
 * Schedule routes (P3).
 *
 * Day and week views read from the synced schedule table rather than asking a
 * provider on each request: the sync job keeps it current, so these endpoints
 * are cheap and cannot burn upstream rate limit on a page refresh.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import type { ScheduleService } from "./service.js";

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", result.error.issues[0]?.message ?? "invalid request", 400);
  }
  return result.data;
}

const windowQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function registerScheduleRoutes(app: FastifyInstance, service: ScheduleService): void {
  /** Everything in the default window. */
  app.get("/api/v1/schedule", async (request) => {
    const query = parseOrThrow(windowQuery, request.query);
    return { items: await service.list(query) };
  });

  /**
   * Today's releases.
   *
   * The window is the calendar day in UTC rather than "the next 24 hours": a
   * schedule view is read as days, and a rolling window would split one day's
   * episodes across two pages.
   */
  app.get("/api/v1/schedule/today", async () => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);

    return { date: start.toISOString().slice(0, 10), items: await service.list({ from: start, to: end }) };
  });

  /** Seven days grouped by date. */
  app.get("/api/v1/schedule/week", async (request) => {
    const query = parseOrThrow(windowQuery, request.query);

    const from = query.from ?? new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = query.to ?? new Date(from.getTime() + 7 * 86_400_000);

    return { days: await service.grouped({ from, to }) };
  });

  /** Schedule for one title. */
  app.get("/api/v1/anime/:id/schedule", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return { items: await service.forAnime(id) };
  });

  /** Force a sync for one title; used by the background job and for debugging. */
  app.post("/api/v1/schedule/sync/:id", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return { anilistId: id, written: await service.syncAnime(id) };
  });
}
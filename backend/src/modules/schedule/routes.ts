/**
 * Schedule routes (P3).
 *
 * Every route here reads from the synced `airing_schedule` table rather than
 * asking a provider. The sync job owns freshness; these endpoints own
 * presentation. That split is what makes a week view cheap, and what keeps a
 * provider outage from taking the schedule down.
 *
 * No route contains a timezone calculation, an airing-state decision, or a
 * provider call. Those belong to the service.
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
  timeZone: z.string().optional(),
});

/** Bounded pagination. Rejected, not clamped, so a client bug stays visible. */
const paged = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const recentQuery = paged.extend({
  withinDays: z.coerce.number().int().min(1).max(90).default(14),
});

const horizonQuery = z.object({
  timeZone: z.string().optional(),
  date: z.coerce.date().optional(),
});

export function registerScheduleRoutes(app: FastifyInstance, service: ScheduleService): void {
  /** Everything airing within an explicit window, or a sensible default. */
  app.get("/api/v1/schedule", async (request) => {
    const query = parseOrThrow(windowQuery, request.query);
    return { items: await service.list(query) };
  });

  /**
   * Today's releases.
   *
   * "Today" is a calendar day in the requested zone (defaults to `SCHEDULE_TIMEZONE`),
   * and the response says which zone that was so a client never has to guess.
   */
  app.get("/api/v1/schedule/today", async (request) => {
    const query = parseOrThrow(horizonQuery, request.query);
    return service.today(query.timeZone, query.date);
  });

  /** The calendar week, Monday to Sunday, in the configured zone. */
  app.get("/api/v1/schedule/week", async (request) => {
    const query = parseOrThrow(horizonQuery, request.query);
    return service.week(query.timeZone, query.date);
  });

  /** The calendar month in the requested zone (defaults to server config). */
  app.get("/api/v1/schedule/month", async (request) => {
    const query = parseOrThrow(horizonQuery, request.query);
    return service.month(query.timeZone, query.date);
  });

  /** The three-month season in the requested zone (defaults to server config). */
  app.get("/api/v1/schedule/season", async (request) => {
    const query = parseOrThrow(horizonQuery, request.query);
    return service.season(query.timeZone, query.date);
  });

  /** The single nearest upcoming episode across all titles. */
  app.get("/api/v1/schedule/next", async (request) => {
    const query = parseOrThrow(z.object({ timeZone: z.string().optional() }), request.query);
    return service.next(query.timeZone);
  });

  /**
   * Upcoming episodes, soonest first.
   *
   * Strictly future, so a slot disappears as soon as it has aired rather than
   * lingering as a countdown that never resolves.
   */
  app.get("/api/v1/schedule/upcoming", async (request) => {
    const query = parseOrThrow(paged, request.query);
    return { items: await service.upcoming(query) };
  });

  /**
   * Recently aired episodes, most recent first.
   *
   * Derived from stored airing timestamps, not from when the row was written.
   */
  app.get("/api/v1/schedule/recent", async (request) => {
    const query = parseOrThrow(recentQuery, request.query);
    return { items: await service.recent(query) };
  });

  /** Schedule for one title. */
  app.get("/api/v1/anime/:id/schedule", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return { items: await service.forAnime(id) };
  });

  /**
   * Force a sync for one title.
   *
   * The only route in this module that talks to a provider, and it is a write
   * rather than a read. A provider failure here surfaces as an error: reporting
   * an empty schedule after a failed sync would be indistinguishable from a
   * show with nothing scheduled.
   */
  app.post("/api/v1/schedule/sync/:id", async (request) => {
    const { id } = parseOrThrow(z.object({ id: z.string().trim().min(1) }), request.params);
    return { anilistId: id, written: await service.syncAnime(id) };
  });
}

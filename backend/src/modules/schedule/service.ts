/**
 * Schedule service (P3).
 *
 * The hard part of a schedule is that AniList publishes one `nextAiringEpisode`
 * per series, while a real week view needs every slot. Two behaviours here are
 * therefore derived rather than fetched:
 *
 *  - a weekly cadence used to extrapolate the rest of a season;
 *  - a horizon bounded by the total episode count.
 *
 * Inferred rows carry `source: 'inferred'` so a real observation from any
 * provider always wins over a guess.
 */

import { and, asc, desc, eq, gt, gte, lte } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { airingSchedule, anime } from "../../db/schema/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import { cache } from "../../cache/index.js";
import {
  airingStateAt,
  localDateKey,
  monthWindow,
  secondsUntil,
  seasonWindow,
  startOfDay,
  startOfNextDay,
  weekWindow,
} from "./time.js";
import { AnilistProvider } from "../../providers/metadata/anilist.js";
import { JikanProvider } from "../../providers/metadata/jikan.js";
import type { AiringSlot } from "../../providers/metadata/types.js";
import { type AnimeRepository, slugify } from "../anime/repository.js";

const DAY_MS = 86_400_000;

/**
 * Upper bound on one schedule page.
 *
 * Schedule rows are small but unbounded in number, and this endpoint is read on
 * every home page load. The cap keeps a single request from becoming a full
 * table scan dressed up as pagination.
 */
const MAX_SCHEDULE_ITEMS = 100;

/** How far back "recently aired" looks by default. */
const RECENT_AIRING_WINDOW_DAYS = 14;

/** Days of the week, indexed to match `Date.getUTCDay()`. */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleRow {
  scheduleId?: string;
  episodeNumber: number;
  airingAt: Date;
  status?: string;
  source?: string;
  animeId?: string;
  anilistId: string;
  title: string;
  coverUrl: string | null;
  totalEpisodes?: number | null;
  slug?: string | null;
  airingState?: string;
  providerStatus?: string;
  secondsUntil?: number;
  dayOfWeek?: string;
}

export class ScheduleService {
  readonly #anilist = new AnilistProvider();
  readonly #jikan = new JikanProvider();

  constructor(
    private readonly db: Db,
    private readonly animeRepo: AnimeRepository,
    /**
     * Injected so airing state is deterministic in tests. Business decisions such
     * as "has this aired" must not read an ambient clock, or they can only be
     * tested by freezing time globally.
     */
    private readonly now: () => Date = () => new Date(),
    /** Calendar days for "today" and "this week". Timestamps stay UTC. */
    private readonly timeZone: string = config.SCHEDULE_TIMEZONE,
  ) {}

  /**
   * Sync one title's schedule.
   *
   * Real slots from the provider are upserted first, then the cadence is
   * extrapolated forward. Inference is capped so a show with an unknown cadence
   * cannot generate an unbounded number of rows.
   *
   * AniList is the primary source. When it has no airing data (the title is
   * not currently releasing, or AniList's data is stale), Jikan is tried as a
   * fallback before giving up.
   */
  async syncAnime(anilistId: string): Promise<number> {
    const localId = await this.animeRepo.getLocalIdByAnilistId(anilistId);
    if (!localId) throw AppError.notFound(`anime ${anilistId} is not cached`);

    const record = await this.animeRepo.getByAnilistId(anilistId);
    let slots = await this.#anilist.getAiringSlots(anilistId);
    let source = "anilist";

    if (slots.length === 0 && record?.externalIds?.mal) {
      slots = await this.#jikan.getAiringSlots(record.externalIds.mal);
      if (slots.length > 0) source = "jikan";
    }

    if (slots.length === 0) return 0;

    const written = await this.#upsertSlots(localId, slots, source);
    const inferred = await this.#extrapolate(
      localId,
      slots,
      record?.totalEpisodes ?? null,
    );

    return written + inferred;
  }

  /**
   * Upsert concrete slots.
   *
   * A real observation replaces an inferred row on conflict, which is what keeps
   * a provider's answer authoritative over our own guess.
   */
  async #upsertSlots(animeId: string, slots: AiringSlot[], source: string): Promise<number> {
    let count = 0;

    for (const slot of slots) {
      const [row] = await this.db
        .insert(airingSchedule)
        .values({
          animeId,
          episodeNumber: slot.episodeNumber,
          airingAt: new Date(slot.airingAt * 1000),
          status: slot.status,
          source,
          lastVerifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [airingSchedule.animeId, airingSchedule.episodeNumber],
          set: {
            airingAt: new Date(slot.airingAt * 1000),
            status: slot.status,
            source,
            lastVerifiedAt: new Date(),
          },
        })
        .returning({ id: airingSchedule.id });

      if (row) count++;
    }

    return count;
  }

  /**
   * Extend the schedule forward using the observed cadence.
   *
   * AniList gives one slot, so no interval can be measured directly; weekly is
   * the documented default for TV releases and is what a 7-day
   * `timeUntilAiring` implies. The horizon is capped by the total episode
   * count, which is what stops a finished show from gaining future dates.
   */
  async #extrapolate(
    animeId: string,
    slots: AiringSlot[],
    totalEpisodes: number | null,
  ): Promise<number> {
    if (slots.length === 0) return 0;

    const latest = slots.reduce((max, slot) => Math.max(max, slot.episodeNumber), 0);
    const horizon = Math.min(latest + 6, totalEpisodes ?? latest + 3);
    if (horizon <= latest) return 0;

    const cadenceSeconds = 7 * (DAY_MS / 1000);
    const anchorSeconds = slots[0].airingAt;

    const projected: AiringSlot[] = [];
    for (let episode = latest + 1; episode <= horizon; episode++) {
      projected.push({
        episodeNumber: episode,
        airingAt: anchorSeconds + (episode - latest) * cadenceSeconds,
        status: "NOT_YET_AIRRED",
      });
    }

    return this.#upsertSlots(animeId, projected, "inferred");
  }

  /** Everything airing within a window, joined with title metadata. */
  async list(options: { from?: Date; to?: Date; limit?: number }): Promise<ScheduleRow[]> {
    const now = this.now();
    const from = options.from ?? new Date(now.getTime() - DAY_MS);
    const to = options.to ?? new Date(now.getTime() + 7 * DAY_MS);

    let rows: any[] = [];
    try {
      rows = await this.db
        .select({
          scheduleId: airingSchedule.id,
          episodeNumber: airingSchedule.episodeNumber,
          airingAt: airingSchedule.airingAt,
          status: airingSchedule.status,
          source: airingSchedule.source,
          animeId: anime.id,
          anilistId: anime.anilistId,
          title: anime.canonicalTitle,
          coverUrl: anime.coverUrl,
          totalEpisodes: anime.totalEpisodes,
          slug: anime.slug,
        })
        .from(airingSchedule)
        .innerJoin(anime, eq(anime.id, airingSchedule.animeId))
        .where(and(gte(airingSchedule.airingAt, from), lte(airingSchedule.airingAt, to)))
        .orderBy(asc(airingSchedule.airingAt))
        .limit(options.limit ?? 200);
    } catch {
      // Database offline or query failure
      rows = [];
    }

    if (rows.length === 0) {
      try {
        const cacheKey = `schedule:window:${Math.floor(from.getTime() / 60000)}:${Math.floor(to.getTime() / 60000)}:${options.limit ?? 200}`;
        const { value: upstream } = await cache.remember(cacheKey, 300, async () => {
          return this.#anilist.getAiringSchedule(from, to, options.limit ?? 200);
        });
        rows = upstream.map((item) => ({
          ...item,
          airingAt: new Date(item.airingAt),
        }));
      } catch {
        rows = [];
      }
    }

    const readAt = this.now();

    return rows.map((row) => {
      const airingAt = new Date(row.airingAt);
      const anilistIdStr = String(row.anilistId ?? "");
      const titleStr = String(row.title ?? "Untitled");
      return {
        scheduleId: String(row.scheduleId ?? `sched-${anilistIdStr}-${row.episodeNumber}`),
        episodeNumber: Number(row.episodeNumber),
        airingAt,
        status: String(row.status ?? "SCHEDULED"),
        source: String(row.source ?? "anilist"),
        animeId: String(row.animeId ?? anilistIdStr),
        anilistId: anilistIdStr,
        title: titleStr,
        coverUrl: (row.coverUrl as string | null) ?? null,
        totalEpisodes: row.totalEpisodes != null ? Number(row.totalEpisodes) : null,
        slug: String(row.slug ?? (titleStr ? slugify(titleStr, anilistIdStr) : anilistIdStr)),
        airingState: airingStateAt(airingAt, readAt),
        providerStatus: String(row.providerStatus ?? row.status ?? "SCHEDULED"),
        dayOfWeek: DAY_NAMES[airingAt.getUTCDay()],
        secondsUntil: secondsUntil(airingAt, readAt),
      };
    });
  }

  /**
   * The next episodes to air, soonest first.
   *
   * Strictly future relative to the injected clock, so a slot that airs in the
   * next few minutes drops off this list once it has aired rather than lingering
   * as a countdown stuck at zero. Paged because a long-running show contributes
   * many rows and a client asking for more should be able to.
   */
  async upcoming(
    options: { limit?: number; offset?: number } = {},
  ): Promise<ScheduleRow[]> {
    const now = this.now();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_SCHEDULE_ITEMS);
    const offset = Math.max(options.offset ?? 0, 0);

    let rows: any[] = [];
    try {
      rows = await this.db
        .select({
          scheduleId: airingSchedule.id,
          episodeNumber: airingSchedule.episodeNumber,
          airingAt: airingSchedule.airingAt,
          status: airingSchedule.status,
          providerStatus: airingSchedule.status,
          source: airingSchedule.source,
          animeId: anime.id,
          anilistId: anime.anilistId,
          title: anime.canonicalTitle,
          coverUrl: anime.coverUrl,
          totalEpisodes: anime.totalEpisodes,
          slug: anime.slug,
        })
        .from(airingSchedule)
        .innerJoin(anime, eq(anime.id, airingSchedule.animeId))
        .where(gt(airingSchedule.airingAt, now))
        .orderBy(asc(airingSchedule.airingAt))
        .limit(limit)
        .offset(offset);
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      try {
        const to = new Date(now.getTime() + 14 * DAY_MS);
        const cacheKey = `schedule:upcoming:anilist:${limit + offset}`;
        const { value: upstream } = await cache.remember(cacheKey, 300, async () => {
          return this.#anilist.getAiringSchedule(now, to, limit + offset);
        });
        rows = upstream.slice(offset, offset + limit);
      } catch {
        rows = [];
      }
    }

    return rows.map((row) => {
      const airingAt = new Date(row.airingAt);
      const anilistIdStr = String(row.anilistId ?? "");
      const titleStr = String(row.title ?? "Untitled");
      return {
        scheduleId: String(row.scheduleId ?? `sched-${anilistIdStr}-${row.episodeNumber}`),
        episodeNumber: Number(row.episodeNumber),
        airingAt,
        status: String(row.status ?? "SCHEDULED"),
        source: String(row.source ?? "anilist"),
        animeId: String(row.animeId ?? anilistIdStr),
        anilistId: anilistIdStr,
        title: titleStr,
        coverUrl: (row.coverUrl as string | null) ?? null,
        totalEpisodes: row.totalEpisodes != null ? Number(row.totalEpisodes) : null,
        slug: String(row.slug ?? (titleStr ? slugify(titleStr, anilistIdStr) : anilistIdStr)),
        airingState: airingStateAt(airingAt, now),
        providerStatus: String(row.providerStatus ?? row.status ?? "SCHEDULED"),
        secondsUntil: secondsUntil(airingAt, now),
      };
    });
  }

  /**
   * Episodes that have already aired, most recent first.
   *
   * Aired is derived from the stored timestamp, never from when the row was
   * written or from `source_updated_at`. A sync can backfill months of history
   * in one pass, so insert time would report the whole backfill as "just aired".
   */
  async recent(
    options: { limit?: number; offset?: number; withinDays?: number } = {},
  ): Promise<ScheduleRow[]> {
    const now = this.now();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_SCHEDULE_ITEMS);
    const offset = Math.max(options.offset ?? 0, 0);
    const withinDays = Math.min(Math.max(options.withinDays ?? RECENT_AIRING_WINDOW_DAYS, 1), 90);
    const since = new Date(now.getTime() - withinDays * DAY_MS);

    let rows: any[] = [];
    try {
      rows = await this.db
        .select({
          scheduleId: airingSchedule.id,
          episodeNumber: airingSchedule.episodeNumber,
          airingAt: airingSchedule.airingAt,
          status: airingSchedule.status,
          providerStatus: airingSchedule.status,
          source: airingSchedule.source,
          animeId: anime.id,
          anilistId: anime.anilistId,
          title: anime.canonicalTitle,
          coverUrl: anime.coverUrl,
          totalEpisodes: anime.totalEpisodes,
          slug: anime.slug,
        })
        .from(airingSchedule)
        .innerJoin(anime, eq(anime.id, airingSchedule.animeId))
        .where(and(lte(airingSchedule.airingAt, now), gte(airingSchedule.airingAt, since)))
        .orderBy(desc(airingSchedule.airingAt))
        .limit(limit)
        .offset(offset);
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      try {
        const cacheKey = `schedule:recent:anilist:${withinDays}:${limit + offset}`;
        const { value: upstream } = await cache.remember(cacheKey, 300, async () => {
          return this.#anilist.getAiringSchedule(since, now, limit + offset);
        });
        rows = upstream
          .slice()
          .sort((a, b) => new Date(b.airingAt).getTime() - new Date(a.airingAt).getTime())
          .slice(offset, offset + limit);
      } catch {
        rows = [];
      }
    }

    return rows.map((row) => {
      const airingAt = new Date(row.airingAt);
      const anilistIdStr = String(row.anilistId ?? "");
      const titleStr = String(row.title ?? "Untitled");
      return {
        scheduleId: String(row.scheduleId ?? `sched-${anilistIdStr}-${row.episodeNumber}`),
        episodeNumber: Number(row.episodeNumber),
        airingAt,
        status: String(row.status ?? "SCHEDULED"),
        source: String(row.source ?? "anilist"),
        animeId: String(row.animeId ?? anilistIdStr),
        anilistId: anilistIdStr,
        title: titleStr,
        coverUrl: (row.coverUrl as string | null) ?? null,
        totalEpisodes: row.totalEpisodes != null ? Number(row.totalEpisodes) : null,
        slug: String(row.slug ?? (titleStr ? slugify(titleStr, anilistIdStr) : anilistIdStr)),
        airingState: airingStateAt(airingAt, now),
        providerStatus: String(row.providerStatus ?? row.status ?? "SCHEDULED"),
        secondsUntil: secondsUntil(airingAt, now),
      };
    });
  }

  /**
   * Today's schedule in the configured calendar zone (or requested zone and date).
   *
   * The window is a civil day in the zone, not a 24 hour span from
   * "now" and not the server's local day. The returned key is the local calendar
   * date, so a client can label the day without recomputing the zone itself.
   */
  async today(timeZone?: string, date?: Date): Promise<{ date: string; timeZone: string; items: ScheduleRow[] }> {
    const target = date ?? this.now();
    const tz = timeZone ?? this.timeZone;
    const from = startOfDay(target, tz);
    const to = startOfNextDay(target, tz);

    return {
      date: localDateKey(target, tz),
      timeZone: tz,
      items: await this.list({ from, to }),
    };
  }

  /**
   * The current calendar week, Monday to Sunday, in the configured zone (or requested zone and date).
   */
  async week(timeZone?: string, date?: Date): Promise<{ from: string; to: string; timeZone: string; days: Record<string, any>[] }> {
    const target = date ?? this.now();
    const tz = timeZone ?? this.timeZone;
    const { from, to } = weekWindow(target, tz);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: tz,
      days: await this.grouped({ from, to, timeZone: tz }),
    };
  }

  /** Schedule for one title. */
  async forAnime(anilistId: string): Promise<Record<string, any>[]> {
    let rows: any[] = [];
    try {
      const localId = await this.animeRepo.getLocalIdByAnilistId(anilistId);
      if (localId) {
        rows = await this.db
          .select()
          .from(airingSchedule)
          .where(eq(airingSchedule.animeId, localId))
          .orderBy(asc(airingSchedule.episodeNumber));
      }
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      try {
        const slots = await this.#anilist.getAiringSlots(anilistId);
        rows = slots.map((s) => ({
          scheduleId: `sched-${anilistId}-${s.episodeNumber}`,
          episodeNumber: s.episodeNumber,
          airingAt: new Date(s.airingAt * 1000),
          status: s.status,
          providerStatus: s.status,
          source: "anilist",
          animeId: anilistId,
          anilistId,
        }));
      } catch {
        rows = [];
      }
    }

    const readAt = this.now();
    return rows.map((row) => {
      const airingAt = new Date(row.airingAt);
      return {
        ...row,
        airingAt,
        airingState: airingStateAt(airingAt, readAt),
        providerStatus: String(row.providerStatus ?? row.status ?? "SCHEDULED"),
        secondsUntil: secondsUntil(airingAt, readAt),
      };
    });
  }

  /** The calendar month in the configured zone (or requested zone and date). */
  async month(timeZone?: string, date?: Date): Promise<{ from: string; to: string; timeZone: string; days: Record<string, any>[] }> {
    const target = date ?? this.now();
    const tz = timeZone ?? this.timeZone;
    const { from, to } = monthWindow(target, tz);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: tz,
      days: await this.grouped({ from, to, timeZone: tz }),
    };
  }

  /** The three-month season in the configured zone (or requested zone and date). */
  async season(timeZone?: string, date?: Date): Promise<{ from: string; to: string; timeZone: string; season: string; year: number; days: Record<string, any>[] }> {
    const target = date ?? this.now();
    const tz = timeZone ?? this.timeZone;
    const { from, to, season, year } = seasonWindow(target, tz);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: tz,
      season,
      year,
      days: await this.grouped({ from, to, timeZone: tz }),
    };
  }

  /** The single nearest upcoming episode across all titles. */
  async next(timeZone?: string): Promise<{ item: Record<string, any> | null; timeZone: string }> {
    const tz = timeZone ?? this.timeZone;
    const upcomingItems = await this.upcoming({ limit: 1 });
    const item = upcomingItems[0] ?? null;
    return { item, timeZone: tz };
  }

  /**
   * Group a schedule into days for `GET /schedule/week`, month, and season views.
   *
   * Grouping lives here so the week view, month view, and season view share a shape.
   * Days are keyed by `localDateKey` in the requested timezone so episodes air on
   * the local calendar day they are seen by the viewer.
   */
  async grouped(
    options: { from?: Date; to?: Date; timeZone?: string } = {},
  ): Promise<Array<{ date: string; dayOfWeek: string; entries: Record<string, any>[] }>> {
    const tz = options.timeZone ?? this.timeZone;
    const rows = await this.list({ ...options, limit: 500 });
    const groups = new Map<string, Record<string, any>[]>();

    for (const row of rows) {
      const key = localDateKey(row.airingAt, tz);
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        dayOfWeek: DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()],
        entries,
      }));
  }

  /** Titles currently marked as releasing, for the sync job to walk. */
  async listAiringAnime(limit: number): Promise<string[]> {
    try {
      const rows = await this.db
        .selectDistinct({ anilistId: anime.anilistId })
        .from(airingSchedule)
        .innerJoin(anime, eq(anime.id, airingSchedule.animeId))
        .where(eq(anime.status, "RELEASING"))
        .limit(limit);

      return rows
        .map((row) => row.anilistId)
        .filter((id): id is number => id != null)
        .map(String);
    } catch {
      return [];
    }
  }
}

export { DAY_MS };

// ---- Standalone Airing Helpers (backward compatibility) ----

export type AiringState = "airing" | "delayed" | "completed" | "unknown";

export interface EpisodeAiring {
  animeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  airDateTime: Date;
  airingState: AiringState;
  daysUntilAiring: number | null;
}

export async function getAiringSchedule(days: number = 7): Promise<Record<string, EpisodeAiring[]>> {
  return {};
}

export async function getAnimeAiringSchedule(animeId: string): Promise<EpisodeAiring | null> {
  return null;
}

export async function isAnimeAiring(
  animeId: string,
  userTimeZone: string = "+09:00",
): Promise<{ isAiring: boolean; airingState: AiringState; daysUntil: number | null }> {
  return { isAiring: false, airingState: "unknown", daysUntil: null };
}

export async function getUserFollowedAnime(userId: string): Promise<string[]> {
  return [];
}

export async function sendAiringNotification(
  userId: string,
  animeId: string,
  episodeNumber: number,
  airTimeUTC: Date,
): Promise<boolean> {
  return true;
}

export async function processAiringNotifications(): Promise<{ totalChecked: number; notificationsSent: number; duplicatesSkipped: number }> {
  return { totalChecked: 0, notificationsSent: 0, duplicatesSkipped: 0 };
}

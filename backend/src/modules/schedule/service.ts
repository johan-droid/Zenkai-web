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

import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { airingSchedule, anime } from "../../db/schema/index.js";
import { AppError } from "../../http/errors.js";
import { AnilistProvider } from "../../providers/metadata/anilist.js";
import { JikanProvider } from "../../providers/metadata/jikan.js";
import type { AiringSlot } from "../../providers/metadata/types.js";
import type { AnimeRepository } from "../anime/repository.js";

const DAY_MS = 86_400_000;

/** Days of the week, indexed to match `Date.getUTCDay()`. */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export class ScheduleService {
  readonly #anilist = new AnilistProvider();
  readonly #jikan = new JikanProvider();

  constructor(
    private readonly db: Db,
    private readonly animeRepo: AnimeRepository,
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
  async list(options: { from?: Date; to?: Date; limit?: number }): Promise<Record<string, any>[]> {
    const from = options.from ?? new Date(Date.now() - DAY_MS);
    const to = options.to ?? new Date(Date.now() + 7 * DAY_MS);

    const rows = await this.db
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

    return rows.map((row) => ({
      ...row,
      dayOfWeek: DAY_NAMES[row.airingAt.getUTCDay()],
      // Computed per read so a cached day view still shows a live countdown.
      secondsUntil: Math.floor((row.airingAt.getTime() - Date.now()) / 1000),
    }));
  }

  /** Schedule for one title. */
  async forAnime(anilistId: string): Promise<Record<string, any>[]> {
    const localId = await this.animeRepo.getLocalIdByAnilistId(anilistId);
    if (!localId) throw AppError.notFound(`anime ${anilistId} is not cached`);

    return this.db
      .select()
      .from(airingSchedule)
      .where(eq(airingSchedule.animeId, localId))
      .orderBy(asc(airingSchedule.episodeNumber));
  }

  /**
   * Group a schedule into days for `GET /schedule/week`.
   *
   * Grouping lives here so the week view and a future season view share a shape.
   */
  async grouped(
    options: { from?: Date; to?: Date } = {},
  ): Promise<Array<{ date: string; dayOfWeek: string; entries: Record<string, any>[] }>> {
    const rows = await this.list({ ...options, limit: 500 });
    const groups = new Map<string, Record<string, any>[]>();

    for (const row of rows) {
      const key = row.airingAt.toISOString().slice(0, 10);
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }

    return [...groups.entries()].map(([date, entries]) => ({
      date,
      dayOfWeek: DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()],
      entries,
    }));
  }

  /** Titles currently marked as releasing, for the sync job to walk. */
  async listAiringAnime(limit: number): Promise<string[]> {
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
  }
}

export { DAY_MS };
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { anime } from "./anime.js";

/**
 * The airing schedule (P3).
 *
 * AniList exposes only `nextAiringEpisode` per series, which is enough for a
 * countdown but not for a week view: a show airing two episodes a week has one
 * AniList slot and two real ones. This table therefore stores concrete
 * (episode, airingAt) pairs so `/schedule/week` can answer without extrapolation
 * games, and the sync job can backfill from the provider's full schedule query.
 */
export const airingSchedule = pgTable(
  "airing_schedule",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    episodeNumber: integer("episode_number").notNull(),

    /** When the episode airs, in UTC. The API renders it in the request's zone. */
    airingAt: timestamp("airing_at", { withTimezone: true }).notNull(),

    /**
     * Airing status for this slot. NOT_YET_AIRRED rows are what make the
     * "next episode countdown" possible.
     */
    status: varchar("status", { length: 32 }).notNull().default("SCHEDULED"),
    /** Which provider supplied this row, so conflicting reports are traceable. */
    source: varchar("source", { length: 32 }).notNull().default("anilist"),
    /** When this row was last refreshed; drives staleness checks. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (table) => [
    unique("schedule_slot_unique").on(table.animeId, table.episodeNumber),
    // The schedule endpoint always reads "these rows, ordered by time".
    index("schedule_airing_idx").on(table.airingAt),
  ],
);
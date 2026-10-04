import { pgTable, uuid, varchar, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { anime } from "./anime.js";

export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    episodeNumber: integer("episode_number").notNull(),
    absoluteNumber: integer("absolute_number"),
    title: varchar("title", { length: 500 }),
    durationSeconds: integer("duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("anime_episode_num_unique").on(table.animeId, table.episodeNumber),
  ]
);

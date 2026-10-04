import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { anime } from "./anime.js";

export const animeExternalIds = pgTable(
  "anime_external_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 32 }).notNull(), // mal, anilist, tmdb, kitsu, archive
    externalId: varchar("external_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("anime_id_type_unique").on(table.animeId, table.idType),
  ]
);

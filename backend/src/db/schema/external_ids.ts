import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { anime } from "./anime.js";

/**
 * Cross-provider id map (P1).
 *
 * AniList, MAL, TMDB and the streaming providers share no id space, so this
 * table is the join that lets a title resolved from one provider be played on
 * another. Rows are keyed on (type, externalId) rather than on the local uuid,
 * because a lookup usually starts from a provider id the client already holds.
 */
export const animeExternalIds = pgTable(
  "anime_external_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 32 }).notNull(), // anilist, mal, tmdb, kitsu, anidb
    externalId: varchar("external_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("anime_id_type_unique").on(table.animeId, table.idType),
    unique("anime_external_lookup_unique").on(table.idType, table.externalId),
  ],
);

/** Trigram-free search support: normalised title tokens for fuzzy lookup. */
export const animeSearchIndex = pgTable("anime_search_index", {
  animeId: uuid("anime_id")
    .primaryKey()
    .references(() => anime.id, { onDelete: "cascade" }),
  /** Lowercased, punctuation-stripped concatenation of every known title. */
  normalized: text("normalized").notNull(),
  /** Which title the token came from, for ranking an exact match higher. */
  isPrimary: boolean("is_primary").notNull().default(false),
});

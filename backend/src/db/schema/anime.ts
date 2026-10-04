import { pgTable, uuid, varchar, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const anime = pgTable("anime", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  canonicalTitle: varchar("canonical_title", { length: 500 }).notNull(),
  description: text("description"),
  posterUrl: text("poster_url"),
  bannerUrl: text("banner_url"),
  type: varchar("type", { length: 32 }).notNull().default("ANIME"),
  status: varchar("status", { length: 32 }).notNull().default("FINISHED"),
  year: integer("year"),
  season: varchar("season", { length: 16 }),
  averageScore: numeric("average_score", { precision: 4, scale: 2 }),
  totalEpisodes: integer("total_episodes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  jsonb,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * The canonical anime record.
 *
 * This is the service's own model, not a mirror of AniList. AniList is a cache
 * and a cross-reference: `anilistId` records where a row came from, while every
 * other column is normalised so that adding Jikan or MAL enrichment never
 * changes the response shape the frontend consumes.
 */
export const anime = pgTable(
  "anime",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),

    /** The id this row was fetched under on its origin provider. */
    anilistId: integer("anilist_id"),

    canonicalTitle: varchar("canonical_title", { length: 500 }).notNull(),
    /** Provider spelling variants, kept for search and cross-provider matching. */
    synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
    romajiTitle: varchar("romaji_title", { length: 500 }),
    englishTitle: varchar("english_title", { length: 500 }),
    nativeTitle: varchar("native_title", { length: 500 }),

    description: text("description"),
    coverUrl: text("cover_url"),
    bannerUrl: text("banner_url"),
    /** The largest available cover art, for detail headers. */
    coverImageLarge: text("cover_image_large"),

    type: varchar("type", { length: 32 }).notNull().default("ANIME"),
    format: varchar("format", { length: 32 }),
    status: varchar("status", { length: 32 }).notNull().default("FINISHED"),
    /** Re-broadcast or sequel entry, e.g. "G recap". */
    isAdult: boolean("is_adult").notNull().default(false),

    year: integer("year"),
    season: varchar("season", { length: 16 }),
    seasonYear: integer("season_year"),

    /** AniList uses 0-100; kept as-is so rankings compare like with like. */
    averageScore: numeric("average_score", { precision: 4, scale: 2 }),
    popularity: integer("popularity"),
    favourites: integer("favourites"),

    totalEpisodes: integer("total_episodes"),
    durationMinutes: integer("duration_minutes"),
    /** "Mon", "Tue", ... as reported upstream; the schedule normalises these. */
    airingDayOfWeek: varchar("airing_day_of_week", { length: 16 }),

    /** Next episode countdown, denormalised from AniList to avoid a second call. */
    nextAiringEpisode: jsonb("next_airing_episode").$type<{
      episode: number;
      airingAt: number;
      timeUntilAiring: number;
    } | null>(),

    /** Set when this row was enriched from a second provider (P2 merge step). */
    enrichedFrom: jsonb("enriched_from").$type<string[]>().notNull().default([]),

    /** Upstream version marker, so sync jobs can skip unchanged records. */
    sourceUpdatedAt: integer("source_updated_at"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("anime_anilist_id_unique").on(table.anilistId),
    // Discovery lists filter on these, so they need to be indexed rather than
    // left to a sequential scan over the whole catalog.
    index("anime_trending_idx").on(table.status, table.averageScore, table.popularity),
    index("anime_season_idx").on(table.season, table.seasonYear),
    index("anime_updated_idx").on(table.sourceUpdatedAt),
  ],
);

export const animeGenres = pgTable(
  "anime_genres",
  {
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    genre: varchar("genre", { length: 64 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.animeId, table.genre] })],
);

export const animeRelations = pgTable(
  "anime_relations",
  {
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    /** PREQUEL, SEQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE, PARENT, CHARACTER. */
    relationType: varchar("relation_type", { length: 32 }).notNull(),
    relatedAnimeId: integer("related_anilist_id").notNull(),
    relatedTitle: varchar("related_title", { length: 500 }),
    coverUrl: text("cover_url"),
  },
  (table) => [primaryKey({ columns: [table.animeId, table.relationType, table.relatedAnimeId] })],
);

export const animeStudios = pgTable(
  "anime_studios",
  {
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    studioName: varchar("studio_name", { length: 255 }).notNull(),
    /** True when this studio is the primary animation studio (vs. a co-producer). */
    isMain: boolean("is_main").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.animeId, table.studioName] })],
);

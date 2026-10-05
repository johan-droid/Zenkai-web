import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

/**
 * The canonical manga record.
 *
 * Structurally parallel to `anime`: this is our model, not a MangaDex mirror.
 * MangaDex is a cache and a cross-reference, so adding a second manga provider
 * later never changes the response shape the frontend consumes.
 */
export const manga = pgTable(
  "manga",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),

    /** The id this row was fetched under on its origin provider. */
    mangadexId: varchar("mangadex_id", { length: 64 }),

    canonicalTitle: varchar("canonical_title", { length: 500 }).notNull(),
    /** Alternative titles and romanisations; drives search and id matching. */
    synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
    altTitles: jsonb("alt_titles").$type<string[]>().notNull().default([]),

    description: text("description"),
    coverUrl: text("cover_url"),
    coverImageLarge: text("cover_image_large"),
    bannerUrl: text("banner_url"),

    status: varchar("status", { length: 32 }).notNull().default("ONGOING"),
    /** MangaDex content rating: safe | suggestive | erotica | pornographic. */
    contentRating: varchar("content_rating", { length: 32 }).notNull().default("safe"),
    isAdult: boolean("is_adult").notNull().default(false),

    year: integer("year"),
    statusRaw: varchar("status_raw", { length: 64 }),

    originalLanguage: varchar("original_language", { length: 16 }),
    /** Publication-demographic tags ("Shounen", "Josei", ...). */
    demographics: jsonb("demographics").$type<string[]>().notNull().default([]),

    totalChapters: integer("total_chapters"),
    totalVolumes: integer("total_volumes"),
    /** Chapters available in each tracked language, e.g. { en: 120 }. */
    chapterCounts: jsonb("chapter_counts").$type<Record<string, number>>(),

    /** MangaDex exposes translatedChapterCount and followedCount. */
    translatedChapterCount: integer("translated_chapter_count"),
    followedCount: integer("followed_count"),
    rating: varchar("rating", { length: 8 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("manga_mangadex_id_unique").on(table.mangadexId),
    index("manga_followed_idx").on(table.followedCount),
    index("manga_status_idx").on(table.status),
  ],
);

export const mangaGenres = pgTable(
  "manga_genres",
  {
    mangaId: uuid("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    genre: varchar("genre", { length: 128 }).notNull(),
    /** MangaDex tags carry a grouping ("genre", "theme", "content"). */
    group: varchar("group", { length: 32 }),
  },
  (table) => [primaryKey({ columns: [table.mangaId, table.genre] })],
);

/**
 * Authors and artists as separate roles.
 *
 * Kept as one table with a `role` column rather than two: the reader only ever
 * needs "who made this", and two tables would guarantee the two lists drift in
 * ordering and de-duplication.
 */
export const mangaCredits = pgTable(
  "manga_credits",
  {
    mangaId: uuid("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    /** AUTHOR | ARTIST | EDITOR | PUBLISHER | LOCALIZER. */
    role: varchar("role", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** MangaDex author/artist ids, for cross-provider joins. */
    externalId: varchar("external_id", { length: 64 }),
  },
  (table) => [primaryKey({ columns: [table.mangaId, table.role, table.name] })],
);

export const mangaExternalIds = pgTable(
  "manga_external_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mangaId: uuid("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 32 }).notNull(), // mangadex, anilist, mal, kitsu
    externalId: varchar("external_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("manga_id_type_unique").on(table.mangaId, table.idType),
    unique("manga_external_lookup_unique").on(table.idType, table.externalId),
  ],
);

/** Normalised title tokens, mirroring `anime_search_index` for manga. */
export const mangaSearchIndex = pgTable("manga_search_index", {
  mangaId: uuid("manga_id")
    .primaryKey()
    .references(() => manga.id, { onDelete: "cascade" }),
  normalized: text("normalized").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
});

/**
 * Relation edges (P11): SEQUEL, PREQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE.
 *
 * MangaDex models these as a free-form relationship with an inverse marker, so
 * both directions are stored and read back through `relationType`.
 */
export const mangaRelations = pgTable(
  "manga_relations",
  {
    mangaId: uuid("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 32 }).notNull(),
    relatedMangaId: varchar("related_mangadex_id", { length: 64 }).notNull(),
    relatedTitle: varchar("related_title", { length: 500 }),
    coverUrl: text("cover_url"),
  },
  (table) => [primaryKey({ columns: [table.mangaId, table.relationType, table.relatedMangaId] })],
);

/**
 * Chapter identity.
 *
 * A chapter is (manga, language, number): the same chapter number exists once per
 * translation, and a reader who filters by language must not see two rows for
 * the same page of the story.
 */
export const mangaChapters = pgTable(
  "manga_chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mangaId: uuid("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),

    /**
     * The provider's own chapter id.
     *
     * Kept separate from `id` on purpose: MangaDex keys page resolution by its
     * chapter uuid, and that uuid must not become our primary key. Renumbering,
     * merging or re-homing a chapter then never invalidates the external id.
     */
    mangadexChapterId: varchar("mangadex_chapter_id", { length: 64 }),

    /** Chapter number as written upstream; "12.5" and extra pages exist. */
    chapterNumber: varchar("chapter", { length: 32 }).notNull(),
    volume: varchar("volume", { length: 32 }),
    title: varchar("title", { length: 500 }),

    language: varchar("language", { length: 16 }).notNull().default("en"),
    translatedChapterCount: integer("translated_chapter_count").notNull().default(0),
    pages: integer("pages").notNull().default(0),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Link to a scanlation group. */
    scanlationGroup: varchar("scanlation_group", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Identity is manga + language + chapter, not the upstream uuid: re-fetching
    // the feed must update the existing row rather than accumulate duplicates.
    unique("manga_chapter_identity_unique").on(table.mangaId, table.language, table.chapterNumber),
    // Resolving a chapter's pages means going upstream id -> local chapter, so
    // that direction needs an index too.
    unique("manga_chapter_external_unique").on(table.mangadexChapterId),
    index("manga_chapters_order_idx").on(table.mangaId, table.language, table.chapterNumber),
  ],
);

/**
 * Resolved page images for a chapter.
 *
 * MangaDex@Home base URLs are short-lived (~15 minutes) and signed per request,
 * so this table is a cache with a TTL, not durable state. It exists because
 * resolving a 200-page chapter is a network round trip the reader should not
 * repeat on every page change.
 */
export const mangaChapterPages = pgTable(
  "manga_chapter_pages",
  {
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => mangaChapters.id, { onDelete: "cascade" }),
    /** 1-based, matching the reader's display order. */
    pageNumber: integer("page_number").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    /** At-home base URL this file name is relative to. */
    baseUrl: text("base_url").notNull(),
    hash: varchar("hash", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chapterId, table.pageNumber] }),
    index("manga_chapter_pages_expiry_idx").on(table.expiresAt),
  ],
);
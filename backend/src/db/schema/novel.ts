import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * The canonical novel record.
 * Supports AniList catalog mapping and multi-source scrapers (NovelFire, NovelFull, WebNovel, Lnori).
 */
export const novel = pgTable(
  "novel",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull(),
    anilistId: integer("anilist_id"),
    title: varchar("title", { length: 500 }).notNull(),
    romajiTitle: varchar("romaji_title", { length: 500 }),
    englishTitle: varchar("english_title", { length: 500 }),
    nativeTitle: varchar("native_title", { length: 500 }),
    description: text("description"),
    author: varchar("author", { length: 255 }),
    coverUrl: text("cover_url"),
    bannerUrl: text("banner_url"),
    status: varchar("status", { length: 32 }).notNull().default("UNKNOWN"),
    genres: jsonb("genres").$type<string[]>().notNull().default([]),
    chapters: integer("chapters"),
    volumes: integer("volumes"),
    rating: varchar("rating", { length: 16 }),
    source: varchar("source", { length: 64 }).notNull().default("novelfire"),
    startYear: integer("start_year"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("novel_slug_unique").on(table.slug),
    index("novel_anilist_idx").on(table.anilistId),
    index("novel_source_idx").on(table.source),
  ],
);

/**
 * Novel chapters table.
 */
export const novelChapters = pgTable(
  "novel_chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    novelId: uuid("novel_id")
      .notNull()
      .references(() => novel.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number").notNull(),
    chapterSlug: varchar("chapter_slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    releaseDate: varchar("release_date", { length: 64 }),
    source: varchar("source", { length: 64 }).notNull().default("novelfire"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("novel_chapter_number_unique").on(table.novelId, table.chapterNumber),
    index("novel_chapter_slug_idx").on(table.novelId, table.chapterSlug),
  ],
);

/**
 * Novel chapter contents (persists fetched paragraphs so repeated reads are instantaneous).
 */
export const novelChapterContents = pgTable(
  "novel_chapter_contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    novelId: uuid("novel_id")
      .notNull()
      .references(() => novel.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number").notNull(),
    chapterSlug: varchar("chapter_slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    paragraphs: jsonb("paragraphs").$type<string[]>().notNull().default([]),
    content: text("content").notNull(),
    prevChapterSlug: varchar("prev_chapter_slug", { length: 255 }),
    nextChapterSlug: varchar("next_chapter_slug", { length: 255 }),
    source: varchar("source", { length: 64 }).notNull().default("novelfire"),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("novel_content_chapter_unique").on(table.novelId, table.chapterNumber),
    index("novel_content_slug_idx").on(table.novelId, table.chapterSlug),
  ],
);

/**
 * Cross-references between internal novel IDs and external providers (AniList, NovelFire, etc.).
 */
export const novelExternalIds = pgTable(
  "novel_external_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    novelId: uuid("novel_id")
      .notNull()
      .references(() => novel.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 32 }).notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("novel_id_type_unique").on(table.novelId, table.idType),
    unique("novel_external_lookup_unique").on(table.idType, table.externalId),
  ],
);

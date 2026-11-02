import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { anime } from "./anime.js";

/** User reviews for anime/manga */
export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  animeId: uuid("anime_id").references(() => anime.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  title: varchar("title", { length: 100 }),
  content: text("content").notNull(),
  isSpoiler: boolean("is_spoiler").notNull().default(false),
  helpfulVotes: integer("helpful_votes").notNull().default(0),
  totalVotes: integer("total_votes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Comments on reviews or anime episodes */
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  animeId: uuid("anime_id").references(() => anime.id, { onDelete: "cascade" }),
  reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isSpoiler: boolean("is_spoiler").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Comment likes/helpfulness */
export const commentLikes = pgTable("comment_likes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id")
    .notNull()
    .references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

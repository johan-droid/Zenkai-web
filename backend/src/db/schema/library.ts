import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * User library / watchlist entries.
 *
 * Persists a user's saved anime, manga, and novels in their account.
 * Associated strictly with a user ID; media catalog metadata is referenced
 * via canonical cross-reference mediaId rather than duplicated.
 */
export const userLibrary = pgTable(
  "user_library",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(), // anime | manga | novel
    mediaId: varchar("media_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(), // watching | plan | completed | dropped
    rating: numeric("rating", { precision: 3, scale: 1 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("user_library_unique").on(table.userId, table.kind, table.mediaId),
    index("user_library_user_kind_status_idx").on(table.userId, table.kind, table.status),
    index("user_library_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * User watch and reading progress records.
 *
 * Tracks per-unit (episode or chapter) position, duration, and completion status.
 * Reconciled across devices with Last-Write-Wins (LWW) conflict handling based on updatedAt.
 */
export const userProgress = pgTable(
  "user_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(), // anime | manga | novel
    mediaId: varchar("media_id", { length: 255 }).notNull(),
    unit: integer("unit").notNull(),
    positionSeconds: integer("position_seconds").notNull().default(0),
    durationSeconds: integer("duration_seconds"),
    page: integer("page"),
    totalUnits: integer("total_units"),
    completed: boolean("completed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("user_progress_unique").on(table.userId, table.kind, table.mediaId, table.unit),
    index("user_progress_user_recent_idx").on(table.userId, table.updatedAt),
    index("user_progress_media_idx").on(table.userId, table.kind, table.mediaId),
  ],
);

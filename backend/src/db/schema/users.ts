import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  json,
  unique,
  index,
} from "drizzle-orm/pg-core";

/** Authoritative user identity record. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 32 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 64 }),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    // Encrypted settings stored as base64-encoded JSON blob
    // Contains: defaultServer, subtitleLanguage, theme, cardDensity, readerLayout, motionPreference
    settings: text("settings"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("users_username_unique").on(table.username),
    unique("users_email_unique").on(table.email),
    index("users_created_at_idx").on(table.createdAt),
  ],
);
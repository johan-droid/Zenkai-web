import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

/**
 * Authoritative user identity record.
 *
 * Designed for self-contained, high-performance PostgreSQL authentication.
 * Passwords are stored exclusively as cryptographic hashes (scrypt).
 * Raw passwords, bearer tokens, and session secrets are never stored here.
 */
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

/**
 * Ephemeral user sessions.
 *
 * Sessions are authenticated via a high-entropy random token held by the client
 * (in an HttpOnly, SameSite=Lax cookie or Authorization header). Only the SHA-256
 * digest of the token is stored in the database so a database snapshot leak cannot
 * compromise active sessions.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("user_sessions_token_hash_unique").on(table.tokenHash),
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

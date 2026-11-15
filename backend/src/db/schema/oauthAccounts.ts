import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Linked external OAuth identities (Google OIDC, AniList OAuth).
 *
 * Implements strict identity-binding constraints:
 * - An external account (provider + provider_user_id) cannot be linked to more than one Zenkai user.
 * - A Zenkai user can link at most one external account per provider.
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(), // 'google' | 'anilist'
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(), // Google 'sub' or AniList 'id'
    providerEmail: varchar("provider_email", { length: 255 }),
    providerUsername: varchar("provider_username", { length: 255 }),
    profileData: jsonb("profile_data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("oauth_accounts_provider_uid_unique").on(table.provider, table.providerUserId),
    unique("oauth_accounts_user_provider_unique").on(table.userId, table.provider),
    index("oauth_accounts_user_id_idx").on(table.userId),
    index("oauth_accounts_provider_lookup_idx").on(table.provider, table.providerUserId),
  ],
);

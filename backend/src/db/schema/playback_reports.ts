import { pgTable, uuid, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * General playback issue reporting table.
 *
 * Persists user-reported streaming, audio, and subtitle playback defects.
 * Strictly avoids persisting ephemeral signed URLs, private access tokens,
 * or provider credentials.
 */
export const playbackIssueReports = pgTable(
  "playback_issue_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: varchar("episode_id", { length: 128 }).notNull(),
    animeId: varchar("anime_id", { length: 128 }),
    providerSlug: varchar("provider_slug", { length: 64 }),
    sourceId: varchar("source_id", { length: 256 }),
    issueCategory: varchar("issue_category", { length: 64 }).notNull(),
    playbackTimestampSeconds: integer("playback_timestamp_seconds"),
    audioLanguage: varchar("audio_language", { length: 32 }),
    subtitleLanguage: varchar("subtitle_language", { length: 64 }),
    userDescription: text("user_description"),
    clientIpHash: varchar("client_ip_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 256 }),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_playback_issue_episode").on(table.episodeId),
    index("idx_playback_issue_category").on(table.issueCategory),
    index("idx_playback_issue_ip_created").on(table.clientIpHash, table.createdAt),
    index("idx_playback_issue_created").on(table.createdAt),
  ],
);

export type PlaybackIssueReport = typeof playbackIssueReports.$inferSelect;
export type NewPlaybackIssueReport = typeof playbackIssueReports.$inferInsert;

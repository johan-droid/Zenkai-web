import { pgTable, uuid, integer, varchar, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { episodes } from "./episodes.js";

/** Community-submitted skip timing data (Prompt 04). */
export const skipTimingCommunity = pgTable(
  "skip_timing_community",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    submitterAnilistId: integer("submitter_anilist_id"),

    /** Which segment this timing applies to: intro, outro, recap, preview. */
    segmentType: varchar("segment_type", { length: 32 }).notNull(),

    /** Timing values. */
    startSeconds: integer("start_seconds").notNull(),
    endSeconds: integer("end_seconds").notNull(),

    /** Optional: which version/cut this timing is for. */
    versionNote: varchar("version_note", { length: 128 }),

    /** How many users have validated this timing. */
    validationCount: integer("validation_count").notNull().default(1),
    /** Whether this timing has been verified by moderators or multiple users. */
    isVerified: boolean("is_verified").notNull().default(false),

    /** Source of the timing. */
    source: varchar("source", { length: 64 }).notNull().default("manual"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_skip_timing_episode").on(table.episodeId),
    index("idx_skip_timing_segment").on(table.episodeId, table.segmentType),
    index("idx_skip_timing_verified").on(table.episodeId, table.segmentType, table.isVerified),
  ],
);

/** User reports/corrections on skip timing accuracy. */
export const skipTimingReports = pgTable(
  "skip_timing_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skipTimingId: uuid("skip_timing_id")
      .notNull()
      .references(() => skipTimingCommunity.id, { onDelete: "cascade" }),

    /** Type of report: too_early, too_late, wrong_segment, incorrect. */
    reportType: varchar("report_type", { length: 32 }).notNull(),

    /** Optional correction values. */
    suggestedStartSeconds: integer("suggested_start_seconds"),
    suggestedEndSeconds: integer("suggested_end_seconds"),

    /** Reporter identifier. */
    reporterAnilistId: integer("reporter_anilist_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_skip_timing_reports_timing").on(table.skipTimingId),
  ],
);

/** Type for community skip timing entries. */
export interface CommunitySkipTiming {
  id: string;
  episodeId: string;
  submitterAnilistId: number | null;
  segmentType: "intro" | "outro" | "recap" | "preview";
  startSeconds: number;
  endSeconds: number;
  versionNote: string | null;
  validationCount: number;
  isVerified: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Type for timing reports. */
export interface SkipTimingReport {
  id: string;
  skipTimingId: string;
  reportType: "too_early" | "too_late" | "wrong_segment" | "incorrect";
  suggestedStartSeconds: number | null;
  suggestedEndSeconds: number | null;
  reporterAnilistId: number | null;
  createdAt: Date;
}

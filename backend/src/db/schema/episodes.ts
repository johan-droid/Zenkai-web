import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { anime } from "./anime.js";

/**
 * Episode catalog.
 *
 * An episode row is identity, not a stream: it answers "which episode is this"
 * and carries the provider ids needed to look one up downstream. Storing
 * playback URLs here would be wrong, because those rotate and expire while the
 * episode itself does not.
 */
export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),

    episodeNumber: integer("episode_number").notNull(),
    /** Number across the whole franchise, for long-running shows. */
    absoluteNumber: integer("absolute_number"),
    title: varchar("title", { length: 500 }),
    description: text("description"),
    durationSeconds: integer("duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),
    airDate: timestamp("air_date", { withTimezone: true }),
    /** Recap episodes carry no new story, so the UI can mark them. */
    isFiller: boolean("is_filler").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("anime_episode_num_unique").on(table.animeId, table.episodeNumber),
  ],
);

/**
 * Streaming-provider episode ids, keyed by the provider that issued them.
 *
 * AniList numbers episodes; providers like Hianime use opaque slugs. Storing
 * both means the resolver can go straight to a provider without re-deriving the
 * mapping on every playback request.
 */
export const episodeExternalIds = pgTable(
  "episode_external_ids",
  {
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    providerSlug: varchar("provider_slug", { length: 64 }).notNull(),
    externalId: varchar("external_id", { length: 512 }).notNull(),
    /** Set when the provider numbers the episode differently to us. */
    providerEpisodeNumber: integer("provider_episode_number"),
  },
  (table) => [unique("episode_provider_external_unique").on(table.providerSlug, table.externalId)],
);

/**
 * Per-episode playback metadata (P10).
 *
 * Only stable, non-secret playback metadata lives here: intro/outro marker
 * offsets, source-refresh time, and subtitle *descriptors*. Sidecar URLs are
 * ephemeral (they rotate with the stream) and are never persisted: a stored
 * subtitle URL can be dead within days, and a signed one would be a credential
 * leak into PostgreSQL. P8 executions and P9 relays write nothing to this
 * table.
 */
export const episodePlaybackMeta = pgTable("episode_playback_meta", {
  episodeId: uuid("episode_id")
    .primaryKey()
    .references(() => episodes.id, { onDelete: "cascade" }),
  introStartSeconds: integer("intro_start_seconds"),
  introEndSeconds: integer("intro_end_seconds"),
  outroStartSeconds: integer("outro_start_seconds"),
  outroEndSeconds: integer("outro_end_seconds"),
  /**
   * Non-secret subtitle descriptors only: which languages and kinds a title
   * has. URLs belong to the ephemeral, per-request playback plan (P6) and
   * stay out of the row. The $type annotation is the enforcement boundary.
   */
  subtitles: jsonb("subtitles")
    .$type<Array<{ language: string; kind?: string }>>()
    .notNull()
    .default([]),
  /** When this row was last refreshed, so stale markers can be re-derived. */
  sourceUpdatedAt: integer("source_updated_at"),
});

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  real,
  unique,
  index,
} from "drizzle-orm/pg-core";

/**
 * Provider registry.
 *
 * `providers` is the durable record of which upstreams exist; live health is
 * tracked separately (see `providerHealth`) because it is a fast-moving signal.
 */
export const providers = pgTable("providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  /** METADATA | STREAMING | MANGA | NOVEL. */
  kind: varchar("kind", { length: 32 }).notNull().default("METADATA"),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  /** Set for adapters defined in this codebase rather than configured remotely. */
  isCustomAdapter: boolean("is_custom_adapter").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One playable endpoint exposed by a streaming provider.
 *
 * Capabilities are declared rather than inferred, so the resolver can skip a
 * provider that cannot serve the requested access type instead of paying for a
 * round trip that cannot succeed.
 */
export const providerEndpoints = pgTable(
  "provider_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(), // sub, dub, multi
    displayName: varchar("display_name", { length: 128 }).notNull(),
    language: varchar("language", { length: 16 }).notNull().default("sub"), // sub | dub | multi
    accessType: varchar("access_type", { length: 16 }).notNull().default("direct"), // direct | embed | hls | mp4
    badge: varchar("badge", { length: 32 }), // Direct HD, Fast Embed
    urlTemplate: text("url_template"), // e.g. https://provider.to/watch/{mal_id}/{episode}
    /** Which id space urlTemplate interpolates: anilist | mal | tmdb. */
    requiredIdType: varchar("required_id_type", { length: 32 }).notNull().default("anilist"),
    /** Highest vertical resolution this endpoint is known to serve. */
    maxResolution: integer("max_resolution"),
    active: boolean("active").notNull().default(true),
    priority: integer("priority").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("provider_endpoint_slug_unique").on(table.providerId, table.slug),
  ],
);

/**
 * Rolling provider health (P7/P19).
 *
 * Persisted so a restart does not blind the resolver to a provider that has been
 * dead for an hour. Scores decay on read, so a provider that recovers climbs
 * back without needing a manual reset.
 */
export const providerHealth = pgTable(
  "provider_health",
  {
    providerSlug: varchar("provider_slug", { length: 64 }).notNull(),
    endpointSlug: varchar("endpoint_slug", { length: 64 }).notNull().default("default"),
    successStreak: integer("success_streak").notNull().default(0),
    failureStreak: integer("failure_streak").notNull().default(0),
    /** Exponentially weighted success rate, 0-1. */
    score: real("score").notNull().default(1),
    avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [unique("provider_health_key").on(table.providerSlug, table.endpointSlug)],
);

/**
 * Append-only request log for observability (P19).
 *
 * This is what answers "was this provider broken at 3am, or was that just me?".
 * Kept apart from health so history survives scoring and can be pruned on a
 * schedule without disturbing the live signal.
 */
export const providerRequests = pgTable(
  "provider_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerSlug: varchar("provider_slug", { length: 64 }).notNull(),
    endpointSlug: varchar("endpoint_slug", { length: 64 }).notNull().default("default"),
    operation: varchar("operation", { length: 64 }).notNull(),
    /** OK | EMPTY | ERROR | TIMEOUT | BLOCKED. */
    outcome: varchar("outcome", { length: 32 }).notNull(),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms").notNull(),
    itemCount: integer("item_count"),
    error: text("error"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("provider_requests_time_idx").on(table.requestedAt)],
);

/**
 * Cache of validated source candidates (P8).
 *
 * Stream URLs are signed and expire, so rows are short-lived by design. Caching
 * them still pays, because the fan-out that discovers them is the expensive part.
 */
export const sourceCache = pgTable(
  "source_cache",
  {
    episodeId: uuid("episode_id").notNull(),
    language: varchar("language", { length: 16 }).notNull().default("sub"),
    sources: jsonb("sources").$type<unknown[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("source_cache_key").on(table.episodeId, table.language),
    index("source_cache_expiry_idx").on(table.expiresAt),
  ],
);

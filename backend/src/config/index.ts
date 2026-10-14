/**
 * Environment configuration.
 *
 * Every tunable is read and validated once, here. Downstream code imports the
 * typed `config` object instead of reaching into `process.env`, so a missing or
 * malformed variable fails at boot with a clear message rather than surfacing as
 * an undefined halfway through a request.
 */

import dotenv from "dotenv";
import { z } from "zod";

// Load `.env` before reading anything. This module is imported first by the
// composition root, so doing it here is the only point guaranteed to run before
// the schema below samples `process.env`. Loading it later (from the database
// client, say) would leave every variable reading as undefined at this point,
// and the defaults would silently win over the file.
dotenv.config();

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase()),
  );

/**
 * Whether a string is a timezone this runtime actually knows.
 *
 * Checked with Intl rather than a list, so it accepts whatever the host's ICU
 * data supports and rejects a typo immediately at boot instead of throwing on
 * the first schedule request.
 */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: z.string().min(1).default("postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /** Redis is optional: the cache degrades to an in-process LRU when absent. */
  REDIS_URL: z.string().optional(),

  /** Applied to every outbound provider request. */
  PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).default(8000),
  PROVIDER_HTTP_RETRIES: z.coerce.number().int().min(0).max(5).default(1),

  ANILIST_ENDPOINT: z.string().url().default("https://graphql.anilist.co"),
  JIKAN_ENDPOINT: z.string().url().default("https://api.jikan.moe/v4"),
  MANGADEX_ENDPOINT: z.string().url().default("https://api.mangadex.org"),
  /**
   * Cover images live on a separate CDN from the API. Overridable because
   * self-hosted mirrors and test doubles are common in development.
   */
  MANGADEX_UPLOADS_ENDPOINT: z.string().url().default("https://uploads.mangadex.org"),

  /** Remote Consumet instance, used only when in-process scraping is off. */
  CONSUMET_URL: z.string().url().optional(),
  /** Use the in-process @consumet/extensions scrapers. */
  CONSUMET_INPROCESS: booleanish.default(true),

  /** Self-hosted / licensed endpoints. These need no scraping. */
  SELF_HOSTED_BASE_URL: z.string().url().optional(),

  /**
   * Scrape providers host unlicensed copies. Enabling one is a licensing
   * decision for whoever operates this service, so they are opt-in.
   */
  MIRURO_URL: z.string().url().optional(),
  ANIPUB_URL: z.string().url().optional(),

  /** Include the public demo HLS streams so the player can be exercised. */
  ENABLE_DEMO_STREAMS: booleanish.default(false),

  /** Proxy upstream media through this service (needed for CORS/referer walls). */
  ENABLE_PLAYBACK_PROXY: booleanish.default(false),
  /** Hosts the playback gateway is permitted to fetch from. */
  PLAYBACK_PROXY_ALLOWLIST: z.string().optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

  /**
   * Timezone whose calendar days define "today" and "this week" in the schedule.
   *
   * Airing timestamps are always stored in UTC and are never affected by this.
   * It only decides where the day boundary falls, so a viewer in Tokyo sees the
   * JST day rather than a window that cuts their evening shows in half.
   *
   * Defaults to UTC, which is what the service did before this was configurable.
   * Any IANA zone name is accepted (`Asia/Tokyo`, `America/New_York`); it is
   * validated at boot rather than at request time so a typo fails loudly
   * immediately instead of once a day view is requested.
   */
  SCHEDULE_TIMEZONE: z.string().refine(isValidTimeZone, {
    message: "must be an IANA timezone name, e.g. UTC or Asia/Tokyo",
  }).default("UTC"),

  /** How long discovery payloads stay warm in Redis before a refetch. */
  CACHE_TTL_DISCOVERY_S: z.coerce.number().int().min(1).default(1800),
  CACHE_TTL_METADATA_S: z.coerce.number().int().min(1).default(86_400),
});

export type Config = z.infer<typeof schema> & {
  playbackProxyAllowlist: string[];
};

function load(): Config {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid backend configuration:\n${detail}`);
  }

  const value = parsed.data;

  return {
    ...value,
    playbackProxyAllowlist: (value.PLAYBACK_PROXY_ALLOWLIST ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  };
}

export const config: Config = load();

/** True when running with a real database configured rather than the default. */
export const isProduction = config.NODE_ENV === "production";
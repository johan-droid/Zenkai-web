"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc4) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc4 = __getOwnPropDesc(from, key)) || desc4.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/config/index.ts
function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
    throw new Error(`Invalid backend configuration:
${detail}`);
  }
  const value = parsed.data;
  return {
    ...value,
    playbackProxyAllowlist: (value.PLAYBACK_PROXY_ALLOWLIST ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
  };
}
var import_dotenv, import_zod, booleanish, schema, config, isProduction;
var init_config = __esm({
  "src/config/index.ts"() {
    "use strict";
    import_dotenv = __toESM(require("dotenv"), 1);
    import_zod = require("zod");
    import_dotenv.default.config();
    booleanish = import_zod.z.union([import_zod.z.boolean(), import_zod.z.string()]).transform(
      (value) => typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase())
    );
    schema = import_zod.z.object({
      NODE_ENV: import_zod.z.enum(["development", "test", "production"]).default("development"),
      HOST: import_zod.z.string().default("0.0.0.0"),
      PORT: import_zod.z.coerce.number().int().min(1).max(65535).default(4e3),
      DATABASE_URL: import_zod.z.string().min(1).default("postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable"),
      DATABASE_POOL_MAX: import_zod.z.coerce.number().int().min(1).max(100).default(10),
      /** Redis is optional: the cache degrades to an in-process LRU when absent. */
      REDIS_URL: import_zod.z.string().optional(),
      /** Applied to every outbound provider request. */
      PROVIDER_HTTP_TIMEOUT_MS: import_zod.z.coerce.number().int().min(500).default(8e3),
      PROVIDER_HTTP_RETRIES: import_zod.z.coerce.number().int().min(0).max(5).default(1),
      ANILIST_ENDPOINT: import_zod.z.string().url().default("https://graphql.anilist.co"),
      JIKAN_ENDPOINT: import_zod.z.string().url().default("https://api.jikan.moe/v4"),
      MANGADEX_ENDPOINT: import_zod.z.string().url().default("https://api.mangadex.org"),
      /**
       * Cover images live on a separate CDN from the API. Overridable because
       * self-hosted mirrors and test doubles are common in development.
       */
      MANGADEX_UPLOADS_ENDPOINT: import_zod.z.string().url().default("https://uploads.mangadex.org"),
      /** Remote Consumet instance, used only when in-process scraping is off. */
      CONSUMET_URL: import_zod.z.string().url().optional(),
      /** Use the in-process @consumet/extensions scrapers. */
      CONSUMET_INPROCESS: booleanish.default(true),
      /** Self-hosted / licensed endpoints. These need no scraping. */
      SELF_HOSTED_BASE_URL: import_zod.z.string().url().optional(),
      /**
       * Scrape providers host unlicensed copies. Enabling one is a licensing
       * decision for whoever operates this service, so they are opt-in.
       */
      MIRURO_URL: import_zod.z.string().url().optional(),
      ANIPUB_URL: import_zod.z.string().url().optional(),
      /** Include the public demo HLS streams so the player can be exercised. */
      ENABLE_DEMO_STREAMS: booleanish.default(false),
      /** Proxy upstream media through this service (needed for CORS/referer walls). */
      ENABLE_PLAYBACK_PROXY: booleanish.default(false),
      /** Hosts the playback gateway is permitted to fetch from. */
      PLAYBACK_PROXY_ALLOWLIST: import_zod.z.string().optional(),
      RATE_LIMIT_MAX: import_zod.z.coerce.number().int().min(1).default(120),
      RATE_LIMIT_WINDOW_MS: import_zod.z.coerce.number().int().min(1e3).default(6e4),
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
      SCHEDULE_TIMEZONE: import_zod.z.string().refine(isValidTimeZone, {
        message: "must be an IANA timezone name, e.g. UTC or Asia/Tokyo"
      }).default("UTC"),
      /** How long discovery payloads stay warm in Redis before a refetch. */
      CACHE_TTL_DISCOVERY_S: import_zod.z.coerce.number().int().min(1).default(1800),
      CACHE_TTL_METADATA_S: import_zod.z.coerce.number().int().min(1).default(86400)
    });
    config = load();
    isProduction = config.NODE_ENV === "production";
  }
});

// src/http/errors.ts
function isAbortError(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
var AppError;
var init_errors = __esm({
  "src/http/errors.ts"() {
    "use strict";
    AppError = class _AppError extends Error {
      reason;
      statusCode;
      details;
      constructor(reason, message, statusCode, details) {
        super(message);
        this.name = "AppError";
        this.reason = reason;
        this.statusCode = statusCode;
        this.details = details;
      }
      static badRequest(message, details) {
        return new _AppError("bad_request", message, 400, details);
      }
      static notFound(message, details) {
        return new _AppError("not_found", message, 404, details);
      }
      /**
       * Every eligible provider was tried and none returned a playable source.
       *
       * 200 with an empty list is defensible for a valid episode with no streams,
       * but when providers errored we surface 503 so a client can retry rather than
       * caching a permanent "nothing here" verdict.
       */
      static noSources(message, details) {
        return new _AppError("no_sources", message, 503, details);
      }
      static internal(message, details) {
        return new _AppError("internal", message, 500, details);
      }
      /** The client referenced a source that no longer resolves for this episode. */
      static selectionStale(message, details) {
        return new _AppError("selection_stale", message, 409, details);
      }
    };
  }
});

// src/http/client.ts
async function withHostThrottle(host, task) {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  let release = () => {
  };
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate, () => gate);
  hostQueues.set(host, chained);
  try {
    await previous.catch(() => void 0);
    return await task();
  } finally {
    release();
    queueMicrotask(() => {
      if (hostQueues.get(host) === chained) hostQueues.delete(host);
    });
  }
}
async function fetchJson(url2, options = {}) {
  const timeoutMs = options.timeoutMs ?? config.PROVIDER_HTTP_TIMEOUT_MS;
  const retries = options.retries ?? config.PROVIDER_HTTP_RETRIES;
  const host = new URL(url2).host;
  return withHostThrottle(host, async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await fetch(url2, {
          method: options.method ?? "GET",
          headers: {
            ...DEFAULT_HEADERS,
            ...options.body !== void 0 ? { "content-type": "application/json" } : {},
            ...options.headers
          },
          body: options.body !== void 0 ? JSON.stringify(options.body) : void 0,
          signal: controller.signal,
          redirect: "follow"
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(
              Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : 300 * 2 ** attempt
            );
            continue;
          }
          throw new AppError(
            response.status === 429 ? "rate_limited" : "upstream_error",
            `upstream ${host} responded ${response.status}`,
            response.status === 429 ? 429 : 502,
            { status: response.status, body: detail.slice(0, 500) }
          );
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (error instanceof AppError) throw error;
        if (options.signal?.aborted) throw error;
        if (isAbortError(error)) {
          if (attempt < retries) {
            await sleep(300 * 2 ** attempt);
            continue;
          }
          throw new AppError("provider_timeout", `request to ${host} timed out`, 504, {
            host,
            timeoutMs
          });
        }
        if (attempt < retries) {
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw new AppError("upstream_error", `request to ${host} failed`, 502, {
          host,
          cause: errorMessage(error)
        });
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
    throw new AppError("upstream_error", `request to ${host} failed`, 502, {
      cause: errorMessage(lastError)
    });
  });
}
async function probeUrl(url2, options = {}) {
  const timeoutMs = options.timeoutMs ?? 6e3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url2, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": DEFAULT_HEADERS["user-agent"], ...options.headers }
    });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? void 0,
      latencyMs: Date.now() - started
    };
  } catch {
    return { ok: false, status: 0, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
var RETRYABLE_STATUS, hostQueues, DEFAULT_HEADERS, sleep;
var init_client = __esm({
  "src/http/client.ts"() {
    "use strict";
    init_config();
    init_errors();
    RETRYABLE_STATUS = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504]);
    hostQueues = /* @__PURE__ */ new Map();
    DEFAULT_HEADERS = {
      "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
      accept: "application/json"
    };
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  }
});

// src/domain/media.ts
function stripHtml(input) {
  if (!input) return null;
  const withoutTags = input.replace(BLOCK_TAGS, "\n").replace(/<[^>]+>/g, "");
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " "
  };
  const decoded = withoutTags.replace(
    /&[a-z#0-9]+;/gi,
    (entity) => entities[entity.toLowerCase()] ?? entity
  );
  const trimmed = decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return trimmed.length > 0 ? trimmed : null;
}
function displayTitle(title, fallback = "Untitled") {
  const candidate = title.preferred ?? title.english ?? title.romaji ?? title.native ?? null;
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
function normalizeTitle(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{Letter}\p{Number}\s]/gu, " ").replace(/\b(the|a|an|and|of)\b/g, " ").replace(/\s+/g, " ").trim();
}
var BLOCK_TAGS;
var init_media = __esm({
  "src/domain/media.ts"() {
    "use strict";
    BLOCK_TAGS = /<\/?(?:p|div|li|br|h[1-6]|section|article)\b[^>]*>/gi;
  }
});

// src/providers/metadata/jikan.ts
var jikan_exports = {};
__export(jikan_exports, {
  JikanProvider: () => JikanProvider
});
function toStatus(entry) {
  const raw = (entry.status ?? "").toLowerCase();
  if (entry.airing || raw.includes("currently airing")) return "RELEASING";
  if (raw.includes("not yet aired")) return "NOT_YET_RELEASED";
  if (raw.includes("finished")) return "FINISHED";
  if (raw.includes("on hold")) return "HIATUS";
  if (raw.includes("discontinued")) return "CANCELLED";
  return "UNKNOWN";
}
function toMinutes(duration) {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*min/i);
  return match ? Number(match[1]) : null;
}
function formatToEnum(format) {
  switch ((format ?? "").toUpperCase()) {
    case "TV":
      return "TV";
    case "TV SHORT":
      return "TV_SHORT";
    case "MOVIE":
    case "FILM":
      return "MOVIE";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "SPECIAL":
      return "SPECIAL";
    case "MUSIC":
      return "MUSIC";
    default:
      return null;
  }
}
function synonymsOf(entry) {
  const fromTitles = (entry.titles ?? []).map((item) => item.title);
  return Array.from(
    new Set(
      [entry.title, entry.title_english, entry.title_japanese, ...fromTitles].filter(
        (value) => typeof value === "string" && value.length > 0
      )
    )
  );
}
var JikanProvider;
var init_jikan = __esm({
  "src/providers/metadata/jikan.ts"() {
    "use strict";
    init_config();
    init_client();
    init_media();
    JikanProvider = class {
      slug = "jikan";
      name = "Jikan (MyAnimeList)";
      priority = 2;
      #endpoint = config.JIKAN_ENDPOINT;
      /** Fetch one MAL entry by id, with relations. Returns null for a 404. */
      async getByMalId(malId) {
        const response = await fetchJson(
          `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}/full`
        );
        if (!response?.data) return null;
        return this.#toDetail(response.data);
      }
      /** Cheap existence check used before paying for a full enrichment fetch. */
      async hasMalId(malId) {
        const response = await fetchJson(
          `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}`
        );
        return Boolean(response?.data);
      }
      /**
       * Airing slots from Jikan, used as a fallback when AniList has no data.
       *
       * Jikan reports `airing: true/false` and a `broadcast` object with the day and
       * time, but no episode number. The slot returned here is a best-effort
       * projection: episode 1 at the next broadcast time. The schedule service
       * extrapolates from there.
       */
      async getAiringSlots(malId) {
        const response = await fetchJson(
          `${this.#endpoint}/anime/${encodeURIComponent(String(malId))}`
        );
        const entry = response?.data;
        if (!entry?.airing) return [];
        const broadcast = entry.broadcast;
        if (!broadcast?.day || !broadcast?.time) return [];
        const dayMap = {
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
          sunday: 0
        };
        const targetDay = dayMap[broadcast.day.toLowerCase()] ?? 0;
        const [hours, minutes] = broadcast.time.split(":").map(Number);
        const now = /* @__PURE__ */ new Date();
        const next = new Date(now);
        next.setUTCHours(hours, minutes, 0, 0);
        const currentDay = now.getUTCDay();
        let delta = targetDay - currentDay;
        if (delta < 0) delta += 7;
        if (delta === 0 && next.getTime() <= now.getTime()) delta = 7;
        next.setUTCDate(next.getUTCDate() + delta);
        return [
          {
            episodeNumber: 1,
            airingAt: Math.floor(next.getTime() / 1e3),
            status: "NOT_YET_AIRRED"
          }
        ];
      }
      #toSummary(entry) {
        const titles = {
          romaji: entry.title ?? null,
          english: entry.title_english ?? null,
          native: entry.title_japanese ?? null,
          synonyms: synonymsOf(entry)
        };
        return {
          // Jikan has no AniList id. An empty string marks the record as
          // not-yet-mapped; the merge step fills it from the AniList record rather
          // than inventing a cross-provider link.
          anilistId: "",
          titles,
          canonicalTitle: displayTitle(titles, "Untitled"),
          description: stripHtml(entry.synopsis),
          coverUrl: entry.images?.jpg?.image_url ?? null,
          coverImageLarge: entry.images?.jpg?.large_image_url ?? null,
          bannerUrl: null,
          format: formatToEnum(entry.type),
          status: toStatus(entry),
          isAdult: false,
          year: entry.year ?? null,
          season: entry.season?.toUpperCase() ?? null,
          seasonYear: entry.year ?? null,
          // MAL is 0-10; scale to AniList's 0-100 so scores stay comparable.
          averageScore: entry.score != null ? entry.score * 10 : null,
          popularity: entry.popularity ?? null,
          favourites: entry.members ?? null,
          totalEpisodes: entry.episodes ?? null,
          durationMinutes: toMinutes(entry.duration),
          genres: [
            ...entry.genres ?? [],
            ...entry.themes ?? [],
            ...entry.demographics ?? []
          ].map((genre) => genre.name),
          studios: [],
          externalIds: { mal: String(entry.mal_id) },
          sourceUpdatedAt: null
        };
      }
      #toDetail(entry) {
        const summary = this.#toSummary(entry);
        const relations = (entry.relations ?? []).flatMap(
          (group) => group.entry.map((related) => ({
            // MAL relation prose ("Side story") mapped to AniList's enum style.
            type: group.relation.replace(/\s+/g, "_").toUpperCase(),
            anilistId: 0,
            title: related.name,
            coverUrl: null
          }))
        );
        return { ...summary, relations, nextAiringEpisode: null, episodes: void 0 };
      }
    };
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  getApp: () => getApp,
  handler: () => handler2
});
module.exports = __toCommonJS(index_exports);
init_config();

// src/app.ts
var import_fastify = __toESM(require("fastify"), 1);
var import_cors = __toESM(require("@fastify/cors"), 1);
var import_rate_limit = __toESM(require("@fastify/rate-limit"), 1);
var import_drizzle_orm6 = require("drizzle-orm");
init_config();

// src/db/client.ts
var import_postgres_js = require("drizzle-orm/postgres-js");
var import_postgres = __toESM(require("postgres"), 1);
var import_ioredis = require("ioredis");
init_config();

// src/cache/index.ts
init_config();
var MemoryCache = class {
  #entries = /* @__PURE__ */ new Map();
  #max;
  constructor(max = 2e3) {
    this.#max = max;
  }
  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return void 0;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return void 0;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }
  set(key, value, ttlSeconds) {
    if (this.#entries.size >= this.#max) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1e3 });
  }
  delete(key) {
    this.#entries.delete(key);
  }
  get size() {
    return this.#entries.size;
  }
  clear() {
    this.#entries.clear();
  }
};
var Cache = class {
  #memory = new MemoryCache();
  #redis = null;
  #redisHealthy = false;
  /** Attach a Redis client. Called once at boot by the composition root. */
  attachRedis(client) {
    this.#redis = client;
    this.#redisHealthy = true;
    client.on("error", () => {
      this.#redisHealthy = false;
    });
  }
  async get(key) {
    const raw = await this.#readRaw(key);
    if (raw === void 0) return void 0;
    try {
      return JSON.parse(raw);
    } catch {
      await this.delete(key);
      return void 0;
    }
  }
  async set(key, value, ttlSeconds) {
    const raw = JSON.stringify(value);
    this.#memory.set(key, raw, ttlSeconds);
    await this.#writeRaw(key, raw, ttlSeconds);
  }
  async delete(key) {
    this.#memory.delete(key);
    if (this.#redis && this.#redisHealthy) {
      await this.#redis.del(key).catch(() => void 0);
    }
  }
  /**
   * Drop every cached entry in the in-process tier.
   *
   * Redis is left alone: it is a shared tier, and a local "clear" that silently
   * invalidated another process's entries would be worse than not offering it.
   * Exists for test isolation and for the case where a bad deploy has poisoned
   * the memory tier and only a restart would otherwise clear it.
   */
  clear() {
    this.#memory.clear();
  }
  #inFlight = /* @__PURE__ */ new Map();
  /** Read-through helper: return the cached value, else compute and store it. */
  async remember(key, ttlSeconds, producer) {
    const cached = await this.get(key);
    if (cached !== void 0) return { value: cached, hit: true };
    let pending = this.#inFlight.get(key);
    if (!pending) {
      pending = producer().finally(() => {
        this.#inFlight.delete(key);
      });
      this.#inFlight.set(key, pending);
    }
    const value = await pending;
    await this.set(key, value, ttlSeconds).catch(() => void 0);
    return { value, hit: false };
  }
  async #readRaw(key) {
    const local = this.#memory.get(key);
    if (local !== void 0) return local;
    if (this.#redis && this.#redisHealthy) {
      const remote = await this.#redis.get(key).catch(() => void 0);
      if (typeof remote === "string") {
        const ttl = await this.#redis.ttl(key).catch(() => -1);
        const promoteTtlS = ttl > 0 ? Math.min(ttl, config.CACHE_TTL_DISCOVERY_S) : config.CACHE_TTL_DISCOVERY_S;
        this.#memory.set(key, remote, promoteTtlS);
        return remote;
      }
    }
    return void 0;
  }
  async #writeRaw(key, raw, ttlSeconds) {
    if (!this.#redis || !this.#redisHealthy) return;
    await this.#redis.set(key, raw, "EX", ttlSeconds).catch(() => void 0);
  }
};
var cache = new Cache();

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  airingSchedule: () => airingSchedule,
  anime: () => anime,
  animeExternalIds: () => animeExternalIds,
  animeGenres: () => animeGenres,
  animeRelations: () => animeRelations,
  animeSearchIndex: () => animeSearchIndex,
  animeStudios: () => animeStudios,
  episodeExternalIds: () => episodeExternalIds,
  episodePlaybackMeta: () => episodePlaybackMeta,
  episodes: () => episodes,
  manga: () => manga,
  mangaChapterPages: () => mangaChapterPages,
  mangaChapters: () => mangaChapters,
  mangaCredits: () => mangaCredits,
  mangaExternalIds: () => mangaExternalIds,
  mangaGenres: () => mangaGenres,
  mangaRelations: () => mangaRelations,
  mangaSearchIndex: () => mangaSearchIndex,
  providerEndpoints: () => providerEndpoints,
  providerHealth: () => providerHealth,
  providerRequests: () => providerRequests,
  providers: () => providers,
  sourceCache: () => sourceCache
});

// src/db/schema/anime.ts
var import_pg_core = require("drizzle-orm/pg-core");
var anime = (0, import_pg_core.pgTable)(
  "anime",
  {
    id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
    slug: (0, import_pg_core.varchar)("slug", { length: 255 }).notNull().unique(),
    /** The id this row was fetched under on its origin provider. */
    anilistId: (0, import_pg_core.integer)("anilist_id"),
    canonicalTitle: (0, import_pg_core.varchar)("canonical_title", { length: 500 }).notNull(),
    /** Provider spelling variants, kept for search and cross-provider matching. */
    synonyms: (0, import_pg_core.jsonb)("synonyms").$type().notNull().default([]),
    romajiTitle: (0, import_pg_core.varchar)("romaji_title", { length: 500 }),
    englishTitle: (0, import_pg_core.varchar)("english_title", { length: 500 }),
    nativeTitle: (0, import_pg_core.varchar)("native_title", { length: 500 }),
    description: (0, import_pg_core.text)("description"),
    coverUrl: (0, import_pg_core.text)("cover_url"),
    bannerUrl: (0, import_pg_core.text)("banner_url"),
    /** The largest available cover art, for detail headers. */
    coverImageLarge: (0, import_pg_core.text)("cover_image_large"),
    type: (0, import_pg_core.varchar)("type", { length: 32 }).notNull().default("ANIME"),
    format: (0, import_pg_core.varchar)("format", { length: 32 }),
    status: (0, import_pg_core.varchar)("status", { length: 32 }).notNull().default("FINISHED"),
    /** Re-broadcast or sequel entry, e.g. "G recap". */
    isAdult: (0, import_pg_core.boolean)("is_adult").notNull().default(false),
    year: (0, import_pg_core.integer)("year"),
    season: (0, import_pg_core.varchar)("season", { length: 16 }),
    seasonYear: (0, import_pg_core.integer)("season_year"),
    /** AniList uses 0-100; kept as-is so rankings compare like with like. */
    averageScore: (0, import_pg_core.numeric)("average_score", { precision: 4, scale: 2 }),
    popularity: (0, import_pg_core.integer)("popularity"),
    favourites: (0, import_pg_core.integer)("favourites"),
    totalEpisodes: (0, import_pg_core.integer)("total_episodes"),
    durationMinutes: (0, import_pg_core.integer)("duration_minutes"),
    /** "Mon", "Tue", ... as reported upstream; the schedule normalises these. */
    airingDayOfWeek: (0, import_pg_core.varchar)("airing_day_of_week", { length: 16 }),
    /** Next episode countdown, denormalised from AniList to avoid a second call. */
    nextAiringEpisode: (0, import_pg_core.jsonb)("next_airing_episode").$type(),
    /** Set when this row was enriched from a second provider (P2 merge step). */
    enrichedFrom: (0, import_pg_core.jsonb)("enriched_from").$type().notNull().default([]),
    /** Upstream version marker, so sync jobs can skip unchanged records. */
    sourceUpdatedAt: (0, import_pg_core.integer)("source_updated_at"),
    createdAt: (0, import_pg_core.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core.unique)("anime_anilist_id_unique").on(table.anilistId),
    // Discovery lists filter on these, so they need to be indexed rather than
    // left to a sequential scan over the whole catalog.
    (0, import_pg_core.index)("anime_trending_idx").on(table.status, table.averageScore, table.popularity),
    (0, import_pg_core.index)("anime_season_idx").on(table.season, table.seasonYear),
    (0, import_pg_core.index)("anime_updated_idx").on(table.sourceUpdatedAt)
  ]
);
var animeGenres = (0, import_pg_core.pgTable)(
  "anime_genres",
  {
    animeId: (0, import_pg_core.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    genre: (0, import_pg_core.varchar)("genre", { length: 64 }).notNull()
  },
  (table) => [(0, import_pg_core.primaryKey)({ columns: [table.animeId, table.genre] })]
);
var animeRelations = (0, import_pg_core.pgTable)(
  "anime_relations",
  {
    animeId: (0, import_pg_core.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    /** PREQUEL, SEQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE, PARENT, CHARACTER. */
    relationType: (0, import_pg_core.varchar)("relation_type", { length: 32 }).notNull(),
    relatedAnimeId: (0, import_pg_core.integer)("related_anilist_id").notNull(),
    relatedTitle: (0, import_pg_core.varchar)("related_title", { length: 500 }),
    coverUrl: (0, import_pg_core.text)("cover_url")
  },
  (table) => [(0, import_pg_core.primaryKey)({ columns: [table.animeId, table.relationType, table.relatedAnimeId] })]
);
var animeStudios = (0, import_pg_core.pgTable)(
  "anime_studios",
  {
    animeId: (0, import_pg_core.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    studioName: (0, import_pg_core.varchar)("studio_name", { length: 255 }).notNull(),
    /** True when this studio is the primary animation studio (vs. a co-producer). */
    isMain: (0, import_pg_core.boolean)("is_main").notNull().default(false)
  },
  (table) => [(0, import_pg_core.primaryKey)({ columns: [table.animeId, table.studioName] })]
);

// src/db/schema/episodes.ts
var import_pg_core2 = require("drizzle-orm/pg-core");
var episodes = (0, import_pg_core2.pgTable)(
  "episodes",
  {
    id: (0, import_pg_core2.uuid)("id").defaultRandom().primaryKey(),
    animeId: (0, import_pg_core2.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    episodeNumber: (0, import_pg_core2.integer)("episode_number").notNull(),
    /** Number across the whole franchise, for long-running shows. */
    absoluteNumber: (0, import_pg_core2.integer)("absolute_number"),
    title: (0, import_pg_core2.varchar)("title", { length: 500 }),
    description: (0, import_pg_core2.text)("description"),
    durationSeconds: (0, import_pg_core2.integer)("duration_seconds"),
    thumbnailUrl: (0, import_pg_core2.text)("thumbnail_url"),
    airDate: (0, import_pg_core2.timestamp)("air_date", { withTimezone: true }),
    /** Recap episodes carry no new story, so the UI can mark them. */
    isFiller: (0, import_pg_core2.boolean)("is_filler").notNull().default(false),
    createdAt: (0, import_pg_core2.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, import_pg_core2.timestamp)("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core2.unique)("anime_episode_num_unique").on(table.animeId, table.episodeNumber)
  ]
);
var episodeExternalIds = (0, import_pg_core2.pgTable)(
  "episode_external_ids",
  {
    episodeId: (0, import_pg_core2.uuid)("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    providerSlug: (0, import_pg_core2.varchar)("provider_slug", { length: 64 }).notNull(),
    externalId: (0, import_pg_core2.varchar)("external_id", { length: 512 }).notNull(),
    /** Set when the provider numbers the episode differently to us. */
    providerEpisodeNumber: (0, import_pg_core2.integer)("provider_episode_number")
  },
  (table) => [(0, import_pg_core2.unique)("episode_provider_external_unique").on(table.providerSlug, table.externalId)]
);
var episodePlaybackMeta = (0, import_pg_core2.pgTable)("episode_playback_meta", {
  episodeId: (0, import_pg_core2.uuid)("episode_id").primaryKey().references(() => episodes.id, { onDelete: "cascade" }),
  introStartSeconds: (0, import_pg_core2.integer)("intro_start_seconds"),
  introEndSeconds: (0, import_pg_core2.integer)("intro_end_seconds"),
  outroStartSeconds: (0, import_pg_core2.integer)("outro_start_seconds"),
  outroEndSeconds: (0, import_pg_core2.integer)("outro_end_seconds"),
  /**
   * Non-secret subtitle descriptors only: which languages and kinds a title
   * has. URLs belong to the ephemeral, per-request playback plan (P6) and
   * stay out of the row. The $type annotation is the enforcement boundary.
   */
  subtitles: (0, import_pg_core2.jsonb)("subtitles").$type().notNull().default([]),
  /** When this row was last refreshed, so stale markers can be re-derived. */
  sourceUpdatedAt: (0, import_pg_core2.integer)("source_updated_at")
});

// src/db/schema/external_ids.ts
var import_pg_core3 = require("drizzle-orm/pg-core");
var animeExternalIds = (0, import_pg_core3.pgTable)(
  "anime_external_ids",
  {
    id: (0, import_pg_core3.uuid)("id").defaultRandom().primaryKey(),
    animeId: (0, import_pg_core3.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    idType: (0, import_pg_core3.varchar)("id_type", { length: 32 }).notNull(),
    // anilist, mal, tmdb, kitsu, anidb
    externalId: (0, import_pg_core3.varchar)("external_id", { length: 255 }).notNull(),
    createdAt: (0, import_pg_core3.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core3.unique)("anime_id_type_unique").on(table.animeId, table.idType),
    (0, import_pg_core3.unique)("anime_external_lookup_unique").on(table.idType, table.externalId)
  ]
);
var animeSearchIndex = (0, import_pg_core3.pgTable)("anime_search_index", {
  animeId: (0, import_pg_core3.uuid)("anime_id").primaryKey().references(() => anime.id, { onDelete: "cascade" }),
  /** Lowercased, punctuation-stripped concatenation of every known title. */
  normalized: (0, import_pg_core3.text)("normalized").notNull(),
  /** Which title the token came from, for ranking an exact match higher. */
  isPrimary: (0, import_pg_core3.boolean)("is_primary").notNull().default(false)
});

// src/db/schema/manga.ts
var import_pg_core4 = require("drizzle-orm/pg-core");
var manga = (0, import_pg_core4.pgTable)(
  "manga",
  {
    id: (0, import_pg_core4.uuid)("id").defaultRandom().primaryKey(),
    slug: (0, import_pg_core4.varchar)("slug", { length: 255 }).notNull().unique(),
    /** The id this row was fetched under on its origin provider. */
    mangadexId: (0, import_pg_core4.varchar)("mangadex_id", { length: 64 }),
    canonicalTitle: (0, import_pg_core4.varchar)("canonical_title", { length: 500 }).notNull(),
    /** Alternative titles and romanisations; drives search and id matching. */
    synonyms: (0, import_pg_core4.jsonb)("synonyms").$type().notNull().default([]),
    altTitles: (0, import_pg_core4.jsonb)("alt_titles").$type().notNull().default([]),
    description: (0, import_pg_core4.text)("description"),
    coverUrl: (0, import_pg_core4.text)("cover_url"),
    coverImageLarge: (0, import_pg_core4.text)("cover_image_large"),
    bannerUrl: (0, import_pg_core4.text)("banner_url"),
    status: (0, import_pg_core4.varchar)("status", { length: 32 }).notNull().default("ONGOING"),
    /** MangaDex content rating: safe | suggestive | erotica | pornographic. */
    contentRating: (0, import_pg_core4.varchar)("content_rating", { length: 32 }).notNull().default("safe"),
    isAdult: (0, import_pg_core4.boolean)("is_adult").notNull().default(false),
    year: (0, import_pg_core4.integer)("year"),
    statusRaw: (0, import_pg_core4.varchar)("status_raw", { length: 64 }),
    originalLanguage: (0, import_pg_core4.varchar)("original_language", { length: 16 }),
    /** Publication-demographic tags ("Shounen", "Josei", ...). */
    demographics: (0, import_pg_core4.jsonb)("demographics").$type().notNull().default([]),
    totalChapters: (0, import_pg_core4.integer)("total_chapters"),
    totalVolumes: (0, import_pg_core4.integer)("total_volumes"),
    /** Chapters available in each tracked language, e.g. { en: 120 }. */
    chapterCounts: (0, import_pg_core4.jsonb)("chapter_counts").$type(),
    /** MangaDex exposes translatedChapterCount and followedCount. */
    translatedChapterCount: (0, import_pg_core4.integer)("translated_chapter_count"),
    followedCount: (0, import_pg_core4.integer)("followed_count"),
    rating: (0, import_pg_core4.varchar)("rating", { length: 8 }),
    createdAt: (0, import_pg_core4.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, import_pg_core4.timestamp)("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core4.unique)("manga_mangadex_id_unique").on(table.mangadexId),
    (0, import_pg_core4.index)("manga_followed_idx").on(table.followedCount),
    (0, import_pg_core4.index)("manga_status_idx").on(table.status)
  ]
);
var mangaGenres = (0, import_pg_core4.pgTable)(
  "manga_genres",
  {
    mangaId: (0, import_pg_core4.uuid)("manga_id").notNull().references(() => manga.id, { onDelete: "cascade" }),
    genre: (0, import_pg_core4.varchar)("genre", { length: 128 }).notNull(),
    /** MangaDex tags carry a grouping ("genre", "theme", "content"). */
    group: (0, import_pg_core4.varchar)("group", { length: 32 })
  },
  (table) => [(0, import_pg_core4.primaryKey)({ columns: [table.mangaId, table.genre] })]
);
var mangaCredits = (0, import_pg_core4.pgTable)(
  "manga_credits",
  {
    mangaId: (0, import_pg_core4.uuid)("manga_id").notNull().references(() => manga.id, { onDelete: "cascade" }),
    /** AUTHOR | ARTIST | EDITOR | PUBLISHER | LOCALIZER. */
    role: (0, import_pg_core4.varchar)("role", { length: 32 }).notNull(),
    name: (0, import_pg_core4.varchar)("name", { length: 255 }).notNull(),
    /** MangaDex author/artist ids, for cross-provider joins. */
    externalId: (0, import_pg_core4.varchar)("external_id", { length: 64 })
  },
  (table) => [(0, import_pg_core4.primaryKey)({ columns: [table.mangaId, table.role, table.name] })]
);
var mangaExternalIds = (0, import_pg_core4.pgTable)(
  "manga_external_ids",
  {
    id: (0, import_pg_core4.uuid)("id").defaultRandom().primaryKey(),
    mangaId: (0, import_pg_core4.uuid)("manga_id").notNull().references(() => manga.id, { onDelete: "cascade" }),
    idType: (0, import_pg_core4.varchar)("id_type", { length: 32 }).notNull(),
    // mangadex, anilist, mal, kitsu
    externalId: (0, import_pg_core4.varchar)("external_id", { length: 255 }).notNull(),
    createdAt: (0, import_pg_core4.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core4.unique)("manga_id_type_unique").on(table.mangaId, table.idType),
    (0, import_pg_core4.unique)("manga_external_lookup_unique").on(table.idType, table.externalId)
  ]
);
var mangaSearchIndex = (0, import_pg_core4.pgTable)("manga_search_index", {
  mangaId: (0, import_pg_core4.uuid)("manga_id").primaryKey().references(() => manga.id, { onDelete: "cascade" }),
  normalized: (0, import_pg_core4.text)("normalized").notNull(),
  isPrimary: (0, import_pg_core4.boolean)("is_primary").notNull().default(false)
});
var mangaRelations = (0, import_pg_core4.pgTable)(
  "manga_relations",
  {
    mangaId: (0, import_pg_core4.uuid)("manga_id").notNull().references(() => manga.id, { onDelete: "cascade" }),
    relationType: (0, import_pg_core4.varchar)("relation_type", { length: 32 }).notNull(),
    relatedMangaId: (0, import_pg_core4.varchar)("related_mangadex_id", { length: 64 }).notNull(),
    relatedTitle: (0, import_pg_core4.varchar)("related_title", { length: 500 }),
    coverUrl: (0, import_pg_core4.text)("cover_url")
  },
  (table) => [(0, import_pg_core4.primaryKey)({ columns: [table.mangaId, table.relationType, table.relatedMangaId] })]
);
var mangaChapters = (0, import_pg_core4.pgTable)(
  "manga_chapters",
  {
    id: (0, import_pg_core4.uuid)("id").defaultRandom().primaryKey(),
    mangaId: (0, import_pg_core4.uuid)("manga_id").notNull().references(() => manga.id, { onDelete: "cascade" }),
    /**
     * The provider's own chapter id.
     *
     * Kept separate from `id` on purpose: MangaDex keys page resolution by its
     * chapter uuid, and that uuid must not become our primary key. Renumbering,
     * merging or re-homing a chapter then never invalidates the external id.
     */
    mangadexChapterId: (0, import_pg_core4.varchar)("mangadex_chapter_id", { length: 64 }),
    /** Chapter number as written upstream; "12.5" and extra pages exist. */
    chapterNumber: (0, import_pg_core4.varchar)("chapter", { length: 32 }).notNull(),
    volume: (0, import_pg_core4.varchar)("volume", { length: 32 }),
    title: (0, import_pg_core4.varchar)("title", { length: 500 }),
    language: (0, import_pg_core4.varchar)("language", { length: 16 }).notNull().default("en"),
    translatedChapterCount: (0, import_pg_core4.integer)("translated_chapter_count").notNull().default(0),
    pages: (0, import_pg_core4.integer)("pages").notNull().default(0),
    publishedAt: (0, import_pg_core4.timestamp)("published_at", { withTimezone: true }),
    /** Link to a scanlation group. */
    scanlationGroup: (0, import_pg_core4.varchar)("scanlation_group", { length: 255 }),
    createdAt: (0, import_pg_core4.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, import_pg_core4.timestamp)("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    // Identity is manga + language + chapter, not the upstream uuid: re-fetching
    // the feed must update the existing row rather than accumulate duplicates.
    (0, import_pg_core4.unique)("manga_chapter_identity_unique").on(table.mangaId, table.language, table.chapterNumber),
    // Resolving a chapter's pages means going upstream id -> local chapter, so
    // that direction needs an index too.
    (0, import_pg_core4.unique)("manga_chapter_external_unique").on(table.mangadexChapterId),
    (0, import_pg_core4.index)("manga_chapters_order_idx").on(table.mangaId, table.language, table.chapterNumber)
  ]
);
var mangaChapterPages = (0, import_pg_core4.pgTable)(
  "manga_chapter_pages",
  {
    chapterId: (0, import_pg_core4.uuid)("chapter_id").notNull().references(() => mangaChapters.id, { onDelete: "cascade" }),
    /** 1-based, matching the reader's display order. */
    pageNumber: (0, import_pg_core4.integer)("page_number").notNull(),
    fileName: (0, import_pg_core4.varchar)("file_name", { length: 255 }).notNull(),
    /** At-home base URL this file name is relative to. */
    baseUrl: (0, import_pg_core4.text)("base_url").notNull(),
    hash: (0, import_pg_core4.varchar)("hash", { length: 64 }),
    expiresAt: (0, import_pg_core4.timestamp)("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    (0, import_pg_core4.primaryKey)({ columns: [table.chapterId, table.pageNumber] }),
    (0, import_pg_core4.index)("manga_chapter_pages_expiry_idx").on(table.expiresAt)
  ]
);

// src/db/schema/providers.ts
var import_pg_core5 = require("drizzle-orm/pg-core");
var providers = (0, import_pg_core5.pgTable)("providers", {
  id: (0, import_pg_core5.uuid)("id").defaultRandom().primaryKey(),
  slug: (0, import_pg_core5.varchar)("slug", { length: 64 }).notNull().unique(),
  name: (0, import_pg_core5.varchar)("name", { length: 128 }).notNull(),
  /** METADATA | STREAMING | MANGA | NOVEL. */
  kind: (0, import_pg_core5.varchar)("kind", { length: 32 }).notNull().default("METADATA"),
  active: (0, import_pg_core5.boolean)("active").notNull().default(true),
  priority: (0, import_pg_core5.integer)("priority").notNull().default(100),
  /** Set for adapters defined in this codebase rather than configured remotely. */
  isCustomAdapter: (0, import_pg_core5.boolean)("is_custom_adapter").notNull().default(false),
  createdAt: (0, import_pg_core5.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core5.timestamp)("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var providerEndpoints = (0, import_pg_core5.pgTable)(
  "provider_endpoints",
  {
    id: (0, import_pg_core5.uuid)("id").defaultRandom().primaryKey(),
    providerId: (0, import_pg_core5.uuid)("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    slug: (0, import_pg_core5.varchar)("slug", { length: 64 }).notNull(),
    // sub, dub, multi
    displayName: (0, import_pg_core5.varchar)("display_name", { length: 128 }).notNull(),
    language: (0, import_pg_core5.varchar)("language", { length: 16 }).notNull().default("sub"),
    // sub | dub | multi
    accessType: (0, import_pg_core5.varchar)("access_type", { length: 16 }).notNull().default("direct"),
    // direct | embed | hls | mp4
    badge: (0, import_pg_core5.varchar)("badge", { length: 32 }),
    // Direct HD, Fast Embed
    urlTemplate: (0, import_pg_core5.text)("url_template"),
    // e.g. https://provider.to/watch/{mal_id}/{episode}
    /** Which id space urlTemplate interpolates: anilist | mal | tmdb. */
    requiredIdType: (0, import_pg_core5.varchar)("required_id_type", { length: 32 }).notNull().default("anilist"),
    /** Highest vertical resolution this endpoint is known to serve. */
    maxResolution: (0, import_pg_core5.integer)("max_resolution"),
    active: (0, import_pg_core5.boolean)("active").notNull().default(true),
    priority: (0, import_pg_core5.integer)("priority").notNull().default(10),
    createdAt: (0, import_pg_core5.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    (0, import_pg_core5.unique)("provider_endpoint_slug_unique").on(table.providerId, table.slug)
  ]
);
var providerHealth = (0, import_pg_core5.pgTable)(
  "provider_health",
  {
    providerSlug: (0, import_pg_core5.varchar)("provider_slug", { length: 64 }).notNull(),
    endpointSlug: (0, import_pg_core5.varchar)("endpoint_slug", { length: 64 }).notNull().default("default"),
    successStreak: (0, import_pg_core5.integer)("success_streak").notNull().default(0),
    failureStreak: (0, import_pg_core5.integer)("failure_streak").notNull().default(0),
    /** Exponentially weighted success rate, 0-1. */
    score: (0, import_pg_core5.real)("score").notNull().default(1),
    avgLatencyMs: (0, import_pg_core5.integer)("avg_latency_ms").notNull().default(0),
    lastCheckedAt: (0, import_pg_core5.timestamp)("last_checked_at", { withTimezone: true }),
    lastSuccessAt: (0, import_pg_core5.timestamp)("last_success_at", { withTimezone: true }),
    lastError: (0, import_pg_core5.text)("last_error")
  },
  (table) => [(0, import_pg_core5.unique)("provider_health_key").on(table.providerSlug, table.endpointSlug)]
);
var providerRequests = (0, import_pg_core5.pgTable)(
  "provider_requests",
  {
    id: (0, import_pg_core5.uuid)("id").defaultRandom().primaryKey(),
    providerSlug: (0, import_pg_core5.varchar)("provider_slug", { length: 64 }).notNull(),
    endpointSlug: (0, import_pg_core5.varchar)("endpoint_slug", { length: 64 }).notNull().default("default"),
    operation: (0, import_pg_core5.varchar)("operation", { length: 64 }).notNull(),
    /** OK | EMPTY | ERROR | TIMEOUT | BLOCKED. */
    outcome: (0, import_pg_core5.varchar)("outcome", { length: 32 }).notNull(),
    statusCode: (0, import_pg_core5.integer)("status_code"),
    latencyMs: (0, import_pg_core5.integer)("latency_ms").notNull(),
    itemCount: (0, import_pg_core5.integer)("item_count"),
    error: (0, import_pg_core5.text)("error"),
    requestedAt: (0, import_pg_core5.timestamp)("requested_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [(0, import_pg_core5.index)("provider_requests_time_idx").on(table.requestedAt)]
);
var sourceCache = (0, import_pg_core5.pgTable)(
  "source_cache",
  {
    episodeId: (0, import_pg_core5.uuid)("episode_id").notNull(),
    language: (0, import_pg_core5.varchar)("language", { length: 16 }).notNull().default("sub"),
    sources: (0, import_pg_core5.jsonb)("sources").$type().notNull(),
    fetchedAt: (0, import_pg_core5.timestamp)("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: (0, import_pg_core5.timestamp)("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    (0, import_pg_core5.unique)("source_cache_key").on(table.episodeId, table.language),
    (0, import_pg_core5.index)("source_cache_expiry_idx").on(table.expiresAt)
  ]
);

// src/db/schema/schedule.ts
var import_pg_core6 = require("drizzle-orm/pg-core");
var airingSchedule = (0, import_pg_core6.pgTable)(
  "airing_schedule",
  {
    id: (0, import_pg_core6.uuid)("id").defaultRandom().primaryKey(),
    animeId: (0, import_pg_core6.uuid)("anime_id").notNull().references(() => anime.id, { onDelete: "cascade" }),
    episodeNumber: (0, import_pg_core6.integer)("episode_number").notNull(),
    /** When the episode airs, in UTC. The API renders it in the request's zone. */
    airingAt: (0, import_pg_core6.timestamp)("airing_at", { withTimezone: true }).notNull(),
    /**
     * Airing status for this slot. NOT_YET_AIRRED rows are what make the
     * "next episode countdown" possible.
     */
    status: (0, import_pg_core6.varchar)("status", { length: 32 }).notNull().default("SCHEDULED"),
    /** Which provider supplied this row, so conflicting reports are traceable. */
    source: (0, import_pg_core6.varchar)("source", { length: 32 }).notNull().default("anilist"),
    /** When this row was last refreshed; drives staleness checks. */
    lastVerifiedAt: (0, import_pg_core6.timestamp)("last_verified_at", { withTimezone: true })
  },
  (table) => [
    (0, import_pg_core6.unique)("schedule_slot_unique").on(table.animeId, table.episodeNumber),
    // The schedule endpoint always reads "these rows, ordered by time".
    (0, import_pg_core6.index)("schedule_airing_idx").on(table.airingAt)
  ]
);

// src/db/client.ts
var url = config.DATABASE_URL ?? "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";
var dbOnline = true;
function setDatabaseOnline(online) {
  dbOnline = online;
}
function createGuardedClient(client) {
  return new Proxy(client, {
    apply(target, thisArg, argArray) {
      if (!dbOnline) {
        throw new Error("Database offline (circuit breaker active)");
      }
      return Reflect.apply(target, thisArg, argArray);
    },
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (...args) => {
          if (!dbOnline) {
            throw new Error("Database offline (circuit breaker active)");
          }
          return target.unsafe(...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
async function waitForDatabase(target, timeoutMs = 3e4) {
  const rawSql = target.rawClient ?? target;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await rawSql`select 1`;
      setDatabaseOnline(true);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  setDatabaseOnline(false);
  return false;
}
var probeTimer = null;
function startPeriodicProbe(rawSql, intervalMs = 15e3) {
  if (probeTimer) return;
  probeTimer = setInterval(async () => {
    if (!dbOnline) {
      try {
        await rawSql`select 1`;
        setDatabaseOnline(true);
        console.log("[zenkai] database reconnected; exiting degraded mode");
      } catch {
      }
    }
  }, intervalMs);
  probeTimer.unref();
}
async function createResources() {
  const sql4 = (0, import_postgres.default)(url, {
    max: config.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 2
  });
  const guarded = createGuardedClient(sql4);
  const db = (0, import_postgres_js.drizzle)(guarded, { schema: schema_exports });
  db.rawClient = sql4;
  if (config.REDIS_URL) {
    const redis = new import_ioredis.Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2e3,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2e3)
    });
    redis.on("error", () => {
    });
    try {
      await redis.connect();
      cache.attachRedis(redis);
    } catch {
    }
  }
  return {
    db,
    rawSql: sql4,
    close: async () => {
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
      }
      await sql4.end({ timeout: 5 });
    }
  };
}

// src/app.ts
init_errors();

// src/providers/metadata/anilist.ts
init_config();
init_client();
init_errors();
init_media();
var MAX_PER_PAGE = 50;
var SORT_MAP = {
  TRENDING: "TRENDING_DESC",
  POPULARITY_DESC: "POPULARITY_DESC",
  SCORE_DESC: "SCORE_DESC",
  START_DATE_DESC: "START_DATE_DESC",
  FAVOURITES_DESC: "FAVOURITES_DESC",
  TITLE_ROMAJI: "TITLE_ROMAJI"
};
var MEDIA_FIELDS = `
  id
  idMal
  format
  status
  isAdult
  description
  synonyms
  averageScore
  popularity
  favourites
  season
  seasonYear
  episodes
  duration
  genres
  updatedAt
  studios(isMain: true) {
    nodes { name }
  }
  title { romaji english native }
  coverImage { extraLarge large medium color }
  bannerImage
  startDate { year month day }
`;
function imageUrl(url2, width, height) {
  if (!url2) return null;
  if (/anilistcdn|anilist\.co/i.test(url2)) {
    return url2;
  }
  return url2.replace(
    /\/([^/]+)$/,
    (_match, file) => {
      const base = file.replace(/\.(jpg|jpeg|png|webv?|avif)$/i, "");
      return height ? `/${base}-${width}x${height}.jpg` : `/${base}-${width}.jpg`;
    }
  );
}
function toEpochSeconds(iso) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1e3) : null;
}
function toSummary(node) {
  const titles = {
    romaji: textOrUndefined(node.title?.romaji),
    english: textOrUndefined(node.title?.english),
    native: textOrUndefined(node.title?.native),
    synonyms: Array.isArray(node.synonyms) ? node.synonyms.filter(Boolean) : []
  };
  const externalIds = {};
  if (node.id != null) externalIds.anilist = String(node.id);
  if (node.idMal != null) externalIds.mal = String(node.idMal);
  return {
    anilistId: String(node.id),
    titles,
    canonicalTitle: displayTitle(titles, "Untitled"),
    // Distinguish "the provider reported no description" from "the provider did
    // not mention description at all". JSON renders both as null, so key
    // presence is the only available signal: a present-but-null description is a
    // deliberate empty and should clear the stored text, while an absent key must
    // leave it alone.
    description: present(node, "description") ? stripHtml(node.description) : void 0,
    coverUrl: imageUrlOrUndefined(node.coverImage?.medium, 300, 450),
    coverImageLarge: imageUrlOrUndefined(
      node.coverImage?.extraLarge ?? node.coverImage?.large,
      800
    ),
    bannerUrl: imageUrlOrUndefined(node.bannerImage, 1e3),
    format: textOrUndefined(node.format),
    // `status` is NOT defaulted to "UNKNOWN" when absent. A missing status means
    // "the provider did not say", and defaulting it would overwrite a known
    // RELEASING/FINISHED value with a fabricated UNKNOWN on any partial response.
    // The column default still protects a brand-new insert.
    status: textOrUndefined(node.status) ?? void 0,
    isAdult: Boolean(node.isAdult),
    year: node.startDate?.year ?? node.seasonYear ?? null,
    season: node.season ?? null,
    seasonYear: node.seasonYear ?? null,
    // `present` matters here: an explicit `episodes: null` means "AniList has no
    // count yet" and should clear a stored value, while an absent key means the
    // response did not mention it and must preserve what we hold. Treating both
    // as absent would make a sparse response silently erase a good episode count.
    averageScore: numberOrAbsent(present(node, "averageScore") ? node.averageScore : void 0),
    popularity: numberOrAbsent(present(node, "popularity") ? node.popularity : void 0),
    favourites: numberOrAbsent(present(node, "favourites") ? node.favourites : void 0),
    totalEpisodes: numberOrAbsent(present(node, "episodes") ? node.episodes : void 0),
    durationMinutes: numberOrAbsent(present(node, "duration") ? node.duration : void 0),
    genres: Array.isArray(node.genres) ? node.genres : void 0,
    studios: Array.isArray(node.studios?.nodes) ? node.studios.nodes.map((studio) => studio?.name).filter(
      (name) => typeof name === "string" && name.length > 0
    ) : void 0,
    externalIds,
    sourceUpdatedAt: toEpochSeconds(node.updatedAt)
  };
}
function present(node, key) {
  return Object.prototype.hasOwnProperty.call(node, key) && node[key] !== void 0;
}
function textOrUndefined(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
function imageUrlOrUndefined(url2, width, height) {
  if (url2 == null) return void 0;
  return imageUrl(url2, width, height);
}
function numberOrAbsent(value) {
  if (value === null || value === void 0) return value;
  return Number.isFinite(value) ? value : void 0;
}
function toRelation(edge) {
  const node = edge?.node;
  if (!node?.id) return null;
  return {
    type: String(edge.relationType ?? "UNKNOWN"),
    anilistId: Number(node.id),
    title: displayTitle(
      {
        romaji: node.title?.romaji ?? null,
        english: node.title?.english ?? null,
        native: node.title?.native ?? null
      },
      "Untitled"
    ),
    coverUrl: imageUrl(node.coverImage?.medium, 300, 450)
  };
}
var AnilistProvider = class {
  slug = "anilist";
  name = "AniList";
  priority = 1;
  #endpoint = config.ANILIST_ENDPOINT;
  async #query(query, variables) {
    const response = await fetchJson(this.#endpoint, {
      method: "POST",
      body: { query, variables }
    });
    if (response.errors?.length) {
      throw new AppError("upstream_error", `AniList error: ${response.errors[0].message}`, 502);
    }
    if (!response.data) {
      throw new AppError("upstream_error", "AniList returned no data", 502);
    }
    return response.data;
  }
  async browse(query) {
    const perPage = Math.min(query.perPage ?? 20, MAX_PER_PAGE);
    const page = Math.max(1, query.page ?? 1);
    const filters = [];
    if (!query.includeAdult) filters.push("isAdult: false");
    if (query.format) filters.push(`format: ${query.format}`);
    if (query.status) filters.push(`status: ${query.status}`);
    if (query.seasonYear) filters.push(`seasonYear: ${query.seasonYear}`);
    if (query.season && query.seasonYear) filters.push(`season: ${query.season}`);
    if (query.genre) filters.push(`genre_in: "${query.genre}"`);
    if (query.search) filters.push("search: $search");
    const declarations = ["$page: Int", "$perPage: Int", "$type: MediaType", "$sort: [MediaSort]"];
    const variables = {
      page,
      perPage,
      type: "ANIME",
      sort: [SORT_MAP[query.sort ?? "TRENDING"]]
    };
    if (query.search) {
      declarations.push("$search: String");
      variables.search = query.search;
    }
    const gql = `
      query(${declarations.join(", ")}) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage hasNextPage }
          media(type: $type, sort: $sort, ${filters.join(", ")}) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    const data = await this.#query(gql, variables);
    const pageInfo = data.Page?.pageInfo;
    return {
      items: (data.Page?.media ?? []).map(toSummary),
      page: pageInfo?.currentPage ?? page,
      perPage,
      total: pageInfo?.total ?? 0,
      hasNextPage: Boolean(pageInfo?.hasNextPage)
    };
  }
  async getByAnilistId(id, type = "ANIME") {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;
    const gql = `
      query($id: Int) {
        Media(id: $id, type: ${type}) {
          ${MEDIA_FIELDS}
          ${type === "ANIME" ? "nextAiringEpisode { episode airingAt timeUntilAiring }" : ""}
          relations {
            edges {
              relationType(version: 2)
              node { id title { romaji english native } coverImage { medium } }
            }
          }
        }
      }
    `;
    const data = await this.#query(gql, {
      id: numericId
    }).catch((error) => {
      if (error instanceof AppError && error.details?.status === 404) {
        const body = error.details?.body;
        if (typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            if (parsed.data?.Media === null) return null;
          } catch {
          }
        }
      }
      throw error;
    });
    if (!data) return null;
    const node = data.Media;
    if (!node) return null;
    const summary = toSummary(node);
    return {
      ...summary,
      relations: (node.relations?.edges ?? []).map((edge) => toRelation(edge)).filter((relation) => relation !== null),
      nextAiringEpisode: type === "ANIME" ? node.nextAiringEpisode ?? null : null,
      // AniList exposes no per-episode connection for anime (only a count), so
      // the catalog is seeded from that count and enriched by the streaming
      // provider in P4. Manga has no episode list at all.
      episodes: type === "ANIME" ? this.#placeholderEpisodes(summary) : void 0
    };
  }
  /**
   * Placeholder episodes derived from AniList's episode count.
   *
   * These carry number and air date only. Titles and thumbnails are filled in
   * later by `syncEpisodes`, which walks a streaming provider's episode list.
   * Seeding them here means `/anime/:id/episodes` returns a complete list
   * immediately instead of an empty list for every title.
   */
  #placeholderEpisodes(summary) {
    const nextAiring = summary.nextAiringEpisode;
    const total = summary.totalEpisodes ?? (nextAiring && nextAiring.episode > 1 ? nextAiring.episode - 1 : void 0);
    if (!total || total <= 0) return void 0;
    return Array.from({ length: total }, (_unused, index5) => ({
      episodeNumber: index5 + 1,
      absoluteNumber: void 0,
      title: void 0,
      description: void 0,
      durationSeconds: void 0,
      thumbnailUrl: void 0,
      airDate: void 0,
      isFiller: false
    }));
  }
  /**
   * Jikan exists to fill AniList's gaps, so its only real jobs are looking a
   * title up by MAL id (AniList has no reverse index) and contributing fields
   * AniList is known to be thin on. Everything else stays on AniList.
   */
  async getByExternalId(idType, externalId) {
    if (idType !== "mal") return null;
    const { JikanProvider: JikanProvider2 } = await Promise.resolve().then(() => (init_jikan(), jikan_exports));
    const jikan = new JikanProvider2();
    return jikan.getByMalId(externalId);
  }
  /**
   * Concrete upcoming slots.
   *
   * AniList only publishes `nextAiringEpisode`, so this yields at most one slot.
   * The schedule job extrapolates additional weekly slots from it; see
   * `modules/schedule/sync.ts`.
   */
  async getAiringSlots(anilistId) {
    const detail = await this.getByAnilistId(anilistId);
    const next = detail?.nextAiringEpisode;
    if (!next) return [];
    return [
      {
        episodeNumber: next.episode,
        airingAt: next.airingAt,
        status: next.timeUntilAiring > 0 ? "NOT_YET_AIRRED" : "AIRING"
      }
    ];
  }
  async healthCheck() {
    const data = await this.#query(`query { Viewer { id } }`, {});
    return typeof data?.Viewer?.id === "number";
  }
};

// src/providers/streaming/registry.ts
var import_drizzle_orm = require("drizzle-orm");
init_config();

// src/providers/streaming/consumet.provider.ts
init_config();
init_client();

// src/providers/streaming/health.ts
var DECAY = 0.7;
var FAILURE_THRESHOLD = 5;
var UNHEALTHY_CUTOFF = 0.35;
var DEFAULT_HEALTH = {
  successStreak: 1,
  failureStreak: 0,
  score: 1,
  avgLatencyMs: 0,
  lastCheckedAt: 0,
  lastError: null
};
var HealthRegistry = class {
  #entries = /* @__PURE__ */ new Map();
  #key(providerSlug) {
    return providerSlug;
  }
  get(providerSlug) {
    return this.#entries.get(this.#key(providerSlug)) ?? {
      providerSlug,
      ...DEFAULT_HEALTH
    };
  }
  /**
   * Record a completed resolve.
   *
   * `count` distinguishes the three cases above; only `outcome === 'error'` and
   * `outcome === 'timeout'` extend the failure streak.
   */
  record(providerSlug, outcome, latencyMs, error) {
    const previous = this.get(providerSlug);
    const failed = outcome === "error" || outcome === "timeout";
    const avgLatencyMs = previous.lastCheckedAt === 0 ? latencyMs : previous.avgLatencyMs * 0.7 + latencyMs * 0.3;
    const next = failed ? {
      providerSlug,
      successStreak: 0,
      failureStreak: previous.failureStreak + 1,
      score: previous.score * DECAY,
      avgLatencyMs: previous.avgLatencyMs,
      lastCheckedAt: Date.now(),
      lastError: error ?? "unknown error"
    } : {
      providerSlug,
      successStreak: previous.successStreak + 1,
      failureStreak: 0,
      score: previous.score * DECAY + (1 - DECAY),
      avgLatencyMs,
      lastCheckedAt: Date.now(),
      lastError: null
    };
    this.#entries.set(this.#key(providerSlug), next);
    return next;
  }
  recordSuccess(providerSlug, latencyMs) {
    return this.record(providerSlug, "ok", latencyMs);
  }
  recordFailure(providerSlug, message) {
    return this.record(providerSlug, "error", 0, message);
  }
  /** True once a provider has failed too many times to be worth trying. */
  isQuarantined(providerSlug) {
    return this.get(providerSlug).failureStreak >= FAILURE_THRESHOLD;
  }
  /** Sorted best-first, for the observability endpoint. */
  snapshot() {
    return [...this.#entries.values()].sort((a, b) => b.score - a.score);
  }
  /**
   * Clear quarantined entries so a recovered provider is retried.
   *
   * Quarantine is permanent by design: a provider that failed five times in a
   * row stays out until something explicitly retries it, because continuing to
   * probe a dead upstream is what turns a provider outage into an outage here.
   */
  resetQuarantined() {
    let cleared = 0;
    for (const [key, health] of this.#entries) {
      if (health.failureStreak >= FAILURE_THRESHOLD) {
        this.#entries.delete(key);
        cleared++;
      }
    }
    return cleared;
  }
};
var healthRegistry = new HealthRegistry();

// src/providers/streaming/dedupe.ts
function sourceIdentity(source) {
  return [source.providerSlug, source.playbackUrl, source.language, source.accessType].join("|");
}
function dedupeSources(sources) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const source of sources) {
    const key = sourceIdentity(source);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(source);
  }
  return output;
}

// src/providers/streaming/ranking.ts
var ACCESS_BASE = {
  hls: 1,
  mp4: 0.95,
  direct: 0.9,
  embed: 0.55
};
var WEIGHT_ACCESS = 0.35;
var WEIGHT_HEALTH = 0.4;
var WEIGHT_RESOLUTION = 0.2;
var WEIGHT_LATENCY = 0.05;
var RESOLUTION_SCORE = {
  2160: 1,
  1440: 0.9,
  1080: 0.8,
  720: 0.6,
  480: 0.4,
  360: 0.2
};
var LATENCY_CEILING_MS = 3e3;
function parseResolution(quality) {
  if (!quality) return void 0;
  const dimensions = quality.match(/(\d{3,4})\s*x\s*(\d{3,4})/i);
  if (dimensions) {
    const height = Number(dimensions[2]);
    return height >= 240 && height <= 4320 ? height : void 0;
  }
  const vertical = quality.match(/(\d{3,4})\s*p?/i);
  if (vertical) {
    const value = Number(vertical[1]);
    return value >= 240 && value <= 4320 ? value : void 0;
  }
  return void 0;
}
function scoreSource(source) {
  const access = ACCESS_BASE[source.accessType] ?? 0.5;
  const health = healthRegistry.get(source.providerSlug);
  const resolution = source.resolution != null ? RESOLUTION_SCORE[source.resolution] ?? 0.5 : 0.5;
  const latency = health.lastCheckedAt === 0 ? 0.5 : Math.max(0, 1 - Math.min(health.avgLatencyMs, LATENCY_CEILING_MS) / LATENCY_CEILING_MS);
  const healthTerm = health.score < UNHEALTHY_CUTOFF ? health.score * 0.2 : health.score;
  return access * WEIGHT_ACCESS + healthTerm * WEIGHT_HEALTH + resolution * WEIGHT_RESOLUTION + latency * WEIGHT_LATENCY;
}
function rankSources(sources) {
  return sources.filter((source) => !healthRegistry.isQuarantined(source.providerSlug)).map((source) => ({ ...source, rank: Number(scoreSource(source).toFixed(4)) })).sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.priority - b.priority;
  });
}
function filterByLanguage(sources, language) {
  if (!language) return sources;
  return sources.filter(
    (source) => source.language === language || source.language === "multi"
  );
}

// src/providers/streaming/consumet.provider.ts
var ConsumetProvider = class {
  constructor(slug = "consumet", name = "Consumet", basePriority = 20) {
    this.slug = slug;
    this.name = name;
    this.basePriority = basePriority;
  }
  kind = "api";
  version = "1.0.0";
  enabled = true;
  /**
   * Consumet's backends are mostly scrapers with no reliable dub track, so the
   * declared capabilities are deliberately conservative. Overstating them
   * would make the resolver pick this provider for requests it cannot serve.
   */
  capabilities = {
    languages: ["sub"],
    accessTypes: ["hls", "mp4", "embed"],
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false
  };
  #anilist = new AnilistProvider();
  /**
   * Resolve a title on the remote instance, then hand back its source ids.
   *
   * Consumet keys everything off its own slug, not an AniList id, so the title
   * has to be looked up by name first. That lookup is the expensive step and is
   * why the result is cached alongside the sources.
   */
  async #findShow(request) {
    const record = await this.#anilist.getByAnilistId(request.anilistId);
    if (!record) return null;
    const endpoint = `${config.CONSUMET_URL}/anime/zenshin/search`;
    const query = encodeURIComponent(record.canonicalTitle);
    const results = await fetchJson(
      `${endpoint}?query=${query}&page=1`
    );
    const candidates = results?.results ?? [];
    if (candidates.length === 0) return null;
    const wanted = record.canonicalTitle.toLowerCase();
    const exact = candidates.find(
      (candidate) => candidate.title?.toLowerCase() === wanted
    );
    return (exact ?? candidates[0]).id;
  }
  async listEpisodes(request) {
    const showId = await this.#findShow(request);
    if (!showId) return [];
    const payload = await fetchJson(
      `${config.CONSUMET_URL}/anime/zenshin/${encodeURIComponent(showId)}/episodes`
    );
    const episodes2 = payload?.episodes;
    if (!Array.isArray(episodes2)) return [];
    return episodes2.map((entry, index5) => ({
      providerEpisodeId: String(entry?.id ?? index5 + 1),
      episodeNumber: Number(entry?.number ?? index5 + 1),
      title: entry?.title ?? null,
      thumbnailUrl: entry?.image ?? null,
      isFiller: Boolean(entry?.isFiller)
    })).filter((entry) => Number.isFinite(entry.episodeNumber));
  }
  async resolve(request) {
    if (!config.CONSUMET_URL) return [];
    const episodes2 = await this.listEpisodes(request);
    const match = episodes2.find(
      (episode) => episode.episodeNumber === request.episodeNumber
    );
    if (!match) return [];
    const servers = await fetchJson(
      `${config.CONSUMET_URL}/anime/zenshin/watch/${encodeURIComponent(
        `${match.providerEpisodeId}`
      )}`
    );
    const sources = [];
    for (const [serverName, server] of Object.entries(servers ?? {})) {
      if (!server?.url) continue;
      const resolution = parseResolution(server.quality);
      if (server.quality === "auto" && resolution === void 0) continue;
      sources.push({
        id: `consumet:${serverName}:${match.providerEpisodeId}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: serverName,
        accessType: server.isM3U8 ? "hls" : "mp4",
        playbackUrl: String(server.url),
        quality: server.quality,
        resolution,
        language: "sub",
        referer: server.headers?.Referer ?? server.headers?.referer,
        priority: this.basePriority
      });
    }
    return sources;
  }
  async healthCheck() {
    if (!config.CONSUMET_URL) return false;
    try {
      await fetchJson(`${config.CONSUMET_URL}/health`, { timeoutMs: 3e3, retries: 0 });
      return true;
    } catch {
      return false;
    }
  }
};

// src/providers/streaming/inprocess.provider.ts
init_config();
var backends = /* @__PURE__ */ new Map();
async function loadBackend(slug) {
  const existing = backends.get(slug);
  if (existing) return existing;
  const extensions = await import("@consumet/extensions");
  const catalogue = extensions.ANIME;
  const Ctor = catalogue?.[slug];
  if (!Ctor) throw new Error(`unknown consumet backend: ${slug}`);
  const instance = new Ctor();
  backends.set(slug, instance);
  return instance;
}
var InProcessProvider = class {
  constructor(slug, name, basePriority) {
    this.slug = slug;
    this.name = name;
    this.basePriority = basePriority;
  }
  kind = "scrape";
  version = "1.0.0";
  enabled = true;
  capabilities = {
    languages: ["sub"],
    accessTypes: ["hls", "mp4", "embed"],
    // Consumet exposes no subtitle sidecars or intro/outro markers; claiming
    // otherwise would send the player looking for data that never arrives.
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false
  };
  #anilist = new AnilistProvider();
  /** False when the operator has not enabled in-process scraping. */
  get isEnabled() {
    return config.CONSUMET_INPROCESS;
  }
  /**
   * Map an AniList title onto a Consumet slug.
   *
   * Uses canonical animeTitle if available to avoid an extra AniList network hop.
   * Validates title closeness so an unrelated top search result is rejected rather
   * than serving the wrong anime.
   */
  async #findShowId(request) {
    let title = request.animeTitle;
    if (!title && request.anilistId) {
      const record = await this.#anilist.getByAnilistId(request.anilistId);
      title = record?.canonicalTitle;
    }
    if (!title) return null;
    const backend = await loadBackend(this.slug);
    const results = await backend.search(title, 1);
    const candidates = results?.results ?? [];
    if (candidates.length === 0) return null;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wanted = normalize(title);
    const exact = candidates.find(
      (c) => c.title && (c.title.toLowerCase() === title.toLowerCase() || normalize(c.title) === wanted)
    );
    if (exact) return exact.id;
    const close = candidates.find((c) => {
      if (!c.title) return false;
      const normalizedC = normalize(c.title);
      return normalizedC.includes(wanted) || wanted.includes(normalizedC);
    });
    return close ? close.id : null;
  }
  async listEpisodes(request) {
    if (!this.enabled) return [];
    try {
      const showId = await this.#findShowId(request);
      if (!showId) return [];
      const backend = await loadBackend(this.slug);
      const servers = await backend.fetchEpisodeServers(showId);
      return Object.keys(servers).map((key, index5) => ({
        providerEpisodeId: key,
        episodeNumber: Number.isFinite(Number(key)) ? Number(key) : index5 + 1
      })).filter((entry) => Number.isFinite(entry.episodeNumber));
    } catch {
      return [];
    }
  }
  async resolve(request) {
    if (!this.enabled) return [];
    const showId = await this.#findShowId(request);
    if (!showId) return [];
    const backend = await loadBackend(this.slug);
    const servers = await backend.fetchEpisodeServers(showId);
    const key = request.providerEpisodeId || String(request.episodeNumber);
    const server = servers[key] || servers[String(request.episodeNumber)];
    if (!server) return [];
    const raw = await server.fetch();
    const entries = Array.isArray(raw) ? raw : [raw];
    const sources = [];
    for (const entry of entries) {
      if (!entry?.url) continue;
      const referer = entry.referer || entry.headers?.Referer || entry.headers?.referer;
      sources.push({
        id: `inprocess:${this.slug}:${key}:${entry.quality ?? "auto"}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: this.slug,
        accessType: entry.isM3U8 ? "hls" : "mp4",
        playbackUrl: entry.url,
        quality: entry.quality,
        resolution: parseResolution(entry.quality),
        language: "sub",
        referer,
        headers: entry.headers,
        priority: this.basePriority
      });
    }
    return sources;
  }
  async healthCheck() {
    if (!this.enabled) return false;
    try {
      await loadBackend(this.slug);
      return true;
    } catch {
      return false;
    }
  }
};

// src/providers/streaming/template.provider.ts
init_config();
init_client();
init_errors();
function slugifyTitle(title) {
  if (!title) return "";
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function renderTemplate(template, request, requiredIdType) {
  const anilistId = request.anilistId || request.externalIds?.anilist;
  const malId = request.malId || request.externalIds?.mal;
  const tmdbId = request.externalIds?.tmdb;
  const slug = slugifyTitle(request.animeTitle);
  if (requiredIdType === "anilist" && !anilistId) return null;
  if (requiredIdType === "mal" && !malId) return null;
  if (requiredIdType === "tmdb" && !tmdbId) return null;
  if (requiredIdType === "slug" && !slug) return null;
  if (/\{(?:tmdb_id|tmdb)\}/i.test(template) && !tmdbId) return null;
  if (/\{(?:mal_id|mal)\}/i.test(template) && !malId) return null;
  if (/\{(?:anilist_id|anilist)\}/i.test(template) && !anilistId) return null;
  if (!/\{(?:episode|ep|e)\}/i.test(template)) return null;
  const rendered = template.replace(/\{anilist_id\}/gi, anilistId ?? "").replace(/\{anilist\}/gi, anilistId ?? "").replace(/\{mal_id\}/gi, malId ?? "").replace(/\{mal\}/gi, malId ?? "").replace(/\{tmdb_id\}/gi, tmdbId ?? "").replace(/\{tmdb\}/gi, tmdbId ?? "").replace(/\{id\}/gi, anilistId ?? malId ?? "").replace(/\{episode\}/gi, String(request.episodeNumber)).replace(/\{ep\}/gi, String(request.episodeNumber)).replace(/\{e\}/gi, String(request.episodeNumber)).replace(/\{slug\}/gi, slug || anilistId || "").replace(/\{lang\}/gi, request.language ?? "sub");
  if (rendered.startsWith("http://") || rendered.startsWith("https://")) {
    return rendered;
  }
  const base = config.SELF_HOSTED_BASE_URL ?? `http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}`;
  try {
    return new URL(rendered, base).toString();
  } catch {
    return rendered;
  }
}
var TemplateProvider = class {
  constructor(slug, name, basePriority, endpoint) {
    this.slug = slug;
    this.name = name;
    this.basePriority = basePriority;
    this.endpoint = endpoint;
    this.capabilities = {
      languages: [endpoint.language],
      accessTypes: [endpoint.accessType],
      supportsSubtitles: true,
      supportsSkipMarkers: true,
      maxResolution: endpoint.maxResolution,
      requiresMalId: endpoint.requiredIdType === "mal",
      requiredIdType: endpoint.requiredIdType
    };
  }
  kind = "template";
  version = "1.0.0";
  enabled = true;
  capabilities;
  async resolve(request) {
    const url2 = renderTemplate(this.endpoint.urlTemplate, request, this.endpoint.requiredIdType);
    if (!url2) return [];
    return [
      {
        id: `${this.slug}:${this.endpoint.endpointSlug}:${request.episodeNumber}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: this.endpoint.endpointSlug,
        accessType: this.endpoint.accessType,
        playbackUrl: url2,
        quality: this.endpoint.maxResolution ? `${this.endpoint.maxResolution}p` : void 0,
        resolution: this.endpoint.maxResolution,
        language: this.endpoint.language,
        priority: this.endpoint.priority
      }
    ];
  }
  async healthCheck() {
    if (!config.SELF_HOSTED_BASE_URL) return true;
    try {
      await fetchJson(`${config.SELF_HOSTED_BASE_URL}/health`, {
        timeoutMs: 2e3,
        retries: 0
      }).catch((error) => {
        if (error instanceof AppError && error.details && error.details.status === 404) {
          return;
        }
        throw error;
      });
      return true;
    } catch {
      return false;
    }
  }
};

// src/providers/streaming/registry.ts
var TEMPLATE_ENDPOINTS = [
  {
    id: "self-hosted",
    providerSlug: "self-hosted",
    providerName: "Self-hosted library",
    endpointSlug: "sub",
    displayName: "Self-hosted",
    language: "sub",
    accessType: "hls",
    badge: "Self-hosted",
    urlTemplate: "/media/{anilist}/episode-{episode}.m3u8",
    requiredIdType: "anilist",
    priority: 1
  }
];
var DEMO_ENDPOINTS = [
  {
    id: "demo-hls-a",
    providerSlug: "demo-hls-a",
    providerName: "Demo HLS (test stream)",
    endpointSlug: "sub",
    displayName: "Demo HLS",
    language: "sub",
    accessType: "hls",
    badge: "Test stream",
    urlTemplate: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    requiredIdType: "anilist",
    priority: 50
  },
  {
    id: "demo-hls-b",
    providerSlug: "demo-hls-b",
    providerName: "Demo HLS (alt)",
    endpointSlug: "sub",
    displayName: "Demo HLS alt",
    language: "sub",
    accessType: "hls",
    badge: "Test stream",
    urlTemplate: "https://test-streams.mux.dev/pts_shift/master.m3u8",
    requiredIdType: "anilist",
    priority: 51
  }
];
var INPROCESS_BACKENDS = [
  { slug: "Hianime", name: "Hianime (in-process)", priority: 20 },
  { slug: "AnimePahe", name: "AnimePahe (in-process)", priority: 25 }
];
function buildProviders() {
  const providers2 = [];
  for (const endpoint of TEMPLATE_ENDPOINTS) {
    providers2.push(
      new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint)
    );
  }
  if (config.CONSUMET_INPROCESS) {
    for (const backend of INPROCESS_BACKENDS) {
      providers2.push(new InProcessProvider(backend.slug, backend.name, backend.priority));
    }
  }
  if (config.CONSUMET_URL) {
    providers2.push(new ConsumetProvider());
  }
  return providers2;
}
function buildProvidersWithDemos() {
  const providers2 = buildProviders();
  for (const endpoint of DEMO_ENDPOINTS) {
    providers2.push(
      new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint)
    );
  }
  return providers2;
}
async function loadProvidersFromDb(db) {
  if (!db) {
    return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
  }
  try {
    const dbProviders = await db.select().from(providers).where((0, import_drizzle_orm.eq)(providers.active, true)).orderBy((0, import_drizzle_orm.asc)(providers.priority));
    if (!dbProviders || dbProviders.length === 0) {
      return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
    }
    const loaded = [];
    for (const p of dbProviders) {
      const endpoints = await db.select().from(providerEndpoints).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(providerEndpoints.providerId, p.id), (0, import_drizzle_orm.eq)(providerEndpoints.active, true))).orderBy((0, import_drizzle_orm.asc)(providerEndpoints.priority));
      for (const ep of endpoints) {
        if (ep.urlTemplate) {
          loaded.push(
            new TemplateProvider(p.slug, p.name, ep.priority ?? p.priority, {
              id: `${p.slug}-${ep.slug}`,
              providerSlug: p.slug,
              providerName: p.name,
              endpointSlug: ep.slug,
              displayName: ep.displayName,
              language: ep.language ?? "sub",
              accessType: ep.accessType ?? "hls",
              badge: ep.badge ?? p.name,
              urlTemplate: ep.urlTemplate,
              requiredIdType: ep.requiredIdType ?? "anilist",
              priority: ep.priority ?? p.priority,
              maxResolution: ep.maxResolution ?? void 0
            })
          );
        }
      }
      if (p.isCustomAdapter && p.slug === "Hianime" && config.CONSUMET_INPROCESS) {
        loaded.push(new InProcessProvider("Hianime", p.name, p.priority));
      } else if (p.isCustomAdapter && p.slug === "AnimePahe" && config.CONSUMET_INPROCESS) {
        loaded.push(new InProcessProvider("AnimePahe", p.name, p.priority));
      }
    }
    if (config.ENABLE_DEMO_STREAMS) {
      for (const endpoint of DEMO_ENDPOINTS) {
        loaded.push(
          new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint)
        );
      }
    }
    return loaded.length > 0 ? loaded : config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
  } catch {
    return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
  }
}
function subtitleCapableProviders(providers2) {
  return providers2.filter((provider) => provider.capabilities.supportsSubtitles);
}
function skipCapableProviders(providers2) {
  return providers2.filter(
    (provider) => provider.capabilities.supportsSkipMarkers && provider.getSkipMarkers
  );
}

// src/providers/streaming/gateway.ts
init_config();
init_errors();

// src/http/url-guard.ts
var import_promises = require("node:dns/promises");
var import_node_net = require("node:net");
var PRIVATE_V4 = [
  { min: "0.0.0.0", max: "0.255.255.255" },
  // "this" network
  { min: "10.0.0.0", max: "10.255.255.255" },
  // RFC1918
  { min: "100.64.0.0", max: "100.127.255.255" },
  // CGNAT
  { min: "127.0.0.0", max: "127.255.255.255" },
  // loopback
  { min: "169.254.0.0", max: "169.254.255.255" },
  // link-local + cloud metadata
  { min: "172.16.0.0", max: "172.31.255.255" },
  // RFC1918
  { min: "192.0.0.0", max: "192.0.0.255" },
  // IETF protocol assignments
  { min: "192.168.0.0", max: "192.168.255.255" },
  // RFC1918
  { min: "198.18.0.0", max: "198.19.255.255" },
  // benchmarking
  { min: "224.0.0.0", max: "239.255.255.255" },
  // multicast
  { min: "240.0.0.0", max: "255.255.255.255" }
  // reserved + broadcast
];
function v4ToInt(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}
function isPrivateAddress(ip) {
  const version = (0, import_node_net.isIP)(ip);
  if (version === 4) {
    const value = v4ToInt(ip);
    return PRIVATE_V4.some(
      (range) => value >= v4ToInt(range.min) && value <= v4ToInt(range.max)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}
var BlockedUrlError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedUrlError";
  }
};
function hostAllowed(host, allowlist) {
  if (allowlist.length === 0) return false;
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}
async function assertSafeUrl(rawUrl, options = {}) {
  let url2;
  try {
    url2 = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("malformed URL");
  }
  if (url2.protocol !== "http:" && url2.protocol !== "https:") {
    throw new BlockedUrlError(`unsupported protocol: ${url2.protocol}`);
  }
  if (url2.username || url2.password) {
    throw new BlockedUrlError("credentials in URL are not allowed");
  }
  const host = url2.hostname.toLowerCase();
  if (options.allowlist && options.allowlist.length > 0) {
    if (!hostAllowed(host, options.allowlist)) {
      throw new BlockedUrlError(`host not in allowlist: ${host}`);
    }
  }
  const literal = (0, import_node_net.isIP)(host);
  if (literal) {
    if (isPrivateAddress(host)) throw new BlockedUrlError(`private address blocked: ${host}`);
    return { url: url2, address: host };
  }
  let records;
  try {
    records = await (0, import_promises.lookup)(host, { all: true });
  } catch {
    throw new BlockedUrlError(`DNS resolution failed: ${host}`);
  }
  if (records.length === 0) throw new BlockedUrlError(`no DNS records for ${host}`);
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new BlockedUrlError(`host resolves to a private address: ${host}`);
    }
  }
  return { url: url2, address: records[0].address };
}

// src/providers/streaming/gateway.ts
var ALLOWED_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "video/mp2t",
  "video/mp4",
  "video/webm",
  "application/vnd.apple.mpegurl"
];
var MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
var MAX_REDIRECTS = 5;
async function fetchWithRedirectValidation(rawUrl, options) {
  const doAssert = options.assertImpl ?? assertSafeUrl;
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 1e4;
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    let safe;
    try {
      safe = await doAssert(current, { allowlist: options.allowlist });
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        throw AppError.badRequest(`blocked url: ${error.message}`);
      }
      throw error;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch(safe.url, {
        signal: controller.signal,
        // Media CDNs commonly require the origin Referer; forwarding it is what
        // makes the relay work where a bare request returns 403. This fixed
        // pair is the entire header policy: no client-supplied header ever
        // reaches the upstream.
        headers: {
          "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
          accept: "*/*"
        },
        redirect: "manual"
      });
    } finally {
      clearTimeout(timer);
    }
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;
    const location = response.headers.get("location");
    if (!location) {
      throw new AppError("upstream_error", "redirect without a location header", 502);
    }
    if (hop >= MAX_REDIRECTS) {
      throw new AppError("upstream_error", "too many redirects", 502);
    }
    current = new URL(location, safe.url).toString();
  }
}
var SENSITIVE_QUERY_KEYS = [
  "token",
  "sig",
  "signature",
  "exp",
  "expires",
  "hdnts",
  "policy",
  "key",
  "auth",
  "password",
  "session"
];
function redactPlaybackUrl(raw) {
  let url2;
  try {
    url2 = new URL(raw);
  } catch {
    return "[unparseable url]";
  }
  const keys = [...new Set(url2.searchParams.keys())];
  if (keys.length === 0) return url2.toString();
  for (const key of keys) {
    url2.searchParams.set(
      key,
      SENSITIVE_QUERY_KEYS.includes(key.toLowerCase()) ? "***" : "redacted"
    );
  }
  return url2.toString();
}
function redactRequestUrl(raw) {
  try {
    const url2 = new URL(raw, "http://zenkai.local");
    for (const key of url2.searchParams.keys()) {
      const value = url2.searchParams.get(key) ?? "";
      const isRelayTarget = /^https?:\/\//i.test(value);
      const isSensitiveName = SENSITIVE_QUERY_KEYS.includes(key.toLowerCase());
      if (isRelayTarget || isSensitiveName) {
        url2.searchParams.set(key, isSensitiveName ? "***" : "redacted");
      }
    }
    return url2.pathname + url2.search;
  } catch {
    return "[unparseable url]";
  }
}
var MECHANISM = {
  hls: "hls",
  mp4: "progressive",
  direct: "progressive",
  embed: "iframe"
};
var MEDIA_TYPE = {
  hls: "application/vnd.apple.mpegurl",
  mp4: "video/mp4",
  embed: "text/html"
};
var DIRECT_MEDIA_TYPE = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime"
};
var PlaybackGateway = class {
  #stats = { planned: 0, unmapped: 0 };
  /**
   * Turn one canonical source into one canonical plan.
   *
   * This is the whole of "how", and it is a pure function of its argument plus
   * static configuration: no provider call, no probe, no re-resolution. A caller
   * that has already resolved and validated a source triggers no further network
   * work here.
   *
   * It refuses rather than guesses. An unknown access mode, a non-http URL or an
   * embed with no page path has no honest plan, and emitting a plausible-looking
   * one is how a dead source turns into a player that silently shows nothing.
   */
  plan(source) {
    const access = this.#accessOf(source);
    const parsed = this.#urlOf(source, access);
    this.#stats.planned += 1;
    return {
      sourceId: source.id,
      providerSlug: source.providerSlug,
      providerName: source.providerName,
      endpointSlug: source.endpointSlug,
      access,
      mechanism: MECHANISM[access],
      mediaType: this.#mediaType(access, parsed),
      url: parsed.toString(),
      ...this.#delivery(access, parsed),
      language: source.language,
      quality: source.quality,
      resolution: source.resolution,
      ...source.referer ? { referer: source.referer } : {},
      // Embeds are framed directly in the client's browser iframe and are
      // inherently playable without backend HTTP media probing.
      validated: source.accessType === "embed" ? true : source.validated === true,
      playable: source.accessType === "embed" ? true : source.validated === true,
      // Unknown is the honest answer. No P5 provider declares seeking or range
      // evidence, and inferring support from a `.mp4` extension fails precisely on
      // the CDN that refuses range reads.
      capabilities: { seekable: null, ranged: null },
      // Only subtitles the provider attached to this source, copied so a client
      // cannot mutate the ranked list through the plan. Never derived, translated
      // or synchronised here.
      ...source.subtitles && source.subtitles.length > 0 ? { subtitles: source.subtitles.map((track) => ({ ...track })) } : {}
    };
  }
  /**
   * Plan a ranked list, preserving its order.
   *
   * Selection and ranking stay with P5: this walks the list as given and never
   * reorders it, so `plans[i]` describes `sources[i]` and the first plan is the
   * source P5 ranked first. A source that cannot be mapped is dropped and counted
   * rather than faked, so one bad provider cannot invalidate five good ones.
   */
  planAll(sources) {
    const plans = [];
    let unmapped = 0;
    for (const source of sources) {
      try {
        plans.push(this.plan(source));
      } catch {
        this.#stats.unmapped += 1;
        unmapped += 1;
      }
    }
    return { plans, unmapped };
  }
  /** Counters for the observability endpoint. */
  stats() {
    return { ...this.#stats };
  }
  /**
   * The source's access mode, or a refusal.
   *
   * `AccessType` is a compile-time union, but providers build these values at
   * runtime, so this check is real rather than defensive ceremony: an
   * unrecognised mode has no honest mapping and is refused instead of being
   * quietly rounded to `direct`.
   */
  #accessOf(source) {
    const access = source.accessType;
    if (typeof access !== "string" || !Object.hasOwn(MECHANISM, access)) {
      throw AppError.badRequest(`unsupported playback access mode: ${String(access)}`);
    }
    return access;
  }
  /**
   * The playback URL, structurally checked.
   *
   * The URL always originates from the canonical source, never from a request body
   * or query string. There is no parameter here a caller could set to an arbitrary
   * target, so this is not an SSRF primitive. The checks are structural -- parses,
   * http(s), has a host, carries no embedded credentials -- and they repeat what
   * the resolver filters on purpose: this is the last point before a URL reaches a
   * browser, so it should not trust having been called correctly.
   */
  #urlOf(source, access) {
    let url2;
    try {
      url2 = new URL(source.playbackUrl);
    } catch {
      throw AppError.badRequest(`unparseable playback url for source ${source.id}`);
    }
    if (url2.protocol !== "http:" && url2.protocol !== "https:") {
      throw AppError.badRequest(`unsupported playback protocol: ${url2.protocol}`);
    }
    if (!url2.hostname) {
      throw AppError.badRequest(`playback url has no host: ${source.id}`);
    }
    if (url2.username || url2.password) {
      throw AppError.badRequest("credentials in a playback url are not allowed");
    }
    if (access === "embed" && (url2.pathname === "" || url2.pathname === "/")) {
      throw AppError.badRequest("embed source has no page path");
    }
    return url2;
  }
  /**
   * Deterministic media type, with no network request.
   *
   * Keyed on the access mode first, never on the extension: a provider that says
   * `hls` means a manifest even when the URL is extensionless, and one that says
   * `mp4` means a progressive file even with no extension at all.
   */
  #mediaType(access, url2) {
    const known = MEDIA_TYPE[access];
    if (known) return known;
    const extension = url2.pathname.split(".").pop()?.toLowerCase() ?? "";
    return DIRECT_MEDIA_TYPE[extension] ?? null;
  }
  /**
   * Delivery path: straight to the client, or through this service's relay.
   *
   * The relay applies to HLS manifests only, and only when it is explicitly
   * enabled and the upstream host is allowlisted. Manifests are small and bounded;
   * relaying an unbounded media stream would turn this process into a bandwidth
   * sink, so no other access mode is proxied. A default deployment has the relay
   * off, so every plan is client-delivered.
   */
  #delivery(access, url2) {
    if (!config.ENABLE_PLAYBACK_PROXY) return { delivery: "client" };
    if (access !== "hls") return { delivery: "client" };
    const allowlist = config.playbackProxyAllowlist;
    if (allowlist.length === 0) return { delivery: "client" };
    const host = url2.hostname.toLowerCase();
    if (!allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
      return { delivery: "client" };
    }
    return {
      delivery: "proxied",
      proxyUrl: `/api/v1/playback/manifest?url=${encodeURIComponent(url2.toString())}`
    };
  }
  /**
   * Relay a manifest through this service.
   *
   * Only playlists are relayed: proxying an unbounded media stream would turn
   * this process into a bandwidth sink and let one viewer cost thousands of
   * upstream requests.
   */
  async fetchManifest(url2, options = {}) {
    const enabled = options.enabled ?? config.ENABLE_PLAYBACK_PROXY;
    if (!enabled) {
      throw AppError.badRequest("playback proxy is disabled");
    }
    const response = await fetchWithRedirectValidation(url2, {
      allowlist: options.allowlist ?? config.playbackProxyAllowlist,
      fetchImpl: options.fetchImpl,
      assertImpl: options.assertImpl
    });
    if (!response.ok) {
      throw new AppError("upstream_error", `upstream returned ${response.status}`, 502);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed))) {
      throw AppError.badRequest(`unsupported content type: ${contentType || "unknown"}`);
    }
    const body = await response.text();
    if (body.length > MANIFEST_MAX_BYTES) {
      throw AppError.badRequest("manifest exceeds the size limit");
    }
    const rewrittenBody = body.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          if (/^https?:\/\//i.test(uri)) return match;
          try {
            const abs = new URL(uri, url2).toString();
            return `URI="${abs}"`;
          } catch {
            return match;
          }
        });
      }
      if (!/^https?:\/\//i.test(trimmed)) {
        try {
          return new URL(trimmed, url2).toString();
        } catch {
          return line;
        }
      }
      return line;
    }).join("\n");
    return { body: rewrittenBody, contentType };
  }
  /**
   * Relay a subtitle file through this service.
   *
   * Subtitle sidecars (WebVTT, SRT) are often served without CORS headers,
   * which prevents the player from fetching them directly. This relays them
   * with the same SSRF protections as the manifest relay.
   */
  async fetchSubtitle(url2, options = {}) {
    const enabled = options.enabled ?? config.ENABLE_PLAYBACK_PROXY;
    if (!enabled) {
      throw AppError.badRequest("playback proxy is disabled");
    }
    const response = await fetchWithRedirectValidation(url2, {
      allowlist: options.allowlist ?? config.playbackProxyAllowlist,
      fetchImpl: options.fetchImpl,
      assertImpl: options.assertImpl
    });
    if (!response.ok) {
      throw new AppError("upstream_error", `upstream returned ${response.status}`, 502);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/|application\/(x-)?(subrip|vtt|x-subviewer)|webvtt|ttml|ssa|ass/i.test(contentType)) {
      throw AppError.badRequest(`unsupported subtitle content type: ${contentType || "unknown"}`);
    }
    const body = await response.text();
    if (body.length > 512 * 1024) {
      throw AppError.badRequest("subtitle exceeds the size limit");
    }
    return { body, contentType };
  }
};
var playbackGateway = new PlaybackGateway();

// src/modules/anime/repository.ts
var import_drizzle_orm2 = require("drizzle-orm");
init_media();
function rowToCard(row, genres) {
  return {
    id: row.id,
    anilistId: row.anilistId != null ? String(row.anilistId) : "",
    title: row.canonicalTitle,
    titles: {
      romaji: row.romajiTitle,
      english: row.englishTitle,
      native: row.nativeTitle,
      synonyms: row.synonyms ?? []
    },
    coverUrl: row.coverUrl,
    coverImageLarge: row.coverImageLarge,
    bannerUrl: row.bannerUrl,
    format: row.format,
    status: row.status,
    season: row.season,
    seasonYear: row.seasonYear,
    year: row.year,
    averageScore: row.averageScore != null ? Number(row.averageScore) : null,
    totalEpisodes: row.totalEpisodes,
    popularity: row.popularity,
    genres,
    isAdult: row.isAdult
  };
}
async function genresFor(db, ids) {
  const byAnime = /* @__PURE__ */ new Map();
  if (ids.length === 0) return byAnime;
  const rows = await db.select({ animeId: animeGenres.animeId, genre: animeGenres.genre }).from(animeGenres).where((0, import_drizzle_orm2.inArray)(animeGenres.animeId, ids));
  for (const row of rows) {
    const list = byAnime.get(row.animeId) ?? [];
    list.push(row.genre);
    byAnime.set(row.animeId, list);
  }
  return byAnime;
}
var ANIME_SORTS = [
  "popularity",
  "score",
  "recently-updated",
  "recently-added",
  "title",
  "newest"
];
function slugify(title, anilistId) {
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 120);
  return `${base || "anime"}-${anilistId}`;
}
function merged(summary) {
  return keep(
    {
      canonicalTitle: summary.canonicalTitle,
      synonyms: summary.titles.synonyms,
      status: summary.status,
      sourceUpdatedAt: summary.sourceUpdatedAt,
      updatedAt: /* @__PURE__ */ new Date(),
      romajiTitle: summary.titles.romaji,
      englishTitle: summary.titles.english,
      nativeTitle: summary.titles.native,
      description: summary.description,
      coverUrl: summary.coverUrl,
      coverImageLarge: summary.coverImageLarge,
      bannerUrl: summary.bannerUrl,
      format: summary.format,
      year: summary.year,
      season: summary.season,
      seasonYear: summary.seasonYear,
      // `averageScore` is numeric in the domain but numeric(4,2) in Postgres, so
      // it crosses the seam as a string. Only stringify a real number.
      averageScore: typeof summary.averageScore === "number" ? String(summary.averageScore) : void 0,
      popularity: summary.popularity,
      favourites: summary.favourites,
      totalEpisodes: summary.totalEpisodes,
      durationMinutes: summary.durationMinutes,
      // `false` is meaningful here, so this is written whenever it is a boolean.
      isAdult: typeof summary.isAdult === "boolean" ? summary.isAdult : void 0
    },
    [
      "canonicalTitle",
      "synonyms",
      "status",
      "sourceUpdatedAt",
      "updatedAt",
      "romajiTitle",
      "englishTitle",
      "nativeTitle",
      "description",
      "coverUrl",
      "coverImageLarge",
      "bannerUrl",
      "format",
      "year",
      "season",
      "seasonYear",
      "averageScore",
      "popularity",
      "favourites",
      "totalEpisodes",
      "durationMinutes",
      "isAdult"
    ]
  );
}
function keep(values, keys) {
  const out = {};
  for (const key of keys) {
    if (values[key] !== void 0) out[key] = values[key];
  }
  return out;
}
function dedupePreservingSpelling(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
function episodeValues(episode) {
  return {
    episodeNumber: episode.episodeNumber,
    absoluteNumber: episode.absoluteNumber ?? null,
    title: episode.title ?? null,
    description: episode.description ?? null,
    durationSeconds: episode.durationSeconds ?? null,
    thumbnailUrl: episode.thumbnailUrl ?? null,
    airDate: episode.airDate ? new Date(episode.airDate * 1e3) : null,
    isFiller: episode.isFiller
  };
}
function episodePatch(episode) {
  const patch = { updatedAt: /* @__PURE__ */ new Date() };
  if (episode.title !== void 0) patch.title = episode.title;
  if (episode.description !== void 0) patch.description = episode.description;
  if (episode.durationSeconds !== void 0) patch.durationSeconds = episode.durationSeconds;
  if (episode.thumbnailUrl !== void 0) patch.thumbnailUrl = episode.thumbnailUrl;
  if (episode.absoluteNumber !== void 0) patch.absoluteNumber = episode.absoluteNumber;
  if (episode.airDate !== void 0) {
    patch.airDate = episode.airDate ? new Date(episode.airDate * 1e3) : null;
  }
  if (typeof episode.isFiller === "boolean") patch.isFiller = episode.isFiller;
  return patch;
}
var AnimeRepository = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert or update one record and everything hanging off it.
   *
   * Merge semantics: a field the provider omitted keeps its stored value, and is
   * only overwritten when the provider actually sends a value.
   *
   * The naive alternative -- assigning every canonical field from the incoming
   * summary -- silently destroys the catalogue whenever a response is partial.
   * That is not hypothetical: AniList omits `description`, `bannerImage` and
   * `episodes` depending on the entry, and a degraded or schema-drifted response
   * omits far more. Because `search` and `discovery` upsert every provider result
   * they return, a single thin response would blank out descriptions, artwork and
   * episode counts across the whole catalogue, and a later reader could never
   * tell the difference from a genuinely empty catalogue.
   *
   * "Omitted" and "explicitly cleared" are therefore distinguished by `null` vs
   * `undefined`. The adapter maps an absent field to `undefined`; only a provider
   * that deliberately reports an empty value sends `null`.
   */
  async upsert(summary) {
    const anilistId = Number(summary.anilistId);
    const [row] = await this.db.insert(anime).values({
      slug: slugify(summary.canonicalTitle, summary.anilistId),
      anilistId: Number.isFinite(anilistId) ? anilistId : null,
      canonicalTitle: summary.canonicalTitle,
      synonyms: summary.titles.synonyms,
      romajiTitle: summary.titles.romaji,
      englishTitle: summary.titles.english,
      nativeTitle: summary.titles.native,
      description: summary.description,
      coverUrl: summary.coverUrl,
      coverImageLarge: summary.coverImageLarge,
      bannerUrl: summary.bannerUrl,
      type: "ANIME",
      format: summary.format,
      status: summary.status,
      isAdult: summary.isAdult,
      year: summary.year,
      season: summary.season,
      seasonYear: summary.seasonYear,
      averageScore: summary.averageScore != null ? String(summary.averageScore) : null,
      popularity: summary.popularity,
      favourites: summary.favourites,
      totalEpisodes: summary.totalEpisodes,
      durationMinutes: summary.durationMinutes,
      sourceUpdatedAt: summary.sourceUpdatedAt,
      updatedAt: /* @__PURE__ */ new Date()
    }).onConflictDoUpdate({
      // `anilist_id` carries a unique constraint, which is what makes this
      // an idempotent upsert rather than an accumulating one.
      target: anime.anilistId,
      set: merged(summary)
    }).returning({ id: anime.id });
    const localId = row.id;
    if (!localId) {
      throw new Error(`upsert returned no row for anilist ${summary.anilistId}`);
    }
    await Promise.all([
      this.#replaceGenres(localId, summary.genres),
      this.#replaceStudios(localId, summary.studios),
      this.#replaceExternalIds(localId, summary.externalIds),
      this.#upsertSearchIndex(localId, summary)
    ]);
    return localId;
  }
  /**
   * Genres are replaced rather than appended.
   *
   * Appending would let genre filters drift as upstream renames a tag, and
   * there is no history worth keeping for a set this small.
   *
   * `undefined` (the provider did not report genres) keeps whatever is stored;
   * `[]` is a genuine "no genres" and clears them. Deleting on `undefined` would
   * mean one partial response silently un-tags every title it touches.
   */
  async #replaceGenres(animeId, genres) {
    if (genres === void 0) return;
    await this.db.delete(animeGenres).where((0, import_drizzle_orm2.eq)(animeGenres.animeId, animeId));
    if (genres.length === 0) return;
    const unique7 = dedupePreservingSpelling(genres);
    await this.db.insert(animeGenres).values(unique7.map((genre) => ({ animeId, genre }))).onConflictDoNothing();
  }
  /** Studios follow the same omitted-versus-empty rule as genres. */
  async #replaceStudios(animeId, studios) {
    if (studios === void 0) return;
    await this.db.delete(animeStudios).where((0, import_drizzle_orm2.eq)(animeStudios.animeId, animeId));
    if (studios.length === 0) return;
    await this.db.insert(animeStudios).values(studios.map((name) => ({ animeId, studioName: name, isMain: false }))).onConflictDoNothing();
  }
  async #replaceExternalIds(animeId, externalIds) {
    const entries = Object.entries(externalIds).filter(
      (entry) => typeof entry[1] === "string" && entry[1] !== ""
    );
    if (entries.length === 0) return;
    await this.db.insert(animeExternalIds).values(entries.map(([idType, externalId]) => ({ animeId, idType, externalId }))).onConflictDoUpdate({
      target: [animeExternalIds.animeId, animeExternalIds.idType],
      set: { externalId: import_drizzle_orm2.sql`excluded.external_id` }
    });
  }
  /**
   * Maintain a normalised token blob for search.
   *
   * Every known spelling is folded into one row, so a search for "Kimi no Na wa"
   * still matches a record whose canonical title is "Your Name".
   */
  async #upsertSearchIndex(animeId, summary) {
    const candidates = [
      summary.canonicalTitle,
      summary.titles.romaji,
      summary.titles.english,
      summary.titles.native,
      ...summary.titles.synonyms
    ].filter((value) => typeof value === "string" && value.trim() !== "");
    const tokens = candidates.map(normalizeTitle).filter(Boolean).filter((value, index5, all) => all.indexOf(value) === index5);
    if (tokens.length === 0) return;
    await this.db.insert(animeSearchIndex).values({
      animeId,
      normalized: tokens.join(" "),
      // The canonical title is always first in the candidate list.
      isPrimary: tokens[0] === normalizeTitle(summary.canonicalTitle)
    }).onConflictDoUpdate({
      target: animeSearchIndex.animeId,
      set: { normalized: tokens.join(" ") }
    });
  }
  /** Full detail plus relations and external ids, for `GET /anime/:id`. */
  async getByAnilistId(anilistId) {
    const numericId = Number(anilistId);
    let record = null;
    if (Number.isFinite(numericId)) {
      const [found] = await this.db.select().from(anime).where((0, import_drizzle_orm2.eq)(anime.anilistId, numericId)).limit(1);
      record = found;
    }
    if (!record) {
      try {
        const [found] = await this.db.select().from(anime).where((0, import_drizzle_orm2.eq)(anime.id, anilistId)).limit(1);
        record = found;
      } catch {
        record = null;
      }
    }
    if (!record) return null;
    const [genres, studios, relations, externalIds] = await Promise.all([
      this.db.select({ genre: animeGenres.genre }).from(animeGenres).where((0, import_drizzle_orm2.eq)(animeGenres.animeId, record.id)),
      this.db.select({ studioName: animeStudios.studioName }).from(animeStudios).where((0, import_drizzle_orm2.eq)(animeStudios.animeId, record.id)),
      this.db.select().from(animeRelations).where((0, import_drizzle_orm2.eq)(animeRelations.animeId, record.id)),
      this.db.select({ idType: animeExternalIds.idType, externalId: animeExternalIds.externalId }).from(animeExternalIds).where((0, import_drizzle_orm2.eq)(animeExternalIds.animeId, record.id))
    ]);
    return {
      ...record,
      genres: genres.map((row) => row.genre),
      studios: studios.map((row) => row.studioName),
      relations,
      externalIds: Object.fromEntries(externalIds.map((row) => [row.idType, row.externalId]))
    };
  }
  /**
   * The provider's stated episode total, or null.
   *
   * Deliberately not derived from the number of episode rows. A show airing now
   * has a stated total of 24 and may have 7 rows; reporting 7 as "total
   * episodes" tells a reader the show is finished.
   */
  async getTotalEpisodes(anilistId) {
    const numericId = Number(anilistId);
    if (Number.isFinite(numericId)) {
      const [row] = await this.db.select({ totalEpisodes: anime.totalEpisodes }).from(anime).where((0, import_drizzle_orm2.eq)(anime.anilistId, numericId)).limit(1);
      if (row?.totalEpisodes !== void 0) return row.totalEpisodes;
    }
    try {
      const [row] = await this.db.select({ totalEpisodes: anime.totalEpisodes }).from(anime).where((0, import_drizzle_orm2.eq)(anime.id, anilistId)).limit(1);
      return row?.totalEpisodes ?? null;
    } catch {
      return null;
    }
  }
  async getLocalIdByAnilistId(anilistId) {
    const numericId = Number(anilistId);
    if (Number.isFinite(numericId)) {
      const [record] = await this.db.select({ id: anime.id }).from(anime).where((0, import_drizzle_orm2.eq)(anime.anilistId, numericId)).limit(1);
      if (record?.id) return record.id;
    }
    try {
      const [record] = await this.db.select({ id: anime.id }).from(anime).where((0, import_drizzle_orm2.eq)(anime.id, anilistId)).limit(1);
      return record?.id ?? null;
    } catch {
      return null;
    }
  }
  /**
   * Paginated catalogue listing.
   *
   * Reads the database rather than AniList: this endpoint is the one most likely
   * to be hit by every home-page row at once, and proxying it would spend the
   * upstream rate limit on data we already hold.
   */
  async list(options) {
    const conditions = [];
    if (options.season && options.seasonYear) {
      conditions.push(
        (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(anime.season, options.season), (0, import_drizzle_orm2.eq)(anime.seasonYear, options.seasonYear))
      );
    }
    if (options.status) conditions.push((0, import_drizzle_orm2.eq)(anime.status, options.status));
    if (options.format) conditions.push((0, import_drizzle_orm2.eq)(anime.format, options.format));
    const base = conditions.length > 0 ? (0, import_drizzle_orm2.and)(...conditions) : void 0;
    const order = {
      popularity: [(0, import_drizzle_orm2.desc)(anime.popularity), (0, import_drizzle_orm2.desc)(anime.averageScore)],
      score: [(0, import_drizzle_orm2.desc)(anime.averageScore), (0, import_drizzle_orm2.desc)(anime.popularity)],
      // `source_updated_at` is the provider's own updatedAt, so this is "what
      // changed upstream", not "what a background job last touched".
      "recently-updated": [(0, import_drizzle_orm2.desc)(anime.sourceUpdatedAt), (0, import_drizzle_orm2.desc)(anime.popularity)],
      "recently-added": [(0, import_drizzle_orm2.desc)(anime.createdAt), (0, import_drizzle_orm2.desc)(anime.popularity)],
      title: [(0, import_drizzle_orm2.asc)(anime.canonicalTitle)],
      newest: [(0, import_drizzle_orm2.desc)(anime.year), (0, import_drizzle_orm2.desc)(anime.seasonYear), (0, import_drizzle_orm2.desc)(anime.popularity)]
    };
    const orderBy = order[options.sort ?? "popularity"];
    const rows = options.genre ? await this.db.select({ record: anime }).from(anime).innerJoin(animeGenres, (0, import_drizzle_orm2.eq)(animeGenres.animeId, anime.id)).where((0, import_drizzle_orm2.and)(base, import_drizzle_orm2.sql`lower(${animeGenres.genre}) = lower(${options.genre})`)).orderBy(...orderBy).limit(options.limit).offset(options.offset) : await this.db.select().from(anime).where(base).orderBy(...orderBy).limit(options.limit).offset(options.offset);
    const [{ count }] = options.genre ? await this.db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(anime).innerJoin(animeGenres, (0, import_drizzle_orm2.eq)(animeGenres.animeId, anime.id)).where((0, import_drizzle_orm2.and)(base, import_drizzle_orm2.sql`lower(${animeGenres.genre}) = lower(${options.genre})`)) : await this.db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(anime).where(base);
    const genresByAnime = await genresFor(
      this.db,
      rows.map((row) => row.record ? row.record.id : row.id)
    );
    return {
      items: rows.map((row) => {
        const record = row.record ?? row;
        return rowToCard(record, genresByAnime.get(record.id) ?? []);
      }),
      total: Number(count ?? 0)
    };
  }
  /** Title search across the normalised index. */
  /**
   * Title search over the catalogue, as canonical cards (P15).
   *
   * Cards rather than raw rows: the provider-fallback branch of
   * `AnimeService.search` returns cards too, so the endpoint answers with one
   * shape regardless of whether the answer came from Postgres or upstream.
   */
  async search(query, limit) {
    const normalized = normalizeTitle(query);
    if (!normalized) return [];
    const rows = await this.db.select({ record: anime }).from(anime).innerJoin(animeSearchIndex, (0, import_drizzle_orm2.eq)(animeSearchIndex.animeId, anime.id)).where(
      (0, import_drizzle_orm2.or)(
        (0, import_drizzle_orm2.ilike)(animeSearchIndex.normalized, `%${normalized}%`),
        // Raw predicate kept as a fallback for exact substrings the
        // normaliser would mangle (punctuation-heavy titles).
        (0, import_drizzle_orm2.ilike)(anime.canonicalTitle, `%${query}%`)
      )
    ).orderBy((0, import_drizzle_orm2.desc)(anime.popularity)).limit(limit);
    const genresByAnime = await genresFor(
      this.db,
      rows.map((row) => row.record.id)
    );
    return rows.map(
      (row) => rowToCard(row.record, genresByAnime.get(row.record.id) ?? [])
    );
  }
  /** Persist relation edges, replacing whatever was there before. */
  async replaceRelations(animeId, detail) {
    await this.db.delete(animeRelations).where((0, import_drizzle_orm2.eq)(animeRelations.animeId, animeId));
    if (detail.relations.length === 0) return;
    await this.db.insert(animeRelations).values(
      detail.relations.map((relation) => ({
        animeId,
        relationType: relation.type,
        relatedAnimeId: relation.anilistId,
        relatedTitle: relation.title ?? null,
        coverUrl: relation.coverUrl ?? null
      }))
    ).onConflictDoNothing();
  }
  /**
   * Upsert the episode catalog (P4).
   *
   * Conflicts update only the fields a provider can genuinely improve, leaving
   * values we derived ourselves untouched, and never renumber an episode.
   */
  async upsertEpisodes(animeId, incoming) {
    if (incoming.length === 0) return 0;
    const inserted = await this.db.insert(episodes).values(incoming.map((episode) => ({ animeId, ...episodeValues(episode) }))).onConflictDoNothing().returning({ id: episodes.id, episodeNumber: episodes.episodeNumber });
    const insertedNumbers = new Set(inserted.map((row) => row.episodeNumber));
    const existing = incoming.filter((episode) => !insertedNumbers.has(episode.episodeNumber));
    for (const episode of existing) {
      const patch = episodePatch(episode);
      if (Object.keys(patch).length === 0) continue;
      await this.db.update(episodes).set(patch).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(episodes.animeId, animeId), (0, import_drizzle_orm2.eq)(episodes.episodeNumber, episode.episodeNumber)));
    }
    const byNumber = new Map(inserted.map((row) => [row.episodeNumber, row.id]));
    for (const episode of existing) {
      const [row] = await this.db.select({ id: episodes.id }).from(episodes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(episodes.animeId, animeId), (0, import_drizzle_orm2.eq)(episodes.episodeNumber, episode.episodeNumber))).limit(1);
      if (row) byNumber.set(episode.episodeNumber, row.id);
    }
    const withExternal = incoming.filter((episode) => episode.externalId);
    if (withExternal.length > 0) {
      const byNumber2 = new Map(inserted.map((row) => [row.episodeNumber, row.id]));
      await this.db.insert(episodeExternalIds).values(
        withExternal.map((episode) => ({
          episodeId: byNumber2.get(episode.episodeNumber),
          providerSlug: "anilist",
          externalId: episode.externalId,
          providerEpisodeNumber: episode.episodeNumber
        })).filter((row) => Boolean(row.episodeId))
      ).onConflictDoNothing();
    }
    return inserted.length;
  }
  /** Episodes for one title, oldest first. */
  /**
   * Canonical episodes for one title, joined with their airing slot.
   *
   * A left join, not an inner one: an episode with no slot is a real and common
   * state (a show that has not started, or one whose provider gave no schedule),
   * and an inner join would silently hide those episodes from the catalogue.
   *
   * Ordered by `episode_number` on an integer column, so 1, 2, 10 -- never
   * 1, 10, 2.
   */
  async listEpisodesWithAiring(animeId) {
    return this.db.select({
      id: episodes.id,
      episodeNumber: episodes.episodeNumber,
      absoluteNumber: episodes.absoluteNumber,
      title: episodes.title,
      description: episodes.description,
      durationSeconds: episodes.durationSeconds,
      thumbnailUrl: episodes.thumbnailUrl,
      isFiller: episodes.isFiller,
      airingAt: airingSchedule.airingAt,
      slotStatus: airingSchedule.status,
      slotSource: airingSchedule.source
    }).from(episodes).leftJoin(
      airingSchedule,
      (0, import_drizzle_orm2.and)(
        (0, import_drizzle_orm2.eq)(airingSchedule.animeId, episodes.animeId),
        (0, import_drizzle_orm2.eq)(airingSchedule.episodeNumber, episodes.episodeNumber)
      )
    ).where((0, import_drizzle_orm2.eq)(episodes.animeId, animeId)).orderBy(episodes.episodeNumber);
  }
  /** One episode by number within a title. */
  async getEpisodeByNumber(animeId, episodeNumber) {
    const [row] = await this.db.select().from(episodes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(episodes.animeId, animeId), (0, import_drizzle_orm2.eq)(episodes.episodeNumber, episodeNumber))).limit(1);
    return row ?? null;
  }
  async listEpisodes(animeId) {
    return this.db.select().from(episodes).where((0, import_drizzle_orm2.eq)(episodes.animeId, animeId)).orderBy(episodes.episodeNumber);
  }
  /** One episode row by local id, used by the playback resolver. */
  async getEpisode(episodeId) {
    const [record] = await this.db.select().from(episodes).where((0, import_drizzle_orm2.eq)(episodes.id, episodeId)).limit(1);
    return record ?? null;
  }
  /**
   * Parent titles by local uuid, with genres and external ids attached.
   *
   * The playback route holds a local uuid (the episode's `animeId`) but the
   * resolver needs provider ids. Fetching the parent with its cross-references in
   * one query avoids a second round trip on the play path.
   */
  async listParentTitles(animeIds) {
    if (animeIds.length === 0) return [];
    const records = await this.db.select().from(anime).where((0, import_drizzle_orm2.inArray)(anime.id, animeIds));
    if (records.length === 0) return [];
    const ids = records.map((record) => record.id);
    const [genres, externalIds] = await Promise.all([
      this.db.select().from(animeGenres).where((0, import_drizzle_orm2.inArray)(animeGenres.animeId, ids)),
      this.db.select().from(animeExternalIds).where((0, import_drizzle_orm2.inArray)(animeExternalIds.animeId, ids))
    ]);
    const genresByAnime = /* @__PURE__ */ new Map();
    for (const row of genres) {
      const list = genresByAnime.get(row.animeId);
      if (list) list.push(row.genre);
      else genresByAnime.set(row.animeId, [row.genre]);
    }
    const idsByAnime = /* @__PURE__ */ new Map();
    for (const row of externalIds) {
      const map = idsByAnime.get(row.animeId);
      if (map) map[row.idType] = row.externalId;
      else idsByAnime.set(row.animeId, { [row.idType]: row.externalId });
    }
    return records.map((record) => ({
      ...record,
      genres: genresByAnime.get(record.id) ?? [],
      externalIds: idsByAnime.get(record.id) ?? {}
    }));
  }
  /** Provider-native episode ids already known for an episode. */
  async getEpisodeExternalIds(episodeId) {
    return this.db.select({
      providerSlug: episodeExternalIds.providerSlug,
      externalId: episodeExternalIds.externalId
    }).from(episodeExternalIds).where((0, import_drizzle_orm2.eq)(episodeExternalIds.episodeId, episodeId));
  }
  /** Titles the sync jobs should refresh: never-synced ones plus stale ones. */
  async listForSync(limit, staleAfterSeconds) {
    const cutoff = Math.floor(Date.now() / 1e3) - staleAfterSeconds;
    const rows = await this.db.select({ id: anime.id, anilistId: anime.anilistId }).from(anime).where((0, import_drizzle_orm2.or)(import_drizzle_orm2.sql`${anime.sourceUpdatedAt} is null`, import_drizzle_orm2.sql`${anime.sourceUpdatedAt} < ${cutoff}`)).orderBy(anime.sourceUpdatedAt).limit(limit);
    return rows.filter((row) => row.anilistId != null).map((row) => ({ id: row.id, anilistId: String(row.anilistId) }));
  }
  /** Row count, used by the health check. */
  async count() {
    const [{ count }] = await this.db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(anime);
    return Number(count ?? 0);
  }
  /**
   * Discovery cards straight from the catalogue, with genres resolved in the same
   * round trip rather than one query per row.
   *
   * This is the canonical half of discovery: it never calls a provider, so
   * "recently added" and "recently updated" keep working when AniList is down.
   */
  async listCards(options) {
    const orderColumn = options.order === "recent" ? (0, import_drizzle_orm2.desc)(anime.createdAt) : (0, import_drizzle_orm2.desc)(anime.sourceUpdatedAt);
    const rows = await this.db.select().from(anime).orderBy(orderColumn).limit(options.limit).offset(options.offset);
    const [total] = await this.db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(anime);
    if (rows.length === 0) return { items: [], total: Number(total?.count ?? 0) };
    const genresByAnime = await genresFor(
      this.db,
      rows.map((row) => row.id)
    );
    return {
      items: rows.map((row) => rowToCard(row, genresByAnime.get(row.id) ?? [])),
      total: Number(total?.count ?? 0)
    };
  }
  async listGenres() {
    const rows = await this.db.selectDistinct({ genre: animeGenres.genre }).from(animeGenres).orderBy(animeGenres.genre);
    return rows.map((row) => row.genre);
  }
};

// src/modules/anime/service.ts
init_config();
init_errors();

// src/modules/anime/discovery.ts
init_config();
init_errors();
var MAX_PER_PAGE2 = 50;
var DEFAULT_PER_PAGE = 20;
var TTL = {
  trending: config.CACHE_TTL_DISCOVERY_S,
  popular: config.CACHE_TTL_DISCOVERY_S,
  seasonal: config.CACHE_TTL_DISCOVERY_S * 4,
  topRated: config.CACHE_TTL_DISCOVERY_S * 4
};
var CANONICAL_TTL_S = 300;
var SEASON_BY_MONTH = [
  { season: "WINTER", months: [12, 1, 2] },
  { season: "SPRING", months: [3, 4, 5] },
  { season: "SUMMER", months: [6, 7, 8] },
  { season: "FALL", months: [9, 10, 11] }
];
function currentSeason(now = /* @__PURE__ */ new Date()) {
  const month = now.getUTCMonth() + 1;
  const match = SEASON_BY_MONTH.find((entry) => entry.months.includes(month));
  const year = month === 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return { season: match.season, year };
}
function normalisePaging(page, perPage) {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const requested = Number.isFinite(perPage) ? Math.floor(perPage) : DEFAULT_PER_PAGE;
  const safePerPage = Math.min(Math.max(requested, 1), MAX_PER_PAGE2);
  return { page: safePage, perPage: safePerPage };
}
function dedupeByIdentity(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.anilistId)) continue;
    seen.add(item.anilistId);
    out.push(item);
  }
  return out;
}
function toCard(summary, localId = null) {
  return {
    id: localId,
    anilistId: summary.anilistId,
    title: summary.canonicalTitle,
    titles: summary.titles,
    coverUrl: summary.coverUrl ?? null,
    coverImageLarge: summary.coverImageLarge ?? null,
    bannerUrl: summary.bannerUrl ?? null,
    format: summary.format ?? null,
    status: summary.status ?? null,
    season: summary.season ?? null,
    seasonYear: summary.seasonYear ?? null,
    year: summary.year ?? null,
    // No score from the provider means "unrated", which is not a score of zero.
    // Null keeps the two apart for the client.
    averageScore: summary.averageScore ?? null,
    totalEpisodes: summary.totalEpisodes ?? null,
    popularity: summary.popularity ?? null,
    genres: summary.genres ?? [],
    isAdult: summary.isAdult
  };
}
var DiscoveryService = class {
  constructor(repo, provider, now = () => /* @__PURE__ */ new Date(), upcomingSource) {
    this.repo = repo;
    this.provider = provider;
    this.now = now;
    this.upcomingSource = upcomingSource;
  }
  /**
   * Provider-derived ranking.
   *
   * `seasonal` without an explicit window resolves to the season the server is
   * currently in. Without that default, "seasonal" and "popular" become the same
   * query with no season filter applied, which is exactly the bug it prevents.
   */
  async ranking(bucket, options = {}) {
    const { page, perPage } = normalisePaging(options.page, options.perPage);
    const window = this.#seasonWindow(bucket, options.season, options.year);
    const key = [
      // v3: the filters below joined the key. Two browse pages differing only by
      // genre used to collide on one cache entry and serve each other's shelf.
      "discovery:v3",
      bucket,
      window ? `${window.year}-${window.season}` : "all",
      options.genre ?? "-",
      options.format ?? "-",
      options.status ?? "-",
      `p${page}`,
      `n${perPage}`
    ].join(":");
    const { value, hit } = await cache.remember(
      key,
      TTL[bucket],
      () => this.#fetchRanking(bucket, page, perPage, window, options)
    );
    return { ...value, source: hit ? "cache" : value.source };
  }
  #seasonWindow(bucket, season2, year) {
    if (bucket !== "seasonal") return null;
    if (season2 && year) return { season: season2, year };
    const current = currentSeason(this.now());
    return { season: season2 ?? current.season, year: year ?? current.year };
  }
  async #fetchRanking(bucket, page, perPage, window, options = {}) {
    const sortMap = {
      trending: "TRENDING",
      popular: "POPULARITY_DESC",
      seasonal: "POPULARITY_DESC",
      topRated: "SCORE_DESC"
    };
    const result = await this.provider.browse({
      sort: sortMap[bucket],
      page,
      perPage,
      season: window?.season,
      seasonYear: window?.year,
      // Trending is an upstream signal, so browse has to keep it on this route
      // rather than downgrading it to a popularity sort. That means the filters
      // a browse page offers have to work here too, or selecting Trending would
      // silently drop the user's genre/format/status choice (P17).
      genre: options.genre,
      format: options.format,
      status: options.status
    });
    const localIds = await Promise.all(
      result.items.map((summary) => this.repo.upsert(summary).catch(() => null))
    );
    return {
      items: dedupeByIdentity(
        result.items.map((summary, index5) => toCard(summary, localIds[index5] ?? null))
      ),
      page: result.page,
      perPage: result.perPage,
      hasNextPage: result.hasNextPage,
      total: result.total ?? null,
      source: "provider"
    };
  }
  /**
   * Recently added to the catalogue, newest first.
   *
   * Ordered by `created_at`: when *this service* first learned about the title.
   * That is a canonical fact and keeps working when AniList is unreachable.
   */
  async recent(options = {}) {
    return this.#canonical(
      "recent",
      options,
      (limit, offset) => this.repo.listCards({ limit, offset, order: "recent" })
    );
  }
  /**
   * Titles whose *upstream metadata* changed most recently.
   *
   * Ordered by `source_updated_at`, which is AniList's own `updatedAt`. This is
   * deliberately not `updated_at`: that column records when we last synchronised,
   * so ranking by it would return whatever title a background job happened to
   * touch, which is not the question a reader is asking. A null marker (never
   * reported upstream) sorts last rather than being treated as epoch zero.
   */
  async recentlyUpdated(options = {}) {
    return this.#canonical(
      "recently-updated",
      options,
      (limit, offset) => this.repo.listCards({ limit, offset, order: "updated" })
    );
  }
  async #canonical(key, options, load2) {
    const { page, perPage } = normalisePaging(options.page, options.perPage);
    const cacheKey = `discovery:v2:${key}:p${page}:n${perPage}`;
    const { value, hit } = await cache.remember(
      cacheKey,
      CANONICAL_TTL_S,
      async () => {
        try {
          const { items, total } = await load2(perPage, (page - 1) * perPage);
          return {
            items,
            page,
            perPage,
            hasNextPage: (page - 1) * perPage + perPage < total,
            total,
            source: "database"
          };
        } catch {
          return {
            items: [],
            page,
            perPage,
            hasNextPage: false,
            total: 0,
            source: "database"
          };
        }
      }
    );
    return { ...value, source: hit ? "cache" : value.source };
  }
  /**
   * Distinct genres in the catalogue.
   */
  async genres() {
    try {
      const rows = await this.repo.listGenres();
      if (rows && rows.length > 0) return rows;
    } catch {
    }
    return [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Ecchi",
      "Fantasy",
      "Horror",
      "Mahou Shoujo",
      "Mecha",
      "Music",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller"
    ];
  }
  /**
   * Home aggregation.
   *
   * Sections run concurrently and degrade independently. One provider timeout
   * must not turn the whole home page into a 500, and must not be disguised as an
   * empty shelf either: a failed section reports `unavailable` with its reason,
   * which a client can render differently from "no results right now".
   */
  async home(perPage = 10) {
    const size = normalisePaging(1, perPage).perPage;
    const section = async (load2) => {
      try {
        const result = await load2();
        return { status: "ok", items: result.items };
      } catch (error) {
        const reason = error instanceof AppError ? error.reason : "upstream_error";
        return { status: "unavailable", items: [], reason };
      }
    };
    const upcoming = async () => {
      if (!this.upcomingSource) {
        return { status: "unavailable", items: [], reason: "not_configured" };
      }
      try {
        const rows = await this.upcomingSource.upcoming({ limit: size });
        return {
          status: "ok",
          items: rows.map((row) => ({
            id: null,
            anilistId: row.anilistId != null ? String(row.anilistId) : "",
            title: row.title,
            titles: { romaji: null, english: null, native: null, synonyms: [] },
            coverUrl: row.coverUrl,
            coverImageLarge: null,
            bannerUrl: null,
            format: null,
            status: null,
            season: null,
            seasonYear: null,
            year: null,
            averageScore: null,
            totalEpisodes: null,
            popularity: null,
            genres: [],
            isAdult: false,
            // Carried through so a client can show "in 3 days" without a
            // second request, and so the shelf is not ambiguous about which
            // episode it is listing.
            episodeNumber: row.episodeNumber,
            airingAt: new Date(row.airingAt).toISOString()
          }))
        };
      } catch (error) {
        const reason = error instanceof AppError ? error.reason : "internal";
        return { status: "unavailable", items: [], reason };
      }
    };
    const [trending, popular, seasonal, recent, topRated, upcomingShelf] = await Promise.all([
      section(() => this.ranking("trending", { perPage: size })),
      section(() => this.ranking("popular", { perPage: size })),
      section(() => this.ranking("seasonal", { perPage: size })),
      section(() => this.recent({ perPage: size })),
      section(() => this.ranking("topRated", { perPage: size })),
      upcoming()
    ]);
    return {
      trending,
      popular,
      seasonal,
      recent,
      topRated,
      upcoming: upcomingShelf
    };
  }
};

// src/modules/anime/service.ts
var DISCOVERY_TTL = {
  trending: config.CACHE_TTL_DISCOVERY_S,
  popular: config.CACHE_TTL_DISCOVERY_S,
  seasonal: config.CACHE_TTL_DISCOVERY_S * 4,
  topRated: config.CACHE_TTL_DISCOVERY_S * 4,
  updated: config.CACHE_TTL_DISCOVERY_S
};
var AnimeService = class {
  constructor(repo) {
    this.repo = repo;
  }
  #anilist = new AnilistProvider();
  /**
   * Ensure a title is in the database, fetching it if it is not.
   *
   * This is the read-through half of "AniList is a cache": a request for an
   * uncached title pays one upstream call and leaves the row behind for every
   * request after it.
   */
  async ensureCached(anilistId) {
    try {
      const localId = await this.repo.getLocalIdByAnilistId(anilistId);
      if (localId) return localId;
    } catch {
    }
    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);
    return this.repo.upsert(detail).catch(() => anilistId);
  }
  /** Detail for one title, backfilled on a cache miss. */
  async getByAnilistId(anilistId) {
    try {
      const cached = await this.repo.getByAnilistId(anilistId);
      if (cached) return cached;
    } catch {
    }
    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found`);
    const localId = await this.repo.upsert(detail).catch(() => anilistId);
    return { ...detail, id: localId };
  }
  /** Detail plus relations and episodes, always hitting AniList. */
  async getFull(anilistId) {
    const detail = await this.#anilist.getByAnilistId(anilistId);
    if (!detail) throw AppError.notFound(`anime ${anilistId} not found upstream`);
    const localId = await this.repo.upsert(detail);
    await this.repo.replaceRelations(localId, detail);
    return { ...detail, id: localId };
  }
  /**
     * Discovery list: serve from cache, otherwise fetch and persist.
     *
     * The database write on a discovery miss is deliberate. A trending page is the
     * cheapest way to seed a catalogue, and those rows are needed anyway the
     * moment a user opens one of the titles.
     */
  async discovery(bucket, options = {}) {
    const ttl = DISCOVERY_TTL[bucket];
    const key = [
      "discovery",
      bucket,
      options.season ?? "all",
      options.seasonYear ?? "all",
      options.page ?? 1,
      options.perPage ?? 20
    ].join(":");
    const { value, hit } = await cache.remember(key, ttl, async () => ({
      items: await this.#fetchDiscovery(bucket, options)
    }));
    return { items: value.items, source: hit ? "cache" : "provider" };
  }
  /** Map a discovery bucket onto an AniList sort, then persist the results. */
  async #fetchDiscovery(bucket, options) {
    const sortMap = {
      trending: "TRENDING",
      popular: "POPULARITY_DESC",
      seasonal: "POPULARITY_DESC",
      topRated: "SCORE_DESC",
      updated: "START_DATE_DESC"
    };
    const page = await this.#anilist.browse({
      sort: sortMap[bucket],
      page: options.page ?? 1,
      perPage: options.perPage ?? 20,
      season: options.season,
      seasonYear: options.seasonYear
    });
    await Promise.all(
      page.items.map(
        (summary) => this.repo.upsert(summary).catch(() => void 0)
      )
    );
    return page.items;
  }
  /**
   * Aggregate home-page payload.
   *
   * One request returns every section the home screen needs, so the frontend
   * does not fire five parallel discovery calls on page load.
   */
  async home() {
    const [trending, popular, seasonal, topRated] = await Promise.all([
      this.discovery("trending", { perPage: 20 }),
      this.discovery("popular", { perPage: 20 }),
      this.discovery("seasonal", { perPage: 20 }),
      this.discovery("topRated", { perPage: 20 })
    ]);
    return {
      trending: trending.items,
      popular: popular.items,
      seasonal: seasonal.items,
      topRated: topRated.items
    };
  }
  /** All distinct genres in the catalogue, alphabetically. */
  async genres() {
    try {
      const rows = await this.repo.listGenres();
      if (rows && rows.length > 0) return rows;
    } catch {
    }
    return [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Ecchi",
      "Fantasy",
      "Horror",
      "Mahou Shoujo",
      "Mecha",
      "Music",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller"
    ];
  }
  /** Catalogue listing straight from the database, falling back to AniList browse on DB offline. */
  async list(options) {
    try {
      return await this.repo.list(options);
    } catch {
      const page = await this.#anilist.browse({
        page: Math.floor(options.offset / options.limit) + 1,
        perPage: options.limit,
        season: options.season,
        seasonYear: options.seasonYear
      });
      return {
        items: page.items.map((summary) => toCard(summary, null)),
        total: page.total ?? page.items.length
      };
    }
  }
  /**
   * Title search, with a provider fallback when the database has no match or is down.
   */
  async search(query, limit) {
    let local = [];
    try {
      local = await this.repo.search(query, limit);
    } catch {
      local = [];
    }
    if (local.length > 0) return local;
    const page = await this.#anilist.browse({ search: query, perPage: limit });
    const localIds = await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => null))
    );
    return page.items.map((summary, index5) => toCard(summary, localIds[index5] ?? null));
  }
  /** Episode catalog for a title, seeding it from AniList's count if empty or DB offline. */
  async getEpisodes(anilistId) {
    try {
      const localId = await this.ensureCached(anilistId).catch(() => null);
      if (localId) {
        const existing = await this.repo.listEpisodes(localId).catch(() => []);
        if (existing.length > 0) return existing;
      }
    } catch {
    }
    const detail = await this.#anilist.getByAnilistId(anilistId);
    const seeded = detail?.episodes ?? [];
    return seeded.map((ep) => ({
      id: `ep-${anilistId}-${ep.episodeNumber}`,
      animeId: anilistId,
      episodeNumber: ep.episodeNumber,
      title: ep.title ?? `Episode ${ep.episodeNumber}`,
      thumbnailUrl: ep.thumbnailUrl ?? null,
      airDate: ep.airDate ? new Date(ep.airDate * 1e3) : null,
      isFiller: ep.isFiller ?? false
    }));
  }
  /** Single episode by local id. */
  async getEpisode(episodeId) {
    try {
      return await this.repo.getEpisode(episodeId);
    } catch {
      return null;
    }
  }
};

// src/modules/schedule/time.ts
function airingStateAt(airingAt, now) {
  return airingAt.getTime() <= now.getTime() ? "aired" : "upcoming";
}
function secondsUntil(airingAt, now) {
  return Math.floor((airingAt.getTime() - now.getTime()) / 1e3);
}
function zoneOffsetMs(at, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - at.getTime();
}
function zonedWallClockToUtc(timeZone, year, month, day, hour = 0, minute = 0, second = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - zoneOffsetMs(firstPass, timeZone));
}
function zonedParts(at, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}
function localDateKey(at, timeZone) {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function startOfDay(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day, 0, 0, 0);
}
function startOfNextDay(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day + 1, 0, 0, 0);
}
function weekWindow(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return {
    from: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday, 0, 0, 0),
    to: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday + 7, 0, 0, 0)
  };
}

// src/modules/anime/episodes.ts
var EpisodeService = class {
  constructor(repo, now = () => /* @__PURE__ */ new Date()) {
    this.repo = repo;
    this.now = now;
  }
  /**
   * The full episode list for a title.
   *
   * Not paginated by default. Zenkai's episode list is a single scrollable
   * column, and forcing a client to page through a 24-episode show to render it
   * would be pagination applied for its own sake. A caller that genuinely needs
   * a window can slice `episodes` client-side without another round trip.
   */
  async catalogue(anilistId) {
    let animeId = null;
    let rows = [];
    try {
      animeId = await this.repo.getLocalIdByAnilistId(anilistId);
      if (animeId) {
        rows = await this.repo.listEpisodesWithAiring(animeId);
      }
    } catch {
    }
    const now = this.now();
    let episodes2 = [];
    if (rows.length > 0) {
      episodes2 = rows.map((row) => toCard2(row, now));
    } else {
      episodes2 = Array.from({ length: 12 }, (_, i) => {
        const episodeNumber = i + 1;
        return {
          id: `ep-${anilistId}-${episodeNumber}`,
          episodeNumber,
          absoluteNumber: episodeNumber,
          title: `Episode ${episodeNumber}`,
          description: null,
          durationSeconds: 1440,
          thumbnailUrl: null,
          isFiller: false,
          airingAt: null,
          airingState: "aired",
          airingSource: null,
          providerStatus: null
        };
      });
    }
    return {
      anilistId,
      episodes: episodes2,
      catalogueCount: episodes2.length,
      airedCount: episodes2.filter((episode) => episode.airingState === "aired").length,
      knownTotal: await this.repo.getTotalEpisodes(anilistId).catch(() => episodes2.length)
    };
  }
  /** One episode by number. */
  async byNumber(anilistId, episodeNumber) {
    const catalogue = await this.catalogue(anilistId);
    return catalogue?.episodes.find((e) => e.episodeNumber === episodeNumber) ?? null;
  }
  /**
   * The next episode, derived rather than stored.
   *
   * The earliest episode that has not aired. There is no `next_episode` column,
   * and adding one would be a second source of truth that goes stale the moment
   * an episode airs -- exactly the class of bug P3 fixed for airing state.
   */
  async nextEpisode(anilistId) {
    const catalogue = await this.catalogue(anilistId);
    if (!catalogue) return null;
    return catalogue.episodes.find(
      (episode) => episode.airingState === "upcoming" && episode.airingAt !== null
    ) ?? null;
  }
  /**
   * Deterministic previous/next navigation.
   *
   * Derived from episode *number* order, never from insertion order or a
   * database id, so navigation is stable regardless of how rows were written.
   * A gap is honoured: with episodes 1, 2, 4, "next" from 2 is 4, not 3.
   */
  async navigation(anilistId, episodeNumber) {
    const catalogue = await this.catalogue(anilistId);
    const numbers = catalogue?.episodes.map((e) => e.episodeNumber) ?? [];
    return {
      previous: largestBelow(numbers, episodeNumber),
      next: smallestAbove(numbers, episodeNumber)
    };
  }
};
function toCard2(row, now) {
  const airingAt = row.airingAt ?? null;
  return {
    id: row.id,
    episodeNumber: row.episodeNumber,
    absoluteNumber: row.absoluteNumber ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    durationSeconds: row.durationSeconds ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    isFiller: Boolean(row.isFiller),
    airingAt: airingAt ? airingAt.toISOString() : null,
    // No slot means unknown scheduling, which is not the same as "not yet".
    airingState: airingAt ? airingStateAt(airingAt, now) : "unknown",
    airingSource: row.slotSource ?? null,
    providerStatus: row.slotStatus ?? null
  };
}
function largestBelow(sorted, value) {
  let found = null;
  for (const candidate of sorted) {
    if (candidate < value) found = candidate;
  }
  return found;
}
function smallestAbove(sorted, value) {
  for (const candidate of sorted) {
    if (candidate > value) return candidate;
  }
  return null;
}

// src/modules/anime/routes.ts
var import_zod2 = require("zod");
init_errors();
var positiveInt = import_zod2.z.coerce.number().int().positive();
var season = import_zod2.z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]);
var sort = import_zod2.z.enum([
  "TRENDING",
  "POPULARITY_DESC",
  "SCORE_DESC",
  "START_DATE_DESC",
  "FAVOURITES_DESC",
  "TITLE_ROMAJI"
]);
var pagination = {
  page: import_zod2.z.coerce.number().int().min(1).default(1),
  perPage: import_zod2.z.coerce.number().int().min(1).max(50).default(20)
};
var listQuery = import_zod2.z.object({
  ...pagination,
  season: season.optional(),
  seasonYear: import_zod2.z.coerce.number().int().min(1900).max(2200).optional(),
  status: import_zod2.z.enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]).optional(),
  genre: import_zod2.z.string().trim().min(1).max(64).optional(),
  format: import_zod2.z.enum(["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"]).optional(),
  // Catalogue orderings only (P17). "trending" is not here on purpose: it is an
  // upstream signal with no column behind it, so it stays on the discovery route
  // rather than being silently served as popularity.
  sort: import_zod2.z.enum(ANIME_SORTS).optional()
});
var searchQuery = import_zod2.z.object({
  q: import_zod2.z.string().trim().min(1, "q is required").max(120),
  limit: import_zod2.z.coerce.number().int().min(1).max(50).default(20)
});
function parseOrThrow(schema2, value) {
  const result = schema2.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw Object.assign(
      new Error(issue?.message ?? "invalid request"),
      { statusCode: 400, reason: "bad_request" }
    );
  }
  return result.data;
}
function registerAnimeRoutes(app, service, discovery, episodes2) {
  app.get("/api/v1/anime", async (request) => {
    const query = parseOrThrow(listQuery, request.query);
    if (query.season && !query.seasonYear) {
      throw Object.assign(new Error("seasonYear is required when season is given"), {
        statusCode: 400,
        reason: "bad_request"
      });
    }
    const { items, total } = await service.list({
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage,
      season: query.season,
      seasonYear: query.seasonYear,
      status: query.status,
      genre: query.genre,
      format: query.format,
      sort: query.sort
    });
    return { items, page: query.page, perPage: query.perPage, total };
  });
  app.get("/api/v1/anime/search", async (request) => {
    const { q, limit } = parseOrThrow(searchQuery, request.query);
    const items = await service.search(q, limit);
    return { query: q, limit, items };
  });
  app.get("/api/v1/anime/:id", async (request) => {
    const { id } = parseOrThrow(import_zod2.z.object({ id: import_zod2.z.string().trim().min(1) }), request.params);
    return service.getFull(id);
  });
  app.get("/api/v1/anime/:id/relations", async (request) => {
    const { id } = parseOrThrow(import_zod2.z.object({ id: import_zod2.z.string().trim().min(1) }), request.params);
    const detail = await service.getByAnilistId(id);
    return { relations: detail.relations ?? [] };
  });
  app.get("/api/v1/anime/:id/episodes", async (request) => {
    const { id } = parseOrThrow(import_zod2.z.object({ id: import_zod2.z.string().trim().min(1) }), request.params);
    await service.getEpisodes(id);
    const catalogue = await episodes2.catalogue(id);
    if (!catalogue) throw AppError.notFound(`anime ${id} not found`);
    return catalogue;
  });
  app.get("/api/v1/anime/:id/episodes/:number", async (request) => {
    const { id, number } = parseOrThrow(
      import_zod2.z.object({
        id: import_zod2.z.string().trim().min(1),
        number: import_zod2.z.coerce.number().int().positive()
      }),
      request.params
    );
    await service.getEpisodes(id);
    const episode = await episodes2.byNumber(id, number);
    if (!episode) throw AppError.notFound(`episode ${number} of anime ${id} not found`);
    return { episode };
  });
  app.get("/api/v1/anime/:id/episodes-next", async (request) => {
    const { id } = parseOrThrow(import_zod2.z.object({ id: import_zod2.z.string().trim().min(1) }), request.params);
    return { episode: await episodes2.nextEpisode(id) };
  });
  app.get("/api/v1/anime/:id/episodes/:number/navigation", async (request) => {
    const { id, number } = parseOrThrow(
      import_zod2.z.object({
        id: import_zod2.z.string().trim().min(1),
        number: import_zod2.z.coerce.number().int().positive()
      }),
      request.params
    );
    return episodes2.navigation(id, number);
  });
  app.get("/api/v1/episodes/:id", async (request) => {
    const { id } = parseOrThrow(import_zod2.z.object({ id: import_zod2.z.string().trim().min(1) }), request.params);
    const episode = await service.getEpisode(id);
    if (!episode) throw AppError.notFound(`episode ${id} not found`);
    return episode;
  });
  const discoveryPaging = {
    page: import_zod2.z.coerce.number().int().min(1).max(1e3).default(1),
    perPage: import_zod2.z.coerce.number().int().min(1).max(50).default(20)
  };
  const bucketFilters = {
    genre: import_zod2.z.string().trim().min(1).max(64).optional(),
    format: import_zod2.z.enum(["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"]).optional(),
    status: import_zod2.z.enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]).optional()
  };
  const seasonalQuery = import_zod2.z.object({
    ...discoveryPaging,
    ...bucketFilters,
    season: season.optional(),
    year: import_zod2.z.coerce.number().int().min(1900).max(2200).optional()
  });
  app.get("/api/v1/anime/trending", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.ranking("trending", query);
  });
  app.get("/api/v1/anime/popular", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.ranking("popular", query);
  });
  app.get("/api/v1/anime/seasonal", async (request) => {
    const query = parseOrThrow(seasonalQuery, request.query);
    return discovery.ranking("seasonal", {
      page: query.page,
      perPage: query.perPage,
      season: query.season,
      year: query.year
    });
  });
  app.get("/api/v1/anime/top", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.ranking("topRated", query);
  });
  app.get("/api/v1/anime/topRated", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.ranking("topRated", query);
  });
  app.get("/api/v1/anime/recent", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.recent(query);
  });
  app.get("/api/v1/anime/recently-updated", async (request) => {
    const query = parseOrThrow(import_zod2.z.object(discoveryPaging), request.query);
    return discovery.recentlyUpdated(query);
  });
  app.get("/api/v1/anime/discovery/:bucket", async (request) => {
    const { bucket } = parseOrThrow(
      import_zod2.z.object({ bucket: import_zod2.z.enum(["trending", "popular", "seasonal", "topRated"]) }),
      request.params
    );
    const query = parseOrThrow(
      import_zod2.z.object({
        ...discoveryPaging,
        ...bucketFilters,
        season: season.optional(),
        year: import_zod2.z.coerce.number().int().min(1900).max(2200).optional()
      }),
      request.query
    );
    return discovery.ranking(bucket, {
      page: query.page,
      perPage: query.perPage,
      season: query.season,
      year: query.year,
      genre: query.genre,
      format: query.format,
      status: query.status
    });
  });
  app.get("/api/v1/genres", async () => {
    return { items: await discovery.genres() };
  });
  app.get("/api/v1/home", async (request) => {
    const query = parseOrThrow(
      import_zod2.z.object({ perPage: import_zod2.z.coerce.number().int().min(1).max(50).default(10) }),
      request.query
    );
    return discovery.home(query.perPage);
  });
}

// src/modules/manga/repository.ts
var import_drizzle_orm3 = require("drizzle-orm");
init_media();
var MANGA_SORTS = [
  "followed",
  "rating",
  "newest",
  "recently-updated",
  "title"
];
function mangaSlug(title, providerId) {
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 120);
  return `${base || "manga"}-${providerId}`;
}
var MangaRepository = class {
  constructor(db) {
    this.db = db;
  }
  /** Insert or update one record and everything hanging off it. */
  async upsert(summary) {
    const providerId = summary.providerId;
    const [row] = await this.db.insert(manga).values({
      slug: mangaSlug(summary.titles.primary, providerId),
      mangadexId: providerId || null,
      canonicalTitle: summary.titles.primary,
      synonyms: summary.titles.alternates,
      altTitles: summary.titles.alternates,
      description: summary.description,
      coverUrl: summary.coverUrl,
      coverImageLarge: summary.coverImageLarge,
      status: summary.status,
      contentRating: summary.contentRating,
      isAdult: summary.isAdult,
      year: summary.year,
      demographics: summary.demographics,
      totalChapters: summary.totalChapters,
      totalVolumes: summary.totalVolumes,
      translatedChapterCount: summary.translatedChapterCount,
      followedCount: summary.followedCount,
      rating: summary.rating,
      updatedAt: /* @__PURE__ */ new Date()
    }).onConflictDoUpdate({
      target: manga.mangadexId,
      set: {
        canonicalTitle: summary.titles.primary,
        synonyms: summary.titles.alternates,
        altTitles: summary.titles.alternates,
        description: summary.description,
        coverUrl: summary.coverUrl,
        coverImageLarge: summary.coverImageLarge,
        status: summary.status,
        contentRating: summary.contentRating,
        isAdult: summary.isAdult,
        year: summary.year,
        demographics: summary.demographics,
        totalChapters: summary.totalChapters,
        totalVolumes: summary.totalVolumes,
        translatedChapterCount: summary.translatedChapterCount,
        followedCount: summary.followedCount,
        rating: summary.rating,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning({ id: manga.id });
    const localId = row?.id;
    if (!localId) {
      throw new Error(`upsert returned no row for mangadex ${providerId}`);
    }
    await Promise.all([
      this.#replaceGenres(localId, summary.genres.map((genre) => genre.name)),
      this.#replaceCredits(localId, [
        ...summary.authors.map((name) => ({ role: "AUTHOR", name })),
        ...summary.artists.map((name) => ({ role: "ARTIST", name }))
      ]),
      this.#replaceExternalIds(localId, summary.externalIds),
      this.#upsertSearchIndex(localId, summary)
    ]);
    return localId;
  }
  /** Genres are replaced, not appended, so upstream renames do not accumulate. */
  async #replaceGenres(mangaId, genres) {
    await this.db.delete(mangaGenres).where((0, import_drizzle_orm3.eq)(mangaGenres.mangaId, mangaId));
    if (genres.length === 0) return;
    await this.db.insert(mangaGenres).values(genres.map((genre) => ({ mangaId, genre }))).onConflictDoNothing();
  }
  async #replaceCredits(mangaId, credits) {
    await this.db.delete(mangaCredits).where((0, import_drizzle_orm3.eq)(mangaCredits.mangaId, mangaId));
    if (credits.length === 0) return;
    await this.db.insert(mangaCredits).values(credits.map((credit) => ({ mangaId, role: credit.role, name: credit.name }))).onConflictDoNothing();
  }
  async #replaceExternalIds(mangaId, externalIds) {
    const entries = Object.entries(externalIds ?? {}).filter(
      (entry) => typeof entry[1] === "string" && entry[1] !== ""
    );
    if (entries.length === 0) return;
    await this.db.insert(mangaExternalIds).values(entries.map(([idType, externalId]) => ({ mangaId, idType, externalId }))).onConflictDoUpdate({
      target: [mangaExternalIds.mangaId, mangaExternalIds.idType],
      set: { externalId: import_drizzle_orm3.sql`excluded.external_id` }
    });
  }
  /** Fold every known title spelling into one searchable token blob. */
  async #upsertSearchIndex(mangaId, summary) {
    const tokens = [summary.titles.primary, ...summary.titles.alternates].map(normalizeTitle).filter(Boolean).filter((value, index5, all) => all.indexOf(value) === index5);
    if (tokens.length === 0) return;
    const primary = normalizeTitle(summary.titles.primary);
    await this.db.insert(mangaSearchIndex).values({ mangaId, normalized: tokens.join(" "), isPrimary: true }).onConflictDoUpdate({
      target: mangaSearchIndex.mangaId,
      set: { normalized: tokens.join(" ") }
    });
  }
  async getByProviderId(providerId) {
    if (!providerId) return null;
    const [record] = await this.db.select().from(manga).where((0, import_drizzle_orm3.eq)(manga.mangadexId, providerId)).limit(1);
    if (!record) return null;
    return { ...record, ...await this.#fanOut(record.id) };
  }
  async getById(localId) {
    const [record] = await this.db.select().from(manga).where((0, import_drizzle_orm3.eq)(manga.id, localId)).limit(1);
    if (!record) return null;
    return { ...record, ...await this.#fanOut(record.id) };
  }
  async getLocalIdByProviderId(providerId) {
    if (!providerId) return null;
    const [record] = await this.db.select({ id: manga.id }).from(manga).where((0, import_drizzle_orm3.eq)(manga.mangadexId, providerId)).limit(1);
    return record?.id ?? null;
  }
  /**
   * Look up a manga row by an external provider id.
   *
   * The `manga_external_ids` table stores cross-references (anilist, mal, kitsu,
   * ...) for titles that have already been synced, so a bridge lookup from one
   * provider's id space to ours does not require a second provider call.
   */
  async getByExternalId(idType, externalId) {
    if (!externalId) return null;
    const [record] = await this.db.select({ id: manga.id, mangadexId: manga.mangadexId }).from(mangaExternalIds).innerJoin(manga, (0, import_drizzle_orm3.eq)(manga.id, mangaExternalIds.mangaId)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(mangaExternalIds.idType, idType), (0, import_drizzle_orm3.eq)(mangaExternalIds.externalId, externalId))).limit(1);
    if (!record || !record.mangadexId) return null;
    return this.getByProviderId(record.mangadexId);
  }
  /** Genres, credits, relations and external ids for one title. */
  async #fanOut(mangaId) {
    const [genres, credits, relations, externalIds] = await Promise.all([
      this.db.select({ genre: mangaGenres.genre, group: mangaGenres.group }).from(mangaGenres).where((0, import_drizzle_orm3.eq)(mangaGenres.mangaId, mangaId)),
      this.db.select().from(mangaCredits).where((0, import_drizzle_orm3.eq)(mangaCredits.mangaId, mangaId)),
      this.db.select().from(mangaRelations).where((0, import_drizzle_orm3.eq)(mangaRelations.mangaId, mangaId)),
      this.db.select({ idType: mangaExternalIds.idType, externalId: mangaExternalIds.externalId }).from(mangaExternalIds).where((0, import_drizzle_orm3.eq)(mangaExternalIds.mangaId, mangaId))
    ]);
    return {
      genres: genres.map((row) => row.genre),
      authors: credits.filter((c) => c.role === "AUTHOR").map((c) => c.name),
      artists: credits.filter((c) => c.role === "ARTIST").map((c) => c.name),
      relations,
      externalIds: Object.fromEntries(externalIds.map((row) => [row.idType, row.externalId]))
    };
  }
  async list(options) {
    const conditions = [];
    if (options.status) conditions.push((0, import_drizzle_orm3.eq)(manga.status, options.status));
    if (!options.includeAdult) conditions.push((0, import_drizzle_orm3.eq)(manga.isAdult, false));
    const base = conditions.length > 0 ? (0, import_drizzle_orm3.and)(...conditions) : void 0;
    const order = {
      followed: [(0, import_drizzle_orm3.desc)(manga.followedCount)],
      // `rating` is a short string grade, so it is ordered as text. That is the
      // provider's own ordering of the column and is what the manga detail
      // shows; mixing it with a numeric sort would be meaningless.
      rating: [(0, import_drizzle_orm3.desc)(manga.rating), (0, import_drizzle_orm3.desc)(manga.followedCount)],
      newest: [(0, import_drizzle_orm3.desc)(manga.year), (0, import_drizzle_orm3.desc)(manga.followedCount)],
      "recently-updated": [(0, import_drizzle_orm3.desc)(manga.updatedAt), (0, import_drizzle_orm3.desc)(manga.followedCount)],
      title: [(0, import_drizzle_orm3.asc)(manga.canonicalTitle)]
    };
    const orderBy = order[options.sort ?? "followed"];
    const rows = options.genre ? await this.db.select({ record: manga }).from(manga).innerJoin(mangaGenres, (0, import_drizzle_orm3.eq)(mangaGenres.mangaId, manga.id)).where((0, import_drizzle_orm3.and)(base, import_drizzle_orm3.sql`lower(${mangaGenres.genre}) = lower(${options.genre})`)).orderBy(...orderBy).limit(options.limit).offset(options.offset) : await this.db.select().from(manga).where(base).orderBy(...orderBy).limit(options.limit).offset(options.offset);
    const [{ count }] = options.genre ? await this.db.select({ count: import_drizzle_orm3.sql`count(*)::int` }).from(manga).innerJoin(mangaGenres, (0, import_drizzle_orm3.eq)(mangaGenres.mangaId, manga.id)).where((0, import_drizzle_orm3.and)(base, import_drizzle_orm3.sql`lower(${mangaGenres.genre}) = lower(${options.genre})`)) : await this.db.select({ count: import_drizzle_orm3.sql`count(*)::int` }).from(manga).where(base);
    return {
      items: rows.map((row) => row.record ? row.record : row),
      total: Number(count ?? 0)
    };
  }
  async search(query, limit) {
    const normalized = normalizeTitle(query);
    if (!normalized) return [];
    const rows = await this.db.select({ record: manga }).from(manga).innerJoin(mangaSearchIndex, (0, import_drizzle_orm3.eq)(mangaSearchIndex.mangaId, manga.id)).where(
      (0, import_drizzle_orm3.or)(
        (0, import_drizzle_orm3.ilike)(mangaSearchIndex.normalized, `%${normalized}%`),
        // Raw predicate as a fallback: the normaliser strips punctuation that
        // some titles are legitimately searched by.
        (0, import_drizzle_orm3.ilike)(manga.canonicalTitle, `%${query}%`)
      )
    ).orderBy((0, import_drizzle_orm3.desc)(manga.followedCount)).limit(limit);
    return rows.map((row) => row.record);
  }
  async replaceRelations(mangaId, detail) {
    await this.db.delete(mangaRelations).where((0, import_drizzle_orm3.eq)(mangaRelations.mangaId, mangaId));
    if (detail.relations.length === 0) return;
    await this.db.insert(mangaRelations).values(
      detail.relations.map((relation) => ({
        mangaId,
        relationType: relation.type,
        relatedMangaId: relation.providerId,
        relatedTitle: relation.title ?? null,
        coverUrl: relation.coverUrl ?? null
      }))
    ).onConflictDoNothing();
  }
  /**
   * Replace a title's external provider ids.
   *
   * Public so the manga service can seed the anilist cross-reference after a
   * bridge lookup without re-syncing the whole title.
   */
  async replaceExternalIds(mangaId, externalIds) {
    await this.#replaceExternalIds(mangaId, externalIds);
  }
  /**
   * Upsert the chapter feed (P11).
   *
   * Identity is (manga, language, chapter) rather than the provider uuid, so
   * re-fetching the feed updates rows in place instead of accumulating
   * duplicates. Chapters that disappear upstream are left alone: a partial feed
   * is a pagination artefact, not a deletion.
   */
  async upsertChapters(mangaId, incoming) {
    if (incoming.length === 0) return 0;
    const dedupedMap = /* @__PURE__ */ new Map();
    for (const chapter of incoming) {
      const key = `${chapter.language}:${chapter.chapterNumber}`;
      const existing = dedupedMap.get(key);
      if (!existing || chapter.pages > 0 && existing.pages === 0) {
        dedupedMap.set(key, chapter);
      }
    }
    const deduped = Array.from(dedupedMap.values());
    if (deduped.length === 0) return 0;
    return this.db.insert(mangaChapters).values(
      deduped.map((chapter) => ({
        mangaId,
        mangadexChapterId: chapter.externalId,
        chapterNumber: chapter.chapterNumber,
        volume: chapter.volume,
        title: chapter.title,
        language: chapter.language,
        pages: chapter.pages,
        translatedChapterCount: 0,
        scanlationGroup: chapter.scanlationGroup,
        publishedAt: chapter.publishedAt ? new Date(chapter.publishedAt) : null,
        updatedAt: /* @__PURE__ */ new Date()
      }))
    ).onConflictDoUpdate({
      target: [mangaChapters.mangaId, mangaChapters.language, mangaChapters.chapterNumber],
      set: {
        mangadexChapterId: import_drizzle_orm3.sql`excluded.mangadex_chapter_id`,
        volume: import_drizzle_orm3.sql`excluded.volume`,
        title: import_drizzle_orm3.sql`excluded.title`,
        pages: import_drizzle_orm3.sql`excluded.pages`,
        scanlationGroup: import_drizzle_orm3.sql`excluded.scanlation_group`,
        publishedAt: import_drizzle_orm3.sql`excluded.published_at`,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).then((rows) => rows.length);
  }
  /**
   * Chapter list, oldest first.
   *
   * Ordering is numeric where possible: "10" must sort after "9", which a plain
   * text sort gets backwards. Chapter numbers are strings upstream ("12.5"), so
   * this parses defensively and falls back to text for non-numeric values.
   */
  async listChapters(mangaId, language) {
    const conditions = [(0, import_drizzle_orm3.eq)(mangaChapters.mangaId, mangaId)];
    if (language) conditions.push((0, import_drizzle_orm3.eq)(mangaChapters.language, language));
    return this.db.select().from(mangaChapters).where((0, import_drizzle_orm3.and)(...conditions)).orderBy(
      import_drizzle_orm3.sql`nullif(regexp_replace(${mangaChapters.chapterNumber}, '[^0-9.]', '', 'g'), '')::numeric nulls last`,
      mangaChapters.chapterNumber
    );
  }
  async getChapter(localIdOrProviderId) {
    const [record] = await this.db.select().from(mangaChapters).where(
      (0, import_drizzle_orm3.or)(
        (0, import_drizzle_orm3.eq)(mangaChapters.id, localIdOrProviderId),
        (0, import_drizzle_orm3.eq)(mangaChapters.mangadexChapterId, localIdOrProviderId)
      )
    ).limit(1);
    return record ?? null;
  }
  /** The newest chapter, for a "read latest" shortcut. */
  async getLatestChapter(mangaId, language) {
    const chapters = await this.listChapters(mangaId, language);
    return chapters[chapters.length - 1] ?? null;
  }
  /**
   * Cached page list for a chapter (P12).
   *
   * Returned only while still valid: MangaDex@Home URLs are signed and expire,
   * so a stale row would hand the reader a broken image rather than a cheap hit.
   */
  async getChapterPages(chapterId) {
    const rows = await this.db.select().from(mangaChapterPages).where((0, import_drizzle_orm3.eq)(mangaChapterPages.chapterId, chapterId)).orderBy(mangaChapterPages.pageNumber);
    if (rows.length === 0) return null;
    if (rows[0].expiresAt.getTime() <= Date.now()) return null;
    const first = rows[0];
    return {
      baseUrl: first.baseUrl,
      hash: first.hash ?? "",
      pages: rows.map((row) => ({ pageNumber: row.pageNumber, fileName: row.fileName }))
    };
  }
  /** Replace a chapter's cached pages, dropping any that no longer exist. */
  async replaceChapterPages(chapterId, pages) {
    await this.db.delete(mangaChapterPages).where(
      (0, import_drizzle_orm3.and)(
        (0, import_drizzle_orm3.eq)(mangaChapterPages.chapterId, chapterId),
        import_drizzle_orm3.sql`${mangaChapterPages.pageNumber} > ${pages.pages.length}`
      )
    );
    const expiresAt = new Date(Date.now() + 10 * 6e4);
    await this.db.insert(mangaChapterPages).values(
      pages.pages.map((page) => ({
        chapterId,
        pageNumber: page.pageNumber,
        fileName: page.fileName,
        baseUrl: pages.baseUrl,
        hash: pages.hash,
        expiresAt
      }))
    ).onConflictDoUpdate({
      target: [mangaChapterPages.chapterId, mangaChapterPages.pageNumber],
      set: { baseUrl: pages.baseUrl, hash: pages.hash, expiresAt }
    });
  }
  /** Row count, for the health check. */
  async count() {
    const [{ count }] = await this.db.select({ count: import_drizzle_orm3.sql`count(*)::int` }).from(manga);
    return Number(count ?? 0);
  }
  /** All distinct genres across the catalogue, alphabetically. */
  async listGenres() {
    const rows = await this.db.selectDistinct({ genre: mangaGenres.genre }).from(mangaGenres).orderBy(mangaGenres.genre);
    return rows.map((row) => row.genre);
  }
};

// src/modules/manga/service.ts
init_config();
init_errors();

// src/providers/manga/mangadex.ts
init_config();
init_client();
init_errors();
var DETAIL_INCLUDES = ["cover_art", "author", "artist"];
var MAX_LIMIT = 100;
function preferred(map) {
  if (!map) return void 0;
  return map.en ?? Object.values(map).find((value) => typeof value === "string" && value.trim());
}
function relationshipFilename(resource, type) {
  return resource.relationships?.find((rel) => rel.type === type)?.attributes?.fileName ?? null;
}
function relationshipNames(resource, type) {
  return (resource.relationships ?? []).filter((rel) => rel.type === type).map((rel) => rel.attributes?.name).filter((name) => typeof name === "string" && name.length > 0);
}
function toStatus2(raw) {
  switch (raw) {
    case "ongoing":
      return "ONGOING";
    case "completed":
      return "COMPLETED";
    case "hiatus":
      return "HIATUS";
    case "cancelled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}
function toContentRating(raw) {
  switch (raw) {
    case "suggestive":
      return "suggestive";
    case "erotica":
      return "erotica";
    case "pornographic":
      return "pornographic";
    default:
      return "safe";
  }
}
function coverUrl(resource, width) {
  const filename = relationshipFilename(resource, "cover_art");
  if (!filename || !resource.id) return null;
  return `${config.MANGADEX_UPLOADS_ENDPOINT}/covers/${resource.id}/${filename}.${width}.jpg`;
}
function toGenres(resource) {
  const genres = [];
  for (const tag of resource.attributes?.tags ?? []) {
    const name = preferred(tag.attributes?.name);
    if (typeof name === "string" && name.length > 0) {
      genres.push({ name, group: tag.type ?? null });
    }
  }
  return genres;
}
function externalIdsOf(resource) {
  const ids = {};
  if (resource.id) ids.mangadex = resource.id;
  const links = resource.attributes?.links;
  if (links?.raw) {
    try {
      const parsed = new URL(links.raw);
      const anilistId = parsed.searchParams.get("anilist");
      const kitsuId = parsed.searchParams.get("kitsu");
      const malId = parsed.searchParams.get("myanimelist");
      if (anilistId) ids.anilist = anilistId;
      if (kitsuId) ids.kitsu = kitsuId;
      if (malId) ids.mal = malId;
    } catch {
    }
  }
  return ids;
}
function toSummary2(resource) {
  const attributes = resource.attributes ?? {};
  const primary = preferred(attributes.title) ?? "Untitled";
  const alternates = (attributes.altTitles ?? []).flatMap((map) => Object.values(map ?? {})).filter(
    (value) => typeof value === "string" && value.trim().length > 0 && value !== primary
  );
  const contentRating = toContentRating(attributes.contentRating);
  return {
    providerId: resource.id ?? "",
    titles: { primary, alternates: [...new Set(alternates)] },
    description: preferred(attributes.description) ?? null,
    coverUrl: coverUrl(resource, 256),
    coverImageLarge: coverUrl(resource, 512),
    status: toStatus2(attributes.status),
    contentRating,
    // Derived rather than re-requested: `pornographic` and `erotica` are the
    // ratings that must never appear in an unfiltered list.
    isAdult: contentRating === "erotica" || contentRating === "pornographic",
    year: attributes.year ?? null,
    originalLanguage: attributes.originalLanguage ?? null,
    genres: toGenres(resource),
    demographics: attributes.publishedDemographic ? [attributes.publishedDemographic] : [],
    authors: relationshipNames(resource, "author"),
    artists: relationshipNames(resource, "artist"),
    totalChapters: attributes.chapters ?? null,
    totalVolumes: attributes.volumes ?? null,
    translatedChapterCount: attributes.translatedChapterCount ?? null,
    followedCount: attributes.followedCount ?? null,
    rating: attributes.rating ?? null,
    externalIds: externalIdsOf(resource)
  };
}
function toRelation2(resource) {
  if (!resource.id) return null;
  return {
    // The relation kind is assigned by `relationTypeOf` from the edge that
    // carried this entry; MangaDex reports it on the edge, not the resource.
    type: "RELATED",
    providerId: resource.id,
    title: preferred(resource.attributes?.title) ?? null,
    coverUrl: coverUrl(resource, 256)
  };
}
function relationTypeOf(relation, inverse) {
  const base = (relation ?? "related").toUpperCase().replace(/[^A-Z_]+/g, "_");
  if (!inverse) return base;
  switch (base) {
    case "SEQUEL":
      return "PREQUEL";
    case "PREQUEL":
      return "SEQUEL";
    default:
      return base;
  }
}
var MangaDexProvider = class {
  slug = "mangadex";
  name = "MangaDex";
  priority = 1;
  #endpoint = config.MANGADEX_ENDPOINT;
  async search(query, limit = 20) {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], total: 0, limit, offset: 0 };
    return this.browse({ query: trimmed, limit });
  }
  async browse(query) {
    const limit = Math.min(query.limit ?? 20, MAX_LIMIT);
    const offset = Math.max(0, query.offset ?? 0);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    for (const include of DETAIL_INCLUDES) params.append("includes[]", include);
    if (query.query) params.set("title", query.query);
    for (const rating of query.contentRating ?? ["safe", "suggestive"]) {
      params.append("contentRating[]", rating);
    }
    for (const tag of query.includedTags ?? []) params.append("includedTags[]", tag);
    for (const status of query.status ?? []) params.append("status[]", status);
    for (const [key, direction] of Object.entries(query.order ?? defaultOrder(query))) {
      params.set(`order[${key}]`, direction);
    }
    const response = await fetchJson(`${this.#endpoint}/manga?${params}`);
    return {
      items: (response.data ?? []).map(toSummary2),
      total: response.total ?? 0,
      limit: response.limit ?? limit,
      offset: response.offset ?? offset
    };
  }
  async getById(providerId) {
    if (!providerId) return null;
    const params = new URLSearchParams();
    for (const include of DETAIL_INCLUDES) params.append("includes[]", include);
    const response = await fetchJson(
      `${this.#endpoint}/manga/${encodeURIComponent(providerId)}?${params}`
    );
    const resource = response.data?.[0];
    if (!resource) return null;
    const relations = await this.#getRelations(providerId);
    return { ...toSummary2(resource), relations };
  }
  async #getRelations(providerId) {
    try {
      const params = new URLSearchParams({ limit: "20" });
      for (const include of DETAIL_INCLUDES) params.append("includes[]", include);
      const response = await fetchJson(`${this.#endpoint}/manga/${encodeURIComponent(providerId)}/relationships?${params}`);
      return (response.data ?? []).map((entry) => {
        const relation = toRelation2(entry);
        return relation ? { ...relation, type: relationTypeOf(entry.relationship, entry.inverse ?? false) } : null;
      }).filter((relation) => relation !== null);
    } catch {
      return [];
    }
  }
  async getChapters(providerId, query = {}) {
    if (!providerId) return [];
    const params = new URLSearchParams();
    params.set("limit", String(Math.min(query.limit ?? 100, MAX_LIMIT)));
    params.set("offset", String(Math.max(0, query.offset ?? 0)));
    params.append("translatedLanguage[]", query.language ?? "en");
    params.append("includes[]", "scanlation_group");
    for (const [key, direction] of Object.entries(query.order ?? { chapter: "desc" })) {
      params.set(`order[${key}]`, direction);
    }
    const response = await fetchJson(
      `${this.#endpoint}/manga/${encodeURIComponent(providerId)}/feed?${params}`
    );
    return (response.data ?? []).map((resource) => toChapter(resource)).filter((chapter) => chapter !== null);
  }
  async getChapterPages(chapterExternalId) {
    const response = await fetchJson(
      `${this.#endpoint}/at-home/server/${encodeURIComponent(chapterExternalId)}`
    );
    const baseUrl = response.baseUrl;
    const hash = response.chapter?.hash;
    const files = response.chapter?.data ?? response.chapter?.dataSaver ?? [];
    if (!baseUrl || !hash || files.length === 0) {
      throw AppError.notFound(`no page data for chapter ${chapterExternalId} (external release)`);
    }
    return {
      baseUrl,
      hash,
      pages: files.map((fileName, index5) => ({ pageNumber: index5 + 1, fileName }))
    };
  }
  async healthCheck() {
    try {
      const response = await fetchJson(
        `${this.#endpoint}/health`,
        { timeoutMs: 3e3, retries: 0 }
      );
      return response !== null;
    } catch {
      return false;
    }
  }
};
function defaultOrder(query) {
  return query.query ? { relevance: "desc" } : { followedCount: "desc" };
}
function toChapter(resource) {
  const attributes = resource.attributes;
  if (!resource.id || attributes?.chapter == null) return null;
  const group = (resource.relationships ?? []).find(
    (rel) => rel.type === "scanlation_group"
  )?.attributes?.name;
  return {
    externalId: resource.id,
    chapterNumber: String(attributes.chapter),
    volume: attributes.volume ?? null,
    title: attributes.title ?? null,
    language: attributes.translatedLanguage ?? "en",
    pages: attributes.pages ?? 0,
    publishedAt: attributes.publishAt ? Date.parse(attributes.publishAt) : null,
    scanlationGroup: group ?? null
  };
}

// src/modules/manga/service.ts
var MangaService = class {
  constructor(repo, provider = new MangaDexProvider()) {
    this.repo = repo;
    this.provider = provider;
  }
  /** Ensure a title is in the database, fetching it if it is not. */
  async ensureCached(providerId) {
    try {
      const localId = await this.repo.getLocalIdByProviderId(providerId);
      if (localId) return localId;
    } catch {
    }
    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);
    return this.repo.upsert(detail).catch(() => providerId);
  }
  /** Detail for one title, backfilled on a cache miss. */
  async getByProviderId(providerId) {
    try {
      const cached = await this.repo.getByProviderId(providerId);
      if (cached) return cached;
    } catch {
    }
    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found`);
    const localId = await this.repo.upsert(detail).catch(() => providerId);
    return { ...detail, id: localId };
  }
  /**
   * Full detail including relations, always refreshed from the provider.
   */
  async getFull(providerId) {
    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);
    const localId = await this.repo.upsert(detail).catch(() => providerId);
    await this.repo.replaceRelations(localId, detail).catch(() => void 0);
    return { ...detail, id: localId };
  }
  /**
   * Resolve a manga by its AniList id.
   */
  async getByAnilistId(anilistId) {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) {
      throw Object.assign(new Error("invalid anilist id"), { statusCode: 400, reason: "bad_request" });
    }
    try {
      const cached = await this.repo.getByExternalId("anilist", anilistId);
      if (cached) return cached;
    } catch {
    }
    const anilist = new AnilistProvider();
    const manga2 = await anilist.getByAnilistId(anilistId, "MANGA");
    if (!manga2) throw AppError.notFound(`manga ${anilistId} not found upstream`);
    const mangadexId = manga2.externalIds?.mangadex;
    if (!mangadexId) {
      throw Object.assign(
        new Error(`manga ${anilistId} has no MangaDex cross-reference`),
        { statusCode: 404, reason: "not_found" }
      );
    }
    const full = await this.getFull(mangadexId);
    await this.repo.replaceExternalIds(full.id, manga2.externalIds).catch(() => void 0);
    return full;
  }
  /** Catalogue listing straight from the database, with provider fallback when empty or DB offline. */
  async list(options) {
    const dbCount = await this.count().catch(() => 0);
    if (dbCount > 0) {
      try {
        return await this.repo.list(options);
      } catch {
      }
    }
    let page;
    try {
      page = await this.provider.browse({
        limit: Math.max(options.limit, 20),
        offset: options.offset,
        status: options.status ? [options.status.toLowerCase()] : void 0
      });
    } catch (err) {
      throw Object.assign(
        new Error(`manga provider unavailable: ${err?.message ?? String(err)}`),
        { statusCode: 503, reason: "provider_unavailable" }
      );
    }
    if (page?.items && page.items.length > 0) {
      await Promise.all(
        page.items.map((summary) => this.repo.upsert(summary).catch(() => void 0))
      );
      try {
        return await this.repo.list(options);
      } catch {
        return { items: page.items, total: page.items.length };
      }
    }
    return { items: [], total: 0 };
  }
  /**
   * Title search: the database first, MangaDex on a miss or DB offline.
   */
  async search(query, limit) {
    try {
      const local = await this.repo.search(query, limit);
      if (local.length > 0) return local;
    } catch {
    }
    const page = await this.provider.search(query, limit);
    await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => void 0))
    );
    return page.items;
  }
  /**
   * Chapter list for a title, seeding it from MangaDex when empty.
   */
  async getChapters(providerId, options = {}) {
    const localId = await this.ensureCached(providerId).catch(() => providerId);
    const language = options.language ?? "en";
    try {
      const existing = await this.repo.listChapters(localId, language);
      if (existing.length > 0) return existing;
    } catch {
    }
    const key = `manga:chapters:${providerId}:${language}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      const incoming = await this.provider.getChapters(providerId, { language, limit: 100 });
      await this.repo.upsertChapters(localId, incoming).catch(() => void 0);
      return incoming;
    });
    if (!Array.isArray(value) || value.length === 0) return [];
    try {
      const list = await this.repo.listChapters(localId, language);
      if (list.length > 0) return list;
    } catch {
    }
    return value.map((ch) => ({
      id: ch.externalId,
      mangadexChapterId: ch.externalId,
      chapterNumber: ch.chapterNumber,
      volume: ch.volume,
      title: ch.title,
      language: ch.language,
      pages: ch.pages,
      scanlationGroup: ch.scanlationGroup,
      publishedAt: ch.publishedAt ? new Date(ch.publishedAt) : null
    }));
  }
  /** The newest chapter, for a "read latest" shortcut. */
  async getLatestChapter(providerId, options = {}) {
    const chapters = await this.getChapters(providerId, options);
    return chapters[chapters.length - 1] ?? null;
  }
  /** Single chapter by local id. */
  async getChapter(chapterId) {
    try {
      return await this.repo.getChapter(chapterId);
    } catch {
      return null;
    }
  }
  /**
   * Ordered page images for a chapter (P12).
   */
  async getChapterPages(chapterId) {
    let chapter = await this.repo.getChapter(chapterId).catch(() => null);
    if (!chapter) {
      chapter = { id: chapterId, mangadexChapterId: chapterId, pages: 0 };
    }
    const localChapterId = String(chapter.id);
    const cached = await this.repo.getChapterPages(localChapterId).catch(() => null);
    if (cached) {
      return shape(cached.baseUrl, cached.hash, cached.pages, chapter.pages);
    }
    const upstreamId = chapter.mangadexChapterId ?? chapterId;
    if (!upstreamId) {
      throw AppError.notFound(
        `chapter ${chapterId} has no provider id; re-sync the manga chapter list`
      );
    }
    const upstream = await this.provider.getChapterPages(String(upstreamId));
    await this.repo.replaceChapterPages(localChapterId, upstream).catch(() => void 0);
    return shape(upstream.baseUrl, upstream.hash, upstream.pages, chapter.pages);
  }
  /** Distinct genres across the catalogue. */
  async genres() {
    try {
      const rows = await this.repo.listGenres();
      if (rows && rows.length > 0) return rows;
    } catch {
    }
    return [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Fantasy",
      "Horror",
      "Isekai",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller"
    ];
  }
  /**
   * Look up a manga row by an external provider id.
   */
  async getByExternalId(idType, externalId) {
    try {
      return await this.repo.getByExternalId(idType, externalId);
    } catch {
      return null;
    }
  }
  /** Row count, for the health check. */
  async count() {
    try {
      return await this.repo.count();
    } catch {
      return 0;
    }
  }
};
function shape(baseUrl, hash, pages, chapterPageCount) {
  return {
    pageCount: chapterPageCount || pages.length,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      url: hash ? `${baseUrl}/data/${hash}/${page.fileName}` : `${baseUrl}/data/${page.fileName}`
    }))
  };
}

// src/modules/manga/routes.ts
var import_zod3 = require("zod");
function parseOrThrow2(schema2, value) {
  const result = schema2.safeParse(value);
  if (!result.success) {
    throw Object.assign(
      new Error(result.error.issues[0]?.message ?? "invalid request"),
      { statusCode: 400, reason: "bad_request" }
    );
  }
  return result.data;
}
var pagination2 = {
  limit: import_zod3.z.coerce.number().int().min(1).max(100).default(20),
  offset: import_zod3.z.coerce.number().int().min(0).default(0)
};
var listQuery2 = import_zod3.z.object({
  ...pagination2,
  genre: import_zod3.z.string().trim().min(1).max(128).optional(),
  status: import_zod3.z.enum(["ONGOING", "COMPLETED", "HIATUS", "CANCELLED"]).optional(),
  sort: import_zod3.z.enum(MANGA_SORTS).optional(),
  includeAdult: import_zod3.z.enum(["true", "false"]).optional().transform((value) => value === "true")
});
var searchQuery2 = import_zod3.z.object({
  q: import_zod3.z.string().trim().min(1, "q is required").max(120),
  limit: import_zod3.z.coerce.number().int().min(1).max(100).default(20)
});
var chapterQuery = import_zod3.z.object({
  language: import_zod3.z.string().trim().min(2).max(16).default("en")
});
var idParam = import_zod3.z.object({ id: import_zod3.z.string().trim().min(1) });
function registerMangaRoutes(app, service) {
  app.get("/api/v1/manga", async (request) => {
    const query = parseOrThrow2(listQuery2, request.query);
    const { items, total } = await service.list({
      limit: query.limit,
      offset: query.offset,
      genre: query.genre,
      status: query.status,
      includeAdult: query.includeAdult,
      sort: query.sort
    });
    return { items, total, limit: query.limit, offset: query.offset };
  });
  app.get("/api/v1/manga/search", async (request) => {
    const { q, limit } = parseOrThrow2(searchQuery2, request.query);
    return { query: q, items: await service.search(q, limit) };
  });
  app.get("/api/v1/manga/:id", async (request) => {
    const { id } = parseOrThrow2(idParam, request.params);
    return service.getFull(id);
  });
  app.get("/api/v1/manga/:id/relations", async (request) => {
    const { id } = parseOrThrow2(idParam, request.params);
    const detail = await service.getByProviderId(id);
    return { relations: detail.relations ?? [] };
  });
  app.get("/api/v1/manga/:id/chapters", async (request) => {
    const { id } = parseOrThrow2(idParam, request.params);
    const { language } = parseOrThrow2(chapterQuery, request.query);
    const items = await service.getChapters(id, { language });
    return { mangaId: id, language, items };
  });
  app.get("/api/v1/manga/:id/latest", async (request) => {
    const { id } = parseOrThrow2(idParam, request.params);
    const { language } = parseOrThrow2(chapterQuery, request.query);
    const chapter = await service.getLatestChapter(id, { language });
    return { mangaId: id, language, chapter };
  });
  app.get("/api/v1/manga/chapters/:chapterId", async (request) => {
    const { chapterId } = parseOrThrow2(
      import_zod3.z.object({ chapterId: import_zod3.z.string().trim().min(1) }),
      request.params
    );
    const chapter = await service.getChapter(chapterId);
    if (!chapter) {
      throw Object.assign(new Error(`chapter ${chapterId} not found`), {
        statusCode: 404,
        reason: "not_found"
      });
    }
    return chapter;
  });
  app.get("/api/v1/manga/chapters/:chapterId/pages", async (request, reply) => {
    const { chapterId } = parseOrThrow2(
      import_zod3.z.object({ chapterId: import_zod3.z.string().trim().min(1) }),
      request.params
    );
    const result = await service.getChapterPages(chapterId);
    reply.header("cache-control", "no-store");
    return result;
  });
  app.get("/api/v1/manga/by-anilist/:anilistId", async (request) => {
    const { anilistId } = parseOrThrow2(
      import_zod3.z.object({ anilistId: import_zod3.z.string().trim().min(1) }),
      request.params
    );
    return service.getByAnilistId(anilistId);
  });
  app.get("/api/v1/manga/genres", async () => ({ items: await service.genres() }));
}

// src/modules/schedule/service.ts
var import_drizzle_orm4 = require("drizzle-orm");
init_config();
init_errors();
init_jikan();
var DAY_MS = 864e5;
var MAX_SCHEDULE_ITEMS = 100;
var RECENT_AIRING_WINDOW_DAYS = 14;
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var ScheduleService = class {
  constructor(db, animeRepo, now = () => /* @__PURE__ */ new Date(), timeZone = config.SCHEDULE_TIMEZONE) {
    this.db = db;
    this.animeRepo = animeRepo;
    this.now = now;
    this.timeZone = timeZone;
  }
  #anilist = new AnilistProvider();
  #jikan = new JikanProvider();
  /**
   * Sync one title's schedule.
   *
   * Real slots from the provider are upserted first, then the cadence is
   * extrapolated forward. Inference is capped so a show with an unknown cadence
   * cannot generate an unbounded number of rows.
   *
   * AniList is the primary source. When it has no airing data (the title is
   * not currently releasing, or AniList's data is stale), Jikan is tried as a
   * fallback before giving up.
   */
  async syncAnime(anilistId) {
    const localId = await this.animeRepo.getLocalIdByAnilistId(anilistId);
    if (!localId) throw AppError.notFound(`anime ${anilistId} is not cached`);
    const record = await this.animeRepo.getByAnilistId(anilistId);
    let slots = await this.#anilist.getAiringSlots(anilistId);
    let source = "anilist";
    if (slots.length === 0 && record?.externalIds?.mal) {
      slots = await this.#jikan.getAiringSlots(record.externalIds.mal);
      if (slots.length > 0) source = "jikan";
    }
    if (slots.length === 0) return 0;
    const written = await this.#upsertSlots(localId, slots, source);
    const inferred = await this.#extrapolate(
      localId,
      slots,
      record?.totalEpisodes ?? null
    );
    return written + inferred;
  }
  /**
   * Upsert concrete slots.
   *
   * A real observation replaces an inferred row on conflict, which is what keeps
   * a provider's answer authoritative over our own guess.
   */
  async #upsertSlots(animeId, slots, source) {
    let count = 0;
    for (const slot of slots) {
      const [row] = await this.db.insert(airingSchedule).values({
        animeId,
        episodeNumber: slot.episodeNumber,
        airingAt: new Date(slot.airingAt * 1e3),
        status: slot.status,
        source,
        lastVerifiedAt: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: [airingSchedule.animeId, airingSchedule.episodeNumber],
        set: {
          airingAt: new Date(slot.airingAt * 1e3),
          status: slot.status,
          source,
          lastVerifiedAt: /* @__PURE__ */ new Date()
        }
      }).returning({ id: airingSchedule.id });
      if (row) count++;
    }
    return count;
  }
  /**
     * Extend the schedule forward using the observed cadence.
     *
     * AniList gives one slot, so no interval can be measured directly; weekly is
     * the documented default for TV releases and is what a 7-day
     * `timeUntilAiring` implies. The horizon is capped by the total episode
     * count, which is what stops a finished show from gaining future dates.
     */
  async #extrapolate(animeId, slots, totalEpisodes) {
    if (slots.length === 0) return 0;
    const latest = slots.reduce((max, slot) => Math.max(max, slot.episodeNumber), 0);
    const horizon = Math.min(latest + 6, totalEpisodes ?? latest + 3);
    if (horizon <= latest) return 0;
    const cadenceSeconds = 7 * (DAY_MS / 1e3);
    const anchorSeconds = slots[0].airingAt;
    const projected = [];
    for (let episode = latest + 1; episode <= horizon; episode++) {
      projected.push({
        episodeNumber: episode,
        airingAt: anchorSeconds + (episode - latest) * cadenceSeconds,
        status: "NOT_YET_AIRRED"
      });
    }
    return this.#upsertSlots(animeId, projected, "inferred");
  }
  /** Everything airing within a window, joined with title metadata. */
  async list(options) {
    const now = this.now();
    const from = options.from ?? new Date(now.getTime() - DAY_MS);
    const to = options.to ?? new Date(now.getTime() + 7 * DAY_MS);
    const rows = await this.db.select({
      scheduleId: airingSchedule.id,
      episodeNumber: airingSchedule.episodeNumber,
      airingAt: airingSchedule.airingAt,
      status: airingSchedule.status,
      source: airingSchedule.source,
      animeId: anime.id,
      anilistId: anime.anilistId,
      title: anime.canonicalTitle,
      coverUrl: anime.coverUrl,
      totalEpisodes: anime.totalEpisodes,
      slug: anime.slug
    }).from(airingSchedule).innerJoin(anime, (0, import_drizzle_orm4.eq)(anime.id, airingSchedule.animeId)).where((0, import_drizzle_orm4.and)((0, import_drizzle_orm4.gte)(airingSchedule.airingAt, from), (0, import_drizzle_orm4.lte)(airingSchedule.airingAt, to))).orderBy((0, import_drizzle_orm4.asc)(airingSchedule.airingAt)).limit(options.limit ?? 200);
    const readAt = this.now();
    return rows.map((row) => ({
      ...row,
      // Derived from the clock on every read, never from the stored label.
      // `status` is what the provider claimed when the row was written, and it
      // is not maintained afterwards: without this, a slot written as
      // NOT_YET_AIRED still reads that way weeks after the episode has aired.
      airingState: airingStateAt(row.airingAt, readAt),
      providerStatus: row.status,
      dayOfWeek: DAY_NAMES[row.airingAt.getUTCDay()],
      // Computed per read so a cached day view still shows a live countdown.
      secondsUntil: secondsUntil(row.airingAt, readAt)
    }));
  }
  /**
   * The next episodes to air, soonest first.
   *
   * Strictly future relative to the injected clock, so a slot that airs in the
   * next few minutes drops off this list once it has aired rather than lingering
   * as a countdown stuck at zero. Paged because a long-running show contributes
   * many rows and a client asking for more should be able to.
   */
  async upcoming(options = {}) {
    const now = this.now();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_SCHEDULE_ITEMS);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = await this.db.select({
      episodeNumber: airingSchedule.episodeNumber,
      airingAt: airingSchedule.airingAt,
      providerStatus: airingSchedule.status,
      source: airingSchedule.source,
      animeId: anime.id,
      anilistId: anime.anilistId,
      title: anime.canonicalTitle,
      coverUrl: anime.coverUrl,
      totalEpisodes: anime.totalEpisodes,
      slug: anime.slug
    }).from(airingSchedule).innerJoin(anime, (0, import_drizzle_orm4.eq)(anime.id, airingSchedule.animeId)).where((0, import_drizzle_orm4.gt)(airingSchedule.airingAt, now)).orderBy((0, import_drizzle_orm4.asc)(airingSchedule.airingAt)).limit(limit).offset(offset);
    return rows.map((row) => ({
      ...row,
      airingState: airingStateAt(row.airingAt, now),
      secondsUntil: secondsUntil(row.airingAt, now)
    }));
  }
  /**
   * Episodes that have already aired, most recent first.
   *
   * Aired is derived from the stored timestamp, never from when the row was
   * written or from `source_updated_at`. A sync can backfill months of history
   * in one pass, so insert time would report the whole backfill as "just aired".
   */
  async recent(options = {}) {
    const now = this.now();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_SCHEDULE_ITEMS);
    const offset = Math.max(options.offset ?? 0, 0);
    const withinDays = Math.min(Math.max(options.withinDays ?? RECENT_AIRING_WINDOW_DAYS, 1), 90);
    const since = new Date(now.getTime() - withinDays * DAY_MS);
    const rows = await this.db.select({
      episodeNumber: airingSchedule.episodeNumber,
      airingAt: airingSchedule.airingAt,
      providerStatus: airingSchedule.status,
      source: airingSchedule.source,
      animeId: anime.id,
      anilistId: anime.anilistId,
      title: anime.canonicalTitle,
      coverUrl: anime.coverUrl,
      totalEpisodes: anime.totalEpisodes,
      slug: anime.slug
    }).from(airingSchedule).innerJoin(anime, (0, import_drizzle_orm4.eq)(anime.id, airingSchedule.animeId)).where((0, import_drizzle_orm4.and)((0, import_drizzle_orm4.lte)(airingSchedule.airingAt, now), (0, import_drizzle_orm4.gte)(airingSchedule.airingAt, since))).orderBy((0, import_drizzle_orm4.desc)(airingSchedule.airingAt)).limit(limit).offset(offset);
    return rows.map((row) => ({
      ...row,
      airingState: airingStateAt(row.airingAt, now),
      secondsUntil: secondsUntil(row.airingAt, now)
    }));
  }
  /**
   * Today's schedule in the configured calendar zone.
   *
   * The window is a civil day in `SCHEDULE_TIMEZONE`, not a 24 hour span from
   * "now" and not the server's local day. The returned key is the local calendar
   * date, so a client can label the day without recomputing the zone itself.
   */
  async today() {
    const now = this.now();
    const from = startOfDay(now, this.timeZone);
    const to = startOfNextDay(now, this.timeZone);
    return {
      date: localDateKey(now, this.timeZone),
      timeZone: this.timeZone,
      items: await this.list({ from, to })
    };
  }
  /**
   * The current calendar week, Monday to Sunday, in the configured zone.
   */
  async week() {
    const now = this.now();
    const { from, to } = weekWindow(now, this.timeZone);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: this.timeZone,
      days: await this.grouped({ from, to })
    };
  }
  /** Schedule for one title. */
  async forAnime(anilistId) {
    const localId = await this.animeRepo.getLocalIdByAnilistId(anilistId);
    if (!localId) throw AppError.notFound(`anime ${anilistId} is not cached`);
    const rows = await this.db.select().from(airingSchedule).where((0, import_drizzle_orm4.eq)(airingSchedule.animeId, localId)).orderBy((0, import_drizzle_orm4.asc)(airingSchedule.episodeNumber));
    const readAt = this.now();
    return rows.map((row) => ({
      ...row,
      airingState: airingStateAt(row.airingAt, readAt),
      providerStatus: row.status,
      secondsUntil: secondsUntil(row.airingAt, readAt)
    }));
  }
  /**
   * Group a schedule into days for `GET /schedule/week`.
   *
   * Grouping lives here so the week view and a future season view share a shape.
   */
  async grouped(options = {}) {
    const rows = await this.list({ ...options, limit: 500 });
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const key = row.airingAt.toISOString().slice(0, 10);
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.entries()].map(([date, entries]) => ({
      date,
      dayOfWeek: DAY_NAMES[(/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).getUTCDay()],
      entries
    }));
  }
  /** Titles currently marked as releasing, for the sync job to walk. */
  async listAiringAnime(limit) {
    const rows = await this.db.selectDistinct({ anilistId: anime.anilistId }).from(airingSchedule).innerJoin(anime, (0, import_drizzle_orm4.eq)(anime.id, airingSchedule.animeId)).where((0, import_drizzle_orm4.eq)(anime.status, "RELEASING")).limit(limit);
    return rows.map((row) => row.anilistId).filter((id) => id != null).map(String);
  }
};

// src/modules/schedule/routes.ts
var import_zod4 = require("zod");
init_errors();
function parseOrThrow3(schema2, value) {
  const result = schema2.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", result.error.issues[0]?.message ?? "invalid request", 400);
  }
  return result.data;
}
var windowQuery = import_zod4.z.object({
  from: import_zod4.z.coerce.date().optional(),
  to: import_zod4.z.coerce.date().optional()
});
var paged = import_zod4.z.object({
  limit: import_zod4.z.coerce.number().int().min(1).max(100).default(20),
  offset: import_zod4.z.coerce.number().int().min(0).max(1e4).default(0)
});
var recentQuery = paged.extend({
  withinDays: import_zod4.z.coerce.number().int().min(1).max(90).default(14)
});
function registerScheduleRoutes(app, service) {
  app.get("/api/v1/schedule", async (request) => {
    const query = parseOrThrow3(windowQuery, request.query);
    return { items: await service.list(query) };
  });
  app.get("/api/v1/schedule/today", async () => service.today());
  app.get("/api/v1/schedule/week", async () => service.week());
  app.get("/api/v1/schedule/upcoming", async (request) => {
    const query = parseOrThrow3(paged, request.query);
    return { items: await service.upcoming(query) };
  });
  app.get("/api/v1/schedule/recent", async (request) => {
    const query = parseOrThrow3(recentQuery, request.query);
    return { items: await service.recent(query) };
  });
  app.get("/api/v1/anime/:id/schedule", async (request) => {
    const { id } = parseOrThrow3(import_zod4.z.object({ id: import_zod4.z.string().trim().min(1) }), request.params);
    return { items: await service.forAnime(id) };
  });
  app.post("/api/v1/schedule/sync/:id", async (request) => {
    const { id } = parseOrThrow3(import_zod4.z.object({ id: import_zod4.z.string().trim().min(1) }), request.params);
    return { anilistId: id, written: await service.syncAnime(id) };
  });
}

// src/modules/playback/service.ts
init_client();
init_errors();

// src/modules/playback/identity.ts
function requiredIdTypeOf(provider) {
  if (provider.capabilities.requiredIdType && provider.capabilities.requiredIdType !== "none" && provider.capabilities.requiredIdType !== "slug") {
    return provider.capabilities.requiredIdType;
  }
  if (provider.capabilities.requiresMalId) return "mal";
  return null;
}
async function resolveEpisodeIdentity(repo, episodeId) {
  try {
    const episode = await repo.getEpisode(episodeId);
    if (episode) {
      const animeId = String(episode.animeId);
      const episodeNumber2 = Number(episode.episodeNumber);
      const [title] = await repo.listParentTitles([animeId]);
      if (title) {
        const external2 = { ...title.externalIds ?? {} };
        const anilistId2 = external2.anilist ?? (title.anilistId != null ? String(title.anilistId) : null);
        if (anilistId2) external2.anilist = anilistId2;
        const episodeExternal = await repo.getEpisodeExternalIds(episodeId).catch(() => []);
        const episodeIds = {};
        for (const row of episodeExternal) episodeIds[row.providerSlug] = row.externalId;
        return {
          animeId,
          episodeNumber: episodeNumber2,
          anilistId: anilistId2,
          identity: { anime: external2, episode: episodeIds, skipped: [], eligible: [] }
        };
      }
    }
  } catch {
  }
  let anilistId = null;
  let episodeNumber = 1;
  const match = episodeId.match(/^(?:ep-)?(\d+)-(\d+)$/);
  if (match) {
    anilistId = match[1];
    episodeNumber = parseInt(match[2], 10);
  } else {
    const epMatch = episodeId.match(/^(?:ep-)?(\d+)$/);
    if (epMatch) {
      anilistId = epMatch[1];
      episodeNumber = 1;
    }
  }
  if (!anilistId) return null;
  const external = { anilist: anilistId };
  return {
    animeId: anilistId,
    episodeNumber,
    anilistId,
    identity: { anime: external, episode: {}, skipped: [], eligible: [] }
  };
}
function partitionProviders(providers2, identity, options) {
  const eligible = [];
  const skipped = [];
  for (const provider of providers2) {
    if (!provider.enabled) {
      skipped.push({ providerSlug: provider.slug, reason: "inactive" });
      continue;
    }
    if (options.quarantined(provider.slug)) {
      skipped.push({ providerSlug: provider.slug, reason: "quarantined" });
      continue;
    }
    if (!provider.capabilities.languages.includes(options.language)) {
      skipped.push({ providerSlug: provider.slug, reason: "unsupported_language" });
      continue;
    }
    const required = requiredIdTypeOf(provider);
    if (required && !identity.anime[required]) {
      skipped.push({
        providerSlug: provider.slug,
        reason: "missing_required_id",
        detail: `needs ${required}`
      });
      continue;
    }
    eligible.push(provider);
  }
  return { eligible, skipped };
}

// src/modules/playback/service.ts
var SOURCE_CACHE_TTL_S = 90;
var MAX_VALIDATED_SOURCES = 15;
var PROVIDER_DEADLINE_MS = 5e3;
function withDeadline(work, deadlineMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("provider_timeout", `${label} exceeded ${deadlineMs}ms`, 504));
    }, deadlineMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
var PlaybackResolver = class {
  constructor(providers2, animeRepo) {
    this.providers = providers2;
    this.animeRepo = animeRepo;
  }
  /**
   * Resolve sources for a canonical episode (P5).
   *
   * The whole flow in one place: load the episode, work out which providers we
   * hold the identity to ask, ask them, and report what happened. The HTTP layer
   * passes a canonical episode id and a language and receives canonical results.
   *
   * Returns null only when the episode does not exist. "No sources" is a
   * successful answer about a real episode, not a missing one.
   */
  async resolveEpisode(episodeId, options = {}) {
    const resolved = await resolveEpisodeIdentity(this.animeRepo, episodeId);
    if (!resolved) return null;
    const language = options.language ?? "sub";
    const episode = await this.animeRepo.getEpisode(episodeId).catch(() => null) ?? {
      id: episodeId,
      episodeNumber: resolved.episodeNumber,
      title: `Episode ${resolved.episodeNumber}`
    };
    const parentTitles = await this.animeRepo.listParentTitles([resolved.animeId]).catch(() => []);
    const title = parentTitles[0];
    const externalIds = { ...title?.externalIds ?? {} };
    if (resolved.anilistId) externalIds.anilist = resolved.anilistId;
    const titleString = title?.canonicalTitle ?? title?.titleEnglish ?? title?.titleRomaji ?? `Anime ${resolved.anilistId}`;
    const result = await this.resolve(
      {
        animeId: resolved.animeId,
        anilistId: resolved.anilistId ?? "",
        malId: externalIds.mal,
        episodeNumber: resolved.episodeNumber,
        language,
        animeTitle: titleString,
        episodeExternalIds: resolved.identity.episode,
        externalIds
      },
      resolved.identity.episode
    );
    return { result, episode };
  }
  /** Resolve sources for one episode, served from cache when warm. */
  async resolve(request, episodeIdentity = {}) {
    const language = request.language ?? "sub";
    const full = { ...request, language };
    const started = Date.now();
    const key = `sources:${request.anilistId}:${request.episodeNumber}:${language}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    const outcome = await this.#resolveUncached(full, episodeIdentity);
    const result = { ...outcome, resolutionTimeMs: Date.now() - started };
    if (result.sources.length > 0) {
      await cache.set(key, result, SOURCE_CACHE_TTL_S).catch(() => void 0);
    }
    return result;
  }
  /**
   * Fan out to every eligible provider concurrently.
   *
   * Concurrency is bounded because some providers rate limit aggressively, and
   * probing twenty at once gets every one of them throttled.
   */
  async #resolveUncached(request, identity = {}) {
    const { eligible: candidates, skipped } = partitionProviders(
      this.providers,
      {
        // The request already carries the external ids the route resolved.
        anime: {
          ...request.externalIds ?? {},
          anilist: request.anilistId,
          mal: request.malId
        },
        episode: identity
      },
      {
        language: request.language,
        quarantined: (slug) => healthRegistry.isQuarantined(slug)
      }
    );
    if (candidates.length === 0) {
      const anyQuarantined = skipped.some((entry) => entry.reason === "quarantined");
      return {
        sources: [],
        attempts: [],
        resolutionTimeMs: 0,
        skipped,
        emptyReason: skipped.length === 0 ? "no_streams" : anyQuarantined ? "quarantined" : "no_streams"
      };
    }
    const attempts = [];
    const collected = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length) {
        const provider = candidates[cursor++];
        const providerStarted = Date.now();
        try {
          const providerEpisodeId = identity[provider.slug] ?? request.episodeExternalIds?.[provider.slug];
          const providerReq = {
            ...request,
            providerEpisodeId
          };
          const sources = await withDeadline(
            provider.resolve(providerReq),
            PROVIDER_DEADLINE_MS,
            provider.slug
          );
          const latencyMs = Date.now() - providerStarted;
          const outcome = sources.length > 0 ? "ok" : "empty";
          healthRegistry.record(provider.slug, outcome, latencyMs);
          collected.push(...sources);
          attempts.push({ providerSlug: provider.slug, outcome, count: sources.length, latencyMs });
        } catch (error) {
          const latencyMs = Date.now() - providerStarted;
          const message = errorMessage(error);
          const outcome = error instanceof AppError && error.reason === "provider_timeout" ? "timeout" : "error";
          healthRegistry.record(provider.slug, outcome, latencyMs, message);
          attempts.push({
            providerSlug: provider.slug,
            outcome,
            count: 0,
            latencyMs,
            error: message
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(6, candidates.length) }, () => worker())
    );
    const valid = collected.filter((source) => this.#isValidSourceUrl(source.playbackUrl));
    const byLanguage = filterByLanguage(valid, request.language);
    const ranked = rankSources(byLanguage);
    if (ranked.length === 0) {
      const everyoneFailed = attempts.every(
        (attempt) => attempt.outcome === "error" || attempt.outcome === "timeout"
      );
      return {
        sources: [],
        attempts,
        skipped,
        resolutionTimeMs: 0,
        emptyReason: everyoneFailed ? "all_failed" : "no_streams"
      };
    }
    return {
      sources: dedupeSources(await this.#validate(ranked.slice(0, MAX_VALIDATED_SOURCES))),
      attempts,
      skipped,
      resolutionTimeMs: 0
    };
  }
  /**
     * Probe the best candidates and mark the dead ones.
     *
     * Only the top slice is probed: validation costs a request each, and a source
     * ranked sixth is not going to be chosen over five working ones. Probing all of
     * them would make the common case slower for no benefit.
     *
     * This is the only place a source URL is contacted. P6 removed the gateway's
     * duplicate probe: the resolver already issues a real request per candidate and
     * records the answer in `validated`, so probing again bought nothing and cost
     * one extra round trip per candidate.
     *
     * If every candidate fails to validate the originals are returned anyway:
     * a possibly-dead source is still more useful to a player than an empty list,
     * and the `validated` flag tells the client which is which.
     */
  async #validate(candidates) {
    const results = await Promise.all(
      candidates.map(async (source) => {
        if (source.accessType === "embed") {
          return { ...source, validated: true };
        }
        try {
          const probeHeaders = {
            ...source.headers ?? {},
            ...source.referer ? { referer: source.referer } : {}
          };
          const probe = await probeUrl(source.playbackUrl, {
            headers: probeHeaders
          });
          if (!probe.ok && probe.status !== 206) {
            return { ...source, validated: false };
          }
          const isHtml = probe.contentType?.toLowerCase().includes("text/html");
          if (isHtml) {
            return { ...source, validated: false };
          }
          return { ...source, validated: true };
        } catch {
          return { ...source, validated: false };
        }
      })
    );
    const alive = results.filter((source) => source.validated !== false);
    return alive.length > 0 ? alive : results;
  }
  /**
   * Validate a source URL before it enters ranking.
   *
   * A source with a malformed URL or non-http protocol can never play, so it is
   * dropped here rather than after ranking — there is no point probing a URL
   * that is structurally invalid.
   */
  #isValidSourceUrl(url2) {
    try {
      const parsed = new URL(url2);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (!parsed.hostname) return false;
      return true;
    } catch {
      return false;
    }
  }
  /** Current health, for the observability endpoint. */
  health() {
    return this.providers.map((provider) => ({
      slug: provider.slug,
      name: provider.name,
      kind: provider.kind,
      basePriority: provider.basePriority,
      capabilities: provider.capabilities,
      health: healthRegistry.get(provider.slug)
    }));
  }
  /** Probe every provider once; used by the background health job (P18). */
  async checkAll() {
    return Promise.all(
      this.providers.map(async (provider) => {
        const started = Date.now();
        try {
          const ok = await provider.healthCheck();
          healthRegistry.record(
            provider.slug,
            ok ? "ok" : "error",
            Date.now() - started,
            ok ? void 0 : "health check failed"
          );
          return { slug: provider.slug, ok };
        } catch (error) {
          healthRegistry.record(
            provider.slug,
            "error",
            Date.now() - started,
            errorMessage(error)
          );
          return { slug: provider.slug, ok: false };
        }
      })
    );
  }
};

// src/modules/playback/metadata.ts
var import_drizzle_orm5 = require("drizzle-orm");
var import_zod5 = require("zod");
var META_TTL_S = 7 * 86400;
var persistedEpisodeMetadataSchema = import_zod5.z.object({
  episodeId: import_zod5.z.string(),
  intro: import_zod5.z.object({ start: import_zod5.z.number(), end: import_zod5.z.number() }).strict().optional(),
  outro: import_zod5.z.object({ start: import_zod5.z.number(), end: import_zod5.z.number() }).strict().optional(),
  subtitles: import_zod5.z.array(
    import_zod5.z.object({ language: import_zod5.z.string(), kind: import_zod5.z.string().optional() }).strict()
  ),
  sourceUpdatedAt: import_zod5.z.number().int().nullable()
}).strict();
var PlaybackMetadataService = class {
  constructor(db, providers2) {
    this.db = db;
    this.providers = providers2;
  }
  /**
   * Return stored metadata for an episode, deriving it when missing/stale.
   *
   * Subtitle URLs are always derived fresh; only stable descriptors are
   * stored or read back. Failures yield an empty-but-valid result rather
   * than an error: a missing marker must not block playback.
   */
  async get(episodeId, request) {
    const stored = await this.#read(episodeId);
    let persisted = stored;
    if (!stored || !this.#isFresh(stored.sourceUpdatedAt)) {
      const derived = await this.#deriveMarkers(request);
      persisted = this.#merge(episodeId, stored, derived);
      await this.#write(persisted);
    }
    const subtitles = await this.#collectSubtitles(request);
    return {
      episodeId,
      subtitles,
      intro: persisted?.intro,
      outro: persisted?.outro,
      sourceUpdatedAt: persisted?.sourceUpdatedAt ?? null
    };
  }
  #isFresh(sourceUpdatedAt) {
    if (!sourceUpdatedAt) return false;
    return Date.now() / 1e3 - sourceUpdatedAt < META_TTL_S;
  }
  async #read(episodeId) {
    const [row] = await this.db.select().from(episodePlaybackMeta).where((0, import_drizzle_orm5.eq)(episodePlaybackMeta.episodeId, episodeId)).limit(1);
    if (!row) return null;
    return {
      episodeId,
      intro: row.introStartSeconds != null && row.introEndSeconds != null ? { start: row.introStartSeconds, end: row.introEndSeconds } : void 0,
      outro: row.outroStartSeconds != null && row.outroEndSeconds != null ? { start: row.outroStartSeconds, end: row.outroEndSeconds } : void 0,
      subtitles: row.subtitles ?? [],
      sourceUpdatedAt: row.sourceUpdatedAt
    };
  }
  /**
   * Merge a fresh derivation into stored metadata.
   *
   * A provider answering "no markers" does not erase known markers, and a
   * provider that no longer lists a language does not erase the descriptor:
   * unknown stays unknown, stored stays. Known values are replaced only by
   * concrete new values.
   */
  #merge(episodeId, stored, derived) {
    const subtitles = new Map(
      (stored?.subtitles ?? []).map((subtitle) => [subtitle.language, subtitle])
    );
    for (const subtitle of derived.subtitles) {
      subtitles.set(subtitle.language, subtitle);
    }
    return {
      episodeId,
      intro: derived.intro ?? stored?.intro,
      outro: derived.outro ?? stored?.outro,
      subtitles: [...subtitles.values()],
      sourceUpdatedAt: Math.floor(Date.now() / 1e3)
    };
  }
  /** Ask every capable provider for markers; the first usable answer wins. */
  async #deriveMarkers(request) {
    const markers = await Promise.all(
      skipCapableProviders(this.providers).map(async (provider) => {
        try {
          return await provider.getSkipMarkers?.(request) ?? null;
        } catch {
          return null;
        }
      })
    );
    const first = markers.find(Boolean) ?? void 0;
    const subtitles = await this.#collectSubtitles(request);
    const descriptors = subtitles.map(({ language, kind }) => ({ language, ...kind !== void 0 ? { kind } : {} })).filter((descriptor, index5, list) => list.findIndex((d) => d.language === descriptor.language) === index5);
    return {
      subtitles: descriptors,
      intro: first?.intro,
      outro: first?.outro
    };
  }
  /**
   * Gather subtitle sidecars fresh for every request.
   *
   * Resolving sources just for their subtitle field is wasteful, so this
   * reuses the same ephemeral flow; URLs are returned to the caller but
   * stripped before persistence.
   */
  async #collectSubtitles(request) {
    const capable = subtitleCapableProviders(this.providers);
    if (capable.length === 0) return [];
    const collected = await Promise.all(
      capable.map(async (provider) => {
        try {
          const sources = await provider.resolve(request);
          return sources.flatMap((source) => source.subtitles ?? []);
        } catch {
          return [];
        }
      })
    );
    const seen = /* @__PURE__ */ new Set();
    return collected.flat().filter((subtitle) => {
      if (seen.has(subtitle.url)) return false;
      seen.add(subtitle.url);
      return true;
    });
  }
  /**
   * Write stable metadata only.
   *
   * Values are type-erased to PersistedEpisodeMetadata -- the persisted
   * schema's strict shape -- and parsed before the insert, so an unknown
   * key or an ephemeral URL field cannot reach PostgreSQL even when the
   * caller is lax with types.
   */
  async #write(values) {
    const parsed = persistedEpisodeMetadataSchema.parse(values);
    await this.db.insert(episodePlaybackMeta).values({
      episodeId: parsed.episodeId,
      introStartSeconds: parsed.intro?.start ?? null,
      introEndSeconds: parsed.intro?.end ?? null,
      outroStartSeconds: parsed.outro?.start ?? null,
      outroEndSeconds: parsed.outro?.end ?? null,
      subtitles: parsed.subtitles,
      sourceUpdatedAt: parsed.sourceUpdatedAt
    }).onConflictDoUpdate({
      target: episodePlaybackMeta.episodeId,
      set: {
        introStartSeconds: parsed.intro?.start ?? null,
        introEndSeconds: parsed.intro?.end ?? null,
        outroStartSeconds: parsed.outro?.start ?? null,
        outroEndSeconds: parsed.outro?.end ?? null,
        subtitles: parsed.subtitles,
        sourceUpdatedAt: parsed.sourceUpdatedAt
      }
    });
  }
};

// src/modules/playback/routes.ts
var import_zod7 = require("zod");
init_errors();

// src/modules/playback/execution.ts
var import_zod6 = require("zod");
var playbackExecutionRequestSchema = import_zod6.z.object({
  episodeId: import_zod6.z.string().trim().min(1),
  sourceId: import_zod6.z.string().trim().min(1),
  language: import_zod6.z.enum(["sub", "dub", "multi"]).default("sub")
}).strict();
function toExecution(plan) {
  if (plan.mechanism === "iframe") {
    return {
      kind: "embed",
      mechanism: "iframe",
      url: plan.url,
      mediaType: plan.mediaType,
      sourceId: plan.sourceId,
      providerSlug: plan.providerSlug,
      providerName: plan.providerName,
      language: plan.language,
      validated: plan.validated,
      playable: plan.playable,
      ...plan.subtitles ? { subtitles: plan.subtitles } : {}
    };
  }
  return {
    kind: "media",
    mechanism: plan.mechanism === "hls" ? "hls" : "progressive",
    url: plan.url,
    mediaType: plan.mediaType,
    delivery: plan.delivery,
    ...plan.proxyUrl ? { proxyUrl: plan.proxyUrl } : {},
    sourceId: plan.sourceId,
    providerSlug: plan.providerSlug,
    providerName: plan.providerName,
    language: plan.language,
    ...plan.quality !== void 0 ? { quality: plan.quality } : {},
    ...plan.resolution !== void 0 ? { resolution: plan.resolution } : {},
    validated: plan.validated,
    playable: plan.playable,
    capabilities: plan.capabilities,
    ...plan.subtitles ? { subtitles: plan.subtitles } : {}
  };
}
var playbackExecutionResponseSchema = import_zod6.z.object({
  execution: import_zod6.z.object({
    kind: import_zod6.z.enum(["media", "embed"]),
    mechanism: import_zod6.z.enum(["hls", "progressive", "iframe"]),
    url: import_zod6.z.string(),
    mediaType: import_zod6.z.string().nullable(),
    delivery: import_zod6.z.enum(["client", "proxied"]).optional(),
    proxyUrl: import_zod6.z.string().optional(),
    sourceId: import_zod6.z.string(),
    providerSlug: import_zod6.z.string(),
    providerName: import_zod6.z.string(),
    language: import_zod6.z.enum(["sub", "dub", "multi"]),
    quality: import_zod6.z.string().optional(),
    resolution: import_zod6.z.number().optional(),
    validated: import_zod6.z.boolean(),
    playable: import_zod6.z.boolean(),
    capabilities: import_zod6.z.object({ seekable: import_zod6.z.boolean().nullable(), ranged: import_zod6.z.boolean().nullable() }).optional(),
    subtitles: import_zod6.z.array(import_zod6.z.object({ language: import_zod6.z.string(), url: import_zod6.z.string(), kind: import_zod6.z.string().optional() })).optional()
  })
});

// src/modules/playback/routes.ts
var languageSchema = import_zod7.z.enum(["sub", "dub", "multi"]);
function parseOrThrow4(schema2, value) {
  const result = schema2.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", result.error.issues[0]?.message ?? "invalid request", 400);
  }
  return result.data;
}
function registerPlaybackRoutes(app, resolver, metadata, animeRepo) {
  app.get("/api/v1/episodes/:episodeId/sources", async (request) => {
    const { episodeId } = parseOrThrow4(
      import_zod7.z.object({ episodeId: import_zod7.z.string().trim().min(1) }),
      request.params
    );
    const query = parseOrThrow4(
      import_zod7.z.object({ language: languageSchema.default("sub") }),
      request.query
    );
    const resolved = await resolver.resolveEpisode(episodeId, { language: query.language });
    if (!resolved) throw AppError.notFound(`episode ${episodeId} not found`);
    const { result, episode } = resolved;
    if (result.sources.length === 0) {
      if (result.emptyReason === "all_failed") {
        throw AppError.noSources("every playback provider failed", {
          attempts: result.attempts,
          skipped: result.skipped ?? []
        });
      }
      return {
        episode: summarize(episode),
        sources: [],
        sourceCount: 0,
        // Present and empty rather than absent, so a client reading the shape sees
        // the same keys whether or not anything was playable. `no_streams` and
        // `all_skipped` stay distinct here exactly as P5 reported them; the
        // gateway does not collapse them into a generic failure.
        plans: [],
        planCount: 0,
        emptyReason: result.emptyReason,
        attempts: result.attempts,
        // Which providers were never asked, and why. Without this a client sees
        // an empty list and cannot tell "nothing is hosted" from "we hold no id
        // that lets us ask anybody".
        skipped: result.skipped ?? [],
        // Always present so the response shape does not change with the shelf.
        resolutionTimeMs: result.resolutionTimeMs
      };
    }
    const plans = playbackGateway.planAll(result.sources);
    for (const plan of plans.plans) {
      request.log.info(
        {
          episodeId,
          sourceId: plan.sourceId,
          provider: plan.providerSlug,
          access: plan.access,
          mechanism: plan.mechanism,
          delivery: plan.delivery,
          validated: plan.validated,
          url: redactPlaybackUrl(plan.url)
        },
        "playback plan created"
      );
    }
    if (plans.unmapped > 0) {
      request.log.warn(
        { episodeId, unmapped: plans.unmapped, sourceCount: result.sources.length },
        "playback sources could not be mapped to a plan"
      );
    }
    return {
      episode: summarize(episode),
      sources: result.sources,
      sourceCount: result.sources.length,
      // P6: the canonical playback contract. `plans[i]` describes `sources[i]`,
      // in P5's ranked order, so the two arrays can be read side by side and the
      // first plan is the source P5 ranked first. The gateway does no resolution
      // and no probing here; this is pure mapping over the list P5 already
      // produced.
      plans: plans.plans,
      planCount: plans.plans.length,
      attempts: result.attempts,
      // Providers excluded before any call, with the reason. Exposed so a client
      // can explain an empty shelf rather than guessing at it.
      skipped: result.skipped ?? [],
      resolutionTimeMs: result.resolutionTimeMs
    };
  });
  app.post("/api/v1/playback/execute", async (request) => {
    const selection = parseOrThrow4(playbackExecutionRequestSchema, request.body);
    const resolved = await resolver.resolveEpisode(selection.episodeId, {
      language: selection.language
    });
    if (!resolved) throw AppError.notFound(`episode ${selection.episodeId} not found`);
    const { result } = resolved;
    if (result.sources.length === 0 && result.emptyReason === "all_failed") {
      throw AppError.noSources("every playback provider failed", {
        attempts: result.attempts,
        skipped: result.skipped ?? []
      });
    }
    const plans = playbackGateway.planAll(result.sources);
    const plan = plans.plans.find((candidate) => candidate.sourceId === selection.sourceId);
    if (!plan) {
      throw AppError.selectionStale(
        `source ${selection.sourceId} no longer resolves for this episode`,
        { sourceId: selection.sourceId }
      );
    }
    request.log.info(
      {
        episodeId: selection.episodeId,
        sourceId: plan.sourceId,
        provider: plan.providerSlug,
        mechanism: plan.mechanism,
        delivery: plan.delivery,
        url: redactPlaybackUrl(plan.url)
      },
      "playback execution selected"
    );
    return { execution: toExecution(plan) };
  });
  app.get("/api/v1/episodes/:episodeId/metadata", async (request) => {
    const { episodeId } = parseOrThrow4(
      import_zod7.z.object({ episodeId: import_zod7.z.string().trim().min(1) }),
      request.params
    );
    const episode = await animeRepo.getEpisode(episodeId);
    if (!episode) throw AppError.notFound(`episode ${episodeId} not found`);
    const [title] = await animeRepo.listParentTitles([episode.animeId]);
    if (!title?.anilistId) {
      throw AppError.notFound(`episode ${episodeId} has no resolvable title`);
    }
    return metadata.get(episodeId, {
      animeId: String(title.id),
      anilistId: String(title.anilistId),
      malId: title.externalIds?.mal,
      episodeNumber: Number(episode.episodeNumber),
      language: "sub"
    });
  });
  app.get("/api/v1/playback/providers", async () => ({
    providers: resolver.health(),
    // Two integers on the endpoint that already reports playback health, rather
    // than a second metrics system with its own scrape target.
    gateway: playbackGateway.stats()
  }));
  app.post("/api/v1/playback/providers/check", async () => ({
    results: await resolver.checkAll()
  }));
  app.get("/api/v1/playback/manifest", async (request, reply) => {
    const { url: url2 } = parseOrThrow4(
      import_zod7.z.object({ url: import_zod7.z.string().trim().min(1) }),
      request.query
    );
    const manifest = await playbackGateway.fetchManifest(url2);
    reply.header("content-type", manifest.contentType);
    reply.header("cache-control", "no-store");
    return reply.send(manifest.body);
  });
  app.get("/api/v1/playback/subtitle", async (request, reply) => {
    const { url: url2 } = parseOrThrow4(
      import_zod7.z.object({ url: import_zod7.z.string().trim().min(1) }),
      request.query
    );
    const subtitle = await playbackGateway.fetchSubtitle(url2);
    reply.header("content-type", subtitle.contentType);
    reply.header("cache-control", "no-store");
    return reply.send(subtitle.body);
  });
}
function summarize(episode) {
  return {
    id: episode.id,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    durationSeconds: episode.durationSeconds,
    thumbnailUrl: episode.thumbnailUrl,
    isFiller: episode.isFiller
  };
}

// src/app.ts
async function buildApp(deps) {
  const app = (0, import_fastify.default)({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport: config.NODE_ENV === "development" ? void 0 : void 0,
      serializers: {
        // Request logs would otherwise persist signed relay URLs
        // (/api/v1/playback/manifest?url=https://cdn.../token=...).
        req: (request) => ({
          method: request.method,
          url: redactRequestUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip
        })
      }
    },
    // In production, only trust loopback proxy headers to prevent IP spoofing
    trustProxy: config.NODE_ENV === "production" ? "127.0.0.1" : true
  });
  await app.register(import_cors.default, {
    origin: true,
    // The player needs to read response headers for quality and range handling.
    exposedHeaders: ["x-zenkai-cache", "content-range", "accept-ranges"]
  });
  await app.register(import_rate_limit.default, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    // Health checks and the provider list are called by monitoring far more
    // often than a human would, and must not be throttled into a false alarm.
    allowList: (request) => request.url === "/health" || request.url === "/api/v1/health" || request.url.startsWith("/api/v1/playback/providers")
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.reason,
        message: error.message,
        ...error.details !== void 0 ? { details: error.details } : {}
      });
    }
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode ?? 500) : 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({
        error: "bad_request",
        message: error instanceof Error ? error.message : "invalid request"
      });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({
      error: "internal",
      message: "internal server error"
    });
  });
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: "not_found", message: `no route for ${request.url}` });
  });
  const animeRepo = new AnimeRepository(deps.db);
  const animeService = new AnimeService(animeRepo);
  const scheduleService = new ScheduleService(deps.db, animeRepo);
  const episodeService = new EpisodeService(animeRepo);
  const discoveryService = new DiscoveryService(animeRepo, new AnilistProvider(), void 0, {
    async upcoming({ limit }) {
      const rows = await scheduleService.upcoming({ limit });
      return rows.map((row) => ({
        anilistId: row.anilistId,
        title: String(row.title),
        coverUrl: row.coverUrl ?? null,
        episodeNumber: Number(row.episodeNumber),
        airingAt: row.airingAt
      }));
    }
  });
  const mangaRepo = new MangaRepository(deps.db);
  const mangaService = new MangaService(mangaRepo);
  const providers2 = deps.providers ?? await loadProvidersFromDb(deps.db);
  const resolver = new PlaybackResolver(providers2, animeRepo);
  const metadata = new PlaybackMetadataService(deps.db, providers2);
  app.get("/health", async (_request, reply) => {
    let databaseOk = false;
    try {
      const rawSql = deps.db.rawClient;
      if (rawSql) {
        await rawSql`select 1`;
      } else {
        await deps.db.execute(import_drizzle_orm6.sql`select 1`);
      }
      setDatabaseOnline(true);
      databaseOk = true;
    } catch (error) {
      setDatabaseOnline(false);
      _request.log.error({ err: error }, "database unavailable during health check");
    }
    const countOrNull = async (count) => {
      try {
        return await count();
      } catch (error) {
        _request.log.warn({ err: error }, "catalogue count failed during health check");
        return null;
      }
    };
    const [catalogSize, mangaSize] = await Promise.all([
      countOrNull(() => animeRepo.count()),
      countOrNull(() => mangaRepo.count())
    ]);
    return reply.code(databaseOk ? 200 : 503).send({
      status: databaseOk ? "ok" : "degraded",
      service: "zenkai-backend",
      database: databaseOk ? "up" : "down",
      // Null means "could not be determined", which is distinct from zero.
      catalog: { anime: catalogSize, manga: mangaSize },
      providers: {
        streaming: providers2.length,
        quarantined: providers2.filter(
          (provider) => healthRegistry.isQuarantined(provider.slug)
        ).length
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "zenkai-backend",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
  app.get("/api/v1/providers/health", async () => ({
    providers: resolver.health(),
    snapshot: healthRegistry.snapshot()
  }));
  app.post("/api/v1/providers/reset", async () => ({
    cleared: healthRegistry.resetQuarantined()
  }));
  registerAnimeRoutes(app, animeService, discoveryService, episodeService);
  registerMangaRoutes(app, mangaService);
  registerScheduleRoutes(app, scheduleService);
  registerPlaybackRoutes(app, resolver, metadata, animeRepo);
  return app;
}
var appPromise = null;
async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const resources = await createResources();
      const databaseReady = await waitForDatabase(resources.rawSql, 2e3);
      if (!databaseReady) {
        setDatabaseOnline(false);
        console.warn(
          "[zenkai] database not reachable at boot; starting degraded and reporting via /health"
        );
      } else {
        setDatabaseOnline(true);
      }
      startPeriodicProbe(resources.rawSql, 15e3);
      return buildApp({ db: resources.db });
    })();
  }
  return appPromise;
}
async function handler(req, res) {
  const app = await getApp();
  await app.ready();
  app.server.emit("request", req, res);
}

// src/index.ts
init_errors();
async function main() {
  const app = await getApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`\u{1F680} Zenkai Backend API running at http://${config.HOST}:${config.PORT}`);
  const shutdown = async (signal) => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error("[zenkai] shutdown failed:", errorMessage(error));
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled rejection");
  });
}
if (!process.env.VERCEL) {
  main().catch((error) => {
    console.error("[zenkai] failed to start:", errorMessage(error));
    process.exit(1);
  });
}
Object.assign(handler, { default: handler, handler, getApp });
var handler2 = handler;
var index_default = handler;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getApp,
  handler
});
module.exports = Object.assign(index_default, module.exports);

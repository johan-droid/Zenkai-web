import { sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { Redis } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";

import { config } from "../config/index.js";
import { cache, createUpstashRedisAdapter } from "../cache/index.js";
import * as schema from "./schema/index.js";

const url =
  config.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

export interface DbHandle {
  db: ReturnType<typeof createDb>;
  rawSql: Sql;
  close: () => Promise<void>;
}

let dbOnline = true;

export function isDatabaseOnline(): boolean {
  return dbOnline;
}

export function setDatabaseOnline(online: boolean): void {
  dbOnline = online;
}

/**
 * Wraps a Postgres client with an offline circuit-breaker.
 * When the database has been proven unreachable, query attempts immediately
 * fail without blocking the event loop or waiting for socket timeouts.
 */
function createGuardedClient(client: Sql): Sql {
  return new Proxy(client, {
    apply(target, thisArg, argArray) {
      if (!dbOnline) {
        throw new Error("Database offline (circuit breaker active)");
      }
      return Reflect.apply(target, thisArg, argArray);
    },
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (...args: unknown[]) => {
          if (!dbOnline) {
            throw new Error("Database offline (circuit breaker active)");
          }
          return (target as any).unsafe(...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Open a database connection.
 *
 * Kept in one place so routes and scripts share the same configuration and so
 * the connection can be closed deterministically on shutdown.
 */
export function createDb(connectionUrl = url) {
  const client = postgres(connectionUrl, {
    // Cap the pool: this service is a thin API in front of upstream providers,
    // so a large pool just holds Postgres connections open for no benefit.
    // (On serverless, every instance holds its own pool — keep this small.)
    max: config.DATABASE_POOL_MAX,
    idle_timeout: 20,
    // Remote hosts (Neon/Supabase) need headroom for TLS + SCRAM auth on cold
    // starts; 2s declared healthy hosts degraded.
    connect_timeout: 10,
  });
  const guarded = createGuardedClient(client);
  const db = drizzle(guarded, { schema });
  (db as any).rawClient = client;
  return db;
}

export type Db = ReturnType<typeof createDb>;

/**
 * Block until the database answers, or give up.
 *
 * Lets the server start in environments where Postgres is not up yet rather
 * than crashing at import time.
 */
export async function waitForDatabase(target: Db | Sql, timeoutMs = 30_000): Promise<boolean> {
  const rawSql: Sql = (target as any).rawClient ?? target;
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

let probeTimer: NodeJS.Timeout | null = null;
export function startPeriodicProbe(rawSql: Sql, intervalMs = 15_000): void {
  if (probeTimer) return;
  probeTimer = setInterval(async () => {
    if (!dbOnline) {
      try {
        await rawSql`select 1`;
        setDatabaseOnline(true);
        console.log("[zenkai] database reconnected; exiting degraded mode");
      } catch {
        // Still down
      }
    }
  }, intervalMs);
  probeTimer.unref();
}

/**
 * Boot every shared resource.
 *
 * Returning a handle the caller must close keeps shutdown deterministic, which
 * matters for the background workers that otherwise keep the process alive.
 */
export async function createResources(): Promise<DbHandle> {
  const sql: Sql = postgres(url, {
    max: config.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const guarded = createGuardedClient(sql);
  const db = drizzle(guarded, { schema });
  (db as any).rawClient = sql;

  let connectedRedis = false;

  // Upstash Redis via official HTTP REST SDK (ideal for stateless requests and serverless environments)
  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const upstash = new UpstashRedis({
        url: config.UPSTASH_REDIS_REST_URL,
        token: config.UPSTASH_REDIS_REST_TOKEN,
        automaticDeserialization: false,
      });
      await upstash.ping();
      cache.attachRedis(createUpstashRedisAdapter(upstash));
      connectedRedis = true;
    } catch {
      // Degrades or falls through to REDIS_URL
    }
  }

  // Standard TCP/TLS Redis connection (ioredis)
  if (!connectedRedis && config.REDIS_URL) {
    // `lazyConnect` plus a short retry ceiling: a dead Redis degrades the cache
    // to memory rather than stalling boot.
    const redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });

    redis.on("error", () => {
      // Swallowed on purpose: the cache layer already treats Redis as optional
      // and logs its own degradation through /health.
    });

    try {
      await redis.connect();
      cache.attachRedis(redis as never);
    } catch {
      // Keep serving from memory + Postgres.
    }
  }

  return {
    db,
    rawSql: sql,
    close: async () => {
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
      }
      await sql.end({ timeout: 5 });
    },
  };
}

let _defaultDb: Db | null = null;
export function getDefaultDb(): Db {
  if (!_defaultDb) {
    _defaultDb = createDb();
  }
  return _defaultDb;
}

/** Default shared database instance for convenience */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDefaultDb(), prop, receiver);
  },
});

export { schema };

import { sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { Redis } from "ioredis";

import { config } from "../config/index.js";
import { cache } from "../cache/index.js";
import * as schema from "./schema/index.js";

const url =
  config.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

export interface DbHandle {
  db: ReturnType<typeof createDb>;
  close: () => Promise<void>;
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
    max: config.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * Block until the database answers, or give up.
 *
 * Lets the server start in environments where Postgres is not up yet rather
 * than crashing at import time.
 */
export async function waitForDatabase(db: Db, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await db.execute(rawSql`select 1`);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  return false;
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
  const db = drizzle(sql, { schema });

  if (config.REDIS_URL) {
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
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

export { schema };

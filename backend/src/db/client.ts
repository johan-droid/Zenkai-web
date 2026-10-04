import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

import * as schema from "./schema/index.js";

dotenv.config();

const url =
  process.env.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

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
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
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
      await db.execute(sql`select 1`);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  return false;
}

export { schema };

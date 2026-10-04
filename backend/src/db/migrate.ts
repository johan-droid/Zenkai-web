/**
 * Apply pending migrations.
 *
 * drizzle-kit generates SQL into ./migrations; this applies them in order and
 * records what ran, so repeat runs are safe.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const url =
  process.env.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url).pathname;

async function main() {
  const sql = postgres(url, { max: 1 });

  try {
    await sql`
      create table if not exists __zenkai_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const applied = new Set(
      (await sql`select name from __zenkai_migrations`).map((row) => row.name as string),
    );

    let entries: string[];
    try {
      entries = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    } catch {
      console.log("No migrations directory yet. Run `npm run db:generate` first.");
      return;
    }

    let count = 0;
    for (const name of entries) {
      if (applied.has(name)) continue;

      const body = await readFile(join(MIGRATIONS_DIR, name), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into __zenkai_migrations (name) values (${name})`;
      });
      console.log(`applied ${name}`);
      count++;
    }

    console.log(count === 0 ? "Database already up to date." : `Applied ${count} migration(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

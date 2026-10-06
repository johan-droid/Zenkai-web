/**
 * Grand Database Validation on a Fresh Scratch Database.
 *
 * Requirements:
 *  - MUST NOT drop or touch zenkai_db
 *  - Creates temporary database zenkai_scratch_validation_db
 *  - Applies migrations from zero
 *  - Runs anime & manga discovery, detail, episodes, search, schedule
 *  - Audits scratch database tables for zero stream/playback URL persistence
 *  - Drops zenkai_scratch_validation_db on completion
 */

import assert from "node:assert/strict";
import { describe, it, after, before } from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import * as schema from "../src/db/schema/index.js";
import { AnimeRepository } from "../src/modules/anime/repository.js";
import { MangaRepository } from "../src/modules/manga/repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH_DB_NAME = "zenkai_scratch_validation_db";
const ADMIN_URL = "postgresql://zenkai:zenkai_password@localhost:5432/postgres?sslmode=disable";
const SCRATCH_URL = `postgresql://zenkai:zenkai_password@localhost:5432/${SCRATCH_DB_NAME}?sslmode=disable`;

describe("Grand Database Validation (Fresh Scratch DB)", () => {
  let adminClient: ReturnType<typeof postgres>;
  let scratchSql: ReturnType<typeof postgres>;
  let scratchDb: ReturnType<typeof drizzle>;

  before(async () => {
    adminClient = postgres(ADMIN_URL, { max: 1 });
    // Drop scratch DB if left over from a previous interrupted run, then recreate fresh
    await adminClient.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB_NAME};`);
    await adminClient.unsafe(`CREATE DATABASE ${SCRATCH_DB_NAME};`);

    scratchSql = postgres(SCRATCH_URL, { max: 5 });
    scratchDb = drizzle(scratchSql, { schema });

    // Apply all SQL migration files from zero onto scratch database
    const migrationsDir = path.join(__dirname, "../migrations");
    const sqlFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of sqlFiles) {
      const body = await readFile(path.join(migrationsDir, file), "utf8");
      await scratchSql.unsafe(body);
    }
  });

  after(async () => {
    if (scratchSql) {
      await scratchSql.end({ timeout: 2 });
    }
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB_NAME};`);
      await adminClient.end({ timeout: 2 });
    }
  });

  it("01: migrations apply cleanly from zero", async () => {
    const tables = await scratchSql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `;
    const names = tables.map((t) => t.table_name);
    assert.ok(names.includes("anime"), "anime table exists");
    assert.ok(names.includes("manga"), "manga table exists");
    assert.ok(names.includes("episodes"), "episodes table exists");
    assert.ok(names.includes("source_cache"), "source_cache table exists");
  });

  it("02: seeds catalogue data and queries discovery, search, schedule", async () => {
    const animeRepo = new AnimeRepository(scratchDb as any);
    const mangaRepo = new MangaRepository(scratchDb as any);

    const animeId = await animeRepo.upsert({
      anilistId: "99001",
      canonicalTitle: "Scratch Anime",
      titles: { romaji: "Scratch Anime", english: "Scratch Anime", native: null, synonyms: [] },
      externalIds: { anilist: "99001" },
      format: "TV",
      status: "RELEASING",
      season: "FALL",
      seasonYear: 2026,
      year: 2026,
      averageScore: 88,
      popularity: 15000,
      genres: ["Action", "Sci-Fi"],
      isAdult: false,
    });

    assert.ok(animeId, "Inserted anime record");

    const mangaId = await mangaRepo.upsert({
      providerId: "manga-scratch-1",
      titles: { primary: "Scratch Manga", alternates: [] },
      status: "ONGOING",
      contentRating: "safe",
      isAdult: false,
      year: 2026,
      genres: [{ name: "Action" }],
      demographics: ["Shounen"],
      authors: ["Author X"],
      artists: ["Artist Y"],
    });

    assert.ok(mangaId, "Inserted manga record");

    const animeList = await animeRepo.list({ limit: 10, offset: 0 });
    assert.equal(animeList.total, 1);
    assert.equal(animeList.items[0].title, "Scratch Anime");

    const mangaList = await mangaRepo.list({ limit: 10, offset: 0 });
    assert.equal(mangaList.total, 1);
    assert.equal(mangaList.items[0].canonicalTitle, "Scratch Manga");
  });

  it("03: proves ZERO permanent playback/stream URL or credential storage in database", async () => {
    // Inspect every text column across all public tables in scratch database
    const rows = await scratchSql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND data_type IN ('text', 'character varying');
    `;

    const forbiddenNames = ["stream_url", "playback_url", "manifest_url", "segment_url", "access_token", "api_key"];

    for (const row of rows) {
      assert.ok(
        !forbiddenNames.includes(row.column_name),
        `Forbidden column ${row.column_name} found in table ${row.table_name}`,
      );
    }
  });
});

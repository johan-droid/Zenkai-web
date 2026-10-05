/**
 * Schedule persistence tests (P3).
 *
 * Driven against the real database, because the properties that matter here --
 * idempotent sync, correct anime association, no duplicate rows -- are enforced
 * by constraints, not by application code. A fake in-memory store would pass
 * while the schema was wrong.
 *
 * The clock is injected, so "has this aired" is decided by the test rather than
 * by when the suite happens to run.
 *
 * Ids use the reserved 9992xx range and are cleaned up afterwards.
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import postgres from "postgres";

import { createDb, type Db } from "../src/db/client.js";
import { ScheduleService } from "../src/modules/schedule/service.js";
import { AnimeRepository } from "../src/modules/anime/repository.js";

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

/** 2026-06-01T00:00:00Z — a fixed instant unrelated to when this runs. */
const NOW = new Date("2026-06-01T00:00:00Z");

const describeDbTest = describeDb;

describeDbTest("schedule persistence", () => {
  let sql: ReturnType<typeof postgres>;
  let db: Db;
  let repo: AnimeRepository;
  let service: ScheduleService;

  before(async () => {
    sql = postgres(url!, { max: 1 });
    db = createDb(url);
    repo = new AnimeRepository(db);
    service = new ScheduleService(db, repo, () => NOW);
  });

  after(async () => {
    // Cascade takes the schedule rows and episodes with the anime rows.
    await sql`delete from anime where anilist_id >= 999200`;
    await sql.end();
  });

  beforeEach(async () => {
    await sql`delete from anime where anilist_id >= 999200`;
  });

  /** Create a catalogued title so a schedule row has something to attach to. */
  async function seedAnime(anilistId: number) {
    return repo.upsert({
      anilistId: String(anilistId),
      titles: { romaji: `Test ${anilistId}`, english: null, native: null, synonyms: [] },
      canonicalTitle: `Test ${anilistId}`,
      status: "RELEASING",
      isAdult: false,
      genres: [],
      externalIds: { anilist: String(anilistId) },
      sourceUpdatedAt: 1,
    });
  }

  const rowsFor = async (anilistId: number) =>
    sql`select s.anime_id, s.episode_number, s.airing_at, s.status, s.source
          from airing_schedule s
          join anime a on a.id = s.anime_id
          where a.anilist_id = ${anilistId}
          order by s.episode_number`;

  it("stores a slot and derives its airing state at read time", async () => {
    const id = await seedAnime(999201);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-05-20T00:00:00Z")}, 'NOT_YET_AIRRED', 'anilist')`;

    const items = await service.list({ from: new Date("2026-01-01Z"), to: new Date("2026-12-31Z") });
    const row = items.find((i) => i.anilistId === 999201);

    assert.ok(row, "the seeded slot should be returned");
    // Stored as NOT_YET_AIRRED, read as aired: the derived state is what the
    // clock says, the provider label is kept verbatim beside it.
    assert.equal(row.status, "NOT_YET_AIRRED");
    assert.equal(row.providerStatus, "NOT_YET_AIRRED");
    assert.equal(row.airingState, "aired");
  });

  it("reports a future slot as upcoming", async () => {
    const id = await seedAnime(999202);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-07-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const upcoming = await service.upcoming({ limit: 50 });
    const row = upcoming.find((i) => i.anilistId === 999202);
    assert.equal(row?.airingState, "upcoming");
  });

  it("excludes aired slots from upcoming and keeps them in recent", async () => {
    const id = await seedAnime(999203);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-05-20T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const upcoming = await service.upcoming({ limit: 50 });
    const recent = await service.recent({ limit: 50 });

    assert.equal(upcoming.some((i) => i.anilistId === 999203), false, "a past slot is not upcoming");
    assert.equal(recent.some((i) => i.anilistId === 999203), true, "a past slot is recently aired");
  });

  it("does not report the backfill of an old slot as recently aired", async () => {
    // Insert time is not airing time. A sync that backfills a month of history
    // must not make every backfilled episode look like it just aired.
    const id = await seedAnime(999204);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-01-10T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const recent = await service.recent({ limit: 50 });
    assert.equal(
      recent.some((i) => i.anilistId === 999204),
      false,
      "a slot older than the window is not recently aired",
    );
  });

  it("keeps episode 1 of two different titles distinct", async () => {
    // Episode numbers are not globally unique; identity is anime + episode.
    const a = await seedAnime(999205);
    const b = await seedAnime(999206);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${a}, 1, ${new Date("2026-07-01T00:00:00Z")}, 'SCHEDULED', 'anilist'),
                     (${b}, 1, ${new Date("2026-07-02T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const rows = await rowsFor(999205);
    const other = await rowsFor(999206);

    assert.equal(rows.length, 1, "title A has its own episode 1");
    assert.equal(other.length, 1, "title B has its own episode 1");
    assert.notEqual(rows[0]!.anime_id, other[0]!.anime_id, "they are separate rows");

    const upcoming = await service.upcoming({ limit: 50 });
    assert.equal(upcoming.filter((i) => i.episodeNumber === 1 && i.airingState === "upcoming").length >= 2, true);
  });

  it("updates the airing time in place rather than adding a row", async () => {
    // The schedule_slot_unique constraint on (anime_id, episode_number) is what
    // makes a repeated sync idempotent; this asserts the database enforces it.
    const id = await seedAnime(999207);

    const upsert = async (airingAt: string) => {
      await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
                values (${id}, 5, ${airingAt}, 'SCHEDULED', 'anilist')
                on conflict (anime_id, episode_number)
                do update set airing_at = excluded.airing_at, source = excluded.source`;
    };

    await upsert("2026-07-01T00:00:00Z");
    await upsert("2026-07-08T00:00:00Z");
    await upsert("2026-07-08T00:00:00Z");

    const rows = await rowsFor(999207);
    assert.equal(rows.length, 1, "repeated syncs must not create rows");
    assert.equal(new Date(rows[0]!.airing_at).toISOString(), "2026-07-08T00:00:00.000Z");
  });

  it("rejects a duplicate slot at the database level", async () => {
    const id = await seedAnime(999208);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 3, ${new Date("2026-07-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    // A raw insert bypassing the application must still be refused, otherwise
    // idempotency depends on every caller remembering to upsert.
    await assert.rejects(() =>
      sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
          values (${id}, 3, ${new Date("2026-07-02T00:00:00Z")}, 'SCHEDULED', 'anilist')`,
    );
  });

  it("defines today by the configured zone, not the server's clock", async () => {
    // 2026-05-31T20:00Z is 2026-06-01 05:00 in Tokyo but still 2026-05-31 in
    // UTC. Truncating in the server's own zone would file this under the wrong
    // day for every viewer east of Greenwich, and a UTC-only test cannot catch
    // that, which is why the zone here is deliberately not UTC.
    const id = await seedAnime(999210);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-05-31T20:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const tokyo = new ScheduleService(db, repo, () => NOW, "Asia/Tokyo");
    const utc = new ScheduleService(db, repo, () => NOW, "UTC");

    assert.equal((await tokyo.today()).date, "2026-06-01", "Tokyo has already turned the date");
    assert.equal(
      (await tokyo.today()).items.some((i) => i.anilistId === 999210),
      true,
      "the slot belongs to Tokyo's June 1",
    );

    assert.equal((await utc.today()).date, "2026-06-01");
    assert.equal(
      (await utc.today()).items.some((i) => i.anilistId === 999210),
      false,
      "the slot is still May 31 in UTC and must not appear in June's day view",
    );
  });

  it("reports which timezone the day view used", async () => {
    const tokyo = new ScheduleService(db, repo, () => NOW, "Asia/Tokyo");
    const result = await tokyo.today();
    assert.equal(result.timeZone, "Asia/Tokyo", "the client must not have to guess the zone");
  });

  it("deletes schedule rows with their anime", async () => {
    const id = await seedAnime(999209);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-07-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    await sql`delete from anime where id = ${id}`;
    const left = await sql`select count(*)::int c from airing_schedule where anime_id = ${id}`;
    assert.equal(left[0]!.c, 0, "schedule rows cascade with the title");
  });
});

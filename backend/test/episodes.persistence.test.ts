/**
 * Episode catalogue tests (P4).
 *
 * Runs against the real database, because the properties that matter are
 * enforced by constraints: (anime, episode) uniqueness, cascade delete, and
 * ordering. A fake store would pass while the schema was wrong.
 *
 * The clock is injected, so "has this aired" is decided by the test rather than
 * by when the suite runs.
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import postgres from "postgres";

import { createDb, type Db } from "../src/db/client.js";
import { AnimeRepository } from "../src/modules/anime/repository.js";
import { EpisodeService } from "../src/modules/anime/episodes.js";
import type { ProviderEpisode } from "../src/providers/metadata/types.js";

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

/** Fixed instant, unrelated to when the suite runs. */
const NOW = new Date("2026-06-01T00:00:00Z");

describeDb("episode catalogue", () => {
  let sql: ReturnType<typeof postgres>;
  let db: Db;
  let repo: AnimeRepository;
  let episodes: EpisodeService;

  before(async () => {
    sql = postgres(url!, { max: 1 });
    db = createDb(url);
    repo = new AnimeRepository(db);
    episodes = new EpisodeService(repo, () => NOW);
  });

  after(async () => {
    await sql`delete from anime where anilist_id >= 999400`;
    await sql.end();
  });

  beforeEach(async () => {
    await sql`delete from anime where anilist_id >= 999400`;
  });

  async function seedAnime(id: number, over: Record<string, unknown> = {}) {
    return repo.upsert({
      anilistId: String(id),
      titles: { romaji: `Ep ${id}`, english: null, native: null, synonyms: [] },
      canonicalTitle: `Ep ${id}`,
      status: "RELEASING",
      isAdult: false,
      genres: [],
      externalIds: { anilist: String(id) },
      sourceUpdatedAt: 1,
      ...over,
    });
  }

  const ep = (o: Partial<ProviderEpisode> & { episodeNumber: number }): ProviderEpisode => ({
    absoluteNumber: undefined,
    title: undefined,
    description: undefined,
    durationSeconds: undefined,
    thumbnailUrl: undefined,
    airDate: undefined,
    isFiller: false,
    ...o,
  });

  const rows = (animeId: string) =>
    sql`select episode_number, title, description, duration_seconds
          from episodes where anime_id = ${animeId} order by episode_number`;

  // --- identity -------------------------------------------------------------

  it("keeps episode 1 of two titles distinct", async () => {
    const a = await seedAnime(999401);
    const b = await seedAnime(999402);
    await repo.upsertEpisodes(a, [ep({ episodeNumber: 1, title: "A1" })]);
    await repo.upsertEpisodes(b, [ep({ episodeNumber: 1, title: "B1" })]);

    const catA = await episodes.catalogue("999401");
    const catB = await episodes.catalogue("999402");

    assert.equal(catA?.episodes[0]?.title, "A1");
    assert.equal(catB?.episodes[0]?.title, "B1");
  });

  it("refuses a duplicate episode of the same title at the database level", async () => {
    const id = await seedAnime(999403);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1 })]);

    // Bypasses the application entirely: idempotency must not depend on every
    // caller remembering to upsert.
    await assert.rejects(() =>
      sql`insert into episodes (anime_id, episode_number) values (${id}, 1)`,
    );
  });

  it("is idempotent across repeated syncs", async () => {
    const id = await seedAnime(999404);
    for (let i = 0; i < 3; i++) {
      await repo.upsertEpisodes(id, [
        ep({ episodeNumber: 1, title: "One" }),
        ep({ episodeNumber: 2, title: "Two" }),
      ]);
    }
    const result = await rows(id);
    assert.equal(result.length, 2, "three syncs must not accumulate rows");
  });

  // --- ordering -------------------------------------------------------------

  it("orders episodes numerically, not lexicographically", async () => {
    const id = await seedAnime(999405);
    // Inserted out of order and including double digits, which is where a text
    // sort produces 1, 10, 11, 2, 3.
    await repo.upsertEpisodes(id, [11, 2, 1, 10, 3].map((n) => ep({ episodeNumber: n })));

    const numbers = (await rows(id)).map((r: any) => r.episode_number);
    assert.deepEqual(numbers, [1, 2, 3, 10, 11]);
  });

  it("does not fabricate a missing episode number", async () => {
    const id = await seedAnime(999406);
    // The provider knows 1, 2 and 4. It did not say anything about 3.
    await repo.upsertEpisodes(id, [1, 2, 4].map((n) => ep({ episodeNumber: n })));

    const numbers = (await rows(id)).map((r: any) => r.episode_number);
    assert.deepEqual(numbers, [1, 2, 4], "a gap is missing provider data, not a row to invent");
  });

  // --- merge ----------------------------------------------------------------

  it("keeps stored fields when a later sync omits them", async () => {
    const id = await seedAnime(999407);
    await repo.upsertEpisodes(id, [
      ep({ episodeNumber: 1, title: "The Journey", description: "A story", durationSeconds: 1440 }),
    ]);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1 })]);

    const [row] = await rows(id);
    assert.equal(row.title, "The Journey");
    assert.equal(row.description, "A story");
    assert.equal(row.duration_seconds, 1440);
  });

  it("clears a field the provider explicitly reports as empty", async () => {
    const id = await seedAnime(999408);
    await repo.upsertEpisodes(id, [
      ep({ episodeNumber: 1, title: "Stale", description: "Stale", durationSeconds: 1440 }),
    ]);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1, description: null })]);

    const [row] = await rows(id);
    assert.equal(row.description, null, "an explicit null is a real answer and clears");
    assert.equal(row.title, "Stale", "the omitted title is untouched");
  });

  it("applies a supplied value over the stored one", async () => {
    const id = await seedAnime(999409);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1, title: "Old" })]);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1, title: "New" })]);

    const [row] = await rows(id);
    assert.equal(row.title, "New");
  });

  it("merges each episode independently within one payload", async () => {
    const id = await seedAnime(999410);
    await repo.upsertEpisodes(id, [
      ep({ episodeNumber: 1, title: "One" }),
      ep({ episodeNumber: 2, title: "Two" }),
    ]);
    // Rich for one episode, empty for the other, in a single payload.
    await repo.upsertEpisodes(id, [
      ep({ episodeNumber: 1, description: "only episode one has this" }),
      ep({ episodeNumber: 2 }),
    ]);

    const result = await rows(id);
    assert.equal(result[0].description, "only episode one has this");
    assert.equal(result[0].title, "One");
    assert.equal(result[1].title, "Two");
  });

  // --- counts ---------------------------------------------------------------

  it("keeps known total distinct from aired count", async () => {
    // 24 stated, 4 held, 2 aired. Reporting 4 as the total would tell a reader
    // the show is finished.
    const id = await seedAnime(999411, { totalEpisodes: 24 });
    await repo.upsertEpisodes(id, [1, 2, 3, 4].map((n) => ep({ episodeNumber: n })));
    for (const n of [1, 2]) {
      await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
                values (${id}, ${n}, ${new Date("2026-05-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;
    }

    const cat = await episodes.catalogue("999411");
    assert.equal(cat?.knownTotal, 24);
    assert.equal(cat?.catalogueCount, 4);
    assert.equal(cat?.airedCount, 2);
  });

  it("keeps an unknown total as null rather than zero", async () => {
    // Zero would claim the show has no episodes at all, which is a much
    // stronger claim than "we were not told".
    const id = await seedAnime(999412, { totalEpisodes: null });
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1 })]);

    const cat = await episodes.catalogue("999412");
    assert.equal(cat?.knownTotal, null);
  });

  // --- airing integration ---------------------------------------------------

  it("derives airing state from the slot and the clock", async () => {
    const id = await seedAnime(999413);
    await repo.upsertEpisodes(id, [1, 2, 3].map((n) => ep({ episodeNumber: n })));
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-05-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 2, ${new Date("2026-07-01T00:00:00Z")}, 'NOT_YET_AIRRED', 'anilist')`;

    const cat = await episodes.catalogue("999413");
    const [one, two, three] = cat!.episodes;

    assert.equal(one.airingState, "aired", "a past slot has aired");
    assert.equal(two.airingState, "upcoming");
    assert.equal(three.airingState, "unknown", "no slot means unknown, not 'not yet'");
    assert.equal(three.airingAt, null);
    assert.equal(two.providerStatus, "NOT_YET_AIRRED", "the provider label is kept verbatim");
  });

  it("derives the next episode rather than storing it", async () => {
    const id = await seedAnime(999414);
    await repo.upsertEpisodes(id, [1, 2, 3].map((n) => ep({ episodeNumber: n })));
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-05-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 3, ${new Date("2026-08-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    const next = await episodes.nextEpisode("999414");
    assert.equal(next?.episodeNumber, 3, "the earliest episode that has not aired");
  });

  it("returns no next episode when nothing is scheduled", async () => {
    const id = await seedAnime(999415);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1 })]);

    // Everything has unknown airing state. Guessing that episode 1 is "next"
    // would be inventing a release date.
    assert.equal(await episodes.nextEpisode("999415"), null);
  });

  it("navigates by number and honours gaps", async () => {
    const id = await seedAnime(999416);
    await repo.upsertEpisodes(id, [1, 2, 4].map((n) => ep({ episodeNumber: n })));

    assert.deepEqual(await episodes.navigation("999416", 1), { previous: null, next: 2 });
    assert.deepEqual(await episodes.navigation("999416", 2), { previous: 1, next: 4 });
    assert.deepEqual(await episodes.navigation("999416", 4), { previous: 2, next: null });
  });

  it("deletes episodes and slots with their title", async () => {
    const id = await seedAnime(999417);
    await repo.upsertEpisodes(id, [ep({ episodeNumber: 1 })]);
    await sql`insert into airing_schedule (anime_id, episode_number, airing_at, status, source)
              values (${id}, 1, ${new Date("2026-07-01T00:00:00Z")}, 'SCHEDULED', 'anilist')`;

    await sql`delete from anime where id = ${id}`;
    const left = await sql`select count(*)::int c from episodes where anime_id = ${id}`;
    const slots = await sql`select count(*)::int c from airing_schedule where anime_id = ${id}`;
    assert.equal(left[0].c, 0, "episodes cascade with the title");
    assert.equal(slots[0].c, 0, "airing slots cascade too");
  });
});

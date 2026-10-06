/**
 * Anime persistence tests, run against the real database.
 *
 * These cover the invariants only a real Postgres can demonstrate: that the
 * unique constraints make an upsert idempotent, that fan-out rows do not
 * multiply, and that a partial provider response cannot destroy stored data.
 *
 * They run against `DATABASE_URL` using ids in the reserved 999000+ range and
 * clean up after themselves, so re-runs are safe against a development database.
 * Without a configured database the suite skips rather than failing, because
 * running unit tests with no infrastructure is a legitimate state.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";

import { AnimeRepository } from "../src/modules/anime/repository.js";
import { createDb, type Db } from "../src/db/client.js";
import type { AnimeSummary } from "../src/providers/metadata/types.js";

const url = process.env.DATABASE_URL;
/** Reserved for tests, so a run can never collide with a real AniList id. */
const TEST_IDS = [999101, 999102, 999103];
/** Separate id for the search suite, which asserts exact hit counts. */
const SEARCH_ID = 999104;

const describeDb = url ? describe : describe.skip;

describeDb("anime persistence", () => {
  let sql: ReturnType<typeof postgres>;
  let db: Db;
  let repo: AnimeRepository;

  before(async () => {
    sql = postgres(url!, { max: 1 });
    db = createDb(url);
    repo = new AnimeRepository(db);
  });

  after(async () => {
    // Cascade removes genres, studios, relations and search rows with the parent.
    await sql`delete from anime where anilist_id in ${sql(TEST_IDS)}`;
    await sql.end();
  });

  /** A complete, valid provider summary. No network involved. */
  function summary(over: Partial<AnimeSummary> = {}): AnimeSummary {
    return {
      anilistId: String(TEST_IDS[0]),
      titles: {
        romaji: "Test Romaji",
        english: "Test English",
        native: "テスト",
        synonyms: ["Syn"],
      },
      canonicalTitle: "Test English",
      description: "Full description.",
      coverUrl: "https://s/img/c.jpg",
      coverImageLarge: "https://s/img/l.jpg",
      bannerUrl: "https://s/img/b.jpg",
      format: "TV",
      status: "RELEASING",
      isAdult: false,
      year: 2024,
      season: "SPRING",
      seasonYear: 2024,
      averageScore: 80,
      popularity: 100,
      favourites: 10,
      totalEpisodes: 12,
      durationMinutes: 24,
      genres: ["Action", "Drama"],
      studios: ["Studio Test"],
      externalIds: { anilist: String(TEST_IDS[0]), mal: "987654" },
      sourceUpdatedAt: 1_700_000_000,
      ...over,
    };
  }

  const counts = async (id: number) => {
    const rows = await sql<
      {
        anime: number;
        genres: number;
        studios: number;
        externals: number;
        search: number;
      }[]
    >`
      select
        (select count(*)::int from anime where anilist_id = ${id}) as anime,
        (select count(*)::int from anime_genres g join anime a on a.id = g.anime_id where a.anilist_id = ${id}) as genres,
        (select count(*)::int from anime_studios s join anime a on a.id = s.anime_id where a.anilist_id = ${id}) as studios,
        (select count(*)::int from anime_external_ids e join anime a on a.id = e.anime_id where a.anilist_id = ${id}) as externals,
        (select count(*)::int from anime_search_index i join anime a on a.id = i.anime_id where a.anilist_id = ${id}) as search
    `;
    return rows[0]!;
  };
it("is idempotent across repeated syncs", async () => {
    // The central P1 guarantee: syncing the same title three times must leave one
    // record and one set of fan-out rows, not three of everything.
    await repo.upsert(summary());
    const first = await counts(TEST_IDS[0]!);

    await repo.upsert(summary());
    await repo.upsert(summary());
    const third = await counts(TEST_IDS[0]!);

    assert.deepEqual(third, first, "repeat syncs must not change any row count");
    assert.equal(first.anime, 1);
    assert.equal(first.genres, 2);
    assert.equal(first.studios, 1);
    assert.equal(first.externals, 2, "anilist and mal ids are both stored");
    assert.equal(first.search, 1);
  });

  it("collapses duplicate genres inside a single payload", async () => {
    await repo.upsert(
      summary({
        anilistId: String(TEST_IDS[1]),
        genres: ["Action", "action", "ACTION", "Drama"],
        studios: [],
        externalIds: { anilist: String(TEST_IDS[1]) },
      }),
    );

    const after = await counts(TEST_IDS[1]!);
    assert.equal(after.genres, 2, "case variants are one genre, not three");
  });

  it("updates the existing record instead of creating a second one", async () => {
    await repo.upsert(
      summary({
        anilistId: String(TEST_IDS[2]),
        externalIds: { anilist: String(TEST_IDS[2]) },
      }),
    );

    await repo.upsert(
      summary({
        anilistId: String(TEST_IDS[2]),
        externalIds: { anilist: String(TEST_IDS[2]) },
        canonicalTitle: "Renamed",
        titles: { romaji: "Renamed Romaji", english: null, native: null, synonyms: [] },
        status: "FINISHED",
      }),
    );

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from anime where anilist_id = ${TEST_IDS[2]}
    `;
    assert.equal(rows[0]!.count, 1, "an update must not create a second anime");

    const [row] = await sql<{ canonical_title: string; status: string }[]>`
      select canonical_title, status from anime where anilist_id = ${TEST_IDS[2]}
    `;
    assert.equal(row!.canonical_title, "Renamed");
    assert.equal(row!.status, "FINISHED");
it("keeps stored data when a later response omits it", async () => {
    const id = TEST_IDS[0]!;
    await repo.upsert(summary());

    // A sparse response: only an id and a title, as a degraded upstream produces.
    await repo.upsert({
      anilistId: String(id),
      titles: { romaji: "Renamed Sparse", english: null, native: null, synonyms: [] },
      canonicalTitle: "Renamed Sparse",
      status: undefined,
      isAdult: false,
      externalIds: { anilist: String(id) },
    } as AnimeSummary);

    const [row] = await sql<
      {
        description: string | null;
        banner_url: string | null;
        average_score: string | null;
        total_episodes: number | null;
        canonical_title: string;
      }[]
    >`
      select description, banner_url, average_score, total_episodes, canonical_title
      from anime where anilist_id = ${id}
    `;

    assert.equal(row!.canonical_title, "Renamed Sparse", "a supplied field still updates");
    assert.equal(row!.description, "Full description.", "omitted description must survive");
    assert.equal(row!.banner_url, "https://s/img/b.jpg", "omitted artwork must survive");
    assert.equal(row!.average_score, "80.00", "omitted score must survive");
    assert.equal(row!.total_episodes, 12, "omitted episode count must survive");

    const after = await counts(id);
    assert.equal(after.genres, 2, "omitted genres must not un-tag the title");
  });

  it("clears a field the provider explicitly reports as empty", async () => {
    const id = TEST_IDS[0]!;
    await repo.upsert(summary());

    await repo.upsert({ ...summary(), description: null, genres: [] });

    const [row] = await sql<{ description: string | null }[]>`
      select description from anime where anilist_id = ${id}
    `;
    assert.equal(row!.description, null, "an explicit null is a real answer and clears");

    const after = await counts(id);
    assert.equal(after.genres, 0, "an explicit empty array clears the genre set");
  });

  it("stores external ids under one uniqueness constraint", async () => {
    // (id_type, external_id) is unique, so the same provider id cannot end up
    // attached to two different anime rows.
    const clash = await sql`
      insert into anime_external_ids (anime_id, id_type, external_id)
      select a.id, 'anilist', ${String(TEST_IDS[0])}
      from anime a
      where a.anilist_id = ${TEST_IDS[1]}
      on conflict do nothing
      returning id
    `;

    assert.equal(
      clash.length,
      0,
      "a duplicate provider id must be rejected, not stored twice",
    );
  });
});

describe("anime search", () => {
  let sql: ReturnType<typeof postgres>;
  let repo: AnimeRepository;

  before(async () => {
    sql = postgres(url!, { max: 1 });
    repo = new AnimeRepository(createDb(url));
  });

  after(async () => {
    await sql`delete from anime where anilist_id = ${SEARCH_ID}`;
    await sql.end();
  });

  it("finds a title by every spelling it is known by", async () => {
    // The search index is what lets a user type the native, romaji or synonym
    // spelling and still reach the record, without a second AniList round trip.
    await repo.upsert({
      anilistId: String(SEARCH_ID),
      titles: {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: "進撃の巨人",
        synonyms: ["SnK", "AoT"],
      },
      canonicalTitle: "Attack on Titan",
      status: "FINISHED",
      isAdult: false,
      genres: ["Action"],
      studios: [],
      externalIds: { anilist: String(SEARCH_ID) },
      sourceUpdatedAt: 1,
    });

    // Membership, not an exact count: the real catalogue also legitimately
    // matches some of these queries, and asserting a total would make the test
    // depend on unrelated seeded rows.
    for (const query of [
      "Attack on Titan",
      "attack on titan",
      "ATTACK ON TITAN",
      "Shingeki no Kyojin",
      "進撃の巨人",
      "SnK",
      "titan", // partial
    ]) {
      const hits = await repo.search(query, 25);
      assert.ok(
        // Cards type the cross-reference id as a string (the routing contract
        // treats ids as strings), so compare in that space.
        hits.some((hit) => hit.anilistId === String(SEARCH_ID)),
        `"${query}" should match the record via the canonical index`,
      );
    }
  });

  it("returns nothing for an empty or punctuation-only query", async () => {
    assert.deepEqual(await repo.search("", 5), []);
    assert.deepEqual(await repo.search("!!!", 5), []);
  });
});
  });
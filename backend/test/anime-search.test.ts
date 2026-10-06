/**
 * P15 backend contract: `/api/v1/anime/search` answers with one shape.
 *
 * The endpoint used to return raw catalogue rows when Postgres had a match and
 * raw AniList objects when it did not, so its response type depended on cache
 * state. A client cannot honestly validate that with one schema, and the
 * frontend migration that consumes it is exactly where that bites.
 *
 * These tests pin the fix at the service boundary with a fake repository and a
 * stubbed provider: whichever branch answers, every item is a canonical
 * discovery card.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { AnimeService } from "../src/modules/anime/service.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type { DiscoveryCard } from "../src/modules/anime/discovery.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** A canonical card, as `repo.search` now returns. */
function card(over: Partial<DiscoveryCard> = {}): DiscoveryCard {
  return {
    id: "0f6a2f14-1f4a-4a1e-9c3d-2b7e5a9d0c11",
    anilistId: "16498",
    title: "Attack on Titan",
    titles: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人", synonyms: [] },
    coverUrl: "https://img.example.com/cover.jpg",
    coverImageLarge: null,
    bannerUrl: null,
    format: "TV",
    status: "FINISHED",
    season: "SPRING",
    seasonYear: 2013,
    year: 2013,
    averageScore: 84,
    totalEpisodes: 25,
    popularity: 500_000,
    genres: ["Action"],
    isAdult: false,
    ...over,
  };
}

/** The minimal AniList media node `browse` needs to produce a summary. */
function mediaNode(): Record<string, unknown> {
  return {
    id: 16498,
    format: "TV",
    status: "FINISHED",
    isAdult: false,
    description: null,
    synonyms: [],
    averageScore: 84,
    popularity: 500_000,
    totalEpisodes: 25,
    season: "SPRING",
    seasonYear: 2013,
    startDate: { year: 2013, month: 4, day: 7 },
    genres: ["Action"],
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    coverImage: { extraLarge: "https://img.example.com/cover.jpg", large: null, medium: null, color: null },
    bannerImage: null,
    mediaType: "ANIME",
  };
}

function stubAnilist(items: unknown[]): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { Page: { pageInfo: { total: items.length }, media: items } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/** A repository stub: only what `AnimeService.search` touches. */
function fakeRepo(local: DiscoveryCard[]): AnimeRepository {
  return {
    search: async () => local,
    upsert: async () => "0f6a2f14-1f4a-4a1e-9c3d-2b7e5a9d0c11",
  } as unknown as AnimeRepository;
}

/** Every field a canonical card must have, so a raw row or provider object fails. */
function assertCards(items: unknown[]): DiscoveryCard[] {
  for (const item of items) {
    const value = item as Record<string, unknown>;
    for (const field of ["id", "anilistId", "title", "titles", "coverUrl", "genres", "isAdult"]) {
      assert.ok(field in value, `search result is missing the canonical field "${field}"`);
    }
    // The two shapes this fix removed are identified by exactly these.
    assert.ok(!("canonicalTitle" in value), "search leaked a raw catalogue row");
    assert.ok(!("coverImage" in value), "search leaked a raw provider object");
    assert.equal(typeof value.anilistId, "string", "the cross-reference id must be a string");
  }
  return items as DiscoveryCard[];
}

describe("anime search contract", () => {
  it("returns canonical cards when the catalogue answers", async () => {
    const service = new AnimeService(fakeRepo([card()]));

    const items = assertCards(await service.search("titan", 20));

    assert.equal(items.length, 1);
    assert.equal(items[0]!.title, "Attack on Titan");
  });

  it("returns canonical cards from the provider fallback too", async () => {
    stubAnilist([mediaNode()]);
    const service = new AnimeService(fakeRepo([]));

    // Same schema, same fields: the branch that served the answer is invisible
    // to the client.
    const items = assertCards(await service.search("titan", 20));

    assert.equal(items.length, 1);
    assert.equal(items[0]!.title, "Attack on Titan");
    assert.equal(items[0]!.anilistId, "16498");
  });

  it("produces identical shapes from either branch", async () => {
    stubAnilist([mediaNode()]);
    const fromProvider = await new AnimeService(fakeRepo([])).search("titan", 20);
    const fromCatalogue = await new AnimeService(fakeRepo([card()])).search("titan", 20);

    assert.deepEqual(
      Object.keys(fromProvider[0]!).sort(),
      Object.keys(fromCatalogue[0]!).sort(),
      "the two branches must not disagree about the response shape",
    );
  });

  it("still caches a provider fallback result into the catalogue", async () => {
    // Dropping the write would make every cold search pay the upstream call
    // forever, which is the read-through behaviour P1 established.
    let upserts = 0;
    const repo = {
      search: async () => [],
      upsert: async () => {
        upserts += 1;
        return "local-id";
      },
    } as unknown as AnimeRepository;
    stubAnilist([mediaNode()]);

    await new AnimeService(repo).search("titan", 20);

    assert.equal(upserts, 1);
  });

  it("answers a failed catalogue write without failing the response", async () => {
    const repo = {
      search: async () => [],
      upsert: async () => {
        throw new Error("db down");
      },
    } as unknown as AnimeRepository;
    stubAnilist([mediaNode()]);

    const items = assertCards(await new AnimeService(repo).search("titan", 20));
    assert.equal(items.length, 1);
    // A title the backend could not cache still has no local id yet, which the
    // card contract represents as null rather than a fabricated one.
    assert.equal(items[0]!.id, null);
  });
});
/**
 * Anilist provider error-semantics tests.
 *
 * The provider is a network client, so these tests stub `fetch` and answer the
 * exact envelope shapes AniList sends. The case that matters is the missing
 * Media node: AniList rejects an unknown id with an HTTP 404 whose body still
 * carries `data: { Media: null }`. That combined shape must resolve to a null
 * detail (which the service turns into a 404) and must NOT be treated as an
 * upstream fault — otherwise `/anime/:id` for a dead id reports a 502 "provider
 * down" instead of "title not found".
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";

import { AnilistProvider } from "../src/providers/metadata/anilist.js";

const provider = new AnilistProvider();

function stubFetch(body: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/** Minimal AniList media node in the shape the adapter expects. */
function node(over: Record<string, unknown> = {}): Record<string, any> {
  return {
    ...fullNode(),
    ...over,
  };
}

function fullNode(): Record<string, any> {
  return {
    id: 12345,
    idMal: 54321,
    format: "TV",
    status: "RELEASING",
    isAdult: false,
    description: "<p>First paragraph.</p>",
    synonyms: ["Alt Name"],
    averageScore: 81,
    popularity: 4200,
    favourites: 300,
    season: "SPRING",
    seasonYear: 2024,
    episodes: 12,
    duration: 24,
    genres: ["Action"],
    studios: { nodes: [{ name: "Studio One" }] },
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    coverImage: { extraLarge: "https://s/img/coverL.jpg", large: "https://s/img/coverL.jpg", medium: "https://s/img/coverM.jpg", color: null },
    bannerImage: "https://s/img/banner.jpg",
    startDate: { year: 2013, month: 4, day: 7 },
    updatedAt: "2024-05-01T00:00:00Z",
  };
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe("anilist provider: missing-media semantics", () => {
  it("treats an HTTP 404 with null Media as a definitive absence (null), not an upstream fault", async () => {
    stubFetch(
      { errors: [{ message: "Not Found.", status: 404 }], data: { Media: null } },
      404,
    );

    const detail = await provider.getByAnilistId("999999999");
    assert.equal(detail, null);
  });

  it("maps a populated Media node to a detail", async () => {
    stubFetch({ data: { Media: node() } });

    const detail = await provider.getByAnilistId("12345");
    assert.equal(detail?.anilistId, "12345");
    assert.equal(detail?.canonicalTitle, "Attack on Titan");
  });

  it("still reports an envelope with no data at all as an upstream error", async () => {
    stubFetch({ errors: [{ message: "boom" }] });

    await assert.rejects(
      () => provider.getByAnilistId("12345"),
      (error: any) => error.reason === "upstream_error" && error.statusCode === 502,
    );
  });
});
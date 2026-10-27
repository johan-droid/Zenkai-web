/**
 * Frontend Regression Tests for Episode Catalogue Retrieval and Pagination
 *
 * Verifies:
 *  1. fetchAnimeEpisodes parses complete multi-episode catalogues correctly.
 *  2. fetchAnimeEpisodes correctly attaches and validates pagination query parameters.
 *  3. episodeCatalogueSchema accepts optional pagination metadata (page, perPage, totalPages, total).
 *  4. Switching anime IDs isolates responses without caching collisions.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  fetchAnimeEpisodes,
  episodeCatalogueSchema,
  ZENKAI_API_URL,
} from "../src/lib/api/zenkai";

describe("Frontend Episode Catalogue Contract & Pagination", () => {
  const originalFetch = globalThis.fetch;
  let requestedUrls: string[] = [];

  beforeEach(() => {
    requestedUrls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubEndpoint(data: any, status = 200) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
  }

  it("parses multi-episode catalogue with pagination metadata", async () => {
    const rawPayload = {
      anilistId: "12345",
      animeId: "12345",
      episodes: [
        {
          id: "ep-1",
          episodeNumber: 1,
          absoluteNumber: 1,
          title: "To You, in 2000 Years",
          description: "The attack begins.",
          durationSeconds: 1440,
          thumbnailUrl: "https://cdn.example.com/thumb1.jpg",
          isFiller: false,
          airingAt: "2013-04-07T00:00:00.000Z",
          airingState: "aired",
          airingSource: null,
          providerStatus: null,
        },
        {
          id: "ep-2",
          episodeNumber: 2,
          absoluteNumber: 2,
          title: "That Day",
          description: "Aftermath.",
          durationSeconds: 1440,
          thumbnailUrl: "https://cdn.example.com/thumb2.jpg",
          isFiller: false,
          airingAt: "2013-04-14T00:00:00.000Z",
          airingState: "aired",
          airingSource: null,
          providerStatus: null,
        },
      ],
      catalogueCount: 2,
      airedCount: 2,
      knownTotal: 25,
      page: 1,
      perPage: 2,
      totalPages: 13,
      total: 25,
    };

    stubEndpoint(rawPayload);

    const result = await fetchAnimeEpisodes("12345", { page: 1, perPage: 2 });
    assert.equal(result.anilistId, "12345");
    assert.equal(result.episodes.length, 2);
    assert.equal(result.knownTotal, 25);
    assert.equal(result.page, 1);
    assert.equal(result.perPage, 2);
    assert.equal(result.totalPages, 13);
    assert.equal(result.total, 25);
    assert.ok(requestedUrls[0].includes("/api/v1/anime/12345/episodes?page=1&perPage=2"));
  });

  it("correctly decodes catalogue without pagination parameters", async () => {
    const rawPayload = {
      anilistId: "67890",
      episodes: Array.from({ length: 12 }, (_, i) => ({
        id: `ep-${i + 1}`,
        episodeNumber: i + 1,
        absoluteNumber: i + 1,
        title: `Episode ${i + 1}`,
        description: null,
        durationSeconds: 1440,
        thumbnailUrl: null,
        isFiller: false,
        airingAt: null,
        airingState: "aired",
        airingSource: null,
        providerStatus: null,
      })),
      catalogueCount: 12,
      airedCount: 12,
      knownTotal: 12,
    };

    stubEndpoint(rawPayload);

    const result = await fetchAnimeEpisodes("67890");
    assert.equal(result.episodes.length, 12);
    assert.equal(result.catalogueCount, 12);
    assert.equal(result.knownTotal, 12);
    assert.ok(requestedUrls[0].endsWith("/api/v1/anime/67890/episodes"));
  });

  it("handles title switching cleanly without leaking requests or data", async () => {
    const payloadA = {
      anilistId: "100",
      episodes: [{ id: "ep-1", episodeNumber: 1, isFiller: false, airingState: "aired" }],
      catalogueCount: 1,
      airedCount: 1,
      knownTotal: 1,
    };
    const payloadB = {
      anilistId: "200",
      episodes: [
        { id: "ep-1", episodeNumber: 1, isFiller: false, airingState: "aired" },
        { id: "ep-2", episodeNumber: 2, isFiller: false, airingState: "aired" },
      ],
      catalogueCount: 2,
      airedCount: 2,
      knownTotal: 2,
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/anime/100/episodes")) {
        return new Response(JSON.stringify(payloadA), { status: 200, headers: { "content-type": "application/json" } });
      } else if (url.includes("/anime/200/episodes")) {
        return new Response(JSON.stringify(payloadB), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const resA = await fetchAnimeEpisodes("100");
    const resB = await fetchAnimeEpisodes("200");

    assert.equal(resA.anilistId, "100");
    assert.equal(resA.episodes.length, 1);

    assert.equal(resB.anilistId, "200");
    assert.equal(resB.episodes.length, 2);
  });
});

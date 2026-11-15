/**
 * Anime Catalogue Sort Contract & Discovery Boundary Test Suite (P0 Remediation)
 *
 * Verifies:
 *  1. Canonical sort options ("popularity", "score", "recently-updated", "recently-added", "title", "newest") -> HTTP 200
 *  2. Provider-style sort tokens ("POPULARITY_DESC", "SCORE_DESC", "START_DATE_DESC", "TITLE_ROMAJI", etc.) normalized -> HTTP 200
 *  3. Confirmed production issue: GET /api/v1/anime?format=MOVIE&perPage=14&sort=POPULARITY_DESC -> HTTP 200
 *  4. TV catalogue: GET /api/v1/anime?format=TV&perPage=20&sort=newest -> HTTP 200
 *  5. Pagination: page & perPage mathematically mapped to limit & offset
 *  6. Filters: genre, status, format, season & seasonYear
 *  7. Unsupported sort values rejected with HTTP 400 bad_request
 *  8. "TRENDING" sort rejected on catalogue listing with structured error directing to discovery endpoint
 *  9. Search and sorting together: GET /api/v1/anime?q=attack&sort=score
 * 10. Empty results: empty catalogue returns 200 with empty array and total 0
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import { registerAnimeRoutes } from "../src/modules/anime/routes.js";
import { ANIME_SORTS, type AnimeListOptions, type AnimeSort } from "../src/modules/anime/repository.js";
import type { DiscoveryCard } from "../src/modules/anime/discovery.js";

function createMockCard(id: string, title: string, format = "TV"): DiscoveryCard {
  return {
    id,
    anilistId: id,
    title,
    titles: {
      romaji: title,
      english: title,
      native: null,
      synonyms: [],
    },
    coverUrl: `https://example.com/${id}.jpg`,
    coverImageLarge: null,
    bannerUrl: null,
    format,
    status: "FINISHED",
    season: "FALL",
    seasonYear: 2024,
    year: 2024,
    averageScore: 85,
    totalEpisodes: 12,
    popularity: 50000,
    genres: ["Action", "Fantasy"],
    isAdult: false,
  };
}

function buildTestApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error: any, _req, reply) => {
    const statusCode = error.statusCode || 500;
    return reply.code(statusCode).send({
      statusCode,
      error: error.reason || "bad_request",
      message: error.message,
    });
  });

  let lastListOptions: AnimeListOptions | null = null;
  let lastSearchArgs: { query: string; limit: number; sort?: AnimeSort } | null = null;

  const mockService = {
    list: async (options: AnimeListOptions) => {
      lastListOptions = options;
      if (options.genre === "NonExistentGenre") {
        return { items: [], total: 0 };
      }
      return {
        items: [
          createMockCard("1001", "Frieren: Beyond Journey's End", options.format || "TV"),
          createMockCard("1002", "Attack on Titan", options.format || "TV"),
        ],
        total: 2,
      };
    },
    search: async (query: string, limit: number, sort?: AnimeSort) => {
      lastSearchArgs = { query, limit, sort };
      return [createMockCard("1002", `Search Result for ${query}`)];
    },
    getFull: async () => ({}),
    getByAnilistId: async () => ({}),
    syncEpisodes: async () => [],
    getEpisodeNavigation: async () => ({}),
  } as any;

  const mockDiscovery = {
    home: async () => ({}),
    ranking: async () => ({ items: [], page: 1, perPage: 10, hasNextPage: false, total: 0, source: "database" }),
    airingSchedule: async () => [],
  } as any;

  const mockEpisodes = {} as any;

  registerAnimeRoutes(app, mockService, mockDiscovery, mockEpisodes);

  return {
    app,
    getLastListOptions: () => lastListOptions,
    getLastSearchArgs: () => lastSearchArgs,
  };
}

describe("Anime Catalogue Sort & Contract Regression Suite", () => {
  it("resolves the confirmed production failure: GET /api/v1/anime?format=MOVIE&perPage=14&sort=POPULARITY_DESC", async () => {
    const { app, getLastListOptions } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?format=MOVIE&perPage=14&sort=POPULARITY_DESC",
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.page, 1);
    assert.equal(body.perPage, 14);
    assert.equal(body.total, 2);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].format, "MOVIE");

    const opts = getLastListOptions();
    assert.ok(opts);
    assert.equal(opts.format, "MOVIE");
    assert.equal(opts.limit, 14);
    assert.equal(opts.offset, 0);
    assert.equal(opts.sort, "popularity"); // POPULARITY_DESC normalized to canonical popularity
  });

  it("supports every canonical sort option", async () => {
    const { app, getLastListOptions } = buildTestApp();

    for (const sortOption of ANIME_SORTS) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/anime?sort=${sortOption}`,
      });
      assert.equal(response.statusCode, 200, `Failed for canonical sort: ${sortOption}`);
      const opts = getLastListOptions();
      assert.equal(opts?.sort, sortOption);
    }
  });

  it("supports all recognized provider-style uppercase sorts", async () => {
    const { app, getLastListOptions } = buildTestApp();

    const providerSorts: Record<string, AnimeSort> = {
      POPULARITY_DESC: "popularity",
      SCORE_DESC: "score",
      START_DATE_DESC: "newest",
      TITLE_ROMAJI: "title",
      TITLE_ENGLISH: "title",
      TITLE: "title",
      UPDATED_AT_DESC: "recently-updated",
      CREATED_AT_DESC: "recently-added",
      ADDED_AT_DESC: "recently-added",
    };

    for (const [providerSort, expectedCanonical] of Object.entries(providerSorts)) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/anime?sort=${providerSort}`,
      });
      assert.equal(response.statusCode, 200, `Failed for provider sort: ${providerSort}`);
      const opts = getLastListOptions();
      assert.equal(opts?.sort, expectedCanonical);
    }
  });

  it("rejects TRENDING on catalogue listing with structured guidance", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?sort=TRENDING",
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "bad_request");
    assert.match(body.message, /trending sort is only supported via/i);
  });

  it("rejects TRENDING_DESC on catalogue listing", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?sort=TRENDING_DESC",
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "bad_request");
  });

  it("rejects genuinely invalid or malicious sort values", async () => {
    const { app } = buildTestApp();

    const invalidValues = ["random", "FAVOURITES_DESC", "DROP TABLE anime;", "unknown_sort_123", "__proto__"];

    for (const val of invalidValues) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/anime?sort=${encodeURIComponent(val)}`,
      });
      assert.equal(response.statusCode, 400, `Did not reject invalid sort: ${val}`);
      const body = JSON.parse(response.body);
      assert.equal(body.error, "bad_request");
    }
  });

  it("supports TV catalogue query with status and genre filters", async () => {
    const { app, getLastListOptions } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?format=TV&status=FINISHED&genre=Action&page=2&perPage=20&sort=score",
    });

    assert.equal(response.statusCode, 200);
    const opts = getLastListOptions();
    assert.ok(opts);
    assert.equal(opts.format, "TV");
    assert.equal(opts.status, "FINISHED");
    assert.equal(opts.genre, "Action");
    assert.equal(opts.limit, 20);
    assert.equal(opts.offset, 20);
    assert.equal(opts.sort, "score");
  });

  it("supports seasonal filtering with season and seasonYear", async () => {
    const { app, getLastListOptions } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?season=FALL&seasonYear=2024",
    });

    assert.equal(response.statusCode, 200);
    const opts = getLastListOptions();
    assert.equal(opts?.season, "FALL");
    assert.equal(opts?.seasonYear, 2024);
  });

  it("rejects season filter without seasonYear", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?season=FALL",
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "bad_request");
    assert.match(body.message, /seasonYear is required/i);
  });

  it("supports search and sort together on /api/v1/anime", async () => {
    const { app, getLastListOptions } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?q=titan&sort=SCORE_DESC",
    });

    assert.equal(response.statusCode, 200);
    const opts = getLastListOptions();
    assert.ok(opts);
    assert.equal(opts.q, "titan");
    assert.equal(opts.sort, "score");
  });

  it("supports sort parameter on /api/v1/anime/search", async () => {
    const { app, getLastSearchArgs } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime/search?q=frieren&limit=15&sort=POPULARITY_DESC",
    });

    assert.equal(response.statusCode, 200);
    const args = getLastSearchArgs();
    assert.ok(args);
    assert.equal(args.query, "frieren");
    assert.equal(args.limit, 15);
    assert.equal(args.sort, "popularity");
  });

  it("handles empty results gracefully with HTTP 200 and total 0", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/anime?genre=NonExistentGenre",
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.items, []);
    assert.equal(body.total, 0);
  });
});

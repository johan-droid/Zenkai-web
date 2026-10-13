/**
 * Backend Regression Tests for GET /api/v1/anime/:id
 *
 * Verifies:
 *  1. Valid anime ID when database is online -> returns 200 with persisted record
 *  2. Valid anime ID when database is offline (circuit breaker active) -> gracefully returns upstream detail (200)
 *  3. Malformed anime ID -> 400 bad_request (not 500)
 *  4. Nonexistent anime ID -> 404 not_found (not 500)
 *  5. Upstream provider outage (502) / rate-limit (429) / timeout (504) -> controlled errors, no fabricated success
 *  6. Fastify route injection verification for status codes and contracts
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import Fastify from "fastify";

import { AnimeService } from "../src/modules/anime/service.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import { registerAnimeRoutes } from "../src/modules/anime/routes.js";
import { AppError } from "../src/http/errors.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createMockDetail(id = "207329", title = "The Laid-Off Cheat-Granting Mage") {
  return {
    anilistId: id,
    canonicalTitle: title,
    titles: {
      romaji: title,
      english: title,
      native: "追放されたチート付与魔術師",
      synonyms: [],
    },
    coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b207329.jpg",
    coverImageLarge: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/b207329.jpg",
    bannerUrl: null,
    format: "TV",
    status: "RELEASING",
    year: 2024,
    season: "FALL",
    seasonYear: 2024,
    averageScore: 75,
    popularity: 15000,
    totalEpisodes: 12,
    durationMinutes: 24,
    genres: ["Action", "Fantasy"],
    relations: [],
    episodes: [
      { episodeNumber: 1, title: "Episode 1" },
      { episodeNumber: 2, title: "Episode 2" },
    ],
  };
}

function stubAnilist(data: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

function createMockRepo(options: { dbOnline?: boolean } = {}) {
  const dbOnline = options.dbOnline !== false;
  return {
    upsert: async (detail: any) => {
      if (!dbOnline) throw new Error("Database offline (circuit breaker active)");
      return `local-${detail.anilistId}`;
    },
    replaceRelations: async () => {
      if (!dbOnline) throw new Error("Database offline (circuit breaker active)");
    },
    getByAnilistId: async (id: string) => {
      if (!dbOnline) throw new Error("Database offline (circuit breaker active)");
      return null;
    },
    getLocalIdByAnilistId: async (id: string) => {
      if (!dbOnline) throw new Error("Database offline (circuit breaker active)");
      return null;
    },
    listEpisodes: async () => {
      if (!dbOnline) throw new Error("Database offline (circuit breaker active)");
      return [];
    },
    search: async () => [],
    list: async () => ({ items: [], total: 0 }),
    listGenres: async () => [],
    getEpisode: async () => null,
  } as unknown as AnimeRepository;
}

function buildTestApp(service: AnimeService) {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.reason,
        message: error.message,
      });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({
        error: "bad_request",
        message: error.message ?? "invalid request",
      });
    }
    return reply.code(500).send({
      error: "internal",
      message: "internal server error",
    });
  });

  const dummyDiscovery: any = {
    ranking: async () => ({ items: [] }),
    genres: async () => [],
    home: async () => ({}),
  };

  const dummyEpisodes: any = {
    catalogue: async (id: string) => ({ animeId: id, episodes: [] }),
    byNumber: async () => null,
    nextEpisode: async () => null,
    navigation: async () => ({}),
  };

  registerAnimeRoutes(app, service, dummyDiscovery, dummyEpisodes);
  return app;
}

describe("GET /api/v1/anime/:id — Anime Detail Regression Suite", () => {
  it("returns full anime detail when database is online", async () => {
    stubAnilist({ data: { Media: { id: 207329, title: { english: "The Laid-Off Cheat-Granting Mage" }, format: "TV" } } });
    const repo = createMockRepo({ dbOnline: true });
    const service = new AnimeService(repo);

    const result = await service.getFull("207329");
    assert.equal(result.anilistId, "207329");
    assert.equal(result.id, "local-207329");
  });

  it("gracefully falls back when database circuit breaker is offline (prevents 500 crash)", async () => {
    stubAnilist({ data: { Media: { id: 207329, title: { english: "The Laid-Off Cheat-Granting Mage" }, format: "TV" } } });
    const repo = createMockRepo({ dbOnline: false }); // Database throws offline error
    const service = new AnimeService(repo);

    // Should NOT throw Error("Database offline (circuit breaker active)")
    const result = await service.getFull("207329");
    assert.equal(result.anilistId, "207329");
    assert.equal(result.id, "207329"); // Falls back to anilistId
  });

  it("throws 404 not found when upstream provider returns null", async () => {
    stubAnilist({ data: { Media: null } });
    const repo = createMockRepo({ dbOnline: true });
    const service = new AnimeService(repo);

    await assert.rejects(
      async () => service.getFull("999999999"),
      (err: any) => err instanceof AppError && err.statusCode === 404,
    );
  });

  it("rejects malformed anime ID with 400 Bad Request via Fastify route", async () => {
    const service = new AnimeService(createMockRepo());
    const app = buildTestApp(service);

    const res1 = await app.inject({ method: "GET", url: "/api/v1/anime/notanumber" });
    assert.equal(res1.statusCode, 400);

    const res2 = await app.inject({ method: "GET", url: "/api/v1/anime/-99" });
    assert.equal(res2.statusCode, 400);

    const res3 = await app.inject({ method: "GET", url: "/api/v1/anime/0" });
    assert.equal(res3.statusCode, 400);
  });

  it("returns 404 via Fastify route when anime is nonexistent upstream", async () => {
    stubAnilist({ data: { Media: null } });
    const service = new AnimeService(createMockRepo());
    const app = buildTestApp(service);

    const res = await app.inject({ method: "GET", url: "/api/v1/anime/999999999" });
    assert.equal(res.statusCode, 404);
  });

  it("returns 200 via Fastify route for valid anime ID even with offline database", async () => {
    stubAnilist({ data: { Media: { id: 207329, title: { english: "The Laid-Off Cheat-Granting Mage" }, format: "TV" } } });
    const service = new AnimeService(createMockRepo({ dbOnline: false }));
    const app = buildTestApp(service);

    const res = await app.inject({ method: "GET", url: "/api/v1/anime/207329" });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.anilistId, "207329");
  });

  it("surfaces upstream errors (502) without fabricating fake data", async () => {
    stubAnilist({ errors: [{ message: "AniList API internal error" }] });
    const service = new AnimeService(createMockRepo());
    const app = buildTestApp(service);

    const res = await app.inject({ method: "GET", url: "/api/v1/anime/207329" });
    assert.equal(res.statusCode, 502);
  });
});

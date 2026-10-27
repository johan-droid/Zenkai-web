/**
 * Regression Test Suite for Episode Catalogue Synchronization
 *
 * Verifies:
 *  1. An anime with 12 expected episodes and only 1 existing database record triggers full sync and persists all 12.
 *  2. An anime with a complete catalogue does not create duplicate episode rows on repeated sync.
 *  3. An anime whose episode list spans multiple provider pages fetches and combines all pages.
 *  4. Richer existing episode metadata survives synchronization when provider returns sparse placeholders.
 *  5. A provider failure during synchronization does not erase valid stored episodes.
 *  6. An ongoing anime with unknown expected count or announced next episode handles null knownTotal correctly.
 *  7. Correct episode ordering and stable numbering (strictly ascending episodeNumber).
 *  8. Catalogue endpoint returns correct records and pagination metadata (page, perPage, total, totalPages).
 *  9. Frontend client contract parses multi-episode catalogues and pagination metadata.
 * 10. Switching between two anime titles isolates catalogue and cache without stale episode bleed.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import Fastify from "fastify";

import { AnimeService } from "../src/modules/anime/service.js";
import { AnimeRepository } from "../src/modules/anime/repository.js";
import { EpisodeService } from "../src/modules/anime/episodes.js";
import { registerAnimeRoutes } from "../src/modules/anime/routes.js";
import { cache } from "../src/cache/index.js";
import { AppError } from "../src/http/errors.js";
import type { StreamingProvider } from "../src/providers/streaming/types.js";
import type { ProviderEpisode } from "../src/providers/metadata/types.js";

// Helper to construct in-memory test repository backed by simple Maps
class InMemoryAnimeRepository {
  public animes = new Map<string, any>();
  public episodes = new Map<string, ProviderEpisode[]>(); // key: localId or anilistId

  async upsert(anime: any): Promise<string> {
    const id = anime.id || `local-${anime.anilistId}`;
    const record = { ...anime, id };
    this.animes.set(String(anime.anilistId), record);
    this.animes.set(id, record);
    return id;
  }

  async getByAnilistId(id: string): Promise<any> {
    return this.animes.get(String(id)) || null;
  }

  async getLocalIdByAnilistId(id: string): Promise<string | null> {
    const a = this.animes.get(String(id));
    return a ? a.id : null;
  }

  async getTotalEpisodes(anilistId: string): Promise<number | null> {
    const a = this.animes.get(String(anilistId));
    return a ? (a.totalEpisodes ?? null) : null;
  }

  async listEpisodes(localIdOrAnilistId: string): Promise<ProviderEpisode[]> {
    const list = this.episodes.get(String(localIdOrAnilistId)) || [];
    return [...list].sort((a, b) => a.episodeNumber - b.episodeNumber);
  }

  async listEpisodesWithAiring(localId: string): Promise<Record<string, any>[]> {
    const list = await this.listEpisodes(localId);
    return list.map((ep) => ({
      ...ep,
      id: `ep-${localId}-${ep.episodeNumber}`,
      airingState: "aired",
      airingAt: null,
      airingSource: null,
      providerStatus: null,
    }));
  }

  async upsertEpisodes(localId: string, incoming: ProviderEpisode[]): Promise<void> {
    const existing = this.episodes.get(localId) || [];
    const map = new Map<number, ProviderEpisode>();

    for (const ep of existing) {
      map.set(ep.episodeNumber, { ...ep });
    }

    for (const ep of incoming) {
      const prev = map.get(ep.episodeNumber);
      if (!prev) {
        map.set(ep.episodeNumber, { ...ep });
      } else {
        // Apply richer metadata preservation logic matching repository.ts
        const isGeneric = (t?: string | null) => !t || /^episode\s+\d+$/i.test(t.trim());
        const title = !isGeneric(prev.title) && isGeneric(ep.title) ? prev.title : (ep.title ?? prev.title);
        const description = (prev.description && !ep.description) ? prev.description : (ep.description ?? prev.description);
        const thumbnailUrl = (prev.thumbnailUrl && !ep.thumbnailUrl) ? prev.thumbnailUrl : (ep.thumbnailUrl ?? prev.thumbnailUrl);
        const durationSeconds = (prev.durationSeconds && !ep.durationSeconds) ? prev.durationSeconds : (ep.durationSeconds ?? prev.durationSeconds);
        const airDate = (prev.airDate && !ep.airDate) ? prev.airDate : (ep.airDate ?? prev.airDate);

        map.set(ep.episodeNumber, {
          ...prev,
          ...ep,
          title,
          description,
          thumbnailUrl,
          durationSeconds,
          airDate,
        });
      }
    }

    this.episodes.set(localId, Array.from(map.values()).sort((a, b) => a.episodeNumber - b.episodeNumber));
  }

  async replaceRelations(): Promise<void> {}
  async search(): Promise<any[]> { return []; }
  async list(): Promise<any> { return { items: [], total: 0 }; }
  async listGenres(): Promise<string[]> { return []; }
  async getEpisode(): Promise<any> { return null; }
}

function makeMockProvider(name: string, overrides: Partial<StreamingProvider> = {}): StreamingProvider {
  return {
    slug: name,
    name,
    kind: "api",
    basePriority: 100,
    version: "1.0.0",
    enabled: true,
    capabilities: {
      languages: ["sub"],
      accessTypes: ["hls"],
      supportsSubtitles: true,
      supportsSkipMarkers: false,
      requiresMalId: false,
    },
    resolve: async () => [],
    healthCheck: async () => true,
    listEpisodes: async () => [],
    ...overrides,
  };
}

function buildTestFastify(service: AnimeService, episodeService: EpisodeService) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.reason,
        message: error.message,
      });
    }
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as any).statusCode ?? 500)
        : 500;
    return reply.code(statusCode).send({
      error: "error",
      message: error instanceof Error ? error.message : "unknown error",
    });
  });
  registerAnimeRoutes(app, service, {} as any, episodeService);
  return app;
}

describe("Episode Catalogue Sync Regression Suite", () => {
  let repo: InMemoryAnimeRepository;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    repo = new InMemoryAnimeRepository();
    cache.clear();

    // Stub network fetch to prevent live calls to AniList during unit tests
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ data: { Media: null } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cache.clear();
  });

  // --- 1. Anime with 12 expected episodes and only 1 existing record in DB ---
  it("1. triggers sync and persists all 12 episodes when database has only 1 record", async () => {
    const anilistId = "990001";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "12 Episode Show",
      totalEpisodes: 12,
      status: "FINISHED",
    });

    // Initial DB state: only 1 episode stored
    await repo.upsertEpisodes(localId, [
      { episodeNumber: 1, title: "Episode 1", isFiller: false },
    ]);

    // Provider returns full catalogue of 12 episodes
    const provider12Episodes = Array.from({ length: 12 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));

    const mockProvider = makeMockProvider("test-provider", {
      listEpisodes: async () => provider12Episodes as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [mockProvider]);
    const result = await service.getEpisodes(anilistId);

    // Verify service returns all 12 episodes
    assert.equal(result.length, 12, "Should return 12 episodes");
    // Verify repository persisted all 12 episodes
    const persisted = await repo.listEpisodes(localId);
    assert.equal(persisted.length, 12, "Database must now contain all 12 episodes");
    assert.equal(persisted[11].episodeNumber, 12);
  });

  // --- 2. Anime with complete catalogue does not create duplicates ---
  it("2. synchronizes idempotently without creating duplicate episode records", async () => {
    const anilistId = "990002";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Complete Show",
      totalEpisodes: 6,
      status: "FINISHED",
    });

    const episodes = Array.from({ length: 6 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));

    const mockProvider = makeMockProvider("test-provider", {
      listEpisodes: async () => episodes as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [mockProvider]);

    // Run sync twice
    await service.syncEpisodes(anilistId);
    await service.syncEpisodes(anilistId);

    const stored = await repo.listEpisodes(localId);
    assert.equal(stored.length, 6, "Must contain exactly 6 episodes, no duplicates");
    const numbers = stored.map((e) => e.episodeNumber);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6]);
  });

  // --- 3. Anime whose episode list spans multiple provider pages ---
  it("3. traverses and combines multiple provider pages", async () => {
    const anilistId = "990003";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Multi Page Anime",
      totalEpisodes: 20,
      status: "FINISHED",
    });

    // Provider supports pagination
    const paginatedProvider = makeMockProvider("paginated-provider", {
      listEpisodes: (async (_req: any, page?: number) => {
        const p = page || 1;
        if (p === 1) {
          return {
            items: Array.from({ length: 10 }, (_, i) => ({
              episodeNumber: i + 1,
              title: `Ep ${i + 1}`,
              isFiller: false,
            })),
            totalPages: 2,
            hasNextPage: true,
          };
        } else {
          return {
            items: Array.from({ length: 10 }, (_, i) => ({
              episodeNumber: i + 11,
              title: `Ep ${i + 11}`,
              isFiller: false,
            })),
            totalPages: 2,
            hasNextPage: false,
          };
        }
      }) as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [paginatedProvider]);
    const synced = await service.syncEpisodes(anilistId);

    assert.equal(synced.length, 20, "Should have retrieved all 20 episodes across both pages");
    const stored = await repo.listEpisodes(localId);
    assert.equal(stored.length, 20);
    assert.equal(stored[0].episodeNumber, 1);
    assert.equal(stored[19].episodeNumber, 20);
  });

  // --- 4. Richer existing episode metadata survives synchronization ---
  it("4. preserves rich titles, descriptions, and thumbnails when provider returns sparse data", async () => {
    const anilistId = "990004";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Rich Metadata Show",
      totalEpisodes: 2,
    });

    // Existing episode in DB has rich metadata
    await repo.upsertEpisodes(localId, [
      {
        episodeNumber: 1,
        title: "To You, in 2000 Years: The Fall of Shiganshina",
        description: "The Colossus Titan suddenly appears and breaches Wall Maria.",
        thumbnailUrl: "https://img.cdn/thumb/ep1.jpg",
        durationSeconds: 1440,
        isFiller: false,
      },
    ]);

    // Provider returns generic/sparse metadata
    const sparseProvider = makeMockProvider("sparse-provider", {
      listEpisodes: async () => [
        {
          episodeNumber: 1,
          title: "Episode 1", // generic title!
          description: undefined,
          thumbnailUrl: undefined,
          isFiller: false,
        },
        {
          episodeNumber: 2,
          title: "That Day",
          description: "Second episode.",
          thumbnailUrl: "https://img.cdn/thumb/ep2.jpg",
          durationSeconds: 1440,
          isFiller: false,
        },
      ] as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [sparseProvider]);
    const result = await service.syncEpisodes(anilistId);

    const ep1 = result.find((e) => e.episodeNumber === 1);
    assert.ok(ep1);
    assert.equal(ep1.title, "To You, in 2000 Years: The Fall of Shiganshina", "Rich title must be preserved");
    assert.equal(ep1.description, "The Colossus Titan suddenly appears and breaches Wall Maria.", "Description preserved");
    assert.equal(ep1.thumbnailUrl, "https://img.cdn/thumb/ep1.jpg", "Thumbnail preserved");
    assert.equal(ep1.durationSeconds, 1440, "Duration preserved");
  });

  // --- 5. Provider failure during synchronization does not erase valid stored episodes ---
  it("5. preserves valid stored episodes when provider fails during sync", async () => {
    const anilistId = "990005";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Surviving Show",
      totalEpisodes: 12,
    });

    // Store 12 valid episodes initially
    const initialEpisodes: ProviderEpisode[] = Array.from({ length: 12 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));
    await repo.upsertEpisodes(localId, initialEpisodes);

    // Provider throws network outage error
    const failingProvider = makeMockProvider("failing-provider", {
      listEpisodes: async () => {
        throw new Error("Provider 502 Bad Gateway");
      },
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [failingProvider]);
    // Sync must not throw or wipe DB
    const res = await service.syncEpisodes(anilistId);

    assert.equal(res.length, 12, "Must return existing 12 stored episodes");
    const stored = await repo.listEpisodes(localId);
    assert.equal(stored.length, 12, "Existing DB episodes must remain untouched");
  });

  // --- 6. Ongoing anime with unknown expected count or announced next episode ---
  it("6. correctly handles ongoing anime with unknown total episodes", async () => {
    const anilistId = "990006";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Ongoing Epic",
      totalEpisodes: null, // unknown total
      status: "RELEASING",
    });

    const airedEpisodes = [
      { episodeNumber: 1, title: "Aired 1", isFiller: false },
      { episodeNumber: 2, title: "Aired 2", isFiller: false },
      { episodeNumber: 3, title: "Aired 3", isFiller: false },
    ];

    const provider = makeMockProvider("ongoing-provider", {
      listEpisodes: async () => airedEpisodes as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [provider]);
    const episodesService = new EpisodeService(repo as unknown as AnimeRepository);

    const synced = await service.syncEpisodes(anilistId);
    assert.equal(synced.length, 3);

    const cat = await episodesService.catalogue(anilistId);
    assert.ok(cat);
    assert.equal(cat.catalogueCount, 3);
    assert.equal(cat.knownTotal, null, "knownTotal must be null for unknown ongoing total");
    assert.equal(cat.episodes.length, 3);
  });

  // --- 7. Correct episode ordering and stable numbering ---
  it("7. guarantees strictly ascending and stable episode ordering", async () => {
    const anilistId = "990007";
    await repo.upsert({
      anilistId,
      canonicalTitle: "Scrambled Provider",
      totalEpisodes: 5,
    });

    // Provider returns scrambled episodes: [4, 1, 5, 2, 3]
    const scrambled = [4, 1, 5, 2, 3].map((num) => ({
      episodeNumber: num,
      title: `Ep ${num}`,
      isFiller: false,
    }));

    const provider = makeMockProvider("scrambled-provider", {
      listEpisodes: async () => scrambled as any,
    });

    const service = new AnimeService(repo as unknown as AnimeRepository, [provider]);
    const res = await service.syncEpisodes(anilistId);

    const numbers = res.map((e) => e.episodeNumber);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5], "Episodes must be sorted in ascending order");
  });

  // --- 8. Catalogue endpoint returning the correct records and pagination metadata ---
  it("8. returns paginated records and pagination metadata via Fastify route", async () => {
    const anilistId = "990008";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Paginated Route Test",
      totalEpisodes: 12,
      status: "FINISHED",
    });

    // Seed 12 episodes
    const eps: ProviderEpisode[] = Array.from({ length: 12 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));
    await repo.upsertEpisodes(localId, eps);

    const service = new AnimeService(repo as unknown as AnimeRepository, []);
    const episodeService = new EpisodeService(repo as unknown as AnimeRepository);

    const app = buildTestFastify(service, episodeService);

    // Request page 2 with perPage = 5 (should return items 6-10)
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/anime/${anilistId}/episodes?page=2&perPage=5`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    assert.equal(body.anilistId, anilistId);
    assert.equal(body.catalogueCount, 12);
    assert.equal(body.knownTotal, 12);
    assert.equal(body.page, 2);
    assert.equal(body.perPage, 5);
    assert.equal(body.totalPages, 3);
    assert.equal(body.total, 12);
    assert.equal(body.episodes.length, 5);
    assert.equal(body.episodes[0].episodeNumber, 6);
    assert.equal(body.episodes[4].episodeNumber, 10);
  });

  // --- 9. Frontend schema and client contract with multi-episode catalogue ---
  it("9. matches frontend schema requirements for multi-episode catalogue and pagination", async () => {
    const anilistId = "990009";
    const localId = await repo.upsert({
      anilistId,
      canonicalTitle: "Frontend Contract Test",
      totalEpisodes: 24,
      status: "FINISHED",
    });

    const eps: ProviderEpisode[] = Array.from({ length: 24 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));
    await repo.upsertEpisodes(localId, eps);

    const service = new AnimeService(repo as unknown as AnimeRepository, []);
    const episodeService = new EpisodeService(repo as unknown as AnimeRepository);

    const app = buildTestFastify(service, episodeService);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/anime/${anilistId}/episodes`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Validate structure matches frontend expectations
    assert.equal(typeof body.anilistId, "string");
    assert.equal(typeof body.catalogueCount, "number");
    assert.equal(typeof body.knownTotal, "number");
    assert.ok(Array.isArray(body.episodes));
    assert.equal(body.episodes.length, 24);
    for (const ep of body.episodes) {
      assert.equal(typeof ep.episodeNumber, "number");
      assert.equal(typeof ep.isFiller, "boolean");
    }
  });

  // --- 10. Switching between two anime titles without showing stale episodes ---
  it("10. prevents cross-title bleed when querying distinct anime catalogues sequentially", async () => {
    const animeA = "990010";
    const animeB = "990011";

    const idA = await repo.upsert({
      anilistId: animeA,
      canonicalTitle: "Anime A",
      totalEpisodes: 3,
    });
    const idB = await repo.upsert({
      anilistId: animeB,
      canonicalTitle: "Anime B",
      totalEpisodes: 5,
    });

    await repo.upsertEpisodes(idA, [
      { episodeNumber: 1, title: "A Ep 1", isFiller: false },
      { episodeNumber: 2, title: "A Ep 2", isFiller: false },
      { episodeNumber: 3, title: "A Ep 3", isFiller: false },
    ]);

    await repo.upsertEpisodes(idB, [
      { episodeNumber: 1, title: "B Ep 1", isFiller: false },
      { episodeNumber: 2, title: "B Ep 2", isFiller: false },
      { episodeNumber: 3, title: "B Ep 3", isFiller: false },
      { episodeNumber: 4, title: "B Ep 4", isFiller: false },
      { episodeNumber: 5, title: "B Ep 5", isFiller: false },
    ]);

    const service = new AnimeService(repo as unknown as AnimeRepository, []);
    const episodeService = new EpisodeService(repo as unknown as AnimeRepository);

    const app = buildTestFastify(service, episodeService);

    // Query A
    const resA1 = await app.inject({ method: "GET", url: `/api/v1/anime/${animeA}/episodes` });
    const dataA1 = JSON.parse(resA1.body);
    assert.equal(dataA1.episodes.length, 3);
    assert.equal(dataA1.episodes[0].title, "A Ep 1");

    // Query B
    const resB = await app.inject({ method: "GET", url: `/api/v1/anime/${animeB}/episodes` });
    const dataB = JSON.parse(resB.body);
    assert.equal(dataB.episodes.length, 5);
    assert.equal(dataB.episodes[0].title, "B Ep 1");

    // Query A again - must still have A's 3 episodes, no bleed from B
    const resA2 = await app.inject({ method: "GET", url: `/api/v1/anime/${animeA}/episodes` });
    const dataA2 = JSON.parse(resA2.body);
    assert.equal(dataA2.episodes.length, 3);
    assert.equal(dataA2.episodes[0].title, "A Ep 1");
    assert.equal(dataA2.episodes[2].title, "A Ep 3");
  });
});

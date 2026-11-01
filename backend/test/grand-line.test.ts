import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { GrandLineService } from "../src/modules/grand-line/service.js";
import { registerGrandLineRoutes } from "../src/modules/grand-line/routes.js";
import { AppError } from "../src/http/errors.js";

describe("Zenkai Grand Line: Service Unit Tests", () => {
  const service = new GrandLineService();

  it("retrieves all 11 sagas in chronological story order", () => {
    const sagas = service.getSagas();
    assert.equal(sagas.length, 11);
    assert.equal(sagas[0].id, "east-blue");
    assert.equal(sagas[0].name, "East Blue Saga");
    assert.equal(sagas[10].id, "final-saga");
    assert.equal(sagas[10].name, "Final Saga");

    // Ensure every saga has arcs and episodes
    for (const saga of sagas) {
      assert.ok(saga.arcCount > 0, `Saga ${saga.id} should have arcs`);
      assert.ok(saga.episodeCount > 0, `Saga ${saga.id} should have episodes`);
      assert.equal(saga.arcs.length, saga.arcCount);
    }
  });

  it("retrieves all 38 arcs with metadata summaries", () => {
    const arcs = service.getArcs();
    assert.equal(arcs.length, 38);

    const romanceDawn = arcs[0];
    assert.equal(romanceDawn.id, "romance-dawn");
    assert.equal(romanceDawn.title, "Romance Dawn");
    assert.equal(romanceDawn.sagaId, "east-blue");
    assert.equal(romanceDawn.episodeCount, 4);
    assert.ok(romanceDawn.duration.includes("min") || romanceDawn.duration.includes("hr"));
  });

  it("retrieves an arc with full episode roster", () => {
    const arc = service.getArc("romance-dawn");
    assert.equal(arc.id, "romance-dawn");
    assert.equal(arc.title, "Romance Dawn");
    assert.equal(arc.episodes.length, 4);

    const ep1 = arc.episodes[0];
    assert.equal(ep1.id, "romance-dawn-01");
    assert.equal(ep1.episodeNumber, "01");
    assert.ok(ep1.title.includes("ROMANCE DAWN"));
    assert.equal(ep1.mangaChapters, "1");
    assert.equal(ep1.watchUrl, "https://onepace.net/en/watch#romance-dawn-01");
  });

  it("throws 404 AppError when arc is not found", () => {
    assert.throws(
      () => service.getArc("nonexistent-arc-slug"),
      (err: unknown) => {
        return err instanceof AppError && err.statusCode === 404;
      },
    );
  });

  it("retrieves episode details with adjacent navigation", () => {
    // Episode 1 of Romance Dawn (start of story)
    const ep1 = service.getEpisode("romance-dawn", "01");
    assert.equal(ep1.episode.id, "romance-dawn-01");
    assert.equal(ep1.arc.id, "romance-dawn");
    assert.equal(ep1.prevEpisode, null, "First episode should have no previous episode");
    assert.ok(ep1.nextEpisode, "First episode should have next episode");
    assert.equal(ep1.nextEpisode.episodeNumber, "02");

    // Episode 4 of Romance Dawn (end of arc -> crosses to Orange Town 01)
    const ep4 = service.getEpisode("romance-dawn", "04");
    assert.equal(ep4.episode.id, "romance-dawn-04");
    assert.ok(ep4.prevEpisode);
    assert.equal(ep4.prevEpisode.episodeNumber, "03");
    assert.ok(ep4.nextEpisode);
    assert.equal(ep4.nextEpisode.arcId, "orange-town");
    assert.equal(ep4.nextEpisode.episodeNumber, "01");
  });

  it("supports looking up episode by full ID or numeric string", () => {
    const byNumber = service.getEpisode("romance-dawn", "02");
    const byId = service.getEpisode("romance-dawn", "romance-dawn-02");
    assert.equal(byNumber.episode.id, byId.episode.id);
  });

  it("throws 404 AppError when episode is not found in arc", () => {
    assert.throws(
      () => service.getEpisode("romance-dawn", "99"),
      (err: unknown) => {
        return err instanceof AppError && err.statusCode === 404;
      },
    );
  });

  it("searches catalog by character, chapter, or anime episode number", () => {
    const luffyResults = service.search("Luffy");
    assert.ok(luffyResults.length > 0);

    const chapterResults = service.search("1000");
    assert.ok(chapterResults.length > 0);
    assert.ok(chapterResults.some((r) => r.episode.mangaChapters.includes("1000")));

    const empty = service.search("   ");
    assert.equal(empty.length, 0);
  });

  it("reports accurate catalog status and freshness", () => {
    const status = service.getStatus();
    assert.equal(status.status, "ok");
    assert.equal(status.source, "onepace.net");
    assert.equal(status.sagasCount, 11);
    assert.equal(status.arcsCount, 38);
    assert.equal(status.episodesCount, 477);
  });
});

describe("Zenkai Grand Line: Fastify Route Integration", () => {
  const service = new GrandLineService();
  const app = Fastify();
  registerGrandLineRoutes(app, service);

  it("GET /api/v1/grand-line/sagas returns 200 and all 11 sagas", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/sagas",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.sagas.length, 11);
    assert.equal(body.sagas[0].id, "east-blue");
  });

  it("GET /api/v1/grand-line/arcs returns 200 and all 38 arcs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/arcs",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.arcs.length, 38);
  });

  it("GET /api/v1/grand-line/arcs/:arcId returns 200 with arc episodes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/arcs/romance-dawn",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.arc.id, "romance-dawn");
    assert.equal(body.arc.episodes.length, 4);
  });

  it("GET /api/v1/grand-line/arcs/:arcId/episodes/:episodeNumber returns 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/arcs/romance-dawn/episodes/01",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.episode.id, "romance-dawn-01");
    assert.equal(body.arc.id, "romance-dawn");
    assert.equal(body.prevEpisode, null);
    assert.equal(body.nextEpisode.episodeNumber, "02");
  });

  it("GET /api/v1/grand-line/search?q=Shanks returns 200 and results", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/search?q=Shanks",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.query, "Shanks");
    assert.ok(body.results.length > 0);
  });

  it("GET /api/v1/grand-line/status returns 200 with catalog metrics", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/grand-line/status",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.episodesCount, 477);
  });

  it("POST /api/v1/grand-line/sync returns status and triggers sync without crashing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/grand-line/sync",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.status === "ok" || body.status === "warning");
    assert.ok(body.catalog);
    assert.equal(body.catalog.sagasCount, 11);
  });
});

describe("Zenkai Grand Line: Metadata Adapter & Ingestion", () => {
  it("initializes with default manifest snapshot and reports metrics", async () => {
    const { OnePaceMetadataAdapter } = await import(
      "../src/modules/grand-line/adapter.js"
    );
    const adapter = new OnePaceMetadataAdapter();
    const snapshot = adapter.getSnapshot();

    assert.equal(snapshot.sagas.length, 11);
    assert.equal(snapshot.arcs.length, 38);
    assert.equal(snapshot.episodesCount, 477);
    assert.equal(snapshot.catalogVersion, "2.0.0");
    assert.equal(snapshot.source, "manifest");
  });

  it("ingests external metadata with CRC32 episode mapping and updates active snapshot", async () => {
    const { OnePaceMetadataAdapter } = await import(
      "../src/modules/grand-line/adapter.js"
    );
    const adapter = new OnePaceMetadataAdapter();

    const sampleArcs = {
      "romance-dawn": {
        title: "Romance Dawn",
        order: 1,
        episodes: ["6D92D66C", "A1B2C3D4"],
        manga_chapters: "1-7",
        anime_episodes: "1-3",
        description: "The journey begins in the East Blue.",
      },
    };

    const sampleEpisodes = {
      "6D92D66C": {
        title: "Romance Dawn 01",
        season: 1,
        episode: 1,
        manga_chapters: "1",
        anime_episodes: "1",
        description: "Luffy meets Koby and Zoro.",
        crc32: "6D92D66C",
        air_date: "2020-01-01",
      },
      "A1B2C3D4": {
        title: "Romance Dawn 02",
        season: 1,
        episode: 2,
        manga_chapters: "2-4",
        anime_episodes: "2",
        description: "Battle against Captain Morgan.",
        crc32: "A1B2C3D4",
        air_date: "2020-01-08",
      },
    };

    const result = adapter.ingest(sampleArcs, sampleEpisodes, {
      version: "2.1.0",
      source: "test-feed",
    });

    assert.equal(result.success, true);
    const snapshot = adapter.getSnapshot();
    assert.equal(snapshot.catalogVersion, "2.1.0");
    assert.equal(snapshot.source, "test-feed");

    const rdArc = snapshot.arcs.find((a) => a.id === "romance-dawn");
    assert.ok(rdArc);
    assert.equal(rdArc.episodes.length, 2);
    assert.equal(rdArc.episodes[0].id, "romance-dawn-01");
    assert.equal(rdArc.episodes[0].crc32, "6D92D66C");
    assert.equal(rdArc.episodes[0].title, "Romance Dawn 01");
    assert.equal(rdArc.episodes[0].watchUrl, "https://onepace.net/en/watch#romance-dawn-01");
  });

  it("atomically preserves last-known-good snapshot when incoming data fails validation", async () => {
    const { OnePaceMetadataAdapter } = await import(
      "../src/modules/grand-line/adapter.js"
    );
    const adapter = new OnePaceMetadataAdapter();
    const originalEpisodeCount = adapter.getSnapshot().episodesCount;

    // Provide completely malformed payload
    const malformedArcs = {
      "invalid-arc": {
        // Missing required title
        episodes: "not an array",
      },
    };

    const result = adapter.ingest(malformedArcs);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("Metadata validation failed"));

    // Ensure snapshot was NOT corrupted and previous working snapshot remains active
    const snapshotAfterFailure = adapter.getSnapshot();
    assert.equal(snapshotAfterFailure.episodesCount, originalEpisodeCount);
    assert.equal(snapshotAfterFailure.source, "manifest");
  });

  it("handles remote fetch failure gracefully without corrupting state", async () => {
    const { OnePaceMetadataAdapter } = await import(
      "../src/modules/grand-line/adapter.js"
    );
    const adapter = new OnePaceMetadataAdapter();
    const originalEpisodeCount = adapter.getSnapshot().episodesCount;

    // Mock fetch that throws network failure
    const mockFailingFetch = async () => {
      throw new Error("Simulated network timeout (ECONNRESET)");
    };

    const result = await adapter.fetchAndSync(
      "https://example.com/mock.json",
      mockFailingFetch as unknown as typeof fetch,
    );

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("ECONNRESET"));

    // State remains intact
    assert.equal(adapter.getSnapshot().episodesCount, originalEpisodeCount);
    const syncInfo = adapter.getSyncInfo();
    assert.ok(syncInfo.lastSyncAttempt);
    assert.equal(syncInfo.lastSuccessfulSync, null);
  });

  it("rebuilds service indexes dynamically when service receives ingestion updates", async () => {
    const service = new GrandLineService();
    const initialEpisodesCount = service.getStatus().episodesCount;

    const sampleArcs = {
      "romance-dawn": {
        title: "Romance Dawn",
        order: 1,
        episodes: [
          {
            title: "ROMANCE DAWN 01",
            episode: 1,
            description: "New updated synopsis",
            manga_chapters: "1",
            anime_episodes: "1",
          },
        ],
      },
    };

    const result = service.ingest(sampleArcs, undefined, {
      version: "2.2.0",
      source: "live-update",
    });

    assert.equal(result.success, true);
    const status = service.getStatus();
    assert.equal(status.catalogVersion, "2.2.0");

    // Index was rebuilt
    const arc = service.getArc("romance-dawn");
    assert.equal(arc.episodes.length, 1);
    assert.equal(arc.episodes[0].synopsis, "New updated synopsis");
  });
});

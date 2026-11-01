import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GrandLineSagasResponseSchema,
  GrandLineArcResponseSchema,
  GrandLineEpisodeDetailSchema,
  GrandLineSearchResponseSchema,
  GrandLineStatusSchema,
  GrandLineSyncResponseSchema,
  GrandLineEpisodeSchema,
} from "../src/lib/api/zenkai.js";
import { formatOnePaceProgressId } from "../src/hooks/use-grand-line.js";
import { primaryNav } from "../src/config/nav.js";

describe("Zenkai Grand Line — Frontend Contract & Schema Suite", () => {
  it("includes /grand-line in primary application navigation", () => {
    const navItem = primaryNav.find((item) => item.href === "/grand-line");
    assert.ok(navItem, "/grand-line navigation entry must be present in primaryNav");
    assert.equal(navItem.label, "Grand Line");
    assert.ok(navItem.icon, "Grand Line item must have an icon");
  });

  it("formats composite progress IDs with proper one-pace namespace", () => {
    const id1 = formatOnePaceProgressId("romance-dawn", "1");
    assert.equal(id1, "anime:one-pace:romance-dawn-01");

    const id2 = formatOnePaceProgressId("wano", "25");
    assert.equal(id2, "anime:one-pace:wano-25");
  });

  it("parses canonical sagas response payload", () => {
    const payload = {
      sagas: [
        {
          id: "east-blue",
          name: "East Blue Saga",
          order: 1,
          arcCount: 8,
          episodeCount: 38,
          arcs: [
            {
              id: "romance-dawn",
              title: "Romance Dawn",
              order: 1,
              episodeCount: 4,
              duration: "1 hr, 25 min",
              mangaChapters: "1–7",
              animeEpisodes: "1–3, 19",
              synopsis: "Monkey D. Luffy sets out on an adventure.",
            },
          ],
        },
      ],
    };

    const parsed = GrandLineSagasResponseSchema.parse(payload);
    assert.equal(parsed.sagas.length, 1);
    assert.equal(parsed.sagas[0].id, "east-blue");
    assert.equal(parsed.sagas[0].arcs[0].id, "romance-dawn");
  });

  it("parses arc detail response with full episode roster", () => {
    const payload = {
      arc: {
        id: "romance-dawn",
        title: "Romance Dawn",
        sagaId: "east-blue",
        sagaName: "East Blue Saga",
        order: 1,
        mangaChapters: "1–7",
        animeEpisodes: "1–3, 19",
        duration: "1 hr, 25 min",
        synopsis: "Monkey D. Luffy sets out on an adventure.",
        episodeCount: 1,
        episodes: [
          {
            id: "romance-dawn-01",
            arcId: "romance-dawn",
            episodeNumber: "01",
            title: "ROMANCE DAWN",
            mangaChapters: "1",
            animeEpisodes: "1",
            duration: "17 min",
            synopsis: "Influenced by Shanks...",
            watchUrl: "https://onepace.net/en/watch#romance-dawn-01",
            downloads: [],
          },
        ],
      },
    };

    const parsed = GrandLineArcResponseSchema.parse(payload);
    assert.equal(parsed.arc.id, "romance-dawn");
    assert.equal(parsed.arc.episodes.length, 1);
    assert.equal(parsed.arc.episodes[0].watchUrl, "https://onepace.net/en/watch#romance-dawn-01");
  });

  it("parses episode detail response with adjacent navigation", () => {
    const payload = {
      episode: {
        id: "romance-dawn-01",
        arcId: "romance-dawn",
        episodeNumber: "01",
        title: "ROMANCE DAWN",
        mangaChapters: "1",
        animeEpisodes: "1",
        duration: "17 min",
        synopsis: "Influenced by Shanks...",
        watchUrl: "https://onepace.net/en/watch#romance-dawn-01",
        downloads: [],
      },
      arc: {
        id: "romance-dawn",
        title: "Romance Dawn",
        sagaId: "east-blue",
        sagaName: "East Blue Saga",
        order: 1,
      },
      prevEpisode: null,
      nextEpisode: {
        id: "romance-dawn-02",
        arcId: "romance-dawn",
        episodeNumber: "02",
        title: "They Call Him Straw Hat",
      },
    };

    const parsed = GrandLineEpisodeDetailSchema.parse(payload);
    assert.equal(parsed.episode.id, "romance-dawn-01");
    assert.equal(parsed.prevEpisode, null);
    assert.equal(parsed.nextEpisode?.episodeNumber, "02");
  });

  it("parses search query response", () => {
    const payload = {
      query: "Shanks",
      results: [
        {
          episode: {
            id: "romance-dawn-01",
            arcId: "romance-dawn",
            episodeNumber: "01",
            title: "ROMANCE DAWN",
            mangaChapters: "1",
            animeEpisodes: "1",
            duration: "17 min",
            synopsis: "Influenced by Shanks...",
            watchUrl: "https://onepace.net/en/watch#romance-dawn-01",
            downloads: [],
          },
          arc: {
            id: "romance-dawn",
            title: "Romance Dawn",
            sagaId: "east-blue",
            sagaName: "East Blue Saga",
            order: 1,
          },
        },
      ],
    };

    const parsed = GrandLineSearchResponseSchema.parse(payload);
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].episode.id, "romance-dawn-01");
  });

  it("parses status response payload", () => {
    const payload = {
      status: "ok",
      source: "onepace.net",
      officialSite: "https://onepace.net/en/watch",
      officialRss: "https://onepace.net/en/releases/rss.xml",
      sagasCount: 11,
      arcsCount: 38,
      episodesCount: 477,
      lastUpdated: "2026-11-01T00:00:00Z",
    };

    const parsed = GrandLineStatusSchema.parse(payload);
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.sagasCount, 11);
    assert.equal(parsed.arcsCount, 38);
    assert.equal(parsed.episodesCount, 477);
  });

  it("parses extended metadata with CRC32 and sync freshness attributes", () => {
    const epPayload = {
      id: "romance-dawn-01",
      arcId: "romance-dawn",
      episodeNumber: "01",
      title: "ROMANCE DAWN",
      mangaChapters: "1",
      animeEpisodes: "1",
      duration: "17 min",
      synopsis: "Influenced by Shanks...",
      watchUrl: "https://onepace.net/en/watch#romance-dawn-01",
      downloads: [],
      crc32: "6D92D66C",
      releasedAt: "2020-01-01",
      resolution: "1080p",
    };

    const parsedEp = GrandLineEpisodeSchema.parse(epPayload);
    assert.equal(parsedEp.crc32, "6D92D66C");
    assert.equal(parsedEp.releasedAt, "2020-01-01");
    assert.equal(parsedEp.resolution, "1080p");

    const statusPayload = {
      status: "ok",
      source: "remote:ladyisatis-v2",
      officialSite: "https://onepace.net/en/watch",
      officialRss: "https://onepace.net/en/releases/rss.xml",
      sagasCount: 11,
      arcsCount: 38,
      episodesCount: 477,
      lastUpdated: "2026-11-01T12:00:00Z",
      lastSyncAttempt: "2026-11-01T12:00:00Z",
      lastSuccessfulSync: "2026-11-01T12:00:00Z",
      catalogVersion: "2.1.0",
    };

    const parsedStatus = GrandLineStatusSchema.parse(statusPayload);
    assert.equal(parsedStatus.catalogVersion, "2.1.0");
    assert.equal(parsedStatus.lastSuccessfulSync, "2026-11-01T12:00:00Z");

    const syncPayload = {
      status: "ok",
      synced: true,
      catalog: statusPayload,
    };

    const parsedSync = GrandLineSyncResponseSchema.parse(syncPayload);
    assert.equal(parsedSync.synced, true);
    assert.equal(parsedSync.catalog.catalogVersion, "2.1.0");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import { PlaybackResolver } from "../src/modules/playback/service.js";
import { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";

describe("Playback Issues Reporting Route Suite", () => {
  it("rejects invalid issue reports with 400 Bad Request", async () => {
    const app = Fastify();
    const resolver = new PlaybackResolver([], {} as any);
    const metadata = new PlaybackMetadataService({} as any, []);
    const animeRepo = {} as AnimeRepository;

    registerPlaybackRoutes(app, resolver, metadata, animeRepo);

    // Missing episodeId
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/playback/issues",
      payload: {
        issueCategory: "dead_stream",
      },
    });
    assert.equal(res1.statusCode, 400);

    // Invalid issue category
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/playback/issues",
      payload: {
        episodeId: "ep-21-1",
        issueCategory: "invalid_category",
      },
    });
    assert.equal(res2.statusCode, 400);
  });

  it("accepts valid issue reports and processes successfully", async () => {
    const app = Fastify();
    const resolver = new PlaybackResolver([], {} as any);
    const metadata = new PlaybackMetadataService({} as any, []);
    const animeRepo = {} as AnimeRepository;

    registerPlaybackRoutes(app, resolver, metadata, animeRepo);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/playback/issues",
      payload: {
        episodeId: "ep-21-1",
        animeId: "21",
        providerSlug: "zenkai-api",
        issueCategory: "dead_stream",
        playbackTimestampSeconds: 45,
        audioLanguage: "sub",
        userDescription: "Stream failed to load at 0:45",
      },
    });

    assert.ok(res.statusCode === 200 || res.statusCode === 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.reportId);
  });

  it("provides issues summary endpoint", async () => {
    const app = Fastify();
    const resolver = new PlaybackResolver([], {} as any);
    const metadata = new PlaybackMetadataService({} as any, []);
    const animeRepo = {} as AnimeRepository;

    registerPlaybackRoutes(app, resolver, metadata, animeRepo);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/playback/issues/summary",
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.total, "number");
    assert.ok(body.byCategory);
    assert.ok(body.byProvider);
  });
});

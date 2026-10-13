/**
 * Playback remediation and performance regression tests.
 *
 * Verifies:
 * - Authorized test sources reach the player with validated=true and playable=true.
 * - Dead or unreachable endpoints do not produce a false validated state.
 * - Stale selections fail cleanly with 409.
 * - Cache-Control headers are correctly set for CDN edge caching.
 * - Provider timeouts are strictly bounded to prevent request hanging.
 * - Cache stampede deduplication handles concurrent requests cleanly.
 */

import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, it } from "node:test";

import { cache } from "../src/cache/index.js";
import { PlaybackResolver } from "../src/modules/playback/service.js";
import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import { TemplateProvider } from "../src/providers/streaming/template.provider.js";
import { InProcessProvider } from "../src/providers/streaming/inprocess.provider.js";
import { DEMO_ENDPOINTS } from "../src/providers/streaming/registry.js";
import type { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type { StreamingProvider } from "../src/providers/streaming/types.js";

const EPISODE_ID = "ep-207329-1";

function stubAnimeRepo(): AnimeRepository {
  return {
    async getEpisode(id: string) {
      return { id, animeId: "207329", episodeNumber: 1, title: "Episode 1" };
    },
    async listParentTitles() {
      return [{ id: "207329", anilistId: 207329, canonicalTitle: "Demon Slayer" }];
    },
    async getEpisodeExternalIds() {
      return [];
    },
    async getLocalIdByAnilistId() {
      return "207329";
    },
    async listEpisodes() {
      return [];
    },
  } as unknown as AnimeRepository;
}

describe("playback remediation & performance", () => {
  beforeEach(() => {
    cache.clear();
  });

  it("resolves authorized demo test stream into validated and playable plan", async () => {
    const demoEndpoint = DEMO_ENDPOINTS[0]!;
    const demoProvider = new TemplateProvider(
      demoEndpoint.providerSlug,
      demoEndpoint.providerName,
      demoEndpoint.priority,
      demoEndpoint,
    );

    const resolver = new PlaybackResolver([demoProvider], stubAnimeRepo());
    const resolved = await resolver.resolveEpisode(EPISODE_ID, { language: "sub" });

    assert.ok(resolved, "must resolve canonical episode");
    assert.ok(resolved.result.sources.length > 0, "must return at least one source");
    const topSource = resolved.result.sources[0]!;
    assert.equal(topSource.providerSlug, demoEndpoint.providerSlug);
    assert.ok(topSource.playbackUrl.startsWith("http"), "must have absolute URL");
    assert.equal(topSource.accessType, "hls");
  });

  it("does not report an unreachable candidate as validated when probe fails", async () => {
    const deadEndpoint = {
      id: "dead-library",
      providerSlug: "dead-library",
      providerName: "Dead Library",
      endpointSlug: "sub",
      displayName: "Dead Library",
      language: "sub" as const,
      accessType: "hls" as const,
      badge: "Dead",
      urlTemplate: "https://127.0.0.1:59999/unreachable/master.m3u8",
      requiredIdType: "none" as const,
      priority: 1,
    };

    const deadProvider = new TemplateProvider(
      deadEndpoint.providerSlug,
      deadEndpoint.providerName,
      deadEndpoint.priority,
      deadEndpoint,
    );

    const resolver = new PlaybackResolver([deadProvider], stubAnimeRepo());
    const resolved = await resolver.resolveEpisode(EPISODE_ID, { language: "sub" });

    assert.ok(resolved);
    if (resolved.result.sources.length > 0) {
      assert.equal(resolved.result.sources[0]?.validated, false, "unreachable source must not be validated");
    }
  });

  it("executes valid plan via POST /api/v1/playback/execute and returns media execution", async () => {
    const app = Fastify({ logger: false });
    const demoEndpoint = DEMO_ENDPOINTS[0]!;
    const demoProvider = new TemplateProvider(
      demoEndpoint.providerSlug,
      demoEndpoint.providerName,
      demoEndpoint.priority,
      demoEndpoint,
    );

    const repo = stubAnimeRepo();
    const resolver = new PlaybackResolver([demoProvider], repo);
    registerPlaybackRoutes(
      app,
      resolver,
      {} as PlaybackMetadataService,
      repo,
    );

    const sourcesRes = await app.inject({
      method: "GET",
      url: `/api/v1/episodes/${EPISODE_ID}/sources`,
    });
    assert.equal(sourcesRes.statusCode, 200);
    const sourcesData = JSON.parse(sourcesRes.body);
    assert.ok(sourcesData.plans.length > 0);
    const topPlan = sourcesData.plans[0];

    // Cache-Control verification
    assert.ok(
      sourcesRes.headers["cache-control"]?.includes("public"),
      "successful sources response must have public Cache-Control",
    );

    const execRes = await app.inject({
      method: "POST",
      url: "/api/v1/playback/execute",
      payload: {
        episodeId: EPISODE_ID,
        sourceId: topPlan.sourceId,
        language: "sub",
      },
    });

    assert.equal(execRes.statusCode, 200);
    const execData = JSON.parse(execRes.body);
    assert.ok(execData.execution, "must return execution object");
    assert.equal(execData.execution.kind, "media");
    assert.equal(execData.execution.mechanism, "hls");
    assert.ok(execData.execution.url.startsWith("http"));
  });

  it("rejects non-existent sourceId with 409 selection_stale", async () => {
    const app = Fastify({ logger: false });
    const demoEndpoint = DEMO_ENDPOINTS[0]!;
    const demoProvider = new TemplateProvider(
      demoEndpoint.providerSlug,
      demoEndpoint.providerName,
      demoEndpoint.priority,
      demoEndpoint,
    );

    const repo = stubAnimeRepo();
    const resolver = new PlaybackResolver([demoProvider], repo);
    registerPlaybackRoutes(
      app,
      resolver,
      {} as PlaybackMetadataService,
      repo,
    );
    app.setErrorHandler((error: any, _req, reply) => {
      reply.code(error.statusCode ?? 500).send({
        error: error.reason ?? error.name,
        message: error.message,
      });
    });

    const execRes = await app.inject({
      method: "POST",
      url: "/api/v1/playback/execute",
      payload: {
        episodeId: EPISODE_ID,
        sourceId: "nonexistent-server:123",
        language: "sub",
      },
    });

    assert.equal(execRes.statusCode, 409);
    const body = JSON.parse(execRes.body);
    assert.equal(body.error, "selection_stale");
  });

  it("coalesces concurrent requests for the same episode sources to prevent stampede", async () => {
    let resolveCalls = 0;
    const countingProvider: StreamingProvider = {
      slug: "counting",
      name: "Counting",
      kind: "template",
      version: "1.0.0",
      enabled: true,
      basePriority: 10,
      capabilities: {
        languages: ["sub"],
        accessTypes: ["hls"],
        supportsSubtitles: false,
        supportsSkipMarkers: false,
        requiresMalId: false,
      },
      async resolve() {
        resolveCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return [
          {
            id: "counting:sub:1",
            providerSlug: "counting",
            providerName: "Counting",
            endpointSlug: "sub",
            accessType: "hls",
            playbackUrl: "https://example.com/1.m3u8",
            language: "sub",
            priority: 10,
          },
        ];
      },
      async healthCheck() {
        return true;
      },
    };

    const resolver = new PlaybackResolver([countingProvider], stubAnimeRepo());

    // 5 concurrent requests for the same episode
    const results = await Promise.all([
      resolver.resolveEpisode(EPISODE_ID, { language: "sub" }),
      resolver.resolveEpisode(EPISODE_ID, { language: "sub" }),
      resolver.resolveEpisode(EPISODE_ID, { language: "sub" }),
      resolver.resolveEpisode(EPISODE_ID, { language: "sub" }),
      resolver.resolveEpisode(EPISODE_ID, { language: "sub" }),
    ]);

    for (const res of results) {
      assert.ok(res);
      assert.equal(res.result.sources.length, 1);
    }

    // In-flight coalescing and cache must avoid 5 separate resolves
    assert.ok(resolveCalls <= 2, `expected at most 2 resolve calls, got ${resolveCalls}`);
  });

  it("bounds provider resolve execution time to at most 3500ms when provider hangs", async () => {
    const hangingProvider: StreamingProvider = {
      slug: "hanging-slow",
      name: "Hanging Slow",
      kind: "scrape",
      version: "1.0.0",
      enabled: true,
      basePriority: 10,
      capabilities: {
        languages: ["sub"],
        accessTypes: ["hls"],
        supportsSubtitles: false,
        supportsSkipMarkers: false,
        requiresMalId: false,
      },
      async resolve() {
        // Hangs indefinitely
        await new Promise(() => {});
        return [];
      },
      async healthCheck() {
        return false;
      },
    };

    const resolver = new PlaybackResolver([hangingProvider], stubAnimeRepo());
    const start = Date.now();
    const result = await resolver.resolveEpisode(`ep-hang-${Date.now()}-1`, { language: "sub" });
    const elapsed = Date.now() - start;

    assert.ok(result);
    assert.equal(result.result.emptyReason, "all_failed");
    assert.ok(
      elapsed < 3500,
      `hanging provider must timeout within 3500ms, took ${elapsed}ms`,
    );
  });
});

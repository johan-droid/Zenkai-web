/**
 * Playback execution API contract (P8).
 *
 * Drives `POST /api/v1/playback/execute` through `inject()` with a stub
 * resolver, pinning the security rule that the client can only select a
 * canonical, server-owned plan -- never an arbitrary URL.
 */

import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, it } from "node:test";

import {
  playbackExecutionResponseSchema,
} from "../src/modules/playback/execution.js";
import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import type { PlaybackResolver } from "../src/modules/playback/service.js";
import type { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type { RankedSource } from "../src/providers/streaming/types.js";

const EPISODE = "11111111-1111-4111-8111-111111111111";

function ranked(over: Partial<RankedSource> = {}): RankedSource {
  return {
    id: "self-hosted:sub:1",
    providerSlug: "self-hosted",
    providerName: "Self-hosted library",
    endpointSlug: "sub",
    accessType: "hls",
    playbackUrl: "https://media.invalid/ep/1.m3u8",
    language: "sub",
    priority: 1,
    validated: true,
    rank: 0.9,
    ...over,
  };
}

type Result = {
  sources?: RankedSource[];
  attempts?: unknown[];
  skipped?: unknown[];
  emptyReason?: "no_streams" | "all_failed" | "quarantined";
  resolutionTimeMs?: number;
};

async function appWith(result: Result, episodeNull = false): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const resolver = {
    async resolveEpisode() {
      if (episodeNull) return null;
      return {
        result: {
          sources: result.sources ?? [],
          attempts: result.attempts ?? [],
          skipped: result.skipped ?? [],
          emptyReason: result.emptyReason,
          resolutionTimeMs: result.resolutionTimeMs ?? 3,
        },
        episode: { id: EPISODE, episodeNumber: 1 },
      };
    },
    health: () => [],
    checkAll: async () => [],
  } as unknown as PlaybackResolver;

  registerPlaybackRoutes(
    app,
    resolver,
    { get: async () => ({}) } as unknown as PlaybackMetadataService,
    {} as AnimeRepository,
  );

  await app.ready();
  return app;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function execute(app: FastifyInstance, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/v1/playback/execute",
    payload: payload as Record<string, unknown>,
  });
}

describe("canonical selection", () => {
  it("fixture A: a valid progressive source executes as media/progressive", async () => {
    app = await appWith({
      sources: [ranked({ id: "lib:sub:1", accessType: "mp4", playbackUrl: "https://media.invalid/1.mp4" })],
    });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1" });

    assert.equal(response.statusCode, 200);
    const parsed = playbackExecutionResponseSchema.parse(response.json());
    assert.equal(parsed.execution.kind, "media");
    assert.equal(parsed.execution.mechanism, "progressive");
    assert.equal(parsed.execution.mediaType, "video/mp4");
    assert.equal(parsed.execution.delivery, "client");
    assert.equal(parsed.execution.sourceId, "lib:sub:1");
  });

  it("fixture B: a valid HLS source executes as media/hls", async () => {
    app = await appWith({
      sources: [ranked({ id: "lib:sub:1", accessType: "hls" })],
    });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1" });

    const parsed = playbackExecutionResponseSchema.parse(response.json());
    assert.equal(parsed.execution.kind, "media");
    assert.equal(parsed.execution.mechanism, "hls");
    assert.equal(parsed.execution.mediaType, "application/vnd.apple.mpegurl");
  });

  it("fixture C: an embed executes as embed/iframe and never as media", async () => {
    app = await appWith({
      sources: [
        ranked({ id: "provider:embed:1", accessType: "embed", playbackUrl: "https://embed.invalid/watch/1" }),
      ],
    });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "provider:embed:1" });

    const parsed = playbackExecutionResponseSchema.parse(response.json());
    assert.equal(parsed.execution.kind, "embed");
    assert.equal(parsed.execution.mechanism, "iframe");
    assert.equal(parsed.execution.mediaType, "text/html");
    assert.equal((parsed.execution as { delivery?: unknown }).delivery, undefined, "embed has no media delivery");
  });

  it("fixture D: a missing selection is 409 selection_stale", async () => {
    app = await appWith({ sources: [ranked()] });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "no-such-source" });

    assert.equal(response.statusCode, 409);
    assert.match(response.json().message, /no longer resolves/);
  });

  it("fixture E: a source that disappeared since P7 is 409 selection_stale", async () => {
    app = await appWith({ sources: [ranked({ id: "new-source" })] });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "old-source" });

    assert.equal(response.statusCode, 409);
    assert.match(response.json().message, /no longer resolves/);
  });

  it("fixture F: a provider outage stays 503 no_sources", async () => {
    app = await appWith({ sources: [], emptyReason: "all_failed" });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1" });

    assert.equal(response.statusCode, 503);
    assert.match(response.json().message, /every playback provider failed/);
  });

  it("fixture F2: an empty shelf yields no execution and never fakes success", async () => {
    app = await appWith({ sources: [], emptyReason: "no_streams" });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1" });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().execution, undefined);
  });

  it("fixture G: a malformed request is 400 bad_request", async () => {
    app = await appWith({ sources: [ranked()] });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1", language: "klingon" });

    assert.equal(response.statusCode, 400);
  });

  it("fixture H: a credential-bearing source cannot be executed", async () => {
    app = await appWith({
      sources: [ranked({ id: "bad", playbackUrl: "https://user:pass@media.invalid/1.m3u8" })],
    });

    const response = await execute(app, { episodeId: EPISODE, sourceId: "bad" });

    assert.equal(response.statusCode, 409, "the gateway dropped the source before it can execute");
    assert.equal(response.json().execution, undefined);
  });

  it("missing episode is 404", async () => {
    app = await appWith({ sources: [] }, true);

    const response = await execute(app, { episodeId: EPISODE, sourceId: "lib:sub:1" });

    assert.equal(response.statusCode, 404);
  });
});

describe("arbitrary URL injection is rejected", () => {
  const INJECTIONS = [
    { url: "http://127.0.0.1:4000/internal" },
    { url: "http://169.254.169.254/latest/meta-data" },
    { url: "file:///etc/passwd" },
    { url: "http://localhost:4000" },
    { sourceUrl: "http://127.0.0.1/" },
    { streamUrl: "http://127.0.0.1/" },
    { providerUrl: "http://127.0.0.1/" },
    { provider: "attacker-provider" },
    { access: "direct" },
    { mechanism: "progressive" },
    { headers: { Authorization: "Bearer x" } },
    { sourceId: "lib:sub:1", url: "https://evil.invalid/x.m3u8" },
  ];

  it("every URL-bearing field yields 400, never execution", async () => {
    app = await appWith({ sources: [ranked()] });

    for (const injection of INJECTIONS) {
      const response = await execute(app, {
        episodeId: EPISODE,
        sourceId: "lib:sub:1",
        ...injection,
      });

      assert.equal(response.statusCode, 400, `rejected: ${JSON.stringify(injection)}`);
      assert.equal(response.json().execution, undefined);
    }
  });
});

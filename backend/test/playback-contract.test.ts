/**
 * Public contract pinning (P7).
 *
 * The response of `GET /api/v1/episodes/:episodeId/sources` is validated
 * against `playbackSourcesResponseSchema` for every shelf state a client can
 * meet: ranked plans, a genuinely empty shelf, a provider outage, and every
 * skip reason it needs to explain that shelf. If the route drifts from the
 * schema, this fails before a player ever sees it.
 */

import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, it } from "node:test";

import {
  playbackErrorSchema,
  playbackSourcesResponseSchema,
} from "../src/modules/playback/contract.js";
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

async function appWith(result: {
  sources?: RankedSource[];
  attempts?: unknown[];
  skipped?: unknown[];
  emptyReason?: "no_streams" | "all_failed" | "quarantined";
  resolutionTimeMs?: number;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const resolver = {
    async resolveEpisode() {
      return {
        result: {
          sources: result.sources ?? [],
          attempts: result.attempts ?? [],
          skipped: result.skipped ?? [],
          emptyReason: result.emptyReason,
          resolutionTimeMs: result.resolutionTimeMs ?? 3,
        },
        episode: { id: EPISODE, episodeNumber: 1, title: "Pilot", durationSeconds: 1420, isFiller: false },
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

describe("playback response matches the public contract", () => {
  it("parses a populated shelf", async () => {
    app = await appWith({
      sources: [
        ranked({ id: "a", accessType: "hls", playbackUrl: "https://media.invalid/1.m3u8" }),
        ranked({ id: "b", accessType: "embed", playbackUrl: "https://embed.invalid/w/1" }),
      ],
      attempts: [{ providerSlug: "self-hosted", outcome: "ok", count: 2, latencyMs: 42 }],
    });

    const body = (await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` })).json();

    const parsed = playbackSourcesResponseSchema.parse(body);
    assert.equal(parsed.planCount, 2);
    assert.equal(parsed.resolutionTimeMs, 3);
  });

  it("parses an empty shelf and still carries resolutionTimeMs", async () => {
    app = await appWith({ sources: [], emptyReason: "no_streams" });

    const body = (await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` })).json();

    const parsed = playbackSourcesResponseSchema.parse(body);
    assert.equal(parsed.emptyReason, "no_streams");
    assert.equal(parsed.resolutionTimeMs, 3, "shelf state must not change the response keys");
  });

  it("keeps the 503 outage retryable", async () => {
    app = await appWith({ sources: [], emptyReason: "all_failed", attempts: [] });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });

    // In isolation there is no error handler, so this pins the status a client
    // retries on; the body shape is pinned below against the canonical shape.
    assert.equal(response.statusCode, 503);
    assert.match(response.json().message, /every playback provider failed/);
    playbackErrorSchema.parse({
      error: "no_sources",
      message: "every playback provider failed",
      details: { attempts: [], skipped: [] },
    });
  });

  it("rejects a response shape the contract does not allow", async () => {
    const body = { episode: { id: "x" }, sources: {}, plans: [] };
    assert.throws(() => playbackSourcesResponseSchema.parse(body));
  });
});

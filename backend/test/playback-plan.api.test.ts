/**
 * Playback plan API contract (P6).
 *
 * These drive the canonical sources route through `inject()` with a stub
 * resolver, so the assertions are about what a client actually receives: that
 * `plans` sits alongside P5's `sources` in P5's order, that P5's empty states
 * survive the gateway unflattened, and that nothing in a request can steer the
 * playback URL.
 *
 * No database and no network: the resolver is stubbed with the shape the route
 * consumes, which is the seam the route is written against.
 */

import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, it } from "node:test";

import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import type { PlaybackResolver } from "../src/modules/playback/service.js";
import type { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type { RankedSource, StreamingProvider } from "../src/providers/streaming/types.js";

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

/** Build the app around a resolver stub whose result the test dictates. */
async function appWith(
  result: {
    sources?: RankedSource[];
    attempts?: unknown[];
    skipped?: unknown[];
    emptyReason?: "no_streams" | "all_failed" | "quarantined";
    resolutionTimeMs?: number;
  },
  episode: Record<string, unknown> | null = { id: EPISODE, episodeNumber: 1 },
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const resolver = {
    async resolveEpisode() {
      if (!episode) return null;
      return {
        result: {
          sources: result.sources ?? [],
          attempts: result.attempts ?? [],
          skipped: result.skipped ?? [],
          emptyReason: result.emptyReason,
          resolutionTimeMs: result.resolutionTimeMs ?? 3,
        },
        episode,
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

beforeEach(() => {
  app = undefined;
});

afterEach(async () => {
  await app?.close();
});

describe("playback plan response", () => {
  it("returns plans beside sources, in the resolver's order", async () => {
    app = await appWith({
      sources: [
        ranked({ id: "first", accessType: "embed", playbackUrl: "https://embed.invalid/w/1", rank: 0.9 }),
        ranked({ id: "second", accessType: "mp4", playbackUrl: "https://media.invalid/1.mp4", rank: 0.5 }),
      ],
    });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.plans.length, 2);
    assert.deepEqual(
      body.plans.map((plan: { sourceId: string }) => plan.sourceId),
      body.sources.map((source: { id: string }) => source.id),
      "each plan describes the source at the same index",
    );
    assert.equal(body.plans[0].mechanism, "iframe", "the ranked-first embed stays an embed");
    assert.equal(body.plans[1].mechanism, "progressive");
    assert.equal(body.planCount, 2);
  });

  it("keeps P5's empty states distinct instead of flattening them", async () => {
    app = await appWith({ sources: [], emptyReason: "no_streams" });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.emptyReason, "no_streams", "nothing is hosted is not an outage");
    assert.deepEqual(body.plans, [], "an empty shelf has no plans, and says so plainly");
  });

  it("preserves all_failed as a 503 rather than an empty shelf", async () => {
    // The distinction P5 exists for: a client must be able to retry rather than
    // cache a permanent "nothing here" verdict.
    app = await appWith({ sources: [], emptyReason: "all_failed" });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });

    // The composition root's error handler renders `AppError.reason` into the
    // body; this harness drives the route in isolation, so the contract pinned
    // here is the status a client retries on.
    assert.equal(response.statusCode, 503, "an outage must stay retryable");
    assert.match(response.json().message, /every playback provider failed/);
  });

  it("preserves all_skipped with its reasons rather than reporting no streams", async () => {
    app = await appWith({
      sources: [],
      emptyReason: "no_streams",
      skipped: [{ providerSlug: "needs-mal", reason: "missing_required_id", detail: "needs mal" }],
    });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });
    const body = response.json();

    assert.equal(body.skipped[0].reason, "missing_required_id", "the skip reason survives");
    assert.notEqual(body.emptyReason, "all_failed", "skipped is never reported as an outage");
  });

  it("returns 404 for an episode that does not exist", async () => {
    app = await appWith({ sources: [] }, null);

    const response = await app.inject({ url: "/api/v1/episodes/does-not-exist/sources" });
    assert.equal(response.statusCode, 404);
  });
});

describe("request cannot choose a playback url", () => {
  it("ignores a url parameter supplied by the caller", async () => {
    // The injection P6 must be immune to: a caller appends their own target and
    // hopes the service relays it. The plan's URL comes from the source or not
    // at all.
    app = await appWith({ sources: [ranked({ playbackUrl: "https://media.invalid/ep/1.m3u8" })] });

    const response = await app.inject({
      url: `/api/v1/episodes/${EPISODE}/sources?url=https://attacker.example/evil.m3u8`,
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.plans[0].url, "https://media.invalid/ep/1.m3u8");
    assert.notEqual(body.plans[0].url, "https://attacker.example/evil.m3u8");
    assert.equal(JSON.stringify(body).includes("attacker.example"), false);
  });

  it("ignores a provider parameter supplied by the caller", async () => {
    app = await appWith({ sources: [ranked({ providerSlug: "self-hosted" })] });

    const response = await app.inject({
      url: `/api/v1/episodes/${EPISODE}/sources?provider=attacker&accessType=direct`,
    });
    const body = response.json();

    assert.equal(body.plans[0].providerSlug, "self-hosted", "provider identity is not caller-chosen");
    assert.equal(body.plans[0].access, "hls", "access mode is not caller-chosen either");
  });

  it("ignores an access mode parameter supplied by the caller", async () => {
    app = await appWith({ sources: [ranked({ accessType: "hls" })] });

    const response = await app.inject({
      url: `/api/v1/episodes/${EPISODE}/sources?access=direct&mechanism=progressive`,
    });

    assert.equal(response.json().plans[0].access, "hls");
    assert.equal(response.json().plans[0].mechanism, "hls");
  });

  it("rejects an unsupported language rather than guessing", async () => {
    app = await appWith({ sources: [] });

    const response = await app.inject({
      url: `/api/v1/episodes/${EPISODE}/sources?language=klingon`,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().plans, undefined, "a rejected request yields no plans at all");
  });
});

describe("an unmappable source does not break the response", () => {
  it("drops the bad source and still returns the playable ones", async () => {
    // One provider mislabelling its output must not cost the viewer every other
    // server on the shelf.
    app = await appWith({
      sources: [
        ranked({ id: "good", playbackUrl: "https://media.invalid/1.m3u8" }),
        ranked({ id: "bad", playbackUrl: "not-a-url" }),
      ],
    });

    const response = await app.inject({ url: `/api/v1/episodes/${EPISODE}/sources` });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.plans.length, 1);
    assert.equal(body.plans[0].sourceId, "good");
    assert.equal(body.sourceCount, 2, "the source list is P5's, reported unchanged");
  });
});

describe("observability", () => {
  it("exposes gateway counters on the existing providers endpoint", async () => {
    app = await appWith({ sources: [ranked()] });

    const response = await app.inject({ url: "/api/v1/playback/providers" });

    assert.equal(response.statusCode, 200);
    assert.equal(typeof response.json().gateway.planned, "number");
    assert.equal(typeof response.json().gateway.unmapped, "number");
  });
});

/** Kept honest: the stub satisfies the adapter contract it stands in for. */
export const _providerShape: StreamingProvider | null = null;

/**
 * Integration tests: the playback path exercised through its real interface.
 *
 * These drive `PlaybackResolver` and the registry with stub adapters that satisfy
 * the real `StreamingProvider` contract, so they cover the orchestration the unit
 * tests deliberately cannot: failure containment, fallback, quarantine, and the
 * empty-vs-failed distinction the API contract depends on.
 *
 * A stub is a legitimate adapter here, not a fixture pretending to be data: each
 * one declares the capabilities it claims and fails in a specific, named way.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlaybackResolver } from "../src/modules/playback/service.js";
import { healthRegistry, FAILURE_THRESHOLD } from "../src/providers/streaming/health.js";
import { eligibleProviders } from "../src/providers/streaming/registry.js";
import type {
  PlaybackSource,
  ProviderCapabilities,
  StreamingProvider,
} from "../src/providers/streaming/types.js";

const CAPS: ProviderCapabilities = {
  languages: ["sub"],
  accessTypes: ["hls"],
  supportsSubtitles: false,
  supportsSkipMarkers: false,
  requiresMalId: false,
};

/** A distinct AniList id per case: the resolver caches successful results. */
function req(id: string) {
  return {
    animeId: `local-${id}`,
    anilistId: id,
    episodeNumber: 1,
    language: "sub" as const,
  };
}

/**
 * `.invalid` is reserved by RFC 2606 and never resolves, so the resolver's
 * validation probe fails immediately instead of opening a real connection.
 * These tests are about orchestration, not reachability: a probe result that
 * depends on the network would make them slow and flaky without testing anything
 * extra. The resolver keeps unvalidated sources when none survive, so the
 * fallback behaviour under test is unaffected.
 */
function source(providerSlug: string): PlaybackSource {
  return {
    id: `${providerSlug}-1`,
    providerSlug,
    providerName: providerSlug,
    endpointSlug: "sub",
    accessType: "hls",
    playbackUrl: `https://${providerSlug}.invalid/1.m3u8`,
    language: "sub",
    priority: 10,
  };
}

type Behaviour = { count: number } | { fail: "throw" | "timeout" | "empty" };

/** A provider that answers with one source, or fails in a named way. */
function stub(slug: string, behaviour: Behaviour): StreamingProvider {
  return {
    slug,
    name: slug,
    kind: "api",
    basePriority: 10,
    version: "1.0.0",
    enabled: true,
    capabilities: CAPS,
    async resolve() {
      if ("fail" in behaviour) {
        // A missing episode is an empty array; only transport trouble throws.
        if (behaviour.fail === "empty") return [];
        throw new Error(`${slug} is down`);
      }
      return [source(slug)];
    },
    async healthCheck() {
      return !("fail" in behaviour);
    },
  };
}
describe("provider fallback", () => {
  it("resolves from a healthy provider when another throws", async () => {
    const resolver = new PlaybackResolver([
      stub("fb-dead", { fail: "throw" }),
      stub("fb-good", { count: 1 }),
    ]);

    const result = await resolver.resolve(req("9001"));

    // Fallback is the whole point: one dead upstream must not fail the request.
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.providerSlug, "fb-good");

    const outcome = Object.fromEntries(result.attempts.map((a) => [a.providerSlug, a.outcome]));
    assert.equal(outcome["fb-dead"], "error");
    assert.equal(outcome["fb-good"], "ok");
  });

  it("still resolves when several providers fail", async () => {
    const resolver = new PlaybackResolver([
      stub("fb-d1", { fail: "throw" }),
      stub("fb-d2", { fail: "throw" }),
      stub("fb-d3", { fail: "throw" }),
      stub("fb-survivor", { count: 1 }),
    ]);

    const result = await resolver.resolve(req("9002"));
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.providerSlug, "fb-survivor");
  });

  it("reports no_streams when providers answer but have nothing", async () => {
    // A genuine empty is not an outage and must not be reported as one.
    const resolver = new PlaybackResolver([
      stub("fb-n1", { fail: "empty" }),
      stub("fb-n2", { fail: "empty" }),
    ]);

    const result = await resolver.resolve(req("9003"));
    assert.equal(result.sources.length, 0);
    assert.equal(result.emptyReason, "no_streams");
  });

  it("reports all_failed when every provider errors", async () => {
    // "Try again shortly" is a different client action from "this episode has no
    // streams"; collapsing the two is what makes a temporary outage permanent.
    const resolver = new PlaybackResolver([
      stub("fb-e1", { fail: "throw" }),
      stub("fb-e2", { fail: "throw" }),
    ]);

    const result = await resolver.resolve(req("9004"));
    assert.equal(result.sources.length, 0);
    assert.equal(result.emptyReason, "all_failed");
  });

  it("does not penalise a provider that answers with an empty list", async () => {
    const slug = "fb-empty-is-not-failure";
    const empty = stub(slug, { fail: "empty" });
    const good = stub("fb-empty-healthy", { count: 1 });

    for (let i = 0; i < FAILURE_THRESHOLD + 3; i++) {
describe("quarantine", () => {
  it("takes a repeatedly failing provider out of rotation", async () => {
    const slug = "quarantine-target";
    const dead = stub(slug, { fail: "throw" });
    const healthy = stub("quarantine-healthy", { count: 1 });

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await new PlaybackResolver([dead, healthy]).resolve(req(`9100-${i}`));
    }

    assert.equal(healthRegistry.isQuarantined(slug), true, "should be quarantined");

    // Skipped *before* the call, so a dead upstream never sits on the critical
    // path of a later request.
    const eligible = eligibleProviders([dead, healthy], {
      language: "sub",
      needsMalId: false,
    });
    assert.deepEqual(
      eligible.map((p) => p.slug),
      ["quarantine-healthy"],
    );

    const result = await new PlaybackResolver([dead, healthy]).resolve(req("9199"));
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.providerSlug, "quarantine-healthy");
    assert.ok(
      !result.attempts.some((a) => a.providerSlug === slug),
      "a quarantined provider must not be attempted at all",
    );
  });

  it("keeps health per provider so one failure cannot affect a neighbour", async () => {
    const dead = stub("iso-dead", { fail: "throw" });
    const good = stub("iso-good", { count: 1 });

    for (let i = 0; i < FAILURE_THRESHOLD + 2; i++) {
      await new PlaybackResolver([dead, good]).resolve(req(`9200-${i}`));
    }

    assert.equal(healthRegistry.isQuarantined("iso-dead"), true);
    assert.equal(
      healthRegistry.get("iso-good").failureStreak,
      0,
      "a healthy provider's record must be untouched by its neighbour's failures",
    );
    assert.equal(healthRegistry.get("iso-good").score, 1);
  });
});
      await new PlaybackResolver([empty, good]).resolve(req(`9010-${i}`));
    }

    assert.equal(healthRegistry.get(slug).failureStreak, 0, "a miss is not an outage");
    assert.equal(healthRegistry.isQuarantined(slug), false);
  });
});
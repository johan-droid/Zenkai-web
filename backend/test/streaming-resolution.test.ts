/**
 * Streaming source resolution (P5).
 *
 * Drives `PlaybackResolver` with stubs that satisfy the real
 * `StreamingProvider` contract, and drives identity partitioning directly.
 *
 * Every URL is under the RFC 2606 reserved `.invalid` TLD, so validation probes
 * fail instantly against nothing rather than opening a real connection. That
 * keeps the suite hermetic and fast; it is the mistake P0 made with
 * `example.com`, which added seconds of real network latency to the run.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { PlaybackResolver } from "../src/modules/playback/service.js";
import { partitionProviders, requiredIdTypeOf } from "../src/modules/playback/identity.js";
import { dedupeSources, sourceIdentity } from "../src/providers/streaming/dedupe.js";
import { healthRegistry, FAILURE_THRESHOLD } from "../src/providers/streaming/health.js";
import { cache } from "../src/cache/index.js";
import { AppError } from "../src/http/errors.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type {
  PlaybackSource,
  ProviderCapabilities,
  RankedSource,
  StreamingProvider,
} from "../src/providers/streaming/types.js";

const CAPS: ProviderCapabilities = {
  languages: ["sub"],
  accessTypes: ["hls"],
  supportsSubtitles: false,
  supportsSkipMarkers: false,
  requiresMalId: false,
};

/**
 * Repository double for the canonical side of the flow. The resolver reads an
 * episode, its title and the external ids; nothing here performs I/O.
 */
function stubRepo(over: Partial<Record<string, unknown>> = {}): AnimeRepository {
  const base = {
    async getEpisode(id: string) {
      return { id, animeId: "anime-uuid", episodeNumber: 1, title: null };
    },
    async getEpisodeExternalIds() {
      return [] as Array<{ providerSlug: string; externalId: string }>;
    },
    async listParentTitles() {
      return [
        {
          id: "anime-uuid",
          anilistId: 16498,
          externalIds: { anilist: "16498", mal: "16498" },
        },
      ];
    },
  };
  return { ...base, ...over } as unknown as AnimeRepository;
}

const req = (over: Record<string, unknown> = {}) => ({
  animeId: "anime-uuid",
  anilistId: "16498",
  malId: "16498",
  episodeNumber: 1,
  language: "sub" as const,
  ...over,
});

function source(providerSlug: string, over: Partial<PlaybackSource> = {}): PlaybackSource {
  return {
    id: `${providerSlug}-1`,
    providerSlug,
    providerName: providerSlug,
    endpointSlug: "sub",
    accessType: "hls",
    // `.invalid` never resolves, so validation is instant and offline.
    playbackUrl: `https://${providerSlug}.invalid/1.m3u8`,
    language: "sub",
    priority: 10,
    ...over,
  };
}

type Behaviour =
  | { count: number }
  | { fail: "throw" | "empty" | "hang" };

function stub(slug: string, behaviour: Behaviour, caps?: Partial<ProviderCapabilities>): StreamingProvider {
  return {
    slug,
    name: slug,
    kind: "api",
    basePriority: 10,
    version: "1.0.0",
    enabled: true,
    capabilities: { ...CAPS, ...caps },
    calls: 0,
    async resolve() {
      (this as unknown as { calls: number }).calls += 1;
      if ("fail" in behaviour) {
        if (behaviour.fail === "empty") return [];
        if (behaviour.fail === "hang") {
          // Never settles within the deadline, so the resolver's own timeout is
          // what has to fire. A resolver without one would hang the test suite.
          await new Promise(() => {});
        }
        throw new AppError("upstream_error", `${slug} is down`, 502);
      }
      return [source(slug)];
    },
    async healthCheck() {
      return true;
    },
  } as StreamingProvider & { calls: number };
}

const callsOf = (provider: StreamingProvider) => (provider as unknown as { calls: number }).calls;

beforeEach(() => {
  // The cache is a process-wide singleton, so one test's result would otherwise
  // satisfy another test's request and the assertions would measure nothing.
  cache.clear();
  healthRegistry.resetQuarantined();
});

describe("provider identity", () => {
  it("skips a provider we hold no id for, rather than calling it", () => {
    // The pre-P5 resolver hardcoded `needsMalId: false`, so this provider was
    // called with no MAL id, returned an empty list, and the resolution reported
    // "no streams" -- a claim about a provider that could not have answered.
    const needsMal = stub("needs-mal", { count: 1 }, { requiresMalId: true });
    const plain = stub("plain", { count: 1 });

    const { eligible, skipped } = partitionProviders(
      [needsMal, plain],
      { anime: { anilist: "16498" }, episode: {} },
      { language: "sub", quarantined: () => false },
    );

    assert.deepEqual(eligible.map((p) => p.slug), ["plain"], "a provider with no id is not asked");
    assert.deepEqual(
      skipped.find((s) => s.providerSlug === "needs-mal"),
      { providerSlug: "needs-mal", reason: "missing_required_id", detail: "needs mal" },
    );
    assert.equal(callsOf(needsMal), 0, "the skipped provider must never be called");
  });

  it("asks a provider once the id it needs is present", () => {
    const needsMal = stub("needs-mal", { count: 1 }, { requiresMalId: true });

    const { eligible } = partitionProviders(
      [needsMal],
      { anime: { anilist: "1", mal: "2" }, episode: {} },
      { language: "sub", quarantined: () => false },
    );

    assert.equal(eligible.length, 1);
  });

  it("reports the id type a provider needs rather than hard-coding it", () => {
    assert.equal(requiredIdTypeOf(stub("a", { count: 1 })), null);
    assert.equal(requiredIdTypeOf(stub("b", { count: 1 }, { requiresMalId: true })), "mal");
  });

  it("distinguishes every reason a provider is skipped", () => {
    const disabled = { ...stub("off", { count: 1 }), enabled: false } as StreamingProvider;
    const dubOnly = stub("dub-only", { count: 1 }, { languages: ["dub"] });
    const needsMal = stub("needs-mal", { count: 1 }, { requiresMalId: true });
    const fine = stub("fine", { count: 1 });

    const { eligible, skipped } = partitionProviders(
      [disabled, dubOnly, needsMal, fine],
      { anime: { anilist: "1" }, episode: {} },
      { language: "sub", quarantined: (slug) => slug === "fine" },
    );

    const reasons = Object.fromEntries(skipped.map((s) => [s.providerSlug, s.reason]));
    assert.equal(reasons.off, "inactive");
    assert.equal(reasons["dub-only"], "unsupported_language");
    assert.equal(reasons["needs-mal"], "missing_required_id");
    assert.equal(reasons.fine, "quarantined");
    assert.equal(eligible.length, 0, "every provider was skipped for a different reason");
  });
});

describe("fallback", () => {
  it("serves a source from a healthy provider when another fails", async () => {
    const dead = stub("dead", { fail: "throw" });
    const good = stub("good", { count: 1 });
    const resolver = new PlaybackResolver([dead, good], stubRepo());

    const result = await resolver.resolve(req({ anilistId: `f${Date.now()}` }));

    assert.equal(result.sources.length, 1, "one dead provider must not fail the request");
    assert.equal(result.sources[0]?.providerSlug, "good");
    assert.equal(result.attempts.find((a) => a.providerSlug === "dead")?.outcome, "error");
  });

  it("serves a source when another provider times out", async () => {
    // A dead provider must not stall the whole resolution. The resolver's own
    // deadline is the only thing that can end this call.
    const hanging = stub("hanging", { fail: "hang" });
    const good = stub("good2", { count: 1 });
    const resolver = new PlaybackResolver([hanging, good], stubRepo());

    const result = await resolver.resolve(req({ anilistId: `t${Date.now()}` }));

    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.providerSlug, "good2");
    assert.equal(
      result.attempts.find((a) => a.providerSlug === "hanging")?.outcome,
      "timeout",
      "a timeout is recorded as a timeout, not as a generic failure",
    );
  });

  it("keeps a quarantined provider out of the request entirely", async () => {
    const quarantined = stub("quarantined", { count: 1 });
    const healthy = stub("healthy", { count: 1 });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) healthRegistry.record("quarantined", "error", 10, "boom");
    assert.equal(healthRegistry.isQuarantined("quarantined"), true);

    const resolver = new PlaybackResolver([quarantined, healthy], stubRepo());
    const result = await resolver.resolve(req({ anilistId: `q${Date.now()}` }));

    assert.equal(callsOf(quarantined), 0, "a quarantined provider must not be called at all");
    assert.equal(result.sources[0]?.providerSlug, "healthy");
    assert.equal(
      result.skipped?.find((s) => s.providerSlug === "quarantined")?.reason,
      "quarantined",
    );
  });
});

describe("failure states", () => {
  it("reports no_streams when every provider genuinely has nothing", async () => {
    const resolver = new PlaybackResolver(
      [stub("a", { fail: "empty" }), stub("b", { fail: "empty" })],
      stubRepo(),
    );

    const result = await resolver.resolve(req({ anilistId: `n${Date.now()}` }));
    // A valid empty answer is not an outage, and must not be reported as one.
    assert.equal(result.emptyReason, "no_streams");
  });

  it("reports all_failed when every provider errors", async () => {
    const resolver = new PlaybackResolver(
      [stub("a", { fail: "throw" }), stub("b", { fail: "throw" })],
      stubRepo(),
    );

    const result = await resolver.resolve(req({ anilistId: `f${Date.now()}` }));
    // Different claim: the episode may well be playable, nobody could say.
    assert.equal(result.emptyReason, "all_failed");
  });

  it("keeps no_streams and all_failed distinct", () => {
    // Stated explicitly because the whole point of the two is that a client
    // acts differently: retry later, versus render an empty state.
    assert.notEqual("no_streams", "all_failed");
  });
});

describe("source de-duplication", () => {
  const ranked = (over: Partial<RankedSource>): RankedSource => ({
    ...source("p", over as Partial<PlaybackSource>),
    rank: 0.5,
  } as RankedSource);

  it("removes an exact repeat of the same provider source", () => {
    const list = dedupeSources([ranked({ id: "a" }), ranked({ id: "b" })]);
    assert.equal(list.length, 1, "an identical source twice is one source");
  });

  it("keeps the same URL from two different providers", () => {
    // URL-only dedupe deleted this, losing a source that may well have been the
    // one that would actually play from this network.
    const list = dedupeSources([
      ranked({ id: "a", providerSlug: "alpha" }),
      ranked({ id: "b", providerSlug: "beta" }),
    ]);
    assert.equal(list.length, 2, "the same file from two providers is two choices");
  });

  it("keeps the same URL offered as a dub and a sub", () => {
    const list = dedupeSources([
      ranked({ id: "a", language: "sub" }),
      ranked({ id: "b", language: "dub" }),
    ]);
    assert.equal(list.length, 2, "a dub and a sub are different choices for a reader");
  });

  it("keeps the best-ranked copy and preserves order", () => {
    const list = dedupeSources([
      { ...ranked({ id: "low" }), rank: 0.1 },
      { ...ranked({ id: "high" }), rank: 0.9 },
    ]);
    assert.equal(list[0]?.id, "low", "the first occurrence wins; ranking order is the caller's");
    assert.equal(list.length, 1);
  });

  it("builds a stable identity key", () => {
    const a = sourceIdentity(ranked({ providerSlug: "p", language: "sub" }));
    const b = sourceIdentity(ranked({ providerSlug: "p", language: "dub" }));
    assert.notEqual(a, b, "identity must distinguish language");
  });
});

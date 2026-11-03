/**
 * Playback recovery policy (P20).
 *
 * These are the regression tests for the production bug: a user watching an
 * episode on one server and being moved to another one mid-playback. Each test
 * pins one rule that made the old behaviour possible, at the level where the
 * decision is actually made (pure policy, no browser).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyPlaybackError,
  computeRetryBackoffMs,
  DEFAULT_RECOVERY_POLICY,
  nextPhase,
  normalisePlaybackError,
  PlaybackRecoverySession,
  restoreTarget,
  selectFallbackPlan,
  validateExecution,
  type ActivePlaybackSession,
  type PlaybackPhase,
} from "../src/lib/player/recovery";
import type {
  PlaybackExecution,
  PlaybackLanguage,
  PlaybackPlan,
  ServerAvailabilityItem,
} from "../src/lib/api/zenkai";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function plan(overrides: Partial<PlaybackPlan> & { sourceId: string }): PlaybackPlan {
  return {
    providerSlug: `provider-${overrides.sourceId}`,
    providerName: `Provider ${overrides.sourceId}`,
    endpointSlug: overrides.sourceId,
    access: "hls",
    mechanism: "hls",
    mediaType: "application/vnd.apple.mpegurl",
    url: `https://cdn.example.com/${overrides.sourceId}.m3u8`,
    delivery: "client",
    language: "sub",
    validated: true,
    playable: true,
    capabilities: { seekable: true, ranged: true },
    ...overrides,
  };
}

function mediaExecution(overrides: Partial<Extract<PlaybackExecution, { kind: "media" }>> = {}): PlaybackExecution {
  return {
    kind: "media",
    mechanism: "hls",
    url: "https://cdn.example.com/a.m3u8",
    mediaType: "application/vnd.apple.mpegurl",
    delivery: "client",
    sourceId: "plan-1",
    providerSlug: "provider-plan-1",
    providerName: "Provider plan-1",
    language: "sub",
    validated: true,
    playable: true,
    capabilities: { seekable: true, ranged: true },
    ...overrides,
  };
}

function server(
  sourceId: string,
  status: ServerAvailabilityItem["status"],
  selectable = true,
): ServerAvailabilityItem {
  return {
    serverId: `server-${sourceId}`,
    sourceId,
    serverName: sourceId,
    displayName: sourceId,
    status,
    statusMessage: status,
    type: "hls",
    selectable,
    sub: true,
    dub: false,
    lastCheckedAt: new Date().toISOString(),
    name: sourceId,
    label: sourceId,
  };
}

/* ------------------------------------------------------------------ */
/* Phase 2 — error classification                                      */
/* ------------------------------------------------------------------ */

describe("playback error classification", () => {
  it("treats a paused/seek abort as a user action, never a provider failure", () => {
    const error = normalisePlaybackError({ message: "The play() request was interrupted", code: 1 });
    assert.equal(error.origin, "media");
    assert.equal(classifyPlaybackError(error), "non_provider");
  });

  it("treats a network media error as transient", () => {
    const error = normalisePlaybackError({ message: "network", code: 2 });
    assert.equal(classifyPlaybackError(error), "transient_network");
  });

  it("treats a decode or unsupported-source error as a fatal provider error", () => {
    assert.equal(classifyPlaybackError(normalisePlaybackError({ code: 3 })), "fatal_provider");
    assert.equal(classifyPlaybackError(normalisePlaybackError({ code: 4 })), "fatal_provider");
  });

  /**
   * The trap: Vidstack reports every hls.js failure as `{ code: 1, error }`.
   * Classifying on `code` alone would call every HLS failure an "abort" and
   * disable failover entirely.
   */
  it("reads hls.js failures from the nested error, not the placeholder code", () => {
    const transient = normalisePlaybackError({
      message: "hls fragment load failed",
      code: 1,
      error: { message: "fragLoadError", details: "fragLoadError" },
    });
    assert.equal(transient.origin, "hls");
    assert.equal(classifyPlaybackError(transient), "transient_network");

    const fatal = normalisePlaybackError({
      message: "bad manifest",
      code: 1,
      error: { message: "manifestParsingError", details: "manifestParsingError" },
    });
    assert.equal(classifyPlaybackError(fatal), "fatal_provider");
  });

  it("treats a buffer stall as recoverable, never as a dead provider", () => {
    const error = normalisePlaybackError({
      message: "stalled",
      error: { message: "bufferStalledError", details: "bufferStalledError" },
    });
    assert.equal(classifyPlaybackError(error), "transient_network");
  });

  it("classifies an unrecognised error as unknown rather than fatal", () => {
    assert.equal(classifyPlaybackError(normalisePlaybackError(undefined)), "unknown");
    assert.equal(
      classifyPlaybackError(normalisePlaybackError({ message: "something odd happened" })),
      "unknown",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Phase 1 — state machine                                             */
/* ------------------------------------------------------------------ */

describe("playback phase machine", () => {
  it("allows the normal discovery path", () => {
    assert.equal(nextPhase("idle", "executing"), "executing");
    assert.equal(nextPhase("executing", "ready"), "ready");
    assert.equal(nextPhase("ready", "playing"), "playing");
    assert.equal(nextPhase("playing", "buffering"), "buffering");
    assert.equal(nextPhase("buffering", "playing"), "playing");
  });

  it("allows recovery without leaving the playing surface", () => {
    assert.equal(nextPhase("playing", "recovering"), "recovering");
    assert.equal(nextPhase("recovering", "playing"), "playing");
    assert.equal(nextPhase("playing", "switching"), "switching");
    assert.equal(nextPhase("switching", "ready"), "ready");
  });

  it("refuses a late response from an old attempt re-entering playback", () => {
    // `failed → playing` would let a stale execution resume a stream the user
    // already left; the only legal way back is through a new execution.
    assert.equal(nextPhase("failed", "playing"), "failed");
    assert.equal(nextPhase("failed", "executing"), "executing");
    assert.equal(nextPhase("idle", "playing"), "idle");
  });

  it("keeps an unknown phase unchanged instead of inventing one", () => {
    assert.equal(nextPhase("ended", "buffering"), "ended");
  });
});

/* ------------------------------------------------------------------ */
/* Phase 4 — execution validation                                      */
/* ------------------------------------------------------------------ */

describe("execution validation", () => {
  it("accepts the execution the backend was asked for", () => {
    assert.deepEqual(
      validateExecution(mediaExecution(), { sourceId: "plan-1", language: "sub" }),
      { ok: true },
    );
  });

  it("rejects an execution for a different source", () => {
    const result = validateExecution(mediaExecution({ sourceId: "plan-2" }), {
      sourceId: "plan-1",
      language: "sub",
    });
    assert.deepEqual(result, { ok: false, reason: "source_mismatch" });
  });

  it("never silently crosses the SUB/DUB boundary", () => {
    const result = validateExecution(mediaExecution({ language: "dub" }), {
      sourceId: "plan-1",
      language: "sub",
    });
    assert.deepEqual(result, { ok: false, reason: "language_mismatch" });
  });

  it("accepts a dual-audio execution for either shelf", () => {
    assert.deepEqual(
      validateExecution(mediaExecution({ language: "multi" }), {
        sourceId: "plan-1",
        language: "dub",
      }),
      { ok: true },
    );
  });

  it("rejects an embed fed to a media mechanism and vice versa", () => {
    const embedAsMedia = mediaExecution({ mechanism: "iframe" as never });
    assert.deepEqual(validateExecution(embedAsMedia, { sourceId: "plan-1", language: "sub" }), {
      ok: false,
      reason: "kind_mismatch",
    });
  });

  it("rejects a non-http URL and a source the backend marked unplayable", () => {
    assert.deepEqual(
      validateExecution(mediaExecution({ url: "file:///etc/passwd" }), {
        sourceId: "plan-1",
        language: "sub",
      }),
      { ok: false, reason: "invalid_url" },
    );
    assert.deepEqual(
      validateExecution(mediaExecution({ playable: false }), {
        sourceId: "plan-1",
        language: "sub",
      }),
      { ok: false, reason: "not_playable" },
    );
  });
});

/* ------------------------------------------------------------------ */
/* Phase 3 — fallback selection                                        */
/* ------------------------------------------------------------------ */

const ranked: PlaybackPlan[] = [
  plan({ sourceId: "plan-1" }),
  plan({ sourceId: "plan-2", providerSlug: "provider-b" }),
  plan({ sourceId: "plan-3", providerSlug: "provider-c" }),
  plan({ sourceId: "plan-4", providerSlug: "provider-d" }),
];

function emptyFailed() {
  return { failedSourceIds: new Set<string>(), failedProviderSlugs: new Set<string>() };
}

describe("fallback selection", () => {
  it("chooses the next ranked plan and never the failed one", () => {
    const next = selectFallbackPlan(ranked, {
      failedSourceId: "plan-1",
      ...emptyFailed(),
      language: "sub",
    });
    assert.equal(next?.sourceId, "plan-2");
  });

  it("skips an already failed source and provider for the whole session", () => {
    const next = selectFallbackPlan(ranked, {
      failedSourceId: "plan-3",
      failedSourceIds: new Set(["plan-1", "plan-2"]),
      failedProviderSlugs: new Set(["provider-plan-1"]),
      language: "sub",
    });
    assert.equal(next?.sourceId, "plan-4");
  });

  it("refuses a candidate for the wrong audio shelf", () => {
    const dubOnly = [plan({ sourceId: "a" }), plan({ sourceId: "b", language: "dub" })];
    const next = selectFallbackPlan(dubOnly, {
      failedSourceId: "a",
      ...emptyFailed(),
      language: "sub",
    });
    assert.equal(next, null);
  });

  it("refuses unvalidated and unplayable candidates", () => {
    const broken = [
      plan({ sourceId: "a" }),
      plan({ sourceId: "b", validated: false }),
      plan({ sourceId: "c", playable: false }),
    ];
    const next = selectFallbackPlan(broken, {
      failedSourceId: "a",
      ...emptyFailed(),
      language: "sub",
    });
    assert.equal(next, null);
  });

  it("refuses a server the backend reports as unavailable", () => {
    const next = selectFallbackPlan(ranked, {
      failedSourceId: "plan-1",
      ...emptyFailed(),
      language: "sub",
      servers: [server("plan-2", "UNAVAILABLE", false), server("plan-3", "AVAILABLE")],
    });
    assert.equal(next?.sourceId, "plan-3");
  });

  it("does not let a re-ranked list re-offer a source that already failed", () => {
    // The old positional walk (`plans[index + 1]`) restarted from whatever the
    // refetched list looked like, which is how the same dead provider got
    // selected twice. Session memory is what makes that impossible.
    const session = new PlaybackRecoverySession();
    session.noteFailure("plan-1", "provider-plan-1", "fatal_provider");

    const reranked = [plan({ sourceId: "plan-2" }), plan({ sourceId: "plan-1" }), plan({ sourceId: "plan-3" })];
    const next = selectFallbackPlan(reranked, {
      failedSourceId: "plan-1",
      failedSourceIds: session.failedSourceIds,
      failedProviderSlugs: session.failedProviderSlugs,
      language: "sub",
    });
    assert.equal(next?.sourceId, "plan-2");
  });

  it("returns null when every candidate is exhausted", () => {
    const next = selectFallbackPlan(ranked, {
      ...emptyFailed(),
      failedSourceId: "plan-4",
      failedSourceIds: new Set(["plan-1", "plan-2", "plan-3"]),
      language: "sub",
    });
    assert.equal(next, null);
  });
});

/* ------------------------------------------------------------------ */
/* Phase 3 — bounded recovery session                                  */
/* ------------------------------------------------------------------ */

describe("recovery session budget", () => {
  it("allows exactly one in-place recovery per source", () => {
    const session = new PlaybackRecoverySession();
    session.beginSource("plan-1");
    assert.equal(session.canRecoverInPlace(), true);
    session.noteInPlaceRecovery();
    assert.equal(session.canRecoverInPlace(), false);
  });

  it("gives the retry budget back to a genuinely new source", () => {
    const session = new PlaybackRecoverySession();
    session.beginSource("plan-1");
    session.noteInPlaceRecovery();
    session.beginSource("plan-2");
    assert.equal(session.canRecoverInPlace(), true);
  });

  it("caps provider attempts at the policy limit", () => {
    const session = new PlaybackRecoverySession({ ...DEFAULT_RECOVERY_POLICY, maxProviderAttempts: 3 });
    session.beginSource("plan-1");
    assert.equal(session.canAttemptAnotherProvider(), true);
    session.beginSource("plan-2");
    assert.equal(session.canAttemptAnotherProvider(), true);
    session.beginSource("plan-3");
    assert.equal(session.canAttemptAnotherProvider(), false, "three attempts is the ceiling");
  });

  it("records why every source failed, and forgets nothing until reset", () => {
    const session = new PlaybackRecoverySession();
    session.noteFailure("plan-1", "provider-a", "transient_network");
    session.noteFailure("plan-2", "provider-b", "fatal_provider");
    assert.deepEqual([...session.failedSourceIds], ["plan-1", "plan-2"]);
    assert.deepEqual([...session.failedProviderSlugs], ["provider-a", "provider-b"]);
    assert.deepEqual(session.reasons, ["transient_network", "fatal_provider"]);

    session.reset();
    assert.equal(session.failedSourceIds.size, 0);
    assert.equal(session.reasons.length, 0);
  });

  /**
   * The end-to-end shape of the production bug, reduced to policy: one network
   * blip must not move the user to another server.
   */
  it("recovers a single transient failure in place instead of switching", () => {
    const session = new PlaybackRecoverySession();
    session.beginSource("plan-1");

    const first = classifyPlaybackError(
      normalisePlaybackError({ error: { message: "fragLoadError" } }),
    );
    assert.equal(first, "transient_network");
    assert.equal(session.canRecoverInPlace(), true);
    session.noteInPlaceRecovery();

    // Nothing failed, so no provider may be excluded from ranking.
    assert.equal(session.failedSourceIds.size, 0);
    assert.equal(session.failedProviderSlugs.size, 0);

    // The retry itself failed: now — and only now — a failover is allowed.
    const second = classifyPlaybackError(
      normalisePlaybackError({ error: { message: "fragLoadError" } }),
    );
    assert.equal(second, "transient_network");
    assert.equal(session.canRecoverInPlace(), false, "in-place budget is spent");
  });
});

/* ------------------------------------------------------------------ */
/* Phase 5 — continuity                                                */
/* ------------------------------------------------------------------ */

describe("position restoration", () => {
  it("restores a mid-episode position", () => {
    assert.equal(
      restoreTarget({ positionSeconds: 640, durationSeconds: 1440 }, { seekable: true }),
      640,
    );
  });

  it("never seeks past the replacement's duration", () => {
    assert.equal(
      restoreTarget({ positionSeconds: 1200, durationSeconds: 1440 }, { durationSeconds: 600 }),
      null,
    );
  });

  it("never restores into the last ten seconds", () => {
    assert.equal(
      restoreTarget({ positionSeconds: 1435, durationSeconds: 1440 }, {}),
      null,
    );
  });

  it("does not seek a source that cannot seek", () => {
    assert.equal(
      restoreTarget({ positionSeconds: 300, durationSeconds: 1440 }, { seekable: false }),
      null,
    );
  });

  it("ignores a meaningless position", () => {
    assert.equal(restoreTarget({ positionSeconds: 0, durationSeconds: 0 }, {}), null);
  });
});

/* ------------------------------------------------------------------ */
/* Language identity is preserved end to end                           */
/* ------------------------------------------------------------------ */

describe("language identity", () => {
  const languages: PlaybackLanguage[] = ["sub", "dub"];
  for (const language of languages) {
    it(`only ever selects ${language} or dual-audio sources for a ${language} request`, () => {
      const candidates = [
        plan({ sourceId: "a" }),
        plan({ sourceId: "b", language: "multi" }),
        plan({ sourceId: "c", language: language === "sub" ? "dub" : "sub" }),
      ];
      const next = selectFallbackPlan(candidates, {
        failedSourceId: "a",
        ...emptyFailed(),
        language,
      });
      assert.ok(next !== null);
      assert.notEqual(next.language, language === "sub" ? "dub" : "sub");
    });
  }
});

/* A guard so the union cannot silently lose a phase the UI relies on. */
describe("phase coverage", () => {
  it("covers every state in the machine", () => {
    const phases: PlaybackPhase[] = [
      "idle",
      "discovering",
      "executing",
      "ready",
      "playing",
      "buffering",
      "recovering",
      "switching",
      "switching_source",
      "failed",
      "ended",
    ];
    for (const phase of phases) {
      assert.equal(typeof nextPhase(phase, phase), "string");
    }
  });

  it("handles switching_source legal transitions", () => {
    assert.equal(nextPhase("playing", "switching_source"), "switching_source");
    assert.equal(nextPhase("switching_source", "ready"), "ready");
    assert.equal(nextPhase("switching_source", "failed"), "failed");
  });
});

/* ------------------------------------------------------------------ */
/* Phase 2 & 3 — advanced error classification & budget replenishment  */
/* ------------------------------------------------------------------ */

describe("HTTP status and advanced error classification", () => {
  it("treats HTTP 403 Forbidden as fatal_provider (expired URL)", () => {
    const err = normalisePlaybackError({
      detail: { status: 403, message: "Forbidden" },
    });
    assert.equal(err.httpStatus, 403);
    assert.equal(classifyPlaybackError(err), "fatal_provider");
  });

  it("treats HTTP 404 Not Found as fatal_provider (missing stream)", () => {
    const err = normalisePlaybackError({
      detail: {
        error: {
          response: { code: 404 },
          message: "fragLoadError",
        },
      },
    });
    assert.equal(err.httpStatus, 404);
    assert.equal(classifyPlaybackError(err), "fatal_provider");
  });

  it("treats HTTP 502/503/504 as transient_network", () => {
    for (const status of [500, 502, 503, 504]) {
      const err = normalisePlaybackError({ detail: { httpStatus: status, message: "Server Error" } });
      assert.equal(classifyPlaybackError(err), "transient_network");
    }
  });

  it("replenishes in-place recovery budget after sustained playback", () => {
    const session = new PlaybackRecoverySession();
    session.beginSource("plan-1");
    assert.equal(session.canRecoverInPlace(), true);

    // Spends in-place recovery
    session.noteInPlaceRecovery();
    assert.equal(session.canRecoverInPlace(), false);

    // Sustained playback for >5 seconds restores budget
    session.noteSuccessfulPlayback();
    assert.equal(session.canRecoverInPlace(), true, "budget must replenish after successful playback");
  });

  it("computes exponential retry backoff with bounded jitter", () => {
    const b0 = computeRetryBackoffMs(0, 500, 4000, 100);
    assert.ok(b0 >= 500 && b0 <= 600);

    const b1 = computeRetryBackoffMs(1, 500, 4000, 100);
    assert.ok(b1 >= 1000 && b1 <= 1100);

    const bMax = computeRetryBackoffMs(10, 500, 4000, 100);
    assert.ok(bMax >= 4000 && bMax <= 4100);
  });
});

/* ------------------------------------------------------------------ */
/* Phase 3 & 4 — preferred server & fallback priority                  */
/* ------------------------------------------------------------------ */

describe("preferred server and fallback routing", () => {
  it("prioritizes preferredServer in fallback selection if available and unfailed", () => {
    const candidates = [
      plan({ sourceId: "p1", providerSlug: "prov-1", endpointSlug: "server-alpha" }),
      plan({ sourceId: "p2", providerSlug: "prov-2", endpointSlug: "server-beta" }),
      plan({ sourceId: "p3", providerSlug: "prov-3", endpointSlug: "server-preferred" }),
    ];

    const next = selectFallbackPlan(candidates, {
      failedSourceId: "p1",
      failedSourceIds: new Set(["p1"]),
      failedProviderSlugs: new Set(["prov-1"]),
      language: "sub",
      preferredServer: "server-preferred",
    });

    assert.equal(next?.sourceId, "p3");
  });

  it("skips preferredServer if it already failed during the session", () => {
    const candidates = [
      plan({ sourceId: "p1", providerSlug: "prov-1", endpointSlug: "server-alpha" }),
      plan({ sourceId: "p2", providerSlug: "prov-2", endpointSlug: "server-beta" }),
      plan({ sourceId: "p3", providerSlug: "prov-3", endpointSlug: "server-preferred" }),
    ];

    const next = selectFallbackPlan(candidates, {
      failedSourceId: "p3",
      failedSourceIds: new Set(["p1", "p3"]),
      failedProviderSlugs: new Set(["prov-3"]),
      language: "sub",
      preferredServer: "server-preferred",
    });

    assert.equal(next?.sourceId, "p2");
  });

  it("records structured diagnostic history on failure", () => {
    const session = new PlaybackRecoverySession();
    session.noteFailure("plan-x", "prov-x", "transient_network");
    assert.equal(session.history.length, 1);
    assert.equal(session.history[0]?.sourceId, "plan-x");
    assert.equal(session.history[0]?.providerSlug, "prov-x");
    assert.equal(session.history[0]?.category, "transient_network");
    assert.ok(session.history[0]?.timestamp && session.history[0].timestamp > 0);
  });
});

/* ------------------------------------------------------------------ */
/* Phase 1 & 4 — authoritative session association                     */
/* ------------------------------------------------------------------ */

describe("authoritative active playback session", () => {
  it("creates valid active playback session with all required identity fields", () => {
    const active: ActivePlaybackSession = {
      animeId: "21",
      episodeId: "ep-21-1",
      episodeNumber: 1,
      language: "sub",
      providerSlug: "zenkai-api",
      sourceId: "source-1080p",
      attemptGeneration: 1,
      execution: mediaExecution(),
    };

    assert.equal(active.animeId, "21");
    assert.equal(active.episodeId, "ep-21-1");
    assert.equal(active.episodeNumber, 1);
    assert.equal(active.language, "sub");
    assert.equal(active.attemptGeneration, 1);
  });
});

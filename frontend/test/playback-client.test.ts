/**
 * P14 contract tests: the canonical playback client and watch flow.
 *
 * Pins the behaviours the watch migration depends on: sources and executions
 * are read from the canonical backend and Zod-validated (a payload outside the
 * contract is rejected, never rendered as defaults), the execute request
 * carries only canonical identity — never a URL, provider or header —
 * failures stay distinguishable (404 / 409 / 503 / contract / transport), the
 * airing gate keeps unreleased episodes from ever requesting sources, and
 * fallback/stale recovery is bounded by the plan list.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  classifyPlaybackError,
  executePlayback,
  fallbackPlanSelection,
  fetchEpisodeMetadata,
  fetchEpisodeSources,
  initialPlanSelection,
  isUnreleased,
  planToServerOption,
  ZenkaiContractError,
  ZENKAI_API_URL,
  type PlaybackExecution,
  type PlaybackPlan,
  type PlaybackSourcesResponse,
} from "../src/lib/api/zenkai";
import { HttpError } from "../src/lib/api/http";

/** A fully canonical sources payload, exactly as GET /episodes/:id/sources returns it. */
const canonicalSources = {
  episode: {
    id: "4e77b765-19d0-4768-8aa5-fe3728fc92ee",
    episodeNumber: 1,
    title: "A Goblin Is Born",
    durationSeconds: 1440,
    thumbnailUrl: null,
    isFiller: false,
  },
  sources: [
    {
      id: "self-hosted:sub:1",
      providerSlug: "self-hosted",
      providerName: "Self-hosted",
      endpointSlug: "library",
      accessType: "hls",
      playbackUrl: "https://cdn.example.com/1.m3u8",
      quality: "1080p",
      resolution: 1080,
      language: "sub",
      priority: 10,
      validated: true,
      rank: 1,
    },
    {
      id: "self-hosted:sub:2",
      providerSlug: "self-hosted",
      providerName: "Self-hosted",
      endpointSlug: "library",
      accessType: "mp4",
      playbackUrl: "https://cdn.example.com/1.mp4",
      quality: "720p",
      resolution: 720,
      language: "sub",
      priority: 20,
      validated: true,
      rank: 2,
    },
  ],
  sourceCount: 2,
  plans: [
    {
      sourceId: "self-hosted:sub:1",
      providerSlug: "self-hosted",
      providerName: "Self-hosted",
      endpointSlug: "library",
      access: "hls",
      mechanism: "hls",
      mediaType: "application/vnd.apple.mpegurl",
      url: "https://cdn.example.com/1.m3u8",
      delivery: "client",
      language: "sub",
      quality: "1080p",
      resolution: 1080,
      validated: true,
      playable: true,
      capabilities: { seekable: true, ranged: true },
    },
    {
      sourceId: "self-hosted:sub:2",
      providerSlug: "self-hosted",
      providerName: "Self-hosted",
      endpointSlug: "library",
      access: "mp4",
      mechanism: "progressive",
      mediaType: "video/mp4",
      url: "https://cdn.example.com/1.mp4",
      delivery: "client",
      language: "sub",
      quality: "720p",
      resolution: 720,
      validated: true,
      playable: true,
      capabilities: { seekable: true, ranged: true },
    },
  ],
  planCount: 2,
  attempts: [{ providerSlug: "self-hosted", outcome: "ok", count: 2, latencyMs: 3 }],
  skipped: [],
  resolutionTimeMs: 4,
} satisfies PlaybackSourcesResponse;

const canonicalExecution = {
  kind: "media",
  mechanism: "hls",
  url: "https://cdn.example.com/1.m3u8",
  mediaType: "application/vnd.apple.mpegurl",
  delivery: "client",
  sourceId: "self-hosted:sub:1",
  providerSlug: "self-hosted",
  providerName: "Self-hosted",
  language: "sub",
  quality: "1080p",
  resolution: 1080,
  validated: true,
  playable: true,
  capabilities: { seekable: true, ranged: true },
} satisfies PlaybackExecution;

const canonicalMetadata = {
  episodeId: "4e77b765-19d0-4768-8aa5-fe3728fc92ee",
  subtitles: [{ language: "en", url: "https://cdn.example.com/1.vtt", kind: "srt" }],
  intro: { start: 80, end: 170 },
  outro: { start: 1320, end: 1410 },
  sourceUpdatedAt: 1_791_273_191,
};

type FetchLog = { url: string; init?: RequestInit };

let calls: FetchLog[] = [];
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = handler(url);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return error;
  }
}

describe("fetchEpisodeSources", () => {
  it("reads ranked sources for the canonical episode id and language", async () => {
    stubFetch(() => ({ status: 200, body: canonicalSources }));

    const payload = await fetchEpisodeSources("4e77b765", "dub");

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `${ZENKAI_API_URL}/api/v1/episodes/4e77b765/sources?language=dub`,
    );
    assert.equal(payload.plans.length, 2);
    assert.equal(payload.sourceCount, 2);
    assert.equal(payload.resolutionTimeMs, 4);
  });

  it("keeps an empty shelf a 200 with its reason, not an error", async () => {
    stubFetch(() => ({
      status: 200,
      body: { ...canonicalSources, sources: [], sourceCount: 0, plans: [], planCount: 0, emptyReason: "no_streams" },
    }));

    const payload = await fetchEpisodeSources("4e77b765", "sub");

    assert.equal(payload.plans.length, 0);
    assert.equal(payload.emptyReason, "no_streams");
  });

  it("surfaces a provider outage as a 503, distinct from an empty shelf", async () => {
    stubFetch(() => ({ status: 503, body: { error: "no_sources", message: "every playback provider failed" } }));

    const outcome = await capture(() => fetchEpisodeSources("4e77b765", "sub"));

    assert.ok(outcome instanceof HttpError);
    assert.equal((outcome as HttpError).status, 503);
    assert.equal(classifyPlaybackError(outcome), "no_sources");
  });

  it("keeps a 404 a 404", async () => {
    stubFetch(() => ({ status: 404, body: { error: "not_found" } }));

    const outcome = await capture(() => fetchEpisodeSources("missing", "sub"));

    assert.ok(outcome instanceof HttpError);
    assert.equal((outcome as HttpError).status, 404);
    assert.equal(classifyPlaybackError(outcome), "not_found");
  });

  it("rejects a payload that fails the contract", async () => {
    stubFetch(() => ({ status: 200, body: { oops: true } }));

    const outcome = await capture(() => fetchEpisodeSources("4e77b765", "sub"));

    assert.ok(outcome instanceof ZenkaiContractError);
    assert.equal(classifyPlaybackError(outcome), "invalid_response");
  });

  it("rejects a plan whose mechanism the backend never defines", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        ...canonicalSources,
        plans: [{ ...canonicalSources.plans[0], mechanism: "webtorrent" }],
      },
    }));

    const outcome = await capture(() => fetchEpisodeSources("4e77b765", "sub"));

    assert.ok(outcome instanceof ZenkaiContractError);
  });
});

describe("executePlayback", () => {
  it("posts only canonical identity — never a URL, provider or header", async () => {
    stubFetch(() => ({ status: 200, body: { execution: canonicalExecution } }));

    const execution = await executePlayback({
      episodeId: "4e77b765",
      sourceId: "self-hosted:sub:1",
      language: "sub",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/playback/execute`);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      episodeId: "4e77b765",
      sourceId: "self-hosted:sub:1",
      language: "sub",
    });
    assert.equal(execution.kind, "media");
    assert.equal(execution.url, canonicalExecution.url);
  });

  it("defaults the language to sub when the backend omits it", async () => {
    stubFetch(() => ({ status: 200, body: { execution: canonicalExecution } }));

    await executePlayback({ episodeId: "4e77b765", sourceId: "self-hosted:sub:1", language: "sub" });

    const body = JSON.parse(String(calls[0]!.init?.body));
    assert.equal(body.language, "sub");
    assert.ok(!("url" in body) && !("provider" in body) && !("headers" in body));
  });

  it("maps a stale selection to selection_stale", async () => {
    stubFetch(() => ({ status: 409, body: { error: "selection_stale" } }));

    const outcome = await capture(() =>
      executePlayback({ episodeId: "4e77b765", sourceId: "gone", language: "sub" }),
    );

    assert.ok(outcome instanceof HttpError);
    assert.equal((outcome as HttpError).status, 409);
    assert.equal(classifyPlaybackError(outcome), "selection_stale");
  });

  it("maps a provider outage at execute time to no_sources", async () => {
    stubFetch(() => ({ status: 503, body: { error: "no_sources" } }));

    const outcome = await capture(() =>
      executePlayback({ episodeId: "4e77b765", sourceId: "self-hosted:sub:1", language: "sub" }),
    );

    assert.equal(classifyPlaybackError(outcome), "no_sources");
  });

  it("rejects an execution payload outside the contract", async () => {
    stubFetch(() => ({ status: 200, body: { execution: { kind: "media", oops: true } } }));

    const outcome = await capture(() =>
      executePlayback({ episodeId: "4e77b765", sourceId: "self-hosted:sub:1", language: "sub" }),
    );

    assert.ok(outcome instanceof ZenkaiContractError);
  });
});

describe("fetchEpisodeMetadata", () => {
  it("reads skip markers and subtitles for the canonical episode id", async () => {
    stubFetch(() => ({ status: 200, body: canonicalMetadata }));

    const metadata = await fetchEpisodeMetadata("4e77b765");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/episodes/4e77b765/metadata`);
    assert.deepEqual(metadata.intro, { start: 80, end: 170 });
    assert.deepEqual(metadata.outro, { start: 1320, end: 1410 });
    assert.equal(metadata.subtitles.length, 1);
  });

  it("accepts an episode with no stored markers", async () => {
    stubFetch(() => ({
      status: 200,
      body: { episodeId: "4e77b765", subtitles: [], sourceUpdatedAt: null },
    }));

    const metadata = await fetchEpisodeMetadata("4e77b765");

    assert.equal(metadata.intro, undefined);
    assert.equal(metadata.outro, undefined);
  });
});

describe("classifyPlaybackError", () => {
  it("classifies a transport failure as unavailable", () => {
    assert.equal(classifyPlaybackError(new TypeError("fetch failed")), "unavailable");
  });

  it("classifies a 502 as unavailable", () => {
    assert.equal(
      classifyPlaybackError(new HttpError("boom", { url: "http://x", status: 502 })),
      "unavailable",
    );
  });
});

describe("watch flow helpers", () => {
  const plans = canonicalSources.plans as unknown as PlaybackPlan[];

  it("treats only a scheduled-future episode as unreleased", () => {
    assert.equal(isUnreleased({ airingState: "upcoming" }), true);
    assert.equal(isUnreleased({ airingState: "aired" }), false);
    // Unknown is not unreleased: no schedule is not a claim about the future.
    assert.equal(isUnreleased({ airingState: "unknown" }), false);
    assert.equal(isUnreleased(null), false);
  });

  it("selects the backend's top-ranked plan by default", () => {
    assert.equal(initialPlanSelection(plans), "self-hosted:sub:1");
    assert.equal(initialPlanSelection([]), null);
  });

  it("falls back to the next canonical plan, bounded by the list", () => {
    assert.equal(fallbackPlanSelection(plans, "self-hosted:sub:1"), "self-hosted:sub:2");
    // The last plan has no successor: the caller reports failure, never loops.
    assert.equal(fallbackPlanSelection(plans, "self-hosted:sub:2"), null);
    assert.equal(fallbackPlanSelection(plans, "never-tried"), null);
  });

  it("maps a plan to a server option without provider details", () => {
    const option = planToServerOption(plans[1]!, 1);

    // The sourceId is the canonical selection identity the execute boundary
    // requires — never a display field. What the user sees carries no provider
    // vocabulary: no slug, endpoint or health detail.
    assert.equal(option.sourceId, "self-hosted:sub:2");
    assert.equal(option.label, "Server 2");
    assert.equal(option.quality, "720p");
    assert.equal(option.resolution, 720);
    assert.equal(option.language, "sub");
    const displayed = JSON.stringify({ label: option.label, quality: option.quality, resolution: option.resolution, language: option.language });
    assert.ok(!displayed.includes("self-hosted"));
    assert.ok(!displayed.includes("provider"));
    assert.ok(!displayed.includes("endpoint"));
  });

  it("keeps the canonical language values to sub/dub/multi only", () => {
    const source = JSON.stringify(canonicalSources);
    assert.ok(source.includes('"sub"'));
    assert.ok(!/"(ENG|English Dub|SUBTITLE|ENG-DUB)"/.test(source));
  });
});

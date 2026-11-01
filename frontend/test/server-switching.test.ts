/**
 * Server Availability & Server Switching System unit tests.
 *
 * Validates:
 * 1. GET /api/v1/episodes/:episodeId/servers schema and client contract.
 * 2. Dynamic server statuses: AVAILABLE, UNAVAILABLE, DEGRADED, ERROR, CHECKING.
 * 3. Cache-bypass refresh=true query parameter handling.
 * 4. Preferred server initial selection honoring availability.
 * 5. Sequential fallback plan selection preventing loops.
 * 6. Player store state and preference persistence for server switching.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  episodeServersResponseSchema,
  fallbackPlanSelection,
  fetchEpisodeServers,
  initialPlanSelection,
  playbackSourcesResponseSchema,
  type EpisodeServersResponse,
  type PlaybackPlan,
  type ServerAvailabilityItem,
} from "../src/lib/api/zenkai";
import { usePlayerStore } from "../src/stores/player";

const stubEpisodeServers: EpisodeServersResponse = {
  episodeId: "ep-test-123",
  episodeNumber: 1,
  language: "sub",
  servers: [
    {
      serverId: "novus-hd",
      sourceId: "source-novus-1",
      serverName: "Novus HD-1",
      displayName: "Novus HD-1 (Direct)",
      name: "novus-hd",
      label: "Novus HD-1 (Direct)",
      status: "AVAILABLE",
      statusMessage: "HLS verified",
      quality: "1080p",
      type: "hls",
      selectable: true,
      sub: true,
      dub: false,
      lastCheckedAt: new Date().toISOString(),
    },
    {
      serverId: "recloud-hd",
      sourceId: "source-recloud-1",
      serverName: "ReCloud HD",
      displayName: "ReCloud HD (Embed)",
      name: "recloud-hd",
      label: "ReCloud HD (Embed)",
      status: "DEGRADED",
      statusMessage: "Upstream provider degraded",
      quality: "720p",
      type: "embed",
      selectable: true,
      sub: true,
      dub: true,
      lastCheckedAt: new Date().toISOString(),
      diagnosticCategory: "quarantined",
    },
    {
      serverId: "streamcdn",
      sourceId: "source-streamcdn-1",
      serverName: "StreamCDN",
      displayName: "StreamCDN",
      name: "streamcdn",
      label: "StreamCDN",
      status: "UNAVAILABLE",
      statusMessage: "Probe failed: offline",
      type: "hls",
      selectable: false,
      sub: false,
      dub: true,
      lastCheckedAt: new Date().toISOString(),
      diagnosticCategory: "probe_failed",
    },
  ],
  availableCount: 1,
  totalCount: 3,
  checkedAt: new Date().toISOString(),
  cached: false,
};

const stubPlans: PlaybackPlan[] = [
  {
    sourceId: "plan-1",
    providerSlug: "novus",
    providerName: "Novus HD",
    endpointSlug: "novus-hd",
    access: "hls",
    mechanism: "hls",
    mediaType: "application/vnd.apple.mpegurl",
    url: "https://stream.example.com/live.m3u8",
    delivery: "client",
    language: "sub",
    quality: "1080p",
    resolution: 1080,
    validated: true,
    playable: true,
    capabilities: { seekable: true, ranged: true },
  },
  {
    sourceId: "plan-2",
    providerSlug: "recloud",
    providerName: "ReCloud HD",
    endpointSlug: "recloud-hd",
    access: "embed",
    mechanism: "iframe",
    mediaType: null,
    url: "https://embed.example.com/watch",
    delivery: "client",
    language: "sub",
    quality: "720p",
    resolution: 720,
    validated: true,
    playable: true,
    capabilities: { seekable: null, ranged: null },
  },
  {
    sourceId: "plan-3",
    providerSlug: "streamcdn",
    providerName: "StreamCDN",
    endpointSlug: "streamcdn",
    access: "hls",
    mechanism: "hls",
    mediaType: "application/vnd.apple.mpegurl",
    url: "https://fail.example.com/playlist.m3u8",
    delivery: "client",
    language: "sub",
    quality: "480p",
    resolution: 480,
    validated: false,
    playable: false,
    capabilities: { seekable: false, ranged: false },
  },
];

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

describe("Server Availability & Switching System (Frontend)", () => {
  describe("API Contracts and Schema Validation", () => {
    it("parses valid episode servers availability payload", () => {
      const parsed = episodeServersResponseSchema.parse(stubEpisodeServers);
      assert.equal(parsed.episodeId, "ep-test-123");
      assert.equal(parsed.availableCount, 1);
      assert.equal(parsed.totalCount, 3);
      assert.equal(parsed.servers.length, 3);
      assert.equal(parsed.servers[0]?.status, "AVAILABLE");
      assert.equal(parsed.servers[1]?.status, "DEGRADED");
      assert.equal(parsed.servers[2]?.status, "UNAVAILABLE");
      assert.equal(parsed.servers[2]?.selectable, false);
    });

    it("parses enriched servers array in sources payload", () => {
      const sourcesPayload = {
        episode: {
          id: "ep-test-123",
          episodeNumber: 1,
          title: "Episode 1",
          durationSeconds: 1440,
        },
        sources: [],
        sourceCount: 0,
        plans: stubPlans,
        planCount: stubPlans.length,
        attempts: [],
        skipped: [],
        servers: stubEpisodeServers.servers,
        resolutionTimeMs: 12,
      };

      const parsed = playbackSourcesResponseSchema.parse(sourcesPayload);
      assert.equal(parsed.servers?.length, 3);
      assert.equal(parsed.servers?.[0]?.quality, "1080p");
      assert.equal(parsed.servers?.[1]?.diagnosticCategory, "quarantined");
    });

    it("fetches servers with language and refresh parameters", async () => {
      stubFetch((url) => {
        assert.ok(url.includes("/api/v1/episodes/ep-test-123/servers"));
        assert.ok(url.includes("language=sub"));
        assert.ok(url.includes("refresh=true"));
        return { status: 200, body: stubEpisodeServers };
      });

      const res = await fetchEpisodeServers("ep-test-123", {
        language: "sub",
        refresh: true,
      });

      assert.equal(calls.length, 1);
      assert.equal(res.availableCount, 1);
      assert.equal(res.servers[0]?.name, "novus-hd");
    });
  });

  describe("Server Selection and Fallback Logic", () => {
    it("selects user preferred server when available", () => {
      // User preferred ReCloud HD
      const selected = initialPlanSelection(stubPlans, "recloud-hd", stubEpisodeServers.servers);
      assert.equal(selected, "plan-2");
    });

    it("falls back to top-ranked available plan when preferred server is not matched", () => {
      const selected = initialPlanSelection(stubPlans, "non-existent-server", stubEpisodeServers.servers);
      assert.equal(selected, "plan-1");
    });

    it("falls back to top-ranked plan by default", () => {
      const selected = initialPlanSelection(stubPlans);
      assert.equal(selected, "plan-1");
    });

    it("advances sequentially on fallback without loops", () => {
      const next1 = fallbackPlanSelection(stubPlans, "plan-1");
      assert.equal(next1, "plan-2");

      const next2 = fallbackPlanSelection(stubPlans, "plan-2");
      assert.equal(next2, "plan-3");

      const next3 = fallbackPlanSelection(stubPlans, "plan-3");
      assert.equal(next3, null, "Last plan must return null, preventing infinite cycling");
    });
  });

  describe("Player Store Server Preferences", () => {
    it("initializes with default server preferences", () => {
      const state = usePlayerStore.getState();
      assert.equal(state.autoServerFallback, true);
      assert.equal(state.autoSelectBestServer, true);
      assert.equal(state.preferredServer, null);
    });

    it("updates and persists preferredServer and autoServerFallback", () => {
      const store = usePlayerStore.getState();

      store.setPreferredServer("novus-hd");
      assert.equal(usePlayerStore.getState().preferredServer, "novus-hd");

      store.setAutoServerFallback(false);
      assert.equal(usePlayerStore.getState().autoServerFallback, false);

      store.setAutoSelectBestServer(false);
      assert.equal(usePlayerStore.getState().autoSelectBestServer, false);

      // Reset
      store.setPreferredServer(null);
      store.setAutoServerFallback(true);
      store.setAutoSelectBestServer(true);
    });
  });
});

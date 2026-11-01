import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createServer, type Server } from "node:http";
import Fastify from "fastify";

import { ServerAvailabilityService } from "../src/modules/playback/servers.js";
import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import { PlaybackResolver } from "../src/modules/playback/service.js";
import { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import { healthRegistry } from "../src/providers/streaming/health.js";
import type { PlaybackSource, ResolveRequest, StreamingProvider } from "../src/providers/streaming/types.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";

function makeStubProvider(
  slug: string,
  name: string,
  sources: PlaybackSource[],
  behavior: "ok" | "error" | "timeout" = "ok",
): StreamingProvider {
  return {
    slug,
    name,
    enabled: true,
    priority: 10,
    capabilities: {
      languages: ["sub", "dub", "multi"],
      accessTypes: ["hls", "embed"],
      supportsSubtitles: true,
      supportsSkipMarkers: true,
      requiresMalId: false,
    },
    async resolve(_req: ResolveRequest): Promise<PlaybackSource[]> {
      if (behavior === "error") throw new Error(`${slug} connection failed`);
      if (behavior === "timeout") {
        await new Promise((r) => setTimeout(r, 200));
        throw new Error(`${slug} timed out`);
      }
      return sources;
    },
  };
}

describe("ServerAvailabilityService & Route Suite", () => {
  let server: Server;
  let reachableUrl: string;
  const unreachableUrl = "http://127.0.0.1:1/nothing.m3u8";

  before(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
      res.end("#EXTM3U\n#EXT-X-VERSION:3\n");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    reachableUrl = `http://127.0.0.1:${port}/test.m3u8`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    healthRegistry.resetQuarantined();
  });

  function makeMockRepo(animeId: string, anilistId: number) {
    return {
      async getEpisode(id: string) {
        return { id, animeId, episodeNumber: 1, title: "Episode 1" };
      },
      async listParentTitles() {
        return [{ id: animeId, anilistId, canonicalTitle: "Title", externalIds: { anilist: String(anilistId) } }];
      },
      async getByAnilistId() {
        return { id: animeId, anilistId, canonicalTitle: "Title", externalIds: { anilist: String(anilistId) } };
      },
      async getEpisodeExternalIds() {
        return [];
      },
    } as unknown as AnimeRepository;
  }

  it("dynamically returns AVAILABLE servers for valid probed media sources", async () => {
    const validHlsSource: PlaybackSource = {
      id: "src-1",
      providerSlug: "novus",
      providerName: "Novus HD",
      endpointSlug: "hd-2",
      accessType: "hls",
      playbackUrl: reachableUrl,
      quality: "1080p",
      resolution: 1080,
      language: "sub",
      priority: 1,
    };

    const validEmbedSource: PlaybackSource = {
      id: "src-2",
      providerSlug: "recloud",
      providerName: "ReCloud",
      endpointSlug: "sub",
      accessType: "embed",
      playbackUrl: "https://cdn.4animo.xyz/embed/test",
      quality: "HD",
      language: "sub",
      priority: 2,
    };

    const provider1 = makeStubProvider("novus", "Novus HD", [validHlsSource]);
    const provider2 = makeStubProvider("recloud", "ReCloud", [validEmbedSource]);
    const providers = [provider1, provider2];

    const repo = makeMockRepo("anime-avail", 20001);
    const resolver = new PlaybackResolver(providers, repo);
    const serverService = new ServerAvailabilityService(resolver, providers);

    const report = await serverService.getAvailability("ep-avail-1", { language: "sub" });

    assert.equal(report.episodeId, "ep-avail-1");
    assert.equal(report.availableCount, 2);
    assert.equal(report.totalCount, 2);
    assert.equal(report.cached, false);

    const novus = report.servers.find((s) => s.serverId === "novus");
    assert.ok(novus);
    assert.equal(novus.status, "AVAILABLE");
    assert.equal(novus.type, "hls");
    assert.equal(novus.selectable, true);
    assert.equal(novus.quality, "1080p");

    const recloud = report.servers.find((s) => s.serverId === "recloud");
    assert.ok(recloud);
    assert.equal(recloud.status, "AVAILABLE");
    assert.equal(recloud.type, "embed");
    assert.equal(recloud.selectable, true);
  });

  it("marks unvalidated sources as UNAVAILABLE with diagnostic category", async () => {
    const deadSource: PlaybackSource = {
      id: "src-dead",
      providerSlug: "dead-cdn",
      providerName: "Dead CDN",
      endpointSlug: "default",
      accessType: "hls",
      playbackUrl: unreachableUrl,
      language: "sub",
      priority: 5,
    };

    const provider = makeStubProvider("dead-cdn", "Dead CDN", [deadSource]);
    const repo = makeMockRepo("anime-dead", 20002);
    const resolver = new PlaybackResolver([provider], repo);
    const serverService = new ServerAvailabilityService(resolver, [provider]);

    const report = await serverService.getAvailability("ep-dead-1", { language: "sub" });

    assert.equal(report.availableCount, 0);
    assert.equal(report.totalCount, 1);
    const item = report.servers[0];
    assert.equal(item.status, "UNAVAILABLE");
    assert.equal(item.selectable, false);
    assert.equal(item.diagnosticCategory, "probe_failed");
    assert.ok(item.errorMessage);
  });

  it("marks quarantined providers as DEGRADED", async () => {
    const source: PlaybackSource = {
      id: "src-q",
      providerSlug: "unstable-server",
      providerName: "Unstable Server",
      endpointSlug: "hd-1",
      accessType: "hls",
      playbackUrl: reachableUrl,
      language: "sub",
      priority: 1,
    };

    const provider = makeStubProvider("unstable-server", "Unstable Server", [source]);
    // Force quarantine in health registry (requires 5 consecutive failures)
    for (let i = 0; i < 5; i++) {
      healthRegistry.record("unstable-server", "error", 100, "failing");
    }
    assert.equal(healthRegistry.isQuarantined("unstable-server"), true);

    const repo = makeMockRepo("anime-quar", 20003);
    const resolver = new PlaybackResolver([provider], repo);
    const serverService = new ServerAvailabilityService(resolver, [provider]);

    const report = await serverService.getAvailability("ep-quar-1", { language: "sub" });
    const item = report.servers.find((s) => s.serverId === "unstable-server");
    assert.ok(item);
    assert.equal(item.status, "DEGRADED");
    assert.equal(item.diagnosticCategory, "quarantined");

    // Clean up
    healthRegistry.resetQuarantined();
  });

  it("caches availability and handles forced refresh parameter", async () => {
    let callCount = 0;
    const dynamicProvider: StreamingProvider = {
      slug: "counting-server",
      name: "Counting Server",
      enabled: true,
      priority: 1,
      capabilities: {
        languages: ["sub"],
        accessTypes: ["hls"],
        supportsSubtitles: false,
        supportsSkipMarkers: false,
        requiresMalId: false,
      },
      async resolve() {
        callCount++;
        return [
          {
            id: `src-${callCount}`,
            providerSlug: "counting-server",
            providerName: "Counting Server",
            endpointSlug: "sub",
            accessType: "hls",
            playbackUrl: reachableUrl,
            language: "sub",
            priority: 1,
          },
        ];
      },
    };

    const repo = makeMockRepo("anime-cache", 20004);
    const resolver = new PlaybackResolver([dynamicProvider], repo);
    const serverService = new ServerAvailabilityService(resolver, [dynamicProvider]);

    // First call (uncached)
    const first = await serverService.getAvailability("ep-cache-1", { language: "sub" });
    assert.equal(callCount, 1);
    assert.equal(first.cached, false);

    // Second call (should hit cache)
    const second = await serverService.getAvailability("ep-cache-1", { language: "sub" });
    assert.equal(callCount, 1, "Should reuse cached result without resolving again");
    assert.equal(second.cached, true);

    // Third call with refresh=true
    const third = await serverService.getAvailability("ep-cache-1", { language: "sub", refresh: true });
    assert.equal(callCount, 2, "Should bypass cache on refresh=true");
    assert.equal(third.cached, false);
  });

  it("Fastify route GET /api/v1/episodes/:id/servers returns normalized envelope", async () => {
    const validSource: PlaybackSource = {
      id: "src-fastify",
      providerSlug: "fastify-server",
      providerName: "Fastify Server",
      endpointSlug: "sub",
      accessType: "hls",
      playbackUrl: reachableUrl,
      quality: "1080p",
      language: "sub",
      priority: 1,
    };

    const provider = makeStubProvider("fastify-server", "Fastify Server", [validSource]);
    const repo = makeMockRepo("anime-fastify", 20005);
    const resolver = new PlaybackResolver([provider], repo);
    const metadata = new PlaybackMetadataService({} as any, [provider]);
    const serverService = new ServerAvailabilityService(resolver, [provider]);

    const app = Fastify();
    registerPlaybackRoutes(app, resolver, metadata, repo, serverService);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/episodes/ep-fastify-1/servers?language=sub",
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["x-zenkai-cache"], "MISS");
    const body = res.json();
    assert.equal(body.episodeId, "ep-fastify-1");
    assert.ok(Array.isArray(body.servers));
    assert.equal(body.availableCount, 1);
    const serverItem = body.servers.find((s: any) => s.serverId === "fastify-server");
    assert.ok(serverItem);
    assert.equal(serverItem.status, "AVAILABLE");

    // Second inject should report cache HIT
    const resCached = await app.inject({
      method: "GET",
      url: "/api/v1/episodes/ep-fastify-1/servers?language=sub",
    });
    assert.equal(resCached.statusCode, 200);
    assert.equal(resCached.headers["x-zenkai-cache"], "HIT");
    assert.equal(resCached.json().cached, true);
  });
});

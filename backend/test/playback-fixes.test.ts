import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { config } from "../src/config/index.js";
import { renderTemplate, TemplateProvider } from "../src/providers/streaming/template.provider.js";
import { InProcessProvider } from "../src/providers/streaming/inprocess.provider.js";
import { PlaybackGateway } from "../src/providers/streaming/gateway.js";
import { loadProvidersFromDb } from "../src/providers/streaming/registry.js";
import type { ResolveRequest, RankedSource } from "../src/providers/streaming/types.js";

describe("playback architecture fixes", () => {
  it("resolves relative template URLs to absolute URLs safely", () => {
    const request: ResolveRequest = {
      animeId: "anime-1",
      anilistId: "12345",
      malId: "6789",
      episodeNumber: 3,
      language: "sub",
    };

    const rendered = renderTemplate("/media/{anilist}/episode-{episode}.m3u8", request, "anilist");
    assert.ok(rendered, "must produce a rendered URL");
    assert.ok(rendered.startsWith("http://") || rendered.startsWith("https://"), "must be an absolute URL");
    assert.ok(rendered.includes("/media/12345/episode-3.m3u8"), "must interpolate parameters correctly");

    // Must be parseable by URL constructor without throwing
    const parsed = new URL(rendered);
    assert.ok(parsed.hostname);
  });

  it("plans a self-hosted template source into a valid PlaybackPlan without dropping it", () => {
    const gateway = new PlaybackGateway();
    const request: ResolveRequest = {
      animeId: "anime-1",
      anilistId: "12345",
      episodeNumber: 1,
      language: "sub",
    };

    const provider = new TemplateProvider("self-hosted", "Self Hosted", 1, {
      id: "self-hosted",
      providerSlug: "self-hosted",
      providerName: "Self-hosted library",
      endpointSlug: "sub",
      displayName: "Self-hosted",
      language: "sub",
      accessType: "hls",
      badge: "Self-hosted",
      urlTemplate: "/media/{anilist}/episode-{episode}.m3u8",
      requiredIdType: "anilist",
      priority: 1,
    });

    const sources = [
      {
        id: "source-1",
        providerSlug: "self-hosted",
        providerName: "Self-hosted library",
        endpointSlug: "sub",
        accessType: "hls" as const,
        playbackUrl: renderTemplate("/media/{anilist}/episode-{episode}.m3u8", request, "anilist")!,
        language: "sub" as const,
        priority: 1,
        validated: true,
        rank: 0.9,
      },
    ];

    const result = gateway.planAll(sources);
    assert.equal(result.unmapped, 0, "must not drop valid self-hosted URLs");
    assert.equal(result.plans.length, 1);
    assert.equal(result.plans[0].mechanism, "hls");
    assert.ok(result.plans[0].url.startsWith("http"));
  });

  it("manifest relay resolves relative segment and key lines to absolute URLs", async () => {
    const gateway = new PlaybackGateway();
    const manifestUrl = "https://cdn.example.com/anime/master.m3u8";
    const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXTINF:10.0,
segment-001.ts
#EXTINF:10.0,
https://cdn.example.com/anime/segment-002.ts`;

    const result = await gateway.fetchManifest(manifestUrl, {
      enabled: true,
      allowlist: ["cdn.example.com"],
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.apple.mpegurl" }),
        text: async () => sampleM3u8,
      })) as never,
      assertImpl: (async () => ({ url: new URL(manifestUrl) })) as never,
    });

    assert.ok(result.body.includes(`URI="https://cdn.example.com/anime/enc.key"`), "must rewrite relative key URI");
    assert.ok(result.body.includes("https://cdn.example.com/anime/segment-001.ts"), "must rewrite relative segment line");
    assert.ok(result.body.includes("https://cdn.example.com/anime/segment-002.ts"), "must preserve already absolute segment line");
  });

  it("loadProvidersFromDb gracefully falls back to defaults when database is unpopulated", async () => {
    const providers = await loadProvidersFromDb(undefined);
    assert.ok(Array.isArray(providers));
    assert.ok(providers.length > 0);
    assert.ok(providers.some((p) => p.slug === "self-hosted"));
  });
});

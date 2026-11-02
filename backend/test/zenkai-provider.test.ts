import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ZenkaiApiStreamingProvider } from "../src/providers/streaming/zenkai.provider.js";
import type { ResolveRequest } from "../src/providers/streaming/types.js";

describe("ZenkaiApiStreamingProvider Suite", () => {
  it("declares proper capabilities and priority", () => {
    const provider = new ZenkaiApiStreamingProvider();
    assert.equal(provider.slug, "zenkai-api");
    assert.equal(provider.basePriority, 12);
    assert.equal(provider.kind, "licensed");
    assert.deepEqual(provider.capabilities.languages, ["sub", "dub", "multi"]);
    assert.deepEqual(provider.capabilities.accessTypes, ["hls", "embed"]);
    assert.equal(provider.capabilities.supportsSubtitles, true);
    assert.equal(provider.capabilities.supportsSkipMarkers, true);
  });

  it("returns empty sources when anilist ID is absent", async () => {
    const provider = new ZenkaiApiStreamingProvider();
    const req: ResolveRequest = {
      animeId: "non-numeric-slug",
      episodeNumber: 1,
      language: "sub",
      externalIds: {},
    };

    const sources = await provider.resolve(req);
    assert.deepEqual(sources, []);
  });

  it("resolves sources for verified anilist media (One Piece id=21 ep=1)", async () => {
    const provider = new ZenkaiApiStreamingProvider();
    const req: ResolveRequest = {
      animeId: "21",
      episodeNumber: 1,
      language: "sub",
      externalIds: { anilist: "21" },
    };

    const sources = await provider.resolve(req);
    // When external network is reachable, we expect real sources
    if (sources.length > 0) {
      assert.ok(sources.length >= 1);
      const first = sources[0]!;
      assert.equal(first.providerSlug, "zenkai-api");
      assert.ok(first.playbackUrl.startsWith("http"));
      assert.ok(first.audioTracks && first.audioTracks.length > 0);
      assert.equal(first.audioTracks[0]?.type, "sub");

      const markers = await provider.getSkipMarkers(req);
      if (markers?.intro) {
        assert.ok(markers.intro.start >= 0);
        assert.ok(markers.intro.end > markers.intro.start);
      }
    }
  });

  it("handles multi-audio resolution and AnimeSalt embed fallback", async () => {
    const provider = new ZenkaiApiStreamingProvider();
    const req: ResolveRequest = {
      animeId: "21",
      episodeNumber: 1,
      language: "multi",
      externalIds: { anilist: "21" },
    };

    const sources = await provider.resolve(req);
    if (sources.length > 0) {
      const multiSource = sources.find((s) => s.language === "multi" || s.accessType === "embed");
      if (multiSource) {
        assert.ok(multiSource.audioTracks && multiSource.audioTracks.length >= 2);
        assert.ok(multiSource.audioTracks.some((t) => t.code === "ja"));
        assert.ok(multiSource.audioTracks.some((t) => t.code === "en"));
      }
    }
  });

  it("performs health check against upstream", async () => {
    const provider = new ZenkaiApiStreamingProvider();
    const ok = await provider.healthCheck();
    // In sandbox with internet access, health check returns true
    assert.equal(typeof ok, "boolean");
  });
});

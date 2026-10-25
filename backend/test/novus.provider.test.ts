/**
 * NovusCloud provider contract and extraction unit tests.
 *
 * Verifies that NovusCloudProvider extracts HLS streams, parses subtitles,
 * extracts intro/outro skip markers, generates resilient embed fallbacks,
 * handles upstream HTTP errors gracefully, and satisfies the StreamingProvider contract.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NovusCloudProvider } from "../src/providers/streaming/novus.provider.js";

const MOCK_HTML_WITH_SOURCES = `
<!DOCTYPE html>
<html>
<head><title>Ep 1 - NovusCloud</title></head>
<body>
  <div id="player"></div>
  <script>
    var sourcesUrl = '/stream/getSources?t=mock-token-abc';
  </script>
</body>
</html>
`;

const MOCK_HTML_WITHOUT_SOURCES = `
<!DOCTYPE html>
<html>
<head><title>Ep 1 - NovusCloud</title></head>
<body>
  <div id="player">No stream available</div>
</body>
</html>
`;

const MOCK_JSON_PAYLOAD = {
  sources: [
    {
      file: "/p?t=mock-hls-stream-xyz",
      type: "hls",
    },
  ],
  tracks: [
    {
      file: "/p?t=mock-sub-en",
      label: "English",
      kind: "captions",
      default: true,
    },
    {
      file: "/p?t=mock-sub-es",
      label: "Spanish",
      kind: "captions",
      default: false,
    },
    {
      file: "/p?t=mock-thumbs",
      label: "Thumbnails",
      kind: "thumbnails",
    },
  ],
  intro: {
    start: 85,
    end: 175,
  },
  outro: {
    start: 1320,
    end: 1410,
  },
  server: "HD-2",
};

describe("NovusCloudProvider contract", () => {
  it("declares correct slug, name, priority and capabilities", () => {
    const provider = new NovusCloudProvider();

    assert.equal(provider.slug, "novuscloud");
    assert.equal(provider.name, "NovusCloud (HD-2)");
    assert.equal(provider.basePriority, 10);
    assert.equal(provider.kind, "scrape");
    assert.deepEqual(provider.capabilities.accessTypes, ["hls", "embed"]);
    assert.ok(provider.capabilities.languages.includes("sub"));
    assert.ok(provider.capabilities.languages.includes("dub"));
    assert.equal(provider.capabilities.supportsSubtitles, true);
    assert.equal(provider.capabilities.supportsSkipMarkers, true);
    assert.equal(provider.capabilities.requiresMalId, false);
    assert.equal(provider.capabilities.requiredIdType, "anilist");
  });

  it("returns empty array when anilistId or episodeNumber is missing or invalid", async () => {
    const provider = new NovusCloudProvider();

    const noId = await provider.resolve({
      animeId: "a",
      anilistId: "",
      episodeNumber: 1,
      language: "sub",
    });
    assert.deepEqual(noId, []);

    const badEp = await provider.resolve({
      animeId: "a",
      anilistId: "21",
      episodeNumber: 0,
      language: "sub",
    });
    assert.deepEqual(badEp, []);
  });

  it("extracts native HLS stream, subtitles, and skip markers from valid embed HTML and payload", async () => {
    const calls: string[] = [];
    const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      calls.push(urlStr);

      if (urlStr.includes("/embed/hd-2/ani/")) {
        return new Response(MOCK_HTML_WITH_SOURCES, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      if (urlStr.includes("/stream/getSources")) {
        return new Response(JSON.stringify(MOCK_JSON_PAYLOAD), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    const sources = await provider.resolve({
      animeId: "ep-21-1",
      anilistId: "21",
      episodeNumber: 1,
      language: "sub",
    });

    assert.equal(sources.length, 2, "must return primary HLS source and fallback embed source");

    const hls = sources.find((s) => s.accessType === "hls");
    assert.ok(hls, "HLS source must be present");
    assert.equal(hls.playbackUrl, "https://cdn.4animo.xyz/p?t=mock-hls-stream-xyz");
    assert.equal(hls.quality, "1080p");
    assert.equal(hls.resolution, 1080);
    assert.equal(hls.language, "sub");
    assert.equal(hls.priority, 10);
    assert.ok(hls.subtitles && hls.subtitles.length === 2, "thumbnails must be filtered out of subtitles");
    assert.equal(hls.subtitles![0]?.language, "English");
    assert.equal(hls.subtitles![0]?.url, "https://cdn.4animo.xyz/p?t=mock-sub-en");

    const embed = sources.find((s) => s.accessType === "embed");
    assert.ok(embed, "embed source must be present");
    assert.equal(
      embed.playbackUrl,
      "https://cdn.4animo.xyz/embed/hd-2/ani/21/1/sub?k=1",
    );
    assert.equal(embed.priority, 25);

    // Verify skip markers were extracted
    const markers = await provider.getSkipMarkers({
      animeId: "ep-21-1",
      anilistId: "21",
      episodeNumber: 1,
      language: "sub",
    });

    assert.ok(markers);
    assert.deepEqual(markers.intro, { start: 85, end: 175 });
    assert.deepEqual(markers.outro, { start: 1320, end: 1410 });
  });

  it("falls back to embed when embed HTML has no sourcesUrl", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/embed/hd-2/ani/")) {
        return new Response(MOCK_HTML_WITHOUT_SOURCES, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus-fallback",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    const sources = await provider.resolve({
      animeId: "ep-21-1",
      anilistId: "21",
      episodeNumber: 1,
      language: "sub",
    });

    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.accessType, "embed");
    assert.equal(
      sources[0]?.playbackUrl,
      "https://cdn.4animo.xyz/embed/hd-2/ani/21/1/sub?k=1",
    );
  });

  it("falls back to embed when getSources returns HTTP error", async () => {
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/embed/hd-2/ani/")) {
        return new Response(MOCK_HTML_WITH_SOURCES, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      if (urlStr.includes("/stream/getSources")) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus-err",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    const sources = await provider.resolve({
      animeId: "ep-21-1",
      anilistId: "21",
      episodeNumber: 1,
      language: "sub",
    });

    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.accessType, "embed");
  });

  it("returns empty array when embed target returns HTTP 404", async () => {
    const mockFetch = (async () => {
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus-404",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    const sources = await provider.resolve({
      animeId: "ep-999999-1",
      anilistId: "999999",
      episodeNumber: 1,
      language: "sub",
    });

    assert.deepEqual(sources, []);
  });

  it("resolves both sub and dub when language is multi", async () => {
    const requestedLangs: string[] = [];
    const mockFetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/sub?k=1")) requestedLangs.push("sub");
      if (urlStr.includes("/dub?k=1")) requestedLangs.push("dub");

      if (urlStr.includes("/embed/hd-2/ani/")) {
        return new Response(MOCK_HTML_WITH_SOURCES, { status: 200 });
      }
      if (urlStr.includes("/stream/getSources")) {
        return new Response(JSON.stringify(MOCK_JSON_PAYLOAD), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus-multi",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    const sources = await provider.resolve({
      animeId: "ep-21-1",
      anilistId: "21",
      episodeNumber: 1,
      language: "multi",
    });

    assert.ok(requestedLangs.includes("sub"));
    assert.ok(requestedLangs.includes("dub"));
    assert.equal(sources.length, 4); // 2 sub (hls + embed) + 2 dub (hls + embed)
  });

  it("healthCheck returns true when head request is 200 and false on network failure", async () => {
    let shouldFail = false;
    const mockFetch = (async () => {
      if (shouldFail) throw new Error("connection reset");
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const provider = new NovusCloudProvider(
      "test-novus-health",
      "Test Novus",
      10,
      "https://cdn.4animo.xyz",
      mockFetch,
    );

    assert.equal(await provider.healthCheck(), true);
    shouldFail = true;
    assert.equal(await provider.healthCheck(), false);
  });
});

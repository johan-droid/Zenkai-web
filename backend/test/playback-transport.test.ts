/**
 * Playback transport / relay hardening (P9).
 *
 * The manifest and subtitle relays are the only server-side media-adjacent
 * fetch paths. This file pins their integrity gates -- content types, size
 * caps, the enable flag, direct-pass-through headers, and log redaction --
 * offline, through the gateway's injected fetch/guard seams.
 */

import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, it } from "node:test";

import {
  fetchWithRedirectValidation,
  redactRequestUrl,
  sanitizeReferer,
  sanitizeRange,
  PlaybackGateway,
} from "../src/providers/streaming/gateway.js";
import { config } from "../src/config/index.js";
import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import type { PlaybackResolver } from "../src/modules/playback/service.js";
import type { PlaybackMetadataService } from "../src/modules/playback/metadata.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";

const gateway = new PlaybackGateway();

const passthroughAssert = async (rawUrl: string) => ({
  url: new URL(rawUrl),
  address: "93.184.216.34",
});

function htmlishUpstream(contentType: string, body: string) {
  return (async () =>
    new Response(body, { status: 200, headers: { "content-type": contentType } })) as typeof fetch;
}

describe("manifest relay integrity", () => {
  it("passes through a valid HLS manifest and its content type", async () => {
    const result = await gateway.fetchManifest("https://cdn.example/1.m3u8", {
      enabled: true,
      allowlist: ["example"],
      fetchImpl: htmlishUpstream("application/vnd.apple.mpegurl", "#EXTM3U\n#EXT-X-VERSION:3"),
      assertImpl: passthroughAssert as never,
    });

    assert.equal(result.body, "#EXTM3U\n#EXT-X-VERSION:3");
    assert.equal(result.contentType, "application/vnd.apple.mpegurl");
  });

  it("rejects an HTML error page masquerading as a manifest", async () => {
    await assert.rejects(
      gateway.fetchManifest("https://cdn.example/1.m3u8", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl: htmlishUpstream("text/html", "<html>forbidden</html>"),
        assertImpl: passthroughAssert as never,
      }),
      /unsupported content type/,
    );
  });

  it("rejects an oversized manifest", async () => {
    const big = "#EXTM3U\n" + "x".repeat(3 * 1024 * 1024);
    await assert.rejects(
      gateway.fetchManifest("https://cdn.example/1.m3u8", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl: htmlishUpstream("application/vnd.apple.mpegurl", big),
        assertImpl: passthroughAssert as never,
      }),
      /exceeds the size limit/,
    );
  });

  it("rejects a blocked redirect chain before fetching the private hop", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: URL | string) => {
      calls.push(String(url));
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/m" } });
    }) as typeof fetch;
    const blockingAssert = (async (rawUrl: string) => {
      if (/169\.254/.test(rawUrl)) {
        const { BlockedUrlError } = await import("../src/http/url-guard.js");
        throw new BlockedUrlError(`blocked: ${rawUrl}`);
      }
      return { url: new URL(rawUrl), address: "93.184.216.34" };
    }) as never;

    await assert.rejects(
      gateway.fetchManifest("https://cdn.example/1.m3u8", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl,
        assertImpl: blockingAssert,
      }),
      /blocked url/,
    );
    assert.deepEqual(calls, ["https://cdn.example/1.m3u8"]);
  });

  it("refuses when the relay is disabled", async () => {
    await assert.rejects(
      gateway.fetchManifest("https://cdn.example/1.m3u8", { enabled: false }),
      /playback proxy is disabled/,
    );
  });
});

describe("subtitle relay integrity", () => {
  it("accepts a WebVTT subtitle", async () => {
    const result = await gateway.fetchSubtitle("https://cdn.example/subs.vtt", {
      enabled: true,
      allowlist: ["example"],
      fetchImpl: htmlishUpstream("text/vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000"),
      assertImpl: passthroughAssert as never,
    });

    assert.ok(result.body.startsWith("WEBVTT"));
  });

  it("rejects a video file served as a subtitle", async () => {
    await assert.rejects(
      gateway.fetchSubtitle("https://cdn.example/fake.vtt", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl: htmlishUpstream("video/mp4", "..."),
        assertImpl: passthroughAssert as never,
      }),
      /unsupported subtitle content type/,
    );
  });
});

describe("relay route gates", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function appWithStubResolver() {
    const a = Fastify({ logger: false });
    const resolver = {
      async resolveEpisode() {
        return { result: { sources: [], attempts: [], skipped: [] }, episode: {} };
      },
      health: () => [],
      checkAll: async () => [],
    } as unknown as PlaybackResolver;
    registerPlaybackRoutes(a, resolver, { get: async () => ({}) } as unknown as PlaybackMetadataService, {} as AnimeRepository);
    await a.ready();
    return a;
  }

  it("manifest route is 400 when the relay is disabled", async () => {
    app = await appWithStubResolver();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/playback/manifest?url=https://cdn.example/1.m3u8",
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /playback proxy is disabled/);
  });

  it("subtitle route is 400 when the relay is disabled", async () => {
    app = await appWithStubResolver();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/playback/subtitle?url=https://cdn.example/subs.vtt",
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /playback proxy is disabled/);
  });
});

describe("request log redaction", () => {
  it("redacts the relay's upstream URL from request logs", () => {
    const redacted = redactRequestUrl("/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example%2F1.m3u8%3Ftoken%3Dabc");
    assert.equal(redacted, "/api/v1/playback/manifest?url=redacted");
  });

  it("keeps non-sensitive request parameters visible in logs", () => {
    assert.equal(redactRequestUrl("/api/v1/episodes/x/sources?language=sub"), "/api/v1/episodes/x/sources?language=sub");
  });

  it("masks sensitive query names regardless of placement", () => {
    assert.equal(redactRequestUrl("/x?token=abc123&other=1"), "/x?token=***&other=1");
  });
});

describe("manifest rewriting and query token preservation", () => {
  const sampleManifest = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="audio/eng.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="sub/eng.vtt"
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
#EXT-X-MAP:URI="init.mp4"
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
/hls/1080p/index.m3u8?child_token=custom
#EXTINF:10.0,
segment-001.ts
#EXTINF:10.0,
https://cdn.example.com/anime/segment-002.ts`;

  it("rewrites nested variant playlists and URI attributes through relayPrefix with referer", () => {
    const rewritten = gateway.rewriteManifest(
      sampleManifest,
      "https://cdn.example.com/anime/master.m3u8?token=secret123",
      {
        relayPrefix: "/api/v1/playback/manifest",
        referer: "https://embed.provider.example",
      },
    );

    // Audio & Subtitle URIs
    assert.ok(
      rewritten.includes(
        `URI="/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Faudio%2Feng.m3u8%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example"`,
      ),
      "must rewrite audio URI through relay with referer",
    );
    assert.ok(
      rewritten.includes(
        `URI="/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Fsub%2Feng.vtt%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example"`,
      ),
      "must rewrite subtitle URI through relay with referer",
    );

    // Encryption key & initialization map
    assert.ok(
      rewritten.includes(
        `URI="/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Fenc.key%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example"`,
      ),
      "must rewrite encryption key URI through relay",
    );
    assert.ok(
      rewritten.includes(
        `URI="/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Finit.mp4%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example"`,
      ),
      "must rewrite init map URI through relay",
    );

    // Relative variant playlist inherits parent query parameters
    assert.ok(
      rewritten.includes(
        `/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2F720p%2Findex.m3u8%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example`,
      ),
      "must resolve relative variant line and propagate parent signed token",
    );

    // Root-relative variant playlist preserves child-specific query parameters
    assert.ok(
      rewritten.includes(
        `/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fhls%2F1080p%2Findex.m3u8%3Fchild_token%3Dcustom&referer=https%3A%2F%2Fembed.provider.example`,
      ),
      "must resolve root-relative path and retain child-specific query token",
    );

    // Media segments (both relative and absolute) routed through relay
    assert.ok(
      rewritten.includes(
        `/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Fsegment-001.ts%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example`,
      ),
      "must rewrite relative segment line through relay",
    );
    assert.ok(
      rewritten.includes(
        `/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Fsegment-002.ts%3Ftoken%3Dsecret123&referer=https%3A%2F%2Fembed.provider.example`,
      ),
      "must rewrite absolute segment line through relay",
    );
  });

  it("resolves relative lines to absolute URLs without relayPrefix for backward compatibility", () => {
    const rewritten = gateway.rewriteManifest(
      sampleManifest,
      "https://cdn.example.com/anime/master.m3u8?token=secret123",
      {},
    );

    assert.ok(
      rewritten.includes(`URI="https://cdn.example.com/anime/enc.key?token=secret123"`),
      "must resolve relative key URI to absolute URL",
    );
    assert.ok(
      rewritten.includes("https://cdn.example.com/anime/segment-001.ts?token=secret123"),
      "must resolve relative segment line to absolute URL",
    );
    assert.ok(
      rewritten.includes("https://cdn.example.com/anime/segment-002.ts"),
      "must preserve absolute segment URL",
    );
  });
});

describe("binary resource relay and range requests", () => {
  it("relays binary media segment as a stream without text conversion", async () => {
    const binaryData = new Uint8Array([0x47, 0x40, 0x00, 0x10, 0x00, 0x00]);
    let textCalled = false;

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "video/mp2t",
        "content-length": "6",
        "accept-ranges": "bytes",
      }),
      body: new Response(binaryData).body,
      text: async () => {
        textCalled = true;
        return "";
      },
    };

    const result = await gateway.fetchResource("https://cdn.example/seg-001.ts", {
      enabled: true,
      allowlist: ["example"],
      fetchImpl: (async () => mockResponse) as never,
      assertImpl: passthroughAssert as never,
    });

    assert.equal(result.isPlaylist, false);
    assert.equal(result.contentType, "video/mp2t");
    assert.equal(result.status, 200);
    assert.equal(result.contentLength, "6");
    assert.equal(result.acceptRanges, "bytes");
    assert.equal(textCalled, false, "must not convert binary stream to text");
    assert.ok(result.body, "must return stream body");
  });

  it("forwards Range header and propagates HTTP 206 Partial Content", async () => {
    let forwardedHeaders: Headers | undefined;

    const mockResponse = {
      ok: true,
      status: 206,
      headers: new Headers({
        "content-type": "video/mp4",
        "content-range": "bytes 0-1023/50000",
        "content-length": "1024",
      }),
      body: new Response(new Uint8Array(1024)).body,
    };

    const fetchImpl = (async (_url: URL | string, init?: RequestInit) => {
      forwardedHeaders = new Headers(init?.headers);
      return mockResponse;
    }) as typeof fetch;

    const result = await gateway.fetchResource("https://cdn.example/video.mp4", {
      enabled: true,
      allowlist: ["example", "example.com"],
      range: "bytes=0-1023",
      referer: "https://embed.example.com",
      fetchImpl,
      assertImpl: passthroughAssert as never,
    });

    assert.equal(result.isPlaylist, false);
    assert.equal(result.status, 206);
    assert.equal(result.contentRange, "bytes 0-1023/50000");
    assert.equal(result.contentLength, "1024");
    assert.equal(forwardedHeaders?.get("range"), "bytes=0-1023");
    assert.equal(forwardedHeaders?.get("referer"), "https://embed.example.com/");
  });

  it("preserves HTTP 416 status and forwards valid Content-Range header", async () => {
    const mockResponse = {
      ok: false,
      status: 416,
      headers: new Headers({
        "content-type": "video/mp4",
        "content-range": "bytes */50000",
        "accept-ranges": "bytes",
      }),
      body: new Response("").body,
    };

    const result = await gateway.fetchResource("https://cdn.example/video.mp4", {
      enabled: true,
      allowlist: ["example"],
      range: "bytes=99999-100000",
      fetchImpl: (async () => mockResponse) as never,
      assertImpl: passthroughAssert as never,
    });

    assert.equal(result.status, 416);
    assert.equal(result.contentRange, "bytes */50000");
    assert.equal(result.isPlaylist, false);
  });

  it("converts 416 without valid Content-Range header into 502 upstream error", async () => {
    const mockResponse = {
      ok: false,
      status: 416,
      headers: new Headers({
        "content-type": "video/mp4",
      }),
      body: new Response("").body,
    };

    await assert.rejects(
      gateway.fetchResource("https://cdn.example/video.mp4", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl: (async () => mockResponse) as never,
        assertImpl: passthroughAssert as never,
      }),
      /upstream returned 416 without valid Content-Range header/,
    );
  });

  it("rejects HTML error page masquerading as a media segment", async () => {
    await assert.rejects(
      gateway.fetchResource("https://cdn.example/seg-001.ts", {
        enabled: true,
        allowlist: ["example"],
        fetchImpl: (async () =>
          new Response("<html>Denied</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })) as typeof fetch,
        assertImpl: passthroughAssert as never,
      }),
      /unsupported content type/,
    );
  });
});

describe("relay security controls and sanitization", () => {
  it("rejects CRLF injection in referer", () => {
    assert.throws(
      () => sanitizeReferer("https://cdn.example\r\nInjected: evil"),
      /invalid characters in referer/,
    );
    assert.throws(
      () => sanitizeReferer("https://cdn.example\nInjected: evil"),
      /invalid characters in referer/,
    );
  });

  it("rejects non-http referer scheme and credential-bearing referer", () => {
    assert.throws(
      () => sanitizeReferer("javascript:alert(1)"),
      /unsupported referer protocol/,
    );
    assert.throws(
      () => sanitizeReferer("https://user:pass@cdn.example"),
      /credentials in referer are not allowed/,
    );
  });

  it("sanitizes valid and invalid Range headers", () => {
    assert.equal(sanitizeRange("bytes=0-1024"), "bytes=0-1024");
    assert.equal(sanitizeRange("bytes=500-"), "bytes=500-");
    assert.equal(sanitizeRange("bytes=0-10, 20-30"), "bytes=0-10, 20-30");
    assert.equal(sanitizeRange("bytes=0-10\r\n"), undefined);
    assert.equal(sanitizeRange("malformed-range"), undefined);
    assert.equal(sanitizeRange("x".repeat(200)), undefined);
  });

  it("refuses binary resource relay when host is not in allowlist", async () => {
    await assert.rejects(
      gateway.fetchResource("https://evil.external/seg.ts", {
        enabled: true,
        allowlist: ["cdn.example.com"],
        fetchImpl: (async () => new Response("data", { status: 200 })) as typeof fetch,
      }),
      /blocked url/,
    );
  });

  it("fails closed when proxy allowlist is empty or missing", async () => {
    await assert.rejects(
      gateway.fetchResource("https://cdn.example/video.mp4", {
        enabled: true,
        allowlist: [],
        fetchImpl: (async () => new Response("data", { status: 200 })) as typeof fetch,
        assertImpl: passthroughAssert as never,
      }),
      /playback proxy allowlist is empty/,
    );

    await assert.rejects(
      gateway.fetchSubtitle("https://cdn.example/subs.vtt", {
        enabled: true,
        allowlist: [],
        fetchImpl: (async () => new Response("data", { status: 200 })) as typeof fetch,
        assertImpl: passthroughAssert as never,
      }),
      /playback proxy allowlist is empty/,
    );

    await assert.rejects(
      fetchWithRedirectValidation("https://cdn.example/video.mp4", {
        allowlist: [],
        fetchImpl: (async () => new Response("data", { status: 200 })) as typeof fetch,
        assertImpl: passthroughAssert as never,
      }),
      /playback proxy allowlist is empty/,
    );
  });

  it("rejects arbitrary untrusted Referer origin", async () => {
    await assert.rejects(
      gateway.fetchResource("https://cdn.example/video.mp4", {
        enabled: true,
        allowlist: ["cdn.example"],
        referer: "https://untrusted-attacker.com/evil",
        fetchImpl: (async () => new Response("data", { status: 200 })) as typeof fetch,
        assertImpl: passthroughAssert as never,
      }),
      /untrusted referer origin/,
    );
  });

  it("permits same-origin and allowlisted provider Referer", async () => {
    // 1. Same-origin referer
    const resSameOrigin = await gateway.fetchResource("https://cdn.example/video.mp4", {
      enabled: true,
      allowlist: ["cdn.example"],
      referer: "https://cdn.example/watch/1",
      fetchImpl: (async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })) as typeof fetch,
      assertImpl: passthroughAssert as never,
    });
    assert.equal(resSameOrigin.status, 200);

    // 2. Allowlisted provider referer
    const resAllowlisted = await gateway.fetchResource("https://cdn.example/video.mp4", {
      enabled: true,
      allowlist: ["cdn.example", "trusted-provider.example"],
      referer: "https://trusted-provider.example/embed/1",
      fetchImpl: (async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })) as typeof fetch,
      assertImpl: passthroughAssert as never,
    });
    assert.equal(resAllowlisted.status, 200);
  });

  it("normalizes CRLF line endings consistently without delimiter corruption", () => {
    const crlfManifest = `#EXTM3U\r\n#EXT-X-VERSION:4\r\n#EXT-X-KEY:METHOD=AES-128,URI="enc.key"\r\n#EXTINF:10.0,\r\nsegment-001.ts\r\n`;

    const rewritten = gateway.rewriteManifest(
      crlfManifest,
      "https://cdn.example.com/anime/master.m3u8",
      {
        relayPrefix: "/api/v1/playback/manifest",
        allowlist: ["cdn.example.com"],
      },
    );

    assert.equal(rewritten.includes("\r"), false, "must not contain any CR characters");
    const lines = rewritten.split("\n");
    assert.equal(lines[0], "#EXTM3U");
    assert.ok(lines[2].startsWith("#EXT-X-KEY"));
    assert.ok(lines[4].startsWith("/api/v1/playback/manifest"));
  });

  it("does not relay cross-origin child URLs outside allowlist, keeping them direct", () => {
    const manifestWithExternal = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000
https://ad-tracker.untrusted.com/hls/index.m3u8
#EXT-X-MEDIA:TYPE=SUBTITLES,URI="https://ad-tracker.untrusted.com/subs.vtt"
#EXTINF:10.0,
segment-001.ts`;

    const rewritten = gateway.rewriteManifest(
      manifestWithExternal,
      "https://cdn.example.com/anime/master.m3u8",
      {
        relayPrefix: "/api/v1/playback/manifest",
        allowlist: ["cdn.example.com"],
      },
    );

    // Same-origin child lines are rewritten through relayPrefix
    assert.ok(rewritten.includes("/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2F720p%2Findex.m3u8"));
    assert.ok(rewritten.includes("/api/v1/playback/manifest?url=https%3A%2F%2Fcdn.example.com%2Fanime%2Fsegment-001.ts"));

    // Cross-origin untrusted lines remain direct absolute URLs (SSRF protection)
    assert.ok(rewritten.includes("https://ad-tracker.untrusted.com/hls/index.m3u8"));
    assert.ok(!rewritten.includes("/api/v1/playback/manifest?url=https%3A%2F%2Fad-tracker.untrusted.com"));
    assert.ok(rewritten.includes(`URI="https://ad-tracker.untrusted.com/subs.vtt"`));
  });
});

describe("playback relay end-to-end route injection", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function appWithEnabledProxy() {
    (config as any).ENABLE_PLAYBACK_PROXY = true;
    (config as any).playbackProxyAllowlist = ["cdn.example.com"];

    const a = Fastify({ logger: false });
    const resolver = {
      async resolveEpisode() {
        return { result: { sources: [], attempts: [], skipped: [] }, episode: {} };
      },
      health: () => [],
      checkAll: async () => [],
    } as unknown as PlaybackResolver;
    registerPlaybackRoutes(
      a,
      resolver,
      { get: async () => ({}) } as unknown as PlaybackMetadataService,
      {} as AnimeRepository,
    );
    await a.ready();
    return a;
  }

  it("manifest route rejects CRLF in referer parameter with 400", async () => {
    app = await appWithEnabledProxy();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/playback/manifest?url=https://cdn.example.com/1.m3u8&referer=https://bad.example%0d%0aInjected:evil",
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /invalid characters in referer/);
  });

  it("manifest route rejects untrusted referer origin with 400", async () => {
    app = await appWithEnabledProxy();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/playback/manifest?url=https://cdn.example.com/1.m3u8&referer=https://untrusted-attacker.com/evil",
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /untrusted referer origin/);
  });

  it("manifest route fails closed with 400 when proxy is enabled but allowlist is empty", async () => {
    (config as any).ENABLE_PLAYBACK_PROXY = true;
    (config as any).playbackProxyAllowlist = [];

    const a = Fastify({ logger: false });
    const resolver = {
      async resolveEpisode() {
        return { result: { sources: [], attempts: [], skipped: [] }, episode: {} };
      },
      health: () => [],
      checkAll: async () => [],
    } as unknown as PlaybackResolver;
    registerPlaybackRoutes(
      a,
      resolver,
      { get: async () => ({}) } as unknown as PlaybackMetadataService,
      {} as AnimeRepository,
    );
    await a.ready();
    app = a;

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/playback/manifest?url=https://cdn.example.com/1.m3u8",
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /playback proxy allowlist is empty/);
  });
});

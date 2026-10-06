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
  PlaybackGateway,
} from "../src/providers/streaming/gateway.js";
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

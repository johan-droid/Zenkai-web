/**
 * Redirect validation (P8).
 *
 * `fetchWithRedirectValidation` is the only server-side media-adjacent fetch
 * path (HLS manifests and subtitles, relay disabled by default). These tests
 * pin the rule that every redirect hop must pass the URL guard, without a
 * network: both the fetch and the guard are injected.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchWithRedirectValidation } from "../src/providers/streaming/gateway.js";

/** A guard that allows a fixed public prefix and blocks everything private. */
function stubAssert(allowed: string, blocked: RegExp) {
  return async (rawUrl: string) => {
    if (blocked.test(rawUrl)) {
      const { BlockedUrlError } = await import("../src/http/url-guard.js");
      throw new BlockedUrlError(`blocked: ${rawUrl}`);
    }
    if (!rawUrl.startsWith(allowed)) {
      const { BlockedUrlError } = await import("../src/http/url-guard.js");
      throw new BlockedUrlError(`not allowed: ${rawUrl}`);
    }
    return { url: new URL(rawUrl), address: "93.184.216.34" };
  };
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("fetchWithRedirectValidation", () => {
  it("follows a redirect to an allowed host", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: URL | string) => {
      calls.push(String(url));
      if (calls.length === 1) return redirect("https://cdn.example/video.m3u8");
      return new Response("#EXTM3U", { status: 200 });
    };

    const response = await fetchWithRedirectValidation("https://cdn.example/start", {
      allowlist: ["example"],
      fetchImpl: fetchImpl as typeof fetch,
      assertImpl: stubAssert("https://cdn.example", /never/) as never,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["https://cdn.example/start", "https://cdn.example/video.m3u8"]);
  });

  it("blocks a redirect to a private address before it is fetched", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: URL | string) => {
      calls.push(String(url));
      return calls.length === 1
        ? redirect("http://169.254.169.254/latest/meta-data")
        : new Response("metadata", { status: 200 });
    };

    await assert.rejects(
      fetchWithRedirectValidation("https://cdn.example/start", {
        allowlist: ["example"],
        fetchImpl: fetchImpl as typeof fetch,
        assertImpl: stubAssert("https://cdn.example", /169\.254\./) as never,
      }),
      /blocked url: blocked: http:\/\/169\.254\.169\.254/,
    );
    assert.deepEqual(calls, ["https://cdn.example/start"], "the private hop is never fetched");
  });

  it("rejects a credential-bearing redirect target", async () => {
    const fetchImpl = async () => redirect("https://user:pass@cdn.example/x");

    await assert.rejects(
      fetchWithRedirectValidation("https://cdn.example/start", {
        allowlist: ["example"],
        fetchImpl: fetchImpl as typeof fetch,
        assertImpl: stubAssert("https://cdn.example/start", /never/) as never,
      }),
      /bad_request|blocked/,
    );
  });

  it("stops after too many redirects", async () => {
    const fetchImpl = async () => redirect("https://cdn.example/loop");

    await assert.rejects(
      fetchWithRedirectValidation("https://cdn.example/start", {
        allowlist: ["example"],
        fetchImpl: fetchImpl as typeof fetch,
        assertImpl: stubAssert("https://cdn.example", /never/) as never,
      }),
      /too many redirects/,
    );
  });
});

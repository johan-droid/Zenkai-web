/**
 * Embed Player Hardening & Isolation Suite (P0 Remediation)
 *
 * Verifies:
 *  1. Allowed origins strictly match Zenkai approved streaming mirrors
 *  2. isSafeEmbedUrl rejects dangerous protocols (javascript:, data:, file:, blob:)
 *  3. isSafeEmbedUrl rejects internal IP addresses and localhost (SSRF / private network leakage)
 *  4. isSafeEmbedUrl rejects unapproved third-party advertising / tracking domains
 *  5. Subdomain suffix matching strictly requires dot-prefix boundary (.domain.com, not evildomain.com)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALLOWED_EMBED_ORIGINS,
  isAllowedEmbedOrigin,
  isSafeEmbedUrl,
} from "../src/components/player/embed-player";

describe("Embed Player Security & Origin Isolation", () => {
  it("approves official streaming provider origins", () => {
    const validUrls = [
      "https://cdn.4animo.xyz/embed/v2/ep1",
      "https://flixera.co/watch?id=123",
      "https://zangetsu.cc/e/abc456",
      "https://megacloud.tv/embed-2/e-1",
      "https://rapid-cloud.ru/embed-6/stream",
      "https://rabbitstream.net/v2/embed/456",
      "https://animesalt.cc/stream/ep1",
      "https://animesalt.to/stream/ep1",
      "https://novuscloud.buzz/embed/123",
      "https://megaplay.buzz/stream/v1",
      "https://sub.novuscloud.buzz/embed",
    ];

    for (const url of validUrls) {
      assert.equal(isSafeEmbedUrl(url), true, `Approved URL was rejected: ${url}`);
      assert.equal(isAllowedEmbedOrigin(url), true, `Approved origin was rejected: ${url}`);
    }
  });

  it("strictly rejects dangerous non-http protocols (XSS & local file disclosure)", () => {
    const dangerousUrls = [
      "javascript:alert(document.cookie)",
      "JAVASCRIPT:window.location='https://attacker.com'",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "file:///etc/passwd",
      "file://localhost/etc/shadow",
      "blob:https://zenkai.app/123-456",
      "vbscript:msgbox(1)",
    ];

    for (const url of dangerousUrls) {
      assert.equal(isSafeEmbedUrl(url), false, `Dangerous scheme was not rejected: ${url}`);
      assert.equal(isAllowedEmbedOrigin(url), false, `Dangerous scheme origin was not rejected: ${url}`);
    }
  });

  it("strictly rejects localhost, loopback, and private network addresses (SSRF protection)", () => {
    const privateUrls = [
      "http://localhost/embed",
      "http://localhost:3000/embed",
      "http://127.0.0.1:8080/stream",
      "http://127.0.0.1/admin",
      "http://0.0.0.0:4000/api",
      "http://[::1]:3000/stream",
      "http://192.168.1.1/router",
      "http://192.168.0.100:8000/stream",
      "http://10.0.0.1/internal",
      "http://10.244.0.5:8080/pod",
      "http://172.16.0.1/metadata",
      "http://172.31.255.255/internal",
      "http://server.local/stream",
      "http://service.internal/embed",
    ];

    for (const url of privateUrls) {
      assert.equal(isSafeEmbedUrl(url), false, `Private network URL was not rejected: ${url}`);
    }
  });

  it("rejects lookalike / domain prefix spoofing attacks", () => {
    const spoofUrls = [
      "https://fakecdn.4animo.xyz/embed",
      "https://notmegaplay.buzz/stream",
      "https://evilzangetsu.cc/embed",
      "https://novuscloud.buzz.attacker.com/embed",
      "https://attacker.com?mirror=cdn.4animo.xyz",
    ];

    for (const url of spoofUrls) {
      assert.equal(isSafeEmbedUrl(url), false, `Spoofed domain was not rejected: ${url}`);
      assert.equal(isAllowedEmbedOrigin(url), false, `Spoofed domain was not rejected: ${url}`);
    }
  });

  it("rejects unapproved third-party ad networks and malicious redirectors", () => {
    const adUrls = [
      "https://popads.net/serve?ad=123",
      "https://betting-ads.xyz/click",
      "https://malicious-tracker.org/script.js",
      "https://unverified-stream-host.to/watch",
    ];

    for (const url of adUrls) {
      assert.equal(isSafeEmbedUrl(url), false, `Ad network was not rejected: ${url}`);
      assert.equal(isAllowedEmbedOrigin(url), false, `Ad network was not rejected: ${url}`);
    }
  });

  it("handles null, undefined, and malformed strings gracefully without throwing", () => {
    assert.equal(isSafeEmbedUrl(undefined), false);
    assert.equal(isSafeEmbedUrl(""), false);
    assert.equal(isSafeEmbedUrl("not a url"), false);
    assert.equal(isSafeEmbedUrl("://bad"), false);
    assert.equal(isAllowedEmbedOrigin(undefined), false);
    assert.equal(isAllowedEmbedOrigin(""), false);
  });
});


/**
 * Zenkai Web — One Pace Platform Integration & Embed Fallback Tests.
 *
 * Verifies:
 * 1. Dedicated One Pace navigation entry in primaryNav.
 * 2. Active route matching for /one-pace.
 * 3. Verified official destination URLs (onepace.net/en).
 * 4. Header security awareness (X-Frame-Options: SAMEORIGIN).
 * 5. Official link fallback integrity and Grand Line bridge.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import { primaryNav, isActivePath } from "../src/config/nav";

function read(relPath: string): string {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

describe("One Pace Navigation & Platform Integration", () => {
  it("includes dedicated One Pace entry in primaryNav", () => {
    const onePaceNav = primaryNav.find((item) => item.href === "/one-pace");
    assert.ok(onePaceNav, "expected /one-pace entry in primaryNav");
    assert.equal(onePaceNav?.label, "One Pace");
    assert.equal(typeof onePaceNav?.icon, "object");
  });

  it("preserves Grand Line in primaryNav", () => {
    const grandLineNav = primaryNav.find((item) => item.href === "/grand-line");
    assert.ok(grandLineNav, "expected /grand-line entry to remain intact");
  });

  it("correctly identifies active route for /one-pace", () => {
    assert.equal(isActivePath("/one-pace", "/one-pace"), true);
    assert.equal(isActivePath("/one-pace/overview", "/one-pace"), true);
    assert.equal(isActivePath("/grand-line", "/one-pace"), false);
    assert.equal(isActivePath("/", "/one-pace"), false);
  });
});

describe("One Pace Page Architecture & Fallback Safeguards", () => {
  const pageSource = read("src/app/(main)/one-pace/page.tsx");

  it("references verified official One Pace HTTPS endpoints", () => {
    assert.ok(pageSource.includes("https://onepace.net/en"));
    assert.ok(pageSource.includes("https://onepace.net/en/watch"));
    assert.ok(pageSource.includes("https://onepace.net/en/releases"));
    assert.ok(pageSource.includes("https://onepace.net/en/about"));
    assert.ok(pageSource.includes("https://onepace.carrd.co"));
  });

  it("explicitly accounts for X-Frame-Options SAMEORIGIN without attempting bypass", () => {
    assert.ok(
      pageSource.includes("X-Frame-Options") || pageSource.includes("SAMEORIGIN"),
      "page must explicitly communicate security header restrictions",
    );
    // Ensure no header stripping proxy is referenced
    assert.ok(!pageSource.includes("cors-anywhere"));
    assert.ok(!pageSource.includes("allorigins"));
  });

  it("opens official links with secure target=_blank and rel=noopener noreferrer", () => {
    assert.ok(pageSource.includes('target="_blank"'));
    assert.ok(pageSource.includes('rel="noopener noreferrer"'));
  });

  it("bridges to Zenkai Grand Line tracker", () => {
    assert.ok(
      pageSource.includes('href="/grand-line"'),
      "page should provide access to the in-app Grand Line voyage tracker",
    );
  });
});

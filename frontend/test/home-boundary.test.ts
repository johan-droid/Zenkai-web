/**
 * P12 architectural gate: the migrated Home path must not touch a metadata
 * provider.
 *
 * The backend is the provider boundary. This test scans every executable
 * module of the migrated home surface and fails if a provider client, the
 * browser-side source registry/resolver, or a provider host URL reappears in
 * the path. It is deliberately static: a future import is caught before it
 * ever runs in a browser.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Every executable module of the migrated Home surface (P12). */
const HOME_PATH_MODULES = [
  "src/app/(main)/page.tsx",
  "src/components/home/media-row.tsx",
  "src/components/home/hero-carousel.tsx",
  "src/components/home/genre-chips.tsx",
  "src/components/home/continue-row.tsx",
  "src/components/home/features-banner.tsx",
  "src/components/home/cta-banner.tsx",
  "src/hooks/use-home.ts",
  "src/lib/api/zenkai.ts",
] as const;

/** Frontend provider clients and the duplicated source-resolution stack. */
const FORBIDDEN_MODULES = [
  "lib/api/anilist",
  "lib/api/mangadex",
  "lib/api/aniskip",
  "lib/sources/registry",
  "lib/sources/resolver",
  "schemas/anilist",
  "schemas/mangadex",
];

/** Direct provider endpoints the frontend must never request. */
const PROVIDER_HOSTS = [
  "graphql.anilist.co",
  "api.mangadex.org",
  "uploads.mangadex.org",
  "api.aniskip.com",
];

function read(srcRelative: string): string {
  return readFileSync(new URL(`../${srcRelative}`, import.meta.url), "utf8");
}

describe("home provider boundary", () => {
  it("keeps every home module free of provider imports", () => {
    for (const path of HOME_PATH_MODULES) {
      const source = read(path);
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.ok(
          !source.includes(forbidden),
          `${path} imports the direct-provider module "${forbidden}"`,
        );
      }
    }
  });

  it("keeps provider host URLs out of the home path", () => {
    for (const path of HOME_PATH_MODULES) {
      const source = read(path);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(!source.includes(host), `${path} references provider host ${host}`);
      }
    }
  });

  it("wires home shelves to the canonical client (positive control)", () => {
    const page = read("src/app/(main)/page.tsx");
    assert.ok(
      page.includes("lib/api/zenkai"),
      "home page no longer reads the canonical client — the migration regressed",
    );
    assert.ok(
      page.includes("useHome"),
      "home page no longer uses the canonical home query",
    );

    const client = read("src/lib/api/zenkai.ts");
    assert.ok(client.includes("/api/v1/home"), "canonical client lost the home endpoint");
    assert.ok(client.includes("/api/v1/genres"), "canonical client lost the genres endpoint");
    assert.ok(client.includes("/api/v1/manga"), "canonical client lost the manga endpoint");
  });

  it("does not expose provider credentials to the browser", () => {
    for (const path of HOME_PATH_MODULES) {
      const source = read(path);
      for (const secret of ["Bearer", "Authorization:", "client_secret", "api_key", "apiKey"]) {
        assert.ok(!source.includes(secret), `${path} may carry a provider credential`);
      }
    }
  });
});

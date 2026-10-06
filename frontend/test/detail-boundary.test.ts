/**
 * P13 architectural gate: the anime detail surface must not touch a metadata
 * provider or the legacy detail client.
 *
 * The backend owns metadata resolution. This test scans every executable
 * module of the migrated anime detail path and fails if a provider client, the
 * browser-side source stack, or a provider host URL reappears — or if the
 * anime route is re-wired through the anilist-backed manga view. It is
 * deliberately static: a future import is caught before it ever runs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Every executable module of the migrated anime detail surface (P13). */
const ANIME_DETAIL_PATH_MODULES = [
  "src/app/(main)/anime/[id]/page.tsx",
  "src/components/detail/anime-detail-view.tsx",
  "src/components/detail/detail-layout.tsx",
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

describe("anime detail provider boundary", () => {
  it("keeps every anime detail module free of provider imports", () => {
    for (const path of ANIME_DETAIL_PATH_MODULES) {
      const source = read(path);
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.ok(
          !source.includes(forbidden),
          `${path} imports the direct-provider module "${forbidden}"`,
        );
      }
    }
  });

  it("addresses no provider host from the anime detail path", () => {
    for (const path of ANIME_DETAIL_PATH_MODULES) {
      const source = read(path);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(
          !source.includes(host),
          `${path} references the direct provider host ${host}`,
        );
      }
    }
  });

  it("does not re-wire the anime route through the anilist-backed manga view", () => {
    const page = read("src/app/(main)/anime/[id]/page.tsx");
    assert.ok(
      !page.includes("media-detail-view"),
      "the anime route must render AnimeDetailView, never the anilist-backed view",
    );
    assert.ok(
      page.includes("anime-detail-view"),
      "the anime route must import the canonical AnimeDetailView",
    );
  });
});
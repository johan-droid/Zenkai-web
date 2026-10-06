/**
 * P15 architectural gate: the search path must reach the catalogue only
 * through the canonical backend.
 *
 * Search was the last surface still calling a provider from the browser. The
 * rule this file protects is the whole point of the migration: exactly one
 * frontend search boundary, in `lib/api/zenkai`, and no provider client, host or
 * schema anywhere in the search UI.
 *
 * Two halves. The behavioural half stubs `fetch` and asserts the canonical
 * endpoint is what actually gets requested — a source scan cannot prove a
 * request never happens. The structural half covers the parts a runtime test
 * cannot reach, including the palette, which has no test harness of its own.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { fetchAnimeSearch, ZENKAI_API_URL } from "../src/lib/api/zenkai";

/** Every executable module of the search surface. */
const SEARCH_PATH_MODULES = [
  "src/components/search/search-view.tsx",
  "src/components/search/search-command.tsx",
] as const;

/** Frontend provider clients. A comment may name them; an import may not. */
const FORBIDDEN_MODULES = [
  "lib/api/anilist",
  "lib/api/mangadex",
  "lib/api/aniskip",
  "lib/sources/registry",
  "lib/sources/resolver",
];

/** Direct provider endpoints the browser must never request for search. */
const PROVIDER_HOSTS = ["graphql.anilist.co", "api.mangadex.org", "api.aniskip.com"];

function read(srcRelative: string): string {
  return readFileSync(new URL(`../${srcRelative}`, import.meta.url), "utf8");
}

describe("search provider boundary", () => {
  it("requests the canonical search endpoint and no provider host", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ query: "titan", limit: 30, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await fetchAnimeSearch("titan", 30);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.startsWith(`${ZENKAI_API_URL}/api/v1/anime/search`), `unexpected search URL: ${calls[0]}`);
    for (const host of PROVIDER_HOSTS) {
      assert.ok(!calls.some((url) => url.includes(host)), `search requested ${host}`);
    }
  });

  it("keeps every search module free of provider imports", () => {
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.ok(!source.includes(forbidden), `${path} imports the provider module "${forbidden}"`);
      }
    }
  });

  it("addresses no provider host from the search path", () => {
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(!source.includes(host), `${path} references the provider host ${host}`);
      }
    }
  });

  it("routes both the page and the palette through the one canonical client", () => {
    // §8: two search implementations is how a provider call creeps back in.
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      assert.ok(
        source.includes("lib/api/zenkai"),
        `${path} must read search through lib/api/zenkai`,
      );
    }
    // The palette's pre-search shelf is search-adjacent and used to be a
    // provider sort, so it is pinned to the canonical client too.
    assert.ok(
      read("src/components/search/search-command.tsx").includes("fetchDiscovery"),
      "the palette's trending shelf must come from the canonical client",
    );
  });

  it("keys the search cache by the search term", () => {
    // Stale-result protection is the cache key: drop the term from it and a new
    // query is answered from the previous one's entry, so the user sees the
    // wrong titles for what they typed. Nothing renders these components in a
    // test, so the invariant is asserted where it is actually written.
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      const keys = source.match(/queryKey: \[[^\]]*\]/g) ?? [];
      assert.ok(
        keys.some((key) => /(trimmed|debounced)/.test(key)),
        `${path}: the search cache must be keyed by the term`,
      );
    }
  });

  it("gates the request on a minimum query length", () => {
    // Below the threshold no request is made, so typing cannot fan out into a
    // request per keystroke.
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      assert.ok(
        source.includes("SEARCH_MIN_LENGTH"),
        `${path} must not search below the minimum query length`,
      );
    }
  });

  it("renders a distinct error state instead of an empty result", () => {
    for (const path of SEARCH_PATH_MODULES) {
      const source = read(path);
      assert.ok(
        /isError|state\.kind === "error"/.test(source),
        `${path} must handle a failed search explicitly`,
      );
      // The decisive half. Having both render branches proves nothing if the
      // page can hand `searchState` a failure-free view of the query: that is
      // how a 503 silently becomes "no results". Deciding what counts as an
      // error is the client's job, not the page's.
      assert.ok(
        !source.includes("isError: false"),
        `${path} must not construct a non-error state for a query that failed`,
      );
    }
    const page = read("src/components/search/search-view.tsx");
    assert.ok(
      page.includes('state.kind === "empty"') && page.includes('state.kind === "error"'),
      "the page must keep empty and error as separate branches",
    );
    assert.ok(
      /flags: query\b/.test(page),
      "the page must hand the live query to searchState rather than a rebuilt flags object",
    );
  });

  it("does not render provider-supplied markup as HTML", () => {
    for (const path of SEARCH_PATH_MODULES) {
      assert.ok(
        !read(path).includes("dangerouslySetInnerHTML"),
        `${path} must not render search results as raw HTML`,
      );
    }
  });
});
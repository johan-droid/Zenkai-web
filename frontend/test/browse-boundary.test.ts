/**
 * P17 Stage 1 tests: the canonical browse boundary.
 *
 * `/anime` and `/manga` were the last catalogue surfaces still calling a
 * metadata provider from the browser. These tests pin what the migration must
 * guarantee:
 *
 *   - every request goes to the configured Zenkai API origin, never to a
 *     provider (AniList, MangaDex, or any other upstream);
 *   - "trending" is routed to the discovery endpoint, because the catalogue
 *     route rejects it as an unknown sort;
 *   - manga's page/perPage UI pagination is translated to limit/offset once,
 *     at the boundary;
 *   - pagination state is derived, not trusted: `page * perPage < total` for
 *     the anime catalogue, `offset + items.length < total` for manga;
 *   - a 400 stays a 400 and a 503 stays a 503 — neither is rendered as an
 *     empty catalogue;
 *   - malformed payloads are contract violations, never fabricated rows.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  fetchAnimeBrowse,
  fetchAnimeTrendingBrowse,
  fetchBrowsePage,
  fetchMangaBrowse,
  ZenkaiContractError,
  ZENKAI_API_URL,
} from "../src/lib/api/zenkai";
import { HttpError } from "../src/lib/api/http";

const canonicalCard = {
  id: "713fc2b3-c4ce-4504-b29c-fb4e3e529193",
  anilistId: "209219",
  title: "So What's Wrong with Getting Reborn as a Goblin?",
  titles: {
    romaji: "Tensei Goblin Dakedo Shitsumon Aru?",
    english: "So What's Wrong with Getting Reborn as a Goblin?",
    native: null,
    synonyms: [],
  },
  coverUrl: null,
  coverImageLarge: null,
  bannerUrl: null,
  format: "TV",
  status: "RELEASING",
  season: null,
  seasonYear: null,
  year: 2026,
  averageScore: null,
  totalEpisodes: 12,
  popularity: 4761,
  genres: ["Action"],
  isAdult: false,
};

const mangaRow = {
  id: "local-uuid-1",
  mangadexId: "a1b2c3d4",
  canonicalTitle: "Some Manga",
  coverUrl: null,
  coverImageLarge: null,
  bannerUrl: null,
  status: "ONGOING",
  year: 2024,
  totalChapters: 42,
  totalVolumes: 5,
};

let calls: string[] = [];
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const { status, body } = handler(url);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Hosts the browser must never contact for catalogue data. */
const FORBIDDEN = ["graphql.anilist.co", "api.mangadex.org", "api.aniskip.com"];

function assertCanonicalOnly() {
  assert.ok(calls.length > 0, "expected at least one request");
  for (const url of calls) {
    assert.ok(
      url.startsWith(ZENKAI_API_URL),
      `non-canonical request: ${url}`,
    );
    for (const host of FORBIDDEN) {
      assert.ok(!url.includes(host), `provider request: ${url}`);
    }
  }
}

describe("fetchAnimeBrowse", () => {
  it("queries the canonical catalogue with filters and sort", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [canonicalCard], page: 2, perPage: 20, total: 57 },
    }));

    const result = await fetchAnimeBrowse({
      page: 2,
      perPage: 20,
      genre: "Action",
      format: "TV",
      status: "RELEASING",
      sort: "score",
    });

    assert.equal(calls.length, 1);
    const url = new URL(calls[0]!);
    assert.equal(url.pathname, "/api/v1/anime");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("genre"), "Action");
    assert.equal(url.searchParams.get("format"), "TV");
    assert.equal(url.searchParams.get("status"), "RELEASING");
    assert.equal(url.searchParams.get("sort"), "score");
    assert.equal(result.total, 57);
    assert.equal(result.items[0]?.anilistId, "209219");
    assertCanonicalOnly();
  });

  it("rejects a payload missing the catalogue envelope", async () => {
    stubFetch(() => ({ status: 200, body: { items: [canonicalCard] } }));
    await assert.rejects(() => fetchAnimeBrowse({}), ZenkaiContractError);
  });

  it("propagates a 400 as a 400, not as an empty page", async () => {
    stubFetch(() => ({ status: 400, body: { reason: "bad_request" } }));
    await assert.rejects(
      () => fetchAnimeBrowse({ sort: "TRENDING_DESC" }),
      (error: unknown) =>
        error instanceof HttpError && error.status === 400,
    );
  });
});

describe("fetchAnimeTrendingBrowse", () => {
  it("uses the discovery route, carrying the browse filters", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        items: [canonicalCard],
        page: 1,
        perPage: 20,
        hasNextPage: true,
        total: null,
        source: "provider",
      },
    }));

    const result = await fetchAnimeTrendingBrowse({
      page: 1,
      perPage: 20,
      genre: "Drama",
      format: "MOVIE",
      status: "FINISHED",
    });

    const url = new URL(calls[0]!);
    assert.equal(url.pathname, "/api/v1/anime/discovery/trending");
    assert.equal(url.searchParams.get("genre"), "Drama");
    assert.equal(url.searchParams.get("format"), "MOVIE");
    assert.equal(result.hasNextPage, true);
    assertCanonicalOnly();
  });
});

describe("fetchMangaBrowse", () => {
  it("translates page/perPage into limit/offset exactly once", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [mangaRow], total: 100, limit: 20, offset: 40 },
    }));

    const result = await fetchMangaBrowse({
      page: 3,
      perPage: 20,
      genre: "action",
      status: "ONGOING",
      sort: "rating",
    });

    const url = new URL(calls[0]!);
    assert.equal(url.pathname, "/api/v1/manga");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(url.searchParams.get("offset"), "40");
    assert.equal(url.searchParams.get("genre"), "action");
    assert.equal(url.searchParams.get("sort"), "rating");
    assert.equal(result.total, 100);
    assertCanonicalOnly();
  });

  it("propagates a 503 as an outage, not as an empty catalogue", async () => {
    stubFetch(() => ({ status: 503, body: { reason: "unavailable" } }));
    await assert.rejects(
      () => fetchMangaBrowse({}),
      (error: unknown) =>
        error instanceof HttpError && error.status === 503,
    );
  });
});

describe("fetchBrowsePage", () => {
  it("routes anime trending to discovery and keeps the provider page state", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        items: [canonicalCard],
        page: 1,
        perPage: 20,
        hasNextPage: true,
        total: null,
        source: "provider",
      },
    }));

    const page = await fetchBrowsePage("anime", { sort: "trending" }, 1, 20);

    assert.equal(new URL(calls[0]!).pathname, "/api/v1/anime/discovery/trending");
    assert.equal(page.hasNextPage, true);
    assert.equal(page.items[0]?.kind, "anime");
    assert.equal(page.items[0]?.provider, "zenkai");
    assertCanonicalOnly();
  });

  it("never sends sort=trending to the catalogue route", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        items: [],
        page: 1,
        perPage: 20,
        hasNextPage: false,
        total: null,
        source: "provider",
      },
    }));

    await fetchBrowsePage("anime", { sort: "trending" }, 1, 20);

    for (const url of calls) {
      const parsed = new URL(url);
      if (parsed.pathname === "/api/v1/anime") {
        assert.notEqual(parsed.searchParams.get("sort"), "trending");
      }
    }
  });

  it("derives anime catalogue hasNextPage from page, perPage and total", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [canonicalCard], page: 2, perPage: 20, total: 57 },
    }));

    const page = await fetchBrowsePage("anime", { sort: "score" }, 2, 20);

    assert.equal(new URL(calls[0]!).pathname, "/api/v1/anime");
    assert.equal(new URL(calls[0]!).searchParams.get("sort"), "score");
    assert.equal(page.hasNextPage, true);
    assert.equal(page.total, 57);
  });

  it("detects the last anime catalogue page", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [canonicalCard], page: 3, perPage: 20, total: 57 },
    }));

    const page = await fetchBrowsePage("anime", { sort: "score" }, 3, 20);
    assert.equal(page.hasNextPage, false);
  });

  it("derives manga hasNextPage from offset, page size and total", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [mangaRow], total: 41, limit: 20, offset: 40 },
    }));

    const page = await fetchBrowsePage("manga", { sort: "followed" }, 3, 20);

    assert.equal(new URL(calls[0]!).pathname, "/api/v1/manga");
    assert.equal(page.hasNextPage, false);
    assert.equal(page.items[0]?.kind, "manga");
    assert.equal(page.items[0]?.provider, "zenkai");
    assertCanonicalOnly();
  });

  it("keeps an empty catalogue distinct from an outage", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: [], total: 0, limit: 20, offset: 0 },
    }));

    const page = await fetchBrowsePage("manga", { sort: "followed" }, 1, 20);
    assert.deepEqual(page.items, []);
    assert.equal(page.total, 0);
    assert.equal(page.hasNextPage, false);
  });
});

/**
 * P15 contract tests: the canonical anime search client and its UI states.
 *
 * Search used to be a browser-side AniList call. These tests pin the migrated
 * behaviour at the network boundary: the request goes to
 * `/api/v1/anime/search` with the query in `q`, results are Zod-validated
 * against the shared discovery-card contract, and — the part that actually
 * protects users — an empty result set stays distinguishable from a backend
 * that could not answer.
 *
 * Nothing here touches a provider. The frontend's relationship is with Zenkai,
 * so that is the only thing these tests know how to stub.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  classifySearchError,
  discoveryCardToMedia,
  fetchAnimeSearch,
  searchState,
  SEARCH_MIN_LENGTH,
  ZenkaiContractError,
  ZENKAI_API_URL,
} from "../src/lib/api/zenkai";
import { HttpError } from "../src/lib/api/http";

/** A canonical discovery card, exactly as the search endpoint returns one. */
const canonicalCard = {
  id: "0f6a2f14-1f4a-4a1e-9c3d-2b7e5a9d0c11",
  anilistId: "16498",
  title: "Attack on Titan",
  titles: {
    romaji: "Shingeki no Kyojin",
    english: "Attack on Titan",
    native: "進撃の巨人",
    synonyms: ["AoT", "SnK"],
  },
  coverUrl: "https://img.example.com/cover.jpg",
  coverImageLarge: "https://img.example.com/cover-large.jpg",
  bannerUrl: null,
  format: "TV",
  status: "FINISHED",
  season: "SPRING",
  seasonYear: 2013,
  year: 2013,
  averageScore: 84,
  totalEpisodes: 25,
  popularity: 500_000,
  genres: ["Action", "Drama"],
  isAdult: false,
};

let calls: Array<{ url: string; init?: RequestInit }> = [];
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = handler(url);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return error;
  }
}

describe("fetchAnimeSearch", () => {
  it("requests the canonical endpoint with q and limit", async () => {
    stubFetch(() => ({ status: 200, body: { query: "titan", limit: 30, items: [canonicalCard] } }));

    const result = await fetchAnimeSearch("titan", 30);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/anime/search?q=titan&limit=30`);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.title, "Attack on Titan");
  });

  it("encodes the query rather than splicing it into the path", async () => {
    stubFetch(() => ({ status: 200, body: { query: "x", limit: 30, items: [] } }));

    await fetchAnimeSearch("attack on titan & more", 30);

    const url = new URL(calls[0]!.url);
    assert.equal(url.pathname, "/api/v1/anime/search");
    // The value survives as data, so a title containing & or # cannot add a
    // parameter of its own.
    assert.equal(url.searchParams.get("q"), "attack on titan & more");
    assert.equal([...url.searchParams.keys()].sort().join(","), "limit,q");
  });

  it("never addresses a provider host", async () => {
    stubFetch(() => ({ status: 200, body: { query: "titan", limit: 30, items: [] } }));

    await fetchAnimeSearch("titan", 30);

    for (const call of calls) {
      assert.ok(
        call.url.startsWith(ZENKAI_API_URL),
        `search requested a non-Zenkai host: ${call.url}`,
      );
      assert.ok(!/anilist|aniskip|mangadex/i.test(call.url), `provider host in ${call.url}`);
    }
  });

  it("accepts an empty result set as a successful search", async () => {
    stubFetch(() => ({ status: 200, body: { query: "zzzzz", limit: 30, items: [] } }));

    const result = await fetchAnimeSearch("zzzzz", 30);

    assert.deepEqual(result.items, []);
  });

  it("rejects a payload that fails the card contract", async () => {
    stubFetch(() => ({
      status: 200,
      body: { query: "titan", limit: 30, items: [{ ...canonicalCard, title: 42 }] },
    }));

    const error = await capture(() => fetchAnimeSearch("titan", 30));
    assert.ok(error instanceof ZenkaiContractError);
  });

  it("rejects a payload that is not a search envelope at all", async () => {
    stubFetch(() => ({ status: 200, body: { results: [canonicalCard] } }));

    const error = await capture(() => fetchAnimeSearch("titan", 30));
    assert.ok(error instanceof ZenkaiContractError);
  });

  it("does not require provider-only fields to be present", async () => {
    // A card with no score and no banner is a real, valid card.
    stubFetch(() => ({
      status: 200,
      body: {
        query: "titan",
        limit: 30,
        items: [{ ...canonicalCard, averageScore: null, bannerUrl: null, genres: [] }],
      },
    }));

    const result = await fetchAnimeSearch("titan", 30);
    assert.equal(result.items[0]!.averageScore, null);
  });

  it("surfaces a backend failure as a failure, not an empty result", async () => {
    stubFetch(() => ({ status: 503, body: { error: "unavailable" } }));

    const error = await capture(() => fetchAnimeSearch("titan", 30));

    assert.ok(error instanceof HttpError);
    assert.equal((error as HttpError).status, 503);
    // The decisive part: it threw. An outage must never look like "no matches".
    assert.ok(!(error instanceof Array));
  });
});

describe("classifySearchError", () => {
  it("treats a 400 as a bad request", () => {
    assert.equal(classifySearchError(new HttpError("bad", { url: "u", status: 400 })), "bad_request");
  });

  it("treats a contract violation as invalid_response", () => {
    assert.equal(classifySearchError(new ZenkaiContractError("u", ["bad"])), "invalid_response");
  });

  it("treats any other failure as unavailable", () => {
    assert.equal(classifySearchError(new HttpError("down", { url: "u", status: 503 })), "unavailable");
    assert.equal(classifySearchError(new Error("socket hang up")), "unavailable");
  });
});

describe("searchState", () => {
  const loaded = { isLoading: false, isError: false };

  it("is idle below the minimum query length", () => {
    assert.deepEqual(searchState({ term: "a", flags: { isLoading: false, isError: true } }), {
      kind: "idle",
    });
    assert.equal(SEARCH_MIN_LENGTH, 2);
  });

  it("is idle for whitespace, not a request for a blank term", () => {
    assert.deepEqual(searchState({ term: "   ", flags: loaded }), { kind: "idle" });
  });

  it("is loading before any data has arrived", () => {
    assert.deepEqual(searchState({ term: "titan", flags: { isLoading: true, isError: false } }), {
      kind: "loading",
    });
  });

  it("is empty for a successful search that matched nothing", () => {
    assert.deepEqual(searchState({ term: " titan ", flags: loaded, items: [] }), {
      kind: "empty",
      query: "titan",
    });
  });

  it("is items when results exist", () => {
    const items = [discoveryCardToMedia(canonicalCard, "anime")];
    const state = searchState({ term: "titan", flags: loaded, items });
    assert.equal(state.kind, "items");
    assert.equal(state.kind === "items" ? state.items.length : 0, 1);
  });

  it("is an error, never empty, when the backend could not answer", () => {
    const state = searchState({
      term: "titan",
      flags: { isLoading: false, isError: true, error: new HttpError("x", { url: "u", status: 503 }) },
      items: [],
    });
    assert.equal(state.kind, "error");
    assert.equal(state.kind === "error" ? state.reason : "", "unavailable");
    // The copy must not read as "no matches".
    assert.ok(
      state.kind === "error" && !/no results|no matches/i.test(state.message),
      "an outage must not be presented as an empty result set",
    );
  });

  it("does not leave a previous query's results on screen after a failure", () => {
    const stale = [discoveryCardToMedia(canonicalCard, "anime")];
    const state = searchState({
      term: "titan",
      flags: { isLoading: false, isError: true, error: new Error("boom") },
      items: stale,
    });
    assert.equal(state.kind, "error");
  });

  it("waits rather than inventing an empty state before data lands", () => {
    assert.deepEqual(searchState({ term: "titan", flags: loaded }), { kind: "loading" });
  });
});

describe("search result identity", () => {
  it("routes a result through the cross-reference id, not the catalogue uuid", () => {
    const media = discoveryCardToMedia(canonicalCard, "anime");
    assert.equal(media.id, "16498");
    assert.equal(media.kind, "anime");
  });

  it("falls back to the catalogue uuid when the cross-reference id is empty", () => {
    const media = discoveryCardToMedia({ ...canonicalCard, anilistId: "" }, "anime");
    assert.equal(media.id, canonicalCard.id);
  });

  it("never carries a provider name into the UI model", () => {
    const media = discoveryCardToMedia(canonicalCard, "anime");
    assert.equal(media.provider, "zenkai");
  });
});
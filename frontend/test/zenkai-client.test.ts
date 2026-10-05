/**
 * P12 contract tests: the frontend's canonical API boundary.
 *
 * Every response is validated against the P2 contract, and the tests below
 * pin the behaviours the migration depends on: malformed payloads are
 * rejected (never rendered as fabricated defaults), backend errors surface as
 * errors (never as empty shelves), and the client only ever talks to the
 * configured Zenkai API origin — never to a metadata provider.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  catalogueToShelfState,
  discoveryCardToMedia,
  fetchGenres,
  fetchHome,
  fetchMangaCatalogue,
  homeSectionToShelfState,
  mangaCatalogueItemToMedia,
  ZenkaiContractError,
  ZENKAI_API_URL,
  type HomePayload,
} from "../src/lib/api/zenkai";
import { HttpError } from "../src/lib/api/http";

/** A minimal, fully canonical discovery card — no provider-specific fields. */
const canonicalCard = {
  id: "713fc2b3-c4ce-4504-b29c-fb4e3e529193",
  anilistId: "209219",
  title: "So What's Wrong with Getting Reborn as a Goblin?",
  titles: {
    romaji: "Tensei Goblin Dakedo Shitsumon Aru?",
    english: "So What's Wrong with Getting Reborn as a Goblin?",
    native: "転生ゴブリンだけど質問ある？",
    synonyms: ["Tengobu"],
  },
  coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/x.jpg",
  coverImageLarge: null,
  bannerUrl: null,
  format: "ONA",
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  year: 2026,
  averageScore: null,
  totalEpisodes: null,
  popularity: 4761,
  genres: ["Action", "Comedy"],
  isAdult: false,
};

const homePayload = (overrides: Partial<HomePayload> = {}): HomePayload => ({
  trending: { status: "ok", items: [canonicalCard] },
  popular: { status: "ok", items: [canonicalCard] },
  seasonal: { status: "ok", items: [canonicalCard] },
  recent: { status: "ok", items: [canonicalCard] },
  topRated: { status: "ok", items: [canonicalCard] },
  upcoming: { status: "ok", items: [] },
  ...overrides,
});

type FetchLog = { url: string; init?: RequestInit };

let calls: FetchLog[] = [];
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

describe("fetchHome", () => {
  it("reads the composed home payload from the canonical API", async () => {
    stubFetch(() => ({ status: 200, body: homePayload() }));

    const payload = await fetchHome(10);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/home?perPage=10`);
    assert.equal(payload.trending.status, "ok");
    assert.equal(payload.trending.items.length, 1);
    assert.equal(payload.upcoming.status, "ok");
  });

  it("preserves the unavailable section and its reason instead of flattening it", async () => {
    stubFetch(() => ({
      status: 200,
      body: homePayload({
        trending: { status: "unavailable", items: [], reason: "upstream_error" },
      }),
    }));

    const payload = await fetchHome();

    assert.equal(payload.trending.status, "unavailable");
    assert.equal(payload.trending.reason, "upstream_error");
  });

  it("rejects a malformed payload instead of rendering fabricated defaults", async () => {
    stubFetch(() => ({
      status: 200,
      body: { trending: { status: "ok", items: [{ oops: true }] } },
    }));

    await assert.rejects(
      fetchHome(),
      (error: unknown) => error instanceof ZenkaiContractError,
    );
  });

  it("rejects a payload that is not JSON at all", async () => {
    stubFetch(() => ({ status: 200, body: "<html>bad gateway</html>" }));

    await assert.rejects(
      fetchHome(),
      (error: unknown) =>
        error instanceof ZenkaiContractError ||
        (error instanceof Error && /Unexpected token/i.test(error.message)),
    );
  });

  it("surfaces a backend error instead of converting it into an empty shelf", async () => {
    stubFetch(() => ({ status: 502, body: { error: "internal" } }));

    await assert.rejects(
      fetchHome(),
      (error: unknown) =>
        error instanceof HttpError && (error as HttpError).status === 502,
    );
  });

  it("never calls a metadata provider host", async () => {
    stubFetch(() => ({ status: 200, body: homePayload() }));

    await fetchHome();

    for (const call of calls) {
      assert.ok(
        call.url.startsWith(ZENKAI_API_URL),
        `unexpected non-canonical request: ${call.url}`,
      );
      assert.ok(!/anilist|mangadex|aniskip|consumet|jikan/i.test(call.url));
    }
  });
});

describe("fetchGenres", () => {
  it("returns the catalogue's genre list", async () => {
    stubFetch(() => ({
      status: 200,
      body: { items: ["Action", "Comedy"] },
    }));

    assert.deepEqual(await fetchGenres(), ["Action", "Comedy"]);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/genres`);
  });
});

describe("fetchMangaCatalogue", () => {
  it("reads the catalogue listing", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        items: [
          {
            id: "uuid-1",
            mangadexId: "abc-123",
            canonicalTitle: "Some Manga",
            coverUrl: null,
            coverImageLarge: null,
            bannerUrl: null,
            status: "ONGOING",
            year: 2024,
            totalChapters: 42,
            totalVolumes: 5,
          },
        ],
        total: 1,
        limit: 14,
        offset: 0,
      },
    }));

    const result = await fetchMangaCatalogue(14);
    assert.equal(result.items.length, 1);
    assert.equal(result.total, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/manga?limit=14`);
  });

  it("treats a genuinely empty catalogue as empty, not as an outage", async () => {
    stubFetch(() => ({ status: 200, body: { items: [], total: 0, limit: 14, offset: 0 } }));

    const result = await fetchMangaCatalogue(14);
    const state = catalogueToShelfState(
      result.items.map(mangaCatalogueItemToMedia),
      { isLoading: false, isError: false },
    );

    assert.equal(state.kind, "empty");
  });

  it("keeps a backend failure an error for the catalogue shelf", async () => {
    stubFetch(() => ({ status: 500, body: { error: "internal" } }));

    await assert.rejects(fetchMangaCatalogue(14), HttpError);
  });
});

describe("homeSectionToShelfState", () => {
  const flags = { isLoading: false, isError: false };

  it("renders a populated section", () => {
    const state = homeSectionToShelfState(
      { status: "ok", items: [canonicalCard] },
      flags,
    );
    assert.equal(state.kind, "items");
    assert.equal(state.kind === "items" && state.items.length, 1);
  });

  it("keeps a successful empty bucket empty (never an outage message)", () => {
    const state = homeSectionToShelfState({ status: "ok", items: [] }, flags);
    assert.equal(state.kind, "empty");
  });

  it("keeps an unavailable bucket distinguishable from empty", () => {
    const state = homeSectionToShelfState(
      { status: "unavailable", items: [], reason: "upstream_error" },
      flags,
    );
    assert.equal(state.kind, "unavailable");
    assert.equal(state.kind === "unavailable" && state.reason, "upstream_error");
  });

  it("treats a missing section as unavailable, not empty", () => {
    const state = homeSectionToShelfState(undefined, flags);
    assert.equal(state.kind, "unavailable");
  });

  it("keeps a query error an error", () => {
    const state = homeSectionToShelfState(undefined, {
      isLoading: false,
      isError: true,
    });
    assert.equal(state.kind, "error");
  });

  it("reports loading while the request is in flight", () => {
    const state = homeSectionToShelfState(undefined, {
      isLoading: true,
      isError: false,
    });
    assert.equal(state.kind, "loading");
  });
});

describe("discoveryCardToMedia", () => {
  it("maps canonical fields onto the neutral media model", () => {
    const media = discoveryCardToMedia(canonicalCard);

    assert.equal(media.kind, "anime");
    assert.equal(media.provider, "zenkai");
    assert.equal(media.id, canonicalCard.anilistId);
    assert.equal(display(media), canonicalCard.titles.english);
    assert.equal(media.cover.url, canonicalCard.coverUrl);
    assert.equal(media.format, "ONA");
    assert.equal(media.status, "RELEASING");
    assert.equal(media.seasonYear, 2026);
    assert.equal(media.averageScore, null);
    assert.equal(media.episodes, null);
    assert.deepEqual(media.genres, canonicalCard.genres);
  });

  it("requires no optional canonical field to render", () => {
    const minimal = {
      id: null,
      anilistId: "1",
      title: "Bare",
      titles: { romaji: null, english: null, native: null, synonyms: [] },
      coverUrl: null,
      coverImageLarge: null,
      bannerUrl: null,
      format: null,
      status: null,
      season: null,
      seasonYear: null,
      year: null,
      averageScore: null,
      totalEpisodes: null,
      popularity: null,
      genres: [],
      isAdult: false,
    };

    const media = discoveryCardToMedia(minimal);

    assert.equal(display(media), "Bare");
    assert.equal(media.cover.url, null);
    assert.equal(media.format, "UNKNOWN");
    assert.equal(media.status, "UNKNOWN");
    assert.equal(media.seasonYear, null);
    assert.equal(media.averageScore, null);
    // Unavailable metadata is never invented as zero.
    assert.notEqual(media.averageScore, 0);
  });

  it("falls back to the canonical title for upcoming rows without title variants", () => {
    const media = discoveryCardToMedia({
      ...canonicalCard,
      titles: { romaji: null, english: null, native: null, synonyms: [] },
    });
    assert.equal(display(media), canonicalCard.title);
  });

  it("falls back through the routing id when the cross-reference id is empty", () => {
    const media = discoveryCardToMedia({ ...canonicalCard, anilistId: "" });
    assert.equal(media.id, canonicalCard.id!);
  });

  it("keeps an empty routing id empty when the backend sent no id at all", () => {
    const media = discoveryCardToMedia({ ...canonicalCard, id: null, anilistId: "" });
    assert.equal(media.id, "");
  });

  it("does not fabricate an unrated score as zero", () => {
    const media = discoveryCardToMedia({ ...canonicalCard, averageScore: null });
    assert.equal(media.averageScore, null);
  });
});

describe("mangaCatalogueItemToMedia", () => {
  it("maps the catalogue row without inventing a score", () => {
    const media = mangaCatalogueItemToMedia({
      id: "uuid-1",
      mangadexId: "abc-123",
      canonicalTitle: "Some Manga",
      coverUrl: null,
      coverImageLarge: null,
      bannerUrl: null,
      status: "ONGOING",
      year: 2024,
      totalChapters: 42,
      totalVolumes: 5,
    });

    assert.equal(media.kind, "manga");
    assert.equal(media.provider, "zenkai");
    assert.equal(media.id, "abc-123");
    assert.equal(display(media), "Some Manga");
    assert.equal(media.chapters, 42);
    assert.equal(media.averageScore, null);
  });
});

function display(media: ReturnType<typeof discoveryCardToMedia>): string {
  const candidate = media.title.preferred ?? media.title.english ?? media.title.romaji;
  return (candidate ?? "").trim();
}

/**
 * P13 contract tests: canonical anime detail client.
 *
 * Pins the behaviours the migration depends on: the detail surface reads one
 * canonical endpoint, payloads outside the contract are rejected (never
 * rendered as defaults), 404/backend-error/invalid-response stay three
 * distinguishable failures, relations and airing map from canonical fields,
 * and the episode count comes from the backend — the UI computes none of its
 * own episode maths.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  animeDetailToDetailData,
  classifyDetailError,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
  fetchEpisodeNavigation,
  ZenkaiContractError,
  ZENKAI_API_URL,
} from "../src/lib/api/zenkai";
import { HttpError } from "../src/lib/api/http";

/** A fully canonical detail payload, exactly as GET /api/v1/anime/:id returns it. */
const canonicalDetail = {
  anilistId: "209219",
  titles: {
    romaji: "Tensei Goblin Dakedo Shitsumon Aru?",
    english: "So What's Wrong with Getting Reborn as a Goblin?",
    native: "転生ゴブリンだけど質問ある？",
    synonyms: ["Tengobu"],
  },
  canonicalTitle: "So What's Wrong with Getting Reborn as a Goblin?",
  description: "A goblin asks questions.",
  coverUrl: "https://s4.anilist.co/small/x.jpg",
  coverImageLarge: "https://s4.anilist.co/large/x.jpg",
  bannerUrl: null,
  format: "ONA",
  status: "RELEASING",
  year: 2026,
  season: "FALL",
  seasonYear: 2026,
  averageScore: null,
  popularity: 4761,
  totalEpisodes: 12,
  durationMinutes: 24,
  genres: ["Action", "Comedy"],
  relations: [
    { type: "SEQUEL", anilistId: 209220, title: "Goblin 2", coverUrl: "https://s4.anilist.co/s/y.jpg" },
  ],
  nextAiringEpisode: { episode: 3, airingAt: 1_800_000_000, timeUntilAiring: 86_400 },
};

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

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return error;
  }
}

describe("fetchAnimeDetail", () => {
  it("reads the canonical detail endpoint", async () => {
    stubFetch(() => ({ status: 200, body: canonicalDetail }));

    const payload = await fetchAnimeDetail("209219");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/anime/209219`);
    assert.equal(payload.anilistId, "209219");
    assert.equal(payload.relations.length, 1);
    assert.equal(payload.totalEpisodes, 12);
  });

  it("keeps a 404 a 404 instead of null", async () => {
    stubFetch(() => ({ status: 404, body: { message: "anime 999 not found" } }));

    const outcome = await capture(() => fetchAnimeDetail("999"));

    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 404);
    assert.equal(classifyDetailError(outcome), "not_found");
  });

  it("surfaces a backend failure as an error, never as data", async () => {
    stubFetch(() => ({ status: 500 }));

    const outcome = await capture(() => fetchAnimeDetail("209219"));

    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 500);
    assert.equal(classifyDetailError(outcome), "unavailable");
  });

  it("rejects a payload that fails the contract", async () => {
    stubFetch(() => ({ status: 200, body: { oops: true } }));

    const outcome = await capture(() => fetchAnimeDetail("209219"));

    assert.ok(outcome instanceof ZenkaiContractError);
    assert.equal(classifyDetailError(outcome), "invalid_response");
  });

  it("classifies a transport failure as unavailable", () => {
    assert.equal(classifyDetailError(new TypeError("fetch failed")), "unavailable");
  });
});

describe("animeDetailToDetailData", () => {
  it("maps canonical fields onto the UI model", () => {
    const data = animeDetailToDetailData(canonicalDetail);

    assert.equal(data.summary.id, "209219");
    assert.equal(data.summary.title.preferred, canonicalDetail.canonicalTitle);
    assert.equal(data.summary.cover.url, canonicalDetail.coverImageLarge);
    assert.equal(data.summary.banner, canonicalDetail.bannerUrl);
    assert.equal(data.summary.format, "ONA");
    assert.equal(data.summary.status, "RELEASING");
    assert.equal(data.summary.seasonYear, 2026);
    assert.equal(data.summary.episodes, 12);
    assert.equal(data.summary.genres.join(","), "Action,Comedy");
    assert.equal(data.summary.averageScore, null);
  });

  it("maps canonical relations to cards keyed by cross-reference id", () => {
    const data = animeDetailToDetailData(canonicalDetail);

    assert.equal(data.relations.length, 1);
    assert.equal(data.relations[0]!.relationType, "SEQUEL");
    assert.equal(data.relations[0]!.media.id, "209220");
    assert.equal(data.relations[0]!.media.title.preferred, "Goblin 2");
    assert.equal(data.relations[0]!.media.cover.url, "https://s4.anilist.co/s/y.jpg");
    // The contract carries no score for a relation card: absent, not invented.
    assert.equal(data.relations[0]!.media.averageScore, null);
    assert.equal(data.relations[0]!.media.format, "UNKNOWN");
  });

  it("keeps empty relations as empty, not fabricated", () => {
    const data = animeDetailToDetailData({ ...canonicalDetail, relations: [] });

    assert.deepEqual(data.relations, []);
  });

  it("carries the canonical airing slot through", () => {
    const data = animeDetailToDetailData(canonicalDetail);

    assert.equal(data.airing?.episode, 3);
    assert.equal(data.airing?.airingAt, 1_800_000_000);
    assert.equal(data.airing?.timeUntilAiring, 86_400);
  });

  it("leaves airing null when the backend has no slot", () => {
    const data = animeDetailToDetailData({ ...canonicalDetail, nextAiringEpisode: null });

    assert.equal(data.airing, null);
  });

  it("reports an unknown status as UNKNOWN, never an invented state", () => {
    const data = animeDetailToDetailData({ ...canonicalDetail, status: "SOME_PROVIDER_THING" });

    assert.equal(data.summary.status, "UNKNOWN");
  });

  it("keeps a missing episode total null instead of zero", () => {
    const data = animeDetailToDetailData({ ...canonicalDetail, totalEpisodes: null });

    assert.equal(data.summary.episodes, null);
  });

  it("exposes no recommendations or characters the contract lacks", () => {
    const data = animeDetailToDetailData(canonicalDetail);

    assert.deepEqual(data.recommendations, []);
    assert.deepEqual(data.characters, []);
  });
});

describe("fetchAnimeEpisodes", () => {
  const catalogue = {
    anilistId: "209219",
    episodes: [
      {
        id: "ep-1",
        episodeNumber: 1,
        absoluteNumber: 1,
        title: "A Goblin Is Born",
        description: null,
        durationSeconds: 1440,
        thumbnailUrl: null,
        isFiller: false,
        airingAt: "2026-01-05T00:00:00.000Z",
        airingState: "aired",
        airingSource: "anilist",
        providerStatus: "RELEASING",
      },
      {
        id: "ep-2",
        episodeNumber: 2,
        absoluteNumber: 2,
        title: null,
        description: null,
        durationSeconds: null,
        thumbnailUrl: null,
        isFiller: false,
        airingAt: "2026-01-12T00:00:00.000Z",
        airingState: "upcoming",
        airingSource: "anilist",
        providerStatus: "RELEASING",
      },
    ],
    catalogueCount: 2,
    airedCount: 1,
    knownTotal: 12,
  };

  it("reads the canonical episode catalogue", async () => {
    stubFetch(() => ({ status: 200, body: catalogue }));

    const payload = await fetchAnimeEpisodes("209219");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${ZENKAI_API_URL}/api/v1/anime/209219/episodes`);
    assert.equal(payload.catalogueCount, 2);
    assert.equal(payload.airedCount, 1);
    assert.equal(payload.knownTotal, 12);
    assert.equal(payload.episodes[0]!.airingState, "aired");
    assert.equal(payload.episodes[1]!.airingState, "upcoming");
  });

  it("accepts a genuinely empty catalogue", async () => {
    stubFetch(() => ({
      status: 200,
      body: { anilistId: "209219", episodes: [], catalogueCount: 0, airedCount: 0, knownTotal: 0 },
    }));

    const payload = await fetchAnimeEpisodes("209219");

    assert.equal(payload.episodes.length, 0);
  });

  it("rejects an airing state the backend never defines", async () => {
    const bad = {
      ...catalogue,
      episodes: [{ ...catalogue.episodes[0], airingState: "cancelled" }],
    };
    stubFetch(() => ({ status: 200, body: bad }));

    const outcome = await capture(() => fetchAnimeEpisodes("209219"));

    assert.ok(outcome instanceof ZenkaiContractError);
  });
});

describe("fetchEpisodeNavigation", () => {
  it("reads canonical navigation honouring gaps", async () => {
    stubFetch(() => ({ status: 200, body: { previous: 1, next: 3 } }));

    const navigation = await fetchEpisodeNavigation("209219", 2);

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `${ZENKAI_API_URL}/api/v1/anime/209219/episodes/2/navigation`,
    );
    assert.deepEqual(navigation, { previous: 1, next: 3 });
  });

  it("accepts null neighbours at catalogue boundaries", async () => {
    stubFetch(() => ({ status: 200, body: { previous: null, next: null } }));

    const navigation = await fetchEpisodeNavigation("209219", 24);

    assert.deepEqual(navigation, { previous: null, next: null });
  });
});
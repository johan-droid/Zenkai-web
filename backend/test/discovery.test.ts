/**
 * Anime discovery tests.
 *
 * These drive `DiscoveryService` with a stub that satisfies the *real*
 * `AnimeMetadataProvider` contract, so the orchestration is exercised through the
 * same interface production uses. No test here touches AniList: the stub returns
 * fixtures and counts calls, which is what makes cache behaviour observable.
 *
 * The properties under test are the ones that quietly produce a lying home page:
 * what "seasonal" means, that a failure is not an empty result, and that one dead
 * section does not take the page down.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  DiscoveryService,
  currentSeason,
  dedupeByIdentity,
  normalisePaging,
  toCard,
  MAX_PER_PAGE,
  type DiscoveryCard,
} from "../src/modules/anime/discovery.js";
import { cache } from "../src/cache/index.js";
import { AppError } from "../src/http/errors.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import type {
  AnimeDetail,
  AnimeMetadataProvider,
  AnimeSummary,
  BrowseQuery,
  Page,
} from "../src/providers/metadata/types.js";

function summary(id: string, over: Partial<AnimeSummary> = {}): AnimeSummary {
  return {
    anilistId: id,
    titles: { romaji: `Title ${id}`, english: null, native: null, synonyms: [] },
    canonicalTitle: `Title ${id}`,
    status: "FINISHED",
    isAdult: false,
    genres: [],
    externalIds: { anilist: id },
    ...over,
  };
}

/** Records the query it was asked for, and returns a configurable result. */
class StubProvider implements AnimeMetadataProvider {
  readonly slug = "stub";
  readonly name = "Stub";
  readonly priority = 1;
  calls: BrowseQuery[] = [];

  constructor(
    private readonly behaviour: {
      items?: AnimeSummary[];
      total?: number;
      hasNextPage?: boolean;
      fail?: "timeout" | "error";
      malformed?: boolean;
    } = {},
  ) {}

  async browse(query: BrowseQuery): Promise<Page<AnimeSummary>> {
    this.calls.push(query);

    if (this.behaviour.fail === "timeout") {
      throw new AppError("provider_timeout", "upstream timed out", 504);
    }
    if (this.behaviour.fail === "error") {
      throw new AppError("upstream_error", "upstream returned 500", 502);
    }
    if (this.behaviour.malformed) {
      // A shape we did not anticipate: `items` is not a list at all.
      return { items: null as unknown as AnimeSummary[], page: 1, perPage: 20, total: 0, hasNextPage: false };
    }

    return {
      items: this.behaviour.items ?? [],
      page: query.page ?? 1,
      perPage: query.perPage ?? 20,
      total: this.behaviour.total ?? 0,
      hasNextPage: this.behaviour.hasNextPage ?? false,
    };
  }

  async getByAnilistId(): Promise<AnimeDetail | null> {
    return null;
  }
  async getByExternalId(): Promise<AnimeDetail | null> {
    return null;
  }
  async getAiringSlots() {
    return [];
  }
  async healthCheck() {
    return true;
  }
}

/** Persistence double. The service only needs these three methods. */
function stubRepo(cards: DiscoveryCard[] = []): AnimeRepository {
  return {
    async upsert(s: AnimeSummary) {
      return `local-${s.anilistId}`;
    },
    async listCards({ limit, offset }: { limit: number; offset: number; order: string }) {
      return { items: cards.slice(offset, offset + limit), total: cards.length };
    },
    async listGenres() {
      return ["Action", "Drama"];
    },
  } as unknown as AnimeRepository;
}

// The cache is a process-wide singleton, so two tests asking for the same bucket
// and page would share an entry and the second assertion would be measuring the
// first test's result. Cleared before every test so each one starts cold.
beforeEach(() => cache.clear());

const card = (id: string, over: Partial<DiscoveryCard> = {}): DiscoveryCard => ({
  id: null,
  anilistId: id,
  title: `Title ${id}`,
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
  ...over,
});

describe("seasonal default", () => {
  it("maps every month to the right season and year", () => {
    // The default must be derived, not hard-coded, or "seasonal" silently rots
    // into "some season that was current when it was written".
    const cases: Array<[string, string, number]> = [
      ["2024-01-15", "WINTER", 2024],
      ["2024-03-01", "SPRING", 2024],
      ["2024-06-15", "SUMMER", 2024],
      ["2024-10-05", "FALL", 2024],
      ["2024-12-20", "WINTER", 2025], // December is the *upcoming* winter
    ];

    for (const [iso, season, year] of cases) {
      assert.deepEqual(
        currentSeason(new Date(`${iso}T12:00:00Z`)),
        { season, year },
        `${iso} should be ${season} ${year}`,
      );
    }
  });
});

describe("pagination bounds", () => {
  it("rejects nonsense by clamping to a sane range", () => {
    assert.deepEqual(normalisePaging(0, 0), { page: 1, perPage: 1 });
    assert.deepEqual(normalisePaging(-3, -9), { page: 1, perPage: 1 });
    assert.deepEqual(normalisePaging(undefined, undefined), { page: 1, perPage: 20 });
  });

  it("caps perPage so a request cannot become an unbounded upstream query", () => {
    assert.equal(normalisePaging(1, 999_999_999).perPage, MAX_PER_PAGE);
    assert.equal(normalisePaging(1, 10_000).perPage, MAX_PER_PAGE);
  });

  it("floors fractional values rather than passing them through", () => {
    assert.deepEqual(normalisePaging(2.9, 5.9), { page: 2, perPage: 5 });
  });

  it("treats NaN as absent", () => {
    assert.deepEqual(normalisePaging(NaN, NaN), { page: 1, perPage: 20 });
  });
});

describe("duplicate handling", () => {
  it("removes repeats by canonical identity, not by title", () => {
    // Two different anime can legitimately share a display title. Collapsing on
    // title would delete a real result; collapsing on provider id is correct.
    const items = [
      card("1", { title: "Same Title" }),
      card("2", { title: "Same Title" }),
      card("1", { title: "Same Title" }),
    ];
    assert.deepEqual(dedupeByIdentity(items).map((i) => i.anilistId), ["1", "2"]);
  });

  it("keeps every distinct item when there are no duplicates", () => {
    assert.equal(dedupeByIdentity([card("1"), card("2"), card("3")]).length, 3);
  });
});

describe("card projection", () => {
  it("keeps a missing score as null rather than zero", () => {
    // A title nobody has rated is not a title rated zero, and a client rendering
    // "0%" from this would be telling the user something false.
    assert.equal(toCard(summary("1", { averageScore: undefined })).averageScore, null);
  });

  it("preserves a real zero score", () => {
    assert.equal(toCard(summary("1", { averageScore: 0 })).averageScore, 0);
  });

  it("defaults absent genres to an empty list, not undefined", () => {
    // A card with `genres: undefined` serialises to a missing key, which a
describe("provider-derived rankings", () => {
  const clock = () => new Date("2024-01-10T00:00:00Z");

  it("asks the provider for the sort the bucket means", async () => {
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    await service.ranking("trending", { perPage: 5 });
    assert.equal(provider.calls[0]?.sort, "TRENDING");

    await service.ranking("popular", { perPage: 5 });
    assert.equal(provider.calls[1]?.sort, "POPULARITY_DESC");

    await service.ranking("topRated", { perPage: 5 });
    assert.equal(provider.calls[2]?.sort, "SCORE_DESC");
  });

  it("does not send a season filter to non-seasonal buckets", async () => {
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    await service.ranking("trending", { perPage: 5 });
    assert.equal(provider.calls[0]?.season, undefined);
    assert.equal(provider.calls[0]?.seasonYear, undefined);
  });

  it("applies the current season to seasonal by default", async () => {
    // Without this, "seasonal" and "popular" are the same query and the endpoint
    // is a duplicate of another one.
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, () => new Date("2024-04-01T00:00:00Z"));

    await service.ranking("seasonal", { perPage: 5 });
    assert.equal(provider.calls[0]?.season, "SPRING");
    assert.equal(provider.calls[0]?.seasonYear, 2024);
  });

  it("honours an explicit seasonal window", async () => {
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, () => new Date("2024-04-01T00:00:00Z"));

    await service.ranking("seasonal", { season: "FALL", year: 2019, perPage: 5 });
    assert.equal(provider.calls[0]?.season, "FALL");
    assert.equal(provider.calls[0]?.seasonYear, 2019);
  });

  it("normalises provider pagination into the Zenkai contract", async () => {
    const provider = new StubProvider({
      items: [summary("1"), summary("2")],
      total: 5000,
      hasNextPage: true,
    });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    const result = await service.ranking("trending", { page: 2, perPage: 2 });
    assert.equal(result.page, 2);
    assert.equal(result.perPage, 2);
    assert.equal(result.hasNextPage, true);
    assert.equal(result.total, 5000);
    assert.equal(result.source, "provider");
  });

  it("caps perPage before it reaches the provider", async () => {
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    const result = await service.ranking("trending", { perPage: 100_000 });
    assert.equal(result.perPage, MAX_PER_PAGE);
    assert.equal(provider.calls[0]?.perPage, MAX_PER_PAGE);
  });

  it("removes a duplicate the provider sends", async () => {
    const provider = new StubProvider({ items: [summary("1"), summary("1"), summary("2")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    const result = await service.ranking("trending", { perPage: 5 });
    assert.deepEqual(result.items.map((i) => i.anilistId), ["1", "2"]);
  });
});

describe("failure semantics", () => {
  const clock = () => new Date("2024-01-10T00:00:00Z");

  it("surfaces a provider timeout rather than an empty list", async () => {
    // An empty list would tell the client "nothing is trending", which is a
    // different and false claim. The reason has to reach the caller.
    const service = new DiscoveryService(stubRepo(), new StubProvider({ fail: "timeout" }), clock);

    await assert.rejects(
      () => service.ranking("trending", { perPage: 3 }),
      (error: AppError) => {
        assert.equal(error.reason, "provider_timeout");
        return true;
      },
    );
  });

  it("surfaces a provider error rather than an empty list", async () => {
    const service = new DiscoveryService(stubRepo(), new StubProvider({ fail: "error" }), clock);

describe("caching", () => {
  const clock = () => new Date("2024-01-10T00:00:00Z");

  it("calls the provider once and then serves from cache", async () => {
    const provider = new StubProvider({ items: [summary("77")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    const first = await service.ranking("trending", { perPage: 7 });
    assert.equal(first.source, "provider");
    assert.equal(provider.calls.length, 1);

    const second = await service.ranking("trending", { perPage: 7 });
    assert.equal(second.source, "cache");
    assert.equal(provider.calls.length, 1, "a cache hit must not call the provider again");
    assert.deepEqual(second.items, first.items);
  });

  it("uses a different key per page, bucket and season", async () => {
    // A single key for all requests would serve page 1's results for every page,
    // which is the classic way a cached list silently stops paginating.
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo(), provider, clock);

    await service.ranking("trending", { page: 1, perPage: 5 });
    await service.ranking("trending", { page: 2, perPage: 5 });
    await service.ranking("popular", { page: 1, perPage: 5 });
    await service.ranking("seasonal", { season: "FALL", year: 2023, perPage: 5 });

    assert.equal(provider.calls.length, 4, "each distinct request must reach the provider once");
  });
});

describe("canonical discovery", () => {
  const clock = () => new Date("2024-01-10T00:00:00Z");

  it("answers recent from the database without asking the provider", async () => {
    // The point of the canonical domain: this section keeps working when AniList
    // is completely unreachable.
    const provider = new StubProvider({ fail: "error" });
    const service = new DiscoveryService(
      stubRepo([card("5", { title: "Recent One" }), card("6")]),
      provider,
      clock,
    );

    const result = await service.recent({ perPage: 2 });
    assert.equal(result.items.length, 2);
    assert.equal(result.source, "database");
    assert.equal(provider.calls.length, 0, "canonical discovery must not call the provider");
  });

  it("computes hasNextPage from the database total", async () => {
    const service = new DiscoveryService(
      stubRepo([card("1"), card("2"), card("3")]),
      new StubProvider(),
      clock,
    );

    const first = await service.recent({ page: 1, perPage: 2 });
    const second = await service.recent({ page: 2, perPage: 2 });

    assert.equal(first.hasNextPage, true);
    assert.equal(second.hasNextPage, false);
    assert.equal(second.items.length, 1);
  });

  it("serves genres from the catalogue, not the provider", async () => {
    const provider = new StubProvider();
    const service = new DiscoveryService(stubRepo(), provider, clock);

    assert.deepEqual(await service.genres(), ["Action", "Drama"]);
    assert.equal(provider.calls.length, 0);
  });
});

describe("home aggregation", () => {
  const clock = () => new Date("2024-01-10T00:00:00Z");

  it("degrades one section without failing the page", async () => {
    // A home page that 500s because one ranking timed out is unusable; a home
    // page that shows an empty shelf is a lie. Each section reports its own
    // status so the client can tell the two apart.
    const service = new DiscoveryService(
      stubRepo([card("1")]),
      new StubProvider({ fail: "timeout" }),
      clock,
    );

    const home = await service.home(2);
    assert.equal(home.trending.status, "unavailable");
    assert.equal(home.trending.reason, "provider_timeout");
    assert.equal(home.recent.status, "ok", "the canonical section must still work");
    assert.equal(home.recent.items.length, 1);
  });

  it("returns a section per home shelf with no extra provider calls", async () => {
    const provider = new StubProvider({ items: [summary("1")] });
    const service = new DiscoveryService(stubRepo([card("1")]), provider, clock);

    const home = await service.home(3);
    for (const key of ["trending", "popular", "seasonal", "recent", "topRated"] as const) {
      assert.equal(home[key].status, "ok", `${key} should be ok`);
    }
    // Four provider-backed sections, one call each. Not five calls per shelf.
    assert.equal(provider.calls.length, 4);
  });
});
    await assert.rejects(
      () => service.ranking("topRated", { perPage: 3 }),
      (error: AppError) => {
        assert.equal(error.reason, "upstream_error");
        return true;
      },
    );
  });

  it("treats a valid empty response as empty, not as a failure", async () => {
    // This is the distinction the whole section exists for: zero results from a
    // healthy provider is a successful empty answer.
    const service = new DiscoveryService(
      stubRepo(),
      new StubProvider({ items: [], total: 0, hasNextPage: false }),
      clock,
    );

    const result = await service.ranking("trending", { perPage: 5 });
    assert.deepEqual(result.items, []);
    assert.equal(result.hasNextPage, false);
    assert.equal(result.source, "provider");
  });
});
    // client rendering `row.genres.map(...)` would crash on.
    assert.deepEqual(toCard(summary("1", { genres: undefined })).genres, []);
  });

  it("carries the local id when the title is already catalogued", () => {
    assert.equal(toCard(summary("42"), "local-42").id, "local-42");
    assert.equal(toCard(summary("42")).id, null);
  });
});

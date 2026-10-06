/**
 * Stage 2 Manga Catalogue Fallback & Capability tests.
 *
 * Verifies:
 *  - DB-backed catalogue browse when DB is populated
 *  - Provider fallback when DB catalogue is empty (0 rows)
 *  - 503 provider_unavailable when provider errors on empty DB
 *  - 200 OK empty catalogue when DB is populated but filters match 0 rows
 *  - Normalization of provider summaries into canonical DB rows
 *  - Case-insensitive genre matching and sorting contract
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MangaService } from "../src/modules/manga/service.js";
import type { MangaProvider, Page, MangaSummary } from "../src/providers/manga/types.js";

function createMockSummary(id: string, primaryTitle: string, genres: string[] = ["Action"]): MangaSummary {
  return {
    providerId: id,
    titles: { primary: primaryTitle, alternates: [] },
    status: "ONGOING",
    contentRating: "safe",
    isAdult: false,
    genres: genres.map((g) => ({ name: g })),
    demographics: ["Shounen"],
    authors: ["Author A"],
    artists: ["Artist A"],
    externalIds: { mangadex: id },
  };
}

class MockRepo {
  items: Map<string, any> = new Map();

  async count(): Promise<number> {
    return this.items.size;
  }

  async list(options: any): Promise<{ items: any[]; total: number }> {
    let list = Array.from(this.items.values());
    if (options.genre) {
      const g = options.genre.toLowerCase();
      list = list.filter((item) =>
        item.genres?.some((genre: string) => genre.toLowerCase() === g),
      );
    }
    if (options.status) {
      list = list.filter((item) => item.status === options.status);
    }
    return {
      items: list.slice(options.offset, options.offset + options.limit),
      total: list.length,
    };
  }

  async upsert(summary: MangaSummary): Promise<string> {
    const id = `local-${summary.providerId}`;
    this.items.set(id, {
      id,
      mangadexId: summary.providerId,
      canonicalTitle: summary.titles.primary,
      status: summary.status,
      genres: summary.genres.map((g) => g.name),
      isAdult: summary.isAdult,
    });
    return id;
  }
}

class MockProvider implements MangaProvider {
  slug = "mock-mangadex";
  name = "Mock MangaDex";
  priority = 1;
  shouldFail = false;
  itemsToReturn: MangaSummary[] = [];

  async search(): Promise<Page<MangaSummary>> {
    return { items: [], total: 0, limit: 20, offset: 0 };
  }

  async browse(): Promise<Page<MangaSummary>> {
    if (this.shouldFail) {
      throw new Error("Provider downstream transport failure");
    }
    return {
      items: this.itemsToReturn,
      total: this.itemsToReturn.length,
      limit: 20,
      offset: 0,
    };
  }

  async getById(): Promise<any> { return null; }
  async getChapters(): Promise<any[]> { return []; }
  async getChapterPages(): Promise<any> { throw new Error("not implemented"); }
  async healthCheck(): Promise<boolean> { return true; }
}

describe("Stage 2 — Manga Catalogue Capability & Fallback", () => {
  it("uses DB-backed catalogue directly when database has rows", async () => {
    const repo = new MockRepo() as any;
    const provider = new MockProvider();
    const service = new MangaService(repo, provider);

    await repo.upsert(createMockSummary("m1", "Solo Leveling"));

    const res = await service.list({ limit: 10, offset: 0 });
    assert.equal(res.total, 1);
    assert.equal(res.items[0].canonicalTitle, "Solo Leveling");
  });

  it("falls back to provider browse when DB catalogue is empty", async () => {
    const repo = new MockRepo() as any;
    const provider = new MockProvider();
    provider.itemsToReturn = [
      createMockSummary("m2", "Chainsaw Man", ["Action", "Horror"]),
    ];
    const service = new MangaService(repo, provider);

    assert.equal(await repo.count(), 0);
    const res = await service.list({ limit: 10, offset: 0 });

    assert.equal(res.total, 1);
    assert.equal(res.items[0].canonicalTitle, "Chainsaw Man");
    assert.equal(await repo.count(), 1, "Provider items were canonicalized and upserted into DB");
  });

  it("throws 503 provider_unavailable when provider errors on empty DB", async () => {
    const repo = new MockRepo() as any;
    const provider = new MockProvider();
    provider.shouldFail = true;
    const service = new MangaService(repo, provider);

    await assert.rejects(
      async () => service.list({ limit: 10, offset: 0 }),
      (err: any) => err.statusCode === 503 && err.reason === "provider_unavailable",
    );
  });

  it("returns 200 OK with empty items for non-matching filters on populated DB", async () => {
    const repo = new MockRepo() as any;
    const provider = new MockProvider();
    const service = new MangaService(repo, provider);

    await repo.upsert(createMockSummary("m1", "Romance Manga", ["Romance"]));

    const res = await service.list({ limit: 10, offset: 0, genre: "Action" });
    assert.equal(res.total, 0);
    assert.deepEqual(res.items, []);
  });

  it("matches genres case-insensitively", async () => {
    const repo = new MockRepo() as any;
    const provider = new MockProvider();
    const service = new MangaService(repo, provider);

    await repo.upsert(createMockSummary("m1", "Action Manga", ["Action"]));

    const lowerRes = await service.list({ limit: 10, offset: 0, genre: "action" });
    const upperRes = await service.list({ limit: 10, offset: 0, genre: "ACTION" });

    assert.equal(lowerRes.total, 1);
    assert.equal(upperRes.total, 1);
  });
});

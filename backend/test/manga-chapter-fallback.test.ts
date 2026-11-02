/**
 * Manga Chapter Pages & Feed Fallback Unit Tests.
 *
 * Verifies:
 *  - Fallback to Zenkai multi-provider (WeebCentral) when MangaDex chapter is an external release (0 pages)
 *  - Fallback to Zenkai provider when MangaDex chapter feed is empty or contains only unreadable external links
 *  - Chapter number matching (exact, float equivalence, and floor matching for decimal chapters like 1.1 -> 1)
 *  - Storing resolved fallback pages in repository cache
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MangaService } from "../src/modules/manga/service.js";
import type { MangaProvider, Page, MangaSummary, ProviderChapter, ChapterPages } from "../src/providers/manga/types.js";
import { ZenkaiMangaProvider } from "../src/providers/manga/zenkai.js";

class MockRepo {
  chapters: Map<string, any> = new Map();
  chapterPages: Map<string, ChapterPages> = new Map();
  manga: Map<string, any> = new Map();

  async getChapter(id: string): Promise<any> {
    return this.chapters.get(id) ?? null;
  }

  async getById(id: string): Promise<any> {
    return this.manga.get(id) ?? null;
  }

  async getByProviderId(mangadexId: string): Promise<any> {
    for (const m of this.manga.values()) {
      if (m.mangadexId === mangadexId) return m;
    }
    return null;
  }

  async getChapterPages(chapterId: string): Promise<ChapterPages | null> {
    return this.chapterPages.get(chapterId) ?? null;
  }

  async replaceChapterPages(chapterId: string, pages: ChapterPages): Promise<void> {
    this.chapterPages.set(chapterId, pages);
  }

  async listChapters(mangaId: string, language?: string): Promise<any[]> {
    return Array.from(this.chapters.values()).filter(
      (ch) => ch.mangaId === mangaId && (!language || ch.language === language),
    );
  }

  async upsertChapters(mangaId: string, incoming: ProviderChapter[]): Promise<number> {
    for (const ch of incoming) {
      this.chapters.set(ch.externalId, {
        id: ch.externalId,
        mangaId,
        mangadexChapterId: ch.externalId,
        chapterNumber: ch.chapterNumber,
        volume: ch.volume,
        title: ch.title,
        language: ch.language,
        pages: ch.pages,
        scanlationGroup: ch.scanlationGroup,
        externalUrl: ch.externalUrl,
      });
    }
    return incoming.length;
  }

  async getLocalIdByProviderId(providerId: string): Promise<string | null> {
    for (const [id, m] of this.manga.entries()) {
      if (m.mangadexId === providerId) return id;
    }
    return null;
  }

  async count(): Promise<number> {
    return this.manga.size;
  }
}

class MockMangaDexProvider implements MangaProvider {
  slug = "mangadex";
  name = "MangaDex";
  priority = 1;
  chaptersToReturn: ProviderChapter[] = [];

  async search(): Promise<Page<MangaSummary>> {
    return { items: [], total: 0, limit: 20, offset: 0 };
  }

  async browse(): Promise<Page<MangaSummary>> {
    return { items: [], total: 0, limit: 20, offset: 0 };
  }

  async getById(id: string): Promise<any> {
    return {
      providerId: id,
      titles: { primary: "Test Manga", alternates: ["Alternative Title"] },
      canonicalTitle: "Test Manga",
      status: "ONGOING",
    };
  }

  async getChapters(): Promise<ProviderChapter[]> {
    return this.chaptersToReturn;
  }

  async getChapterPages(chapterExternalId: string): Promise<ChapterPages> {
    throw new Error(`no page data for chapter ${chapterExternalId} (external release)`);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

class MockZenkaiProvider extends ZenkaiMangaProvider {
  searchResults: MangaSummary[] = [];
  chapters: ProviderChapter[] = [];
  pagesToReturn: ChapterPages = {
    baseUrl: "",
    hash: "",
    pages: [
      { pageNumber: 1, fileName: "https://official.lowee.us/manga/test/0001-001.png" },
      { pageNumber: 2, fileName: "https://official.lowee.us/manga/test/0001-002.png" },
    ],
  };

  override async search(queryText: string): Promise<Page<MangaSummary>> {
    return { items: this.searchResults, total: this.searchResults.length, limit: 10, offset: 0 };
  }

  override async getChapters(id: string): Promise<ProviderChapter[]> {
    return this.chapters;
  }

  override async getChapterPages(chapterId: string): Promise<ChapterPages> {
    return this.pagesToReturn;
  }
}

describe("Manga Chapter Fallback to Zenkai Multi-Provider", () => {
  it("falls back to Zenkai provider when MangaDex chapter is an external release", async () => {
    const repo = new MockRepo();
    const mdProvider = new MockMangaDexProvider();
    const zenkaiProvider = new MockZenkaiProvider();

    const mangaId = "local-manga-1";
    const chapterId = "2b6d879a-271e-463a-ac56-76ae3149c480";

    repo.manga.set(mangaId, {
      id: mangaId,
      mangadexId: "e78a489b-6632-4d61-b00b-5206f5b8b22b",
      canonicalTitle: "That Time I Got Reincarnated as a Slime",
      titles: { primary: "That Time I Got Reincarnated as a Slime", alternates: [] },
    });

    repo.chapters.set(chapterId, {
      id: chapterId,
      mangaId,
      mangadexChapterId: chapterId,
      chapterNumber: "1",
      pages: 0,
      externalUrl: "https://kmanga.kodansha.com/title/10044/episode/317350",
    });

    zenkaiProvider.searchResults = [
      {
        providerId: "01J76XYBF8PQ831AW2N7B7BJVV",
        titles: { primary: "That Time I Got Reincarnated as a Slime", alternates: [] },
        status: "ONGOING",
        contentRating: "safe",
        isAdult: false,
        genres: [],
        demographics: [],
        authors: [],
        artists: [],
        externalIds: {},
      },
    ];

    zenkaiProvider.chapters = [
      {
        externalId: "01J76XYYRX6HVR2QV46GCVFE85",
        chapterNumber: "1",
        volume: null,
        title: "Chapter 1",
        language: "en",
        pages: 2,
        publishedAt: null,
        scanlationGroup: null,
      },
    ];

    const service = new MangaService(repo as any, mdProvider, zenkaiProvider);

    const result = await service.getChapterPages(chapterId);

    assert.equal(result.pageCount, 2);
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].url, "https://official.lowee.us/manga/test/0001-001.png");
    assert.equal(result.pages[1].url, "https://official.lowee.us/manga/test/0001-002.png");

    // Verify pages were cached
    const cached = await repo.getChapterPages(chapterId);
    assert.ok(cached);
    assert.equal(cached.pages.length, 2);
  });

  it("matches decimal chapter (1.1 -> 1) when publisher splits chapters into sub-parts", async () => {
    const repo = new MockRepo();
    const mdProvider = new MockMangaDexProvider();
    const zenkaiProvider = new MockZenkaiProvider();

    const mangaId = "local-manga-2";
    const chapterId = "741258a3-668f-43d4-b2b2-c64746d63b88";

    repo.manga.set(mangaId, {
      id: mangaId,
      mangadexId: "aa6c76f7-5f5f-46b6-a800-911145f81b9b",
      canonicalTitle: "Sono Bisque Doll wa Koi o Suru",
      titles: { primary: "Sono Bisque Doll wa Koi o Suru", alternates: ["My Dress-Up Darling"] },
    });

    repo.chapters.set(chapterId, {
      id: chapterId,
      mangaId,
      mangadexChapterId: chapterId,
      chapterNumber: "1.1",
      pages: 0,
      externalUrl: "https://global.manga-up.com/manga/113/9269",
    });

    zenkaiProvider.searchResults = [
      {
        providerId: "01J76XYCMP8059QS9PDPHBMEQW",
        titles: { primary: "My Dress-Up Darling", alternates: [] },
        status: "ONGOING",
        contentRating: "safe",
        isAdult: false,
        genres: [],
        demographics: [],
        authors: [],
        artists: [],
        externalIds: {},
      },
    ];

    zenkaiProvider.chapters = [
      {
        externalId: "01J76XZ0NCCTW603KRXSBVP114",
        chapterNumber: "1",
        volume: null,
        title: "Chapter 1",
        language: "en",
        pages: 2,
        publishedAt: null,
        scanlationGroup: null,
      },
    ];

    const service = new MangaService(repo as any, mdProvider, zenkaiProvider);

    const result = await service.getChapterPages(chapterId);

    assert.equal(result.pageCount, 2);
    assert.equal(result.pages[0].url, "https://official.lowee.us/manga/test/0001-001.png");
  });

  it("falls back to Zenkai provider for chapter feed when MangaDex has only unreadable external links", async () => {
    const repo = new MockRepo();
    const mdProvider = new MockMangaDexProvider();
    const zenkaiProvider = new MockZenkaiProvider();

    const mangadexId = "aa6c76f7-5f5f-46b6-a800-911145f81b9b";
    const mangaId = "local-manga-2";

    repo.manga.set(mangaId, {
      id: mangaId,
      mangadexId,
      canonicalTitle: "Sono Bisque Doll wa Koi o Suru",
      titles: { primary: "Sono Bisque Doll wa Koi o Suru", alternates: ["My Dress-Up Darling"] },
    });

    // MangaDex returns external-only releases with 0 pages
    mdProvider.chaptersToReturn = [
      {
        externalId: "md-ch-1",
        chapterNumber: "1.1",
        volume: null,
        title: null,
        language: "en",
        pages: 0,
        publishedAt: null,
        scanlationGroup: "Manga UP!",
        externalUrl: "https://global.manga-up.com/...",
      },
    ];

    zenkaiProvider.searchResults = [
      {
        providerId: "01J76XYCMP8059QS9PDPHBMEQW",
        titles: { primary: "My Dress-Up Darling", alternates: [] },
        status: "ONGOING",
        contentRating: "safe",
        isAdult: false,
        genres: [],
        demographics: [],
        authors: [],
        artists: [],
        externalIds: {},
      },
    ];

    zenkaiProvider.chapters = [
      {
        externalId: "01J76XZ0NCCTW603KRXSBVP114",
        chapterNumber: "1",
        volume: null,
        title: "Chapter 1",
        language: "en",
        pages: 51,
        publishedAt: null,
        scanlationGroup: "WeebCentral",
      },
      {
        externalId: "01J76XZ0NCCTW603KRXSBVP115",
        chapterNumber: "2",
        volume: null,
        title: "Chapter 2",
        language: "en",
        pages: 45,
        publishedAt: null,
        scanlationGroup: "WeebCentral",
      },
    ];

    const service = new MangaService(repo as any, mdProvider, zenkaiProvider);

    const chapters = await service.getChapters(mangadexId, { language: "en" });

    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].chapterNumber, "1");
    assert.equal(chapters[0].id, "01J76XZ0NCCTW603KRXSBVP114");
    assert.equal(chapters[1].chapterNumber, "2");
  });
});

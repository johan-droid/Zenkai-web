import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NovelProvider } from "../src/providers/novel/index.js";
import { NovelService } from "../src/modules/novel/service.js";
import { ZenkaiMangaProvider } from "../src/providers/manga/zenkai.js";

describe("Stage 6: Novel provider & service", () => {
  it("generates chapters with correct numbering and bounds", async () => {
    const provider = new NovelProvider();
    // Stub getById and searchScraper to test fallback generator
    (provider as any).getById = async () => ({
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      chapters: 50,
      startYear: 2015,
    });
    (provider as any).searchScraper = async () => [];

    const chapters = await provider.getChapters("94970");
    assert.equal(chapters.length, 50);
    assert.equal(chapters[0]!.chapterNumber, 1);
    assert.equal(chapters[0]!.title, "Chapter 1");
    assert.equal(chapters[49]!.chapterNumber, 50);
  });

  it("produces chapter content with paragraphs and valid next/previous chapter navigation", async () => {
    const provider = new NovelProvider();
    (provider as any).getById = async () => ({
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      description: "A prestigious school where students compete.",
      chapters: 20,
    });
    (provider as any).searchScraper = async () => [];

    const content = await provider.getChapterContent("94970", 2);
    assert.ok(content);
    assert.equal(content.chapterNumber, 2);
    assert.equal(content.previousChapter, 1);
    assert.equal(content.nextChapter, 3);
    assert.ok(content.paragraphs.length > 3);
    assert.ok(content.content.includes("Classroom of the Elite"));
  });

  it("handles first and last chapters boundary navigation correctly", async () => {
    const provider = new NovelProvider();
    (provider as any).getById = async () => ({
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      chapters: 5,
    });
    (provider as any).searchScraper = async () => [];

    const ch1 = await provider.getChapterContent("94970", 1);
    assert.equal(ch1?.previousChapter, null, "Chapter 1 has no previous chapter");
    assert.equal(ch1?.nextChapter, 2);

    const ch5 = await provider.getChapterContent("94970", 5);
    assert.equal(ch5?.previousChapter, 4);
    assert.equal(ch5?.nextChapter, null, "Final chapter has no next chapter");
  });
});

const runLiveTests = process.env.RUN_LIVE_PROVIDER_TESTS === "1";

if (runLiveTests) {
  describe("live provider checks", () => {
    it("fetches live novel chapters from NovelFire for a real slug", async () => {
      const provider = new NovelProvider();
      const chapters = await provider.getChapters("shadow-slave", "novelfire");
      assert.ok(chapters.length > 100, "Shadow Slave should have hundreds of real chapters");
      assert.equal(chapters[0]!.chapterNumber, 1);
      assert.equal(chapters[0]!.chapterSlug, "chapter-1");
      assert.ok(
        chapters[0]!.title.includes("Nightmare Begins") || chapters[0]!.title.includes("Chapter 1"),
      );
    });

    it("reads live chapter text with authentic paragraphs from NovelFire", async () => {
      const provider = new NovelProvider();
      const read = await provider.getChapterContent("shadow-slave", "chapter-1", "novelfire");
      assert.ok(read);
      assert.equal(read.chapterNumber, 1);
      assert.equal(read.nextChapter, 2);
      assert.ok(read.paragraphs.length > 10, "Should have real novel paragraphs");
      assert.ok(read.content.length > 200);
    });

    it("resolves multi-source manga pages from ZenkaiMangaProvider", async () => {
      const mangaProvider = new ZenkaiMangaProvider("weebcentral");
      const searchRes = await mangaProvider.search("chainsaw man", 5);
      assert.ok(searchRes.items.length > 0);
      assert.ok(searchRes.items[0]!.titles.primary.toLowerCase().includes("chainsaw"));

      const chapters = await mangaProvider.getChapters(searchRes.items[0]!.providerId);
      assert.ok(chapters.length > 0);
      assert.ok(chapters[0]!.externalId);

      const pages = await mangaProvider.getChapterPages(chapters[0]!.externalId);
      assert.ok(pages.pages.length > 0);
      assert.ok(pages.pages[0]!.fileName.startsWith("http"));
    });
  });
}

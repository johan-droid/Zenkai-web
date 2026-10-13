import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NovelProvider } from "../src/providers/novel/index.js";
import { NovelService } from "../src/modules/novel/service.js";

describe("Stage 6: Novel provider & service", () => {
  it("generates chapters with correct numbering and bounds", async () => {
    const provider = new NovelProvider();
    // Stub getById
    (provider as any).getById = async () => ({
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      chapters: 50,
      startYear: 2015,
    });

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

    const ch1 = await provider.getChapterContent("94970", 1);
    assert.equal(ch1?.previousChapter, null, "Chapter 1 has no previous chapter");
    assert.equal(ch1?.nextChapter, 2);

    const ch5 = await provider.getChapterContent("94970", 5);
    assert.equal(ch5?.previousChapter, 4);
    assert.equal(ch5?.nextChapter, null, "Final chapter has no next chapter");
  });
});

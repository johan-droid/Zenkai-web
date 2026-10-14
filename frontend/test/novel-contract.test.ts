import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  novelSummarySchema,
  novelBrowseResultSchema,
  novelChapterSchema,
  novelChapterContentSchema,
  novelSummaryToMedia,
} from "../src/lib/api/zenkai";
import { mediaHref, readNovelHref } from "../src/lib/media";

describe("Stage 6: Novel contract & routing", () => {
  it("validates novel summary payload against schema", () => {
    const raw = {
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      romajiTitle: "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e",
      englishTitle: "Classroom of the Elite",
      nativeTitle: "ようこそ実力至上主義の教室へ",
      coverImage: "https://example.com/cover.jpg",
      bannerImage: null,
      description: "A prestigious school where students compete.",
      averageScore: 84,
      popularity: 50000,
      status: "RELEASING",
      genres: ["Drama", "Psychological"],
      chapters: 110,
      volumes: 25,
      startYear: 2015,
    };

    const parsed = novelSummarySchema.safeParse(raw);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    assert.equal(parsed.data.id, "94970");
    assert.equal(parsed.data.title, "Classroom of the Elite");
    assert.deepEqual(parsed.data.genres, ["Drama", "Psychological"]);
  });

  it("maps novel summary to neutral MediaSummary with kind: novel", () => {
    const raw = {
      id: "94970",
      anilistId: 94970,
      title: "Classroom of the Elite",
      englishTitle: "Classroom of the Elite",
      coverImage: "https://example.com/cover.jpg",
      status: "RELEASING",
      genres: ["Psychological"],
    };

    const parsed = novelSummarySchema.parse(raw);
    const media = novelSummaryToMedia(parsed);

    assert.equal(media.id, "94970");
    assert.equal(media.kind, "novel");
    assert.equal(media.format, "NOVEL");
    assert.equal(media.title.preferred, "Classroom of the Elite");
    assert.equal(media.cover.url, "https://example.com/cover.jpg");
    assert.equal(mediaHref(media), "/novel/94970");
  });

  it("produces correct reading href for novel chapters", () => {
    assert.equal(readNovelHref("94970", 1), "/read-novel/94970/1");
    assert.equal(readNovelHref("94970", 15), "/read-novel/94970/15");
  });

  it("validates chapter content structure", () => {
    const raw = {
      id: "novel-94970-1",
      novelId: "94970",
      chapterNumber: 1,
      title: "Chapter 1",
      content: "Paragraph 1\n\nParagraph 2",
      paragraphs: ["Paragraph 1", "Paragraph 2"],
      previousChapter: null,
      nextChapter: 2,
    };

    const parsed = novelChapterContentSchema.safeParse(raw);
    assert.equal(parsed.success, true);
  });

  it("validates novel chapter list and browse result schemas", () => {
    const chapterRaw = {
      id: "ch-1",
      novelId: "94970",
      chapterNumber: 1,
      title: "Prologue",
      releaseDate: "2015-05-25",
    };
    const parsedChapter = novelChapterSchema.safeParse(chapterRaw);
    assert.equal(parsedChapter.success, true);

    const browseRaw = {
      items: [
        {
          id: "94970",
          anilistId: 94970,
          title: "Classroom of the Elite",
          coverImage: "https://example.com/cover.jpg",
          status: "RELEASING",
          genres: ["Drama"],
        },
      ],
      total: 1,
      hasNextPage: false,
    };
    const parsedBrowse = novelBrowseResultSchema.safeParse(browseRaw);
    assert.equal(parsedBrowse.success, true);
  });
});

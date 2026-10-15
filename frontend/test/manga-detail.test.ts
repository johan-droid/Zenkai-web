/**
 * Tests for manga detail mapping and view-model construction.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mangaDetailToDetailData,
  mangaDetailToMedia,
  mangaRelationToMedia,
  type MangaDetail,
} from "../src/lib/api/zenkai";
import { displayTitle } from "../src/lib/media";

const sampleMangaDetail: MangaDetail = {
  id: "e78a489b-6632-4d61-b00b-5206f5b8b22b",
  mangadexId: "e78a489b-6632-4d61-b00b-5206f5b8b22b",
  canonicalTitle: "Chainsaw Man",
  titles: {
    primary: "Chainsaw Man",
    alternates: ["CSM"],
  },
  description: "Denji has a simple dream — to live a happy and peaceful life.",
  coverUrl: "https://uploads.mangadex.org/covers/e78a489b/cover.jpg",
  coverImageLarge: "https://uploads.mangadex.org/covers/e78a489b/cover.large.jpg",
  bannerUrl: null,
  status: "ongoing",
  contentRating: "safe",
  year: 2018,
  genres: [
    { name: "Action", group: "genre" },
    { name: "Supernatural", group: "theme" },
  ],
  authors: ["Tatsuki Fujimoto"],
  artists: ["Tatsuki Fujimoto"],
  totalChapters: 180,
  totalVolumes: 18,
  relations: [
    {
      type: "ADAPTATION",
      providerId: "12345",
      title: "Chainsaw Man Anime",
      coverUrl: "https://s4.anilist.co/cover.jpg",
    },
  ],
};

describe("mangaDetailToMedia", () => {
  it("maps manga detail to MediaSummary correctly", () => {
    const summary = mangaDetailToMedia(sampleMangaDetail);

    assert.equal(summary.id, "e78a489b-6632-4d61-b00b-5206f5b8b22b");
    assert.equal(summary.kind, "manga");
    assert.equal(summary.provider, "zenkai");
    assert.equal(summary.format, "MANGA");
    assert.equal(summary.status, "RELEASING");
    assert.equal(summary.seasonYear, 2018);
    assert.equal(summary.chapters, 180);
    assert.equal(summary.volumes, 18);
    assert.deepEqual(summary.genres, ["Action", "Supernatural"]);
    assert.equal(summary.title.preferred, "Chainsaw Man");
    assert.equal(summary.cover.url, "https://uploads.mangadex.org/covers/e78a489b/cover.large.jpg");
    assert.equal(displayTitle(summary.title), "Chainsaw Man");
  });

  it("prefers requestedId when provided", () => {
    const summary = mangaDetailToMedia(sampleMangaDetail, "105398");
    assert.equal(summary.id, "105398");
  });

  it("handles nullish optional fields without crashing", () => {
    const minimal: MangaDetail = {
      id: "abc-123",
      mangadexId: null,
      canonicalTitle: "Untitled",
      titles: null,
      description: null,
      coverUrl: null,
      coverImageLarge: null,
      bannerUrl: null,
      status: null,
      contentRating: null,
      year: null,
      genres: null,
      authors: null,
      artists: null,
      totalChapters: null,
      totalVolumes: null,
      relations: null,
    };

    const summary = mangaDetailToMedia(minimal);
    assert.equal(summary.id, "abc-123");
    assert.equal(summary.status, "UNKNOWN");
    assert.equal(displayTitle(summary.title), "Untitled");
    assert.deepEqual(summary.genres, []);
  });
});

describe("mangaDetailToDetailData", () => {
  it("produces valid DetailData with summary and relations", () => {
    const detailData = mangaDetailToDetailData(sampleMangaDetail);

    assert.ok(detailData.summary, "summary must be defined on DetailData");
    assert.ok(detailData.summary.title, "summary.title must be defined");
    assert.equal(displayTitle(detailData.summary.title), "Chainsaw Man");
    assert.equal(detailData.relations.length, 1);
    assert.equal(detailData.relations[0].relationType, "ADAPTATION");
    assert.equal(detailData.relations[0].media.id, "12345");
    assert.equal(detailData.relations[0].media.kind, "manga");
    assert.deepEqual(detailData.characters, []);
    assert.deepEqual(detailData.recommendations, []);
  });
});

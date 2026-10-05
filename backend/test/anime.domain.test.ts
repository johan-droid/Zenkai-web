/**
 * Anime canonical-domain tests.
 *
 * These cover the mapping rules that decide what the database ends up holding,
 * using a hermetic AniList-shaped node rather than a live request: no test here
 * touches the network, and none of the fixtures are presented as real catalogue
 * data.
 *
 * The recurring theme is the omitted-versus-empty distinction. JSON renders "the
 * provider did not mention this field" and "the provider says this field is
 * empty" almost identically, but they must produce opposite outcomes in a merge.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSummary, imageUrl } from "../src/providers/metadata/anilist.js";
import { dedupePreservingSpelling, slugify } from "../src/modules/anime/repository.js";
import { stripHtml, displayTitle, normalizeTitle } from "../src/domain/media.js";

/** A complete AniList media node, in the shape the adapter expects. */
function fullNode(over: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 12345,
    idMal: 54321,
    format: "TV",
    status: "RELEASING",
    isAdult: false,
    description: "<p>First paragraph.</p><p>Second one.</p>",
    synonyms: ["Alt Name"],
    averageScore: 81,
    popularity: 4200,
    favourites: 300,
    season: "SPRING",
    seasonYear: 2024,
    episodes: 12,
    duration: 24,
    genres: ["Action", "Drama"],
    studios: { nodes: [{ name: "Studio One" }] },
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    coverImage: {
      extraLarge: "https://s/img/coverL.jpg",
      large: "https://s/img/coverL.jpg",
      medium: "https://s/img/coverM.jpg",
      color: null,
    },
    bannerImage: "https://s/img/banner.jpg",
    startDate: { year: 2013, month: 4, day: 7 },
    updatedAt: "2024-05-01T00:00:00Z",
    ...over,
  };
}

describe("anilist adapter: canonical mapping", () => {
  it("maps an AniList node onto the canonical summary", () => {
    const s = toSummary(fullNode());

    assert.equal(s.anilistId, "12345");
    assert.equal(s.canonicalTitle, "Attack on Titan");
    assert.equal(s.status, "RELEASING");
    assert.equal(s.format, "TV");
    assert.equal(s.totalEpisodes, 12);
    assert.equal(s.averageScore, 81);
    assert.deepEqual(s.genres, ["Action", "Drama"]);
    assert.deepEqual(s.studios, ["Studio One"]);
  });

  it("keeps every title spelling rather than collapsing them", () => {
    // A user searching the native or romaji title must still find the record, so
    // none of these may be discarded in favour of one "best" title.
    const s = toSummary(fullNode());
    assert.equal(s.titles.romaji, "Shingeki no Kyojin");
    assert.equal(s.titles.english, "Attack on Titan");
    assert.equal(s.titles.native, "進撃の巨人");
    assert.deepEqual(s.titles.synonyms, ["Alt Name"]);
  });

  it("collects external ids separately from the canonical id", () => {
    const s = toSummary(fullNode());
    assert.equal(s.externalIds.anilist, "12345");
    assert.equal(s.externalIds.mal, "54321");
  });

  it("normalises HTML descriptions to plain text", () => {
    const s = toSummary(fullNode());
    assert.equal(s.description, "First paragraph.\n\nSecond one.");
    assert.ok(!s.description?.includes("<"), "no markup may reach the domain");
  });

  it("resizes cover and banner urls from the supplied paths", () => {
    const s = toSummary(fullNode());
    assert.equal(s.coverUrl, "https://s/img/coverM-300x450.jpg");
    assert.equal(s.coverImageLarge, "https://s/img/coverL-800.jpg");
    assert.equal(s.bannerUrl, "https://s/img/banner-1000.jpg");
  });

  it("survives malformed and hostile input without throwing", () => {
    // Providers drift. A shape we did not anticipate must fail loudly here rather
    // than corrupt a row.
    const s = toSummary({
      id: 1,
      title: null,
      description: null,
      coverImage: null,
      bannerImage: null,
      genres: "not-an-array",
      studios: null,
      synonyms: "nope",
      averageScore: "eighty",
      episodes: null,
    });

    assert.equal(s.canonicalTitle, "Untitled");
    assert.equal(s.genres, undefined, "a non-array genres field is treated as absent");
    assert.equal(s.averageScore, undefined, "a non-numeric score is not a score of 0");
    // `episodes: null` is present-but-empty, so it clears rather than preserves.
    // The distinction from an absent key is the whole point of the mapping.
    assert.equal(s.totalEpisodes, null);
    assert.equal(s.description, null);
  });

  it("does not fabricate a status when the provider omits one", () => {
    // Defaulting this to UNKNOWN would silently rewrite a known RELEASING.
    const s = toSummary(fullNode({ status: undefined }));
    assert.equal(s.status, undefined);
  });

  it("treats an explicit zero as a real value, not as absence", () => {
    const s = toSummary(fullNode({ averageScore: 0, episodes: 0 }));
    assert.equal(s.averageScore, 0);
    assert.equal(s.totalEpisodes, 0);
  });
});

describe("anilist adapter: omitted versus empty", () => {
  it("marks absent fields undefined so a merge can keep stored values", () => {
    const s = toSummary({ id: 1, title: { romaji: "Only Romaji" } });

    assert.equal(s.description, undefined);
    assert.equal(s.coverUrl, undefined);
    assert.equal(s.bannerUrl, undefined);
    assert.equal(s.averageScore, undefined);
    assert.equal(s.totalEpisodes, undefined);
    assert.equal(s.genres, undefined);
    assert.equal(s.studios, undefined);
  });

  it("marks an explicitly empty field null so a merge can clear it", () => {
    // AniList sends `description: null` for a title with no synopsis. That is a
    // real answer and should clear stale text, unlike an absent key.
    const s = toSummary({ id: 1, description: null, genres: [], title: { romaji: "X" } });

    assert.equal(s.description, null, "an explicit null must clear, not preserve");
    assert.deepEqual(s.genres, [], "an explicit empty array must clear, not preserve");
describe("genre normalisation", () => {
  it("collapses case variants within one payload", () => {
    // The primary key is (animeId, genre) and is case-sensitive, so without this
    // "Action" and "action" would become two rows for one tag.
    assert.deepEqual(dedupePreservingSpelling(["Action", "action", "ACTION"]), ["Action"]);
  });

  it("preserves the provider's spelling of distinct genres", () => {
    assert.deepEqual(dedupePreservingSpelling(["Action", "Drama"]), ["Action", "Drama"]);
  });

  it("drops blank entries", () => {
    assert.deepEqual(dedupePreservingSpelling(["Action", "", "   ", "Drama"]), [
      "Action",
      "Drama",
    ]);
  });
});

describe("identity and slug", () => {
  it("derives a slug that is stable and unique per provider id", () => {
    assert.equal(slugify("Attack on Titan", "16498"), "attack-on-titan-16498");
    // Two titles that normalise identically must not collide.
    assert.notEqual(slugify("Attack on Titan", "1"), slugify("Attack on Titan", "2"));
  });

  it("falls back for a title that normalises to nothing", () => {
    assert.equal(slugify("!!!", "9"), "anime-9");
  });
});

describe("title normalisation", () => {
  it("ignores case, punctuation and articles when matching", () => {
    assert.equal(normalizeTitle("The  Attack  on Titan"), "attack on titan");
    assert.equal(normalizeTitle("Kimi no Na wa."), "kimi no na wa");
  });

  it("picks a display title in a stable order", () => {
    assert.equal(
      displayTitle({ romaji: "R", english: "E", native: "N" }),
      "E",
      "english is preferred over romaji",
    );
    assert.equal(displayTitle({ romaji: "R" }), "R");
    assert.equal(displayTitle({}), "Untitled");
  });
});

describe("description normalisation", () => {
  it("maps blank input to null rather than an empty string", () => {
    assert.equal(stripHtml(null), null);
    assert.equal(stripHtml(""), null);
    assert.equal(stripHtml("   "), null);
  });

  it("keeps paragraph and line boundaries readable", () => {
    assert.equal(stripHtml("<p>one</p><p>two</p>"), "one\n\ntwo");
    assert.equal(stripHtml("a<br>b"), "a\nb");
  });

  it("decodes entities", () => {
    assert.equal(stripHtml("a &amp; b &lt;tag&gt;"), "a & b <tag>");
  });
});

describe("image urls", () => {
  it("rewrites the size without duplicating the extension", () => {
    assert.equal(imageUrl("https://s/img/cover.jpg", 300, 450), "https://s/img/cover-300x450.jpg");
  });

  it("returns null when there is no url", () => {
    assert.equal(imageUrl(undefined, 300), null);
  });
});
  });
});
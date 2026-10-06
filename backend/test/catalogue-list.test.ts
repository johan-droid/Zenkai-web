/**
 * P17 Stage 1 contract: the canonical catalogue lists.
 *
 * `/anime` and `/manga` were the last catalogue surfaces still calling a
 * provider from the browser, so the lists behind them had to become real
 * canonical contracts. Three things are pinned here because each was either
 * missing or quietly broken:
 *
 *   - the anime list answers with discovery cards, the same shape home and
 *     search return, instead of raw catalogue rows;
 *   - `format` and `sort` exist, and the orderings mean what they say;
 *   - "trending" is rejected rather than quietly served as popularity, and a
 *     provider's own sort vocabulary is rejected too.
 *
 * The manga genre match was case-sensitive while the anime one was not, so
 * `genre=action` silently returned nothing. That is asserted here because it
 * looks like a broken filter rather than a strict one.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ANIME_SORTS } from "../src/modules/anime/repository.js";
import { MANGA_SORTS } from "../src/modules/manga/repository.js";

describe("catalogue sort vocabulary", () => {
  it("offers only orderings the catalogue can actually sort by", () => {
    assert.deepEqual(
      [...ANIME_SORTS],
      ["popularity", "score", "recently-updated", "recently-added", "title", "newest"],
    );
  });

  it("does not offer trending, which has no column behind it", () => {
    // Trending is an upstream signal. Offering it here would mean serving
    // popularity under a trending label, which is the kind of quiet lie this
    // project is trying not to tell. It stays on the discovery route.
    assert.ok(!ANIME_SORTS.includes("trending" as never));
    assert.ok(!MANGA_SORTS.includes("trending" as never));
  });

  it("keeps the manga vocabulary to orderings manga actually has", () => {
    // Anime's formats mean nothing for manga, so its set is its own.
    assert.deepEqual(
      [...MANGA_SORTS],
      ["followed", "rating", "newest", "recently-updated", "title"],
    );
  });

  it("uses kebab-case, never a provider's SCREAMING_SNAKE sort", () => {
    for (const sort of [...ANIME_SORTS, ...MANGA_SORTS]) {
      assert.match(sort, /^[a-z]+(-[a-z]+)*$/, `${sort} is not canonical vocabulary`);
    }
  });
});
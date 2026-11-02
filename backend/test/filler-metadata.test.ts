import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FillerClassifier } from "../src/providers/metadata/filler.js";

describe("FillerClassifier Metadata Suite", () => {
  it("fetches and caches filler metadata for One Piece", async () => {
    const fillerInfo = await FillerClassifier.getForTitle("One Piece");

    // Episodes 54-60 are Warship Island filler in One Piece
    assert.equal(fillerInfo.isFiller(55), true);
    assert.equal(fillerInfo.getCanonType(55), "filler");

    // Episode 1 is canon
    assert.equal(fillerInfo.isFiller(1), false);
    assert.equal(fillerInfo.getCanonType(1), "canon");
  });

  it("handles unknown or non-filler titles gracefully without throwing", async () => {
    const fillerInfo = await FillerClassifier.getForTitle("Nonexistent Anime Title 123456");
    assert.equal(fillerInfo.isFiller(1), false);
    assert.equal(fillerInfo.getCanonType(1), "canon");
  });
});

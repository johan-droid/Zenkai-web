import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  offlineChapterId,
} from "../src/lib/offline/chapter-cache.js";
import { db } from "../src/lib/db/dexie.js";

describe("Offline Chapter Caching System (Android Feature Parity)", () => {
  it("formats deterministic composite keys for offline manga and novel chapters", () => {
    assert.equal(offlineChapterId("manga", "berserk", 12), "manga:berserk:12");
    assert.equal(offlineChapterId("novel", "shadow-slave", 500), "novel:shadow-slave:500");
  });

  it("verifies Dexie schema includes offlineChapters store with proper indexes", () => {
    const table = db.table("offlineChapters");
    assert.ok(table, "offlineChapters table must exist in Dexie schema");
    assert.equal(table.name, "offlineChapters");
    assert.equal(table.schema.primKey.name, "id");

    const indexNames = table.schema.indexes.map((idx) => idx.name);
    assert.ok(indexNames.includes("kind"), "indexed on kind");
    assert.ok(indexNames.includes("mediaId"), "indexed on mediaId");
    assert.ok(indexNames.includes("unit"), "indexed on unit");
    assert.ok(indexNames.includes("cachedAt"), "indexed on cachedAt");
    assert.ok(indexNames.includes("[kind+mediaId]"), "compound indexed on [kind+mediaId]");
  });

  it("maintains strict boundary separating cached chapters from raw provider clients", () => {
    const forbidden = ["graphql.anilist.co", "api.mangadex.org", "consumet", "hianime"];
    // Read source of offline cache
    const { readFileSync } = require("node:fs");
    const src = readFileSync(new URL("../src/lib/offline/chapter-cache.ts", import.meta.url), "utf8");

    for (const term of forbidden) {
      assert.ok(!src.includes(term), `offline cache module must not import or reference ${term}`);
    }
  });
});

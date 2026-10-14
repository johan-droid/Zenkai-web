/**
 * HiAnime embed provider: pure-helper contract tests.
 *
 * `iframeUrl` must build exactly what the site's own `loadPlayer` builds, and
 * `parseSearchResults` must extract show slugs from the search page. A drift
 * in either silently serves the wrong title or a dead player, so both are
 * pinned here. Network behaviour (search → session → episodes → servers) is
 * exercised live, not in this file.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  iframeUrl,
  parseSearchResults,
  HiAnimeEmbedProvider,
} from "../src/providers/streaming/hianime-embed.provider.js";

describe("hianime embed url builder", () => {
  it("builds flixera embeds from the ani cross-reference for s-1", () => {
    assert.equal(
      iframeUrl("s-1", "sub", "2008139", "29/1", "29/1"),
      "https://flixera.co/embed/ani/29/1/sub?k=1&autoPlay=0&skipIntro=0&skipOutro=0",
    );
  });

  it("builds hd-1 embeds by numeric episode id for s-2", () => {
    assert.equal(
      iframeUrl("s-2", "sub", "2008139", "29/1", "29/1"),
      "https://cdn.4animo.xyz/embed/hd-1/2008139/sub?k=1&autoPlay=0&skipIntro=0&skipOutro=0",
    );
  });

  it("builds hd-2 embeds from the ani cross-reference for s-3", () => {
    assert.equal(
      iframeUrl("s-3", "dub", "2008139", "29/1", "29/1"),
      "https://cdn.4animo.xyz/embed/hd-2/ani/29/1/dub?k=1&autoPlay=0&skipIntro=0&skipOutro=0",
    );
  });

  it("falls back to mal, then to the numeric id, when ani is absent", () => {
    assert.equal(
      iframeUrl("s-1", "sub", "2008139", null, "29/1"),
      "https://flixera.co/embed/mal/29/1/sub?k=1&autoPlay=0&skipIntro=0&skipOutro=0",
    );
    assert.equal(
      iframeUrl("s-3", "sub", "2008139", null, null),
      "https://cdn.4animo.xyz/embed/hd-2/2008139/sub?k=1&autoPlay=0&skipIntro=0&skipOutro=0",
    );
  });

  it("routes unknown servers through hd-1 rather than dropping them", () => {
    assert.ok(
      iframeUrl("s-9", "sub", "2008139", "29/1", null).startsWith(
        "https://cdn.4animo.xyz/embed/hd-1/2008139/sub",
      ),
    );
  });
});

describe("hianime search parser", () => {
  it("extracts show slugs and titles from film-poster anchors", () => {
    const html = [
      '<a class="film-poster-ahref" href="/naruto-11" title="Naruto">',
      '<a class="film-poster-ahref" href="/one-piece-12" title="One Piece">',
      '<a class="film-poster-ahref" href="/naruto-11" title="Naruto">',
    ].join("");
    assert.deepEqual(parseSearchResults(html), [
      { id: "naruto-11", title: "Naruto" },
      { id: "one-piece-12", title: "One Piece" },
    ]);
  });

  it("returns an empty list when the page carries no results", () => {
    assert.deepEqual(parseSearchResults("<html><body>no results</body></html>"), []);
  });
});

describe("hianime embed provider contract", () => {
  it("declares embed-only capabilities with sub and dub", () => {
    const provider = new HiAnimeEmbedProvider();
    assert.equal(provider.slug, "hianime-embed");
    assert.deepEqual(provider.capabilities.accessTypes, ["embed"]);
    assert.ok(provider.capabilities.languages.includes("sub"));
    assert.ok(provider.capabilities.languages.includes("dub"));
  });
  it("stays inert when disabled via config", async () => {
    const provider = new HiAnimeEmbedProvider();
    provider.enabled = false;
    assert.deepEqual(
      await provider.resolve({
        animeId: "x",
        anilistId: "21",
        episodeNumber: 1,
        language: "sub",
        animeTitle: "One Piece",
      }),
      [],
    );
  });

  it("labels known servers and upper-cases unknown ones", async () => {
    const { serverLabel, getCachedServerAvailability } = await import(
      "../src/providers/streaming/hianime-embed.provider.js"
    );
    assert.equal(serverLabel("s-1"), "Flixera");
    assert.equal(serverLabel("s-2"), "HD-1");
    assert.equal(serverLabel("s-3"), "HD-2");
    assert.equal(serverLabel("s-9"), "S-9");
    // Nothing cached for an episode never resolved: unknown stays unknown.
    assert.equal(getCachedServerAvailability("21", 99991), null);
  });
});

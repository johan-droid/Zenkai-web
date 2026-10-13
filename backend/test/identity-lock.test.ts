import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InProcessProvider } from "../src/providers/streaming/inprocess.provider.js";
import { ConsumetProvider } from "../src/providers/streaming/consumet.provider.js";
import { resolveEpisodeIdentity } from "../src/modules/playback/identity.js";
import { EpisodeService } from "../src/modules/anime/episodes.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";

describe("ZENKAI-P0-IDENTITY-LOCK: identity integrity verification", () => {
  describe("title matching & sequel/spinoff rejection", () => {
    it("rejects sequels and spinoffs when target anime does not contain season tokens", () => {
      const titles = {
        romaji: "Bleach",
        english: "Bleach",
        native: "BLEACH",
        synonyms: [],
      };

      // Exact match must succeed
      assert.equal(
        InProcessProvider.matchTitle([{ id: "bleach-823", title: "Bleach" }], titles),
        "bleach-823",
        "exact match must succeed",
      );

      // Sequel "Thousand-Year Blood War" must be rejected
      assert.equal(
        InProcessProvider.matchTitle([{ id: "bleach-tybw", title: "Bleach: Thousand-Year Blood War" }], titles),
        null,
        "Bleach TYBW must not match Bleach",
      );

      // "Naruto" must not match "Naruto: Shippuden"
      const narutoTitles = {
        romaji: "Naruto",
        english: "Naruto",
        native: null,
        synonyms: [],
      };
      assert.equal(
        InProcessProvider.matchTitle([{ id: "naruto-shippuden-355", title: "Naruto Shippuden" }], narutoTitles),
        null,
        "Naruto must not match Naruto Shippuden",
      );

      // "Attack on Titan" must not match "Attack on Titan Season 2"
      const aotTitles = {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: null,
        synonyms: [],
      };
      assert.equal(
        InProcessProvider.matchTitle([{ id: "aot-s2", title: "Attack on Titan Season 2" }], aotTitles),
        null,
        "Attack on Titan must not match Season 2",
      );
    });

    it("matches verified alternate titles correctly", () => {
      const titles = {
        romaji: "Boku no Hero Academia",
        english: "My Hero Academia",
        native: "僕のヒーローアカデミア",
        synonyms: ["BNHA"],
      };

      assert.equal(
        InProcessProvider.matchTitle([{ id: "mha-1", title: "My Hero Academia" }], titles),
        "mha-1",
        "English title match",
      );
      assert.equal(
        InProcessProvider.matchTitle([{ id: "mha-2", title: "Boku no Hero Academia" }], titles),
        "mha-2",
        "Romaji title match",
      );
    });
  });

  describe("consumet provider safe matching", () => {
    it("returns null when candidate title does not match rather than blind fallback to candidate[0]", () => {
      const candidates = [
        { id: "naruto-shippuden", title: "Naruto Shippuden" },
        { id: "naruto-the-movie", title: "Naruto The Movie" },
      ];

      // Target title is plain "Naruto"
      const matched = ConsumetProvider.findMatchingShow(candidates, "Naruto", {
        english: null,
        romaji: null,
        native: null,
        synonyms: ["Boruto"],
      });
      assert.equal(matched, null, "consumet must not blindly select candidates[0] when title differs");
    });
  });

  describe("synthetic episode resolution", () => {
    function stubRepo(): AnimeRepository {
      return {
        async getEpisode() {
          return null;
        },
      } as unknown as AnimeRepository;
    }

    it("resolves valid episode identifiers carrying explicit episode number", async () => {
      const resolved = await resolveEpisodeIdentity(stubRepo(), "ep-15125-3");
      assert.ok(resolved);
      assert.equal(resolved.animeId, "15125");
      assert.equal(resolved.anilistId, "15125");
      assert.equal(resolved.episodeNumber, 3);
    });

    it("rejects unnumbered identifiers instead of silently defaulting to episode 1", async () => {
      const resolved = await resolveEpisodeIdentity(stubRepo(), "ep-15125");
      assert.equal(resolved, null, "unnumbered episode ID must return null");

      const resolvedRaw = await resolveEpisodeIdentity(stubRepo(), "15125");
      assert.equal(resolvedRaw, null, "bare anime ID must not resolve as an episode");
    });
  });

  describe("degraded mode catalogue episode count", () => {
    it("respects knownTotal for movies and single episode titles", async () => {
      const repo = {
        async getLocalIdByAnilistId() {
          return null; // DB not populated
        },
        async getTotalEpisodes(_id: string) {
          return 1; // E.g. Movie format
        },
      } as unknown as AnimeRepository;

      const service = new EpisodeService(repo);
      const catalogue = await service.catalogue("5000");

      assert.ok(catalogue);
      assert.equal(catalogue.episodes.length, 1, "Movie must generate 1 episode, not 12");
      assert.equal(catalogue.knownTotal, 1);
    });
  });
});

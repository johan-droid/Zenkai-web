import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InProcessProvider } from "../src/providers/streaming/inprocess.provider.js";
import { ConsumetProvider } from "../src/providers/streaming/consumet.provider.js";
import { renderTemplate } from "../src/providers/streaming/template.provider.js";
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

    it("prevents Gintama multi-season franchise collapse into 2006 parent show", () => {
      // 1. Gintama' (Season 2 / 2011, AniList 9969)
      const gintamaS2Titles = {
        canonicalTitle: "Gintama'",
        english: "Gintama: Season 2",
        romaji: "Gintama'",
        native: "銀魂'",
        synonyms: ["Gintama (2011)"],
      };

      // Must match Season 2 candidate when available
      assert.equal(
        InProcessProvider.matchTitle(
          [
            { id: "gintama-2006", title: "Gintama" },
            { id: "gintama-2011", title: "Gintama Season 2" },
          ],
          gintamaS2Titles,
        ),
        "gintama-2011",
        "Gintama Season 2 must match Season 2 candidate, never parent show",
      );

      // Must return null if only the 2006 parent show is returned (never fall back to Season 1)
      assert.equal(
        InProcessProvider.matchTitle(
          [{ id: "gintama-2006", title: "Gintama" }],
          gintamaS2Titles,
        ),
        null,
        "Gintama Season 2 must reject parent show Gintama when Season 2 is absent",
      );

      // 2. Gintama° (Season 4 / 2015, AniList 20996)
      const gintamaS4Titles = {
        canonicalTitle: "Gintama°",
        english: "Gintama Season 4",
        romaji: "Gintama°",
        native: "銀魂°",
        synonyms: ["Gintama (2015)"],
      };

      assert.equal(
        InProcessProvider.matchTitle(
          [
            { id: "gintama-2006", title: "Gintama" },
            { id: "gintama-2015", title: "Gintama Season 4" },
          ],
          gintamaS4Titles,
        ),
        "gintama-2015",
        "Gintama Season 4 must match Season 4 candidate",
      );

      assert.equal(
        InProcessProvider.matchTitle(
          [{ id: "gintama-2006", title: "Gintama" }],
          gintamaS4Titles,
        ),
        null,
        "Gintama Season 4 must reject parent show Gintama",
      );

      // 3. Gintama': Enchousen (Season 3 / 2012, AniList 15417)
      const gintamaEnchousenTitles = {
        canonicalTitle: "Gintama': Enchousen",
        english: "Gintama: Enchousen",
        romaji: "Gintama': Enchousen",
      };

      assert.equal(
        InProcessProvider.matchTitle(
          [
            { id: "gintama-2006", title: "Gintama" },
            { id: "gintama-enchousen", title: "Gintama: Enchousen" },
          ],
          gintamaEnchousenTitles,
        ),
        "gintama-enchousen",
        "Gintama Enchousen must match Enchousen candidate",
      );

      assert.equal(
        InProcessProvider.matchTitle(
          [{ id: "gintama-2006", title: "Gintama" }],
          gintamaEnchousenTitles,
        ),
        null,
        "Gintama Enchousen must reject parent show Gintama",
      );

      // 4. Gintama (Season 1 / 2006, AniList 918)
      const gintamaS1Titles = {
        canonicalTitle: "Gintama",
        english: "Gintama",
        romaji: "Gintama",
      };

      assert.equal(
        InProcessProvider.matchTitle(
          [
            { id: "gintama-2006", title: "Gintama" },
            { id: "gintama-2011", title: "Gintama Season 2" },
          ],
          gintamaS1Titles,
        ),
        "gintama-2006",
        "Gintama Season 1 must match 2006 candidate, not Season 2",
      );
    });

    it("disambiguates franchise sequels with punctuation indicators (K-ON!, Working!!)", () => {
      // K-ON! vs K-ON!!
      const konS2 = {
        canonicalTitle: "K-ON!!",
        english: "K-ON! Season 2",
        romaji: "K-ON!!",
      };
      assert.equal(
        InProcessProvider.matchTitle([{ id: "kon-1", title: "K-ON!" }], konS2),
        null,
        "K-ON!! must not match K-ON!",
      );
      assert.equal(
        InProcessProvider.matchTitle(
          [
            { id: "kon-1", title: "K-ON!" },
            { id: "kon-2", title: "K-ON!!" },
          ],
          konS2,
        ),
        "kon-2",
        "K-ON!! must match K-ON!!",
      );

      // Working!! vs Working'!!
      const workingS2 = {
        canonicalTitle: "Working'!!",
        english: "Wagnaria!! 2",
        romaji: "Working'!!",
      };
      assert.equal(
        InProcessProvider.matchTitle([{ id: "working-1", title: "Working!!" }], workingS2),
        null,
        "Working'!! must not match Working!!",
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

    it("prevents Gintama franchise collapse in ConsumetProvider", () => {
      const candidates = [
        { id: "gintama-2006", title: "Gintama" },
        { id: "gintama-2011", title: "Gintama Season 2" },
      ];

      const matchedS2 = ConsumetProvider.findMatchingShow(candidates, "Gintama'", {
        english: "Gintama: Season 2",
        romaji: "Gintama'",
      });
      assert.equal(matchedS2, "gintama-2011");

      const matchedSolo = ConsumetProvider.findMatchingShow(
        [{ id: "gintama-2006", title: "Gintama" }],
        "Gintama'",
        { english: "Gintama: Season 2", romaji: "Gintama'" },
      );
      assert.equal(matchedSolo, null, "ConsumetProvider must reject parent show when Season 2 is requested");
    });
  });

  describe("template provider episode endpoint enforcement", () => {
    it("rejects website homepage templates that lack episode tokens", () => {
      const request = {
        anilistId: "918",
        episodeNumber: 1,
        language: "sub",
        animeTitle: "Gintama",
      } as any;

      assert.equal(
        renderTemplate("https://reanime.to", request, "none"),
        null,
        "https://reanime.to must be rejected because it lacks an episode token",
      );

      assert.equal(
        renderTemplate("https://animesalt.cx/episode/{slug}/?server=mystream", request, "slug"),
        null,
        "Template without episode placeholder must be rejected",
      );
    });

    it("permits direct media stream demo templates without episode placeholder", () => {
      const request = {
        anilistId: "918",
        episodeNumber: 1,
        language: "sub",
        animeTitle: "Gintama",
      } as any;

      assert.equal(
        renderTemplate("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", request, "anilist"),
        "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "Direct .m3u8 demo stream must be allowed",
      );
    });

    it("renders valid templates with episode placeholder", () => {
      const request = {
        anilistId: "918",
        episodeNumber: 5,
        language: "sub",
        animeTitle: "Gintama",
      } as any;

      const rendered = renderTemplate("/media/{anilist}/episode-{episode}.m3u8", request, "anilist");
      assert.ok(rendered);
      assert.match(rendered, /\/media\/918\/episode-5\.m3u8$/);
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

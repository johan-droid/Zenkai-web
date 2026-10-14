import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InProcessProvider } from "../src/providers/streaming/inprocess.provider.js";
import { ConsumetProvider } from "../src/providers/streaming/consumet.provider.js";
import { renderTemplate } from "../src/providers/streaming/template.provider.js";
import { resolveEpisodeIdentity } from "../src/modules/playback/identity.js";
import { EpisodeService } from "../src/modules/anime/episodes.js";
import { buildShowCacheKey } from "../src/providers/streaming/matching.js";
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

  describe("generalized provider cache identity isolation (buildShowCacheKey)", () => {
    it("ensures canonical AniList IDs isolate multi-season franchise entries deterministically", () => {
      const franchises = [
        {
          name: "Gintama",
          seasons: [
            { id: "918", title: "Gintama" },
            { id: "9969", title: "Gintama'" },
            { id: "15417", title: "Gintama': Enchousen" },
            { id: "20996", title: "Gintama°" },
            { id: "97889", title: "Gintama." },
            { id: "99714", title: "Gintama. Porori-hen" },
            { id: "100784", title: "Gintama. Shirogane no Tamashii-hen" },
          ],
        },
        {
          name: "Attack on Titan",
          seasons: [
            { id: "16498", title: "Attack on Titan" },
            { id: "20958", title: "Attack on Titan Season 2" },
            { id: "99147", title: "Attack on Titan Season 3" },
            { id: "104578", title: "Attack on Titan Season 3 Part 2" },
            { id: "110277", title: "Attack on Titan The Final Season" },
            { id: "131681", title: "Attack on Titan The Final Season Part 2" },
          ],
        },
        {
          name: "Mob Psycho 100",
          seasons: [
            { id: "21507", title: "Mob Psycho 100" },
            { id: "101338", title: "Mob Psycho 100 II" },
            { id: "140439", title: "Mob Psycho 100 III" },
          ],
        },
        {
          name: "Bleach",
          seasons: [
            { id: "269", title: "Bleach" },
            { id: "114446", title: "Bleach: Thousand-Year Blood War" },
          ],
        },
        {
          name: "That Time I Got Reincarnated as a Slime",
          seasons: [
            { id: "101280", title: "That Time I Got Reincarnated as a Slime" },
            { id: "108511", title: "That Time I Got Reincarnated as a Slime Season 2" },
            { id: "142320", title: "That Time I Got Reincarnated as a Slime Season 3" },
          ],
        },
      ];

      for (const franchise of franchises) {
        const seenKeys = new Set<string>();
        for (const entry of franchise.seasons) {
          const req = {
            animeId: entry.id,
            anilistId: entry.id,
            episodeNumber: 1,
            language: "sub" as const,
            animeTitle: entry.title,
          };
          const res = buildShowCacheKey("hianime", req);
          assert.equal(res.isAmbiguous, false, `${franchise.name} ${entry.title} must not be marked ambiguous`);
          assert.equal(res.tier, "canonical_id");
          assert.equal(res.key, `hianime:show:anilist:${entry.id}`);
          assert.ok(!seenKeys.has(res.key), `Duplicate cache key found for ${entry.title}: ${res.key}`);
          seenKeys.add(res.key);
        }
      }
    });

    it("isolates remakes, reboots, and alternate editions with distinct canonical IDs", () => {
      const editions = [
        { orig: { id: "121", title: "Fullmetal Alchemist (2003)" }, remake: { id: "5114", title: "Fullmetal Alchemist: Brotherhood (2009)" } },
        { orig: { id: "136", title: "Hunter x Hunter (1999)" }, remake: { id: "11061", title: "Hunter x Hunter (2011)" } },
        { orig: { id: "120", title: "Fruits Basket (2001)" }, remake: { id: "105334", title: "Fruits Basket (2019)" } },
        { orig: { id: "45", title: "Rurouni Kenshin (1996)" }, remake: { id: "145893", title: "Rurouni Kenshin (2023)" } },
        { orig: { id: "154", title: "Shaman King (2001)" }, remake: { id: "119675", title: "Shaman King (2021)" } },
      ];

      for (const pair of editions) {
        const resOrig = buildShowCacheKey("hianime", { anilistId: pair.orig.id, animeTitle: pair.orig.title });
        const resRemake = buildShowCacheKey("hianime", { anilistId: pair.remake.id, animeTitle: pair.remake.title });

        assert.equal(resOrig.isAmbiguous, false);
        assert.equal(resRemake.isAmbiguous, false);
        assert.notEqual(resOrig.key, resRemake.key, `Orig ${pair.orig.title} and remake ${pair.remake.title} must have distinct keys`);
      }
    });

    it("disambiguates title-only requests using edition features when AniList ID is absent", () => {
      // 1. Season numbers
      const aotS2 = buildShowCacheKey("hianime", { animeTitle: "Attack on Titan Season 2" });
      const aotS3 = buildShowCacheKey("hianime", { animeTitle: "Attack on Titan Season 3" });
      assert.equal(aotS2.isAmbiguous, false);
      assert.equal(aotS3.isAmbiguous, false);
      assert.notEqual(aotS2.key, aotS3.key);
      assert.match(aotS2.key, /season2/);
      assert.match(aotS3.key, /season3/);

      // 2. Roman numerals
      const mob2 = buildShowCacheKey("hianime", { animeTitle: "Mob Psycho 100 II" });
      const mob3 = buildShowCacheKey("hianime", { animeTitle: "Mob Psycho 100 III" });
      assert.equal(mob2.isAmbiguous, false);
      assert.equal(mob3.isAmbiguous, false);
      assert.notEqual(mob2.key, mob3.key);
      assert.match(mob2.key, /roman_ii/);
      assert.match(mob3.key, /roman_iii/);

      // 3. Release years
      const hxh99 = buildShowCacheKey("hianime", { animeTitle: "Hunter x Hunter (1999)" });
      const hxh11 = buildShowCacheKey("hianime", { animeTitle: "Hunter x Hunter (2011)" });
      assert.equal(hxh99.isAmbiguous, false);
      assert.equal(hxh11.isAmbiguous, false);
      assert.notEqual(hxh99.key, hxh11.key);
      assert.match(hxh99.key, /year_1999/);
      assert.match(hxh11.key, /year_2011/);

      // 4. Punctuation indicators (K-ON!, Working!!, Gintama', Gintama°)
      const kon1 = buildShowCacheKey("hianime", { animeTitle: "K-ON!" });
      const kon2 = buildShowCacheKey("hianime", { animeTitle: "K-ON!!" });
      assert.equal(kon1.isAmbiguous, false);
      assert.equal(kon2.isAmbiguous, false);
      assert.notEqual(kon1.key, kon2.key);
      assert.match(kon1.key, /excl_1/);
      assert.match(kon2.key, /excl_2/);

      const gintamaPrime = buildShowCacheKey("hianime", { animeTitle: "Gintama'" });
      const gintamaDegree = buildShowCacheKey("hianime", { animeTitle: "Gintama°" });
      assert.equal(gintamaPrime.isAmbiguous, false);
      assert.equal(gintamaDegree.isAmbiguous, false);
      assert.notEqual(gintamaPrime.key, gintamaDegree.key);
      assert.match(gintamaPrime.key, /prime_1/);
      assert.match(gintamaDegree.key, /degree_1/);

      // 5. Franchise subtitles
      const fmaBro = buildShowCacheKey("hianime", { animeTitle: "Fullmetal Alchemist: Brotherhood" });
      assert.equal(fmaBro.isAmbiguous, false);
      assert.match(fmaBro.key, /sub_brotherhood/);
    });

    it("marks bare unadorned titles without canonical ID as ambiguous to prevent cache poisoning", () => {
      const ambiguousTitles = [
        "Gintama",
        "Attack on Titan",
        "Hunter x Hunter",
        "Bleach",
        "Naruto",
        "Mob Psycho 100",
      ];

      for (const title of ambiguousTitles) {
        const res = buildShowCacheKey("hianime", { animeTitle: title });
        assert.equal(
          res.isAmbiguous,
          true,
          `Bare title '${title}' without ID or edition features must be flagged ambiguous`,
        );
        assert.equal(res.tier, "ambiguous");
        assert.match(res.key, /^hianime:show:ambiguous:/);
      }
    });

    it("isolates provider namespaces and falls back to MAL ID when AniList ID is absent", () => {
      const req = {
        animeId: "918",
        malId: "918",
        episodeNumber: 1,
        language: "sub" as const,
        animeTitle: "Gintama",
      };

      // Provider slug isolation
      const hianimeKey = buildShowCacheKey("hianime", req);
      const zoroKey = buildShowCacheKey("zoro", req);
      assert.notEqual(hianimeKey.key, zoroKey.key);
      assert.match(hianimeKey.key, /^hianime:/);
      assert.match(zoroKey.key, /^zoro:/);

      // MAL ID fallback
      assert.equal(hianimeKey.tier, "canonical_id");
      assert.equal(hianimeKey.key, "hianime:show:mal:918");
      assert.equal(hianimeKey.isAmbiguous, false);

      // InProcessProvider static delegator
      const delegated = InProcessProvider.buildCacheKey("hianime", req as any);
      assert.deepEqual(delegated, hianimeKey);
    });
  });
});

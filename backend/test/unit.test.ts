/**
 * Unit tests for logic whose failure is silent.
 *
 * These cover the areas where a subtle mistake does not throw: the SSRF guard
 * decides whether the service can be turned into an open proxy, and the
 * health/ranking maths decides whether a dead provider keeps winning. Both
 * regress quietly, so they are pinned here rather than only exercised through
 * the live API.
 *
 * Run with `npm test`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeUrl, BlockedUrlError, isPrivateAddress } from "../src/http/url-guard.js";
import {
  FAILURE_THRESHOLD,
  healthRegistry,
} from "../src/providers/streaming/health.js";
import {
  dedupeSources,
  filterByLanguage,
  parseResolution,
  rankSources,
} from "../src/providers/streaming/ranking.js";
import { imageUrl, toSummary } from "../src/providers/metadata/anilist.js";
import {
  normalizeTitle,
  stripHtml,
  titleSimilarity,
} from "../src/domain/media.js";
import { slugify } from "../src/modules/anime/repository.js";
import type { PlaybackSource } from "../src/providers/streaming/types.js";

const source = (over: Partial<PlaybackSource> = {}): PlaybackSource => ({
  id: "s1",
  providerSlug: "p1",
  providerName: "P1",
  endpointSlug: "default",
  accessType: "hls",
  playbackUrl: "https://example.com/a.m3u8",
  language: "sub",
  priority: 10,
  ...over,
});

describe("url guard", () => {
  it("classifies private and public addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "169.254.169.254",
      "172.16.0.1",
      "::1",
    ]) {
      assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
    }

    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
    }
  });

  it("blocks the cloud metadata endpoint", async () => {
    // The highest-value SSRF target, so it is asserted explicitly.
    await assert.rejects(
      () => assertSafeUrl("http://169.254.169.254/latest/meta-data/"),
      BlockedUrlError,
    );
  });

  it("blocks non-http schemes and embedded credentials", async () => {
    await assert.rejects(() => assertSafeUrl("file:///etc/passwd"), BlockedUrlError);
    await assert.rejects(
      () => assertSafeUrl("http://user:pw@example.com/"),
      BlockedUrlError,
    );
  });

  it("enforces an allowlist when configured", async () => {
    await assert.rejects(
      () => assertSafeUrl("https://evil.test/x", { allowlist: ["cdn.example.com"] }),
      BlockedUrlError,
    );
  });

  it("rejects malformed input", async () => {
    await assert.rejects(() => assertSafeUrl("not a url"), BlockedUrlError);
  });
});

describe("health registry", () => {
  it("does not penalise a provider for an empty result", () => {
    // The distinction P7 exists for: "no stream for this episode" is a miss, not
    // an outage, and treating it as a failure quarantines good providers.
    const slug = "test-empty";
    healthRegistry.record(slug, "ok", 100);
    const before = healthRegistry.get(slug).failureStreak;

    for (let i = 0; i < FAILURE_THRESHOLD + 2; i++) {
      healthRegistry.record(slug, "empty", 100);
    }

    assert.equal(healthRegistry.get(slug).failureStreak, before);
    assert.equal(healthRegistry.isQuarantined(slug), false);
  });

  it("quarantines a provider after consecutive transport failures", () => {
    const slug = "test-dead";

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      healthRegistry.record(slug, "error", 100, "boom");
    }

    assert.equal(healthRegistry.isQuarantined(slug), true);
  });

  it("clears the failure streak once the provider recovers", () => {
    const slug = "test-recover";

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      healthRegistry.record(slug, "timeout", 100, "slow");
    }
    healthRegistry.record(slug, "ok", 50);

    assert.equal(healthRegistry.get(slug).failureStreak, 0);
    assert.equal(healthRegistry.isQuarantined(slug), false);
  });

  it("forgets quarantined providers on reset", () => {
    const slug = "test-reset";

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      healthRegistry.record(slug, "error", 10, "boom");
    }
    assert.ok(healthRegistry.resetQuarantined() >= 1);
    assert.equal(healthRegistry.isQuarantined(slug), false);
  });
});

describe("ranking", () => {
  it("parses quality strings into a resolution", () => {
    assert.equal(parseResolution("1080p"), 1080);
    assert.equal(parseResolution("1920x1080"), 1080);
    assert.equal(parseResolution("auto"), undefined);
    assert.equal(parseResolution(undefined), undefined);
  });

  it("prefers a direct stream over an embed", () => {
    const ranked = rankSources([
      source({ id: "embed", accessType: "embed" }),
      source({ id: "hls", accessType: "hls" }),
    ]);

    assert.equal(ranked[0].id, "hls");
  });

  it("prefers a higher resolution when access types match", () => {
    const ranked = rankSources([
      source({ id: "sd", resolution: 360 }),
      source({ id: "hd", resolution: 1080 }),
    ]);

    assert.equal(ranked[0].id, "hd");
  });

  it("keeps multi alongside the requested language but drops dub", () => {
    const kept = filterByLanguage(
      [
        source({ id: "sub" }),
        source({ id: "multi", language: "multi" }),
        source({ id: "dub", language: "dub" }),
      ],
      "sub",
    );

    assert.deepEqual(kept.map((item) => item.id).sort(), ["multi", "sub"]);
  });

  it("drops duplicate urls, keeping the higher-ranked copy", () => {
    const deduped = dedupeSources([
      { ...source({ id: "a" }), rank: 0.9 },
      { ...source({ id: "b" }), rank: 0.5 },
    ]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, "a");
  });

  it("drops a quarantined provider's sources", () => {
    // Regression: health used to be keyed by (providerSlug, endpointSlug) while
    // the resolver recorded under (providerSlug, providerSlug). For a template
    // endpoint `endpointSlug` is "sub", so a fully quarantined provider still
    // ranked and still played. Both sides must agree on one key, so this test
    // writes exactly as the resolver writes and reads exactly as ranking reads.
    const slug = "test-quarantine-rank";
    const dead = source({ id: "dead", providerSlug: slug, endpointSlug: "sub" });

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      healthRegistry.record(slug, "error", 100, "boom");
    }

    assert.equal(healthRegistry.isQuarantined(slug), true, "provider should be quarantined");
    assert.deepEqual(rankSources([dead]), []);
  });
});

describe("normalisation", () => {
  it("strips html but keeps paragraph and line boundaries", () => {
    // `<br>` is a single break; a `<p>` boundary keeps a blank line between
    // paragraphs, so a synopsis reads as prose rather than one run-on line.
    assert.equal(stripHtml("<p>one</p><p>two</p>"), "one\n\ntwo");
    assert.equal(stripHtml("a<br>b"), "a\nb");
    assert.equal(stripHtml("a &amp; b"), "a & b");
  });

  it("normalises titles for cross-provider matching", () => {
    assert.equal(normalizeTitle("Kimi no Na wa."), "kimi no na wa");
    assert.equal(normalizeTitle("The  Attack  on Titan"), "attack on titan");
  });

  it("matches spelling variants of the same title", () => {
    // Token overlap cannot bridge translations, so the guarantee is only about
    // spelling variants. See the note on titleSimilarity.
    assert.ok(titleSimilarity("Kimi no Na wa", "Kimi No Na Wa.") === 1);
    assert.ok(titleSimilarity("Kimi no Na wa", "Your Name") === 0);
  });

  it("sizes AniList cover urls without duplicating the extension", () => {
    assert.equal(imageUrl("https://s/img/cover.jpg", 300, 450), "https://s/img/cover-300x450.jpg");
    assert.equal(imageUrl(undefined, 300), null);
  });

  it("keeps slugs unique for titles sharing a normal form", () => {
    assert.equal(slugify("Attack on Titan", "16498"), "attack-on-titan-16498");
    assert.notEqual(slugify("Attack on Titan", "1"), slugify("Attack on Titan", "2"));
  });

  it("maps a raw AniList node onto the canonical model", () => {
    const mapped = toSummary({
      id: 21,
      idMal: 21,
      title: { romaji: "One Piece", english: "One Piece" },
      description: "<p>pirates</p>",
      format: "TV",
      status: "RELEASING",
      isAdult: false,
      averageScore: 88,
      // Airing series have no episode count yet.
      episodes: null,
      duration: 24,
      genres: ["Action"],
      coverImage: { medium: "https://s/img/m.jpg", extraLarge: "https://s/img/l.jpg" },
      startDate: { year: 1999 },
    });

    assert.equal(mapped.canonicalTitle, "One Piece");
    assert.equal(mapped.description, "pirates");
    // An explicit `episodes: null` means "AniList has no count yet", which is
    // distinct from a field the response never mentioned. Neither is a count of
    // zero, and the distinction matters: `null` clears a stored value, while
    // `undefined` preserves it.
    assert.equal(mapped.totalEpisodes, null);
    assert.equal(mapped.year, 1999);
    assert.equal(mapped.externalIds.mal, "21");
  });

  it("distinguishes an omitted episode count from an explicitly empty one", () => {
    // Guarding the merge contract at its source: a sparse response must not be
    // able to erase a known episode count on re-sync.
    const omitted = toSummary({ id: 21, title: { romaji: "One Piece" } });
    assert.equal(omitted.totalEpisodes, undefined, "an absent field must not clear a value");

    const explicit = toSummary({ id: 21, episodes: null, title: { romaji: "One Piece" } });
    assert.equal(explicit.totalEpisodes, null, "an explicit null is a real answer");
  });
});
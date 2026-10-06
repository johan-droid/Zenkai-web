/**
 * P14 architectural gate: the migrated watch path must not touch a metadata
 * provider, the legacy source resolver, or AniSkip.
 *
 * The backend is the provider boundary. This test scans every executable
 * module of the watch surface and fails if a provider client, the browser-side
 * source stack, a provider host URL, or a credential reappears in the path. It
 * is deliberately static: a future import is caught before it ever runs in a
 * browser.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Every executable module of the migrated watch surface (P14). */
const WATCH_PATH_MODULES = [
  "src/app/(main)/watch/[id]/[ep]/page.tsx",
  "src/components/player/watch-view.tsx",
  "src/components/player/video-player.tsx",
  "src/components/player/embed-player.tsx",
  "src/components/player/source-switcher.tsx",
  "src/components/player/episode-list.tsx",
  "src/lib/api/zenkai.ts",
] as const;

/** Frontend provider clients and the duplicated source-resolution stack. */
const FORBIDDEN_MODULES = [
  "lib/api/anilist",
  "lib/api/mangadex",
  "lib/api/aniskip",
  "lib/sources/registry",
  "lib/sources/resolver",
  "schemas/anilist",
  "schemas/mangadex",
];

/** Direct provider endpoints the frontend must never request. */
const PROVIDER_HOSTS = [
  "graphql.anilist.co",
  "api.mangadex.org",
  "uploads.mangadex.org",
  "api.aniskip.com",
];

function read(srcRelative: string): string {
  return readFileSync(new URL(`../${srcRelative}`, import.meta.url), "utf8");
}

describe("watch provider boundary", () => {
  it("keeps every watch module free of provider imports", () => {
    for (const path of WATCH_PATH_MODULES) {
      const source = read(path);
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.ok(
          !source.includes(forbidden),
          `${path} imports the direct-provider module "${forbidden}"`,
        );
      }
    }
  });

  it("addresses no provider host from the watch path", () => {
    for (const path of WATCH_PATH_MODULES) {
      const source = read(path);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(
          !source.includes(host),
          `${path} references the direct provider host ${host}`,
        );
      }
    }
  });

  it("does not expose provider credentials to the browser", () => {
    for (const path of WATCH_PATH_MODULES) {
      const source = read(path);
      for (const secret of ["Bearer", "Authorization:", "client_secret", "api_key", "apiKey"]) {
        assert.ok(!source.includes(secret), `${path} may carry a provider credential`);
      }
    }
  });

  it("wires the watch page to the canonical client (positive control)", () => {
    const page = read("src/app/(main)/watch/[id]/[ep]/page.tsx");
    assert.ok(
      page.includes("watch-view"),
      "the watch route must render the canonical WatchView",
    );

    const view = read("src/components/player/watch-view.tsx");
    assert.ok(view.includes("lib/api/zenkai"), "watch view no longer reads the canonical client");
    assert.ok(view.includes("fetchEpisodeSources"), "watch view lost the canonical sources fetch");
    assert.ok(view.includes("executePlayback"), "watch view lost the canonical execution");
    assert.ok(view.includes("fetchEpisodeMetadata"), "watch view lost the canonical metadata fetch");
    assert.ok(view.includes("fetchEpisodeNavigation"), "watch view lost the canonical navigation");
  });

  it("gates source requests on the airing state and resolves identity via the catalogue", () => {
    const view = read("src/components/player/watch-view.tsx");
    // The unreleased gate: an upcoming episode must never trigger a sources call.
    assert.ok(view.includes("isUnreleased"), "the airing gate disappeared from the watch view");
    assert.ok(
      view.includes("airingState") && view.includes("upcoming"),
      "the watch view no longer reads the canonical airing state",
    );
    // Episode identity comes from the canonical catalogue, never a fabricated id.
    assert.ok(
      view.includes("episodeCard?.id") || view.includes("episodeCard.id"),
      "the watch view must address sources by the canonical episode id",
    );
    // The queries themselves must be gated on the airing state — merely having
    // the guard in the render path is not enough.
    assert.ok(
      view.includes("enabled: Boolean(episodeCard) && !unreleased"),
      "source and metadata queries must be gated on the airing state",
    );
  });

  it("executes the selected canonical source, never a plan index or URL", () => {
    const view = read("src/components/player/watch-view.tsx");
    // The execute call must carry the selected source's canonical identity.
    assert.ok(
      view.includes("sourceId: selectedSourceId"),
      "execution must use the selected source's canonical id, not plans[0] or an index",
    );
    assert.ok(
      !view.includes("sourceId: plans[0]"),
      "execution must not hardcode the top plan",
    );
  });

  it("re-resolves sources when the language changes", () => {
    const view = read("src/components/player/watch-view.tsx");
    // The sources query key includes the language, so a language change refetches.
    assert.ok(
      view.includes('"episode-sources", episodeCard?.id, language'),
      "the sources query must be keyed by language to re-resolve on change",
    );
    const client = read("src/lib/api/zenkai.ts");
    assert.ok(
      client.includes("playbackLanguageSchema"),
      "the canonical client must validate the language enum",
    );
  });

  it("bounds stale-selection recovery", () => {
    const view = read("src/components/player/watch-view.tsx");
    assert.ok(
      view.includes("MAX_STALE_RETRIES") && view.includes("retryNonce < MAX_STALE_RETRIES"),
      "stale-selection recovery must be bounded, never an infinite retry",
    );
  });

  it("renders embeds as iframes, never as media", () => {
    const view = read("src/components/player/watch-view.tsx");
    assert.ok(
      view.includes("embed-player") && view.includes('execution.kind === "embed"'),
      "the watch view must branch on the execution kind and render the embed player",
    );
    const embed = read("src/components/player/embed-player.tsx");
    assert.ok(embed.includes("<iframe"), "the embed player must render an iframe");
    assert.ok(!embed.includes("<video"), "the embed player must never render a video element");
  });

  it("falls back to the next canonical plan on playback failure", () => {
    const view = read("src/components/player/watch-view.tsx");
    assert.ok(
      view.includes("fallbackPlanSelection(plans, selectedSourceId)"),
      "a failed plan must advance to the next canonical plan",
    );
  });

  it("sends only canonical identity to the execution boundary", () => {
    const client = read("src/lib/api/zenkai.ts");
    // The execute request body is exactly { episodeId, sourceId, language }.
    assert.ok(client.includes("/api/v1/playback/execute"), "canonical client lost the execute endpoint");
    assert.ok(
      !client.includes("sourceUrl") && !client.includes("streamUrl") && !client.includes("providerUrl"),
      "the canonical client must never send a URL/provider field to execute",
    );
  });
});

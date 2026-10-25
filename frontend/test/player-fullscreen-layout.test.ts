/**
 * Regression test suite for Phase 3B-A Vidstack fullscreen hit-testing fixes.
 *
 * Verifies:
 * 1. Small layout (<576px) pointer-events: Vidstack disables pointer events on
 *    Group 3 (`nth-last-child(2)`), but globals.css safely re-enables `pointer-events: auto`
 *    strictly on `.vds-fullscreen-button` without broadening to surrounding title/time/gestures.
 * 2. Large layout (>=576px) slider overlap: The slider group has `z-index: 11` and `margin-bottom: -16px`.
 *    globals.css elevates the bottom controls group (`:last-child`) to `z-index: 12`
 *    scoped with `:not([data-sm])` so it never mistakenly targets the small layout slider.
 * 3. Cascade specificity: Fixes avoid `!important` by using the `[data-media-player]` container attribute.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(relPath: string): string {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

describe("player fullscreen hit-testing layout fixes", () => {
  const globalsCss = read("src/app/globals.css");
  const vidstackVideoCss = read("node_modules/@vidstack/react/player/styles/default/layouts/video.css");

  it("confirms Vidstack upstream defect definitions in video.css", () => {
    // 1. Vidstack sets pointer-events: none on small layout Group 3
    assert.match(
      vidstackVideoCss,
      /:where\(\.vds-video-layout\[data-sm\]\s+\.vds-controls-group:nth-last-child\(2\)\)\s*\{[^}]*pointer-events:\s*none/,
      "Vidstack must define pointer-events: none on small layout nth-last-child(2)",
    );

    // 2. Vidstack sets z-index: 11 with negative margin on nth-last-child(2)
    assert.match(
      vidstackVideoCss,
      /\.vds-video-layout\s+\.vds-controls-group:nth-last-child\(2\)\s*\{[^}]*z-index:\s*11;[^}]*margin-bottom:\s*-16px;/,
      "Vidstack must define z-index: 11 and margin-bottom: -16px on large layout slider group",
    );

    // 3. Vidstack sets z-index: 10 on large layout last-child
    assert.match(
      vidstackVideoCss,
      /\.vds-video-layout:not\(\[data-sm\]\)\s+\.vds-controls-group:last-child\s*\{[^}]*z-index:\s*10;/,
      "Vidstack must define z-index: 10 on large layout bottom controls group",
    );
  });

  it("applies scoped pointer-events: auto to small-layout fullscreen button", () => {
    // Must target .vds-fullscreen-button in small layout
    assert.match(
      globalsCss,
      /\[data-media-player\]\s+\.vds-video-layout\[data-sm\]\s+\.vds-fullscreen-button\s*\{[^}]*pointer-events:\s*auto;/,
      "globals.css must restore pointer-events: auto on small-layout fullscreen button",
    );

    // Must NOT use !important
    const match = globalsCss.match(
      /\[data-media-player\]\s+\.vds-video-layout\[data-sm\]\s+\.vds-fullscreen-button\s*\{([^}]*)\}/,
    );
    assert.ok(match, "Rule block must exist");
    assert.ok(!match[1].includes("!important"), "Small layout fix must not use !important");

    // Must NOT broadly enable pointer-events on time or title
    assert.ok(
      !globalsCss.includes(".vds-video-layout[data-sm] .vds-time-info { pointer-events: auto"),
      "Must not enable pointer events on time info",
    );
    assert.ok(
      !globalsCss.includes(".vds-video-layout[data-sm] .vds-controls-group:nth-last-child(2) { pointer-events: auto"),
      "Must not broadly enable pointer events on the entire Group 3 container",
    );
  });

  it("elevates large-layout bottom controls group z-index without unscoped last-child collision", () => {
    // Must target large layout last-child with z-index >= 12
    assert.match(
      globalsCss,
      /\[data-media-player\]\s+\.vds-video-layout:not\(\[data-sm\]\)\s+\.vds-controls-group:last-child\s*\{[^}]*z-index:\s*12;/,
      "globals.css must elevate large-layout bottom controls group to z-index: 12",
    );

    // Must NOT use !important
    const match = globalsCss.match(
      /\[data-media-player\]\s+\.vds-video-layout:not\(\[data-sm\]\)\s+\.vds-controls-group:last-child\s*\{([^}]*)\}/,
    );
    assert.ok(match, "Rule block must exist");
    assert.ok(!match[1].includes("!important"), "Large layout fix must not use !important");

    // Must NOT use an unscoped .vds-controls-group:last-child that would target the small layout slider
    const matches = Array.from(globalsCss.matchAll(/([^\n;{}]+)\.vds-controls-group:last-child/g));
    assert.ok(matches.length > 0, "Expected at least one last-child selector in globals.css");
    for (const match of matches) {
      assert.ok(
        match[1].includes(":not([data-sm])") || match[1].includes("[data-lg]"),
        `Selector "${match[0]}" must be scoped to large layout to avoid targeting small-layout slider`,
      );
    }
  });

  it("preserves player keyboard shortcuts and container fullscreen controls", () => {
    const hotkeys = read("src/components/player/player-hotkeys.tsx");
    assert.ok(hotkeys.includes('{ keys: ["F"], action: "Fullscreen" }'), "Shortcut dialog must document F");

    const embed = read("src/components/player/embed-player.tsx");
    assert.ok(embed.includes("containerRef.current.requestFullscreen?.()"), "Embed player must preserve container fullscreen");

    const video = read("src/components/player/video-player.tsx");
    assert.ok(video.includes("<DefaultVideoLayout"), "Video player must preserve DefaultVideoLayout");
  });
});

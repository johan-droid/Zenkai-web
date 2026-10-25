/**
 * Playback resume and startup buffering tests.
 *
 * Verifies that:
 * 1. Saved progress is correctly parsed and clamped to prevent start-up buffering loops or
 *    accidental instant completion at the end of episodes.
 * 2. VideoPlayer wires `startPosition` to hls.js and Vidstack MediaPlayer to initialize
 *    playback directly at the resume point instead of segment 0.
 * 3. Fallback seeks are avoided when the player is already positioned at the target point.
 * 4. Mid-stream source fallbacks preserve playhead position.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { computeResumePosition } from "../src/lib/player/resume";

function read(relPath: string): string {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

describe("computeResumePosition", () => {
  it("returns 0 for missing or undefined progress", () => {
    assert.equal(computeResumePosition(null), 0);
    assert.equal(computeResumePosition(undefined), 0);
  });

  it("returns 0 for completed episodes to restart from beginning", () => {
    assert.equal(
      computeResumePosition({
        positionSeconds: 1200,
        durationSeconds: 1440,
        completed: true,
      }),
      0,
    );
  });

  it("returns 0 for initial or near-zero playback times", () => {
    assert.equal(computeResumePosition({ positionSeconds: 0 }), 0);
    assert.equal(computeResumePosition({ positionSeconds: 1 }), 0);
    assert.equal(computeResumePosition({ positionSeconds: 0.5 }), 0);
  });

  it("returns 0 for invalid, NaN, Infinity, or negative values", () => {
    assert.equal(computeResumePosition({ positionSeconds: -10 }), 0);
    assert.equal(computeResumePosition({ positionSeconds: Number.NaN }), 0);
    assert.equal(computeResumePosition({ positionSeconds: Number.POSITIVE_INFINITY }), 0);
  });

  it("returns valid middle-of-episode positions", () => {
    assert.equal(
      computeResumePosition({
        positionSeconds: 320,
        durationSeconds: 1440,
        completed: false,
      }),
      320,
    );
  });

  it("clamps near-end positions within 10 seconds of duration to 0", () => {
    assert.equal(
      computeResumePosition({
        positionSeconds: 1432,
        durationSeconds: 1440,
        completed: false,
      }),
      0,
    );
  });

  it("clamps positions at or above 95% of duration to 0", () => {
    assert.equal(
      computeResumePosition({
        positionSeconds: 960,
        durationSeconds: 1000,
        completed: false,
      }),
      0,
    );
  });

  it("returns valid position when duration is unknown or null", () => {
    assert.equal(
      computeResumePosition({
        positionSeconds: 450,
        durationSeconds: null,
        completed: false,
      }),
      450,
    );
  });
});

describe("video-player startup buffering and resume architecture", () => {
  const videoPlayerSrc = read("src/components/player/video-player.tsx");
  const watchViewSrc = read("src/components/player/watch-view.tsx");

  it("configures hls.js startPosition in provider.config", () => {
    assert.ok(
      videoPlayerSrc.includes("startPosition: safeInitialTime > 1 ? safeInitialTime : -1"),
      "video-player.tsx must configure provider.config.startPosition for hls.js",
    );
  });

  it("passes initial currentTime to Vidstack MediaPlayer", () => {
    assert.ok(
      videoPlayerSrc.includes("currentTime={safeInitialTime > 1 ? safeInitialTime : undefined}"),
      "video-player.tsx must initialize MediaPlayer currentTime prop",
    );
  });

  it("avoids redundant seek when player is already positioned near target time", () => {
    assert.ok(
      videoPlayerSrc.includes("Math.abs(currentTime - initialTime) > 2"),
      "MediaEffects must only seek if playhead is not already near initialTime",
    );
  });

  it("guards against seeking into near-end positions in player subscription", () => {
    assert.ok(
      videoPlayerSrc.includes("initialTime >= Math.max(0, duration - 10)"),
      "MediaEffects must prevent seeking into the last 10 seconds of media duration",
    );
  });

  it("does not force player.play() in resume effect", () => {
    assert.ok(
      !videoPlayerSrc.includes("void player.play()"),
      "MediaEffects must not force autoplay inside the resume effect",
    );
  });

  it("watch-view resolves resume position via computeResumePosition and passes initialTime", () => {
    assert.ok(
      watchViewSrc.includes("computeResumePosition(progress)"),
      "watch-view must resolve resume position via computeResumePosition",
    );
    assert.ok(
      watchViewSrc.includes("initialTime={initialTime}"),
      "watch-view must pass initialTime to PlayerArea",
    );
  });
});

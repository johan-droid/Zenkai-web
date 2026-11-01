/**
 * Zenkai Playback Automation Test Suite (Phases 1-6 & 9).
 *
 * Covers:
 * 1. Segment validation & episode isolation.
 * 2. Provider capability checking (media vs embed).
 * 3. Playback automation controller state machine & safeguards.
 * 4. Duplicate skip prevention & backwards seek protection.
 * 5. Next episode countdown controller (ticks, pause, resume, cancel, playNow).
 * 6. Store preference integration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateSegment,
  isAutomationSupported,
  PlaybackAutomationController,
  NextEpisodeCountdownController,
  type EpisodeSegment,
} from "../src/lib/player/automation";
import { usePlayerStore } from "../src/stores/player";
import type { PlaybackExecution } from "../src/lib/api/zenkai";

describe("Segment Validation (Phase 2)", () => {
  it("validates a healthy intro segment", () => {
    const valid: EpisodeSegment = {
      episodeId: "ep-101",
      segmentType: "intro",
      startTime: 60,
      endTime: 150,
    };
    assert.equal(validateSegment(valid, 1440), true);
  });

  it("validates when episode duration is null or unknown", () => {
    const valid: EpisodeSegment = {
      episodeId: "ep-101",
      segmentType: "intro",
      startTime: 30,
      endTime: 120,
    };
    assert.equal(validateSegment(valid, null), true);
    assert.equal(validateSegment(valid, undefined), true);
  });

  it("rejects null, undefined, or malformed segments", () => {
    assert.equal(validateSegment(null), false);
    assert.equal(validateSegment(undefined), false);
    assert.equal(
      validateSegment({
        episodeId: "ep-1",
        segmentType: "intro",
        startTime: Number.NaN,
        endTime: 100,
      }),
      false,
    );
  });

  it("rejects negative start time", () => {
    const segment: EpisodeSegment = {
      episodeId: "ep-1",
      segmentType: "intro",
      startTime: -5,
      endTime: 90,
    };
    assert.equal(validateSegment(segment, 1440), false);
  });

  it("rejects end time less than or equal to start time", () => {
    assert.equal(
      validateSegment(
        { episodeId: "ep-1", segmentType: "intro", startTime: 100, endTime: 100 },
        1440,
      ),
      false,
    );
    assert.equal(
      validateSegment(
        { episodeId: "ep-1", segmentType: "intro", startTime: 100, endTime: 90 },
        1440,
      ),
      false,
    );
  });

  it("rejects segments that are unrealistically short (< 5s)", () => {
    const short: EpisodeSegment = {
      episodeId: "ep-1",
      segmentType: "intro",
      startTime: 60,
      endTime: 63, // 3 seconds
    };
    assert.equal(validateSegment(short, 1440), false);
  });

  it("rejects segments that are unrealistically long (> 360s)", () => {
    const long: EpisodeSegment = {
      episodeId: "ep-1",
      segmentType: "intro",
      startTime: 10,
      endTime: 400, // 390 seconds
    };
    assert.equal(validateSegment(long, 1440), false);
  });

  it("rejects segments where start time exceeds total duration", () => {
    const overflow: EpisodeSegment = {
      episodeId: "ep-1",
      segmentType: "outro",
      startTime: 1500,
      endTime: 1590,
    };
    assert.equal(validateSegment(overflow, 1440), false);
  });

  it("rejects segments that consume more than 90% of the entire episode", () => {
    const wholeEpisode: EpisodeSegment = {
      episodeId: "ep-1",
      segmentType: "intro",
      startTime: 10,
      endTime: 290, // 280s out of 300s
    };
    assert.equal(validateSegment(wholeEpisode, 300), false);
  });
});

describe("Provider Capability Checking (Phase 3)", () => {
  it("allows automation for media executions with seek capability", () => {
    const execution: PlaybackExecution = {
      kind: "media",
      mechanism: "hls",
      url: "https://example.com/stream.m3u8",
      mediaType: "application/vnd.apple.mpegurl",
      delivery: "client",
      sourceId: "source-1",
      providerSlug: "novus",
      providerName: "Novus",
      language: "sub",
      validated: true,
      playable: true,
      capabilities: { seekable: true, ranged: true },
    };
    assert.equal(isAutomationSupported(execution), true);
  });

  it("disables automation when seekable is explicitly false", () => {
    const execution: PlaybackExecution = {
      kind: "media",
      mechanism: "progressive",
      url: "https://example.com/video.mp4",
      mediaType: "video/mp4",
      delivery: "client",
      sourceId: "source-2",
      providerSlug: "static",
      providerName: "Static",
      language: "sub",
      validated: true,
      playable: true,
      capabilities: { seekable: false, ranged: null },
    };
    assert.equal(isAutomationSupported(execution), false);
  });

  it("disables automation for external embed iframe executions", () => {
    const embedExecution: PlaybackExecution = {
      kind: "embed",
      mechanism: "iframe",
      url: "https://example.com/embed/player",
      mediaType: null,
      sourceId: "embed-1",
      providerSlug: "hianime-embed",
      providerName: "HiAnime Embed",
      language: "sub",
      validated: true,
      playable: true,
    };
    assert.equal(isAutomationSupported(embedExecution), false);
  });

  it("disables automation when execution is null or undefined", () => {
    assert.equal(isAutomationSupported(null), false);
    assert.equal(isAutomationSupported(undefined), false);
  });
});

describe("Playback Automation Controller (Phases 3-5)", () => {
  const introSegment: EpisodeSegment = {
    episodeId: "ep-100",
    segmentType: "intro",
    startTime: 60,
    endTime: 150,
  };

  const outroSegment: EpisodeSegment = {
    episodeId: "ep-100",
    segmentType: "outro",
    startTime: 1300,
    endTime: 1420,
  };

  it("automatically skips intro when enabled and entering the segment", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: true,
      autoSkipOutro: false,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });
    controller.setPlaybackState("playing");

    // Before intro
    const before = controller.evaluate(30);
    assert.deepEqual(before, { type: "none" });

    // Enters intro
    const atIntro = controller.evaluate(65);
    assert.equal(atIntro.type, "auto-skip");
    if (atIntro.type === "auto-skip") {
      assert.equal(atIntro.segmentType, "intro");
      assert.equal(atIntro.targetTime, 150.1);
      assert.equal(atIntro.notification, "Intro skipped");
    }

    // Subsequent tick at targetTime returns none (prevent duplicate loop)
    const after = controller.evaluate(150.1);
    assert.deepEqual(after, { type: "none" });
  });

  it("safeguards against re-skipping if user manually rewinds into intro", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: true,
      autoSkipOutro: false,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });
    controller.setPlaybackState("playing");

    // First skip
    controller.evaluate(65);
    assert.equal(controller.isHandled("intro"), true);

    // User seeks backward to second 80 to rewatch the opening song
    const rewindTick = controller.evaluate(80);
    // Should NOT auto-skip again! Instead offers manual button
    assert.equal(rewindTick.type, "show-manual");
  });

  it("shows manual skip button when auto-skip is disabled", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: false,
      autoSkipOutro: false,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });
    controller.setPlaybackState("playing");

    const decision = controller.evaluate(75);
    assert.equal(decision.type, "show-manual");
    if (decision.type === "show-manual") {
      assert.equal(decision.segmentType, "intro");
      assert.equal(decision.label, "Skip Intro");
      assert.equal(decision.targetTime, 150.1);
    }

    // Moving past intro emits hide-manual
    const pastIntro = controller.evaluate(151);
    assert.deepEqual(pastIntro, { type: "hide-manual" });
  });

  it("automatically skips outro when enabled", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: false,
      autoSkipOutro: true,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });
    controller.setPlaybackState("playing");

    const decision = controller.evaluate(1305);
    assert.equal(decision.type, "auto-skip");
    if (decision.type === "auto-skip") {
      assert.equal(decision.segmentType, "outro");
      assert.equal(decision.notification, "Outro skipped");
    }
  });

  it("never triggers skips during buffering, loading, or seeking", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: true,
      autoSkipOutro: true,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });

    controller.setPlaybackState("buffering");
    assert.deepEqual(controller.evaluate(75), { type: "none" });

    controller.setPlaybackState("loading");
    assert.deepEqual(controller.evaluate(75), { type: "none" });

    controller.setSeeking(true);
    assert.deepEqual(controller.evaluate(75), { type: "none" });
  });

  it("resets state when episode changes", () => {
    const controller = new PlaybackAutomationController({
      episodeId: "ep-100",
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro: true,
      autoSkipOutro: false,
      showSkipButtons: true,
      isSupported: true,
      duration: 1440,
    });
    controller.setPlaybackState("playing");
    controller.evaluate(75);
    assert.equal(controller.isHandled("intro"), true);

    controller.reset("ep-101");
    assert.equal(controller.isHandled("intro"), false);
  });
});

describe("Next Episode Countdown Controller (Phase 6)", () => {
  it("manages countdown transitions: start, tick, and complete", () => {
    return new Promise<void>((resolve) => {
      let ticks = 0;
      const countdown = new NextEpisodeCountdownController({
        durationSeconds: 2,
        onTick: () => {
          ticks++;
        },
        onComplete: () => {
          assert.ok(ticks >= 1, "expected at least one tick");
          assert.equal(countdown.getState(), "completed");
          countdown.destroy();
          resolve();
        },
      });

      assert.equal(countdown.getState(), "idle");
      countdown.start();
      assert.equal(countdown.getState(), "counting");
    });
  });

  it("supports pausing and resuming the countdown", () => {
    const countdown = new NextEpisodeCountdownController({
      durationSeconds: 10,
      onComplete: () => {},
    });

    countdown.start();
    assert.equal(countdown.getState(), "counting");

    countdown.pause();
    assert.equal(countdown.getState(), "paused");

    countdown.resume();
    assert.equal(countdown.getState(), "counting");

    countdown.destroy();
  });

  it("supports cancelling the countdown", () => {
    let cancelled = false;
    const countdown = new NextEpisodeCountdownController({
      durationSeconds: 10,
      onComplete: () => {},
      onCancel: () => {
        cancelled = true;
      },
    });

    countdown.start();
    countdown.cancel();
    assert.equal(countdown.getState(), "cancelled");
    assert.equal(cancelled, true);
    countdown.destroy();
  });

  it("supports immediate transition via playNow", () => {
    let completed = false;
    const countdown = new NextEpisodeCountdownController({
      durationSeconds: 10,
      onComplete: () => {
        completed = true;
      },
    });

    countdown.start();
    countdown.playNow();
    assert.equal(countdown.getState(), "completed");
    assert.equal(completed, true);
    countdown.destroy();
  });
});

describe("Player Store Automation Preferences (Phase 1)", () => {
  it("initializes with spec defaults", () => {
    const state = usePlayerStore.getState();
    assert.equal(typeof state.autoSkipIntro, "boolean");
    assert.equal(typeof state.autoSkipOutro, "boolean");
    assert.equal(typeof state.autoplayNext, "boolean");
    assert.equal(typeof state.nextEpisodeCountdown, "number");
    assert.equal(typeof state.showSkipButtons, "boolean");
  });

  it("updates and clamps automation preferences", () => {
    const store = usePlayerStore.getState();

    store.setAutoSkipIntro(true);
    assert.equal(usePlayerStore.getState().autoSkipIntro, true);
    assert.equal(usePlayerStore.getState().autoSkip, true); // legacy sync

    store.setAutoSkipOutro(true);
    assert.equal(usePlayerStore.getState().autoSkipOutro, true);

    store.setNextEpisodeCountdown(15);
    assert.equal(usePlayerStore.getState().nextEpisodeCountdown, 15);

    // Clamps negative to 0 and excessive to 60
    store.setNextEpisodeCountdown(-5);
    assert.equal(usePlayerStore.getState().nextEpisodeCountdown, 0);

    store.setNextEpisodeCountdown(100);
    assert.equal(usePlayerStore.getState().nextEpisodeCountdown, 60);

    store.setShowSkipButtons(false);
    assert.equal(usePlayerStore.getState().showSkipButtons, false);

    // Reset back to defaults
    store.setAutoSkipIntro(false);
    store.setAutoSkipOutro(false);
    store.setNextEpisodeCountdown(10);
    store.setShowSkipButtons(true);
  });
});

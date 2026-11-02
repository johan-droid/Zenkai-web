"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Zenkai Cinematic Startup Intro
 *
 * A short, branded entry that runs once per browser session.
 *
 * - ~1.7s from veil to reveal (inside the 1–2s budget), then removed from the
 *   DOM entirely so it can never intercept clicks, focus, or scrolling.
 * - Pure CSS animation: no extra JavaScript frame work on low-powered phones.
 * - Bypassed immediately (and remembered) under `prefers-reduced-motion`.
 * - Dismissible with click, Escape, or any key press.
 * - A hard teardown timer guarantees the overlay cannot outlive its welcome
 *   even if the compositor drops frames.
 */

const INTRO_SEEN_KEY = "zenkai_intro_seen";
const INTRO_DURATION_MS = 1700;
/** Longest possible lifetime, including the exit transition. */
const INTRO_HARD_STOP_MS = 2600;

type Phase = "idle" | "playing" | "leaving" | "done";

export function IntroAnimation() {
  const [phase, setPhase] = useState<Phase>("idle");

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Ignore storage failures; the overlay still tears down.
    }
    setPhase("leaving");
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      // Storage can throw in private browsing; show the intro in that case.
    }

    const markSeen = () => {
      try {
        sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      } catch {
        // Non-fatal: the intro simply runs again next time.
      }
    };

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (seen || reducedMotion) {
      markSeen();
      const skipTimer = window.setTimeout(() => setPhase("done"), 0);
      return () => window.clearTimeout(skipTimer);
    }

    // Start on the next tick rather than synchronously inside the effect. The
    // overlay is opaque from its first frame, so this costs no visible content
    // flash and keeps the effect from cascading renders.
    const startTimer = window.setTimeout(() => setPhase("playing"), 0);
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), INTRO_DURATION_MS);
    const removeTimer = window.setTimeout(() => {
      markSeen();
      setPhase("done");
    }, INTRO_DURATION_MS + 300);
    const hardStopTimer = window.setTimeout(() => {
      markSeen();
      setPhase("done");
    }, INTRO_HARD_STOP_MS);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
      window.clearTimeout(hardStopTimer);
    };
  }, []);

  // Any key press (Escape included) skips the rest of the sequence.
  useEffect(() => {
    if (phase !== "playing" && phase !== "leaving") return;

    const onKeyDown = () => dismiss();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, dismiss]);

  // Once leaving, unmount on a timer rather than relying on an animation event
  // that a backgrounded tab may never fire.
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), 280);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      className="zenkai-intro"
      data-leaving={phase === "leaving" ? "true" : undefined}
      onClick={dismiss}
      role="presentation"
      aria-hidden="true"
    >
      <div className="zenkai-intro__glow" />
      <div className="zenkai-intro__sweep" />

      <div className="zenkai-intro__stage">
        <div className="zenkai-intro__mark">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 884 457"
            aria-hidden="true"
            className="size-full"
          >
            <path
              className="fill-signal"
              d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z"
            />
            <path
              className="fill-white/90"
              d="M884 0h-93L248 377h93L884 0Z"
            />
          </svg>
        </div>

        <div className="zenkai-intro__word">
          <span className="zenkai-intro__brand">ZENKAI</span>
          <span className="zenkai-intro__tagline">全開 · STREAMING</span>
        </div>
      </div>
    </div>
  );
}

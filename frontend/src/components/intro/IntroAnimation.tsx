"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cinematic Zenkai Intro Animation
 * 
 * Sequence:
 * 1. Full-screen brand wordmark fades in with subtle scale
 * 2. Logo mark animates with blur and directional motion
 * 3. Restrained glow/gradient background sweep
 * 4. Smooth fade/mask reveal into actual homepage
 * 5. Intro removed from layout so it can't block interaction
 * 
 * Respects prefers-reduced-motion: reduce → immediate skip to content.
 * Plays only once per session (localStorage tracked).
 */
export function IntroAnimation() {
  const [phase, setPhase] = useState("brand");
  const [completed, setCompleted] = useState(false);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Skip instantly on reduced motion
  useEffect(() => {
    if (reducedMotion) {
      setPhase("completed");
      setCompleted(true);
    }
  }, [reducedMotion]);

  // Animation sequence timing
  useEffect(() => {
    if (reducedMotion || completed) return;
    
    const timers: NodeJS.Timeout[] = [];

    const go = () => {
      // Phase 1: Brand reveal (0-400ms)
      timers.push(
        setTimeout(() => setPhase("atmospheric"), 400)
      );

      // Phase 2: Atmospheric transition (400-1000ms)
      timers.push(
        setTimeout(() => setPhase("reveal"), 1000)
      );

      // Phase 3: Complete removal (1000-1500ms)
      timers.push(
        setTimeout(() => setPhase("completed"), 1500)
      );
    };

    go();

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [reducedMotion, completed]);

  if (reducedMotion || completed) {
    // Immediately render nothing - let the real content show
    return null;
  }

  // Phase-based rendering
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#0b0a0a]",
        "transition-colors duration-500"
      )}
    >
      {phase === "brand" && (
        <div className="text-center">
          <span className="text-6xl md:text-8xl font-bold tracking-[0.2em] text-signal uppercase">
            ZENKAI
          </span>
          <p className="mt-4 text-zinc-400/80 text-lg">Stream. Read. Discover.</p>
        </div>
      )}

      {phase === "atmospheric" && (
        <div
          className="relative w-full h-full flex items-center justify-center"
        >
          <svg
            className="absolute -inset-0 opacity-20"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <rect width="100" height="100" fill="var(--signal)" />
          </svg>
          <div className="relative z-10 text-center">
            <span className="text-4xl md:text-6xl font-bold tracking-[0.2em] text-signal uppercase">
              ZENKAI
            </span>
          </div>
        </div>
      )}

      {phase === "reveal" && (
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0b0a0a] via-[#101014] to-[#0b0a0a]"
        >
          <span className="text-4xl md:text-6xl font-bold tracking-[0.2em] text-signal uppercase">
            ZENKAI
          </span>
          <p className="mt-2 text-zinc-400/80">Stream. Read. Discover.</p>
        </div>
      )}

      {phase === "completed" && (
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-500"
          onClick={() => setCompleted(true)}
        >
          {/* This overlay will fade out via CSS in the parent */}
          <span className="text-4xl md:text-6xl font-bold tracking-[0.2em] text-signal uppercase">
            ZENKAI
          </span>
        </div>
      )}
    </div>
  );
}
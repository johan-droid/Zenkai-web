"use client";

import { Play, X, Pause, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NextEpisodeOverlayProps {
  remainingSeconds: number;
  nextEpisodeNumber: number;
  nextEpisodeTitle?: string | null;
  isPaused?: boolean;
  onPlayNow: () => void;
  onCancel: () => void;
  onTogglePause?: () => void;
}

/**
 * Non-intrusive next episode countdown overlay.
 * Appears when an episode completes and Auto Play Next Episode is enabled.
 * Supports pause/resume of the countdown via onTogglePause.
 */
export function NextEpisodeOverlay({
  remainingSeconds,
  nextEpisodeNumber,
  nextEpisodeTitle,
  isPaused = false,
  onPlayNow,
  onCancel,
  onTogglePause,
}: NextEpisodeOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative flex max-w-sm w-full flex-col items-center gap-4 rounded-2xl border border-glass-border bg-zinc-950/90 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Cancel autoplay"
          aria-label="Cancel countdown"
        >
          <X className="size-4" />
        </button>

        {/* Circular Countdown Indicator — clickable to toggle pause */}
        <button
          type="button"
          onClick={onTogglePause}
          disabled={!onTogglePause}
          className="relative flex size-14 items-center justify-center rounded-full bg-red-600/20 text-red-400 ring-2 ring-red-500/40 transition-transform hover:scale-110 active:scale-95 disabled:hover:scale-100 disabled:cursor-default"
          title={isPaused ? "Resume countdown" : "Pause countdown"}
          aria-label={isPaused ? "Resume countdown" : "Pause countdown"}
        >
          {isPaused ? (
            <Pause className="size-6 animate-pulse" />
          ) : (
            <span className="font-mono text-xl font-extrabold tabular-nums">
              {remainingSeconds}
            </span>
          )}
        </button>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-red-400">
            {isPaused ? "Autoplay Paused" : "Playing Next Episode in"}
          </span>
          <h3 className="font-bold text-white text-base">
            Episode {nextEpisodeNumber}
          </h3>
          {nextEpisodeTitle && (
            <p className="line-clamp-1 text-xs text-zinc-400">
              {nextEpisodeTitle}
            </p>
          )}
        </div>

        <div className="flex w-full items-center gap-2.5 pt-1">
          <Button
            variant="outline"
            className="flex-1 glass rounded-xl text-xs font-semibold hover:bg-white/10"
            onClick={onCancel}
          >
            Cancel
          </Button>
          {onTogglePause && (
            <Button
              variant="outline"
              className="glass rounded-xl text-xs font-semibold hover:bg-white/10 gap-1.5"
              onClick={onTogglePause}
            >
              {isPaused ? (
                <>
                  <Timer className="size-3.5 text-amber-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="size-3.5 text-zinc-400" />
                  <span>Pause</span>
                </>
              )}
            </Button>
          )}
          <Button
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs gap-1.5 shadow-lg shadow-red-600/30"
            onClick={onPlayNow}
          >
            <Play className="size-3.5 fill-current" />
            <span>Play Now</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

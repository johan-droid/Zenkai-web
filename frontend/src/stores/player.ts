import { create } from "zustand";
import { persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/config/site";

/**
 * Preferred audio shelf. These are the canonical language values (P7) — the
 * only ones the watch path may send; provider-specific labels never reach the
 * wire from here.
 */
export type AudioPreference = "sub" | "dub" | "multi";

export interface PlayerState {
  /** Preferred audio shelf; also the label shown in the switcher. */
  audio: AudioPreference;
  /** Autoplay the next episode when one finishes. */
  autoplayNext: boolean;
  /** Alias for autoplayNext matching Phase 1 spec. */
  autoPlayNext: boolean;
  /** Default playback rate. */
  playbackRate: number;
  /** Remembered volume, 0-1. */
  volume: number;
  muted: boolean;
  /** Legacy single auto-skip toggle (synced with autoSkipIntro for backward compatibility). */
  autoSkip: boolean;
  /** Automatically skip verified intro segments. */
  autoSkipIntro: boolean;
  /** Automatically skip verified outro segments. */
  autoSkipOutro: boolean;
  /** Countdown in seconds before automatically transitioning to the next episode. */
  nextEpisodeCountdown: number;
  /** Whether to show manual skip buttons when auto-skip is disabled. */
  showSkipButtons: boolean;
  theaterMode: boolean;

  setAudio: (audio: AudioPreference) => void;
  setAutoplayNext: (value: boolean) => void;
  setAutoPlayNext: (value: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (value: boolean) => void;
  setAutoSkip: (value: boolean) => void;
  setAutoSkipIntro: (value: boolean) => void;
  setAutoSkipOutro: (value: boolean) => void;
  setNextEpisodeCountdown: (seconds: number) => void;
  setShowSkipButtons: (value: boolean) => void;
  setTheaterMode: (value: boolean) => void;
  toggleTheaterMode: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      audio: "sub",
      autoplayNext: true,
      autoPlayNext: true,
      playbackRate: 1,
      volume: 1,
      muted: false,
      autoSkip: false,
      autoSkipIntro: false,
      autoSkipOutro: false,
      nextEpisodeCountdown: 10,
      showSkipButtons: true,
      theaterMode: false,

      setAudio: (audio) => set({ audio }),
      setAutoplayNext: (autoplayNext) => set({ autoplayNext, autoPlayNext: autoplayNext }),
      setAutoPlayNext: (autoPlayNext) => set({ autoplayNext: autoPlayNext, autoPlayNext }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
      setAutoSkip: (autoSkip) => set({ autoSkip, autoSkipIntro: autoSkip }),
      setAutoSkipIntro: (autoSkipIntro) => set({ autoSkipIntro, autoSkip: autoSkipIntro }),
      setAutoSkipOutro: (autoSkipOutro) => set({ autoSkipOutro }),
      setNextEpisodeCountdown: (nextEpisodeCountdown) =>
        set({ nextEpisodeCountdown: Math.max(0, Math.min(60, nextEpisodeCountdown)) }),
      setShowSkipButtons: (showSkipButtons) => set({ showSkipButtons }),
      setTheaterMode: (theaterMode) => set({ theaterMode }),
      toggleTheaterMode: () => set((state) => ({ theaterMode: !state.theaterMode })),
    }),
    {
      name: STORAGE_KEYS.player,
      partialize: (state) => ({
        audio: state.audio,
        autoplayNext: state.autoplayNext,
        autoPlayNext: state.autoPlayNext,
        playbackRate: state.playbackRate,
        volume: state.volume,
        muted: state.muted,
        autoSkip: state.autoSkip,
        autoSkipIntro: state.autoSkipIntro,
        autoSkipOutro: state.autoSkipOutro,
        nextEpisodeCountdown: state.nextEpisodeCountdown,
        showSkipButtons: state.showSkipButtons,
        theaterMode: state.theaterMode,
      }),
    },
  ),
);

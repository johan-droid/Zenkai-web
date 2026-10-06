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
  /** Default playback rate. */
  playbackRate: number;
  /** Remembered volume, 0-1. */
  volume: number;
  muted: boolean;
  /** Skip intro/outro when the canonical metadata service has markers. */
  autoSkip: boolean;
  theaterMode: boolean;

  setAudio: (audio: AudioPreference) => void;
  setAutoplayNext: (value: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (value: boolean) => void;
  setAutoSkip: (value: boolean) => void;
  setTheaterMode: (value: boolean) => void;
  toggleTheaterMode: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      audio: "sub",
      autoplayNext: true,
      playbackRate: 1,
      volume: 1,
      muted: false,
      autoSkip: true,
      theaterMode: false,

      setAudio: (audio) => set({ audio }),
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
      setAutoSkip: (autoSkip) => set({ autoSkip }),
      setTheaterMode: (theaterMode) => set({ theaterMode }),
      toggleTheaterMode: () => set((state) => ({ theaterMode: !state.theaterMode })),
    }),
    {
      name: STORAGE_KEYS.player,
      partialize: (state) => ({
        audio: state.audio,
        autoplayNext: state.autoplayNext,
        playbackRate: state.playbackRate,
        volume: state.volume,
        muted: state.muted,
        autoSkip: state.autoSkip,
        theaterMode: state.theaterMode,
      }),
    },
  ),
);

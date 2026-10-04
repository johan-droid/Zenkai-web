import { create } from "zustand";
import { persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/config/site";
import type { SourceCandidate } from "@/lib/sources/types";

export type AudioPreference = "sub" | "dub";

export interface PlayerState {
  /** Preferred audio track; also the label shown in the switcher. */
  audio: AudioPreference;
  /** Autoplay the next episode when one finishes. */
  autoplayNext: boolean;
  /** Default playback rate. */
  playbackRate: number;
  /** Remembered volume, 0-1. */
  volume: number;
  muted: boolean;
  /** Skip intro/outro when AniSkip has timestamps. */
  autoSkip: boolean;
  /** Manual source override; `null` means "auto, use the resolver order". */
  preferredSourceId: string | null;
  theaterMode: boolean;
  /** Persisted so the player can restore the last used source on reload. */
  lastCandidate: SourceCandidate | null;

  setAudio: (audio: AudioPreference) => void;
  setAutoplayNext: (value: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (value: boolean) => void;
  setAutoSkip: (value: boolean) => void;
  setPreferredSource: (id: string | null) => void;
  setTheaterMode: (value: boolean) => void;
  toggleTheaterMode: () => void;
  setLastCandidate: (candidate: SourceCandidate | null) => void;
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
      preferredSourceId: null,
      theaterMode: false,
      lastCandidate: null,

      setAudio: (audio) => set({ audio }),
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
      setAutoSkip: (autoSkip) => set({ autoSkip }),
      setPreferredSource: (preferredSourceId) => set({ preferredSourceId }),
      setTheaterMode: (theaterMode) => set({ theaterMode }),
      toggleTheaterMode: () => set((state) => ({ theaterMode: !state.theaterMode })),
      setLastCandidate: (lastCandidate) => set({ lastCandidate }),
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
        preferredSourceId: state.preferredSourceId,
        theaterMode: state.theaterMode,
      }),
    },
  ),
);

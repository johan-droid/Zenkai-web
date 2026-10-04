"use client";

import { MediaPlayer, useMediaPlayer, useMediaRemote } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import type { MediaProviderAdapter } from "@vidstack/react";
import { isHLSProvider } from "@vidstack/react";
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

import { SkipButton } from "@/components/player/skip-button";
import { isWithin, type SkipTimes } from "@/lib/api/aniskip";
import type { SourceCandidate } from "@/lib/sources/types";

import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

export interface VideoPlayerProps {
  candidate: SourceCandidate | null;
  title: string;
  poster?: string | null;
  /** Seconds to resume from. */
  initialTime?: number;
  skipTimes: SkipTimes;
  autoSkip: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  onProgress: (positionSeconds: number, durationSeconds: number) => void;
  onEnded: () => void;
  onError: () => void;
}

/**
 * The video player.
 *
 * Vidstack owns playback and the control chrome; we layer on the pieces the app
 * needs: HLS via hls.js, resume position, progress reporting and skip intro/outro.
 */
export function VideoPlayer({
  candidate,
  title,
  poster,
  initialTime = 0,
  skipTimes,
  autoSkip,
  playbackRate,
  volume,
  muted,
  onProgress,
  onEnded,
  onError,
}: VideoPlayerProps) {
  const player = useMediaPlayer();
  const remote = useMediaRemote();
  const [activeSkip, setActiveSkip] = useState<"opening" | "ending" | "recap" | null>(null);

  const restored = useRef(false);
  const endedRef = useRef(false);
  const handlers = useRef({ onProgress, onEnded, onError });

  // Keep the latest callbacks reachable from the subscriptions below without
  // re-subscribing every render. Must run in an effect: writing a ref during
  // render is not allowed.
  useEffect(() => {
    handlers.current = { onProgress, onEnded, onError };
  }, [onProgress, onEnded, onError]);

  // Wire hls.js into Vidstack's HLS provider.
  const onProviderChange = (provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      provider.library = Hls;
      provider.config = {
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      };
    }
  };

  // Report progress and detect end-of-media.
  useEffect(() => {
    if (!player || !candidate) return;

    return player.subscribe(({ currentTime, duration, ended }) => {
      if (duration > 0) handlers.current.onProgress(currentTime, duration);

      if (ended && !endedRef.current) {
        endedRef.current = true;
        handlers.current.onEnded();
      } else if (!ended) {
        endedRef.current = false;
      }

      // Skip button visibility is derived from time, but only re-renders when
      // the active interval actually changes.
      const next = isWithin(skipTimes.opening, currentTime)
        ? "opening"
        : isWithin(skipTimes.ending, currentTime)
          ? "ending"
          : isWithin(skipTimes.recap, currentTime)
            ? "recap"
            : null;
      setActiveSkip((previous) => (previous === next ? previous : next));
    });
  }, [player, candidate, skipTimes]);

  // Restore the resume position once, as soon as the media is seekable.
  useEffect(() => {
    if (!player || !candidate || restored.current || initialTime <= 1) return;

    return player.subscribe(({ canPlay }) => {
      if (!canPlay || restored.current) return;
      restored.current = true;
      player.currentTime = initialTime;
      if (volume !== 1) player.volume = volume;
      player.muted = muted;
      void player.play().catch(() => {
        /* Autoplay may be blocked; the user can press play. */
      });
    });
  }, [player, candidate, initialTime, volume, muted]);

  // Each new stream is a fresh media element, so allow the resume seek to run again.
  useEffect(() => {
    restored.current = false;
    endedRef.current = false;
  }, [candidate?.url]);

  // Apply rate/volume changes from the settings UI live.
  useEffect(() => {
    if (!player) return;
    player.volume = volume;
    player.muted = muted;
    remote.changePlaybackRate(playbackRate, new Event("ratechange"));
  }, [player, remote, playbackRate, volume, muted]);

  const handleSkip = () => {
    if (!player || !activeSkip) return;
    const interval = skipTimes[activeSkip];
    if (interval) player.currentTime = interval.endTime + 0.1;
  };

  // Placed after every hook so the hook order stays stable across renders.
  if (!candidate) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 glass-panel">
        <p className="text-sm text-muted-foreground animate-pulse">Loading stream source...</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <MediaPlayer
        title={title}
        src={candidate.url}
        poster={poster ?? undefined}
        playsInline
        crossOrigin
        onProviderChange={onProviderChange}
        onError={() => handlers.current.onError()}
        className="aspect-video w-full overflow-hidden rounded-2xl bg-black"
      >
        <DefaultVideoLayout icons={defaultLayoutIcons} noModal />
      </MediaPlayer>

      {activeSkip ? (
        <SkipButton
          label={activeSkip === "opening" ? "Skip intro" : activeSkip === "ending" ? "Skip outro" : "Skip recap"}
          autoSkip={autoSkip}
          onSkip={handleSkip}
        />
      ) : null}
    </div>
  );
}

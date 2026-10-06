"use client";

import { MediaPlayer, MediaProvider, useMediaPlayer, useMediaRemote } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import type { MediaProviderAdapter } from "@vidstack/react";
import { isHLSProvider } from "@vidstack/react";
import Hls from "hls.js";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { SkipButton } from "@/components/player/skip-button";
import type { PlaybackExecution } from "@/lib/api/zenkai";

import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

/** Skip markers as the canonical metadata service reports them (P10). */
export interface SkipInterval {
  startTime: number;
  endTime: number;
}

export interface SkipTimes {
  opening: SkipInterval | null;
  ending: SkipInterval | null;
  recap: SkipInterval | null;
}

export function isWithin(interval: SkipInterval | null, time: number): boolean {
  return Boolean(interval && time >= interval.startTime && time < interval.endTime);
}

/**
 * The only playback URL the client may use is the one the backend executed.
 * When the plan says the upstream is only reachable through the relay
 * (`delivery: "proxied"`), the relayed manifest path replaces the direct URL —
 * the client never decides that on its own.
 */
export function mediaSrc(execution: PlaybackExecution & { kind: "media" }): string {
  return execution.delivery === "proxied" && execution.proxyUrl
    ? execution.proxyUrl
    : execution.url;
}

/**
 * Media type from the canonical execution: Vidstack switches the provider by
 * it (`application/vnd.apple.mpegurl` → HLS, everything else → progressive).
 * Without an explicit type the player never settles a provider, which the
 * pre-P14 code hit because it passed the bare URL string.
 */
function mediaTypeFor(
  execution: PlaybackExecution & { kind: "media" },
): "application/vnd.apple.mpegurl" | "video/mp4" {
  if (execution.mechanism === "hls") return "application/vnd.apple.mpegurl";
  return (execution.mediaType ?? "video/mp4") as "video/mp4";
}

export interface VideoPlayerProps {
  execution: PlaybackExecution & { kind: "media" };
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
 * Source acquisition is gone: the `execution` prop is the backend's answer to
 * `POST /playback/execute`, and its URL is the only one ever played.
 *
 * Every `useMedia*` access is inside `MediaEffects`, a child of `<MediaPlayer>`:
 * the hooks throw outside the player tree, while here they get its context.
 */
export function VideoPlayer({
  execution,
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
  const [activeSkip, setActiveSkip] = useState<"opening" | "ending" | "recap" | null>(null);
  const handlers = useRef({ onProgress, onEnded, onError });
  const playerApi = useRef<{ seekTo: (timeSeconds: number) => void } | null>(null);

  // Keep the latest callbacks reachable from subscriptions below without
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

  const handleSkip = () => {
    if (!activeSkip) return;
    const interval = skipTimes[activeSkip];
    if (interval) playerApi.current?.seekTo(interval.endTime + 0.1);
  };

  return (
    <div className="relative">
      <MediaPlayer
        title={title}
        src={{ src: mediaSrc(execution), type: mediaTypeFor(execution) }}
        poster={poster ?? undefined}
        playsInline
        crossOrigin
        onProviderChange={onProviderChange}
        onError={() => handlers.current.onError()}
        className="aspect-video w-full overflow-hidden rounded-2xl bg-black"
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} noModal />
        <MediaEffects
          execution={execution}
          initialTime={initialTime}
          skipTimes={skipTimes}
          playbackRate={playbackRate}
          volume={volume}
          muted={muted}
          handlers={handlers}
          playerApi={playerApi}
          onActiveSkipChange={setActiveSkip}
        />
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

function MediaEffects({
  execution,
  initialTime,
  skipTimes,
  playbackRate,
  volume,
  muted,
  handlers,
  playerApi,
  onActiveSkipChange,
}: {
  execution: PlaybackExecution & { kind: "media" };
  initialTime: number;
  skipTimes: SkipTimes;
  playbackRate: number;
  volume: number;
  muted: boolean;
  handlers: MutableRefObject<{ onProgress: (a: number, b: number) => void; onEnded: () => void; onError: () => void }>;
  playerApi: MutableRefObject<{ seekTo: (timeSeconds: number) => void } | null>;
  onActiveSkipChange: (next: "opening" | "ending" | "recap" | null) => void;
}) {
  const player = useMediaPlayer();
  const remote = useMediaRemote();
  const restored = useRef(false);
  const endedRef = useRef(false);

  // Each new stream is a fresh media element, so allow the resume seek again.
  useEffect(() => {
    restored.current = false;
    endedRef.current = false;
    onActiveSkipChange(null);
  }, [execution?.url, onActiveSkipChange]);

  // Report progress, detect end-of-media, and track which skip interval is live.
  useEffect(() => {
    if (!player) return;

    return player.subscribe(({ currentTime, duration, ended }) => {
      if (duration > 0) handlers.current.onProgress(currentTime, duration);

      if (ended && !endedRef.current) {
        endedRef.current = true;
        handlers.current.onEnded();
      } else if (!ended) {
        endedRef.current = false;
      }

      // The active interval only re-renders when the current one actually changes.
      const next = isWithin(skipTimes.opening, currentTime)
        ? "opening"
        : isWithin(skipTimes.ending, currentTime)
          ? "ending"
          : isWithin(skipTimes.recap, currentTime)
            ? "recap"
            : null;
      onActiveSkipChange(next);
    });
  }, [player, skipTimes, handlers, onActiveSkipChange]);

  // Restore the resume position once, as soon as the media is seekable.
  useEffect(() => {
    if (!player || restored.current || initialTime <= 1) return;

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
  }, [player, initialTime, volume, muted]);

  // Apply rate/volume changes from the settings UI live.
  useEffect(() => {
    if (!player) return;
    player.volume = volume;
    player.muted = muted;
    remote.changePlaybackRate(playbackRate, new Event("ratechange"));
  }, [player, remote, playbackRate, volume, muted]);

  // Expose seek control up to the parent skip button.
  useEffect(() => {
    if (!player) return;
    playerApi.current = { seekTo: (timeSeconds) => { player.currentTime = timeSeconds; } };
    return () => {
      playerApi.current = null;
    };
  }, [player, playerApi]);

  return null;
}

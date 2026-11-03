"use client";

import { MediaPlayer, MediaProvider, useMediaPlayer, useMediaRemote } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import type { MediaProviderAdapter } from "@vidstack/react";
import { isHLSProvider } from "@vidstack/react";
import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Check } from "lucide-react";

import { SkipButton } from "@/components/player/skip-button";
import type { PlaybackExecution } from "@/lib/api/zenkai";
import { computeResumePosition } from "@/lib/player/resume";
import {
  PlaybackAutomationController,
  isAutomationSupported,
  type EpisodeSegment,
} from "@/lib/player/automation";

export { computeResumePosition };

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
 * Bounded hls.js retry/timeout policy.
 *
 * This is the first line of recovery, and it is deliberately delegated to
 * hls.js rather than reimplemented: its retry scheduler already applies
 * exponential backoff with jitter and it knows which error class is safe to
 * retry. Our budget only starts *after* these are exhausted, because a fatal
 * error from hls.js means it has already spent them.
 */
const HLS_RECOVERY_CONFIG = {
  // Manifest fetch: a cold provider can be slow, but not infinitely.
  manifestLoadingTimeOut: 15_000,
  manifestLoadingMaxRetry: 2,
  manifestLoadingRetryDelay: 1_000,
  // Variant playlists.
  levelLoadingTimeOut: 15_000,
  levelLoadingMaxRetry: 3,
  levelLoadingRetryDelay: 1_000,
  // Segments: the transient-CDN-failure case. Bounded, never unbounded.
  fragLoadingTimeOut: 20_000,
  fragLoadingMaxRetry: 4,
  fragLoadingRetryDelay: 1_000,
} as const;

/** Which hls.js recovery a classified error maps onto. */
type RecoveryKind = "network" | "media";

/**
 * Media type from the canonical execution: Vidstack switches the provider by
 * it (`application/vnd.apple.mpegurl` → HLS, everything else → progressive).
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
  autoSkip?: boolean;
  autoSkipIntro?: boolean;
  autoSkipOutro?: boolean;
  showSkipButtons?: boolean;
  episodeId?: string;
  playbackRate: number;
  volume: number;
  muted: boolean;
  onProgress: (positionSeconds: number, durationSeconds: number) => void;
  onEnded: () => void;
  /** Receives the raw player error so the recovery engine can classify it. */
  onError: (event: unknown) => void;
  /**
   * Hands the parent a bounded in-place recovery hook for the active provider.
   * Called with `null` on teardown, so a recovery can never target a dead
   * player instance.
   */
  registerRecovery?: (recover: ((kind: RecoveryKind) => boolean) | null) => void;
  overlay?: React.ReactNode;
}

/**
 * The video player.
 *
 * Vidstack owns playback and the control chrome; we layer on the pieces the app
 * needs: HLS via hls.js, resume position, progress reporting and smart playback automation.
 */
export function VideoPlayer({
  execution,
  title,
  poster,
  initialTime = 0,
  skipTimes,
  autoSkip = false,
  autoSkipIntro,
  autoSkipOutro = false,
  showSkipButtons = true,
  episodeId = "current-episode",
  playbackRate,
  volume,
  muted,
  onProgress,
  onEnded,
  onError,
  registerRecovery,
  overlay,
}: VideoPlayerProps) {
  // If autoSkipIntro is not explicitly provided, fall back to autoSkip for backward-compat
  const effectiveAutoSkipIntro = autoSkipIntro !== undefined ? autoSkipIntro : autoSkip;

  const [manualButton, setManualButton] = useState<{
    label: string;
    targetTime: number;
    segmentType: "intro" | "outro";
  } | null>(null);

  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlers = useRef({ onProgress, onEnded, onError });
  const playerApi = useRef<{ seekTo: (timeSeconds: number) => void } | null>(null);
  const providerRef = useRef<MediaProviderAdapter | null>(null);

  const safeInitialTime =
    typeof initialTime === "number" && Number.isFinite(initialTime) && initialTime > 1
      ? initialTime
      : 0;

  useEffect(() => {
    handlers.current = { onProgress, onEnded, onError };
  }, [onProgress, onEnded, onError]);

  // Wire hls.js into Vidstack's HLS provider with startPosition configured.
  // Vidstack owns the HLS instance lifecycle; we only supply its config and a
  // bounded recovery hook, so there is exactly one HLS instance per source.
  const onProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      providerRef.current = provider;
      if (isHLSProvider(provider)) {
        provider.library = Hls;
        provider.config = {
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          startPosition: safeInitialTime > 1 ? safeInitialTime : -1,
          ...HLS_RECOVERY_CONFIG,
        };
      }
    },
    [safeInitialTime],
  );

  // Expose in-place recovery to the recovery engine. Bounded by the caller, not
  // here: this only reports whether a recovery was actually possible.
  useEffect(() => {
    if (!registerRecovery) return;

    registerRecovery((kind) => {
      const provider = providerRef.current;
      if (!provider) return false;

      if (isHLSProvider(provider)) {
        const instance = provider.instance;
        if (!instance) return false;

        if (kind === "media") {
          instance.recoverMediaError();
          return true;
        }

        // Reload manifests and fragments from the current position. hls.js keeps
        // its own backoff and retry budget for everything it re-requests.
        instance.startLoad();
        return true;
      }

      // Progressive video provider recovery
      const video = (provider as unknown as { video?: HTMLVideoElement }).video;
      if (video && typeof video.load === "function") {
        try {
          const currentTime = video.currentTime;
          video.load();
          if (currentTime > 0) {
            video.currentTime = currentTime;
          }
          video.play().catch(() => {});
          return true;
        } catch {
          return false;
        }
      }

      return false;
    });

    return () => {
      registerRecovery(null);
      providerRef.current = null;
    };
  }, [registerRecovery]);

  const showToast = useCallback((message: string) => {
    if (notificationTimer.current) {
      clearTimeout(notificationTimer.current);
    }
    setNotification(message);
    notificationTimer.current = setTimeout(() => {
      setNotification(null);
      notificationTimer.current = null;
    }, 2500);
  }, []);

  const handleManualSkip = () => {
    if (!manualButton) return;
    playerApi.current?.seekTo(manualButton.targetTime);
    setManualButton(null);
  };

  return (
    <div className="relative group">
      <MediaPlayer
        title={title}
        src={{ src: mediaSrc(execution), type: mediaTypeFor(execution) }}
        poster={poster ?? undefined}
        currentTime={safeInitialTime > 1 ? safeInitialTime : undefined}
        playsInline
        crossOrigin
        onProviderChange={onProviderChange}
        onError={(detail) => handlers.current.onError(detail)}
        className="aspect-video w-full overflow-hidden rounded-2xl bg-black"
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} noModal />
        <MediaEffects
          execution={execution}
          initialTime={safeInitialTime}
          skipTimes={skipTimes}
          autoSkipIntro={effectiveAutoSkipIntro}
          autoSkipOutro={autoSkipOutro}
          showSkipButtons={showSkipButtons}
          episodeId={episodeId}
          playbackRate={playbackRate}
          volume={volume}
          muted={muted}
          handlers={handlers}
          playerApiRef={playerApi}
          onManualButtonChange={setManualButton}
          onNotification={showToast}
        />
      </MediaPlayer>

      {/* Non-intrusive Toast Notification when an intro or outro is automatically skipped */}
      {notification && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-black/80 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check className="size-2.5 stroke-[3]" />
          </span>
          <span>{notification}</span>
        </div>
      )}

      {/* Manual Skip Button (Phase 4 / Phase 5) */}
      {manualButton && !overlay && (
        <SkipButton
          label={manualButton.label}
          onSkip={handleManualSkip}
        />
      )}

      {/* Next Episode Overlay (Phase 6) */}
      {overlay}
    </div>
  );
}

function MediaEffects({
  execution,
  initialTime,
  skipTimes,
  autoSkipIntro,
  autoSkipOutro,
  showSkipButtons,
  episodeId,
  playbackRate,
  volume,
  muted,
  handlers,
  playerApiRef,
  onManualButtonChange,
  onNotification,
}: {
  execution: PlaybackExecution & { kind: "media" };
  initialTime: number;
  skipTimes: SkipTimes;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  showSkipButtons: boolean;
  episodeId: string;
  playbackRate: number;
  volume: number;
  muted: boolean;
  handlers: MutableRefObject<{ onProgress: (a: number, b: number) => void; onEnded: () => void; onError: (event: unknown) => void }>;
  playerApiRef: MutableRefObject<{ seekTo: (timeSeconds: number) => void } | null>;
  onManualButtonChange: (
    btn: { label: string; targetTime: number; segmentType: "intro" | "outro" } | null,
  ) => void;
  onNotification: (message: string) => void;
}) {
  const player = useMediaPlayer();
  const remote = useMediaRemote();
  const restored = useRef(false);
  const endedRef = useRef(false);

  // Convert SkipTimes to EpisodeSegment models
  const introSegment = useMemo<EpisodeSegment | null>(() => {
    if (!skipTimes.opening) return null;
    return {
      episodeId,
      segmentType: "intro",
      startTime: skipTimes.opening.startTime,
      endTime: skipTimes.opening.endTime,
    };
  }, [episodeId, skipTimes.opening]);

  const outroSegment = useMemo<EpisodeSegment | null>(() => {
    if (!skipTimes.ending) return null;
    return {
      episodeId,
      segmentType: "outro",
      startTime: skipTimes.ending.startTime,
      endTime: skipTimes.ending.endTime,
    };
  }, [episodeId, skipTimes.ending]);

  // Instantiate Playback Automation Controller
  const automationController = useMemo(() => {
    return new PlaybackAutomationController({
      episodeId,
      segments: {
        intro: introSegment,
        outro: outroSegment,
      },
      autoSkipIntro,
      autoSkipOutro,
      showSkipButtons,
      isSupported: isAutomationSupported(execution),
    });
  }, [episodeId, introSegment, outroSegment, autoSkipIntro, autoSkipOutro, showSkipButtons, execution]);

  // Synchronize dynamic config into controller
  useEffect(() => {
    automationController.updateConfig({
      episodeId,
      segments: { intro: introSegment, outro: outroSegment },
      autoSkipIntro,
      autoSkipOutro,
      showSkipButtons,
      isSupported: isAutomationSupported(execution),
    });
  }, [automationController, episodeId, introSegment, outroSegment, autoSkipIntro, autoSkipOutro, showSkipButtons, execution]);

  // Each new stream is a fresh media element, so allow the resume seek again.
  useEffect(() => {
    restored.current = false;
    endedRef.current = false;
    automationController.reset(episodeId);
    onManualButtonChange(null);
  }, [execution?.url, episodeId, automationController, onManualButtonChange]);

  // Report progress, detect end-of-media, and evaluate smart automation rules.
  useEffect(() => {
    if (!player) return;

    return player.subscribe(({ currentTime, duration, ended, paused, seeking, waiting }) => {
      if (duration > 0) handlers.current.onProgress(currentTime, duration);

      if (ended && !endedRef.current) {
        endedRef.current = true;
        automationController.setPlaybackState("ended");
        handlers.current.onEnded();
      } else if (!ended) {
        endedRef.current = false;
      }

      if (seeking) {
        automationController.setSeeking(true);
      } else if (waiting) {
        automationController.setPlaybackState("buffering");
      } else if (paused) {
        automationController.setPlaybackState("paused");
      } else {
        automationController.setPlaybackState("playing");
      }

      // Evaluate automation decision
      const decision = automationController.evaluate(currentTime, duration);

      if (decision.type === "auto-skip") {
        player.currentTime = decision.targetTime;
        onManualButtonChange(null);
        onNotification(decision.notification);
      } else if (decision.type === "show-manual") {
        onManualButtonChange({
          label: decision.label,
          targetTime: decision.targetTime,
          segmentType: decision.segmentType,
        });
      } else if (decision.type === "hide-manual") {
        onManualButtonChange(null);
      }
    });
  }, [player, handlers, automationController, onManualButtonChange, onNotification]);

  // Restore the resume position once, as soon as the media is seekable.
  useEffect(() => {
    if (!player || restored.current || initialTime <= 1) return;
    if (execution.capabilities?.seekable === false) return;

    return player.subscribe(({ canPlay, currentTime, duration }) => {
      if (!canPlay || restored.current) return;

      // Guard against seeking past duration or into near-end positions (within 10s of duration).
      if (duration > 0 && initialTime >= Math.max(0, duration - 10)) {
        restored.current = true;
        return;
      }

      restored.current = true;
      if (Math.abs(currentTime - initialTime) > 2) {
        player.currentTime = initialTime;
      }
    });
  }, [player, initialTime, execution.capabilities?.seekable]);

  // Apply rate/volume changes from the settings UI live.
  useEffect(() => {
    if (!player) return;
    remote.changeVolume(volume);
    if (muted) remote.mute(); else remote.unmute();
    remote.changePlaybackRate(playbackRate);
  }, [player, remote, playbackRate, volume, muted]);

  // Expose seek control up to parent.
  useEffect(() => {
    if (!player) return;
    playerApiRef.current = {
      seekTo: (timeSeconds) => {
        player.currentTime = timeSeconds;
        automationController.markHandled("intro");
        automationController.markHandled("outro");
      },
    };
    return () => {
      playerApiRef.current = null;
    };
  }, [player, playerApiRef, automationController]);

  return null;
}

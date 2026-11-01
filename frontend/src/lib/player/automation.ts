/**
 * Zenkai Playback Automation Engine (Phases 1-6).
 *
 * Implements deterministic playback state tracking, segment validation,
 * automated intro/outro skipping with safeguards, and next-episode
 * countdown management.
 */

import type { PlaybackExecution } from "@/lib/api/zenkai";

export type SegmentType = "intro" | "outro" | "recap" | "preview";

export interface EpisodeSegment {
  episodeId: string;
  segmentType: SegmentType;
  startTime: number;
  endTime: number;
  source?: string;
  confidence?: number;
  verificationStatus?: "verified" | "unverified";
  lastVerifiedAt?: number;
}

export type PlaybackEngineState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "buffering"
  | "ended"
  | "error";

export type CountdownState =
  | "idle"
  | "counting"
  | "paused"
  | "completed"
  | "cancelled";

export type AutomationDecision =
  | {
      type: "auto-skip";
      segmentType: "intro" | "outro";
      targetTime: number;
      notification: string;
    }
  | {
      type: "show-manual";
      segmentType: "intro" | "outro";
      targetTime: number;
      label: string;
    }
  | {
      type: "hide-manual";
    }
  | {
      type: "none";
    };

/**
 * Validates episode segments according to Phase 2 requirements:
 * 1. startTime is non-negative and finite.
 * 2. endTime is strictly greater than startTime and finite.
 * 3. Range is realistic (minimum 5s, maximum 360s).
 * 4. Does not exceed known episode duration.
 * 5. Does not span more than 90% of the entire episode.
 */
export function validateSegment(
  segment: EpisodeSegment | null | undefined,
  totalDurationSeconds?: number | null,
): boolean {
  if (!segment) return false;
  const { startTime, endTime } = segment;

  if (
    typeof startTime !== "number" ||
    typeof endTime !== "number" ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime)
  ) {
    return false;
  }

  if (startTime < 0 || endTime <= startTime) {
    return false;
  }

  const duration = endTime - startTime;
  if (duration < 5 || duration > 360) {
    return false;
  }

  if (
    typeof totalDurationSeconds === "number" &&
    Number.isFinite(totalDurationSeconds) &&
    totalDurationSeconds > 0
  ) {
    if (startTime >= totalDurationSeconds) {
      return false;
    }
    // Allow a small 2-second tolerance for keyframe rounding at the episode boundary
    if (endTime > totalDurationSeconds + 2) {
      return false;
    }
    if (totalDurationSeconds > 120 && duration >= totalDurationSeconds * 0.9) {
      return false;
    }
  }

  return true;
}

/**
 * Checks provider capability according to Phase 3:
 * Automation is only supported for direct media execution (`kind: "media"`),
 * where seeking is supported and time update events are emitted.
 * External iframes (`kind: "embed"`) do not support automation.
 */
export function isAutomationSupported(
  execution: PlaybackExecution | null | undefined,
): boolean {
  if (!execution) return false;
  if (execution.kind !== "media") return false;
  if (execution.capabilities && execution.capabilities.seekable === false) {
    return false;
  }
  return true;
}

export interface AutomationConfig {
  episodeId: string;
  segments: {
    intro?: EpisodeSegment | null;
    outro?: EpisodeSegment | null;
  };
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  showSkipButtons: boolean;
  isSupported: boolean;
  duration?: number | null;
}

/**
 * Deterministic automation controller for intro/outro skipping.
 * Prevents loops, duplicate triggers, and re-skips when rewinding manually.
 */
export class PlaybackAutomationController {
  private config: AutomationConfig;
  private engineState: PlaybackEngineState = "idle";
  private handledSegments = new Set<string>();
  private activeManualType: "intro" | "outro" | null = null;
  private isSeeking = false;
  private lastObservedTime = 0;

  constructor(config: AutomationConfig) {
    this.config = config;
  }

  public updateConfig(partial: Partial<AutomationConfig>): void {
    if (partial.episodeId && partial.episodeId !== this.config.episodeId) {
      this.reset(partial.episodeId);
    }
    this.config = { ...this.config, ...partial };
  }

  public setPlaybackState(state: PlaybackEngineState): void {
    this.engineState = state;
    if (state === "seeking") {
      this.isSeeking = true;
    } else if (state === "playing" || state === "paused") {
      this.isSeeking = false;
    }
  }

  public setSeeking(seeking: boolean): void {
    this.isSeeking = seeking;
    if (seeking) {
      this.engineState = "seeking";
    }
  }

  public reset(newEpisodeId: string): void {
    this.handledSegments.clear();
    this.activeManualType = null;
    this.isSeeking = false;
    this.lastObservedTime = 0;
    this.engineState = "idle";
    this.config.episodeId = newEpisodeId;
  }

  public markHandled(type: "intro" | "outro"): void {
    const key = `${this.config.episodeId}:${type}`;
    this.handledSegments.add(key);
    if (this.activeManualType === type) {
      this.activeManualType = null;
    }
  }

  public isHandled(type: "intro" | "outro"): boolean {
    const key = `${this.config.episodeId}:${type}`;
    return this.handledSegments.has(key);
  }

  /**
   * Evaluates playback position on each tick and produces deterministic actions.
   */
  public evaluate(currentTime: number, duration?: number | null): AutomationDecision {
    if (!this.config.isSupported) {
      return { type: "none" };
    }

    // Never skip during buffering, loading, error, or active seeking
    if (
      this.isSeeking ||
      this.engineState === "loading" ||
      this.engineState === "buffering" ||
      this.engineState === "error"
    ) {
      return { type: "none" };
    }

    const currentDuration = duration ?? this.config.duration ?? null;
    this.lastObservedTime = currentTime;

    // 1. Evaluate Intro Segment
    const intro = this.config.segments.intro;
    if (validateSegment(intro, currentDuration) && intro!.episodeId === this.config.episodeId) {
      const inIntro = currentTime >= intro!.startTime && currentTime < intro!.endTime;
      const introHandled = this.isHandled("intro");

      if (inIntro) {
        if (this.config.autoSkipIntro && !introHandled) {
          this.markHandled("intro");
          const target = Math.min(
            intro!.endTime + 0.1,
            currentDuration && currentDuration > 0 ? currentDuration - 0.5 : intro!.endTime + 0.1,
          );
          return {
            type: "auto-skip",
            segmentType: "intro",
            targetTime: target,
            notification: "Intro skipped",
          };
        }

        // Auto-skip is off, or user rewound into an already-handled intro.
        // Show manual button if enabled.
        if (this.config.showSkipButtons) {
          this.activeManualType = "intro";
          return {
            type: "show-manual",
            segmentType: "intro",
            targetTime: intro!.endTime + 0.1,
            label: "Skip Intro",
          };
        }
      }
    }

    // 2. Evaluate Outro Segment
    const outro = this.config.segments.outro;
    if (validateSegment(outro, currentDuration) && outro!.episodeId === this.config.episodeId) {
      const inOutro = currentTime >= outro!.startTime && currentTime < outro!.endTime;
      const outroHandled = this.isHandled("outro");

      if (inOutro) {
        if (this.config.autoSkipOutro && !outroHandled) {
          this.markHandled("outro");
          const target = Math.min(
            outro!.endTime + 0.1,
            currentDuration && currentDuration > 0 ? currentDuration : outro!.endTime + 0.1,
          );
          return {
            type: "auto-skip",
            segmentType: "outro",
            targetTime: target,
            notification: "Outro skipped",
          };
        }

        if (this.config.showSkipButtons) {
          this.activeManualType = "outro";
          return {
            type: "show-manual",
            segmentType: "outro",
            targetTime: outro!.endTime + 0.1,
            label: "Skip Outro",
          };
        }
      }
    }

    // If currently showing a manual button but playhead is no longer inside any active segment
    if (this.activeManualType !== null) {
      this.activeManualType = null;
      return { type: "hide-manual" };
    }

    return { type: "none" };
  }
}

/**
 * Controller for Next-Episode countdown (Phase 6).
 * Handles pause awareness, cancellation, and manual skip triggers.
 */
export class NextEpisodeCountdownController {
  private state: CountdownState = "idle";
  private remainingSeconds: number;
  private readonly initialSeconds: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onTick?: (remaining: number) => void;
  private readonly onComplete: () => void;
  private readonly onCancel?: () => void;

  constructor(options: {
    durationSeconds: number;
    onTick?: (remaining: number) => void;
    onComplete: () => void;
    onCancel?: () => void;
  }) {
    this.initialSeconds = Math.max(1, options.durationSeconds);
    this.remainingSeconds = this.initialSeconds;
    this.onTick = options.onTick;
    this.onComplete = options.onComplete;
    this.onCancel = options.onCancel;
  }

  public getState(): CountdownState {
    return this.state;
  }

  public getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  public start(): void {
    if (this.state === "counting") return;
    this.clearTimer();
    this.state = "counting";
    this.remainingSeconds = this.initialSeconds;
    this.onTick?.(this.remainingSeconds);

    this.timer = setInterval(() => {
      if (this.state !== "counting") return;
      this.remainingSeconds -= 1;
      this.onTick?.(this.remainingSeconds);

      if (this.remainingSeconds <= 0) {
        this.clearTimer();
        this.state = "completed";
        this.onComplete();
      }
    }, 1000);
  }

  public pause(): void {
    if (this.state !== "counting") return;
    this.clearTimer();
    this.state = "paused";
  }

  public resume(): void {
    if (this.state !== "paused") return;
    this.state = "counting";
    this.timer = setInterval(() => {
      if (this.state !== "counting") return;
      this.remainingSeconds -= 1;
      this.onTick?.(this.remainingSeconds);

      if (this.remainingSeconds <= 0) {
        this.clearTimer();
        this.state = "completed";
        this.onComplete();
      }
    }, 1000);
  }

  public cancel(): void {
    this.clearTimer();
    this.state = "cancelled";
    this.onCancel?.();
  }

  public playNow(): void {
    this.clearTimer();
    this.state = "completed";
    this.onComplete();
  }

  public destroy(): void {
    this.clearTimer();
    this.state = "idle";
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

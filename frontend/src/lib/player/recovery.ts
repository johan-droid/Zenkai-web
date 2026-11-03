/**
 * Playback recovery engine (single authority for error handling and failover).
 *
 * The watch surface used to treat *every* media error as "this provider is
 * dead": one `error` event immediately advanced to the next plan. That is how a
 * two-second CDN hiccup turned into a server switch, and how a provider that
 * emitted two error events for one failure was skipped entirely.
 *
 * This module is the one place that decides:
 *
 *   1. what an error actually means (classify),
 *   2. whether the current stream can be recovered in place (retry budget),
 *   3. which alternative may be committed (validation),
 *   4. whether a state transition is legal at all (machine).
 *
 * It is deliberately pure and dependency-free so the policy is testable without
 * a browser, a player, or a provider.
 */

import type {
  PlaybackExecution,
  PlaybackLanguage,
  PlaybackPlan,
  ServerAvailabilityItem,
} from "../api/zenkai";

/* ------------------------------------------------------------------ */
/* State machine (Phase 1)                                             */
/* ------------------------------------------------------------------ */

/**
 * The only states the playback surface may be in.
 *
 * `recovering` and `switching` are distinct on purpose: recovering keeps the
 * current stream, switching replaces it. Collapsing them is what made the old
 * code show an error screen for both.
 */
export type PlaybackPhase =
  | "idle"
  | "discovering"
  | "executing"
  | "ready"
  | "playing"
  | "buffering"
  | "recovering"
  | "switching"
  | "failed"
  | "ended";

/**
 * Legal transitions. Anything absent is refused rather than coerced: a late
 * response from an old attempt must not be able to walk `failed → playing`.
 */
const TRANSITIONS: Record<PlaybackPhase, readonly PlaybackPhase[]> = {
  idle: ["discovering", "executing"],
  discovering: ["executing", "failed", "idle"],
  executing: ["ready", "failed", "idle"],
  ready: ["playing", "buffering", "recovering", "switching", "ended", "failed", "idle"],
  playing: ["ready", "buffering", "recovering", "switching", "ended", "failed", "idle"],
  buffering: ["playing", "ready", "recovering", "switching", "ended", "failed", "idle"],
  recovering: ["playing", "ready", "buffering", "switching", "ended", "failed", "idle"],
  switching: ["executing", "ready", "playing", "failed", "idle"],
  failed: ["discovering", "executing", "ready", "idle"],
  ended: ["discovering", "executing", "ready", "switching", "idle"],
};

/** Apply a transition, keeping the current phase when the move is illegal. */
export function nextPhase(from: PlaybackPhase, to: PlaybackPhase): PlaybackPhase {
  return TRANSITIONS[from]?.includes(to) ? to : from;
}

/* ------------------------------------------------------------------ */
/* Error classification (Phase 2)                                      */
/* ------------------------------------------------------------------ */

/**
 * What an error means for provider selection.
 *
 * - `transient_network` — retry the current stream first; only a failed retry
 *   may escalate.
 * - `fatal_provider` — the provider cannot serve this source; failover allowed.
 * - `non_provider` — the user (or the browser) caused it. Never failover.
 * - `unknown` — bounded retries, then treat as fatal.
 */
export type PlaybackErrorCategory =
  | "transient_network"
  | "fatal_provider"
  | "non_provider"
  | "unknown";

/** A normalised error, so policy never reads raw event objects. */
export interface NormalisedPlaybackError {
  /** Where the error came from: hls.js, the media element, or an embed. */
  origin: "hls" | "media" | "embed" | "unknown";
  /** `MediaError.code` for media-element errors; undefined for hls errors. */
  code?: number;
  /** Error detail token from hls.js (e.g. `manifestLoadError`), when present. */
  detail?: string;
  /** Short, log-safe message. Never a signed URL. */
  message: string;
}

/** hls.js details that are worth retrying on the *same* stream. */
const TRANSIENT_HLS_DETAILS = [
  "manifestload",
  "levelload",
  "fragload",
  "keyload",
  "audiotrackload",
  "subtitletrackload",
  "contentsteeringload",
  "timeout",
  "mediaerror",
  "bufferstalled",
  "bufferappendtimeout",
];

/** hls.js details that mean the media itself is unusable. */
const FATAL_HLS_DETAILS = [
  "manifestparsing",
  "levelparsing",
  "fragparsing",
  "manifestincompatiblecodecs",
  "levelincompatiblecodecs",
  "bufferincompatiblecodecs",
  "bufferaddcodec",
  "internalexception",
  "unsupported",
  "notsupported",
];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Normalise whatever the player hands us into a classification input.
 *
 * Vidstack reports an hls.js failure as `{ message, code: 1, error }` — the
 * `code` there is a placeholder, **not** a `MediaError` code, so a naive
 * `code === 1 → aborted` rule would classify every HLS failure as a user action
 * and disable failover entirely. The presence of a nested error is what tells
 * the two apart.
 */
export function normalisePlaybackError(event: unknown): NormalisedPlaybackError {
  if (event === undefined || event === null) {
    return { origin: "unknown", message: "unknown playback error" };
  }

  const record = (typeof event === "object" ? event : {}) as Record<string, unknown>;
  const detail = (record.detail ?? record) as Record<string, unknown>;

  const nested = detail.error as Record<string, unknown> | null | undefined;
  const nestedMessage = text(nested?.message);
  const nestedDetails = text(nested?.details);
  const message = text(detail.message) || nestedMessage || text(record.message);
  const hlsDetail = nestedDetails || (nestedMessage.match(/^[a-zA-Z]+Error[a-zA-Z]*/)?.[0] ?? "");

  if (nested) {
    return {
      origin: "hls",
      detail: hlsDetail || nestedMessage || undefined,
      message: message || "hls playback error",
    };
  }

  const code = typeof detail.code === "number" ? detail.code : undefined;
  if (code !== undefined) {
    return { origin: "media", code, message: message || "media element error" };
  }

  return { origin: "unknown", message: message || "unknown playback error" };
}

/**
 * Classify a normalised error.
 *
 * `inStreamRecoveryUsed` is the retry budget already spent on this source. A
 * transient error with no budget left is escalated by the caller, never here:
 * this function stays a pure mapping from evidence to category.
 */
export function classifyPlaybackError(error: NormalisedPlaybackError): PlaybackErrorCategory {
  if (error.origin === "hls") {
    const token = `${error.detail ?? ""} ${error.message}`.toLowerCase();
    if (FATAL_HLS_DETAILS.some((needle) => token.includes(needle))) return "fatal_provider";
    if (TRANSIENT_HLS_DETAILS.some((needle) => token.includes(needle))) return "transient_network";
    return "unknown";
  }

  if (error.origin === "media") {
    switch (error.code) {
      case 1:
        // MEDIA_ERR_ABORTED: the source was removed or the user navigated away.
        return "non_provider";
      case 2:
        return "transient_network";
      case 3:
      case 4:
        // Decode failure / unsupported source: this provider cannot serve it.
        return "fatal_provider";
      default:
        return "unknown";
    }
  }

  return "unknown";
}

/* ------------------------------------------------------------------ */
/* Execution validation (Phase 4)                                      */
/* ------------------------------------------------------------------ */

export type ExecutionRejection =
  | "source_mismatch"
  | "language_mismatch"
  | "kind_mismatch"
  | "invalid_url"
  | "not_playable";

export type ExecutionValidation =
  | { ok: true }
  | { ok: false; reason: ExecutionRejection };

/**
 * Verify that an execution is the one we asked for before showing it.
 *
 * The backend is the authority for resolution, but a response can still be
 * stale (an old attempt), for the wrong shelf (SUB/DUB), or structurally wrong
 * (an iframe fed to a media element). Committing it anyway is how the wrong
 * provider — or the wrong language — appeared under the active player.
 */
export function validateExecution(
  execution: PlaybackExecution,
  expected: { sourceId: string; language: PlaybackLanguage },
): ExecutionValidation {
  if (execution.sourceId !== expected.sourceId) {
    return { ok: false, reason: "source_mismatch" };
  }

  // `multi` contains both shelves; switching SUB ⇄ DUB is never silent.
  if (execution.language !== expected.language && execution.language !== "multi") {
    return { ok: false, reason: "language_mismatch" };
  }

  const isMedia = execution.kind === "media";
  if (isMedia !== (execution.mechanism === "hls" || execution.mechanism === "progressive")) {
    return { ok: false, reason: "kind_mismatch" };
  }
  if (!isMedia && execution.mechanism !== "iframe") {
    return { ok: false, reason: "kind_mismatch" };
  }

  if (execution.validated === false || execution.playable === false) {
    return { ok: false, reason: "not_playable" };
  }

  let url: URL;
  try {
    url = new URL(execution.url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_url" };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Fallback selection (Phase 3)                                        */
/* ------------------------------------------------------------------ */

export interface FallbackOptions {
  /** The source that just failed. */
  failedSourceId: string | null;
  /** Sources already failed during this recovery session. */
  failedSourceIds: ReadonlySet<string>;
  /** Providers already failed during this recovery session. */
  failedProviderSlugs: ReadonlySet<string>;
  language: PlaybackLanguage;
  /** Per-server availability, when the backend reported it. */
  servers?: ServerAvailabilityItem[] | undefined;
}

function isServableLanguage(plan: PlaybackPlan, language: PlaybackLanguage): boolean {
  if (plan.language === language) return true;
  // A dual-audio source serves either shelf; a SUB source never serves DUB.
  return plan.language === "multi";
}

function isServerSelectable(
  plan: PlaybackPlan,
  servers: ServerAvailabilityItem[] | undefined,
): boolean {
  if (!servers || servers.length === 0) return true;
  const item = servers.find(
    (server) =>
      server.sourceId === plan.sourceId ||
      server.serverId === plan.endpointSlug ||
      server.name === plan.endpointSlug,
  );
  // Absent availability is unknown, not dead: the backend already filtered.
  if (!item) return true;
  if (item.selectable === false) return false;
  return item.status !== "UNAVAILABLE" && item.status !== "ERROR";
}

/**
 * The next plan the player may commit, or null when none is safe.
 *
 * Refuses rather than guesses: a candidate that is unvalidated, unplayable,
 * for another shelf, already failed, or reported unavailable is skipped. The
 * ranked order is preserved, so the backend's ranking still decides preference.
 */
export function selectFallbackPlan(
  plans: PlaybackPlan[],
  options: FallbackOptions,
): PlaybackPlan | null {
  for (const plan of plans) {
    if (plan.sourceId === options.failedSourceId) continue;
    if (options.failedSourceIds.has(plan.sourceId)) continue;
    if (options.failedProviderSlugs.has(plan.providerSlug)) continue;
    if (!isServableLanguage(plan, options.language)) continue;
    if (plan.playable === false || plan.validated === false) continue;
    if (!isServerSelectable(plan, options.servers)) continue;
    return plan;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Recovery session (bounded retries, no loops)                        */
/* ------------------------------------------------------------------ */

export interface RecoveryPolicy {
  /** Distinct provider attempts allowed per episode + shelf, including the first. */
  maxProviderAttempts: number;
  /** In-place recoveries (hls startLoad / recoverMediaError) allowed per source. */
  maxInStreamRecoveries: number;
}

/**
 * Three attempts is the documented ceiling: more than that is not recovery,
 * it is a slideshow of dead providers.
 */
export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  maxProviderAttempts: 3,
  maxInStreamRecoveries: 1,
};

/**
 * One recovery session per episode + audio shelf.
 *
 * It remembers what already failed so a refetched, re-ranked plan list cannot
 * send the player back to a source that just died — the loop the positional
 * `plans[index + 1]` walk allowed. Every decision is bounded and recorded.
 */
export class PlaybackRecoverySession {
  readonly failedSourceIds = new Set<string>();
  readonly failedProviderSlugs = new Set<string>();
  /** Log-safe reasons, newest last. */
  readonly reasons: string[] = [];

  #providerAttempts = 0;
  #inStreamRecoveries = 0;
  #currentSourceId: string | null = null;

  constructor(private readonly policy: RecoveryPolicy = DEFAULT_RECOVERY_POLICY) {}

  /** A new source is about to be executed. */
  beginSource(sourceId: string): void {
    this.#currentSourceId = sourceId;
    this.#inStreamRecoveries = 0;
    this.#providerAttempts += 1;
  }

  /** True while the current source still has an in-place recovery left. */
  canRecoverInPlace(): boolean {
    return this.#inStreamRecoveries < this.policy.maxInStreamRecoveries;
  }

  /** Spend the in-place recovery budget for the current source. */
  noteInPlaceRecovery(): void {
    this.#inStreamRecoveries += 1;
  }

  /** True while another provider attempt is within budget. */
  canAttemptAnotherProvider(): boolean {
    return this.#providerAttempts < this.policy.maxProviderAttempts;
  }

  get providerAttempts(): number {
    return this.#providerAttempts;
  }

  /**
   * Record that a source is unusable. A source and its provider are both
   * excluded for the rest of the session: one bad manifest usually means the
   * provider, and re-trying its sibling sources burns the whole budget.
   */
  noteFailure(sourceId: string | null, providerSlug: string | null, reason: string): void {
    if (sourceId) this.failedSourceIds.add(sourceId);
    if (providerSlug) this.failedProviderSlugs.add(providerSlug);
    this.reasons.push(reason);
  }

  currentSourceId(): string | null {
    return this.#currentSourceId;
  }

  reset(): void {
    this.failedSourceIds.clear();
    this.failedProviderSlugs.clear();
    this.reasons.length = 0;
    this.#providerAttempts = 0;
    this.#inStreamRecoveries = 0;
    this.#currentSourceId = null;
  }
}

/* ------------------------------------------------------------------ */
/* Playback continuity (Phase 5)                                       */
/* ------------------------------------------------------------------ */

export interface PlaybackSnapshot {
  positionSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
}

/** Where to resume the replacement stream, or null when seeking is pointless. */
export function restoreTarget(
  snapshot: Pick<PlaybackSnapshot, "positionSeconds" | "durationSeconds">,
  replacement: { durationSeconds?: number; seekable?: boolean | null },
): number | null {
  if (replacement.seekable === false) return null;
  const position = snapshot.positionSeconds;
  if (!Number.isFinite(position) || position <= 1) return null;

  const duration =
    replacement.durationSeconds && replacement.durationSeconds > 0
      ? replacement.durationSeconds
      : snapshot.durationSeconds;

  // Never seek beyond the replacement, and never into the last 10s: that is
  // how a "restore" turns into a false episode completion.
  if (duration > 0 && position >= duration - 10) return null;
  return position;
}

/**
 * Progress reports below this tolerance of a pending resume target are the
 * replacement stream booting at 0s, not the user rewinding.
 */
export const RESUME_GUARD_TOLERANCE_S = 3;

/**
 * Provider health tracking.
 *
 * Playback providers are unreliable: they rate limit, rotate domains, and go
 * down without warning. A static priority list means a single dead provider at
 * the top blocks playback for everyone, so every resolve is scored and fed back
 * into ranking.
 *
 * State is in-memory. That is deliberate: health is a fast-moving signal where
 * a stale persisted score is worse than no score, and it resets on restart
 * rather than pinning a provider that died hours ago.
 */

import type { ProviderHealth } from "../domain/source.types.js";

/** Recent outcomes weigh more than old ones, so recovery is not slow. */
const DECAY = 0.7;

/** A provider failing this many times in a row is taken out of rotation. */
export const FAILURE_THRESHOLD = 5;

/** Providers scoring below this are deprioritized hard. */
const UNHEALTHY_CUTOFF = 0.35;

const DEFAULT_HEALTH: Omit<ProviderHealth, "providerSlug" | "endpointSlug"> = {
  successStreak: 1,
  failureStreak: 0,
  score: 1,
  avgLatencyMs: 0,
  lastCheckedAt: 0,
  lastError: null,
};

export class HealthRegistry {
  #entries = new Map<string, ProviderHealth>();

  #key(providerSlug: string, endpointSlug: string): string {
    return `${providerSlug}:${endpointSlug}`;
  }

  get(providerSlug: string, endpointSlug: string): ProviderHealth {
    return (
      this.#entries.get(this.#key(providerSlug, endpointSlug)) ?? {
        providerSlug,
        endpointSlug,
        ...DEFAULT_HEALTH,
      }
    );
  }

  /** Record a successful resolve and return the updated health. */
  recordSuccess(
    providerSlug: string,
    endpointSlug: string,
    latencyMs: number,
  ): ProviderHealth {
    const key = this.#key(providerSlug, endpointSlug);
    const previous = this.get(providerSlug, endpointSlug);

    // Smooth the latency so one slow call does not dominate.
    const avgLatencyMs =
      previous.lastCheckedAt === 0 ? latencyMs : previous.avgLatencyMs * 0.7 + latencyMs * 0.3;

    const next: ProviderHealth = {
      providerSlug,
      endpointSlug,
      successStreak: previous.successStreak + 1,
      failureStreak: 0,
      score: previous.score * DECAY + (1 - DECAY),
      avgLatencyMs,
      lastCheckedAt: Date.now(),
      lastError: null,
    };

    this.#entries.set(key, next);
    return next;
  }

  recordFailure(
    providerSlug: string,
    endpointSlug: string,
    message: string,
  ): ProviderHealth {
    const key = this.#key(providerSlug, endpointSlug);
    const previous = this.get(providerSlug, endpointSlug);

    const next: ProviderHealth = {
      providerSlug,
      endpointSlug,
      successStreak: 0,
      failureStreak: previous.failureStreak + 1,
      score: previous.score * DECAY,
      avgLatencyMs: previous.avgLatencyMs,
      lastCheckedAt: Date.now(),
      lastError: message,
    };

    this.#entries.set(key, next);
    return next;
  }

  /** True once a provider has failed too many times to be worth trying. */
  isQuarantined(providerSlug: string, endpointSlug: string): boolean {
    const health = this.get(providerSlug, endpointSlug);
    return health.failureStreak >= FAILURE_THRESHOLD;
  }

  /** Snapshot for the health endpoint. */
  snapshot(): ProviderHealth[] {
    return [...this.#entries.values()].sort((a, b) => b.score - a.score);
  }

  /** Drop quarantined entries so a recovered provider is retried. */
  resetQuarantined(): number {
    let cleared = 0;
    for (const [key, health] of this.#entries) {
      if (health.failureStreak >= FAILURE_THRESHOLD) {
        this.#entries.delete(key);
        cleared++;
      }
    }
    return cleared;
  }
}

export const healthRegistry = new HealthRegistry();

export { UNHEALTHY_CUTOFF };

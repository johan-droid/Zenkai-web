/**
 * Provider health tracking (P7).
 *
 * Playback providers are unreliable: they rate limit, rotate domains and go down
 * without warning. A static priority list means one dead provider at the top
 * blocks playback for everyone, so every resolve is scored and fed back into
 * ranking.
 *
 * The important subtlety is that "no stream for this episode" is not an outage.
 * A provider that answers correctly with an empty list is healthy; only a
 * transport failure should count against it. Mixing the two quarantines good
 * providers simply because a particular episode has not been released.
 */

export interface ProviderHealth {
  providerSlug: string;
  successStreak: number;
  failureStreak: number;
  /** Exponentially weighted success rate, 0-1. */
  score: number;
  avgLatencyMs: number;
  lastCheckedAt: number;
  lastError: string | null;
}

/** Recent outcomes weigh more than old ones, so recovery is not slow. */
const DECAY = 0.7;

/** Consecutive transport failures before a provider leaves rotation. */
export const FAILURE_THRESHOLD = 5;

/**
 * How long quarantine lasts before the provider is retried (half-open).
 *
 * Quarantine used to be permanent until an operator reset it, which meant one
 * bad afternoon permanently removed a working provider from every future
 * ranking — and fewer providers is exactly how a player ends up with no
 * alternative to fall back to. The failure streak is kept, so a provider that
 * is still dead is re-quarantined on its next failure, while a recovered one
 * gets traffic again without human intervention.
 */
export const QUARANTINE_COOLDOWN_MS = 60_000;

/** Below this score a provider is deprioritised hard rather than dropped. */
export const UNHEALTHY_CUTOFF = 0.35;

const DEFAULT_HEALTH: Omit<ProviderHealth, "providerSlug"> = {
  successStreak: 1,
  failureStreak: 0,
  score: 1,
  avgLatencyMs: 0,
  lastCheckedAt: 0,
  lastError: null,
};

/**
 * Health is tracked per *provider*, not per (provider, endpoint) pair.
 *
 * A `StreamingProvider` instance serves exactly one endpoint, so an endpoint key
 * added nothing but a way for a reader and a writer to disagree: the resolver
 * recorded under `(slug, slug)` while ranking read under
 * `(slug, endpointSlug)`, which for a template endpoint is `"sub"` rather than
 * the provider slug. That silently split one provider's health across two keys,
 * so a quarantined provider still ranked and still played.
 *
 * Keying on the provider alone makes the two sides agree by construction. Use
 * `endpointSlug` from the source for display and diagnostics, not for identity.
 */
export class HealthRegistry {
  #entries = new Map<string, ProviderHealth>();

  #key(providerSlug: string): string {
    return providerSlug;
  }

  get(providerSlug: string): ProviderHealth {
    return (
      this.#entries.get(this.#key(providerSlug)) ?? {
        providerSlug,
        ...DEFAULT_HEALTH,
      }
    );
  }

  /**
   * Record a completed resolve.
   *
   * `count` distinguishes the three cases above; only `outcome === 'error'` and
   * `outcome === 'timeout'` extend the failure streak.
   */
  record(
    providerSlug: string,
    outcome: "ok" | "empty" | "error" | "timeout",
    latencyMs: number,
    error?: string,
  ): ProviderHealth {
    const previous = this.get(providerSlug);
    const failed = outcome === "error" || outcome === "timeout";

    // Smooth latency so one slow call does not dominate the average.
    const avgLatencyMs =
      previous.lastCheckedAt === 0
        ? latencyMs
        : previous.avgLatencyMs * 0.7 + latencyMs * 0.3;

    const next: ProviderHealth = failed
      ? {
          providerSlug,
          successStreak: 0,
          failureStreak: previous.failureStreak + 1,
          score: previous.score * DECAY,
          avgLatencyMs: previous.avgLatencyMs,
          lastCheckedAt: Date.now(),
          lastError: error ?? "unknown error",
        }
      : {
          providerSlug,
          successStreak: previous.successStreak + 1,
          failureStreak: 0,
          score: previous.score * DECAY + (1 - DECAY),
          avgLatencyMs,
          lastCheckedAt: Date.now(),
          lastError: null,
        };

    this.#entries.set(this.#key(providerSlug), next);
    return next;
  }

  recordSuccess(providerSlug: string, latencyMs: number): ProviderHealth {
    return this.record(providerSlug, "ok", latencyMs);
  }

  recordFailure(providerSlug: string, message: string): ProviderHealth {
    return this.record(providerSlug, "error", 0, message);
  }

  /**
   * True while a provider has failed too many times to be worth trying.
   *
   * Half-open: once the cooldown has elapsed the provider is eligible again for
   * one probe. Health is never trusted forever, in either direction.
   */
  isQuarantined(providerSlug: string): boolean {
    const health = this.get(providerSlug);
    if (health.failureStreak < FAILURE_THRESHOLD) return false;
    return Date.now() - health.lastCheckedAt < QUARANTINE_COOLDOWN_MS;
  }

  /** Sorted best-first, for the observability endpoint. */
  snapshot(): ProviderHealth[] {
    return [...this.#entries.values()].sort((a, b) => b.score - a.score);
  }

  /**
   * Clear quarantined entries immediately.
   *
   * The cooldown already re-admits providers on its own; this is the manual
   * operator override for "retry now" after an upstream fix is confirmed.
   */
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
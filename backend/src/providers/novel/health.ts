/**
 * Novel provider health tracking.
 *
 * Mirrors the streaming HealthRegistry but keyed per novel provider slug.
 * Records outcomes from search, detail, chapter feed and content resolution.
 */

export interface NovelProviderHealth {
  providerSlug: string;
  successStreak: number;
  failureStreak: number;
  /** Exponentially weighted success rate, 0-1. */
  score: number;
  avgLatencyMs: number;
  lastCheckedAt: number;
  lastError: string | null;
}

const DECAY = 0.7;
export const FAILURE_THRESHOLD = 5;
export const UNHEALTHY_CUTOFF = 0.35;

const DEFAULT_HEALTH: Omit<NovelProviderHealth, "providerSlug"> = {
  successStreak: 1,
  failureStreak: 0,
  score: 1,
  avgLatencyMs: 0,
  lastCheckedAt: 0,
  lastError: null,
};

export class NovelHealthRegistry {
  #entries = new Map<string, NovelProviderHealth>();

  get(providerSlug: string): NovelProviderHealth {
    return (
      this.#entries.get(providerSlug) ?? {
        providerSlug,
        ...DEFAULT_HEALTH,
      }
    );
  }

  record(
    providerSlug: string,
    outcome: "ok" | "empty" | "error" | "timeout",
    latencyMs: number,
    error?: string,
  ): NovelProviderHealth {
    const previous = this.get(providerSlug);
    const failed = outcome === "error" || outcome === "timeout";

    const avgLatencyMs =
      previous.lastCheckedAt === 0
        ? latencyMs
        : previous.avgLatencyMs * 0.7 + latencyMs * 0.3;

    const next: NovelProviderHealth = failed
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

    this.#entries.set(providerSlug, next);
    return next;
  }

  recordSuccess(providerSlug: string, latencyMs: number): NovelProviderHealth {
    return this.record(providerSlug, "ok", latencyMs);
  }

  recordFailure(providerSlug: string, message: string): NovelProviderHealth {
    return this.record(providerSlug, "error", 0, message);
  }

  isQuarantined(providerSlug: string): boolean {
    return this.get(providerSlug).failureStreak >= FAILURE_THRESHOLD;
  }

  snapshot(): NovelProviderHealth[] {
    return [...this.#entries.values()].sort((a, b) => b.score - a.score);
  }

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

export const novelHealthRegistry = new NovelHealthRegistry();
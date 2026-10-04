/**
 * Source layer orchestration.
 *
 * Runs every registered adapter for an episode in parallel, records the outcome
 * against each provider's health, then hands the survivors to ranking.
 *
 * Adapters run concurrently because they are independent network calls and are
 * usually the slowest part of the request. Failures are contained per adapter:
 * one dead provider must not fail the request when another can serve it.
 */

import type {
  AdapterContext,
  PlaybackSource,
  RankedSource,
  SourceAdapter,
} from "../domain/source.types.js";
import { healthRegistry } from "./health.js";
import { filterByLanguage, rankSources } from "./ranking.js";

export interface ResolveOutcome {
  sources: RankedSource[];
  /** Adapters that ran, with their outcome, for the health/debug endpoints. */
  attempts: {
    providerSlug: string;
    ok: boolean;
    count: number;
    latencyMs: number;
    error?: string;
  }[];
  resolutionTimeMs: number;
}

/**
 * Resolve sources for one episode.
 *
 * `maxConcurrency` bounds how many providers are probed at once; some providers
 * rate limit aggressively and probing twenty simultaneously gets all of them
 * throttled.
 */
export async function resolveWithAdapters(
  adapters: SourceAdapter[],
  context: AdapterContext,
  options: { maxConcurrency?: number } = {},
): Promise<ResolveOutcome> {
  const started = Date.now();
  const maxConcurrency = options.maxConcurrency ?? 6;

  // Quarantined providers are skipped entirely rather than tried and failing.
  const eligible = adapters.filter(
    (adapter) => !healthRegistry.isQuarantined(adapter.slug, "default"),
  );

  const collected: PlaybackSource[] = [];
  const attempts: ResolveOutcome["attempts"] = [];

  let cursor = 0;
  const workerCount = Math.min(maxConcurrency, eligible.length);

  async function worker(): Promise<void> {
    while (cursor < eligible.length) {
      const adapter = eligible[cursor++]!;
      const adapterStarted = Date.now();

      try {
        const sources = await adapter.resolve(context);
        const latencyMs = Date.now() - adapterStarted;

        if (sources.length > 0) {
          healthRegistry.recordSuccess(adapter.slug, "default", latencyMs);
        } else {
          // An empty result means the provider answered but has no stream for
          // this episode. That is a miss, not an outage, so it does not count
          // against the provider's failure streak.
          healthRegistry.recordSuccess(adapter.slug, "default", latencyMs);
        }

        collected.push(...sources);
        attempts.push({ providerSlug: adapter.slug, ok: true, count: sources.length, latencyMs });
      } catch (error) {
        const latencyMs = Date.now() - adapterStarted;
        const message = error instanceof Error ? error.message : String(error);

        healthRegistry.recordFailure(adapter.slug, "default", message);
        attempts.push({
          providerSlug: adapter.slug,
          ok: false,
          count: 0,
          latencyMs,
          error: message,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const ranked = rankSources(filterByLanguage(collected, context.language));

  return {
    sources: ranked,
    attempts: attempts.sort((a, b) => b.latencyMs - a.latencyMs),
    resolutionTimeMs: Date.now() - started,
  };
}

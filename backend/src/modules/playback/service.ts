/**
 * Playback resolver (P8).
 *
 * The single place that turns "episode 5 of X" into a ranked list of playable
 * sources. Three properties make this the load-bearing component of the service:
 *
 *  1. **Provider independence.** All providers run concurrently and every
 *     failure is contained, so one dead upstream cannot fail the request.
 *  2. **Honest failure.** `empty`, `error` and `timeout` are reported
 *     separately: "no streams exist" and "the provider is down" are different
 *     answers, and the response says which happened.
 *  3. **Validation before ranking.** Sources are probed before being offered, so
 *     a dead link cannot become the top choice and send the player into a black
 *     box.
 */

import { cache } from "../../cache/index.js";
import { probeUrl } from "../../http/client.js";
import { AppError, errorMessage } from "../../http/errors.js";
import { healthRegistry } from "../../providers/streaming/health.js";
import { playbackGateway } from "../../providers/streaming/gateway.js";
import {
  dedupeSources,
  filterByLanguage,
  rankSources,
} from "../../providers/streaming/ranking.js";
import { eligibleProviders } from "../../providers/streaming/registry.js";
import type {
  AudioTrack,
  PlaybackSource,
  ProviderAttempt,
  RankedSource,
  ResolveRequest,
  StreamingProvider,
} from "../../providers/streaming/types.js";

export interface ResolveResult {
  sources: RankedSource[];
  attempts: ProviderAttempt[];
  resolutionTimeMs: number;
  /**
   * Why the list is empty. This is the distinction P7 insists on: `no_streams`
   * means every provider answered and had nothing, while `all_failed` means the
   * episode may well be playable but nobody reachable could say so.
   */
  emptyReason?: "no_streams" | "all_failed" | "quarantined";
}

/** Stream URLs are signed and short-lived, bounding how long one is reused. */
const SOURCE_CACHE_TTL_S = 600;

/** Only the best few candidates are probed; see `#validate`. */
const MAX_VALIDATED_SOURCES = 6;

/**
 * Hard ceiling on a single provider's resolve, enforced by the resolver.
 *
 * This is not redundant with `fetchJson`'s timeout. Adapters that use the
 * shared HTTP client are covered there, but an adapter embedding a third-party
 * library (an in-process scraper, for instance) brings its own socket handling
 * and will happily hang for as long as the TCP stack allows. Without a deadline
 * imposed from the outside, one such provider stalls the entire request, which
 * defeats the point of running providers concurrently.
 */
const PROVIDER_DEADLINE_MS = 12_000;

/**
 * Race a promise against a deadline.
 *
 * The underlying work is not cancellable, so it is abandoned rather than
 * stopped. Its rejection is swallowed so it cannot surface later as an
 * unhandled rejection.
 */
function withDeadline<T>(work: Promise<T>, deadlineMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("provider_timeout", `${label} exceeded ${deadlineMs}ms`, 504));
    }, deadlineMs);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export class PlaybackResolver {
  constructor(private readonly providers: StreamingProvider[]) {}

/** Resolve sources for one episode, served from cache when warm. */
  async resolve(
    request: Omit<ResolveRequest, "language"> & { language?: AudioTrack },
  ): Promise<ResolveResult> {
    const language = request.language ?? "sub";
    const full: ResolveRequest = { ...request, language };
    const started = Date.now();

    const key = `sources:${request.anilistId}:${request.episodeNumber}:${language}`;
    const cached = await cache.get<ResolveResult>(key);
    if (cached) return cached;

    const outcome = await this.#resolveUncached(full);
    const result: ResolveResult = { ...outcome, resolutionTimeMs: Date.now() - started };

    // A failed resolution is deliberately not cached: a provider may recover in
    // seconds, and caching the failure would keep serving "nothing here" long
    // after it healed.
    if (result.sources.length > 0) {
      await cache.set(key, result, SOURCE_CACHE_TTL_S).catch(() => undefined);
    }

    return result;
  }

  /**
   * Fan out to every eligible provider concurrently.
   *
   * Concurrency is bounded because some providers rate limit aggressively, and
   * probing twenty at once gets every one of them throttled.
   */
  async #resolveUncached(request: ResolveRequest): Promise<ResolveResult> {
    const candidates = eligibleProviders(this.providers, {
      language: request.language,
      needsMalId: false,
    });

    if (candidates.length === 0) {
      return {
        sources: [],
        attempts: [],
        resolutionTimeMs: 0,
        emptyReason: "quarantined",
      };
    }

    const attempts: ProviderAttempt[] = [];
    const collected: PlaybackSource[] = [];
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < candidates.length) {
        const provider = candidates[cursor++]!;
        const providerStarted = Date.now();

        try {
          // The deadline is applied here rather than trusted to the adapter,
          // because an adapter using its own HTTP stack cannot be relied on to
          // time out on its own.
          const sources = await withDeadline(
            provider.resolve(request),
            PROVIDER_DEADLINE_MS,
            provider.slug,
          );
          const latencyMs = Date.now() - providerStarted;

          // A provider answering with an empty list is healthy but has nothing
          // for this episode. Only a thrown error extends the failure streak,
          // which is what stops a good provider being quarantined over one
          // missing episode.
          const outcome = sources.length > 0 ? "ok" : "empty";
          healthRegistry.record(provider.slug, outcome, latencyMs);

          collected.push(...sources);
          attempts.push({ providerSlug: provider.slug, outcome, count: sources.length, latencyMs });
        } catch (error) {
          const latencyMs = Date.now() - providerStarted;
          const message = errorMessage(error);
          const outcome =
            error instanceof AppError && error.reason === "provider_timeout"
              ? "timeout"
              : "error";

          healthRegistry.record(provider.slug, outcome, latencyMs, message);
          attempts.push({
            providerSlug: provider.slug,
            outcome,
            count: 0,
            latencyMs,
            error: message,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(6, candidates.length) }, () => worker()),
    );

    const valid = collected.filter((source) => this.#isValidSourceUrl(source.playbackUrl));
    const byLanguage = filterByLanguage(valid, request.language);
    const ranked = rankSources(byLanguage);

    if (ranked.length === 0) {
      const everyoneFailed = attempts.every(
        (attempt) => attempt.outcome === "error" || attempt.outcome === "timeout",
      );

      return {
        sources: [],
        attempts,
        resolutionTimeMs: 0,
        emptyReason: everyoneFailed ? "all_failed" : "no_streams",
      };
    }

    return {
      sources: dedupeSources(await this.#validate(ranked.slice(0, MAX_VALIDATED_SOURCES))),
      attempts,
      resolutionTimeMs: 0,
    };
  }

/**
   * Probe the best candidates and mark the dead ones.
   *
   * Only the top slice is probed: validation costs a request each, and a source
   * ranked sixth is not going to be chosen over five working ones. Probing all of
   * them would make the common case slower for no benefit.
   *
   * If every candidate fails to validate the originals are returned anyway:
   * a possibly-dead source is still more useful to a player than an empty list,
   * and the `validated` flag tells the client which is which.
   */
  async #validate(candidates: RankedSource[]): Promise<RankedSource[]> {
    const results = await Promise.all(
      candidates.map(async (source) => {
        try {
          const decision = await playbackGateway.plan(source);
          if (!decision.direct) return { ...source, validated: true };

          const probe = await probeUrl(source.playbackUrl, {
            headers: source.referer ? { referer: source.referer } : {},
          });

          // 206 is the expected answer for a media probe; a bare 200 on a large
          // file is accepted too, since several CDNs ignore Range.
          if (!probe.ok && probe.status !== 206) {
            return { ...source, validated: false };
          }

          return { ...source, validated: true };
        } catch {
          return { ...source, validated: false };
        }
      }),
    );

    const alive = results.filter((source) => source.validated !== false);
    return alive.length > 0 ? alive : results;
  }

  /**
   * Validate a source URL before it enters ranking.
   *
   * A source with a malformed URL or non-http protocol can never play, so it is
   * dropped here rather than after ranking — there is no point probing a URL
   * that is structurally invalid.
   */
  #isValidSourceUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (!parsed.hostname) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** Current health, for the observability endpoint. */
  health() {
    return this.providers.map((provider) => ({
      slug: provider.slug,
      name: provider.name,
      kind: provider.kind,
      basePriority: provider.basePriority,
      capabilities: provider.capabilities,
      health: healthRegistry.get(provider.slug),
    }));
  }

  /** Probe every provider once; used by the background health job (P18). */
  async checkAll(): Promise<Array<{ slug: string; ok: boolean }>> {
    return Promise.all(
      this.providers.map(async (provider) => {
        const started = Date.now();

        try {
          const ok = await provider.healthCheck();
          healthRegistry.record(
            provider.slug,
            ok ? "ok" : "error",
            Date.now() - started,
            ok ? undefined : "health check failed",
          );
          return { slug: provider.slug, ok };
        } catch (error) {
          healthRegistry.record(
            provider.slug,
            "error",
            Date.now() - started,
            errorMessage(error),
          );
          return { slug: provider.slug, ok: false };
        }
      }),
    );
  }
}

export { SOURCE_CACHE_TTL_S };
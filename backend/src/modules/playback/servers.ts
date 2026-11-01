/**
 * Server Availability & Dynamic Health Monitoring Service.
 *
 * Dynamically determines, validates, and normalizes playback server availability
 * for an episode. Evaluates provider health, validates actual media/embed targets,
 * enforces honest status reporting (AVAILABLE, UNAVAILABLE, DEGRADED, ERROR),
 * and provides dual-TTL in-memory caching with singleflight concurrency protection.
 */

import { playbackGateway } from "../../providers/streaming/gateway.js";
import { healthRegistry } from "../../providers/streaming/health.js";
import type { AudioTrack, PlaybackPlan, StreamingProvider } from "../../providers/streaming/types.js";
import { AppError } from "../../http/errors.js";
import type { PlaybackResolver } from "./service.js";

export type ServerStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "CHECKING"
  | "DEGRADED"
  | "UNKNOWN"
  | "ERROR";

export interface ServerAvailabilityItem {
  /** Identifier matching providerSlug or endpointSlug */
  serverId: string;
  /** Corresponding PlaybackPlan sourceId when source is available */
  sourceId: string;
  /** Human-readable server name (e.g. "Novus HD-2", "ReCloud HD") */
  serverName: string;
  /** Formatted display name for UI */
  displayName: string;
  /** Dynamic normalized availability status */
  status: ServerStatus;
  /** Human-readable status explanation */
  statusMessage: string;
  /** Video quality when known (e.g. "1080p", "720p", "Auto") */
  quality?: string;
  /** Stream delivery type */
  type: "hls" | "embed" | "mp4";
  /** Whether user can click to select and play this server */
  selectable: boolean;
  /** Subtitle audio track supported */
  sub: boolean;
  /** Dubbed audio track supported */
  dub: boolean;
  /** ISO timestamp of when availability was verified */
  lastCheckedAt: string;
  /** Diagnostic reason category */
  diagnosticCategory?: string;
  /** Optional error message */
  errorMessage?: string;
  /** Backward-compatible alias for serverName */
  name: string;
  /** Backward-compatible alias for displayName */
  label: string;
}

export interface EpisodeServersReport {
  episodeId: string;
  episodeNumber: number;
  language: AudioTrack;
  servers: ServerAvailabilityItem[];
  availableCount: number;
  totalCount: number;
  checkedAt: string;
  cached: boolean;
}

interface CacheEntry {
  report: EpisodeServersReport;
  at: number;
  ttlMs: number;
}

export class ServerAvailabilityService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<EpisodeServersReport>>();

  constructor(
    private readonly resolver: PlaybackResolver,
    private readonly providers: StreamingProvider[],
  ) {}

  /**
   * Determine dynamic server availability for a given episode and language.
   * Leverages short-lived caching and singleflight deduplication to prevent provider hammering.
   */
  async getAvailability(
    episodeId: string,
    options: { language?: AudioTrack; refresh?: boolean } = {},
  ): Promise<EpisodeServersReport> {
    const language = options.language ?? "sub";
    const cacheKey = `${episodeId}:${language}`;

    // Return cached entry if warm and not explicitly refreshing
    if (!options.refresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.at < cached.ttlMs) {
        return {
          ...cached.report,
          cached: true,
        };
      }
    } else {
      this.cache.delete(cacheKey);
    }

    // Singleflight: deduplicate concurrent checks for the same episode + language
    const existingPromise = this.inFlight.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const checkPromise = (async () => {
      try {
        const report = await this.#computeAvailability(episodeId, language, options.refresh);

        // Success TTL = 90s, failure/degraded TTL = 20s (so recovery is noticed quickly)
        const ttlMs = report.availableCount > 0 ? 90_000 : 20_000;
        this.cache.set(cacheKey, {
          report,
          at: Date.now(),
          ttlMs,
        });

        return report;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, checkPromise);
    return checkPromise;
  }

  /**
   * Build a rich availability report directly from an already-resolved episode result.
   * Useful when GET /sources already ran resolution and wants to avoid repeating work.
   */
  buildReportFromResolved(
    resolved: { result: any; episode: Record<string, any> },
    language: AudioTrack,
    cached = false,
  ): EpisodeServersReport {
    const { result, episode } = resolved;
    const nowIso = new Date().toISOString();

    const plans = playbackGateway.planAll(result.sources ?? []).plans;
    const servers: ServerAvailabilityItem[] = [];

    // Map plans into server entries
    for (const plan of plans) {
      const item = this.#planToServerItem(plan, nowIso);
      servers.push(item);
    }

    // Identify providers that failed or timed out during the resolve attempts
    for (const attempt of result.attempts ?? []) {
      const existing = servers.find((s) => s.serverId === attempt.providerSlug);
      if (!existing && (attempt.outcome === "error" || attempt.outcome === "timeout")) {
        const isTimeout = attempt.outcome === "timeout";
        const providerName = this.#lookupProviderName(attempt.providerSlug);
        servers.push({
          serverId: attempt.providerSlug,
          sourceId: `${attempt.providerSlug}:failed`,
          serverName: providerName,
          displayName: providerName,
          status: isTimeout ? "UNAVAILABLE" : "ERROR",
          statusMessage: isTimeout
            ? "Temporarily unavailable (provider timed out)"
            : "Server error",
          type: "hls",
          selectable: false,
          sub: language === "sub" || language === "multi",
          dub: language === "dub" || language === "multi",
          lastCheckedAt: nowIso,
          diagnosticCategory: isTimeout ? "provider_timeout" : "provider_error",
          errorMessage: attempt.error ?? "Failed to connect to streaming provider",
          name: attempt.providerSlug,
          label: providerName,
        });
      }
    }

    // Identify quarantined providers
    for (const skipped of result.skipped ?? []) {
      if (skipped.reason === "quarantined") {
        const existing = servers.find((s) => s.serverId === skipped.providerSlug);
        if (!existing) {
          const providerName = this.#lookupProviderName(skipped.providerSlug);
          servers.push({
            serverId: skipped.providerSlug,
            sourceId: `${skipped.providerSlug}:quarantined`,
            serverName: providerName,
            displayName: providerName,
            status: "DEGRADED",
            statusMessage: "Server temporarily degraded due to upstream instability",
            type: "hls",
            selectable: false,
            sub: language === "sub" || language === "multi",
            dub: language === "dub" || language === "multi",
            lastCheckedAt: nowIso,
            diagnosticCategory: "quarantined",
            errorMessage: skipped.detail ?? "Provider is temporarily quarantined",
            name: skipped.providerSlug,
            label: providerName,
          });
        }
      }
    }

    // Sort servers: AVAILABLE first, then DEGRADED, then UNAVAILABLE, then ERROR
    const statusOrder: Record<ServerStatus, number> = {
      AVAILABLE: 0,
      DEGRADED: 1,
      CHECKING: 2,
      UNKNOWN: 3,
      UNAVAILABLE: 4,
      ERROR: 5,
    };

    servers.sort((a, b) => {
      const orderDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (orderDiff !== 0) return orderDiff;
      return a.displayName.localeCompare(b.displayName);
    });

    const availableCount = servers.filter((s) => s.status === "AVAILABLE").length;

    return {
      episodeId: String(episode.id ?? ""),
      episodeNumber: Number(episode.episodeNumber ?? 1),
      language,
      servers,
      availableCount,
      totalCount: servers.length,
      checkedAt: nowIso,
      cached,
    };
  }

  /**
   * Execute actual resolution and health checks across servers.
   */
  async #computeAvailability(
    episodeId: string,
    language: AudioTrack,
    refresh = false,
  ): Promise<EpisodeServersReport> {
    const resolved = await this.resolver.resolveEpisode(episodeId, { language, refresh });
    if (!resolved) {
      throw AppError.notFound(`episode ${episodeId} not found`);
    }

    return this.buildReportFromResolved(resolved, language, false);
  }

  #planToServerItem(plan: PlaybackPlan, timestamp: string): ServerAvailabilityItem {
    const isQuarantined = healthRegistry.isQuarantined(plan.providerSlug);
    let status: ServerStatus = "AVAILABLE";
    let statusMessage = "Available";
    let diagnosticCategory = "verified_media";
    let errorMessage: string | undefined;

    if (isQuarantined) {
      status = "DEGRADED";
      statusMessage = "Server degraded (temporary upstream stability issues)";
      diagnosticCategory = "quarantined";
    } else if (plan.validated === false) {
      status = "UNAVAILABLE";
      statusMessage = "Temporarily unavailable (stream unreachable)";
      diagnosticCategory = "probe_failed";
      errorMessage = "Stream probe failed or upstream CDN rejected access";
    } else if (plan.access === "embed") {
      status = "AVAILABLE";
      statusMessage = "Available · Ready to play";
      diagnosticCategory = "reachable_embed";
    } else {
      status = "AVAILABLE";
      statusMessage = "Available · High Quality";
      diagnosticCategory = "verified_media";
    }

    const qualityLabel = plan.quality ?? (plan.resolution ? `${plan.resolution}p` : undefined);
    const typeLabel: "hls" | "embed" | "mp4" =
      plan.access === "embed" ? "embed" : plan.access === "mp4" ? "mp4" : "hls";

    const displayName = plan.providerName || plan.providerSlug;

    return {
      serverId: plan.providerSlug,
      sourceId: plan.sourceId,
      serverName: displayName,
      displayName,
      status,
      statusMessage,
      quality: qualityLabel,
      type: typeLabel,
      selectable: status === "AVAILABLE" || status === "DEGRADED",
      sub: plan.language === "sub" || plan.language === "multi",
      dub: plan.language === "dub" || plan.language === "multi",
      lastCheckedAt: timestamp,
      diagnosticCategory,
      errorMessage,
      name: plan.endpointSlug || plan.providerSlug,
      label: displayName,
    };
  }

  #lookupProviderName(slug: string): string {
    const found = this.providers.find((p) => p.slug === slug);
    return found ? found.name : slug;
  }

  /**
   * Clear cache for testing or runtime resets.
   */
  clearCache(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

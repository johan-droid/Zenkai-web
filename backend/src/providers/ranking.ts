/**
 * Playback source ranking.
 *
 * Takes every candidate a provider offered and orders them so the one most
 * likely to play is first. Ranking is per-source rather than per-provider,
 * because a single provider often offers both a direct HLS stream and a
 * heavier embed.
 */

import type { PlaybackSource } from "../domain/source.types.js";
import { healthRegistry, UNHEALTHY_CUTOFF } from "./health.js";

/**
 * Per-access-type base score, before health and quality.
 *
 * A direct stream is preferred over an embed: embeds cannot be inspected for
 * quality, often refuse to play without a matching Referer, and break silently
 * when the host changes.
 */
const ACCESS_BASE: Record<string, number> = {
  hls: 1,
  mp4: 0.95,
  direct: 0.9,
  embed: 0.55,
};

/** Weights sum to 1 so the final score stays in a predictable 0-1 range. */
const WEIGHT_ACCESS = 0.35;
const WEIGHT_HEALTH = 0.4;
const WEIGHT_RESOLUTION = 0.2;
const WEIGHT_LATENCY = 0.05;

/** Quality tiers, scored out of 1. Unknown quality is treated as mid. */
const RESOLUTION_SCORE: Record<number, number> = {
  2160: 1,
  1440: 0.9,
  1080: 0.8,
  720: 0.6,
  480: 0.4,
  360: 0.2,
};

/** Anything slower than this scores zero; the cap stops fast nets dominating. */
const LATENCY_CEILING_MS = 3_000;

export interface RankedSource extends PlaybackSource {
  /** Final 0-1 ranking score. */
  rank: number;
}

export function scoreSource(source: PlaybackSource): number {
  const access = ACCESS_BASE[source.accessType] ?? 0.5;
  const health = healthRegistry.get(source.providerSlug, source.endpointSlug).score;

  const resolution = source.resolution
    ? (RESOLUTION_SCORE[source.resolution] ?? 0.5)
    : 0.5;

  const { avgLatencyMs, lastCheckedAt } = healthRegistry.get(
    source.providerSlug,
    source.endpointSlug,
  );

  // Latency is only meaningful once a provider has actually answered.
  const latency =
    lastCheckedAt === 0
      ? 0.5
      : Math.max(0, 1 - Math.min(avgLatencyMs, LATENCY_CEILING_MS) / LATENCY_CEILING_MS);

  // A provider that is failing outright should sink to the bottom regardless
  // of how good its streams normally are.
  const healthTerm = health < UNHEALTHY_CUTOFF ? health * 0.2 : health;

  return (
    access * WEIGHT_ACCESS +
    healthTerm * WEIGHT_HEALTH +
    resolution * WEIGHT_RESOLUTION +
    latency * WEIGHT_LATENCY
  );
}

/** Order sources best-first. Ties fall back to the configured priority. */
export function rankSources(sources: PlaybackSource[]): RankedSource[] {
  return sources
    .filter((source) => !healthRegistry.isQuarantined(source.providerSlug, source.endpointSlug))
    .map((source) => ({ ...source, rank: Number(scoreSource(source).toFixed(4)) }))
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return a.priority - b.priority;
    });
}

/** Filter to the languages the user asked for, keeping `multi` always. */
export function filterByLanguage(
  sources: PlaybackSource[],
  language?: string,
): PlaybackSource[] {
  if (!language) return sources;
  return sources.filter(
    (source) => source.language === language || source.language === "multi",
  );
}

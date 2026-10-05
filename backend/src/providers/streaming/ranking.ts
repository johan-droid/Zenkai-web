/**
 * Source ranking (P7/P8).
 *
 * Orders candidates so the one most likely to actually play is first. Ranking is
 * per-source rather than per-provider, because a single provider commonly
 * offers both a direct HLS manifest and a heavy embed, and the user should not
 * have to pick.
 */

import { healthRegistry, UNHEALTHY_CUTOFF } from "./health.js";
import type { PlaybackSource, RankedSource } from "./types.js";

/**
 * Per-access-type base score, before health and quality.
 *
 * A direct manifest is preferred over an embed: embeds cannot be inspected for
 * quality, often refuse to play without a matching Referer, and break silently
 * when the host rotates.
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

/** Quality tiers scored out of 1; unknown quality is treated as mid. */
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

/** Parse "1080p", "1920x1080", "1080" into a vertical resolution. */
export function parseResolution(quality: string | undefined): number | undefined {
if (!quality) return undefined;

  // The dimensions form must be tested first: "1920x1080" also matches the bare
  // number pattern, which would return the *width* (1920) instead of the height
  // (1080) and rank a 1080p stream as if it were 4K.
  const dimensions = quality.match(/(\d{3,4})\s*x\s*(\d{3,4})/i);
  if (dimensions) {
    const height = Number(dimensions[2]);
    return height >= 240 && height <= 4320 ? height : undefined;
  }

  const vertical = quality.match(/(\d{3,4})\s*p?/i);
  if (vertical) {
    const value = Number(vertical[1]);
    return value >= 240 && value <= 4320 ? value : undefined;
  }

  return undefined;
}

export function scoreSource(source: PlaybackSource): number {
  const access = ACCESS_BASE[source.accessType] ?? 0.5;
  // Health is per provider: a source's `endpointSlug` describes which endpoint
  // served it, not a separate health identity.
  const health = healthRegistry.get(source.providerSlug);

  const resolution =
    source.resolution != null ? (RESOLUTION_SCORE[source.resolution] ?? 0.5) : 0.5;

  // Latency is only meaningful once a provider has actually answered.
  const latency =
    health.lastCheckedAt === 0
      ? 0.5
      : Math.max(0, 1 - Math.min(health.avgLatencyMs, LATENCY_CEILING_MS) / LATENCY_CEILING_MS);

  // A failing provider sinks to the bottom regardless of how good its streams
  // normally are.
  const healthTerm = health.score < UNHEALTHY_CUTOFF ? health.score * 0.2 : health.score;

  return (
    access * WEIGHT_ACCESS +
    healthTerm * WEIGHT_HEALTH +
    resolution * WEIGHT_RESOLUTION +
    latency * WEIGHT_LATENCY
  );
}

/** Order sources best-first; ties fall back to the provider's own priority. */
export function rankSources(sources: PlaybackSource[]): RankedSource[] {
  return sources
    .filter((source) => !healthRegistry.isQuarantined(source.providerSlug))
    .map((source) => ({ ...source, rank: Number(scoreSource(source).toFixed(4)) }))
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return a.priority - b.priority;
    });
}

/**
 * Filter to the requested language, always keeping `multi`.
 *
 * `multi` is kept unconditionally: a dual-audio track is strictly more useful
 * than no source at all, so dropping it would turn a playable episode into a
 * dead end.
 */
export function filterByLanguage(
  sources: PlaybackSource[],
  language?: string,
): PlaybackSource[] {
  if (!language) return sources;
  return sources.filter(
    (source) => source.language === language || source.language === "multi",
  );
}

/** De-duplicate by playback URL, keeping the better-ranked copy. */
export function dedupeSources(sources: RankedSource[]): RankedSource[] {
  const seen = new Set<string>();
  const output: RankedSource[] = [];

  for (const source of sources) {
    if (seen.has(source.playbackUrl)) continue;
    seen.add(source.playbackUrl);
    output.push(source);
  }

  return output;
}
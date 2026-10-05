/**
 * Source de-duplication (P5).
 *
 * Keyed on the full identity of a source rather than its URL alone.
 *
 * URL-only dedupe was what this repository did, and it is wrong in both
 * directions. Two providers routinely serve the same file from the same CDN, and
 * collapsing them loses the fact that the second provider is the one that works
 * from this network -- a source that would have played is deleted from the list.
 * In the other direction, one provider offering the same URL as both a dub and
 * a sub is two genuinely different choices for a reader, and collapsing those
 * hides one of them.
 *
 * Ordering is preserved and the first (best-ranked) copy of each key wins, so
 * the resolver's ranking survives de-duplication.
 */

import type { RankedSource } from "./types.js";

/** The identity that makes two sources the same source. */
export function sourceIdentity(source: RankedSource): string {
  return [source.providerSlug, source.playbackUrl, source.language, source.accessType].join("|");
}

export function dedupeSources(sources: RankedSource[]): RankedSource[] {
  const seen = new Set<string>();
  const output: RankedSource[] = [];

  for (const source of sources) {
    const key = sourceIdentity(source);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(source);
  }

  return output;
}

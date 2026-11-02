/**
 * Filler & Canon Episode Classifier.
 *
 * Fetches canonical filler and mixed-canon metadata from `https://zenkaii.pages.dev/api/filler`.
 * Caches responses in memory for 24 hours.
 */

import { fetchJson } from "../../http/client.js";
import { zenkaiShield } from "../zenkaiShield.js";

interface FillerResponse {
  success: boolean;
  max?: number;
  filler?: number[];
  mixed?: number[];
}

interface FillerMetadata {
  fillerSet: Set<number>;
  mixedSet: Set<number>;
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, FillerMetadata>();

export class FillerClassifier {
  private static readonly endpoint = "https://zenkaii.pages.dev/api/filler";

  static async getForTitle(title: string): Promise<{
    isFiller: (ep: number) => boolean;
    getCanonType: (ep: number) => "canon" | "filler" | "mixed";
  }> {
    const normalizedKey = title.trim().toLowerCase();
    const cached = cache.get(normalizedKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        isFiller: (ep: number) => cached.fillerSet.has(ep),
        getCanonType: (ep: number) =>
          cached.fillerSet.has(ep) ? "filler" : cached.mixedSet.has(ep) ? "mixed" : "canon",
      };
    }

    try {
      const shieldHeaders = await zenkaiShield.getShieldHeaders();
      const res = await fetchJson<FillerResponse>(
        `${this.endpoint}?t=${encodeURIComponent(title)}`,
        {
          headers: { ...shieldHeaders, "X-Zenkai-Embed": "1" },
          timeoutMs: 5000,
          retries: 1,
        },
      );

      if (res?.success) {
        const fillerSet = new Set<number>(res.filler ?? []);
        const mixedSet = new Set<number>(res.mixed ?? []);
        cache.set(normalizedKey, {
          fillerSet,
          mixedSet,
          timestamp: Date.now(),
        });

        return {
          isFiller: (ep: number) => fillerSet.has(ep),
          getCanonType: (ep: number) =>
            fillerSet.has(ep) ? "filler" : mixedSet.has(ep) ? "mixed" : "canon",
        };
      }
    } catch {
      // Non-blocking fallback
    }

    return {
      isFiller: () => false,
      getCanonType: () => "canon",
    };
  }
}

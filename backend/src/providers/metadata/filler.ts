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

/** Offline canonical fallback for common long-running anime when upstream is unreachable */
const STATIC_FILLER_MAP: Record<string, { filler: number[]; mixed?: number[] }> = {
  "one piece": {
    filler: [
      54, 55, 56, 57, 58, 59, 60, 61, 98, 99, 101, 102, 131, 132, 133, 134, 135,
      136, 137, 138, 139, 140, 141, 142, 143, 196, 197, 198, 199, 200, 201, 202,
      203, 204, 205, 206, 220, 221, 222, 223, 224, 225, 226, 279, 280, 281, 282,
      283, 291, 292, 303, 317, 318, 319, 326, 327, 328, 329, 330, 331, 332, 333,
      334, 335, 336, 382, 383, 384, 406, 407, 426, 427, 428, 429, 457, 458, 492,
      497, 498, 499, 506, 542, 575, 576, 577, 578, 590, 626, 627, 628, 747, 748,
      749, 750, 775, 780, 781, 782, 807, 881, 895, 896, 907, 1029, 1030,
    ],
    mixed: [18, 20, 46, 47, 68, 69, 71, 78, 83, 85, 100, 104, 105, 128, 145, 161, 230],
  },
  naruto: {
    filler: [
      26, 97, 101, 102, 103, 104, 105, 106, 136, 137, 138, 139, 140, 141, 142,
      143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157,
      158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172,
      173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187,
      188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202,
      203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217,
      218, 219, 220,
    ],
  },
};

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

    const staticData = STATIC_FILLER_MAP[normalizedKey];
    if (staticData) {
      const fillerSet = new Set<number>(staticData.filler);
      const mixedSet = new Set<number>(staticData.mixed ?? []);
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

    return {
      isFiller: () => false,
      getCanonType: () => "canon",
    };
  }
}

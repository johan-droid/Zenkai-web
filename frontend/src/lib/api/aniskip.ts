import { z } from "zod";

import { fetchJson } from "@/lib/api/http";

/**
 * AniSkip: community-contributed skip timestamps, keyed by MAL id.
 * Public API, no auth. Best-effort — a miss is normal and never an error.
 */

export const ANISKIP_API = "https://api.aniskip.com";

export const skipIntervalSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  skipType: z.enum(["op", "ed", "mixed-op", "mixed-ed", "recap"]),
  skipId: z.string(),
  episodeLength: z.number().nullish(),
});

export const skipTimesResponseSchema = z.object({
  found: z.boolean(),
  results: z.array(skipIntervalSchema).nullish(),
  message: z.string().nullish(),
  statusCode: z.number().nullish(),
});

export type SkipInterval = z.infer<typeof skipIntervalSchema>;

export interface SkipTimes {
  opening: SkipInterval | null;
  ending: SkipInterval | null;
  recap: SkipInterval | null;
}

const EMPTY: SkipTimes = { opening: null, ending: null, recap: null };

/**
 * Fetch skip times for one episode.
 *
 * Returns empty intervals when AniSkip has no entry, the id is missing, or the
 * request fails — callers should not need to handle those as errors.
 */
export async function getSkipTimes(
  malId: number | null | undefined,
  episode: string | number,
  options: { episodeLengthSeconds?: number } = {},
): Promise<SkipTimes> {
  if (!malId) return EMPTY;

  try {
    const data = await fetchJson<unknown>(`${ANISKIP_API}/v2/skip-times/${malId}/${episode}`, {
      params: {
        "types[]": ["op", "ed", "recap"],
        episodeLength: options.episodeLengthSeconds
          ? Math.round(options.episodeLengthSeconds)
          : undefined,
      },
      timeoutMs: 6_000,
      retries: 0,
    });

    const parsed = skipTimesResponseSchema.safeParse(data);
    if (!parsed.success || !parsed.data.found) return EMPTY;

    const results = parsed.data.results ?? [];
    return {
      opening: results.find((item) => item.skipType === "op") ?? null,
      ending: results.find((item) => item.skipType === "ed") ?? null,
      recap: results.find((item) => item.skipType === "recap") ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export function isWithin(interval: SkipInterval | null, time: number): boolean {
  return Boolean(interval && time >= interval.startTime && time < interval.endTime);
}

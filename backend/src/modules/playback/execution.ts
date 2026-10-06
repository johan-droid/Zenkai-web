/**
 * Playback execution (P8).
 *
 * P7 lets a client *see* plans. P8 lets a client *select* one. The client
 * never supplies a URL; it supplies the canonical identity of a plan the
 * server itself produced, and the server re-resolves that identity into a
 * fresh, server-owned execution target.
 *
 *   client: { episodeId, sourceId, language? }
 *     → server re-resolves via P5, re-plans via P6
 *     → finds the plan whose sourceId matches
 *     → returns the execution target derived from that plan
 *
 * There is no server-side media fetch for this boundary. The only relay this
 * service performs remains the HLS-manifest/subtitle relay, which is disabled
 * by default and allowlisted. An `embed` execution is a description of an
 * iframe target, never a media fetch.
 */

import { z } from "zod";

import type { PlaybackPlan } from "../../providers/streaming/types.js";

/**
 * The client's selection.
 *
 * Strict: any field that tries to steer execution toward a caller-chosen
 * upstream -- `url`, `sourceUrl`, `streamUrl`, `providerUrl`, `provider`,
 * `access`, `mechanism`, a headers object -- is rejected with 400 rather than
 * silently ignored. Ignored fields are how injection sneaks in.
 */
export const playbackExecutionRequestSchema = z
  .object({
    episodeId: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    language: z.enum(["sub", "dub", "multi"]).default("sub"),
  })
  .strict();

export type PlaybackExecutionRequest = z.infer<typeof playbackExecutionRequestSchema>;

/**
 * What a client is allowed to play.
 *
 * Two kinds, deliberately disjoint:
 *
 *   media  — open with a `<video>` element: `hls` through an HLS pipeline, or
 *            `progressive` directly. The client fetches from `url` unless
 *            `delivery` says the upstream is only reachable through the relay
 *            (`proxyUrl` then carries the manifest path).
 *   embed  — frame a page in an `<iframe>`. Never fetch its URL as media, and
 *            never present it as a progress bar with seek controls.
 */
export type PlaybackExecution =
  | {
      kind: "media";
      mechanism: "hls" | "progressive";
      url: string;
      mediaType: string | null;
      delivery: "client" | "proxied";
      proxyUrl?: string;
      sourceId: string;
      providerSlug: string;
      providerName: string;
      language: "sub" | "dub" | "multi";
      quality?: string;
      resolution?: number;
      validated: boolean;
      playable: boolean;
      capabilities: { seekable: boolean | null; ranged: boolean | null };
      subtitles?: Array<{ language: string; url: string; kind?: string }>;
    }
  | {
      kind: "embed";
      mechanism: "iframe";
      url: string;
      mediaType: string | null;
      sourceId: string;
      providerSlug: string;
      providerName: string;
      language: "sub" | "dub" | "multi";
      validated: boolean;
      playable: boolean;
      subtitles?: Array<{ language: string; url: string; kind?: string }>;
    };

/**
 * Reduce a canonical plan to its execution target.
 *
 * Pure mapping, like the gateway: the plan is canonical and server-owned, so
 * nothing here is fetched, probed, or invented. `embed` can never widen into
 * `media` because the kind is decided by `mechanism`, and `mechanism` comes
 * from P6's pure derivation -- not from the URL.
 */
export function toExecution(plan: PlaybackPlan): PlaybackExecution {
  if (plan.mechanism === "iframe") {
    return {
      kind: "embed",
      mechanism: "iframe",
      url: plan.url,
      mediaType: plan.mediaType,
      sourceId: plan.sourceId,
      providerSlug: plan.providerSlug,
      providerName: plan.providerName,
      language: plan.language,
      validated: plan.validated,
      playable: plan.playable,
      ...(plan.subtitles ? { subtitles: plan.subtitles } : {}),
    };
  }

  return {
    kind: "media",
    mechanism: plan.mechanism === "hls" ? "hls" : "progressive",
    url: plan.url,
    mediaType: plan.mediaType,
    delivery: plan.delivery,
    ...(plan.proxyUrl ? { proxyUrl: plan.proxyUrl } : {}),
    sourceId: plan.sourceId,
    providerSlug: plan.providerSlug,
    providerName: plan.providerName,
    language: plan.language,
    ...(plan.quality !== undefined ? { quality: plan.quality } : {}),
    ...(plan.resolution !== undefined ? { resolution: plan.resolution } : {}),
    validated: plan.validated,
    playable: plan.playable,
    capabilities: plan.capabilities,
    ...(plan.subtitles ? { subtitles: plan.subtitles } : {}),
  };
}

export const playbackExecutionResponseSchema = z.object({
  execution: z.object({
    kind: z.enum(["media", "embed"]),
    mechanism: z.enum(["hls", "progressive", "iframe"]),
    url: z.string(),
    mediaType: z.string().nullable(),
    delivery: z.enum(["client", "proxied"]).optional(),
    proxyUrl: z.string().optional(),
    sourceId: z.string(),
    providerSlug: z.string(),
    providerName: z.string(),
    language: z.enum(["sub", "dub", "multi"]),
    quality: z.string().optional(),
    resolution: z.number().optional(),
    validated: z.boolean(),
    playable: z.boolean(),
    capabilities: z
      .object({ seekable: z.boolean().nullable(), ranged: z.boolean().nullable() })
      .optional(),
    subtitles: z
      .array(z.object({ language: z.string(), url: z.string(), kind: z.string().optional() }))
      .optional(),
  }),
});

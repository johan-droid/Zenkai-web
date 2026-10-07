/**
 * Public playback API contract (P7).
 *
 * This module is the single machine-readable definition of what a client
 * receives when it asks Zenkai to play an episode. The future web player
 * consumes these shapes; the provider layer's internal vocabulary
 * (Hianime/Consumet/provider response formats) never leaks into them.
 *
 * The route returns JSON matching `playbackSourcesResponseSchema`. Tests pin
 * every live response against it, so a change to the shape is a contract
 * change and must be deliberate.
 */

import { z } from "zod";

export const accessTypeSchema = z.enum(["hls", "mp4", "direct", "embed"]);
export const audioTrackSchema = z.enum(["sub", "dub", "multi"]);
export const playbackMechanismSchema = z.enum(["hls", "progressive", "iframe"]);
export const playbackDeliverySchema = z.enum(["client", "proxied"]);

const episodeSummarySchema = z.object({
  id: z.string(),
  episodeNumber: z.number().int(),
  title: z.string().nullish(),
  durationSeconds: z.number().nullish(),
  thumbnailUrl: z.string().nullish(),
  isFiller: z.boolean().nullish(),
});

const subtitleTrackSchema = z.object({
  language: z.string(),
  url: z.string(),
  kind: z.string().optional(),
});

/** A validated, ranked canonical source (P5), as the client may see it. */
const playbackSourceSchema = z.object({
  id: z.string(),
  providerSlug: z.string(),
  providerName: z.string(),
  endpointSlug: z.string(),
  accessType: accessTypeSchema,
  playbackUrl: z.string(),
  quality: z.string().optional(),
  resolution: z.number().optional(),
  language: audioTrackSchema,
  subtitles: z.array(subtitleTrackSchema).optional(),
  referer: z.string().optional(),
  headers: z.record(z.string()).optional(),
  priority: z.number(),
  validated: z.boolean().optional(),
  rank: z.number(),
});

/** The canonical "how to play it" for one source (P6). */
const playbackPlanSchema = z.object({
  sourceId: z.string(),
  providerSlug: z.string(),
  providerName: z.string(),
  endpointSlug: z.string(),
  access: accessTypeSchema,
  mechanism: playbackMechanismSchema,
  mediaType: z.string().nullable(),
  url: z.string(),
  delivery: playbackDeliverySchema,
  proxyUrl: z.string().optional(),
  language: audioTrackSchema,
  quality: z.string().optional(),
  resolution: z.number().optional(),
  referer: z.string().optional(),
  validated: z.boolean(),
  playable: z.boolean(),
  capabilities: z.object({
    seekable: z.boolean().nullable(),
    ranged: z.boolean().nullable(),
  }),
  subtitles: z.array(subtitleTrackSchema).optional(),
});

const providerAttemptSchema = z.object({
  providerSlug: z.string(),
  outcome: z.enum(["ok", "empty", "error", "timeout", "quarantined"]),
  count: z.number().int(),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});

const skippedProviderSchema = z.object({
  providerSlug: z.string(),
  reason: z.string(),
  detail: z.string().optional(),
});

/** `GET /api/v1/episodes/:episodeId/sources` response body. */
export const playbackSourcesResponseSchema = z.object({
  episode: episodeSummarySchema,
  sources: z.array(playbackSourceSchema),
  sourceCount: z.number().int().nonnegative(),
  plans: z.array(playbackPlanSchema),
  planCount: z.number().int().nonnegative(),
  attempts: z.array(providerAttemptSchema),
  skipped: z.array(skippedProviderSchema),
  /** Present only when the shelf is empty; stays distinct per P5 semantics. */
  emptyReason: z.enum(["no_streams", "all_failed", "quarantined"]).optional(),
  resolutionTimeMs: z.number().nonnegative(),
});

/** Canonical error body for every playback route failure. */
export const playbackErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type PlaybackSourcesResponse = z.infer<typeof playbackSourcesResponseSchema>;
export type PlaybackError = z.infer<typeof playbackErrorSchema>;

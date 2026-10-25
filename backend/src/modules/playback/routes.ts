/**
 * Playback routes (P8/P9/P10).
 *
 * `/episodes/:id/sources` is the endpoint the whole provider layer exists to
 * serve. Its contract is deliberately precise about failure: an empty source list
 * returns 200 with `emptyReason` when providers genuinely have nothing, and 503
 * when every provider failed. A client can then tell "this episode has no
 * streams" from "try again shortly", which is the difference between a correct
 * empty state and a wrongly cached failure.
 */

import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { playbackGateway, redactPlaybackUrl } from "../../providers/streaming/gateway.js";
import { playbackExecutionRequestSchema, toExecution } from "./execution.js";
import type { AnimeRepository } from "../anime/repository.js";
import type { PlaybackMetadataService } from "./metadata.js";
import type { PlaybackResolver } from "./service.js";

const languageSchema = z.enum(["sub", "dub", "multi"]);

/**
 * Turn a Zod failure into a 400 carrying a machine-readable reason.
 *
 * A plain `Error` with `statusCode` is enough for Fastify, but the reason is
 * what lets a client distinguish a malformed request from a missing one.
 */
function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("bad_request", result.error.issues[0]?.message ?? "invalid request", 400);
  }
  return result.data;
}

export function registerPlaybackRoutes(
  app: FastifyInstance,
  resolver: PlaybackResolver,
  metadata: PlaybackMetadataService,
  animeRepo: AnimeRepository,
): void {
  /**
   * Sources for one episode.
   *
   * The episode is resolved by local id, so an episode must exist in the catalog
   * first; that is the P4 exit gate and keeps this route from having to guess an
   * AniList id from a provider slug.
   */
  app.get("/api/v1/episodes/:episodeId/sources", async (request: FastifyRequest, reply: FastifyReply) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const query = parseOrThrow(
      z.object({ language: languageSchema.default("sub") }),
      request.query,
    );

    // The route does not know how an episode maps onto a provider id. That is
    // the service's job: this layer validates the episode, asks for sources and
    // shapes the response. The moment a route starts assembling provider
    // vocabulary, the fallback and skip logic becomes untestable and any new
    // provider needs a route change.
    const resolved = await resolver.resolveEpisode(episodeId, { language: query.language });
    if (!resolved) throw AppError.notFound(`episode ${episodeId} not found`);

    const { result, episode } = resolved;

    if (result.sources.length === 0) {
      // Every provider errored: 503, because this may well be playable.
      if (result.emptyReason === "all_failed") {
        request.log.warn(
          {
            episodeId,
            attempts: result.attempts.map((attempt) => ({
              provider: attempt.providerSlug,
              outcome: attempt.outcome,
              error: attempt.error?.slice(0, 160),
            })),
            skipped: result.skipped ?? [],
          },
          "playback resolution failed on every provider",
        );
        throw AppError.noSources("every playback provider failed", {
          attempts: result.attempts,
          skipped: result.skipped ?? [],
        });
      }

      // Providers answered and there is genuinely nothing: a normal empty state.
      return {
        episode: summarize(episode),
        sources: [],
        sourceCount: 0,
        // Present and empty rather than absent, so a client reading the shape sees
        // the same keys whether or not anything was playable. `no_streams` and
        // `all_skipped` stay distinct here exactly as P5 reported them; the
        // gateway does not collapse them into a generic failure.
        plans: [],
        planCount: 0,
        emptyReason: result.emptyReason,
        attempts: result.attempts,
        // Which providers were never asked, and why. Without this a client sees
        // an empty list and cannot tell "nothing is hosted" from "we hold no id
        // that lets us ask anybody".
        skipped: result.skipped ?? [],
        // Per-server availability when a provider reported it: lets the client
        // grey out dead servers instead of offering them. Absent when unknown.
        ...(result.servers ? { servers: result.servers } : {}),
        // Always present so the response shape does not change with the shelf.
        resolutionTimeMs: result.resolutionTimeMs,
      };
    }

    // Mapping happens here, after P5 has done its work and before the response is
    // shaped. The route stays a shaper: it asks the service for sources, asks the
    // gateway how to play them, and reports both. The moment a route started
    // choosing a mechanism for itself, the access-mode semantics would become
    // untestable and a new access mode would need a route change.
    const plans = playbackGateway.planAll(result.sources);

    for (const plan of plans.plans) {
      // Host, path, provider, mechanism and outcome: everything needed to diagnose
      // a failed play. Never the signed query string, and never a credential.
      request.log.info(
        {
          episodeId,
          sourceId: plan.sourceId,
          provider: plan.providerSlug,
          access: plan.access,
          mechanism: plan.mechanism,
          delivery: plan.delivery,
          validated: plan.validated,
          url: redactPlaybackUrl(plan.url),
        },
        "playback plan created",
      );
    }

    if (plans.unmapped > 0) {
      // Dropped rather than faked, but never silently: a client asking for six
      // servers and getting four needs to know two could not be described.
      request.log.warn(
        { episodeId, unmapped: plans.unmapped, sourceCount: result.sources.length },
        "playback sources could not be mapped to a plan",
      );
    }

    if (plans.plans.length > 0) {
      reply.header("cache-control", "public, max-age=30, s-maxage=60, stale-while-revalidate=30");
    }

    return {
      episode: summarize(episode),
      sources: result.sources,
      sourceCount: result.sources.length,
      // P6: the canonical playback contract. `plans[i]` describes `sources[i]`,
      // in P5's ranked order, so the two arrays can be read side by side and the
      // first plan is the source P5 ranked first. The gateway does no resolution
      // and no probing here; this is pure mapping over the list P5 already
      // produced.
      plans: plans.plans,
      planCount: plans.plans.length,
      attempts: result.attempts,
      // Providers excluded before any call, with the reason. Exposed so a client
      // can explain an empty shelf rather than guessing at it.
      skipped: result.skipped ?? [],
      // Per-server availability when a provider reported it.
      ...(result.servers ? { servers: result.servers } : {}),
      resolutionTimeMs: result.resolutionTimeMs,
    };
  });

  /**
   * Execute a canonical selection (P8).
   *
   * The client names a plan it saw in the sources response -- episodeId,
   * sourceId, language -- and the server re-resolves it through P5 and P6 and
   * returns the fresh, server-owned execution target for that exact source.
   *
   * The request is strict: `url`, `sourceUrl`, `streamUrl`, `provider`,
   * `access`, `mechanism` or a headers object are all rejected with 400. The
   * upstream URL always comes from the canonical source, never from the body.
   * No server-side media fetch happens here; `embed` executions are iframe
   * descriptions, never media.
   */
  app.post("/api/v1/playback/execute", async (request: FastifyRequest) => {
    const selection = parseOrThrow(playbackExecutionRequestSchema, request.body);

    const resolved = await resolver.resolveEpisode(selection.episodeId, {
      language: selection.language,
    });
    if (!resolved) throw AppError.notFound(`episode ${selection.episodeId} not found`);

    const { result } = resolved;

    // The same distinction P7 makes public: an outage is retryable (503), an
    // empty shelf with a requested sourceId is a stale selection (409).
    if (result.sources.length === 0 && result.emptyReason === "all_failed") {
      throw AppError.noSources("every playback provider failed", {
        attempts: result.attempts,
        skipped: result.skipped ?? [],
      });
    }

    const plans = playbackGateway.planAll(result.sources);
    const plan = plans.plans.find((candidate) => candidate.sourceId === selection.sourceId);

    if (!plan) {
      throw AppError.selectionStale(
        `source ${selection.sourceId} no longer resolves for this episode`,
        { sourceId: selection.sourceId },
      );
    }

    request.log.info(
      {
        episodeId: selection.episodeId,
        sourceId: plan.sourceId,
        provider: plan.providerSlug,
        mechanism: plan.mechanism,
        delivery: plan.delivery,
        url: redactPlaybackUrl(plan.url),
      },
      "playback execution selected",
    );

    return { execution: toExecution(plan) };
  });

  /** Subtitles and skip markers (P10). */
  app.get("/api/v1/episodes/:episodeId/metadata", async (request) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const episode = await animeRepo.getEpisode(episodeId);
    if (!episode) {
      // Synthetic ids ("ep-<anilist>-<n>") resolve via the identity fallback
      // for sources and derive markers directly from skip-capable providers.
      // A truly malformed id is still a 404.
      const synthetic = episodeId.match(/^(?:ep-)?(\d+)-(\d+)$/);
      if (synthetic) {
        return metadata.get(episodeId, {
          animeId: synthetic[1],
          anilistId: synthetic[1],
          episodeNumber: Number(synthetic[2]),
          language: "sub",
        });
      }
      throw AppError.notFound(`episode ${episodeId} not found`);
    }

    const [title] = await animeRepo.listParentTitles([episode.animeId]);

    if (!title?.anilistId) {
      throw AppError.notFound(`episode ${episodeId} has no resolvable title`);
    }

    return metadata.get(episodeId, {
      animeId: String(title.id),
      anilistId: String(title.anilistId),
      malId: title.externalIds?.mal,
      episodeNumber: Number(episode.episodeNumber),
      language: "sub",
    });
  });

  /** Provider health snapshot (P7/P19), with P6 gateway counters. */
  app.get("/api/v1/playback/providers", async () => ({
    providers: resolver.health(),
    // Two integers on the endpoint that already reports playback health, rather
    // than a second metrics system with its own scrape target.
    gateway: playbackGateway.stats(),
  }));

  /** Force a re-probe of every provider. */
  app.post("/api/v1/playback/providers/check", async () => ({
    results: await resolver.checkAll(),
  }));

  /**
   * Manifest and media resource relay (P9).
   *
   * Disabled unless `ENABLE_PLAYBACK_PROXY` is set. The URL is validated by the
   * SSRF guard inside the gateway, so this cannot be turned into an open proxy.
   *
   * This serves both HLS manifests (rewriting child playlist and media segment URLs
   * so they remain on this secure relay) and binary media resources (streaming them
   * directly without text conversion or in-memory buffering, forwarding Range headers
   * and 206 Partial Content).
   */
  app.get("/api/v1/playback/manifest", async (request, reply) => {
    const { url, referer } = parseOrThrow(
      z.object({
        url: z.string().trim().min(1),
        referer: z.string().trim().min(1).optional(),
      }),
      request.query,
    );

    const range = typeof request.headers.range === "string" ? request.headers.range : undefined;

    const resource = await playbackGateway.fetchResource(url, {
      referer,
      range,
      relayPrefix: "/api/v1/playback/manifest",
    });

    reply.header("content-type", resource.contentType);
    // Signed upstream URLs must never outlive this response in a shared cache.
    reply.header("cache-control", "no-store");

    if (resource.isPlaylist) {
      return reply.send(resource.body);
    }

    reply.status(resource.status);
    if (resource.contentLength) {
      reply.header("content-length", resource.contentLength);
    }
    if (resource.contentRange) {
      reply.header("content-range", resource.contentRange);
    }
    if (resource.acceptRanges) {
      reply.header("accept-ranges", resource.acceptRanges);
    }

    if (!resource.body) {
      return reply.send("");
    }
    if (typeof (resource.body as any).pipe === "function") {
      return reply.send(resource.body);
    }
    return reply.send(Readable.fromWeb(resource.body as any));
  });

  /**
   * Subtitle relay.
   *
   * Subtitle sidecars often carry no CORS headers, so the player cannot fetch
   * them cross-origin. This relays them with the same guard as the manifest
   * relay: same ENABLE_PLAYBACK_PROXY gate, allowlist, per-hop redirect
   * validation, fixed UA/Accept, size cap. It is never an arbitrary file proxy.
   */
  app.get("/api/v1/playback/subtitle", async (request, reply) => {
    const { url } = parseOrThrow(
      z.object({ url: z.string().trim().min(1) }),
      request.query,
    );

    const subtitle = await playbackGateway.fetchSubtitle(url);
    reply.header("content-type", subtitle.contentType);
    reply.header("cache-control", "no-store");
    return reply.send(subtitle.body);
  });
}

/** Trim an episode row down to what a player needs. */
function summarize(episode: Record<string, any>): Record<string, unknown> {
  return {
    id: episode.id,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    durationSeconds: episode.durationSeconds,
    thumbnailUrl: episode.thumbnailUrl,
    isFiller: episode.isFiller,
  };
}
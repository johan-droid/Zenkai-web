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

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { playbackGateway, redactPlaybackUrl } from "../../providers/streaming/gateway.js";
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
  app.get("/api/v1/episodes/:episodeId/sources", async (request: FastifyRequest) => {
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
      resolutionTimeMs: result.resolutionTimeMs,
    };
  });

  /** Subtitles and skip markers (P10). */
  app.get("/api/v1/episodes/:episodeId/metadata", async (request) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const episode = (await animeRepo.getEpisode(episodeId)) as Record<string, any> | null;
    if (!episode) throw AppError.notFound(`episode ${episodeId} not found`);

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
   * Manifest relay (P9).
   *
   * Disabled unless `ENABLE_PLAYBACK_PROXY` is set. The URL is validated by the
   * SSRF guard inside the gateway, so this cannot be turned into an open proxy.
   *
   * This is the relay a `delivery: "proxied"` plan points at. It is not how a
   * playback URL is chosen: a plan's URL always comes from a canonical source, and
   * this endpoint only ever serves the manifest that plan already named.
   */
  app.get("/api/v1/playback/manifest", async (request) => {
    const { url } = parseOrThrow(
      z.object({ url: z.string().trim().min(1) }),
      request.query,
    );

    return playbackGateway.fetchManifest(url);
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
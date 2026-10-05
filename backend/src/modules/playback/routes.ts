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

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
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
  app.get("/api/v1/episodes/:episodeId/sources", async (request) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const query = parseOrThrow(
      z.object({ language: languageSchema.default("sub") }),
      request.query,
    );

    const episode = (await animeRepo.getEpisode(episodeId)) as Record<string, any> | null;
    if (!episode) throw AppError.notFound(`episode ${episodeId} not found`);

    // `animeId` on the episode is a local uuid, and `getByAnilistId` expects a
    // provider id, so the parent is fetched by its own primary key.
    const [title] = (await animeRepo.listParentTitles([episode.animeId])) as Array<
      Record<string, any>
    >;

    if (!title?.anilistId) {
      throw AppError.notFound(`episode ${episodeId} has no resolvable title`);
    }

    const result = await resolver.resolve({
      animeId: String(title.id),
      anilistId: String(title.anilistId),
      malId: title.externalIds?.mal,
      episodeNumber: Number(episode.episodeNumber),
      language: query.language,
    });

    if (result.sources.length === 0) {
      // Every provider errored: 503, because this may well be playable.
      if (result.emptyReason === "all_failed") {
        throw AppError.noSources("every playback provider failed", {
          attempts: result.attempts,
        });
      }

      // Providers answered and there is genuinely nothing: a normal empty state.
      return {
        episode: summarize(episode),
        sources: [],
        sourceCount: 0,
        emptyReason: result.emptyReason,
      };
    }

    return {
      episode: summarize(episode),
      sources: result.sources,
      sourceCount: result.sources.length,
      attempts: result.attempts,
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

  /** Provider health snapshot (P7/P19). */
  app.get("/api/v1/playback/providers", async () => ({ providers: resolver.health() }));

  /** Force a re-probe of every provider. */
  app.post("/api/v1/playback/providers/check", async () => ({
    results: await resolver.checkAll(),
  }));

  /**
   * Manifest relay (P9).
   *
   * Disabled unless `ENABLE_PLAYBACK_PROXY` is set. The URL is validated by the
   * SSRF guard inside the gateway, so this cannot be turned into an open proxy.
   */
  app.get("/api/v1/playback/manifest", async (request) => {
    const { url } = parseOrThrow(
      z.object({ url: z.string().trim().min(1) }),
      request.query,
    );

    const { playbackGateway } = await import("../../providers/streaming/gateway.js");
    const result = await playbackGateway.fetchManifest(url);

    return result;
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
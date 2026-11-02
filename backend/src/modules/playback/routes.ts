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
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { playbackIssueReports } from "../../db/schema/index.js";
import { AppError } from "../../http/errors.js";
import { playbackGateway, redactPlaybackUrl } from "../../providers/streaming/gateway.js";
import { playbackExecutionRequestSchema, toExecution } from "./execution.js";
import type { AnimeRepository } from "../anime/repository.js";
import type { PlaybackMetadataService } from "./metadata.js";
import type { PlaybackResolver } from "./service.js";
import type { ServerAvailabilityService } from "./servers.js";

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
  serverService?: ServerAvailabilityService,
  db?: Db,
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
    const serverReport = serverService
      ? serverService.buildReportFromResolved(resolved, query.language)
      : null;
    const computedServers = serverReport ? serverReport.servers : result.servers;

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
        ...(computedServers ? { servers: computedServers } : {}),
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

    const availableAudioLanguages = Array.from(
      new Map(
        result.sources
          .flatMap((s) => s.audioTracks ?? [])
          .map((t) => [t.code, t]),
      ).values(),
    );

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
      ...(availableAudioLanguages.length > 0 ? { availableAudioLanguages } : {}),
      // Per-server availability when a provider reported it.
      ...(computedServers ? { servers: computedServers } : {}),
      resolutionTimeMs: result.resolutionTimeMs,
    };
  });

  /**
   * Dedicated Dynamic Server Availability & Health API.
   * Returns verified server availability, diagnostic categories, and playability states.
   */
  app.get("/api/v1/episodes/:episodeId/servers", async (request: FastifyRequest, reply: FastifyReply) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const query = parseOrThrow(
      z.object({
        language: languageSchema.default("sub"),
        refresh: z
          .union([z.boolean(), z.string()])
          .transform((v) => v === true || v === "true" || v === "1")
          .default(false),
      }),
      request.query,
    );

    if (serverService) {
      const report = await serverService.getAvailability(episodeId, {
        language: query.language,
        refresh: query.refresh,
      });

      if (report.cached) {
        reply.header("x-zenkai-cache", "HIT");
        reply.header("cache-control", "public, max-age=60, s-maxage=60, stale-while-revalidate=30");
      } else {
        reply.header("x-zenkai-cache", "MISS");
        reply.header("cache-control", "no-cache");
      }

      return report;
    }

    const resolved = await resolver.resolveEpisode(episodeId, { language: query.language });
    if (!resolved) throw AppError.notFound(`episode ${episodeId} not found`);

    const plans = playbackGateway.planAll(resolved.result.sources).plans;
    const servers = plans.map((p) => ({
      serverId: p.providerSlug,
      sourceId: p.sourceId,
      serverName: p.providerName || p.providerSlug,
      displayName: p.providerName || p.providerSlug,
      status: p.validated !== false ? "AVAILABLE" : "UNAVAILABLE",
      statusMessage: p.validated !== false ? "Available" : "Unavailable",
      type: p.access === "embed" ? "embed" : "hls",
      selectable: p.validated !== false,
      sub: p.language === "sub" || p.language === "multi",
      dub: p.language === "dub" || p.language === "multi",
      lastCheckedAt: new Date().toISOString(),
      name: p.endpointSlug || p.providerSlug,
      label: p.providerName || p.providerSlug,
    }));

    return {
      episodeId,
      episodeNumber: Number(resolved.episode.episodeNumber ?? 1),
      language: query.language,
      servers,
      availableCount: servers.filter((s) => s.status === "AVAILABLE").length,
      totalCount: servers.length,
      checkedAt: new Date().toISOString(),
      cached: false,
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

    const meta = await metadata.get(episodeId, {
      animeId: String(title.id),
      anilistId: String(title.anilistId),
      malId: title.externalIds?.mal,
      episodeNumber: Number(episode.episodeNumber),
      language: "sub",
    });

    const timings = await metadata.getCommunityTimings(String(title.id), episodeId);

    return {
      episodeId: meta.episodeId,
      subtitles: meta.subtitles,
      intro: meta.intro,
      outro: meta.outro,
      recap: timings.recap ?? meta.recap,
      preview: timings.preview ?? meta.preview,
      sourceUpdatedAt: meta.sourceUpdatedAt,
      _communityTimings: timings.all,
    };
  });

  // ---- community skip-timing endpoints (Prompt 04) ------------------------------------

  app.post("/api/v1/episodes/:episodeId/skip-timing", async (request: FastifyRequest) => {
    const { episodeId } = parseOrThrow(
      z.object({ episodeId: z.string().trim().min(1) }),
      request.params,
    );

    const body = parseOrThrow(
      z.object({
        segmentType: z.enum(["intro", "outro", "recap", "preview"]),
        startSeconds: z.number().int().min(0),
        endSeconds: z.number().int().min(1),
        versionNote: z.string().max(128).optional().nullable().default(null),
        submitterAnilistId: z.number().int().min(1).optional().nullable().default(null),
      }),
      request.body,
    );

    if (body.startSeconds >= body.endSeconds) {
      throw new AppError("bad_request", "start_seconds must be less than end_seconds", 400);
    }

    if (body.endSeconds - body.startSeconds > 420) {
      throw new AppError("bad_request", "timing range must be 420 seconds or fewer", 400);
    }

    const result = await metadata.submitCommunityTiming(episodeId, {
      segmentType: body.segmentType,
      startSeconds: body.startSeconds,
      endSeconds: body.endSeconds,
      versionNote: body.versionNote ?? null,
      submitterAnilistId: body.submitterAnilistId ?? null,
    });

    request.log.info(
      { episodeId, timingId: result.id, segmentType: body.segmentType },
      "community skip timing submitted",
    );

    return result;
  });

  app.post("/api/v1/skip-timing/:timingId/report", async (request: FastifyRequest) => {
    const { timingId } = parseOrThrow(
      z.object({ timingId: z.string().trim().min(1) }),
      request.params,
    );

    const body = parseOrThrow(
      z.object({
        reportType: z.enum(["too_early", "too_late", "wrong_segment", "incorrect"]),
        suggestedStartSeconds: z.number().int().min(0).optional().nullable().default(null),
        suggestedEndSeconds: z.number().int().min(1).optional().nullable().default(null),
        reporterAnilistId: z.number().int().min(1).optional().nullable().default(null),
      }),
      request.body,
    );

    if (body.suggestedStartSeconds !== null && body.suggestedEndSeconds !== null) {
      if (body.suggestedStartSeconds >= body.suggestedEndSeconds) {
        throw new AppError("bad_request", "suggested timing must have start before end", 400);
      }
    }

    await metadata.reportTiming(timingId, {
      reportType: body.reportType,
      suggestedStartSeconds: body.suggestedStartSeconds ?? null,
      suggestedEndSeconds: body.suggestedEndSeconds ?? null,
      reporterAnilistId: body.reporterAnilistId ?? null,
    });

    request.log.info(
      { timingId, reportType: body.reportType },
      "community skip timing reported",
    );
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

  /**
   * General playback issue reporting route.
   *
   * Rate limited to 5 submissions per 15 minutes per IP.
   * Automatically deduplicates repeated identical reports within 5 minutes.
   * Never records ephemeral signed URLs or private user tokens.
   */
  const playbackIssueBodySchema = z.object({
    episodeId: z.string().trim().min(1).max(128),
    animeId: z.string().trim().max(128).optional(),
    providerSlug: z.string().trim().max(64).optional(),
    sourceId: z.string().trim().max(256).optional(),
    issueCategory: z.enum([
      "dead_stream",
      "audio_desync",
      "buffering",
      "wrong_episode",
      "subtitles_missing",
      "audio_missing",
      "other",
    ]),
    playbackTimestampSeconds: z.number().int().min(0).max(86400).optional(),
    audioLanguage: z.string().trim().max(32).optional(),
    subtitleLanguage: z.string().trim().max(64).optional(),
    userDescription: z.string().trim().max(1000).optional(),
  });

  const issueRateLimitWindowMs = 15 * 60 * 1000; // 15 minutes
  const maxIssuesPerWindow = 5;
  const duplicateWindowMs = 5 * 60 * 1000; // 5 minutes

  app.post("/api/v1/playback/issues", async (request, reply) => {
    const body = parseOrThrow(playbackIssueBodySchema, request.body);
    const clientIp = request.ip || "127.0.0.1";
    const ipHash = createHash("sha256").update(clientIp).digest("hex");
    const userAgent = (request.headers["user-agent"] || "").slice(0, 256);

    if (db) {
      try {
        const fifteenMinutesAgo = new Date(Date.now() - issueRateLimitWindowMs);
        const recentReports = await db
          .select({ id: playbackIssueReports.id })
          .from(playbackIssueReports)
          .where(
            and(
              eq(playbackIssueReports.clientIpHash, ipHash),
              gt(playbackIssueReports.createdAt, fifteenMinutesAgo),
            ),
          );

        if (recentReports.length >= maxIssuesPerWindow) {
          throw AppError.tooManyRequests(
            "Rate limit exceeded: maximum 5 playback issue reports per 15 minutes. Please try again later.",
          );
        }

        // Duplicate check within 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - duplicateWindowMs);
        const duplicates = await db
          .select({ id: playbackIssueReports.id })
          .from(playbackIssueReports)
          .where(
            and(
              eq(playbackIssueReports.episodeId, body.episodeId),
              eq(playbackIssueReports.issueCategory, body.issueCategory),
              eq(playbackIssueReports.clientIpHash, ipHash),
              gt(playbackIssueReports.createdAt, fiveMinutesAgo),
            ),
          )
          .limit(1);

        if (duplicates.length > 0) {
          return reply.status(200).send({
            success: true,
            reportId: duplicates[0]!.id,
            message: "Issue already reported and is queued for verification.",
            duplicate: true,
          });
        }

        const [inserted] = await db
          .insert(playbackIssueReports)
          .values({
            episodeId: body.episodeId,
            animeId: body.animeId,
            providerSlug: body.providerSlug,
            sourceId: body.sourceId,
            issueCategory: body.issueCategory,
            playbackTimestampSeconds: body.playbackTimestampSeconds,
            audioLanguage: body.audioLanguage,
            subtitleLanguage: body.subtitleLanguage,
            userDescription: body.userDescription,
            clientIpHash: ipHash,
            userAgent,
            status: "open",
          })
          .returning({ id: playbackIssueReports.id });

        request.log.info(
          {
            reportId: inserted?.id,
            episodeId: body.episodeId,
            issueCategory: body.issueCategory,
            providerSlug: body.providerSlug,
          },
          "playback issue report submitted",
        );

        return reply.status(201).send({
          success: true,
          reportId: inserted?.id,
          message: "Playback issue report submitted successfully.",
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.warn({ err }, "failed to persist playback issue report to database");
      }
    }

    // Degraded / DB offline fallback
    return reply.status(200).send({
      success: true,
      reportId: `offline-${Date.now()}`,
      message: "Playback issue recorded (offline fallback).",
    });
  });

  app.get("/api/v1/playback/issues/summary", async () => {
    if (!db) {
      return { total: 0, byCategory: {}, byProvider: {} };
    }
    try {
      const rows = await db
        .select({
          issueCategory: playbackIssueReports.issueCategory,
          providerSlug: playbackIssueReports.providerSlug,
          count: sql<number>`count(*)::int`,
        })
        .from(playbackIssueReports)
        .groupBy(playbackIssueReports.issueCategory, playbackIssueReports.providerSlug);

      const byCategory: Record<string, number> = {};
      const byProvider: Record<string, number> = {};
      let total = 0;

      for (const row of rows) {
        const c = row.count || 0;
        total += c;
        byCategory[row.issueCategory] = (byCategory[row.issueCategory] || 0) + c;
        const p = row.providerSlug || "unknown";
        byProvider[p] = (byProvider[p] || 0) + c;
      }

      return { total, byCategory, byProvider };
    } catch {
      return { total: 0, byCategory: {}, byProvider: {} };
    }
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
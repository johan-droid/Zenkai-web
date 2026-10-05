/**
 * Application composition root (P0).
 *
 * Everything is wired here and nowhere else. Routes receive fully-built
 * services, so no module constructs its own database handle or provider list —
 * that is what makes the dependency graph readable and testable, and it means a
 * new adapter is added in one file rather than hunted across the tree.
 *
 * `buildApp` returns the instance without listening, so tests can drive it
 * through `inject()` without binding a port.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";

import { config } from "./config/index.js";
import { cache } from "./cache/index.js";
import { createDb, waitForDatabase, type Db } from "./db/client.js";
import { AppError, errorMessage } from "./http/errors.js";
import { AnilistProvider } from "./providers/metadata/anilist.js";
import {
  buildProviders,
  buildProvidersWithDemos,
} from "./providers/streaming/registry.js";
import { healthRegistry } from "./providers/streaming/health.js";
import { AnimeRepository } from "./modules/anime/repository.js";
import { AnimeService } from "./modules/anime/service.js";
import { DiscoveryService } from "./modules/anime/discovery.js";
import { registerAnimeRoutes } from "./modules/anime/routes.js";
import { MangaRepository } from "./modules/manga/repository.js";
import { MangaService } from "./modules/manga/service.js";
import { registerMangaRoutes } from "./modules/manga/routes.js";
import { ScheduleService } from "./modules/schedule/service.js";
import { registerScheduleRoutes } from "./modules/schedule/routes.js";
import { PlaybackResolver } from "./modules/playback/service.js";
import { PlaybackMetadataService } from "./modules/playback/metadata.js";
import { registerPlaybackRoutes } from "./modules/playback/routes.js";

export interface AppDependencies {
  db: Db;
  /** Overridable so tests can inject a stub provider set. */
  providers?: ReturnType<typeof buildProviders>;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport: config.NODE_ENV === "development" ? undefined : undefined,
    },
    // Trust the proxy's X-Forwarded-* so rate limiting keys on the real client.
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    // The player needs to read response headers for quality and range handling.
    exposedHeaders: ["x-zenkai-cache", "content-range", "accept-ranges"],
  });

  /**
   * Rate limiting.
   *
   * Global by default; the playback routes tighten their own limit so one user
   * cannot fan out across providers on every page load.
   */
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    // Health checks and the provider list are called by monitoring far more
    // often than a human would, and must not be throttled into a false alarm.
    allowList: (request) =>
      request.url === "/health" || request.url.startsWith("/api/v1/playback/providers"),
  });

  /**
   * Error handling.
   *
   * `AppError` carries an intentional status and a machine-readable reason, so
   * it is passed through. Anything else is logged with its stack and reported as
   * a generic 500: an unexpected exception is not something to describe to a
   * client, because the message often contains an internal URL or id.
   */
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.reason,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      });
    }

    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode ?? 500)
        : 500;

    if (statusCode < 500) {
      return reply.code(statusCode).send({
        error: "bad_request",
        message: error instanceof Error ? error.message : "invalid request",
      });
    }

    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({
      error: "internal",
      message: "internal server error",
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: "not_found", message: `no route for ${request.url}` });
  });

  const animeRepo = new AnimeRepository(deps.db);
  const animeService = new AnimeService(animeRepo);
  // Discovery owns the metadata provider and the cache, so routes never reach
  // for a provider directly and provider swaps stay confined to this file.
  // Schedule first, because home takes the upcoming shelf from it. The two
  // modules are peers: home depends on a narrow interface here rather than
  // discovery importing the schedule module.
  const scheduleService = new ScheduleService(deps.db, animeRepo);

  const discoveryService = new DiscoveryService(animeRepo, new AnilistProvider(), undefined, {
    async upcoming({ limit }) {
      const rows = await scheduleService.upcoming({ limit });
      return rows.map((row) => ({
        anilistId: row.anilistId as number | null,
        title: String(row.title),
        coverUrl: (row.coverUrl as string | null) ?? null,
        episodeNumber: Number(row.episodeNumber),
        airingAt: row.airingAt as Date,
      }));
    },
  });
  const mangaRepo = new MangaRepository(deps.db);
  const mangaService = new MangaService(mangaRepo);
  const providers =
    deps.providers ??
    (config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders());

  const resolver = new PlaybackResolver(providers);
  const metadata = new PlaybackMetadataService(deps.db, providers);

  /**
   * Liveness and readiness.
   *
   * Both are reported, and `status` is 503 when the database is unreachable, so
   * a load balancer stops sending traffic to an instance that cannot serve it.
   * The provider check is deliberately excluded: a dead AniList should degrade
   * discovery, not take the whole instance out of rotation while the database is
   * still perfectly healthy.
   *
   * Catalogue counts are gathered independently of the liveness probe so a
   * failing count is reported as `null` ("unknown") rather than `0`. Reporting
   * zero for a query that threw is the one answer that is always wrong: it reads
   * as "the catalogue is genuinely empty" when the truth is "we could not ask",
   * and that is exactly the confusion this endpoint exists to prevent.
   */
  app.get("/health", async (_request, reply) => {
    let databaseOk = false;
    try {
      await deps.db.execute(sql`select 1`);
      databaseOk = true;
    } catch (error) {
      // Logged rather than rethrown: /health must answer even when the database
      // is the thing that is broken, and that is precisely when it is most
      // useful to see a 503.
      _request.log.error({ err: error }, "database unavailable during health check");
    }

    const countOrNull = async (count: () => Promise<number>): Promise<number | null> => {
      try {
        return await count();
      } catch (error) {
        _request.log.warn({ err: error }, "catalogue count failed during health check");
        return null;
      }
    };

    const [catalogSize, mangaSize] = await Promise.all([
      countOrNull(() => animeRepo.count()),
      countOrNull(() => mangaRepo.count()),
    ]);

    return reply.code(databaseOk ? 200 : 503).send({
      status: databaseOk ? "ok" : "degraded",
      service: "zenkai-backend",
      database: databaseOk ? "up" : "down",
      // Null means "could not be determined", which is distinct from zero.
      catalog: { anime: catalogSize, manga: mangaSize },
      providers: {
        streaming: providers.length,
        quarantined: providers.filter((provider) =>
          healthRegistry.isQuarantined(provider.slug),
        ).length,
      },
      timestamp: new Date().toISOString(),
    });
  });

  /** Per-provider health, for the observability dashboard (P19). */
  app.get("/api/v1/providers/health", async () => ({
    providers: resolver.health(),
    snapshot: healthRegistry.snapshot(),
  }));

  /** Clear quarantined providers so a recovered one is retried. */
  app.post("/api/v1/providers/reset", async () => ({
    cleared: healthRegistry.resetQuarantined(),
  }));

  registerAnimeRoutes(app, animeService, discoveryService);
  registerMangaRoutes(app, mangaService);
  registerScheduleRoutes(app, scheduleService);
  registerPlaybackRoutes(app, resolver, metadata, animeRepo);

  return app;
}
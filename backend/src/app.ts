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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";

import { config } from "./config/index.js";
import { cache } from "./cache/index.js";
import { createDb, createResources, waitForDatabase, startPeriodicProbe, setDatabaseOnline, type Db } from "./db/client.js";
import { AppError, errorMessage } from "./http/errors.js";
import { assertSafeUrl, BlockedUrlError } from "./http/url-guard.js";
import { AnilistProvider } from "./providers/metadata/anilist.js";
import {
  buildProviders,
  buildProvidersWithDemos,
  loadProvidersFromDb,
} from "./providers/streaming/registry.js";
import { redactRequestUrl } from "./providers/streaming/gateway.js";
import { healthRegistry } from "./providers/streaming/health.js";
import { AnimeRepository } from "./modules/anime/repository.js";
import { AnimeService } from "./modules/anime/service.js";
import { DiscoveryService } from "./modules/anime/discovery.js";
import { EpisodeService } from "./modules/anime/episodes.js";
import { registerAnimeRoutes } from "./modules/anime/routes.js";
import { MangaRepository } from "./modules/manga/repository.js";
import { MangaService } from "./modules/manga/service.js";
import { registerMangaRoutes } from "./modules/manga/routes.js";
import { NovelRepository } from "./modules/novel/repository.js";
import { NovelService } from "./modules/novel/service.js";
import { NovelProvider } from "./providers/novel/index.js";
import { registerNovelRoutes } from "./modules/novel/routes.js";
import { ScheduleService } from "./modules/schedule/service.js";
import { registerScheduleRoutes } from "./modules/schedule/routes.js";
import { PlaybackResolver } from "./modules/playback/service.js";
import { PlaybackMetadataService } from "./modules/playback/metadata.js";
import { registerPlaybackRoutes } from "./modules/playback/routes.js";
import { AuthRepository } from "./modules/auth/repository.js";
import { AuthService } from "./modules/auth/service.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { LibraryRepository } from "./modules/library/repository.js";
import { LibraryService } from "./modules/library/service.js";
import { registerLibraryRoutes } from "./modules/library/routes.js";
import { ProgressRepository } from "./modules/progress/repository.js";
import { ProgressService } from "./modules/progress/service.js";
import { registerProgressRoutes } from "./modules/progress/routes.js";

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
      serializers: {
        // Request logs would otherwise persist signed relay URLs
        // (/api/v1/playback/manifest?url=https://cdn.../token=...).
        req: (request) => ({
          method: request.method,
          url: redactRequestUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip,
        }),
      },
    },
    // In production, only trust loopback proxy headers to prevent IP spoofing
    trustProxy: config.NODE_ENV === "production" ? "127.0.0.1" : true,
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
      request.url === "/health" ||
      request.url === "/api/v1/health" ||
      request.url.startsWith("/api/v1/playback/providers"),
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
  const providers =
    deps.providers ??
    (await loadProvidersFromDb(deps.db));

  const animeService = new AnimeService(animeRepo, providers);
  // Discovery owns the metadata provider and the cache, so routes never reach
  // for a provider directly and provider swaps stay confined to this file.
  // Schedule first, because home takes the upcoming shelf from it. The two
  // modules are peers: home depends on a narrow interface here rather than
  // discovery importing the schedule module.
  const scheduleService = new ScheduleService(deps.db, animeRepo);

  const episodeService = new EpisodeService(animeRepo);
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
  const novelRepo = new NovelRepository(deps.db);
  const novelService = new NovelService(new NovelProvider(), novelRepo);

  const resolver = new PlaybackResolver(providers, animeRepo);
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
      const rawSql = (deps.db as any).rawClient;
      if (rawSql) {
        await rawSql`select 1`;
      } else {
        await deps.db.execute(sql`select 1`);
      }
      setDatabaseOnline(true);
      databaseOk = true;
    } catch (error) {
      setDatabaseOnline(false);
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

  /**
   * Minimal public liveness endpoint.
   * Exposes only basic liveness status without internal database, provider,
   * or infrastructure diagnostic details.
   */
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "zenkai-backend",
    timestamp: new Date().toISOString(),
  }));

  /** Per-provider health, for the observability dashboard (P19). */
  app.get("/api/v1/providers/health", async () => ({
    providers: resolver.health(),
    snapshot: healthRegistry.snapshot(),
  }));

  /** Clear quarantined providers so a recovered one is retried. */
  app.post("/api/v1/providers/reset", async () => ({
    cleared: healthRegistry.resetQuarantined(),
  }));

  const authRepo = new AuthRepository(deps.db);
  const authService = new AuthService(authRepo);
  const libraryRepo = new LibraryRepository(deps.db);
  const libraryService = new LibraryService(libraryRepo);
  const progressRepo = new ProgressRepository(deps.db);
  const progressService = new ProgressService(progressRepo);

  registerAuthRoutes(app, authService);
  registerLibraryRoutes(app, libraryService);
  registerProgressRoutes(app, progressService, libraryService);
  registerAnimeRoutes(app, animeService, discoveryService, episodeService);
  registerMangaRoutes(app, mangaService);
  registerNovelRoutes(app, novelService);
  registerScheduleRoutes(app, scheduleService);
  registerPlaybackRoutes(app, resolver, metadata, animeRepo);

  const execFileAsync = promisify(execFile);

  /**
   * Media and image proxy for CDN referer-gated assets (WeebCentral, ComicK, Lnori).
   */
  /**
   * Media and image proxy for CDN referer-gated assets (WeebCentral, ComicK, Lnori).
   * Protected with SSRF URL guard, DNS re-check, and header sanity validation.
   */
  app.get("/api/v1/proxy", async (request, reply) => {
    const { url, referer } = request.query as { url?: string; referer?: string };
    if (!url || !url.startsWith("http")) {
      return reply.code(400).send({ error: "bad_request", message: "url parameter is required and must be an http(s) URL" });
    }

    // Guard referer against CRLF injection or command injection patterns
    if (referer) {
      if (/[\r\n\0]/.test(referer) || !/^https?:\/\//i.test(referer)) {
        return reply.code(400).send({ error: "bad_request", message: "Invalid referer header" });
      }
    }

    try {
      let currentUrl = url;
      const maxRedirects = 5;
      let buffer: Buffer | null = null;
      let contentType = "image/jpeg";

      const headers: Record<string, string> = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      };
      if (referer) {
        headers.referer = referer;
      }

      for (let hop = 0; hop <= maxRedirects; hop++) {
        // Enforce SSRF protection on every hop (blocks private IP, loopback, cloud metadata)
        await assertSafeUrl(currentUrl);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          const res = await fetch(currentUrl, {
            headers,
            signal: controller.signal,
            redirect: "manual",
          });
          clearTimeout(timeout);

          if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) throw new Error("Redirect without location header");
            currentUrl = new URL(location, currentUrl).toString();
            continue;
          }

          if (res.ok) {
            contentType = res.headers.get("content-type") || "image/jpeg";
            const lowerType = contentType.toLowerCase().split(";")[0].trim();
            // Reject non-media responses (e.g. internal JSON or HTML endpoints)
            if (
              lowerType.startsWith("text/html") ||
              lowerType.startsWith("application/json") ||
              lowerType.startsWith("text/plain")
            ) {
              return reply.code(400).send({ error: "bad_request", message: "Target URL does not return image content" });
            }

            const arrayBuffer = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            break;
          } else {
            throw new Error(`Upstream returned ${res.status}`);
          }
        } catch (fetchErr) {
          // If direct fetch failed, fallback to safe curl for the verified URL
          await assertSafeUrl(currentUrl);

          const curlArgs = [
            "-s",
            "--max-time", "15",
            "--proto", "=http,https",
            "--proto-redir", "=http,https",
            "--max-redirs", "5",
          ];
          if (referer) {
            curlArgs.push("-H", `referer: ${referer}`);
          }
          curlArgs.push("-H", `user-agent: ${headers["user-agent"]}`);
          curlArgs.push(currentUrl);

          const { stdout } = await execFileAsync("curl", curlArgs, {
            encoding: "buffer",
            maxBuffer: 25 * 1024 * 1024,
          });

          if (!stdout || stdout.length === 0) {
            throw fetchErr;
          }

          buffer = stdout;
          if (currentUrl.endsWith(".png")) contentType = "image/png";
          else if (currentUrl.endsWith(".webp")) contentType = "image/webp";
          else if (currentUrl.endsWith(".avif")) contentType = "image/avif";
          break;
        }
      }

      if (!buffer) {
        return reply.code(502).send({ error: "proxy_error", message: "Failed to retrieve resource" });
      }

      reply.header("content-type", contentType);
      reply.header("cache-control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
      reply.header("access-control-allow-origin", "*");
      return reply.send(buffer);
    } catch (err: any) {
      if (err instanceof BlockedUrlError || err?.name === "BlockedUrlError") {
        return reply.code(400).send({ error: "blocked_url", message: err.message });
      }
      return reply.code(502).send({ error: "proxy_error", message: err?.message ?? "Failed to proxy resource" });
    }
  });

  return app;
}

let appPromise: Promise<FastifyInstance> | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const resources = await createResources();
      // ponytail: localhost default can never answer from Vercel/serverless —
      // skip the 10s wait and degrade immediately (saves cold-start budget).
      let host = "unparseable";
      try {
        host = new URL(config.DATABASE_URL).hostname || "unparseable";
      } catch {
        // keep default
      }
      const isLocalDefault = host === "localhost" || host === "127.0.0.1" || host === "::1";
      const databaseReady = isLocalDefault ? false : await waitForDatabase(resources.rawSql, 10_000);

      if (!databaseReady) {
        setDatabaseOnline(false);
        // Host only — never credentials. Tells the next reader whether the
        // URL points at localhost (copied from local .env, unreachable from
        // serverless), an SSL-requiring host with sslmode=disable, or a host
        // that is genuinely down.
        console.warn(
          `[zenkai] database not reachable at boot (host=${host}); starting degraded and reporting via /health`,
        );
      } else {
        setDatabaseOnline(true);
      }

      startPeriodicProbe(resources.rawSql, 15_000);

      return buildApp({ db: resources.db });
    })();
  }
  return appPromise;
}

// Serverless HTTP handler for Vercel
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  await app.ready();
  app.server.emit("request", req, res);
}

// In standalone environments (e.g. Docker, VM, npm start), start the listener
if (typeof require !== "undefined" && require.main === module) {
  getApp()
    .then(async (app) => {
      await app.listen({ port: config.PORT, host: config.HOST });
      console.log(`🚀 Zenkai Backend API running at http://${config.HOST}:${config.PORT}`);

      const shutdown = async (signal: string): Promise<void> => {
        app.log.info({ signal }, "shutting down");
        try {
          await app.close();
          process.exit(0);
        } catch (error) {
          console.error("[zenkai] shutdown failed:", errorMessage(error));
          process.exit(1);
        }
      };

      process.on("SIGTERM", () => void shutdown("SIGTERM"));
      process.on("SIGINT", () => void shutdown("SIGINT"));
    })
    .catch((err) => {
      console.error("[zenkai] failed to start:", errorMessage(err));
      process.exit(1);
    });
}
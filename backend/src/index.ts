import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";

import * as anilist from "./domain/anime/adapters/anilist.js";
import { buildAdapters } from "./providers/adapters.index.js";
import { healthRegistry } from "./providers/health.js";
import { resolveWithAdapters } from "./providers/registry.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });

const adapters = buildAdapters();
fastify.log.info(
  { adapters: adapters.map((a) => a.slug) },
  `source adapters registered: ${adapters.length}`,
);

// Health Check
fastify.get("/health", async () => {
  return { status: "ok", service: "zenkai-backend", timestamp: new Date().toISOString() };
});

/**
 * Which providers are enabled, and how healthy each is.
 * Useful for confirming a provider is wired up and reachable.
 */
fastify.get("/api/v1/providers", async () => ({
  adapters: adapters.map((adapter) => ({
    slug: adapter.slug,
    name: adapter.name,
    kind: adapter.kind,
    basePriority: adapter.basePriority,
  })),
  health: healthRegistry.snapshot(),
}));

/** Clear quarantined providers so they are retried. */
fastify.post("/api/v1/providers/reset", async () => ({
  cleared: healthRegistry.resetQuarantined(),
}));

/** Browse the anime catalogue via AniList. */
fastify.get<{
  Querystring: {
    page?: string;
    perPage?: string;
    season?: string;
    seasonYear?: string;
    format?: string;
    status?: string;
  };
}>("/api/v1/anime", async (request) => {
  const { page, perPage, season, seasonYear, format, status } = request.query;

  const result = await anilist.browse("ANIME", {
    page: page ? Number(page) : undefined,
    perPage: perPage ? Number(perPage) : undefined,
    season,
    seasonYear: seasonYear ? Number(seasonYear) : undefined,
    format,
    status,
  });

  return { items: result.items, page: result.page, total: result.total, hasNextPage: result.hasNextPage };
});

/** Full detail for one anime, including relations. */
fastify.get<{ Params: { id: string } }>("/api/v1/anime/:id", async (request, reply) => {
  const result = await anilist.getWithRelations({ id: Number(request.params.id), type: "ANIME" });
  if (!result) return reply.code(404).send({ error: "Not found" });
  return result;
});

/** Search across anime titles. */
fastify.get<{ Querystring: { q?: string; page?: string; perPage?: string } }>(
  "/api/v1/anime/search",
  async (request, reply) => {
    const query = request.query.q?.trim();
    if (!query) return reply.code(400).send({ error: "q is required" });

    return anilist.search(query, "ANIME", {
      page: request.query.page ? Number(request.query.page) : undefined,
      perPage: request.query.perPage ? Number(request.query.perPage) : undefined,
    });
  },
);

/** Browse the manga catalogue via AniList. */
fastify.get<{ Querystring: { page?: string; perPage?: string } }>(
  "/api/v1/manga",
  async (request) =>
    anilist.browse("MANGA", {
      page: request.query.page ? Number(request.query.page) : undefined,
      perPage: request.query.perPage ? Number(request.query.perPage) : undefined,
    }),
);

/**
 * Resolve playable sources for an episode.
 *
 * Runs every enabled adapter in parallel, records each outcome against provider
 * health, and returns the candidates ranked best-first.
 */
fastify.get<{
  Params: { animeId: string };
  Querystring: { episode?: string; language?: string; anilistId?: string; malId?: string; tmdbId?: string };
}>("/api/v1/anime/:animeId/sources", async (request, reply) => {
  const started = Date.now();
  const { animeId } = request.params;
  const { episode = "1", language = "sub", anilistId, malId, tmdbId } = request.query;

  const episodeNumber = Number(episode);
  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) {
    return reply.code(400).send({ error: "episode must be a positive number" });
  }

  const externalIds: Record<string, string> = {};
  if (anilistId ?? animeId) externalIds.anilist = anilistId ?? animeId;
  if (malId) externalIds.mal = malId;
  if (tmdbId) externalIds.tmdb = tmdbId;

  const outcome = await resolveWithAdapters(adapters, {
    animeId,
    episodeNumber,
    language: language as "sub" | "dub" | "multi",
    externalIds,
  });

  return {
    animeId,
    episodeNumber,
    language,
    sources: outcome.sources,
    attempts: outcome.attempts,
    resolutionTimeMs: Date.now() - started,
  };
});


const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 Zenkai Backend API running at http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

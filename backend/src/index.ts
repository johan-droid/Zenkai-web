import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { HybridProviderResolver, type EndpointConfig } from "./providers/resolver.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

const resolver = new HybridProviderResolver();

// Seeded in-memory provider endpoints fallback for API readiness
const SEED_ENDPOINTS: EndpointConfig[] = [
  {
    id: "ep-1",
    providerSlug: "anikoto",
    providerName: "Anikoto",
    endpointSlug: "sub",
    displayName: "Anikoto Direct HD",
    language: "sub",
    accessType: "direct",
    badge: "Direct HD",
    urlTemplate: "https://vidsrc.me/embed/anime?anilist={anilist_id}&episode={episode}",
    requiredIdType: "anilist",
    priority: 1,
  },
  {
    id: "ep-2",
    providerSlug: "megaplay",
    providerName: "Megaplay",
    endpointSlug: "sub",
    displayName: "Megaplay Embed",
    language: "sub",
    accessType: "embed",
    badge: "Fast Embed",
    urlTemplate: "https://player.smashy.stream/anime/{mal_id}?ep={episode}",
    requiredIdType: "mal",
    priority: 2,
  },
  {
    id: "ep-3",
    providerSlug: "vidnest",
    providerName: "Vidnest",
    endpointSlug: "dub",
    displayName: "Vidnest Dub",
    language: "dub",
    accessType: "direct",
    badge: "Dub HD",
    urlTemplate: "https://vidsrc.me/embed/anime?anilist={anilist_id}&episode={episode}&dub=1",
    requiredIdType: "anilist",
    priority: 3,
  },
];

// Health Check
fastify.get("/health", async () => {
  return { status: "ok", service: "zenkai-backend", timestamp: new Date().toISOString() };
});

// Decoupled Playback Sources Endpoint
fastify.get<{
  Params: { episodeId: string };
  Querystring: { anilistId?: string; malId?: string; tmdbId?: string; episodeNumber?: string; language?: string };
}>("/api/v1/episodes/:episodeId/sources", async (request, reply) => {
  const startTime = Date.now();
  const { episodeId } = request.params;
  const { anilistId, malId, tmdbId, episodeNumber = "1", language = "sub" } = request.query;

  const externalIds: Record<string, string> = {};
  if (anilistId) externalIds.anilist = anilistId;
  if (malId) externalIds.mal = malId;
  if (tmdbId) externalIds.tmdb = tmdbId;

  // Fallback to episodeId if anilistId is passed as episodeId or query
  if (!externalIds.anilist && !externalIds.mal) {
    externalIds.anilist = episodeId.split("-")[0] || episodeId;
  }

  const sources = await resolver.resolveSources(
    {
      animeId: episodeId,
      episodeNumber: Number(episodeNumber),
      language: language as "sub" | "dub" | "multi",
      externalIds,
    },
    SEED_ENDPOINTS
  );

  return reply.send({
    episodeId,
    animeId: externalIds.anilist || episodeId,
    episodeNumber: Number(episodeNumber),
    sources,
    resolutionTimeMs: Date.now() - startTime,
  });
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

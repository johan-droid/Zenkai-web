/**
 * Provider registry (P5/P7).
 *
 * Decides which providers exist for a request. This is the only place that
 * inspects capabilities, which is what keeps the "no `if provider ==`" rule
 * enforceable: a route asks for "HLS sub sources" and the registry works out
 * who can serve them.
 *
 * Adapters stay inert unless configured. Nothing scraper-shaped is enabled by
 * default, so a fresh deployment only exposes licensed/self-hosted endpoints.
 */

import { eq, and, asc } from "drizzle-orm";
import { config } from "../../config/index.js";
import { providers as providersTable, providerEndpoints } from "../../db/schema/providers.js";
import type { Db } from "../../db/client.js";
import { ConsumetProvider } from "./consumet.provider.js";
import { healthRegistry } from "./health.js";
import { InProcessProvider } from "./inprocess.provider.js";
import { TemplateProvider, type TemplateEndpoint } from "./template.provider.js";
import type { AudioTrack, StreamingProvider } from "./types.js";

/**
 * Licensed and self-hosted endpoints.
 *
 * `self-hosted` expects HLS files served from your own infrastructure under
 * `/media/{anilist_id}/{episode}.m3u8`, which is the one pattern here that is
 * unambiguously yours to serve.
 */
export const TEMPLATE_ENDPOINTS: TemplateEndpoint[] = [
  {
    id: "self-hosted",
    providerSlug: "self-hosted",
    providerName: "Self-hosted library",
    endpointSlug: "sub",
    displayName: "Self-hosted",
    language: "sub",
    accessType: "hls",
    badge: "Self-hosted",
    urlTemplate: "/media/{anilist}/episode-{episode}.m3u8",
    requiredIdType: "anilist",
    priority: 1,
  },
];

/** Public demo streams, useful for exercising the player end to end. */
export const DEMO_ENDPOINTS: TemplateEndpoint[] = [
  {
    id: "demo-hls-a",
    providerSlug: "demo-hls-a",
    providerName: "Demo HLS (test stream)",
    endpointSlug: "sub",
    displayName: "Demo HLS",
    language: "sub",
    accessType: "hls",
    badge: "Test stream",
    urlTemplate: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    requiredIdType: "anilist",
    priority: 50,
  },
  {
    id: "demo-hls-b",
    providerSlug: "demo-hls-b",
    providerName: "Demo HLS (alt)",
    endpointSlug: "sub",
    displayName: "Demo HLS alt",
    language: "sub",
    accessType: "hls",
    badge: "Test stream",
    urlTemplate: "https://test-streams.mux.dev/pts_shift/master.m3u8",
    requiredIdType: "anilist",
    priority: 51,
  },
];

/**
 * In-process scraping backends.
 *
 * Off by default. Enabling one is a licensing decision, and it is also a
 * stability decision: these scrapers break often enough that they should not be
 * on the critical path of a default deployment.
 */
const INPROCESS_BACKENDS: Array<{ slug: string; name: string; priority: number }> = [
  { slug: "Hianime", name: "Hianime (in-process)", priority: 20 },
  { slug: "AnimePahe", name: "AnimePahe (in-process)", priority: 25 },
];

/** Build the adapter list from configuration. */
export function buildProviders(): StreamingProvider[] {
  const providers: StreamingProvider[] = [];

  for (const endpoint of TEMPLATE_ENDPOINTS) {
    providers.push(
      new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint),
    );
  }

  // In-process scrapers are the primary path: they remove a network hop and a
  // service to operate. The remote Consumet instance is kept as a fallback
  // for when a scraper breaks — the two are additive, not mutually exclusive.
  if (config.CONSUMET_INPROCESS) {
    for (const backend of INPROCESS_BACKENDS) {
      providers.push(new InProcessProvider(backend.slug, backend.name, backend.priority));
    }
  }

  if (config.CONSUMET_URL) {
    providers.push(new ConsumetProvider());
  }

  return providers;
}

/** Include the public demo streams. Off by default. */
export function buildProvidersWithDemos(): StreamingProvider[] {
  const providers = buildProviders();
  for (const endpoint of DEMO_ENDPOINTS) {
    providers.push(
      new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint),
    );
  }
  return providers;
}

/**
 * Load provider and endpoint definitions from the database registry (P5/P19).
 *
 * If the database tables are populated, runtime authority is driven by PostgreSQL:
 * priorities, active statuses, urlTemplates, and endpoint mappings.
 * Degrades safely to static defaults if the database is unpopulated or unreachable.
 */
export async function loadProvidersFromDb(db?: Db): Promise<StreamingProvider[]> {
  if (!db) {
    return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
  }

  try {
    const dbProviders = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.active, true))
      .orderBy(asc(providersTable.priority));

    if (!dbProviders || dbProviders.length === 0) {
      return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
    }

    const loaded: StreamingProvider[] = [];

    for (const p of dbProviders) {
      const endpoints = await db
        .select()
        .from(providerEndpoints)
        .where(and(eq(providerEndpoints.providerId, p.id), eq(providerEndpoints.active, true)))
        .orderBy(asc(providerEndpoints.priority));

      for (const ep of endpoints) {
        if (ep.urlTemplate) {
          loaded.push(
            new TemplateProvider(p.slug, p.name, ep.priority ?? p.priority, {
              id: `${p.slug}-${ep.slug}`,
              providerSlug: p.slug,
              providerName: p.name,
              endpointSlug: ep.slug,
              displayName: ep.displayName,
              language: (ep.language as AudioTrack) ?? "sub",
              accessType: (ep.accessType as any) ?? "hls",
              badge: ep.badge ?? p.name,
              urlTemplate: ep.urlTemplate,
              requiredIdType: (ep.requiredIdType as any) ?? "anilist",
              priority: ep.priority ?? p.priority,
              maxResolution: ep.maxResolution ?? undefined,
            }),
          );
        }
      }

      if (p.isCustomAdapter && p.slug === "Hianime" && config.CONSUMET_INPROCESS) {
        loaded.push(new InProcessProvider("Hianime", p.name, p.priority));
      } else if (p.isCustomAdapter && p.slug === "AnimePahe" && config.CONSUMET_INPROCESS) {
        loaded.push(new InProcessProvider("AnimePahe", p.name, p.priority));
      }
    }

    if (config.ENABLE_DEMO_STREAMS) {
      for (const endpoint of DEMO_ENDPOINTS) {
        loaded.push(
          new TemplateProvider(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint),
        );
      }
    }

    return loaded.length > 0 ? loaded : (config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders());
  } catch {
    return config.ENABLE_DEMO_STREAMS ? buildProvidersWithDemos() : buildProviders();
  }
}

/**
 * Providers that can serve this request.
 *
 * Filters on declared capability and skips quarantined providers. Skipping here
 * rather than after the call is what keeps a dead provider off the critical path
 * of every play request.
 *
 * Sorting is by health score first, then base priority. A provider that is
 * degraded but not yet quarantined is deprioritized below a healthy one with
 * the same base priority, so the resolver tries the most reliable provider first.
 */
export function eligibleProviders(
  providers: StreamingProvider[],
  requirements: { language: AudioTrack; needsMalId: boolean },
): StreamingProvider[] {
  return providers
    .filter((provider) => {
      if (!provider.enabled) return false;
      if (healthRegistry.isQuarantined(provider.slug)) return false;
      if (requirements.needsMalId && !provider.capabilities.requiresMalId) return false;
      return provider.capabilities.languages.includes(requirements.language);
    })
    .sort((a, b) => {
      const healthA = healthRegistry.get(a.slug).score;
      const healthB = healthRegistry.get(b.slug).score;
      if (healthA !== healthB) return healthB - healthA;
      return a.basePriority - b.basePriority;
    });
}

/** Providers that expose subtitles, used by the P10 enrichment path. */
export function subtitleCapableProviders(
  providers: StreamingProvider[],
): StreamingProvider[] {
  return providers.filter((provider) => provider.capabilities.supportsSubtitles);
}

/** Providers that expose skip markers. */
export function skipCapableProviders(providers: StreamingProvider[]): StreamingProvider[] {
  return providers.filter(
    (provider) => provider.capabilities.supportsSkipMarkers && provider.getSkipMarkers,
  );
}
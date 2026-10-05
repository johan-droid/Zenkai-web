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

import { config } from "../../config/index.js";
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
 * Providers that can serve this request.
 *
 * Filters on declared capability and skips quarantined providers. Skipping here
 * rather than after the call is what keeps a dead provider off the critical path
 * of every play request.
 */
export function eligibleProviders(
  providers: StreamingProvider[],
  requirements: { language: AudioTrack; needsMalId: boolean },
): StreamingProvider[] {
  return providers
    .filter((provider) => {
      if (healthRegistry.isQuarantined(provider.slug, provider.slug)) return false;
      if (requirements.needsMalId && !provider.capabilities.requiresMalId) return false;
      return provider.capabilities.languages.includes(requirements.language);
    })
    .sort((a, b) => a.basePriority - b.basePriority);
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
/**
 * The registered adapter set.
 *
 * Nothing scraper-shaped is enabled by default: entries stay inert until a base
 * URL is configured in the environment. That keeps a default deployment to
 * licensed/self-hosted templates only, and makes it an explicit choice to
 * attach a scraper.
 */

import type { SourceAdapter } from "../domain/source.types.js";
import { ConsumetAdapter } from "./consumet.adapter.js";
import { ScrapeAdapter, type ScrapeProviderConfig } from "./scrape.adapter.js";
import { TemplateAdapter, type TemplateEndpoint } from "./template.adapter.js";

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
 * Scraping providers, disabled unless configured.
 *
 * These target sites that host unlicensed copies; enabling one is a licensing
 * decision for the operator. Set the matching env var to turn one on.
 */
export const SCRAPE_PROVIDERS: (ScrapeProviderConfig & { envVar: string })[] = [
  {
    envVar: "MIRURO_URL",
    slug: "miruro",
    name: "Miruro",
    baseUrl: process.env.MIRURO_URL ?? "",
    watchPath: "/anime/watch/{anilist}?episode={episode}",
    language: "sub",
    accessType: "direct",
    priority: 20,
  },
  {
    envVar: "ANIPUB_URL",
    slug: "anipub",
    name: "AniPub",
    baseUrl: process.env.ANIPUB_URL ?? "",
    watchPath: "/watch/{mal}/{episode}",
    language: "sub",
    accessType: "direct",
    priority: 30,
  },
];

/** Build the adapter list from configuration. */
export function buildAdapters(): SourceAdapter[] {
  const adapters: SourceAdapter[] = [];

  for (const endpoint of TEMPLATE_ENDPOINTS) {
    adapters.push(
      new TemplateAdapter(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint),
    );
  }

  const consumet = new ConsumetAdapter();
  if (consumet.enabled) adapters.push(consumet);

  for (const provider of SCRAPE_PROVIDERS) {
    if (!provider.baseUrl) continue;
    adapters.push(
      new ScrapeAdapter(provider.slug, provider.name, provider.priority ?? 30, provider),
    );
  }

  return adapters;
}

/** Include the public demo streams. Off by default in production. */
export function buildAdaptersWithDemos(): SourceAdapter[] {
  const adapters = buildAdapters();
  for (const endpoint of DEMO_ENDPOINTS) {
    adapters.push(
      new TemplateAdapter(endpoint.providerSlug, endpoint.providerName, endpoint.priority, endpoint),
    );
  }
  return adapters;
}

/**
 * URL-template adapter.
 *
 * The simplest adapter: fill a template from the title's external ids. No
 * upstream call, so it is fast and cannot be rate limited, but it only works
 * where the provider derives its URL from an id it shares with us.
 *
 * The dead `vidsrc.me` / `smashy.stream` entries the backend shipped with were
 * exactly this shape, and both domains no longer resolve, which is why template
 * adapters still need health tracking rather than being assumed reliable.
 */

import type { AdapterContext, PlaybackSource, SourceAdapter } from "../domain/source.types.js";
import { evaluateUrlTemplate } from "./template.resolver.js";

export interface TemplateEndpoint {
  id: string;
  providerSlug: string;
  providerName: string;
  endpointSlug: string;
  displayName: string;
  language: string;
  accessType: string;
  badge: string | null;
  urlTemplate: string | null;
  /** Which external id the template needs, e.g. "anilist" or "mal". */
  requiredIdType: string;
  priority: number;
}

export class TemplateAdapter implements SourceAdapter {
  readonly kind = "template" as const;

  constructor(
    readonly slug: string,
    readonly name: string,
    readonly basePriority: number,
    private readonly endpoint: TemplateEndpoint,
  ) {}

  async resolve(context: AdapterContext): Promise<PlaybackSource[]> {
    const { endpoint } = this;

    // Skip entirely when the id this endpoint needs is not available, rather
    // than producing a URL with an unfilled placeholder.
    if (!context.externalIds[endpoint.requiredIdType]) return [];

    const playbackUrl = evaluateUrlTemplate(endpoint.urlTemplate ?? "", {
      episode: context.episodeNumber,
      externalIds: context.externalIds,
    });
    if (!playbackUrl) return [];

    return [
      {
        id: `${endpoint.providerSlug}-${endpoint.endpointSlug}-${context.episodeNumber}`,
        providerSlug: endpoint.providerSlug,
        providerName: endpoint.providerName,
        endpointSlug: endpoint.endpointSlug,
        badge: endpoint.badge ?? endpoint.displayName,
        language: (endpoint.language as PlaybackSource["language"]) ?? "sub",
        accessType: (endpoint.accessType as PlaybackSource["accessType"]) ?? "direct",
        playbackUrl,
        priority: endpoint.priority,
      },
    ];
  }
}

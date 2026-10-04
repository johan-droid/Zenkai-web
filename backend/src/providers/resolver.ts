import { evaluateUrlTemplate } from "./template.resolver.js";
import type { PlaybackSource, ResolveInput, PlaybackAccessType, AudioTrackLanguage } from "../domain/source.types.js";

export interface EndpointConfig {
  id: string;
  providerSlug: string;
  providerName: string;
  endpointSlug: string;
  displayName: string;
  language: string;
  accessType: string;
  badge: string | null;
  urlTemplate: string | null;
  requiredIdType: string;
  priority: number;
  isCustomAdapter?: boolean;
}

export class HybridProviderResolver {
  async resolveSources(
    input: ResolveInput,
    endpoints: EndpointConfig[]
  ): Promise<PlaybackSource[]> {
    const sources: PlaybackSource[] = [];

    for (const endpoint of endpoints) {
      // Filter by language preference if provided
      if (input.language && endpoint.language !== input.language && endpoint.language !== "multi") {
        continue;
      }

      if (endpoint.isCustomAdapter) {
        // Option C Escape Hatch for custom adapter execution
        const customSource = await this.resolveCustomAdapter(input, endpoint);
        if (customSource) sources.push(customSource);
      } else if (endpoint.urlTemplate) {
        // Generic template evaluation
        const evaluatedUrl = evaluateUrlTemplate(endpoint.urlTemplate, {
          episode: input.episodeNumber,
          externalIds: input.externalIds,
        });

        if (evaluatedUrl) {
          sources.push({
            id: `${endpoint.providerSlug}-${endpoint.endpointSlug}-${input.episodeNumber}`,
            providerSlug: endpoint.providerSlug,
            providerName: endpoint.providerName,
            endpointSlug: endpoint.endpointSlug,
            badge: endpoint.badge ?? endpoint.displayName,
            language: (endpoint.language as AudioTrackLanguage) ?? "sub",
            accessType: (endpoint.accessType as PlaybackAccessType) ?? "direct",
            playbackUrl: evaluatedUrl,
            priority: endpoint.priority,
          });
        }
      }
    }

    // Sort by priority ascending (lower priority number = preferred)
    return sources.sort((a, b) => a.priority - b.priority);
  }

  private async resolveCustomAdapter(
    input: ResolveInput,
    endpoint: EndpointConfig
  ): Promise<PlaybackSource | null> {
    // Custom adapters can perform HTTP requests or decryption here if needed
    return null;
  }
}

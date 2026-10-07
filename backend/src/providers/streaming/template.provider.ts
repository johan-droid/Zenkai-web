/**
 * Self-hosted and template playback providers (P5).
 *
 * A template provider fills a predictable URL from an id. It is the cheapest
 * adapter to run and the only one that is unambiguously safe to enable by
 * default, because the operator controls the host: the pattern here is
 * `/media/{anilist}/{episode}.m3u8` on infrastructure you control.
 *
 * It also serves as the reference implementation of the `StreamingProvider`
 * contract, including the rule that a missing episode returns an empty array
 * rather than throwing.
 */

import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import { AppError } from "../../http/errors.js";
import { parseResolution } from "./ranking.js";
import type {
  AudioTrack,
  PlaybackSource,
  ProviderCapabilities,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

export interface TemplateEndpoint {
  id: string;
  providerSlug: string;
  providerName: string;
  endpointSlug: string;
  displayName: string;
  language: AudioTrack;
  accessType: "hls" | "mp4" | "direct";
  badge: string;
  /** Placeholders: {anilist}, {mal}, {tmdb}, {episode}. */
  urlTemplate: string;
  requiredIdType: "anilist" | "mal" | "tmdb";
  priority: number;
  /** Known ceiling, used to pre-rank without probing. */
  maxResolution?: number;
}

/** Fill `{anilist}`/`{mal}`/`{episode}` placeholders in a URL template. */
export function renderTemplate(
  template: string,
  request: ResolveRequest,
  requiredIdType: TemplateEndpoint["requiredIdType"],
): string | null {
  const availableId = { anilist: request.anilistId, mal: request.malId, tmdb: undefined }[
    requiredIdType
  ];

  // Without the id this endpoint needs, the honest answer is "cannot serve".
  if (!availableId) return null;

  const rendered = template
    .replace(/\{anilist\}/g, request.anilistId)
    .replace(/\{mal\}/g, request.malId ?? "")
    .replace(/\{tmdb\}/g, "")
    .replace(/\{episode\}/g, String(request.episodeNumber));

  if (rendered.startsWith("http://") || rendered.startsWith("https://")) {
    return rendered;
  }

  const base =
    config.SELF_HOSTED_BASE_URL ??
    `http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}`;
  try {
    return new URL(rendered, base).toString();
  } catch {
    return rendered;
  }
}

export class TemplateProvider implements StreamingProvider {
  readonly kind = "template" as const;
  readonly version = "1.0.0";
  enabled = true;
  readonly capabilities: ProviderCapabilities;

  constructor(
    readonly slug: string,
    readonly name: string,
    readonly basePriority: number,
    private readonly endpoint: TemplateEndpoint,
  ) {
    this.capabilities = {
      languages: [endpoint.language],
      accessTypes: [endpoint.accessType],
      // A self-hosted HLS library is under our control, so markers and subtitle
      // sidecars can be published alongside it.
      supportsSubtitles: true,
      supportsSkipMarkers: true,
      maxResolution: endpoint.maxResolution,
      requiresMalId: endpoint.requiredIdType === "mal",
    };
  }

  async resolve(request: ResolveRequest): Promise<PlaybackSource[]> {
    const url = renderTemplate(this.endpoint.urlTemplate, request, this.endpoint.requiredIdType);
    // A missing id means this endpoint cannot serve the request. That is an
    // empty result, not an error: the resolver should try the next provider.
    if (!url) return [];

    return [
      {
        id: `${this.slug}:${this.endpoint.endpointSlug}:${request.episodeNumber}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: this.endpoint.endpointSlug,
        accessType: this.endpoint.accessType,
        playbackUrl: url,
        quality: this.endpoint.maxResolution ? `${this.endpoint.maxResolution}p` : undefined,
        resolution: this.endpoint.maxResolution,
        language: this.endpoint.language,
        priority: this.endpoint.priority,
      },
    ];
  }

  async healthCheck(): Promise<boolean> {
    if (!config.SELF_HOSTED_BASE_URL) return true;
    try {
      // A HEAD against the base is enough to tell "serving" from "not serving"
      // without pulling a manifest.
      await fetchJson(`${config.SELF_HOSTED_BASE_URL}/health`, {
        timeoutMs: 2000,
        retries: 0,
      }).catch((error: unknown) => {
        // A 404 still proves the host is reachable and answering.
        if (error instanceof AppError && error.details && (error.details as any).status === 404) {
          return;
        }
        throw error;
      });
      return true;
    } catch {
      return false;
    }
  }
}
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
  accessType: "hls" | "mp4" | "direct" | "embed";
  badge: string;
  /** Placeholders: {anilist}, {anilist_id}, {mal}, {mal_id}, {tmdb}, {tmdb_id}, {id}, {episode}, {ep}, {e}, {slug}, {lang}. */
  urlTemplate: string;
  requiredIdType: "anilist" | "mal" | "tmdb" | "slug" | "none";
  priority: number;
  /** Known ceiling, used to pre-rank without probing. */
  maxResolution?: number;
}

function slugifyTitle(title?: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Fill `{anilist_id}`/`{mal_id}`/`{tmdb_id}`/`{episode}`/`{slug}` placeholders in a URL template. */
export function renderTemplate(
  template: string,
  request: ResolveRequest,
  requiredIdType: TemplateEndpoint["requiredIdType"],
): string | null {
  const anilistId = request.anilistId || request.externalIds?.anilist;
  const malId = request.malId || request.externalIds?.mal;
  const tmdbId = request.externalIds?.tmdb;
  const slug = slugifyTitle(request.animeTitle);

  // Check required ID constraint if configured
  if (requiredIdType === "anilist" && !anilistId) return null;
  if (requiredIdType === "mal" && !malId) return null;
  if (requiredIdType === "tmdb" && !tmdbId) return null;
  if (requiredIdType === "slug" && !slug) return null;

  // If template references specific ID tokens, verify they are available
  if (/\{(?:tmdb_id|tmdb)\}/i.test(template) && !tmdbId) return null;
  if (/\{(?:mal_id|mal)\}/i.test(template) && !malId) return null;
  if (/\{(?:anilist_id|anilist)\}/i.test(template) && !anilistId) return null;

  // A template without an episode placeholder cannot serve a specific episode
  if (!/\{(?:episode|ep|e)\}/i.test(template)) return null;

  const rendered = template
    .replace(/\{anilist_id\}/gi, anilistId ?? "")
    .replace(/\{anilist\}/gi, anilistId ?? "")
    .replace(/\{mal_id\}/gi, malId ?? "")
    .replace(/\{mal\}/gi, malId ?? "")
    .replace(/\{tmdb_id\}/gi, tmdbId ?? "")
    .replace(/\{tmdb\}/gi, tmdbId ?? "")
    .replace(/\{id\}/gi, anilistId ?? malId ?? "")
    .replace(/\{episode\}/gi, String(request.episodeNumber))
    .replace(/\{ep\}/gi, String(request.episodeNumber))
    .replace(/\{e\}/gi, String(request.episodeNumber))
    .replace(/\{slug\}/gi, slug || anilistId || "")
    .replace(/\{lang\}/gi, request.language ?? "sub");

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
      supportsSubtitles: true,
      supportsSkipMarkers: true,
      maxResolution: endpoint.maxResolution,
      requiresMalId: endpoint.requiredIdType === "mal",
      requiredIdType: endpoint.requiredIdType,
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
/**
 * Streaming provider contract (P5).
 *
 * The P5 rule is that no route may branch on a provider name. Everything a
 * resolver is allowed to know about a provider therefore has to be declared
 * here as data: what it can serve, how good it is, and how to ask it.
 *
 * `capabilities` is the part that pays for itself. Without it the resolver has
 * to probe a provider to discover it cannot serve a dub, and that probe is a
 * network round trip on the critical path of every play request.
 */

export type AccessType = "hls" | "mp4" | "direct" | "embed";
export type AudioTrack = "sub" | "dub" | "multi";

export interface ProviderCapabilities {
  languages: AudioTrack[];
  accessTypes: AccessType[];
  /** True when the provider can be asked for subtitles (P10). */
  supportsSubtitles: boolean;
  /** True when the provider exposes per-episode intro/outro markers. */
  supportsSkipMarkers: boolean;
  /** Highest vertical resolution known to be served, when declared. */
  maxResolution?: number;
  /** True when the provider needs a MAL id rather than an AniList id. */
  requiresMalId: boolean;
}

export interface PlaybackSource {
  id: string;
  providerSlug: string;
  providerName: string;
  endpointSlug: string;
  accessType: AccessType;
  /** The URL handed to the player. May be a manifest, a file, or a page. */
  playbackUrl: string;
  quality?: string;
  /** Vertical resolution when known; ranking prefers higher. */
  resolution?: number;
  language: AudioTrack;
  subtitles?: Array<{ language: string; url: string; kind?: string }>;
  /** Some CDNs refuse requests without the origin Referer. */
  referer?: string;
  /** Lower wins when scores tie. */
  priority: number;
  /** Set when the source was probed successfully before being offered. */
  validated?: boolean;
}

export interface RankedSource extends PlaybackSource {
  /** Final 0-1 score; higher is better. */
  rank: number;
}

export interface ResolveRequest {
  animeId: string;
  anilistId: string;
  malId?: string;
  episodeNumber: number;
  language: AudioTrack;
  signal?: AbortSignal;
}

export interface ProviderEpisodeInfo {
  providerEpisodeId: string;
  episodeNumber: number;
  title?: string | null;
  thumbnailUrl?: string | null;
  isFiller?: boolean;
}

/**
 * What an adapter is asked for one episode.
 *
 * Implementations must not throw merely because an episode is missing; an
 * empty array lets the resolver fall through to the next provider, whereas a
 * throw marks the provider unhealthy.
 */
export interface StreamingProvider {
  readonly slug: string;
  readonly name: string;
  readonly kind: "template" | "api" | "scrape";
  /** Lower wins when health scores tie. */
  readonly basePriority: number;
  /** Semantic version of the adapter, for observability. */
  readonly version: string;
  /** Whether the provider is currently enabled. */
  enabled: boolean;
  readonly capabilities: ProviderCapabilities;

  /** Search for anime by title, returning provider-native ids. */
  search?(query: string, limit?: number): Promise<Array<{ id: string; title: string }>>;
  /** Episode list with the provider's own ids, used to build the catalog. */
  listEpisodes?(request: ResolveRequest): Promise<ProviderEpisodeInfo[]>;
  /** Playable candidates for one episode. */
  resolve(request: ResolveRequest): Promise<PlaybackSource[]>;
  /** Intro/outro markers for the player (P10). */
  getSkipMarkers?(request: ResolveRequest): Promise<{
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  } | null>;
  healthCheck(): Promise<boolean>;
}

/**
 * One recorded provider attempt.
 *
 * `outcome` distinguishes the cases the roadmap insists on separating:
 * `empty` means the provider answered and genuinely has no stream, while
 * `error`/`timeout` mean the provider is unhealthy. Collapsing these is what
 * makes "episode has zero sources" impossible to act on.
 */
export interface ProviderAttempt {
  providerSlug: string;
  outcome: "ok" | "empty" | "error" | "timeout" | "quarantined";
  count: number;
  latencyMs: number;
  error?: string;
}
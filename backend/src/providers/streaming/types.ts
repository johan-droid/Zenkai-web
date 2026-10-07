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
  /** Explicit required external id space: anilist | mal | tmdb | slug | none. */
  requiredIdType?: string;
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
  /** Custom request headers required by upstream CDN (e.g. User-Agent). */
  headers?: Record<string, string>;
  /** Lower wins when scores tie. */
  priority: number;
  /** Set when the source was probed successfully before being offered. */
  validated?: boolean;
}

export interface RankedSource extends PlaybackSource {
  /** Final 0-1 score; higher is better. */
  rank: number;
}

/**
 * How a client is expected to play a source (P6).
 *
 * This is the "how" half of the contract. `accessType` describes the *source* --
 * what the provider published -- and is provider vocabulary the client should
 * never branch on directly. `mechanism` describes the *player* and is derived
 * from it deterministically, so a route can choose an `<video>` element, an HLS
 * pipeline or an `<iframe>` without knowing which provider produced the source.
 */
export type PlaybackMechanism = "hls" | "progressive" | "iframe";

/**
 * Whether the client fetches the media itself or asks this service to relay it.
 *
 * `proxied` is never chosen for convenience: it requires the relay to be
 * explicitly enabled *and* the upstream host to be on the configured allowlist.
 * A default deployment is therefore never an open proxy.
 */
export type PlaybackDelivery = "client" | "proxied";

/**
 * Playback facts the player would like to know and the providers do not say.
 *
 * `null` means "unknown", never "no" and never a guess. P5 providers publish no
 * evidence about seeking or range support, so the gateway records the absence of
 * knowledge rather than inferring support from a file extension -- a `.mp4` that
 * a CDN will not range-request fails exactly when a player assumed it could.
 */
export interface PlaybackCapabilities {
  seekable: boolean | null;
  ranged: boolean | null;
}

/**
 * The canonical playback contract (P6).
 *
 * `PlaybackSource` answers *where* a stream is and *who* published it.
 * `PlaybackPlan` answers *how* a client should consume that one source: the
 * mechanism, the media type, the delivery path and whether it was actually
 * validated. Every field here is either copied from a canonical source or derived
 * from it by a pure rule; nothing is invented, and nothing is fetched.
 *
 * The plan is the boundary the future web player consumes. It is deliberately
 * *not* provider vocabulary: a provider swap must not require a client change.
 */
export interface PlaybackPlan {
  /** Identity of the canonical source this plan describes. */
  sourceId: string;

  /** Public provider identity: slugs, never internal database ids. */
  providerSlug: string;
  providerName: string;
  endpointSlug: string;

  /** What the provider published. Preserved verbatim, never reinterpreted. */
  access: AccessType;
  /** How a client plays it. Derived from `access` only. */
  mechanism: PlaybackMechanism;
  /**
   * Deterministic MIME type, or `null` when the access mode does not declare one.
   *
   * Never a network request: a HEAD against the upstream would cost a round trip
   * per candidate to learn something the access mode usually already says.
   */
  mediaType: string | null;

  /** The playback URL, always originating from the canonical source. */
  url: string;
  delivery: PlaybackDelivery;
  /** Present only when `delivery === "proxied"`. */
  proxyUrl?: string;

  language: AudioTrack;
  quality?: string;
  resolution?: number;

  /** Upstream referer when required by CDN. */
  referer?: string;

  /**
   * P5's explicit validation state, carried through unchanged.
   *
   * `true` means a real probe answered. The gateway never upgrades this, because
   * a syntactically valid URL nobody contacted is not a playable source.
   */
  validated: boolean;
  /**
   * The client-facing verdict: whether this plan may be presented as playable.
   *
   * Equal to `validated` today, and kept separate because the two answer
   * different questions -- "was this proven to work?" versus "may I offer it?".
   */
  playable: boolean;

  capabilities: PlaybackCapabilities;

  /**
   * Subtitle sidecars the provider attached to *this* source, copied rather than
   * shared. Absent when the source published none; never derived, never
   * translated, never synchronised.
   */
  subtitles?: Array<{ language: string; url: string; kind?: string }>;
}

export interface ResolveRequest {
  animeId: string;
  anilistId: string;
  malId?: string;
  episodeNumber: number;
  language: AudioTrack;
  signal?: AbortSignal;
  /** Canonical or romanized anime title, enabling upstream title lookup without extra AniList calls */
  animeTitle?: string;
  /** Provider-native episode external ID (from episode_external_ids table) */
  providerEpisodeId?: string;
  /** All known provider-native episode IDs for this episode */
  episodeExternalIds?: Record<string, string>;
  /** External IDs for the anime */
  externalIds?: Record<string, string>;
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
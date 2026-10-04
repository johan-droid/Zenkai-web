export type PlaybackAccessType = "direct" | "embed" | "hls" | "mp4";
export type AudioTrackLanguage = "sub" | "dub" | "multi";

export interface PlaybackSource {
  id: string;
  providerSlug: string;
  providerName: string;
  endpointSlug: string;
  badge: string;
  language: AudioTrackLanguage;
  accessType: PlaybackAccessType;
  playbackUrl: string;
  quality?: string;
  refererHeader?: string;
  subtitles?: Array<{ language: string; url: string }>;
  priority: number;
  /**
   * Vertical resolution when known, e.g. 1080. Used by ranking: higher wins.
   */
  resolution?: number;
}

export interface PlaybackResponse {
  episodeId: string;
  animeId: string;
  episodeNumber: number;
  sources: PlaybackSource[];
  resolutionTimeMs: number;
}

export interface ResolveInput {
  animeId: string;
  episodeNumber: number;
  language?: AudioTrackLanguage;
  externalIds: Record<string, string>; // e.g. { anilist: "21", mal: "5114", tmdb: "1399" }
}

/** What an adapter is given to resolve one episode. */
export interface AdapterContext extends ResolveInput {
  /** Lets an adapter honour per-request cancellation. */
  signal?: AbortSignal;
}

/**
 * A playback source adapter.
 *
 * Adapters come in two shapes:
 *  - `template` adapters fill a URL template. Cheap and stable, but only work
 *    when the URL is derivable from the title id.
 *  - `api` adapters call the provider to discover the real stream, which is
 *    required when the URL is not derivable.
 *
 * Implementations must not throw for an unavailable episode; return an empty
 * array so ranking can fall through to the next provider.
 */
export interface SourceAdapter {
  readonly slug: string;
  readonly name: string;
  readonly kind: "template" | "api";
  /** Lower wins when health scores tie. */
  readonly basePriority: number;
  resolve(context: AdapterContext): Promise<PlaybackSource[]>;
}

/**
 * Rolling health for one provider endpoint.
 *
 * Providers go down and change shape without notice, so every resolve is
 * recorded and fed back into ranking. Without this, one dead provider at the
 * top of the list blocks playback entirely.
 */
export interface ProviderHealth {
  providerSlug: string;
  endpointSlug: string;
  successStreak: number;
  failureStreak: number;
  /** Exponentially weighted success rate, 0-1. */
  score: number;
  avgLatencyMs: number;
  lastCheckedAt: number;
  lastError: string | null;
}


/** A source with its computed ranking score attached. */
export interface RankedSource extends PlaybackSource {
  /** Final 0-1 ranking score; higher is better. */
  rank: number;
}


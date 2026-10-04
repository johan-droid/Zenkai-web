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

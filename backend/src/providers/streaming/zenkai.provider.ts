/**
 * Zenkai Streaming API Provider Adapter.
 *
 * Integrates direct streaming sources (MegaPlay, Vidstream, FlixCloud, AnimeSalt)
 * from `https://zenkaii.pages.dev/api`.
 *
 * Resolves direct HLS master playlists (1080p), multi-track captions,
 * intro/outro skip markers, and AnimeSalt multi-audio iframe embeds.
 *
 * Employs automatic PoW / Captcha solving via `ZenkaiShieldManager` and timeout bounding.
 */

import { fetchJson } from "../../http/client.js";
import { zenkaiShield } from "../zenkaiShield.js";
import type {
  AudioTrack,
  AudioTrackDetail,
  PlaybackSource,
  ProviderCapabilities,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 600_000; // 10 minutes

interface ServersResponse {
  success: boolean;
  servers?: Record<string, { sub?: boolean; dub?: boolean; multi?: boolean }>;
}

interface StreamResponse {
  success: boolean;
  server?: string;
  audio?: string;
  multiAudio?: boolean;
  streamUrl?: string;
  subtitles?: Array<{ label: string; file: string; default?: boolean }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

interface AnimeSaltEmbedResponse {
  success: boolean;
  embedUrl?: string;
  error?: string;
}

interface SkipMarkerEntry {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  timestamp: number;
}

/**
 * Extracts and unescapes the raw media URL if upstream wrapped it in an external proxy URL.
 */
function unwrapProxiedUrl(rawUrl: string): { url: string; referer?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("url")) {
      const nested = parsed.searchParams.get("url")!;
      const referer = parsed.searchParams.get("referer") || undefined;
      return { url: nested, referer };
    }
  } catch {
    // If malformed, return raw
  }
  return { url: rawUrl };
}

export class ZenkaiApiStreamingProvider implements StreamingProvider {
  readonly slug = "zenkai-api";
  readonly name = "Zenkai Streaming (MegaPlay/FlixCloud/ACDN)";
  readonly kind = "api" as const;
  readonly basePriority = 12;
  readonly version = "1.0.0";
  enabled = true;

  readonly capabilities: ProviderCapabilities = {
    languages: ["sub", "dub", "multi"],
    accessTypes: ["hls", "embed"],
    supportsSubtitles: true,
    supportsSkipMarkers: true,
    maxResolution: 1080,
    requiresMalId: false,
    requiredIdType: "anilist",
  };

  readonly timeoutMs = DEFAULT_TIMEOUT_MS;

  readonly #apiBase = "https://zenkaii.pages.dev/api";
  readonly #markerCache = new Map<string, SkipMarkerEntry>();

  async resolve(req: ResolveRequest): Promise<PlaybackSource[]> {
    const anilistId =
      req.externalIds?.anilist ||
      (typeof req.animeId === "string" && /^\d+$/.test(req.animeId) ? req.animeId : null);

    if (!anilistId) {
      return [];
    }

    const episodeNum = req.episodeNumber;
    const requestedLanguage: AudioTrack = req.language || "sub";
    const sources: PlaybackSource[] = [];

    // Shield headers for upstream authorization
    const shieldHeaders = await zenkaiShield.getShieldHeaders();
    const headers: Record<string, string> = {
      ...shieldHeaders,
      "X-Zenkai-Embed": "1",
    };

    // 1. Discover available servers for this episode
    let serversData: ServersResponse | null = null;
    try {
      serversData = await fetchJson<ServersResponse>(
        `${this.#apiBase}/servers?id=${encodeURIComponent(anilistId)}&ep=${episodeNum}`,
        {
          headers,
          timeoutMs: this.timeoutMs,
          retries: 1,
        },
      );
    } catch {
      return [];
    }

    if (!serversData?.success || !serversData.servers) {
      return [];
    }

    const availableServers = serversData.servers;

    // Server priority ordering: megaplay > vidstream > flixcloud > acdn
    const serverOrder = ["megaplay", "vidstream", "flixcloud", "acdn"];

    for (const serverKey of serverOrder) {
      const serverCaps = availableServers[serverKey];
      if (!serverCaps) continue;

      // Determine target audio modes to probe
      const modesToTry: AudioTrack[] = [];
      if (requestedLanguage === "multi") {
        if (serverCaps.multi) modesToTry.push("multi");
        if (serverCaps.sub) modesToTry.push("sub");
        if (serverCaps.dub) modesToTry.push("dub");
      } else if (requestedLanguage === "dub" && serverCaps.dub) {
        modesToTry.push("dub");
      } else if (serverCaps.sub) {
        modesToTry.push("sub");
      }

      for (const mode of modesToTry) {
        try {
          const streamData = await fetchJson<StreamResponse>(
            `${this.#apiBase}/stream?id=${encodeURIComponent(anilistId)}&ep=${episodeNum}&server=${serverKey}&audio=${mode}`,
            {
              headers,
              timeoutMs: this.timeoutMs,
              retries: 1,
            },
          );

          if (streamData?.success && streamData.streamUrl) {
            const { url: directUrl, referer } = unwrapProxiedUrl(streamData.streamUrl);

            // Subtitle tracks
            const subtitles = (streamData.subtitles || []).map((sub) => {
              const { url: subUrl } = unwrapProxiedUrl(sub.file);
              return {
                language: sub.label,
                url: subUrl,
                kind: "subtitles",
              };
            });

            // Store skip markers if present
            if (streamData.intro || streamData.outro) {
              const markerKey = `${anilistId}:${episodeNum}`;
              this.#markerCache.set(markerKey, {
                intro: streamData.intro ?? undefined,
                outro: streamData.outro ?? undefined,
                timestamp: Date.now(),
              });
            }

            // Audio track details
            const audioTracks: AudioTrackDetail[] = [];
            if (mode === "dub") {
              audioTracks.push({
                code: "en",
                name: "English",
                type: "dub",
                isDefault: true,
              });
            } else if (mode === "multi") {
              audioTracks.push(
                { code: "ja", name: "Japanese", type: "sub", isDefault: true },
                { code: "en", name: "English", type: "dub", isDefault: false },
              );
            } else {
              audioTracks.push({
                code: "ja",
                name: "Japanese",
                type: "sub",
                isDefault: true,
              });
            }

            const defaultReferer =
              referer ||
              (serverKey === "megaplay"
                ? "https://megaplay.buzz/"
                : serverKey === "flixcloud"
                  ? "https://flixcloud.cc/"
                  : undefined);

            sources.push({
              id: `zenkai-${serverKey}-${mode}-${episodeNum}`,
              providerSlug: this.slug,
              providerName: `Zenkai ${streamData.server || serverKey.toUpperCase()}`,
              endpointSlug: `${serverKey}-${mode}`,
              accessType: "hls",
              playbackUrl: directUrl,
              resolution: 1080,
              quality: "1080p",
              language: mode,
              audioTracks,
              subtitles,
              referer: defaultReferer,
              priority: this.basePriority + (serverKey === "megaplay" ? 0 : 2),
              validated: true,
            });
          }
        } catch {
          // Continue to next candidate
        }
      }
    }

    // Check AnimeSalt embed for multi-audio fallback
    if (requestedLanguage === "multi" || sources.length === 0) {
      try {
        const saltData = await fetchJson<AnimeSaltEmbedResponse>(
          `${this.#apiBase}/embed/animesalt?id=${encodeURIComponent(anilistId)}&ep=${episodeNum}&server=megaplay&audio=multi`,
          {
            headers,
            timeoutMs: this.timeoutMs,
            retries: 1,
          },
        );

        if (saltData?.success && saltData.embedUrl) {
          sources.push({
            id: `zenkai-animesalt-multi-${episodeNum}`,
            providerSlug: this.slug,
            providerName: "AnimeSalt Multi-Audio (Embed)",
            endpointSlug: "animesalt-multi",
            accessType: "embed",
            playbackUrl: saltData.embedUrl,
            language: "multi",
            audioTracks: [
              { code: "ja", name: "Japanese", type: "sub", isDefault: true },
              { code: "en", name: "English", type: "dub", isDefault: false },
              { code: "hi", name: "Hindi", type: "dub", isDefault: false },
            ],
            priority: this.basePriority + 4,
            validated: true,
          });
        }
      } catch {
        // Embed optional fallback
      }
    }

    return sources;
  }

  async getSkipMarkers(
    req: ResolveRequest,
  ): Promise<{ intro?: { start: number; end: number }; outro?: { start: number; end: number } } | null> {
    const anilistId =
      req.externalIds?.anilist ||
      (typeof req.animeId === "string" && /^\d+$/.test(req.animeId) ? req.animeId : null);

    if (!anilistId) return null;

    const markerKey = `${anilistId}:${req.episodeNumber}`;
    const cached = this.#markerCache.get(markerKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { intro: cached.intro, outro: cached.outro };
    }

    // Try resolving sources to populate marker cache if not yet resolved
    try {
      await this.resolve(req);
      const freshlyCached = this.#markerCache.get(markerKey);
      if (freshlyCached) {
        return { intro: freshlyCached.intro, outro: freshlyCached.outro };
      }
    } catch {
      // Return null on failure
    }

    return null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.#apiBase}`, {
        headers: { "X-Zenkai-Embed": "1" },
        signal: AbortSignal.timeout(4000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

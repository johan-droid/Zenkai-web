/**
 * NovusCloud / 4animo streaming provider.
 *
 * Direct stream extractor and embed provider. Extracts native HLS master
 * playlists, multi-track captions, and intro/outro skip markers directly from
 * canonical AniList IDs using the HD-2 player endpoint (`cdn.4animo.xyz`).
 *
 * If extraction fails or the upstream payload structure shifts, automatically
 * falls back to ready-to-frame embed iframe targets so video playback never dead-ends.
 */

import { config } from "../../config/index.js";
import type {
  AudioTrack,
  PlaybackSource,
  ProviderCapabilities,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 600_000; // 10 minutes

interface CacheEntry {
  sources: PlaybackSource[];
  timestamp: number;
}

interface SkipMarkerEntry {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  timestamp: number;
}

export class NovusCloudProvider implements StreamingProvider {
  readonly slug: string = "novuscloud";
  readonly name: string = "NovusCloud (HD-2)";
  readonly kind = "scrape" as const;
  readonly basePriority: number = 10;
  readonly version = "1.0.0";
  enabled = true;

  readonly capabilities: ProviderCapabilities = {
    languages: ["sub", "dub"],
    accessTypes: ["hls", "embed"],
    supportsSubtitles: true,
    supportsSkipMarkers: true,
    requiresMalId: false,
    requiredIdType: "anilist",
  };

  readonly timeoutMs = DEFAULT_TIMEOUT_MS;

  readonly #sourceCache = new Map<string, CacheEntry>();
  readonly #markerCache = new Map<string, SkipMarkerEntry>();

  constructor(
    customSlug?: string,
    customName?: string,
    customPriority?: number,
    private readonly baseUrl: string = config.NOVUS_BASE_URL ?? "https://cdn.4animo.xyz",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (customSlug) this.slug = customSlug;
    if (customName) this.name = customName;
    if (customPriority !== undefined) this.basePriority = customPriority;
  }

  get isEnabled(): boolean {
    return config.NOVUS_ENABLED ?? true;
  }

  async resolve(request: ResolveRequest): Promise<PlaybackSource[]> {
    if (!this.enabled || !this.isEnabled) return [];

    const anilistId = request.anilistId;
    if (!anilistId) return [];

    const episodeNumber = request.episodeNumber;
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return [];

    const requestedLanguages: AudioTrack[] =
      request.language === "multi" ? ["sub", "dub"] : [request.language];

    const results: PlaybackSource[] = [];

    for (const lang of requestedLanguages) {
      const sources = await this.#resolveForLanguage(anilistId, episodeNumber, lang, request.signal);
      results.push(...sources);
    }

    return results;
  }

  async getSkipMarkers(request: ResolveRequest): Promise<{
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  } | null> {
    const anilistId = request.anilistId;
    if (!anilistId) return null;

    const markerKey = `${anilistId}:${request.episodeNumber}`;
    const cached = this.#markerCache.get(markerKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (cached.intro || cached.outro) {
        return { intro: cached.intro, outro: cached.outro };
      }
      return null;
    }

    // Trigger resolve to populate markers if not yet cached
    await this.resolve(request).catch(() => []);

    const updated = this.#markerCache.get(markerKey);
    if (updated && (updated.intro || updated.outro)) {
      return { intro: updated.intro, outro: updated.outro };
    }

    return null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/`, {
          method: "HEAD",
          headers: { "User-Agent": DEFAULT_UA },
          signal: controller.signal,
        });
        return response.status < 500;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async #resolveForLanguage(
    anilistId: string,
    episodeNumber: number,
    language: AudioTrack,
    parentSignal?: AbortSignal,
  ): Promise<PlaybackSource[]> {
    const cacheKey = `${anilistId}:${episodeNumber}:${language}`;
    const cached = this.#sourceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.sources;
    }

    const embedUrl = `${this.baseUrl}/embed/hd-2/ani/${anilistId}/${episodeNumber}/${language}?k=1`;
    const embedFallbackSource: PlaybackSource = {
      id: `${this.slug}-${language}-${anilistId}-${episodeNumber}-embed`,
      providerSlug: this.slug,
      providerName: this.name,
      endpointSlug: `${language}-embed`,
      accessType: "embed",
      playbackUrl: embedUrl,
      language,
      priority: this.basePriority + 15,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timer);
        return [];
      }
      parentSignal.addEventListener("abort", onParentAbort);
    }

    try {
      const embedResponse = await this.fetchImpl(embedUrl, {
        headers: { "User-Agent": DEFAULT_UA },
        signal: controller.signal,
      });

      if (embedResponse.status === 404) {
        return [];
      }

      if (!embedResponse.ok) {
        return [embedFallbackSource];
      }

      const html = await embedResponse.text();
      const sourcesMatch =
        html.match(/var\s+sourcesUrl\s*=\s*['"]([^'"]+)['"]/i) ??
        html.match(/sourcesUrl\s*:\s*['"]([^'"]+)['"]/i);

      if (!sourcesMatch || !sourcesMatch[1]) {
        return [embedFallbackSource];
      }

      const sourcesRelPath = sourcesMatch[1];
      const sourcesFullUrl = sourcesRelPath.startsWith("http")
        ? sourcesRelPath
        : `${this.baseUrl}${sourcesRelPath}`;

      const sourcesResponse = await this.fetchImpl(sourcesFullUrl, {
        headers: {
          "User-Agent": DEFAULT_UA,
          Referer: embedUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: controller.signal,
      });

      if (!sourcesResponse.ok) {
        return [embedFallbackSource];
      }

      const payload = (await sourcesResponse.json()) as {
        sources?: Array<{ file?: string; type?: string }>;
        tracks?: Array<{ file?: string; label?: string; kind?: string; default?: boolean }>;
        intro?: { start?: number; end?: number };
        outro?: { start?: number; end?: number };
      };

      const primarySource = payload.sources?.[0];
      if (!primarySource?.file) {
        return [embedFallbackSource];
      }

      const rawFile = primarySource.file;
      const hlsUrl = rawFile.startsWith("http") ? rawFile : `${this.baseUrl}${rawFile}`;

      const subtitles: Array<{ language: string; url: string; kind?: string }> = Array.isArray(
        payload.tracks,
      )
        ? payload.tracks
            .filter((t) => t && typeof t.file === "string" && t.file && t.kind !== "thumbnails")
            .map((t) => ({
              language: String(t.label || "English"),
              url: String(t.file).startsWith("http") ? String(t.file) : `${this.baseUrl}${t.file}`,
              kind: String(t.kind || "captions"),
            }))
        : [];

      let intro: { start: number; end: number } | undefined;
      let outro: { start: number; end: number } | undefined;

      if (
        payload.intro &&
        typeof payload.intro.start === "number" &&
        typeof payload.intro.end === "number" &&
        payload.intro.end > payload.intro.start
      ) {
        intro = {
          start: Math.round(payload.intro.start),
          end: Math.round(payload.intro.end),
        };
      }

      if (
        payload.outro &&
        typeof payload.outro.start === "number" &&
        typeof payload.outro.end === "number" &&
        payload.outro.end > payload.outro.start
      ) {
        outro = {
          start: Math.round(payload.outro.start),
          end: Math.round(payload.outro.end),
        };
      }

      const markerKey = `${anilistId}:${episodeNumber}`;
      this.#markerCache.set(markerKey, { intro, outro, timestamp: Date.now() });

      const hlsSource: PlaybackSource = {
        id: `${this.slug}-${language}-${anilistId}-${episodeNumber}-hls`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: `${language}-hls`,
        accessType: "hls",
        playbackUrl: hlsUrl,
        quality: "1080p",
        resolution: 1080,
        language,
        subtitles: subtitles.length > 0 ? subtitles : undefined,
        referer: embedUrl,
        priority: this.basePriority,
      };

      const finalSources = [hlsSource, embedFallbackSource];
      this.#sourceCache.set(cacheKey, { sources: finalSources, timestamp: Date.now() });
      return finalSources;
    } catch {
      return [embedFallbackSource];
    } finally {
      clearTimeout(timer);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", onParentAbort);
      }
    }
  }
}

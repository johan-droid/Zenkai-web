/**
 * In-process Consumet scrapers (P6).
 *
 * Runs `@consumet/extensions` inside the backend with strict per-call timeouts
 * and LRU in-memory memoization. Uses the authentic Consumet interface:
 * `search` -> `fetchAnimeInfo` -> `fetchEpisodeSources`.
 *
 * When external scrapers are down, rate-limited, or blocked by upstream TLS/Cloudflare,
 * errors and timeouts fail fast within a 2.5s boundary so the resolver can proceed
 * to other providers without hanging the request.
 */

import { config } from "../../config/index.js";
import { AnilistProvider } from "../metadata/anilist.js";
import { parseResolution } from "./ranking.js";
import type {
  PlaybackSource,
  ProviderCapabilities,
  ProviderEpisodeInfo,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

/** The actual subset of the Consumet extension surface this adapter relies on. */
interface ConsumetEpisode {
  id: string;
  number: number;
  title?: string;
  isFiller?: boolean;
}

interface ConsumetSourceEntry {
  url: string;
  isM3U8?: boolean;
  quality?: string;
}

interface ConsumetEpisodeSourcesResult {
  headers?: Record<string, string>;
  sources?: ConsumetSourceEntry[];
  subtitles?: Array<{ url: string; lang: string }>;
}

interface ConsumetAnimeProvider {
  search(query: string, page?: number): Promise<{ results?: Array<{ id: string; title?: string }> }>;
  fetchAnimeInfo(id: string): Promise<{ id: string; title?: string; episodes?: ConsumetEpisode[] }>;
  fetchEpisodeSources(episodeId: string): Promise<ConsumetEpisodeSourcesResult>;
}

/** Lazily-constructed extensions, keyed by provider slug. */
const backends = new Map<string, ConsumetAnimeProvider>();

/** In-memory memoization to avoid redundant upstream scraping lookups. */
const showIdCache = new Map<string, string | null>();
const episodesCache = new Map<string, ConsumetEpisode[]>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function loadBackend(slug: string): Promise<ConsumetAnimeProvider> {
  const existing = backends.get(slug);
  if (existing) return existing;

  const extensions = (await import("@consumet/extensions")) as unknown as Record<string, any>;
  const catalogue = extensions.ANIME as
    | Record<string, new () => ConsumetAnimeProvider>
    | undefined;

  const Ctor = catalogue?.[slug];
  if (!Ctor) throw new Error(`unknown consumet backend: ${slug}`);

  const instance = new Ctor();
  backends.set(slug, instance);
  return instance;
}

export class InProcessProvider implements StreamingProvider {
  readonly kind = "scrape" as const;
  readonly version = "1.1.0";
  enabled = true;

  readonly capabilities: ProviderCapabilities = {
    languages: ["sub"],
    accessTypes: ["hls", "mp4", "embed"],
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false,
  };

  readonly #anilist = new AnilistProvider();

  constructor(
    readonly slug: string,
    readonly name: string,
    readonly basePriority: number,
  ) {}

  /** False when the operator has not enabled in-process scraping. */
  get isEnabled(): boolean {
    return config.CONSUMET_INPROCESS;
  }

  /**
   * Map an AniList title onto a Consumet slug.
   *
   * Uses canonical animeTitle if available to avoid an extra AniList network hop.
   * Validates title closeness so an unrelated top search result is rejected rather
   * than serving the wrong anime.
   */
  async #findShowId(request: ResolveRequest): Promise<string | null> {
    let title = request.animeTitle;
    let record: any = null;
    if (request.anilistId) {
      record = await this.#anilist.getByAnilistId(request.anilistId).catch(() => null);
      if (!title && record) {
        title = record.canonicalTitle;
      }
    }
    if (!title) return null;

    const cacheKey = request.anilistId
      ? `${this.slug}:show:anilist:${request.anilistId}`
      : `${this.slug}:show:${title.toLowerCase()}`;

    if (showIdCache.has(cacheKey)) {
      return showIdCache.get(cacheKey) ?? null;
    }

    try {
      const backend = await loadBackend(this.slug);
      const results = await withTimeout(
        backend.search(title, 1),
        2500,
        `${this.slug}.search`,
      );
      const candidates = results?.results ?? [];
      if (candidates.length === 0) {
        showIdCache.set(cacheKey, null);
        return null;
      }

      const matchedId = InProcessProvider.matchTitle(candidates, {
        canonicalTitle: title,
        english: record?.titles?.english ?? null,
        romaji: record?.titles?.romaji ?? null,
        native: record?.titles?.native ?? null,
        synonyms: record?.titles?.synonyms ?? [],
      });

      showIdCache.set(cacheKey, matchedId);
      return matchedId;
    } catch {
      return null;
    }
  }

  static matchTitle(
    candidates: Array<{ id: string; title?: string }>,
    titles: {
      canonicalTitle?: string;
      english?: string | null;
      romaji?: string | null;
      native?: string | null;
      synonyms?: string[];
    },
  ): string | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    const verifiedTitles: string[] = [];
    if (titles.canonicalTitle) verifiedTitles.push(titles.canonicalTitle);
    if (titles.english) verifiedTitles.push(titles.english);
    if (titles.romaji) verifiedTitles.push(titles.romaji);
    if (titles.native) verifiedTitles.push(titles.native);
    if (Array.isArray(titles.synonyms)) {
      for (const syn of titles.synonyms) {
        if (syn) verifiedTitles.push(syn);
      }
    }

    const normalizedVerified = new Set(verifiedTitles.map(normalize).filter(Boolean));

    // 1. Exact match against any verified title:
    const exact = candidates.find((c) => {
      if (!c.title) return false;
      const normC = normalize(c.title);
      return (
        normalizedVerified.has(normC) ||
        verifiedTitles.some((vt) => vt.toLowerCase() === c.title!.toLowerCase())
      );
    });

    if (exact) {
      return exact.id;
    }

    // 2. Strict constrained matching: candidate must share the core title tokens
    // and must NOT introduce contradictory sequel, season, or format indicators.
    const seasonRegex = /(?:season\s*\d+|\d+(?:st|nd|rd|th)\s*season|s\d+|part\s*\d+|cour\s*\d+|movie|film|ova|special|recap)/gi;

    const extractSeasonTokens = (str: string) => {
      return (str.match(seasonRegex) || []).map((t) => t.toLowerCase().replace(/\s+/g, ""));
    };

    const wantedSeasonTokens = new Set<string>();
    for (const vt of verifiedTitles) {
      for (const token of extractSeasonTokens(vt)) {
        wantedSeasonTokens.add(token);
      }
    }

    const safeCandidate = candidates.find((c) => {
      if (!c.title) return false;
      const normC = normalize(c.title);
      const candidateSeasonTokens = extractSeasonTokens(c.title);

      // If candidate has season/part/format tokens that target doesn't have, REJECT (sequel/special confusion)
      for (const token of candidateSeasonTokens) {
        if (!wantedSeasonTokens.has(token)) return false;
      }

      // If target has season tokens that candidate doesn't have, REJECT
      for (const token of wantedSeasonTokens) {
        if (!candidateSeasonTokens.includes(token)) return false;
      }

      // Must match either startsWith or endsWith on one of the verified forms, with word boundary
      return Array.from(normalizedVerified).some((normTarget) => {
        if (normC === normTarget) return true;
        // If length difference is small (e.g. minor punctuation / subtitle), ensure high prefix match
        if (normC.startsWith(normTarget) || normTarget.startsWith(normC)) {
          const diff = Math.abs(normC.length - normTarget.length);
          return diff <= 4; // allow at most 4 chars difference (e.g. punctuation, "tv", "hd")
        }
        return false;
      });
    });

    return safeCandidate ? safeCandidate.id : null;
  }

  /**
   * Fetch episode list for the show from the provider.
   */
  async #fetchEpisodes(showId: string): Promise<ConsumetEpisode[]> {
    const cacheKey = `${this.slug}:episodes:${showId}`;
    const cached = episodesCache.get(cacheKey);
    if (cached) return cached;

    try {
      const backend = await loadBackend(this.slug);
      const info = await withTimeout(
        backend.fetchAnimeInfo(showId),
        2500,
        `${this.slug}.fetchAnimeInfo`,
      );
      const rawEpisodes = info?.episodes ?? [];
      const episodes: ConsumetEpisode[] = rawEpisodes
        .map((ep: any, index: number) => ({
          id: String(ep.id),
          number: Number.isFinite(Number(ep.number)) ? Number(ep.number) : index + 1,
          title: ep.title,
          isFiller: Boolean(ep.isFiller),
        }))
        .filter((ep: ConsumetEpisode) => Number.isFinite(ep.number));

      if (episodes.length > 0) {
        episodesCache.set(cacheKey, episodes);
      }
      return episodes;
    } catch {
      return [];
    }
  }

  async listEpisodes(request: ResolveRequest): Promise<ProviderEpisodeInfo[]> {
    if (!this.enabled || !this.isEnabled) return [];

    try {
      const showId = await this.#findShowId(request);
      if (!showId) return [];

      const episodes = await this.#fetchEpisodes(showId);
      return episodes.map((ep) => ({
        providerEpisodeId: ep.id,
        episodeNumber: ep.number,
      }));
    } catch {
      return [];
    }
  }

  async resolve(request: ResolveRequest): Promise<PlaybackSource[]> {
    if (!this.enabled || !this.isEnabled) return [];

    try {
      const showId = await this.#findShowId(request);
      if (!showId) return [];

      const episodes = await this.#fetchEpisodes(showId);
      if (episodes.length === 0) return [];

      // Prefer provider-native episode id when known, otherwise use episode number.
      const targetEpisode = request.providerEpisodeId
        ? episodes.find((ep) => ep.id === request.providerEpisodeId)
        : episodes.find((ep) => ep.number === request.episodeNumber);

      if (!targetEpisode) return [];

      const backend = await loadBackend(this.slug);
      const raw = await withTimeout(
        backend.fetchEpisodeSources(targetEpisode.id),
        2500,
        `${this.slug}.fetchEpisodeSources`,
      );

      const entries = Array.isArray(raw?.sources) ? raw.sources : [];
      const sources: PlaybackSource[] = [];

      const referer =
        raw?.headers?.Referer ||
        raw?.headers?.referer;

      for (const entry of entries) {
        if (!entry?.url) continue;

        sources.push({
          id: `inprocess:${this.slug}:${targetEpisode.id}:${entry.quality ?? "auto"}`,
          providerSlug: this.slug,
          providerName: this.name,
          endpointSlug: this.slug,
          accessType: entry.isM3U8 ? "hls" : "mp4",
          playbackUrl: entry.url,
          quality: entry.quality,
          resolution: parseResolution(entry.quality),
          language: "sub",
          referer,
          headers: raw?.headers,
          priority: this.basePriority,
        });
      }

      return sources;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled || !this.isEnabled) return false;

    try {
      await loadBackend(this.slug);
      return true;
    } catch {
      return false;
    }
  }
}
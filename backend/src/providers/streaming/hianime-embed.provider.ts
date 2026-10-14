/**
 * HiAnime embed provider.
 *
 * Resolves episodes to ready-to-play iframe embeds served by the site's own
 * player CDN (`cdn.4animo.xyz`, `flixera.co`). The browser does the actual
 * playback inside an `<iframe>` — this adapter never touches an m3u8, so it
 * stays comfortably inside serverless function timeouts.
 *
 * Source site (`zangetsu.cc`, the reachable HiAnime mirror) is plain HTML +
 * two JSON AJAX endpoints. Node's fetch passes where curl is fingerprinted,
 * and the page-embedded `AJAX_TOKEN` + session cookie satisfy the AJAX guard.
 * No browser automation, no Cloudflare bypass library, no extra service.
 *
 * Flow per episode: search title → match show → watch page (token+cookie) →
 * episodes JSON → servers JSON → iframe URLs. Show and episode lookups are
 * memoized in-process; a session (token+cookie) is per-resolve because the
 * token rotates.
 */

import { config } from "../../config/index.js";
import { AnilistProvider } from "../metadata/anilist.js";
import { matchShowTitle, buildShowCacheKey } from "./matching.js";
import type {
  AudioTrack,
  PlaybackSource,
  ProviderCapabilities,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

interface AnilistTitleRecord {
  canonicalTitle?: string;
  titles?: { english?: string | null; romaji?: string | null; native?: string | null; synonyms?: string[] };
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** One HTTP call must never approach the serverless function budget. */
const FETCH_TIMEOUT_MS = 8_000;

interface ZangetsuEpisode {
  id: string;
  number: number;
  sub: boolean;
  dub: boolean;
  ani: string | null;
  mal: string | null;
}

interface ZangetsuServer {
  serverId: string;
  serverName: string;
}

/** Show slug → matched show id, keyed by canonical identity (never bare title). */
const showIdCache = new Map<string, string | null>();
/** Show id → episode rows. */
const episodesCache = new Map<string, ZangetsuEpisode[]>();
/** Show id → live session (token rotates per page load; reused within a minute). */
const sessionCache = new Map<string, { token: string; cookie: string; at: number }>();
const SESSION_TTL_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function fetchText(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<{ body: string; cookie: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: signal ?? controller.signal,
    });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
    return {
      body: await response.text(),
      cookie: (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
    });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** `href="/naruto-11" title="Naruto"` pairs off the search page. */
export function parseSearchResults(html: string): Array<{ id: string; title: string }> {
  const seen = new Map<string, string>();
  // film-poster anchors carry the show slug + display title.
  const anchorPattern = /<a[^>]+class="film-poster-ahref"[^>]+href="\/([a-z0-9-]+)"[^>]+title="([^"]{1,160})"/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const id = match[1]!;
    if (!seen.has(id)) seen.set(id, match[2]!);
  }
  // Fallback: detail anchors carry data-title.
  if (seen.size === 0) {
    const fallback = /<a[^>]+href="\/([a-z0-9-]+)"[^>]+data-title="([^"]{1,160})"/gi;
    while ((match = fallback.exec(html)) !== null) {
      const id = match[1]!;
      if (!seen.has(id)) seen.set(id, match[2]!);
    }
  }
  return [...seen.entries()].map(([id, title]) => ({ id, title }));
}

function parseAjaxToken(html: string): string | null {
  return (html.match(/AJAX_TOKEN\s*=\s*"([^"]+)"/) ?? [])[1] ?? null;
}

/** Numeric suffix of the show slug: `naruto-20` -> `20`. */
function numericShowId(showId: string): string | null {
  const tail = showId.split("-").pop();
  return tail && /^\d+$/.test(tail) ? tail : null;
}

/**
 * Build the player's iframe URL exactly as the site's own `loadPlayer` does.
 * `episodeNumericId` is the AJAX episode id, `ani`/`mal` are the `id/ep`
 * cross-references the episodes endpoint reports.
 */
export function iframeUrl(
  serverName: string,
  type: AudioTrack,
  episodeNumericId: string,
  ani: string | null,
  mal: string | null,
): string {
  const query = "?k=1&autoPlay=0&skipIntro=0&skipOutro=0";
  if (serverName === "s-1") {
    if (ani) return `https://flixera.co/embed/ani/${ani}/${type}${query}`;
    if (mal) return `https://flixera.co/embed/mal/${mal}/${type}${query}`;
    return `https://flixera.co/embed/ani/${episodeNumericId}/${type}${query}`;
  }
  if (serverName === "s-3") {
    if (ani) return `https://cdn.4animo.xyz/embed/hd-2/ani/${ani}/${type}${query}`;
    if (mal) return `https://cdn.4animo.xyz/embed/hd-2/mal/${mal}/${type}${query}`;
    return `https://cdn.4animo.xyz/embed/hd-2/${episodeNumericId}/${type}${query}`;
  }
  // s-2 and anything unknown: hd-1 by numeric episode id.
  return `https://cdn.4animo.xyz/embed/hd-1/${episodeNumericId}/${type}${query}`;
}

export class HiAnimeEmbedProvider implements StreamingProvider {
  readonly kind = "scrape" as const;
  readonly version = "1.0.0";
  enabled = true;

  readonly capabilities: ProviderCapabilities = {
    languages: ["sub", "dub"],
    accessTypes: ["embed"],
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false,
  };

  /**
   * Four sequential fetches (search → watch → episodes → servers) on a slow
   * mirror: needs headroom the single-call 3s default does not give. Embeds
   * skip m3u8 probing, so this is the whole cost of the provider per request.
   */
  readonly timeoutMs = 12_000;

  readonly #anilist = new AnilistProvider();

  constructor(
    readonly slug = "hianime-embed",
    readonly name = "HiAnime",
    readonly basePriority = 10,
    private readonly baseUrl = config.HIANIME_BASE_URL,
  ) {}

  get isEnabled(): boolean {
    return config.HIANIME_EMBED_ENABLED;
  }

  async #findShowId(request: ResolveRequest): Promise<string | null> {
    // The resolver already supplies the canonical title; an extra AniList
    // round trip only buys synonyms. Skip it when a title is present.
    let title = request.animeTitle;
    let record: AnilistTitleRecord | null = null;
    if (!title && request.anilistId) {
      const fetched = await this.#anilist.getByAnilistId(request.anilistId).catch(() => null);
      record = (fetched ?? null) as AnilistTitleRecord | null;
      if (record?.canonicalTitle) title = record.canonicalTitle;
    }
    const query = title || record?.canonicalTitle;
    if (!query) return null;

    const { key: cacheKey, isAmbiguous } = buildShowCacheKey(this.slug, request, record);
    if (!isAmbiguous && showIdCache.has(cacheKey)) return showIdCache.get(cacheKey) ?? null;

    try {
      const { body } = await withTimeout(
        fetchText(`${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`, {}),
        FETCH_TIMEOUT_MS + 2_000,
        `${this.slug}.search`,
      );
      const matched = matchShowTitle(parseSearchResults(body), {
        canonicalTitle: record?.canonicalTitle || title,
        english: record?.titles?.english ?? null,
        romaji: record?.titles?.romaji ?? null,
        native: record?.titles?.native ?? null,
        synonyms: record?.titles?.synonyms ?? [],
      });
      if (!isAmbiguous) showIdCache.set(cacheKey, matched);
      return matched;
    } catch {
      return null;
    }
  }

  /** Live session for a show: token + cookie, reused within its TTL. */
  async #session(showId: string): Promise<{ token: string; cookie: string } | null> {
    const cached = sessionCache.get(showId);
    if (cached && Date.now() - cached.at < SESSION_TTL_MS) {
      return { token: cached.token, cookie: cached.cookie };
    }
    try {
      const watch = await withTimeout(
        fetchText(`${this.baseUrl}/watch/${showId}`, { Referer: `${this.baseUrl}/` }),
        FETCH_TIMEOUT_MS + 2_000,
        `${this.slug}.watch`,
      );
      const token = parseAjaxToken(watch.body);
      if (!token) return null;
      sessionCache.set(showId, { token, cookie: watch.cookie, at: Date.now() });
      return { token, cookie: watch.cookie };
    } catch {
      return null;
    }
  }

  async #fetchEpisodes(showId: string): Promise<ZangetsuEpisode[]> {
    const cached = episodesCache.get(showId);
    if (cached) return cached;

    const numericId = numericShowId(showId);
    if (!numericId) return [];

    try {
      const session = await this.#session(showId);
      if (!session) return [];

      const headers: Record<string, string> = {
        Referer: `${this.baseUrl}/watch/${showId}`,
        "X-Requested-With": "XMLHttpRequest",
        "X-Page-Token": session.token,
      };
      if (session.cookie) headers.Cookie = session.cookie;

      const data = await withTimeout(
        fetchJson<{ success?: boolean; episodes?: Array<Record<string, unknown>> }>(
          `${this.baseUrl}/ajax/episodes?animeId=${numericId}`,
          headers,
        ),
        FETCH_TIMEOUT_MS + 2_000,
        `${this.slug}.episodes`,
      );
      const rows = Array.isArray(data.episodes) ? data.episodes : [];
      const episodes: ZangetsuEpisode[] = rows
        .map((row) => ({
          id: String((row as { id?: unknown }).id ?? ""),
          number: Number((row as { number?: unknown }).number),
          sub: Boolean((row as { sub?: unknown }).sub),
          dub: Boolean((row as { dub?: unknown }).dub),
          ani: typeof (row as { ani?: unknown }).ani === "string" ? ((row as { ani: string }).ani || null) : null,
          mal: typeof (row as { mal?: unknown }).mal === "string" ? ((row as { mal: string }).mal || null) : null,
        }))
        .filter((ep) => ep.id && Number.isFinite(ep.number));

      if (episodes.length > 0) episodesCache.set(showId, episodes);
      return episodes;
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
      const target = episodes.find((ep) => ep.number === request.episodeNumber);
      if (!target) return [];

      const numericId = numericShowId(showId);
      if (!numericId) return [];

      // Reuse the episodes session (token rotates per page load, cached 60s).
      const session = await this.#session(showId);
      if (!session) return [];

      const headers: Record<string, string> = {
        Referer: `${this.baseUrl}/watch/${showId}`,
        "X-Requested-With": "XMLHttpRequest",
        "X-Page-Token": session.token,
      };
      if (session.cookie) headers.Cookie = session.cookie;

      const wanted: AudioTrack[] =
        request.language === "multi" ? ["sub", "dub"] : [request.language];

      const sources: PlaybackSource[] = [];
      for (const language of wanted) {
        if (language === "sub" && !target.sub) continue;
        if (language === "dub" && !target.dub) continue;
        const data = await withTimeout(
          fetchJson<{ sub?: ZangetsuServer[]; dub?: ZangetsuServer[] }>(
            `${this.baseUrl}/ajax/server?episodeId=${target.id}&sub=${target.sub ? 1 : 0}&dub=${target.dub ? 1 : 0}`,
            headers,
          ),
          FETCH_TIMEOUT_MS + 2_000,
          `${this.slug}.servers`,
        );
        const servers = language === "dub" ? (data.dub ?? []) : (data.sub ?? []);
        for (const server of servers) {
          if (!server?.serverName) continue;
          sources.push({
            id: `${this.slug}:${target.id}:${server.serverName}:${language}`,
            providerSlug: this.slug,
            providerName: this.name,
            endpointSlug: server.serverName,
            accessType: "embed",
            playbackUrl: iframeUrl(server.serverName, language, target.id, target.ani, target.mal),
            language,
            referer: `${this.baseUrl}/`,
            priority: this.basePriority,
          });
        }
      }

      return sources;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled || !this.isEnabled) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`${this.baseUrl}/`, {
          headers: { "User-Agent": UA },
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }
}

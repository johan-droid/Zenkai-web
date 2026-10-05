/**
 * Remote Consumet adapter (P6).
 *
 * Consumet is the fallback path rather than the primary one. Two modes exist and
 * the distinction matters: this adapter talks to a self-hosted instance, while
 * `inprocess.provider.ts` runs the `@consumet/extensions` scrapers inside this
 * process. In-process is preferred because it removes a hop and a service to
 * operate, but the remote instance stays useful as a separately-updatable
 * process that cannot take the API down with it.
 *
 * Legality note: most Consumet backends scrape sites hosting unlicensed copies.
 * This adapter is inert unless `CONSUMET_URL` points at an instance you operate
 * and are entitled to use.
 */

import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import { AnilistProvider } from "../metadata/anilist.js";
import { parseResolution } from "./ranking.js";
import type {
  PlaybackSource,
  ProviderCapabilities,
  ResolveRequest,
  StreamingProvider,
} from "./types.js";

export class ConsumetProvider implements StreamingProvider {
  readonly kind = "api" as const;
  readonly version = "1.0.0";
  enabled = true;

  /**
   * Consumet's backends are mostly scrapers with no reliable dub track, so the
   * declared capabilities are deliberately conservative. Overstating them
   * would make the resolver pick this provider for requests it cannot serve.
   */
  readonly capabilities: ProviderCapabilities = {
    languages: ["sub"],
    accessTypes: ["hls", "mp4", "embed"],
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false,
  };

  readonly #anilist = new AnilistProvider();

  constructor(
    readonly slug = "consumet",
    readonly name = "Consumet",
    readonly basePriority = 20,
  ) {}

  /**
   * Resolve a title on the remote instance, then hand back its source ids.
   *
   * Consumet keys everything off its own slug, not an AniList id, so the title
   * has to be looked up by name first. That lookup is the expensive step and is
   * why the result is cached alongside the sources.
   */
  async #findShow(request: ResolveRequest): Promise<string | null> {
    const record = await this.#anilist.getByAnilistId(request.anilistId);
    if (!record) return null;

    const endpoint = `${config.CONSUMET_URL}/anime/zenshin/search`;
    const query = encodeURIComponent(record.canonicalTitle);
    const results = await fetchJson<{ results?: Array<{ id: string; title?: string }> }>(
      `${endpoint}?query=${query}&page=1`,
    );

    const candidates = results?.results ?? [];
    if (candidates.length === 0) return null;

    // Prefer an exact title match before falling back to the first result: the
    // search is fuzzy and a wrong pick returns the wrong show's streams.
    const wanted = record.canonicalTitle.toLowerCase();
    const exact = candidates.find(
      (candidate) => candidate.title?.toLowerCase() === wanted,
    );

    return (exact ?? candidates[0]).id;
  }

  async listEpisodes(
    request: ResolveRequest,
  ): Promise<Array<{ providerEpisodeId: string; episodeNumber: number }>> {
    const showId = await this.#findShow(request);
    if (!showId) return [];

    const payload = await fetchJson<Record<string, unknown>>(
      `${config.CONSUMET_URL}/anime/zenshin/${encodeURIComponent(showId)}/episodes`,
    );

    const episodes = payload?.episodes;
    if (!Array.isArray(episodes)) return [];

    return episodes
      .map((entry: any, index: number) => ({
        providerEpisodeId: String(entry?.id ?? index + 1),
        episodeNumber: Number(entry?.number ?? index + 1),
        title: entry?.title ?? null,
        thumbnailUrl: entry?.image ?? null,
        isFiller: Boolean(entry?.isFiller),
      }))
      .filter((entry: { episodeNumber: number }) => Number.isFinite(entry.episodeNumber));
  }

  async resolve(request: ResolveRequest): Promise<PlaybackSource[]> {
    if (!config.CONSUMET_URL) return [];

    const episodes = await this.listEpisodes(request);
    const match = episodes.find(
      (episode) => episode.episodeNumber === request.episodeNumber,
    );

    // No episode at this number is a miss, not an outage.
    if (!match) return [];

    const servers = await fetchJson<Record<string, any>>(
      `${config.CONSUMET_URL}/anime/zenshin/watch/${encodeURIComponent(
        `${match.providerEpisodeId}`,
      )}`,
    );

    const sources: PlaybackSource[] = [];

    for (const [serverName, server] of Object.entries(servers ?? {})) {
      if (!server?.url) continue;

      // `quality` is "1080p" or "auto" on Consumet; only a real value is kept.
      const resolution = parseResolution(server.quality);
      if (server.quality === "auto" && resolution === undefined) continue;

      sources.push({
        id: `consumet:${serverName}:${match.providerEpisodeId}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: serverName,
        accessType: server.isM3U8 ? "hls" : "mp4",
        playbackUrl: String(server.url),
        quality: server.quality,
        resolution,
        language: "sub",
        referer: server.headers?.Referer ?? server.headers?.referer,
        priority: this.basePriority,
      });
    }

    return sources;
  }

  async healthCheck(): Promise<boolean> {
    if (!config.CONSUMET_URL) return false;

    try {
      await fetchJson(`${config.CONSUMET_URL}/health`, { timeoutMs: 3000, retries: 0 });
      return true;
    } catch {
      return false;
    }
  }
}
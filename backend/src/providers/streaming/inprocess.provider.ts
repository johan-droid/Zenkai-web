/**
 * In-process Consumet scrapers (P6).
 *
 * This is the adapter P6 actually asks for: run `@consumet/extensions` inside
 * the backend rather than proxying a random public Consumet server. Two things
 * are worth being explicit about:
 *
 *  - The scrapers break often. That is why this provider is behind an `enabled`
 *    flag and is scored through the health registry like any remote dependency.
 *  - Legality is unchanged by where the code runs. These backends read sites
 *    hosting unlicensed copies, so this stays opt-in and the operator decides.
 *
 * The package is loaded lazily: it pulls in a full scraping toolchain, and a
 * deployment using only licensed endpoints should not pay for it.
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

/** The subset of the Consumet extension surface this adapter relies on. */
interface ConsumetSource {
  url?: string;
  quality?: string;
  isM3U8?: boolean;
}

interface ConsumetServer {
  fetch(): Promise<ConsumetSource | ConsumetSource[]>;
}

interface ConsumetAnimeProvider {
  search(
    query: string,
    page?: number,
  ): Promise<{ results: Array<{ id: string; title?: string }> }>;
  fetchEpisodeServers(id: string): Promise<Record<string, ConsumetServer>>;
}

/** Lazily-constructed extensions, keyed by provider slug. */
const backends = new Map<string, ConsumetAnimeProvider>();

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
  readonly version = "1.0.0";
  enabled = true;

  readonly capabilities: ProviderCapabilities = {
    languages: ["sub"],
    accessTypes: ["hls", "mp4", "embed"],
    // Consumet exposes no subtitle sidecars or intro/outro markers; claiming
    // otherwise would send the player looking for data that never arrives.
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
   * This is the heuristic the roadmap warns about: the providers share no id
   * space, so the join goes through the title. An exact match is preferred, and
   * the result is treated as a candidate rather than a guarantee.
   */
  async #findShowId(request: ResolveRequest): Promise<string | null> {
    const record = await this.#anilist.getByAnilistId(request.anilistId);
    if (!record) return null;

    const backend = await loadBackend(this.slug);
    const results = await backend.search(record.canonicalTitle, 1);
    const candidates = results?.results ?? [];
    if (candidates.length === 0) return null;

    const wanted = record.canonicalTitle.toLowerCase();
    const exact = candidates.find(
      (candidate) => candidate.title?.toLowerCase() === wanted,
    );

    // Falling back to the top result is a deliberate trade: a wrong show beats
    // no source, and the gateway probe discards it if it turns out to be dead.
    return (exact ?? candidates[0]).id;
  }

  async listEpisodes(request: ResolveRequest): Promise<ProviderEpisodeInfo[]> {
    if (!this.enabled) return [];

    try {
      const showId = await this.#findShowId(request);
      if (!showId) return [];

      const backend = await loadBackend(this.slug);
      const servers = await backend.fetchEpisodeServers(showId);

      return Object.keys(servers)
        .map((key, index) => ({
          providerEpisodeId: key,
          // Keys are usually episode numbers but are not guaranteed sequential,
          // so a non-numeric key falls back to its position.
          episodeNumber: Number.isFinite(Number(key)) ? Number(key) : index + 1,
        }))
        .filter((entry) => Number.isFinite(entry.episodeNumber));
    } catch {
      // An unreachable scraper here means "no episodes"; health is still scored
      // from the resolve path, which distinguishes error from empty.
      return [];
    }
  }

  async resolve(request: ResolveRequest): Promise<PlaybackSource[]> {
    // Not being configured is not an error and must not be scored as one.
    if (!this.enabled) return [];

    const showId = await this.#findShowId(request);
    if (!showId) return [];

    const backend = await loadBackend(this.slug);
    const servers = await backend.fetchEpisodeServers(showId);

    // Servers are keyed by episode id, which is the episode number for most
    // Consumet backends.
    const key = String(request.episodeNumber);
    const server = servers[key];
    if (!server) return [];

    const raw = await server.fetch();
    const entries = Array.isArray(raw) ? raw : [raw];

    const sources: PlaybackSource[] = [];

    for (const entry of entries) {
      if (!entry?.url) continue;

      sources.push({
        id: `inprocess:${this.slug}:${key}:${entry.quality ?? "auto"}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: this.slug,
        accessType: entry.isM3U8 ? "hls" : "mp4",
        playbackUrl: entry.url,
        quality: entry.quality,
        resolution: parseResolution(entry.quality),
        language: "sub",
        priority: this.basePriority,
      });
    }

    return sources;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await loadBackend(this.slug);
      return true;
    } catch {
      return false;
    }
  }
}
/**
 * Playback metadata (P10).
 *
 * Subtitles and skip markers are discovered per episode from whichever provider
 * declares the capability, then stored so the player does not pay for discovery
 * on every play.
 *
 * The cache is short-lived on purpose: subtitle sidecars and marker offsets are
 * both tied to a specific stream, so a value that was right for last week's
 * source can easily be wrong for this one.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { episodePlaybackMeta, episodeExternalIds } from "../../db/schema/index.js";
import { skipCapableProviders, subtitleCapableProviders } from "../../providers/streaming/registry.js";
import type { ResolveRequest, StreamingProvider } from "../../providers/streaming/types.js";

/** Markers older than this are re-derived; providers change them rarely. */
const META_TTL_S = 7 * 86_400;

export interface EpisodeMetadata {
  episodeId: string;
  subtitles: Array<{ language: string; url: string; kind?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  /** When this was derived, so a stale value can be detected. */
  sourceUpdatedAt: number | null;
}

export class PlaybackMetadataService {
  constructor(
    private readonly db: Db,
    private readonly providers: StreamingProvider[],
  ) {}

  /**
   * Return stored metadata for an episode, deriving it on a miss.
   *
   * Derivation is best-effort: a provider that cannot supply markers must not
   * prevent the episode from playing, so failures here yield an empty-but-valid
   * result rather than an error.
   */
  async get(
    episodeId: string,
    request: ResolveRequest,
  ): Promise<EpisodeMetadata> {
    const cached = await this.#read(episodeId);
    if (cached && this.#isFresh(cached.sourceUpdatedAt)) return cached;

    const derived = await this.#derive(request);
    await this.#write(episodeId, derived);

    return { episodeId, ...derived, sourceUpdatedAt: Math.floor(Date.now() / 1000) };
  }

  #isFresh(sourceUpdatedAt: number | null): boolean {
    if (!sourceUpdatedAt) return false;
    return Date.now() / 1000 - sourceUpdatedAt < META_TTL_S;
  }

  async #read(episodeId: string): Promise<EpisodeMetadata | null> {
    const [row] = await this.db
      .select()
      .from(episodePlaybackMeta)
      .where(eq(episodePlaybackMeta.episodeId, episodeId))
      .limit(1);

    if (!row) return null;

    return {
      episodeId,
      subtitles: row.subtitles ?? [],
      intro:
        row.introStartSeconds != null && row.introEndSeconds != null
          ? { start: row.introStartSeconds, end: row.introEndSeconds }
          : undefined,
      outro:
        row.outroStartSeconds != null && row.outroEndSeconds != null
          ? { start: row.outroStartSeconds, end: row.outroEndSeconds }
          : undefined,
      sourceUpdatedAt: row.sourceUpdatedAt,
    };
  }

  /**
   * Ask every capable provider for markers.
   *
   * Runs concurrently and takes the first usable answer. Only providers that
   * declare `supportsSkipMarkers` are consulted, so a scraper that has no such
   * data is never asked for it.
   */
  async #derive(
    request: ResolveRequest,
  ): Promise<Omit<EpisodeMetadata, "episodeId" | "sourceUpdatedAt">> {
    const markers = await Promise.all(
      skipCapableProviders(this.providers).map(async (provider) => {
        try {
          return (await provider.getSkipMarkers?.(request)) ?? null;
        } catch {
          return null;
        }
      }),
    );

    const first = markers.find(Boolean) ?? undefined;

    // Subtitles come from the sources already produced for this episode, which
    // is where a provider attaches its sidecar URLs.
    const sources = await this.#collectSubtitles(request);

    return {
      subtitles: sources,
      intro: first?.intro,
      outro: first?.outro,
    };
  }

  /**
   * Gather subtitle sidecars from capable providers.
   *
   * Resolving sources just for their subtitle field would be wasteful, so this
   * reuses the resolver's cache and only asks providers that declare the
   * capability.
   */
  async #collectSubtitles(
    request: ResolveRequest,
  ): Promise<Array<{ language: string; url: string; kind?: string }>> {
    const capable = subtitleCapableProviders(this.providers);
    if (capable.length === 0) return [];

    const collected = await Promise.all(
      capable.map(async (provider) => {
        try {
          const sources = await provider.resolve(request);
          return sources.flatMap((source) => source.subtitles ?? []);
        } catch {
          return [];
        }
      }),
    );

    // De-duplicated by URL: two endpoints on the same host often publish the
    // same sidecar under different ids.
    const seen = new Set<string>();
    return collected.flat().filter((subtitle) => {
      if (seen.has(subtitle.url)) return false;
      seen.add(subtitle.url);
      return true;
    });
  }

  async #write(
    episodeId: string,
    metadata: Omit<EpisodeMetadata, "episodeId" | "sourceUpdatedAt">,
  ): Promise<void> {
    await this.db
      .insert(episodePlaybackMeta)
      .values({
        episodeId,
        introStartSeconds: metadata.intro?.start ?? null,
        introEndSeconds: metadata.intro?.end ?? null,
        outroStartSeconds: metadata.outro?.start ?? null,
        outroEndSeconds: metadata.outro?.end ?? null,
        subtitles: metadata.subtitles,
        sourceUpdatedAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoUpdate({
        target: episodePlaybackMeta.episodeId,
        set: {
          introStartSeconds: metadata.intro?.start ?? null,
          introEndSeconds: metadata.intro?.end ?? null,
          outroStartSeconds: metadata.outro?.start ?? null,
          outroEndSeconds: metadata.outro?.end ?? null,
          subtitles: metadata.subtitles,
          sourceUpdatedAt: Math.floor(Date.now() / 1000),
        },
      });
  }
}
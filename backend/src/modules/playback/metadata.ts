/**
 * Playback metadata (P10).
 *
 * Stable markers are discovered per episode from whichever provider
 * declares the capability, then stored so the player does not pay for
 * discovery on every play. Subtitle sidecar URLs are ephemeral: they are
 * derived fresh on every call and are never written to the database.
 *
 * Two-speed contract:
 *
 *   persisted (PostgreSQL):  episodeId, intro/outro offsets, subtitle
 *                            descriptors (language/kind only), sourceUpdatedAt
 *   ephemeral (per-request): subtitle sidecar URLs, stream URLs, relay URLs
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { episodePlaybackMeta } from "../../db/schema/index.js";
import { skipCapableProviders, subtitleCapableProviders } from "../../providers/streaming/registry.js";
import type { ResolveRequest, StreamingProvider } from "../../providers/streaming/types.js";

/** Markers older than this are re-derived; providers change them rarely. */
const META_TTL_S = 7 * 86_400;

/**
 * The shape of a persisted playback-metadata row.
 *
 * This is the boundary: persistence accepts exactly these fields and
 * nothing else. URLs, tokens, cookies, headers and unknown keys
 * (`.strict()`) are rejected here before a row can be written.
 */
export const persistedEpisodeMetadataSchema = z
  .object({
    episodeId: z.string(),
    intro: z.object({ start: z.number(), end: z.number() }).strict().optional(),
    outro: z.object({ start: z.number(), end: z.number() }).strict().optional(),
    subtitles: z.array(
      z
        .object({ language: z.string(), kind: z.string().optional() })
        .strict(),
    ),
    sourceUpdatedAt: z.number().int().nullable(),
  })
  .strict();

export type PersistedEpisodeMetadata = z.infer<typeof persistedEpisodeMetadataSchema>;

/** What the service returns to the route: markers plus ephemeral subtitles. */
export interface EpisodeMetadata {
  episodeId: string;
  /** Ephemeral: derived fresh on every call, never persisted. */
  subtitles: Array<{ language: string; url: string; kind?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  /** When the stored metadata was derived, so staleness is detectable. */
  sourceUpdatedAt: number | null;
}

export class PlaybackMetadataService {
  constructor(
    private readonly db: Db,
    private readonly providers: StreamingProvider[],
  ) {}

  /**
   * Return stored metadata for an episode, deriving it when missing/stale.
   *
   * Subtitle URLs are always derived fresh; only stable descriptors are
   * stored or read back. Failures yield an empty-but-valid result rather
   * than an error: a missing marker must not block playback.
   */
  async get(
    episodeId: string,
    request: ResolveRequest,
  ): Promise<EpisodeMetadata> {
    const stored = await this.#read(episodeId);
    let persisted = stored;

    if (!stored || !this.#isFresh(stored.sourceUpdatedAt)) {
      const derived = await this.#deriveMarkers(request);
      persisted = this.#merge(episodeId, stored, derived);
      await this.#write(persisted);
    }

    const subtitles = await this.#collectSubtitles(request);

    return {
      episodeId,
      subtitles,
      intro: persisted?.intro,
      outro: persisted?.outro,
      sourceUpdatedAt: persisted?.sourceUpdatedAt ?? null,
    };
  }

  #isFresh(sourceUpdatedAt: number | null): boolean {
    if (!sourceUpdatedAt) return false;
    return Date.now() / 1000 - sourceUpdatedAt < META_TTL_S;
  }

  async #read(episodeId: string): Promise<PersistedEpisodeMetadata | null> {
    const [row] = await this.db
      .select()
      .from(episodePlaybackMeta)
      .where(eq(episodePlaybackMeta.episodeId, episodeId))
      .limit(1);

    if (!row) return null;

    return {
      episodeId,
      intro:
        row.introStartSeconds != null && row.introEndSeconds != null
          ? { start: row.introStartSeconds, end: row.introEndSeconds }
          : undefined,
      outro:
        row.outroStartSeconds != null && row.outroEndSeconds != null
          ? { start: row.outroStartSeconds, end: row.outroEndSeconds }
          : undefined,
      subtitles: row.subtitles ?? [],
      sourceUpdatedAt: row.sourceUpdatedAt,
    };
  }

  /**
   * Merge a fresh derivation into stored metadata.
   *
   * A provider answering "no markers" does not erase known markers, and a
   * provider that no longer lists a language does not erase the descriptor:
   * unknown stays unknown, stored stays. Known values are replaced only by
   * concrete new values.
   */
  #merge(
    episodeId: string,
    stored: PersistedEpisodeMetadata | null,
    derived: Omit<PersistedEpisodeMetadata, "episodeId" | "sourceUpdatedAt">,
  ): PersistedEpisodeMetadata {
    const subtitles = new Map(
      (stored?.subtitles ?? []).map((subtitle) => [subtitle.language, subtitle]),
    );
    for (const subtitle of derived.subtitles) {
      subtitles.set(subtitle.language, subtitle);
    }

    return {
      episodeId,
      intro: derived.intro ?? stored?.intro,
      outro: derived.outro ?? stored?.outro,
      subtitles: [...subtitles.values()],
      sourceUpdatedAt: Math.floor(Date.now() / 1000),
    };
  }

  /** Ask every capable provider for markers; the first usable answer wins. */
  async #deriveMarkers(
    request: ResolveRequest,
  ): Promise<Omit<PersistedEpisodeMetadata, "episodeId" | "sourceUpdatedAt">> {
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

    // Subtitle descriptors from the same sources: which languages/kinds a
    // title has, without storing any URL.
    const subtitles = await this.#collectSubtitles(request);
    const descriptors = subtitles
      .map(({ language, kind }) => ({ language, ...(kind !== undefined ? { kind } : {}) }))
      .filter((descriptor, index, list) => list.findIndex((d) => d.language === descriptor.language) === index);

    return {
      subtitles: descriptors,
      intro: first?.intro,
      outro: first?.outro,
    };
  }

  /**
   * Gather subtitle sidecars fresh for every request.
   *
   * Resolving sources just for their subtitle field is wasteful, so this
   * reuses the same ephemeral flow; URLs are returned to the caller but
   * stripped before persistence.
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

  /**
   * Write stable metadata only.
   *
   * Values are type-erased to PersistedEpisodeMetadata -- the persisted
   * schema's strict shape -- and parsed before the insert, so an unknown
   * key or an ephemeral URL field cannot reach PostgreSQL even when the
   * caller is lax with types.
   */
  async #write(values: PersistedEpisodeMetadata): Promise<void> {
    const parsed = persistedEpisodeMetadataSchema.parse(values);

    await this.db
      .insert(episodePlaybackMeta)
      .values({
        episodeId: parsed.episodeId,
        introStartSeconds: parsed.intro?.start ?? null,
        introEndSeconds: parsed.intro?.end ?? null,
        outroStartSeconds: parsed.outro?.start ?? null,
        outroEndSeconds: parsed.outro?.end ?? null,
        subtitles: parsed.subtitles,
        sourceUpdatedAt: parsed.sourceUpdatedAt,
      })
      .onConflictDoUpdate({
        target: episodePlaybackMeta.episodeId,
        set: {
          introStartSeconds: parsed.intro?.start ?? null,
          introEndSeconds: parsed.intro?.end ?? null,
          outroStartSeconds: parsed.outro?.start ?? null,
          outroEndSeconds: parsed.outro?.end ?? null,
          subtitles: parsed.subtitles,
          sourceUpdatedAt: parsed.sourceUpdatedAt,
        },
      });
  }
}

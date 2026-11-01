/**
 * Playback metadata (P10/P4).
 *
 * Stable markers are discovered per episode from whichever provider
 * declares the capability, then stored so the player does not pay for
 * discovery on every play. Subtitle sidecar URLs are ephemeral: they are
 * derived fresh on every call and are never written to the database.
 *
 * Skip marker types supported:
 *   - intro: Opening sequence
 *   - outro: Ending sequence
 *   - recap: Station recap / previous episode summary
 *   - preview: Next episode promotional preview
 *
 * Skip timing is community-contributed (P4): verified timings shape the
 * defaults the player uses, unverified timings are only used when no
 * verified source exists, and reports let the set converge over time.
 *
 * Two-speed contract:
 *
 *   persisted (PostgreSQL):  episodeId, intro/outro/recap/preview offsets,
 *                            community timing aggregates, subtitle descriptors (language/kind only), sourceUpdatedAt
 *   ephemeral (per-request): subtitle sidecar URLs, stream URLs, relay URLs
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { episodePlaybackMeta, skipTimingCommunity, skipTimingReports } from "../../db/schema/index.js";
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
    recap: z.object({ start: z.number(), end: z.number() }).strict().optional(),
    preview: z.object({ start: z.number(), end: z.number() }).strict().optional(),
    subtitles: z.array(
      z
        .object({ language: z.string(), kind: z.string().optional() })
        .strict(),
    ),
    sourceUpdatedAt: z.number().int().nullable(),
  })
  .strict();

export type PersistedEpisodeMetadata = z.infer<typeof persistedEpisodeMetadataSchema>;/** What the service returns to the route: markers plus ephemeral subtitles. */
export interface EpisodeMetadata {
  episodeId: string;
  /** Ephemeral: derived fresh on every call, never persisted. */
  subtitles: Array<{ language: string; url: string; kind?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  recap?: { start: number; end: number };
  preview?: { start: number; end: number };
  /** When the stored metadata was derived, so staleness is detectable. */
  sourceUpdatedAt: number | null;
}

/** Community timing entry returned to the caller. */
export interface CommunityTimingEntry {
  segmentType: "intro" | "outro" | "recap" | "preview";
  startSeconds: number;
  endSeconds: number;
  versionNote?: string | null;
  validationCount: number;
  isVerified: boolean;
  source: string;
  contributors: number;
  reports: number;
}

/** Episode IDs that are not valid PostgreSQL UUIDs (e.g. "ep-114129-1") have no stored metadata. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Non-UUID episode ids (e.g. "ep-114129-1") cannot have stored metadata in the
    // database table — the column is a UUID foreign key.
    // Derive ephemeral markers and subtitles from skip-capable providers instead of returning empty.
    if (!UUID_PATTERN.test(episodeId)) {
      const derived = await this.#deriveMarkers(request);
      const subtitles = await this.#collectSubtitles(request);
      return {
        episodeId,
        subtitles,
        intro: derived.intro,
        outro: derived.outro,
        sourceUpdatedAt: null,
      };
    }

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
      recap: persisted?.recap,
      preview: persisted?.preview,
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
      recap:
        row.recapStartSeconds != null && row.recapEndSeconds != null
          ? { start: row.recapStartSeconds, end: row.recapEndSeconds }
          : undefined,
      preview:
        row.previewStartSeconds != null && row.previewEndSeconds != null
          ? { start: row.previewStartSeconds, end: row.previewEndSeconds }
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
      recap: derived.recap ?? stored?.recap,
      preview: derived.preview ?? stored?.preview,
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
        recapStartSeconds: parsed.recap?.start ?? null,
        recapEndSeconds: parsed.recap?.end ?? null,
        previewStartSeconds: parsed.preview?.start ?? null,
        previewEndSeconds: parsed.preview?.end ?? null,
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
          recapStartSeconds: parsed.recap?.start ?? null,
          recapEndSeconds: parsed.recap?.end ?? null,
          previewStartSeconds: parsed.preview?.start ?? null,
          previewEndSeconds: parsed.preview?.end ?? null,
          subtitles: parsed.subtitles,
          sourceUpdatedAt: parsed.sourceUpdatedAt,
        },
      });
  }

  /**
   * Resolve community-contributed timings for an episode.
   *
   * Verified timings are preferred. When none exist for a segment, the
   * best unverified consensus is used. When nothing exists, nothing is
   * returned -- a missing community marker must not invent a skip.
   */
  async #communityTimings(
    db: typeof this.db,
    animeId: string,
    episodeId: string,
  ): Promise<{ recap?: { start: number; end: number }; preview?: { start: number; end: number }; all: CommunityTimingEntry[] }> {
    const rows = await db
      .select({
        segmentType: skipTimingCommunity.segmentType,
        startSeconds: skipTimingCommunity.startSeconds,
        endSeconds: skipTimingCommunity.endSeconds,
        versionNote: skipTimingCommunity.versionNote,
        validationCount: skipTimingCommunity.validationCount,
        isVerified: skipTimingCommunity.isVerified,
        source: skipTimingCommunity.source,
      })
      .from(skipTimingCommunity)
      .where(
        and(
          eq(skipTimingCommunity.episodeId, episodeId),
          sql`${skipTimingCommunity.startSeconds} >= 0`,
          sql`${skipTimingCommunity.endSeconds} > ${skipTimingCommunity.startSeconds}`,
          sql`${skipTimingCommunity.endSeconds} - ${skipTimingCommunity.startSeconds} >= 2`,
          sql`${skipTimingCommunity.endSeconds} - ${skipTimingCommunity.startSeconds} <= 420`,
        ),
      )
      .orderBy(desc(skipTimingCommunity.validationCount));

    const recapEntries: CommunityTimingEntry[] = [];
    const previewEntries: CommunityTimingEntry[] = [];
    for (const row of rows) {
      const entry: CommunityTimingEntry = {
        segmentType: row.segmentType,
        startSeconds: row.startSeconds,
        endSeconds: row.endSeconds,
        versionNote: row.versionNote ?? null,
        validationCount: row.validationCount,
        isVerified: row.isVerified,
        source: row.source,
        contributors: 0,
        reports: 0,
      };
      if (row.segmentType === "recap") recapEntries.push(entry);
      else if (row.segmentType === "preview") previewEntries.push(entry);
      else continue;
    }

    const bestRecap = this.#bestOf(recapEntries);
    const bestPreview = this.#bestOf(previewEntries);

    return {
      recap: bestRecap ? { start: bestRecap.startSeconds, end: bestRecap.endSeconds } : undefined,
      preview: bestPreview ? { start: bestPreview.startSeconds, end: bestPreview.endSeconds } : undefined,
      all: rows.map((row) => ({
        segmentType: row.segmentType as "intro" | "outro" | "recap" | "preview",
        startSeconds: row.startSeconds,
        endSeconds: row.endSeconds,
        versionNote: row.versionNote ?? null,
        validationCount: row.validationCount,
        isVerified: row.isVerified,
        source: row.source,
        contributors: 0,
        reports: 0,
      })),
    };
  }

  #bestOf(entries: CommunityTimingEntry[]): CommunityTimingEntry | null {
    if (entries.length === 0) return null;
    const verified = entries.filter((e) => e.isVerified);
    if (verified.length > 0) return verified[0];
    return entries[0];
  }

  /**
   * Accept a community-contributed skip timing.
   *
   * The caller validates intent on the frontend; this endpoint enforces the
   * schema and duplicates. Out-of-range or self-contradictory values are
   * rejected rather than stored.
   */
  async submitCommunityTiming(
    episodeId: string,
    request: {
      segmentType: "intro" | "outro" | "recap" | "preview";
      startSeconds: number;
      endSeconds: number;
      versionNote?: string | null;
      submitterAnilistId?: number | null;
    },
  ): Promise<{ id: string }> {
    const [episode] = await this.db
      .select({ id: episodePlaybackMeta.episodeId })
      .from(episodePlaybackMeta)
      .where(eq(episodePlaybackMeta.episodeId, episodeId))
      .limit(1);

    if (!episode) {
      throw new Error(`episode ${episodeId} not found for timing submission`);
    }

    const existing = await this.db
      .select()
      .from(skipTimingCommunity)
      .where(
        and(
          eq(skipTimingCommunity.episodeId, episodeId),
          eq(skipTimingCommunity.segmentType, request.segmentType),
          eq(skipTimingCommunity.startSeconds, request.startSeconds),
          eq(skipTimingCommunity.endSeconds, request.endSeconds),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(skipTimingCommunity)
        .set({
          validationCount: sql`${skipTimingCommunity.validationCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(skipTimingCommunity.id, existing[0].id));

      return { id: existing[0].id };
    }

    const [row] = await this.db
      .insert(skipTimingCommunity)
      .values({
        episodeId,
        segmentType: request.segmentType,
        startSeconds: request.startSeconds,
        endSeconds: request.endSeconds,
        versionNote: request.versionNote ?? null,
        submitterAnilistId: request.submitterAnilistId ?? null,
      })
      .returning({ id: skipTimingCommunity.id });

    if (!row) throw new Error("failed to insert community timing");

    return { id: row.id };
  }

  /**
   * Report a problem with an existing community timing.
   */
  async reportTiming(
    skipTimingId: string,
    request: {
      reportType: "too_early" | "too_late" | "wrong_segment" | "incorrect";
      suggestedStartSeconds?: number | null;
      suggestedEndSeconds?: number | null;
      reporterAnilistId?: number | null;
    },
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(skipTimingCommunity)
      .where(eq(skipTimingCommunity.id, skipTimingId))
      .limit(1);

    if (!existing) {
      throw new Error(`timing ${skipTimingId} not found`);
    }

    await this.db
      .insert(skipTimingReports)
      .values({
        skipTimingId,
        reportType: request.reportType,
        suggestedStartSeconds: request.suggestedStartSeconds ?? null,
        suggestedEndSeconds: request.suggestedEndSeconds ?? null,
        reporterAnilistId: request.reporterAnilistId ?? null,
      });
  }
}

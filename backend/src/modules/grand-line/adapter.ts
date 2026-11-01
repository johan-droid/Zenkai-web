import { z } from "zod";
import {
  type GrandLineSaga,
  type GrandLineArc,
  type GrandLineEpisode,
  type GrandLineArcSummary,
  GrandLineSagaSchema,
  GrandLineArcSchema,
} from "./types.js";
import { SAGAS as DEFAULT_SAGAS, ARCS as DEFAULT_ARCS } from "./manifest.js";

/** Canonical Saga definitions and sequence in One Piece story order */
export interface SagaDefinition {
  id: string;
  name: string;
  order: number;
}

export const CANONICAL_SAGAS: readonly SagaDefinition[] = [
  { id: "east-blue", name: "East Blue Saga", order: 1 },
  { id: "alabasta", name: "Alabasta Saga", order: 2 },
  { id: "sky-island", name: "Sky Island Saga", order: 3 },
  { id: "water-seven", name: "Water Seven Saga", order: 4 },
  { id: "thriller-bark", name: "Thriller Bark Saga", order: 5 },
  { id: "summit-war", name: "Summit War Saga", order: 6 },
  { id: "fishman-island", name: "Fishman Island Saga", order: 7 },
  { id: "dressrosa", name: "Dressrosa Saga", order: 8 },
  { id: "four-emperors", name: "Four Emperors Saga", order: 9 },
  { id: "wano", name: "Wano Country Saga", order: 10 },
  { id: "final-saga", name: "Final Saga", order: 11 },
] as const;

/** Mapping of arc slugs to their canonical saga */
export const ARC_TO_SAGA_MAP: Record<
  string,
  { sagaId: string; sagaName: string; defaultOrder: number }
> = {
  // East Blue
  "romance-dawn": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 1 },
  "orange-town": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 2 },
  "syrup-village": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 3 },
  "gaimon": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 4 },
  "baratie": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 5 },
  "arlong-park": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 6 },
  "the-adventures-of-buggys-crew": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 7 },
  "buggys-crew": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 7 },
  "loguetown": { sagaId: "east-blue", sagaName: "East Blue Saga", defaultOrder: 8 },

  // Alabasta
  "reverse-mountain": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 9 },
  "whisky-peak": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 10 },
  "the-trials-of-koby-meppo": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 11 },
  "koby-meppo": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 11 },
  "little-garden": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 12 },
  "drum-island": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 13 },
  "alabasta": { sagaId: "alabasta", sagaName: "Alabasta Saga", defaultOrder: 14 },

  // Sky Island
  "jaya": { sagaId: "sky-island", sagaName: "Sky Island Saga", defaultOrder: 15 },
  "skypiea": { sagaId: "sky-island", sagaName: "Sky Island Saga", defaultOrder: 16 },

  // Water Seven
  "long-ring-long-land": { sagaId: "water-seven", sagaName: "Water Seven Saga", defaultOrder: 17 },
  "water-seven": { sagaId: "water-seven", sagaName: "Water Seven Saga", defaultOrder: 18 },
  "enies-lobby": { sagaId: "water-seven", sagaName: "Water Seven Saga", defaultOrder: 19 },
  "post-enies-lobby": { sagaId: "water-seven", sagaName: "Water Seven Saga", defaultOrder: 20 },

  // Thriller Bark
  "thriller-bark": { sagaId: "thriller-bark", sagaName: "Thriller Bark Saga", defaultOrder: 21 },

  // Summit War
  "sabaody-archipelago": { sagaId: "summit-war", sagaName: "Summit War Saga", defaultOrder: 22 },
  "amazon-lily": { sagaId: "summit-war", sagaName: "Summit War Saga", defaultOrder: 23 },
  "impel-down": { sagaId: "summit-war", sagaName: "Summit War Saga", defaultOrder: 24 },
  "if-you-could-go-anywhere-the-adventures-of-the-straw-hats": {
    sagaId: "summit-war",
    sagaName: "Summit War Saga",
    defaultOrder: 25,
  },
  "straw-hats-separation": {
    sagaId: "summit-war",
    sagaName: "Summit War Saga",
    defaultOrder: 25,
  },
  "marineford": { sagaId: "summit-war", sagaName: "Summit War Saga", defaultOrder: 26 },
  "post-war": { sagaId: "summit-war", sagaName: "Summit War Saga", defaultOrder: 27 },

  // Fishman Island
  "return-to-sabaody": { sagaId: "fishman-island", sagaName: "Fishman Island Saga", defaultOrder: 28 },
  "fishman-island": { sagaId: "fishman-island", sagaName: "Fishman Island Saga", defaultOrder: 29 },

  // Dressrosa
  "punk-hazard": { sagaId: "dressrosa", sagaName: "Dressrosa Saga", defaultOrder: 30 },
  "dressrosa": { sagaId: "dressrosa", sagaName: "Dressrosa Saga", defaultOrder: 31 },

  // Four Emperors
  "zou": { sagaId: "four-emperors", sagaName: "Four Emperors Saga", defaultOrder: 32 },
  "whole-cake-island": { sagaId: "four-emperors", sagaName: "Four Emperors Saga", defaultOrder: 33 },
  "reverie": { sagaId: "four-emperors", sagaName: "Four Emperors Saga", defaultOrder: 34 },

  // Wano
  "wano": { sagaId: "wano", sagaName: "Wano Country Saga", defaultOrder: 35 },

  // Final Saga
  "egghead": { sagaId: "final-saga", sagaName: "Final Saga", defaultOrder: 36 },
  "one-piece-fan-letter": { sagaId: "final-saga", sagaName: "Final Saga", defaultOrder: 37 },
  "warship-island-01-april-fools-2025": { sagaId: "final-saga", sagaName: "Final Saga", defaultOrder: 38 },
};

/** Raw schema for episodes as published by ladyisatis/one-pace-metadata v2 */
export const RawExternalEpisodeSchema = z.object({
  title: z.string().optional(),
  originaltitle: z.string().optional(),
  season: z.coerce.number().optional(),
  episode: z.union([z.string(), z.number()]).optional(),
  part: z.union([z.string(), z.number()]).optional(),
  absolute_number: z.coerce.number().optional(),
  air_date: z.string().optional(),
  released_at: z.string().optional(),
  description: z.string().optional(),
  synopsis: z.string().optional(),
  manga_chapters: z.string().optional(),
  mangaChapters: z.string().optional(),
  anime_episodes: z.string().optional(),
  animeEpisodes: z.string().optional(),
  duration: z.string().optional(),
  crc32: z.string().optional(),
  resolution: z.string().optional(),
  watch_url: z.string().url().optional(),
  watchUrl: z.string().url().optional(),
  downloads: z
    .array(
      z.object({
        url: z.string().url(),
        quality: z.string(),
      }),
    )
    .optional(),
});

export type RawExternalEpisode = z.infer<typeof RawExternalEpisodeSchema>;

/** Raw schema for arcs as published by ladyisatis/one-pace-metadata v2 */
export const RawExternalArcSchema = z.object({
  slug: z.string().optional(),
  id: z.string().optional(),
  title: z.string(),
  sort_title: z.string().optional(),
  description: z.string().optional(),
  synopsis: z.string().optional(),
  saga: z.string().optional(),
  part: z.union([z.string(), z.number()]).optional(),
  order: z.coerce.number().optional(),
  poster: z.string().optional(),
  duration: z.string().optional(),
  manga_chapters: z.string().optional(),
  anime_episodes: z.string().optional(),
  episodes: z.array(z.union([z.string(), RawExternalEpisodeSchema])),
});

export type RawExternalArc = z.infer<typeof RawExternalArcSchema>;

/** Combined raw dataset schema */
export const RawExternalDatasetSchema = z.object({
  arcs: z.union([
    z.record(RawExternalArcSchema),
    z.array(RawExternalArcSchema),
  ]),
  episodes: z
    .union([
      z.record(RawExternalEpisodeSchema),
      z.array(
        RawExternalEpisodeSchema.and(
          z.object({ id: z.string().optional(), crc32: z.string().optional() }),
        ),
      ),
    ])
    .optional(),
  status: z
    .object({
      last_updated: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
});

export interface AdapterSnapshot {
  sagas: GrandLineSaga[];
  arcs: GrandLineArc[];
  episodesCount: number;
  lastUpdated: string;
  catalogVersion: string;
  source: string;
}

/**
 * Normalizes arc slug into canonical kebab-case format.
 */
function normalizeSlug(slugOrTitle: string): string {
  return slugOrTitle
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format episode numbers to consistent 2-digit minimum strings ("01", "02", "10").
 */
function formatEpisodeNumber(val: string | number, fallbackIndex: number): string {
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val).padStart(2, "0");
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    const num = parseInt(trimmed, 10);
    if (!Number.isNaN(num)) {
      return String(num).padStart(2, "0");
    }
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return String(fallbackIndex + 1).padStart(2, "0");
}

/**
 * Validates, transforms, and organizes untrusted external One Pace metadata into
 * Zenkai's strongly-typed Grand Line domain models.
 */
export function normalizeExternalMetadata(
  rawArcsInput: unknown,
  rawEpisodesInput?: unknown,
  metadata?: { version?: string; timestamp?: string },
): { sagas: GrandLineSaga[]; arcs: GrandLineArc[] } {
  // 1. Determine arc dictionary
  const arcEntries: Array<{ slug: string; data: RawExternalArc }> = [];

  if (Array.isArray(rawArcsInput)) {
    for (const item of rawArcsInput) {
      const parsedArc = RawExternalArcSchema.parse(item);
      const slug = parsedArc.slug || parsedArc.id || normalizeSlug(parsedArc.title);
      arcEntries.push({ slug, data: parsedArc });
    }
  } else if (rawArcsInput && typeof rawArcsInput === "object") {
    for (const [key, val] of Object.entries(rawArcsInput)) {
      const parsedArc = RawExternalArcSchema.parse(val);
      const slug = parsedArc.slug || parsedArc.id || normalizeSlug(key);
      arcEntries.push({ slug, data: parsedArc });
    }
  } else {
    throw new Error("Invalid external metadata: raw arcs must be an object map or array");
  }

  // 2. Build episode lookup dictionary if provided
  const episodeLookup = new Map<string, RawExternalEpisode>();
  if (rawEpisodesInput && typeof rawEpisodesInput === "object") {
    if (Array.isArray(rawEpisodesInput)) {
      for (const ep of rawEpisodesInput) {
        const parsedEp = RawExternalEpisodeSchema.parse(ep);
        const epObj = ep as { id?: string; crc32?: string };
        const key = parsedEp.crc32 || epObj.id || epObj.crc32;
        if (key) {
          episodeLookup.set(key.toLowerCase(), parsedEp);
        }
      }
    } else {
      for (const [key, val] of Object.entries(rawEpisodesInput)) {
        const parsedEp = RawExternalEpisodeSchema.parse(val);
        episodeLookup.set(key.toLowerCase(), parsedEp);
      }
    }
  }

  // 3. Process Arcs and Episodes
  const normalizedArcs: GrandLineArc[] = [];
  const sagasArcMap = new Map<string, GrandLineArcSummary[]>();

  // Pre-seed saga maps
  for (const saga of CANONICAL_SAGAS) {
    sagasArcMap.set(saga.id, []);
  }

  for (let arcIndex = 0; arcIndex < arcEntries.length; arcIndex++) {
    const { slug, data: rawArc } = arcEntries[arcIndex];
    const canonicalMeta = ARC_TO_SAGA_MAP[slug] || {
      sagaId: "final-saga",
      sagaName: "Final Saga",
      defaultOrder: arcIndex + 1,
    };

    const episodes: GrandLineEpisode[] = [];
    let totalArcDurationMinutes = 0;

    for (let epIndex = 0; epIndex < rawArc.episodes.length; epIndex++) {
      const rawEpItem = rawArc.episodes[epIndex];
      let epDetail: RawExternalEpisode;

      if (typeof rawEpItem === "string") {
        // Look up by CRC32 or ID
        const resolved = episodeLookup.get(rawEpItem.toLowerCase());
        if (resolved) {
          epDetail = resolved;
        } else {
          // Construct minimal entry referencing the CRC32
          epDetail = {
            title: `${rawArc.title} ${formatEpisodeNumber(epIndex + 1, epIndex)}`,
            crc32: rawEpItem,
            episode: epIndex + 1,
          };
        }
      } else {
        epDetail = rawEpItem;
      }

      const episodeNumber = formatEpisodeNumber(
        epDetail.episode ?? epDetail.part ?? epIndex + 1,
        epIndex,
      );
      const episodeId = `${slug}-${episodeNumber}`;
      const title =
        epDetail.title ||
        epDetail.originaltitle ||
        `${rawArc.title} Episode ${episodeNumber}`;
      const mangaChapters = epDetail.manga_chapters || epDetail.mangaChapters || rawArc.manga_chapters || "";
      const animeEpisodes = epDetail.anime_episodes || epDetail.animeEpisodes || rawArc.anime_episodes || "";
      const duration = epDetail.duration || "30 min";
      const synopsis = epDetail.synopsis || epDetail.description || "";
      const watchUrl =
        epDetail.watch_url ||
        epDetail.watchUrl ||
        `https://onepace.net/en/watch#${slug}-${episodeNumber}`;

      // Approximate duration tracking
      const durationMatch = duration.match(/(\d+)\s*min/);
      if (durationMatch) {
        totalArcDurationMinutes += parseInt(durationMatch[1], 10);
      } else {
        totalArcDurationMinutes += 30;
      }

      episodes.push({
        id: episodeId,
        arcId: slug,
        episodeNumber,
        title,
        mangaChapters,
        animeEpisodes,
        duration,
        synopsis,
        watchUrl,
        downloads: epDetail.downloads || [],
        crc32: epDetail.crc32,
        releasedAt: epDetail.released_at || epDetail.air_date,
        resolution: epDetail.resolution,
      });
    }

    const arcDurationStr =
      rawArc.duration ||
      (totalArcDurationMinutes >= 60
        ? `${Math.floor(totalArcDurationMinutes / 60)} hr, ${totalArcDurationMinutes % 60} min`
        : `${totalArcDurationMinutes} min`);

    const arcSummary: GrandLineArcSummary = {
      id: slug,
      title: rawArc.title,
      order: rawArc.order ?? canonicalMeta.defaultOrder,
      episodeCount: episodes.length,
      duration: arcDurationStr,
      mangaChapters: rawArc.manga_chapters || (episodes[0]?.mangaChapters ?? ""),
      animeEpisodes: rawArc.anime_episodes || (episodes[0]?.animeEpisodes ?? ""),
      synopsis: rawArc.synopsis || rawArc.description || "",
    };

    const grandLineArc: GrandLineArc = {
      ...arcSummary,
      sagaId: canonicalMeta.sagaId,
      sagaName: canonicalMeta.sagaName,
      episodes,
    };

    normalizedArcs.push(grandLineArc);

    const sagaArcs = sagasArcMap.get(canonicalMeta.sagaId);
    if (sagaArcs) {
      sagaArcs.push(arcSummary);
    }
  }

  // 4. Construct Sagas
  const normalizedSagas: GrandLineSaga[] = CANONICAL_SAGAS.map((saga) => {
    const constituentArcs = sagasArcMap.get(saga.id) || [];
    // Sort arcs by order
    constituentArcs.sort((a, b) => a.order - b.order);
    const totalEpisodes = constituentArcs.reduce(
      (sum, a) => sum + a.episodeCount,
      0,
    );

    return {
      id: saga.id,
      name: saga.name,
      order: saga.order,
      arcCount: constituentArcs.length,
      episodeCount: totalEpisodes,
      arcs: constituentArcs,
    };
  });

  // Strictly validate against domain Zod contracts
  GrandLineSagaSchema.array().parse(normalizedSagas);
  GrandLineArcSchema.array().parse(normalizedArcs);

  return {
    sagas: normalizedSagas,
    arcs: normalizedArcs,
  };
}

/**
 * Backend Metadata Adapter: Maintains atomic in-memory catalogue snapshots,
 * manages validation, provides fallback resilience, and tracks synchronization timestamps.
 */
export class OnePaceMetadataAdapter {
  private activeSnapshot: AdapterSnapshot;
  private lastSuccessfulSync: string | null = null;
  private lastSyncAttempt: string | null = null;
  private catalogVersion: string = "2.0.0";
  private syncSource: string = "manifest";

  constructor() {
    const totalEpisodes = DEFAULT_ARCS.reduce(
      (sum, arc) => sum + arc.episodeCount,
      0,
    );
    this.activeSnapshot = {
      sagas: DEFAULT_SAGAS,
      arcs: DEFAULT_ARCS,
      episodesCount: totalEpisodes,
      lastUpdated: new Date().toISOString(),
      catalogVersion: "2.0.0",
      source: "manifest",
    };
  }

  /**
   * Return the current active immutable catalogue snapshot.
   */
  getSnapshot(): AdapterSnapshot {
    return this.activeSnapshot;
  }

  getSagas(): GrandLineSaga[] {
    return this.activeSnapshot.sagas;
  }

  getArcs(): GrandLineArc[] {
    return this.activeSnapshot.arcs;
  }

  getSyncInfo() {
    return {
      lastUpdated: this.activeSnapshot.lastUpdated,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastSyncAttempt: this.lastSyncAttempt,
      catalogVersion: this.catalogVersion,
      source: this.syncSource,
      episodesCount: this.activeSnapshot.episodesCount,
      arcsCount: this.activeSnapshot.arcs.length,
      sagasCount: this.activeSnapshot.sagas.length,
    };
  }

  /**
   * Ingest external data atomically. If validation succeeds, updates active snapshot.
   * If validation fails, safely preserves existing snapshot and returns error.
   */
  ingest(
    rawArcs: unknown,
    rawEpisodes?: unknown,
    options?: { version?: string; timestamp?: string; source?: string },
  ): { success: boolean; error?: string } {
    const attemptTime = new Date().toISOString();
    this.lastSyncAttempt = attemptTime;

    try {
      const { sagas, arcs } = normalizeExternalMetadata(
        rawArcs,
        rawEpisodes,
        options,
      );

      const episodesCount = arcs.reduce((sum, arc) => sum + arc.episodeCount, 0);
      const timestamp = options?.timestamp || attemptTime;
      const version = options?.version || this.catalogVersion;
      const source = options?.source || "external-feed";

      // Atomic replacement
      this.activeSnapshot = {
        sagas,
        arcs,
        episodesCount,
        lastUpdated: timestamp,
        catalogVersion: version,
        source,
      };

      this.lastSuccessfulSync = attemptTime;
      this.catalogVersion = version;
      this.syncSource = source;

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Metadata validation failed: ${message}`,
      };
    }
  }

  /**
   * Ingest combined data.json format.
   */
  ingestCombined(
    rawCombined: unknown,
    options?: { version?: string; source?: string },
  ): { success: boolean; error?: string } {
    try {
      const parsed = RawExternalDatasetSchema.parse(rawCombined);
      return this.ingest(parsed.arcs, parsed.episodes, {
        version: options?.version || parsed.status?.version,
        timestamp: parsed.status?.last_updated,
        source: options?.source || "data.json",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Combined dataset validation failed: ${message}`,
      };
    }
  }

  /**
   * Fetch from a remote metadata feed with timeout and fallback.
   */
  async fetchAndSync(
    feedUrl = "https://raw.githubusercontent.com/ladyisatis/one-pace-metadata/v2/metadata/data.json",
    fetchFn: typeof fetch = fetch,
  ): Promise<{ success: boolean; error?: string }> {
    const attemptTime = new Date().toISOString();
    this.lastSyncAttempt = attemptTime;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetchFn(feedUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          success: false,
          error: `Remote metadata server returned HTTP ${res.status}`,
        };
      }

      const json = await res.json();
      return this.ingestCombined(json, { source: "remote:ladyisatis-v2" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Remote metadata fetch failed: ${message}`,
      };
    }
  }
}

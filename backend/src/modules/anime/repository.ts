/**
 * Catalogue persistence (P1).
 *
 * AniList is a cache, not the database: every read path in this service is
 * meant to be answerable from Postgres. The repository owns the upsert,
 * including the fan-out rows (genres, relations, external ids, search index)
 * that must stay consistent with the main record.
 *
 * Upserts key on the provider id rather than the local uuid, because the
 * provider id is the only identifier guaranteed stable across re-syncs.
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  anime,
  animeExternalIds,
  animeGenres,
  animeRelations,
  animeSearchIndex,
  animeStudios,
  episodes,
  episodeExternalIds,
} from "../../db/schema/index.js";
import { normalizeTitle } from "../../domain/media.js";
import type {
  AnimeDetail,
  AnimeSummary,
  ProviderEpisode,
} from "../../providers/metadata/types.js";

export interface AnimeListOptions {
  limit: number;
  offset: number;
  season?: string;
  seasonYear?: number;
  status?: string;
  genre?: string;
}

/** Stable, URL-safe identifier derived from the canonical title. */
export function slugify(title: string, anilistId: string): string {
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 120);
  // The id suffix guarantees uniqueness for titles that normalise identically.
  return `${base || "anime"}-${anilistId}`;
}

export class AnimeRepository {
  constructor(private readonly db: Db) {}

  /** Insert or update one record and everything hanging off it. */
  async upsert(summary: AnimeSummary): Promise<string> {
    const anilistId = Number(summary.anilistId);

    const [row] = await this.db
      .insert(anime)
      .values({
        slug: slugify(summary.canonicalTitle, summary.anilistId),
        anilistId: Number.isFinite(anilistId) ? anilistId : null,
        canonicalTitle: summary.canonicalTitle,
        synonyms: summary.titles.synonyms,
        romajiTitle: summary.titles.romaji,
        englishTitle: summary.titles.english,
        nativeTitle: summary.titles.native,
        description: summary.description,
        coverUrl: summary.coverUrl,
        coverImageLarge: summary.coverImageLarge,
        bannerUrl: summary.bannerUrl,
        type: "ANIME",
        format: summary.format,
        status: summary.status,
        isAdult: summary.isAdult,
        year: summary.year,
        season: summary.season,
        seasonYear: summary.seasonYear,
        averageScore: summary.averageScore != null ? String(summary.averageScore) : null,
        popularity: summary.popularity,
        favourites: summary.favourites,
        totalEpisodes: summary.totalEpisodes,
        durationMinutes: summary.durationMinutes,
        sourceUpdatedAt: summary.sourceUpdatedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        // `anilist_id` carries a unique constraint, which is what makes this
        // an idempotent upsert rather than an accumulating one.
        target: anime.anilistId,
        set: {
          canonicalTitle: summary.canonicalTitle,
          synonyms: summary.titles.synonyms,
          romajiTitle: summary.titles.romaji,
          englishTitle: summary.titles.english,
          nativeTitle: summary.titles.native,
          description: summary.description,
          coverUrl: summary.coverUrl,
          coverImageLarge: summary.coverImageLarge,
          bannerUrl: summary.bannerUrl,
          format: summary.format,
          status: summary.status,
          year: summary.year,
          season: summary.season,
          seasonYear: summary.seasonYear,
          averageScore:
            summary.averageScore != null ? String(summary.averageScore) : null,
          popularity: summary.popularity,
          favourites: summary.favourites,
          totalEpisodes: summary.totalEpisodes,
          durationMinutes: summary.durationMinutes,
          sourceUpdatedAt: summary.sourceUpdatedAt,
          updatedAt: new Date(),
        },
      })
      .returning({ id: anime.id });

    const localId = row.id;
    if (!localId) {
      throw new Error(`upsert returned no row for anilist ${summary.anilistId}`);
    }

    await Promise.all([
      this.#replaceGenres(localId, summary.genres),
      this.#replaceStudios(localId, summary.studios),
      this.#replaceExternalIds(localId, summary.externalIds),
      this.#upsertSearchIndex(localId, summary),
    ]);

    return localId;
  }

  /**
   * Genres are replaced rather than appended.
   *
   * Appending would let genre filters drift as upstream renames a tag, and
   * there is no history worth keeping for a set this small.
   */
  async #replaceGenres(animeId: string, genres: string[]): Promise<void> {
    await this.db.delete(animeGenres).where(eq(animeGenres.animeId, animeId));
    if (genres.length === 0) return;

    await this.db
      .insert(animeGenres)
      .values(genres.map((genre) => ({ animeId, genre })))
      .onConflictDoNothing();
  }

  async #replaceStudios(animeId: string, studios: string[]): Promise<void> {
    await this.db.delete(animeStudios).where(eq(animeStudios.animeId, animeId));
    if (studios.length === 0) return;

    await this.db
      .insert(animeStudios)
      .values(studios.map((name) => ({ animeId, studioName: name, isMain: false })))
      .onConflictDoNothing();
  }

  async #replaceExternalIds(
    animeId: string,
    externalIds: Record<string, string | undefined>,
  ): Promise<void> {
    const entries = Object.entries(externalIds).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    );
    if (entries.length === 0) return;

    await this.db
      .insert(animeExternalIds)
      .values(entries.map(([idType, externalId]) => ({ animeId, idType, externalId })))
      .onConflictDoUpdate({
        target: [animeExternalIds.animeId, animeExternalIds.idType],
        set: { externalId: sql`excluded.external_id` },
      });
  }

  /**
   * Maintain a normalised token blob for search.
   *
   * Every known spelling is folded into one row, so a search for "Kimi no Na wa"
   * still matches a record whose canonical title is "Your Name".
   */
  async #upsertSearchIndex(animeId: string, summary: AnimeSummary): Promise<void> {
    const candidates = [
      summary.canonicalTitle,
      summary.titles.romaji,
      summary.titles.english,
      summary.titles.native,
      ...summary.titles.synonyms,
    ].filter((value): value is string => typeof value === "string" && value.trim() !== "");

    const tokens = candidates
      .map(normalizeTitle)
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index);

    if (tokens.length === 0) return;

    await this.db
      .insert(animeSearchIndex)
      .values({
        animeId,
        normalized: tokens.join(" "),
        // The canonical title is always first in the candidate list.
        isPrimary: tokens[0] === normalizeTitle(summary.canonicalTitle),
      })
      .onConflictDoUpdate({
        target: animeSearchIndex.animeId,
        set: { normalized: tokens.join(" ") },
      });
  }

/** Full detail plus relations and external ids, for `GET /anime/:id`. */
  async getByAnilistId(anilistId: string): Promise<Record<string, any> | null> {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) return null;

    const [record] = await this.db
      .select()
      .from(anime)
      .where(eq(anime.anilistId, numericId))
      .limit(1);
    if (!record) return null;

    const [genres, studios, relations, externalIds] = await Promise.all([
      this.db
        .select({ genre: animeGenres.genre })
        .from(animeGenres)
        .where(eq(animeGenres.animeId, record.id)),
      this.db
        .select({ studioName: animeStudios.studioName })
        .from(animeStudios)
        .where(eq(animeStudios.animeId, record.id)),
      this.db.select().from(animeRelations).where(eq(animeRelations.animeId, record.id)),
      this.db
        .select({ idType: animeExternalIds.idType, externalId: animeExternalIds.externalId })
        .from(animeExternalIds)
        .where(eq(animeExternalIds.animeId, record.id)),
    ]);

    return {
      ...record,
      genres: genres.map((row) => row.genre),
      studios: studios.map((row) => row.studioName),
      relations,
      externalIds: Object.fromEntries(externalIds.map((row) => [row.idType, row.externalId])),
    };
  }

  async getLocalIdByAnilistId(anilistId: string): Promise<string | null> {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) return null;

    const [record] = await this.db
      .select({ id: anime.id })
      .from(anime)
      .where(eq(anime.anilistId, numericId))
      .limit(1);

    return record?.id ?? null;
  }

  /**
   * Paginated catalogue listing.
   *
   * Reads the database rather than AniList: this endpoint is the one most likely
   * to be hit by every home-page row at once, and proxying it would spend the
   * upstream rate limit on data we already hold.
   */
  async list(options: AnimeListOptions): Promise<{ items: Record<string, any>[]; total: number }> {
    const conditions = [];

    if (options.season && options.seasonYear) {
      conditions.push(
        and(eq(anime.season, options.season), eq(anime.seasonYear, options.seasonYear)),
      );
    }
    if (options.status) conditions.push(eq(anime.status, options.status));

    const base = conditions.length > 0 ? and(...conditions) : undefined;

    // A genre filter has to be applied inside the query, not on the returned
    // page: filtering 20 of 50 rows down to 3 would leave most pages empty.
    const rows = options.genre
      ? await this.db
          .select({ record: anime })
          .from(anime)
          .innerJoin(animeGenres, eq(animeGenres.animeId, anime.id))
          .where(and(base, eq(animeGenres.genre, options.genre)))
          // Popularity correlates most reliably with "what people are actually
          // watching", so it drives the default order; score breaks ties.
          .orderBy(desc(anime.popularity), desc(anime.averageScore))
          .limit(options.limit)
          .offset(options.offset)
      : await this.db
          .select()
          .from(anime)
          .where(base)
          .orderBy(desc(anime.popularity), desc(anime.averageScore))
          .limit(options.limit)
          .offset(options.offset);

    const [{ count }] = options.genre
      ? await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(anime)
          .innerJoin(animeGenres, eq(animeGenres.animeId, anime.id))
          .where(and(base, eq(animeGenres.genre, options.genre)))
      : await this.db.select({ count: sql<number>`count(*)::int` }).from(anime).where(base);

    return {
      items: rows.map((row: any) => (row.record ? row.record : row)),
      total: Number(count ?? 0),
    };
  }

  /** Title search across the normalised index. */
  async search(query: string, limit: number): Promise<Record<string, any>[]> {
    const normalized = normalizeTitle(query);
    if (!normalized) return [];

    const rows = await this.db
      .select({ record: anime })
      .from(anime)
      .innerJoin(animeSearchIndex, eq(animeSearchIndex.animeId, anime.id))
      .where(
        or(
          ilike(animeSearchIndex.normalized, `%${normalized}%`),
          // Raw predicate kept as a fallback for exact substrings the
          // normaliser would mangle (punctuation-heavy titles).
          ilike(anime.canonicalTitle, `%${query}%`),
        ),
      )
      .orderBy(desc(anime.popularity))
      .limit(limit);

    return rows.map((row) => row.record);
  }

/** Persist relation edges, replacing whatever was there before. */
  async replaceRelations(animeId: string, detail: AnimeDetail): Promise<void> {
    await this.db.delete(animeRelations).where(eq(animeRelations.animeId, animeId));
    if (detail.relations.length === 0) return;

    await this.db
      .insert(animeRelations)
      .values(
        detail.relations.map((relation) => ({
          animeId,
          relationType: relation.type,
          relatedAnimeId: relation.anilistId,
          relatedTitle: relation.title ?? null,
          coverUrl: relation.coverUrl ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * Upsert the episode catalog (P4).
   *
   * Conflicts update only the fields a provider can genuinely improve, leaving
   * values we derived ourselves untouched, and never renumber an episode.
   */
  async upsertEpisodes(animeId: string, incoming: ProviderEpisode[]): Promise<number> {
    if (incoming.length === 0) return 0;

    const inserted = await this.db
      .insert(episodes)
      .values(
        incoming.map((episode) => ({
          animeId,
          episodeNumber: episode.episodeNumber,
          absoluteNumber: episode.absoluteNumber,
          title: episode.title,
          description: episode.description,
          durationSeconds: episode.durationSeconds,
          thumbnailUrl: episode.thumbnailUrl,
          airDate: episode.airDate ? new Date(episode.airDate * 1000) : null,
          isFiller: episode.isFiller,
        })),
      )
      .onConflictDoUpdate({
        target: [episodes.animeId, episodes.episodeNumber],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          durationSeconds: sql`excluded.duration_seconds`,
          thumbnailUrl: sql`excluded.thumbnail_url`,
          isFiller: sql`excluded.is_filler`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: episodes.id, episodeNumber: episodes.episodeNumber });

    // Link provider-native episode ids so playback skips a re-lookup per play.
    const withExternal = incoming.filter((episode) => episode.externalId);
    if (withExternal.length > 0) {
      const byNumber = new Map(inserted.map((row) => [row.episodeNumber, row.id]));

      await this.db
        .insert(episodeExternalIds)
        .values(
          withExternal
            .map((episode) => ({
              episodeId: byNumber.get(episode.episodeNumber)!,
              providerSlug: "anilist",
              externalId: episode.externalId!,
              providerEpisodeNumber: episode.episodeNumber,
            }))
            .filter((row) => Boolean(row.episodeId)),
        )
        .onConflictDoNothing();
    }

    return inserted.length;
  }

  /** Episodes for one title, oldest first. */
  async listEpisodes(animeId: string): Promise<Record<string, any>[]> {
    return this.db
      .select()
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .orderBy(episodes.episodeNumber);
  }

  /** One episode row by local id, used by the playback resolver. */
  async getEpisode(episodeId: string): Promise<Record<string, any> | null> {
    const [record] = await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);
    return record ?? null;
  }

  /**
   * Parent titles by local uuid, with genres and external ids attached.
   *
   * The playback route holds a local uuid (the episode's `animeId`) but the
   * resolver needs provider ids. Fetching the parent with its cross-references in
   * one query avoids a second round trip on the play path.
   */
  async listParentTitles(animeIds: string[]): Promise<Record<string, any>[]> {
    if (animeIds.length === 0) return [];

    const records = await this.db.select().from(anime).where(inArray(anime.id, animeIds));
    if (records.length === 0) return [];

    const ids = records.map((record) => record.id);
    const [genres, externalIds] = await Promise.all([
      this.db.select().from(animeGenres).where(inArray(animeGenres.animeId, ids)),
      this.db.select().from(animeExternalIds).where(inArray(animeExternalIds.animeId, ids)),
    ]);

    const genresByAnime = new Map<string, string[]>();
    for (const row of genres) {
      const list = genresByAnime.get(row.animeId);
      if (list) list.push(row.genre);
      else genresByAnime.set(row.animeId, [row.genre]);
    }

    const idsByAnime = new Map<string, Record<string, string>>();
    for (const row of externalIds) {
      const map = idsByAnime.get(row.animeId);
      if (map) map[row.idType] = row.externalId;
      else idsByAnime.set(row.animeId, { [row.idType]: row.externalId });
    }

    return records.map((record) => ({
      ...record,
      genres: genresByAnime.get(record.id) ?? [],
      externalIds: idsByAnime.get(record.id) ?? {},
    }));
  }

  /** Provider-native episode ids already known for an episode. */
  async getEpisodeExternalIds(
    episodeId: string,
  ): Promise<Array<{ providerSlug: string; externalId: string }>> {
    return this.db
      .select({
        providerSlug: episodeExternalIds.providerSlug,
        externalId: episodeExternalIds.externalId,
      })
      .from(episodeExternalIds)
      .where(eq(episodeExternalIds.episodeId, episodeId));
  }

  /** Titles the sync jobs should refresh: never-synced ones plus stale ones. */
  async listForSync(
    limit: number,
    staleAfterSeconds: number,
  ): Promise<Array<{ id: string; anilistId: string }>> {
    const cutoff = Math.floor(Date.now() / 1000) - staleAfterSeconds;

    const rows = await this.db
      .select({ id: anime.id, anilistId: anime.anilistId })
      .from(anime)
      .where(or(sql`${anime.sourceUpdatedAt} is null`, sql`${anime.sourceUpdatedAt} < ${cutoff}`))
      .orderBy(anime.sourceUpdatedAt)
      .limit(limit);

    // AniList ids are nullable, and a row without one cannot be re-fetched.
    return rows
      .filter((row) => row.anilistId != null)
      .map((row) => ({ id: row.id, anilistId: String(row.anilistId) }));
  }

  /** Row count, used by the health check. */
  async count(): Promise<number> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(anime);
    return Number(count ?? 0);
  }
}
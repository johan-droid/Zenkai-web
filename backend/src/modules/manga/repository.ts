/**
 * Manga persistence (P11).
 *
 * Mirrors `AnimeRepository`: AniList/MangaDex are caches and cross-references,
 * the database is the catalogue. Upserts key on the provider id because that is
 * the only identifier stable across re-syncs.
 */

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  manga,
  mangaChapters,
  mangaChapterPages,
  mangaCredits,
  mangaExternalIds,
  mangaGenres,
  mangaRelations,
  mangaSearchIndex,
} from "../../db/schema/index.js";
import { normalizeTitle } from "../../domain/media.js";
import type { ChapterPages, MangaDetail, MangaSummary, ProviderChapter } from "../../providers/manga/types.js";

/**
 * Catalogue orderings a client may ask for (P17 browse).
 *
 * Mirrors the anime vocabulary minus the formats that only make sense for
 * anime. "trending" is absent for the same reason: it is an upstream signal.
 */
export const MANGA_SORTS = [
  "followed",
  "rating",
  "newest",
  "recently-updated",
  "title",
] as const;

export type MangaSort = (typeof MANGA_SORTS)[number];

export interface MangaListOptions {
  limit: number;
  offset: number;
  genre?: string;
  status?: string;
  /** Hide explicit titles unless the caller asks for them. */
  includeAdult?: boolean;
  sort?: MangaSort;
}

/** Stable, URL-safe identifier derived from the canonical title. */
export function mangaSlug(title: string, providerId: string): string {
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 120);
  return `${base || "manga"}-${providerId}`;
}

export class MangaRepository {
  constructor(private readonly db: Db) {}

  /** Insert or update one record and everything hanging off it. */
  async upsert(summary: MangaSummary): Promise<string> {
    const providerId = summary.providerId;

    const [row] = await this.db
      .insert(manga)
      .values({
        slug: mangaSlug(summary.titles.primary, providerId),
        mangadexId: providerId || null,
        canonicalTitle: summary.titles.primary,
        synonyms: summary.titles.alternates,
        altTitles: summary.titles.alternates,
        description: summary.description,
        coverUrl: summary.coverUrl,
        coverImageLarge: summary.coverImageLarge,
        status: summary.status,
        contentRating: summary.contentRating,
        isAdult: summary.isAdult,
        year: summary.year,
        demographics: summary.demographics,
        totalChapters: summary.totalChapters,
        totalVolumes: summary.totalVolumes,
        translatedChapterCount: summary.translatedChapterCount,
        followedCount: summary.followedCount,
        rating: summary.rating,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: manga.mangadexId,
        set: {
          canonicalTitle: summary.titles.primary,
          synonyms: summary.titles.alternates,
          altTitles: summary.titles.alternates,
          description: summary.description,
          coverUrl: summary.coverUrl,
          coverImageLarge: summary.coverImageLarge,
          status: summary.status,
          contentRating: summary.contentRating,
          isAdult: summary.isAdult,
          year: summary.year,
          demographics: summary.demographics,
          totalChapters: summary.totalChapters,
          totalVolumes: summary.totalVolumes,
          translatedChapterCount: summary.translatedChapterCount,
          followedCount: summary.followedCount,
          rating: summary.rating,
          updatedAt: new Date(),
        },
      })
      .returning({ id: manga.id });

    const localId = row?.id;
    if (!localId) {
      throw new Error(`upsert returned no row for mangadex ${providerId}`);
    }

    await Promise.all([
      this.#replaceGenres(localId, summary.genres.map((genre) => genre.name)),
      this.#replaceCredits(localId, [
        ...summary.authors.map((name) => ({ role: "AUTHOR" as const, name })),
        ...summary.artists.map((name) => ({ role: "ARTIST" as const, name })),
      ]),
      this.#replaceExternalIds(localId, summary.externalIds),
      this.#upsertSearchIndex(localId, summary),
    ]);

    return localId;
  }

  /** Genres are replaced, not appended, so upstream renames do not accumulate. */
  async #replaceGenres(mangaId: string, genres: string[]): Promise<void> {
    await this.db.delete(mangaGenres).where(eq(mangaGenres.mangaId, mangaId));
    if (genres.length === 0) return;

    await this.db
      .insert(mangaGenres)
      .values(genres.map((genre) => ({ mangaId, genre })))
      .onConflictDoNothing();
  }

  async #replaceCredits(
    mangaId: string,
    credits: Array<{ role: string; name: string }>,
  ): Promise<void> {
    await this.db.delete(mangaCredits).where(eq(mangaCredits.mangaId, mangaId));
    if (credits.length === 0) return;

    await this.db
      .insert(mangaCredits)
      .values(credits.map((credit) => ({ mangaId, role: credit.role, name: credit.name })))
      .onConflictDoNothing();
  }

  async #replaceExternalIds(
    mangaId: string,
    externalIds: Record<string, string | undefined> | undefined,
  ): Promise<void> {
    const entries = Object.entries(externalIds ?? {}).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    );
    if (entries.length === 0) return;

    await this.db
      .insert(mangaExternalIds)
      .values(entries.map(([idType, externalId]) => ({ mangaId, idType, externalId })))
      .onConflictDoUpdate({
        target: [mangaExternalIds.mangaId, mangaExternalIds.idType],
        set: { externalId: sql`excluded.external_id` },
      });
  }

  /** Fold every known title spelling into one searchable token blob. */
  async #upsertSearchIndex(mangaId: string, summary: MangaSummary): Promise<void> {
    const tokens = [summary.titles.primary, ...summary.titles.alternates]
      .map(normalizeTitle)
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index);

    if (tokens.length === 0) return;

    const primary = normalizeTitle(summary.titles.primary);

    await this.db
      .insert(mangaSearchIndex)
      .values({ mangaId, normalized: tokens.join(" "), isPrimary: true })
      .onConflictDoUpdate({
        target: mangaSearchIndex.mangaId,
        set: { normalized: tokens.join(" ") },
      });
  }

  async getByProviderId(providerId: string): Promise<Record<string, any> | null> {
    if (!providerId) return null;

    const [record] = await this.db
      .select()
      .from(manga)
      .where(eq(manga.mangadexId, providerId))
      .limit(1);
    if (!record) return null;

    return { ...record, ...(await this.#fanOut(record.id)) };
  }

  async getById(localId: string): Promise<Record<string, any> | null> {
    const [record] = await this.db.select().from(manga).where(eq(manga.id, localId)).limit(1);
    if (!record) return null;

    return { ...record, ...(await this.#fanOut(record.id)) };
  }

  async getLocalIdByProviderId(providerId: string): Promise<string | null> {
    if (!providerId) return null;

    const [record] = await this.db
      .select({ id: manga.id })
      .from(manga)
      .where(eq(manga.mangadexId, providerId))
      .limit(1);

    return record?.id ?? null;
  }

  /**
   * Look up a manga row by an external provider id.
   *
   * The `manga_external_ids` table stores cross-references (anilist, mal, kitsu,
   * ...) for titles that have already been synced, so a bridge lookup from one
   * provider's id space to ours does not require a second provider call.
   */
  async getByExternalId(idType: string, externalId: string): Promise<Record<string, any> | null> {
    if (!externalId) return null;

    const [record] = await this.db
      .select({ id: manga.id, mangadexId: manga.mangadexId })
      .from(mangaExternalIds)
      .innerJoin(manga, eq(manga.id, mangaExternalIds.mangaId))
      .where(and(eq(mangaExternalIds.idType, idType), eq(mangaExternalIds.externalId, externalId)))
      .limit(1);

    if (!record || !record.mangadexId) return null;

    return this.getByProviderId(record.mangadexId);
  }

  /** Genres, credits, relations and external ids for one title. */
  async #fanOut(mangaId: string): Promise<Record<string, unknown>> {
    const [genres, credits, relations, externalIds] = await Promise.all([
      this.db
        .select({ genre: mangaGenres.genre, group: mangaGenres.group })
        .from(mangaGenres)
        .where(eq(mangaGenres.mangaId, mangaId)),
      this.db.select().from(mangaCredits).where(eq(mangaCredits.mangaId, mangaId)),
      this.db.select().from(mangaRelations).where(eq(mangaRelations.mangaId, mangaId)),
      this.db
        .select({ idType: mangaExternalIds.idType, externalId: mangaExternalIds.externalId })
        .from(mangaExternalIds)
        .where(eq(mangaExternalIds.mangaId, mangaId)),
    ]);

    return {
      genres: genres.map((row) => row.genre),
      authors: credits.filter((c) => c.role === "AUTHOR").map((c) => c.name),
      artists: credits.filter((c) => c.role === "ARTIST").map((c) => c.name),
      relations,
      externalIds: Object.fromEntries(externalIds.map((row) => [row.idType, row.externalId])),
    };
  }

  async list(options: MangaListOptions): Promise<{ items: Record<string, any>[]; total: number }> {
    const conditions = [];
    if (options.status) conditions.push(eq(manga.status, options.status));
    if (!options.includeAdult) conditions.push(eq(manga.isAdult, false));

    const base = conditions.length > 0 ? and(...conditions) : undefined;

    // A genre filter has to run inside the query, not on the returned page,
    // or most pages come back empty.
    // Matched case-insensitively, like the anime repository: the stored genre is
    // the provider's spelling ("Action"), so an exact match makes "action" look
    // like a filter that returns nothing rather than one that is forgiving.
    const order: Record<MangaSort, ReturnType<typeof desc>[]> = {
      followed: [desc(manga.followedCount)],
      // `rating` is a short string grade, so it is ordered as text. That is the
      // provider's own ordering of the column and is what the manga detail
      // shows; mixing it with a numeric sort would be meaningless.
      rating: [desc(manga.rating), desc(manga.followedCount)],
      newest: [desc(manga.year), desc(manga.followedCount)],
      "recently-updated": [desc(manga.updatedAt), desc(manga.followedCount)],
      title: [asc(manga.canonicalTitle)],
    };
    const orderBy = order[options.sort ?? "followed"];

    const rows = options.genre
      ? await this.db
          .select({ record: manga })
          .from(manga)
          .innerJoin(mangaGenres, eq(mangaGenres.mangaId, manga.id))
          .where(and(base, sql`lower(${mangaGenres.genre}) = lower(${options.genre})`))
          .orderBy(...orderBy)
          .limit(options.limit)
          .offset(options.offset)
      : await this.db
          .select()
          .from(manga)
          .where(base)
          .orderBy(...orderBy)
          .limit(options.limit)
          .offset(options.offset);

    const [{ count }] = options.genre
      ? await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(manga)
          .innerJoin(mangaGenres, eq(mangaGenres.mangaId, manga.id))
          .where(and(base, sql`lower(${mangaGenres.genre}) = lower(${options.genre})`))
      : await this.db.select({ count: sql<number>`count(*)::int` }).from(manga).where(base);

    return {
      items: rows.map((row: any) => (row.record ? row.record : row)),
      total: Number(count ?? 0),
    };
  }

  async search(query: string, limit: number): Promise<Record<string, any>[]> {
    const normalized = normalizeTitle(query);
    if (!normalized) return [];

    const rows = await this.db
      .select({ record: manga })
      .from(manga)
      .innerJoin(mangaSearchIndex, eq(mangaSearchIndex.mangaId, manga.id))
      .where(
        or(
          ilike(mangaSearchIndex.normalized, `%${normalized}%`),
          // Raw predicate as a fallback: the normaliser strips punctuation that
          // some titles are legitimately searched by.
          ilike(manga.canonicalTitle, `%${query}%`),
        ),
      )
      .orderBy(desc(manga.followedCount))
      .limit(limit);

    return rows.map((row) => row.record);
  }

  async replaceRelations(mangaId: string, detail: MangaDetail): Promise<void> {
    await this.db.delete(mangaRelations).where(eq(mangaRelations.mangaId, mangaId));
    if (detail.relations.length === 0) return;

    await this.db
      .insert(mangaRelations)
      .values(
        detail.relations.map((relation) => ({
          mangaId,
          relationType: relation.type,
          relatedMangaId: relation.providerId,
          relatedTitle: relation.title ?? null,
          coverUrl: relation.coverUrl ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * Replace a title's external provider ids.
   *
   * Public so the manga service can seed the anilist cross-reference after a
   * bridge lookup without re-syncing the whole title.
   */
  async replaceExternalIds(
    mangaId: string,
    externalIds: Record<string, string | undefined> | undefined,
  ): Promise<void> {
    await this.#replaceExternalIds(mangaId, externalIds);
  }

  /**
   * Upsert the chapter feed (P11).
   *
   * Identity is (manga, language, chapter) rather than the provider uuid, so
   * re-fetching the feed updates rows in place instead of accumulating
   * duplicates. Chapters that disappear upstream are left alone: a partial feed
   * is a pagination artefact, not a deletion.
   */
  async upsertChapters(mangaId: string, incoming: ProviderChapter[]): Promise<number> {
    if (incoming.length === 0) return 0;

    return this.db
      .insert(mangaChapters)
      .values(
        incoming.map((chapter) => ({
          mangaId,
          mangadexChapterId: chapter.externalId,
          chapterNumber: chapter.chapterNumber,
          volume: chapter.volume,
          title: chapter.title,
          language: chapter.language,
          pages: chapter.pages,
          translatedChapterCount: 0,
          scanlationGroup: chapter.scanlationGroup,
          publishedAt: chapter.publishedAt ? new Date(chapter.publishedAt) : null,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [mangaChapters.mangaId, mangaChapters.language, mangaChapters.chapterNumber],
        set: {
          mangadexChapterId: sql`excluded.mangadex_chapter_id`,
          volume: sql`excluded.volume`,
          title: sql`excluded.title`,
          pages: sql`excluded.pages`,
          scanlationGroup: sql`excluded.scanlation_group`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: new Date(),
        },
      })
      .then((rows) => rows.length);
  }

  /**
   * Chapter list, oldest first.
   *
   * Ordering is numeric where possible: "10" must sort after "9", which a plain
   * text sort gets backwards. Chapter numbers are strings upstream ("12.5"), so
   * this parses defensively and falls back to text for non-numeric values.
   */
  async listChapters(
    mangaId: string,
    language?: string,
  ): Promise<Record<string, any>[]> {
    const conditions = [eq(mangaChapters.mangaId, mangaId)];
    if (language) conditions.push(eq(mangaChapters.language, language));

    return this.db
      .select()
      .from(mangaChapters)
      .where(and(...conditions))
      .orderBy(
        sql`nullif(regexp_replace(${mangaChapters.chapterNumber}, '[^0-9.]', '', 'g'), '')::numeric nulls last`,
        mangaChapters.chapterNumber,
      );
  }

  async getChapter(localId: string): Promise<Record<string, any> | null> {
    const [record] = await this.db
      .select()
      .from(mangaChapters)
      .where(eq(mangaChapters.id, localId))
      .limit(1);
    return record ?? null;
  }

  /** The newest chapter, for a "read latest" shortcut. */
  async getLatestChapter(
    mangaId: string,
    language?: string,
  ): Promise<Record<string, any> | null> {
    const chapters = await this.listChapters(mangaId, language);
    return chapters[chapters.length - 1] ?? null;
  }

  /**
   * Cached page list for a chapter (P12).
   *
   * Returned only while still valid: MangaDex@Home URLs are signed and expire,
   * so a stale row would hand the reader a broken image rather than a cheap hit.
   */
  async getChapterPages(chapterId: string): Promise<ChapterPages | null> {
    const rows = await this.db
      .select()
      .from(mangaChapterPages)
      .where(eq(mangaChapterPages.chapterId, chapterId))
      .orderBy(mangaChapterPages.pageNumber);

    if (rows.length === 0) return null;
    if (rows[0]!.expiresAt.getTime() <= Date.now()) return null;

    const first = rows[0]!;
    return {
      baseUrl: first.baseUrl,
      hash: first.hash ?? "",
      pages: rows.map((row) => ({ pageNumber: row.pageNumber, fileName: row.fileName })),
    };
  }

  /** Replace a chapter's cached pages, dropping any that no longer exist. */
  async replaceChapterPages(chapterId: string, pages: ChapterPages): Promise<void> {
    await this.db
      .delete(mangaChapterPages)
      .where(
        and(
          eq(mangaChapterPages.chapterId, chapterId),
          sql`${mangaChapterPages.pageNumber} > ${pages.pages.length}`,
        ),
      );

    // Signed URLs are valid for ~15 minutes; a shorter TTL avoids serving an
    // expired signature while still absorbing page-by-page navigation.
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await this.db
      .insert(mangaChapterPages)
      .values(
        pages.pages.map((page) => ({
          chapterId,
          pageNumber: page.pageNumber,
          fileName: page.fileName,
          baseUrl: pages.baseUrl,
          hash: pages.hash,
          expiresAt,
        })),
      )
      .onConflictDoUpdate({
        target: [mangaChapterPages.chapterId, mangaChapterPages.pageNumber],
        set: { baseUrl: pages.baseUrl, hash: pages.hash, expiresAt },
      });
  }

  /** Row count, for the health check. */
  async count(): Promise<number> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(manga);
    return Number(count ?? 0);
  }

  /** All distinct genres across the catalogue, alphabetically. */
  async listGenres(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ genre: mangaGenres.genre })
      .from(mangaGenres)
      .orderBy(mangaGenres.genre);
    return rows.map((row) => row.genre);
  }
}

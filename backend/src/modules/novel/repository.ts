/**
 * Novel persistence repository.
 *
 * Coordinates Postgres storage for novels, chapter listings, and read chapter content.
 * When the database is offline, operations fail fast and allow the service layer to
 * fall back to upstream providers and in-memory/Redis caches without blocking.
 */

import { and, asc, eq, or } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  novel,
  novelChapters,
  novelChapterContents,
  novelExternalIds,
} from "../../db/schema/index.js";
import type { NovelSummary, NovelChapter, NovelChapterContent } from "../../providers/novel/index.js";

export class NovelRepository {
  constructor(private readonly db: Db) {}

  async upsert(item: NovelSummary, source = "novelfire"): Promise<string> {
    const slug = (item.id || item.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const values = {
      slug,
      anilistId: item.anilistId || null,
      title: item.title,
      romajiTitle: item.romajiTitle || null,
      englishTitle: item.englishTitle || null,
      nativeTitle: item.nativeTitle || null,
      description: item.description || null,
      coverUrl: item.coverImage || null,
      bannerUrl: item.bannerImage || null,
      status: item.status || "UNKNOWN",
      genres: item.genres || [],
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      rating: item.averageScore ? String(item.averageScore) : null,
      source,
      startYear: item.startYear || null,
      updatedAt: new Date(),
    };

    const [row] = await this.db
      .insert(novel)
      .values(values)
      .onConflictDoUpdate({
        target: novel.slug,
        set: values,
      })
      .returning({ id: novel.id });

    if (row && item.anilistId) {
      await this.db
        .insert(novelExternalIds)
        .values({
          novelId: row.id,
          idType: "anilist",
          externalId: String(item.anilistId),
        })
        .onConflictDoNothing()
        .catch(() => undefined);
    }

    return row?.id ?? slug;
  }

  async getBySlug(slug: string): Promise<NovelSummary | null> {
    const [row] = await this.db
      .select()
      .from(novel)
      .where(eq(novel.slug, slug))
      .limit(1);

    return row ? this.#toSummary(row) : null;
  }

  async getByAnilistId(anilistId: number): Promise<NovelSummary | null> {
    const [row] = await this.db
      .select()
      .from(novel)
      .where(eq(novel.anilistId, anilistId))
      .limit(1);

    if (row) return this.#toSummary(row);

    const [ext] = await this.db
      .select()
      .from(novelExternalIds)
      .where(and(eq(novelExternalIds.idType, "anilist"), eq(novelExternalIds.externalId, String(anilistId))))
      .limit(1);

    if (!ext) return null;

    const [byExt] = await this.db
      .select()
      .from(novel)
      .where(eq(novel.id, ext.novelId))
      .limit(1);

    return byExt ? this.#toSummary(byExt) : null;
  }

  async listChapters(novelId: string): Promise<NovelChapter[]> {
    const rows = await this.db
      .select()
      .from(novelChapters)
      .where(eq(novelChapters.novelId, novelId))
      .orderBy(asc(novelChapters.chapterNumber));

    return rows.map((r) => ({
      id: r.id,
      novelId: r.novelId,
      chapterNumber: r.chapterNumber,
      chapterSlug: r.chapterSlug,
      title: r.title,
      releaseDate: r.releaseDate,
    }));
  }

  async upsertChapters(novelId: string, chapters: NovelChapter[], source = "novelfire"): Promise<void> {
    if (!chapters.length) return;

    for (const ch of chapters) {
      await this.db
        .insert(novelChapters)
        .values({
          novelId,
          chapterNumber: ch.chapterNumber,
          chapterSlug: ch.chapterSlug || `chapter-${ch.chapterNumber}`,
          title: ch.title,
          releaseDate: ch.releaseDate || null,
          source,
        })
        .onConflictDoUpdate({
          target: [novelChapters.novelId, novelChapters.chapterNumber],
          set: {
            title: ch.title,
            chapterSlug: ch.chapterSlug || `chapter-${ch.chapterNumber}`,
            releaseDate: ch.releaseDate || null,
            source,
          },
        })
        .catch(() => undefined);
    }
  }

  async getChapterContent(novelId: string, chapterNumber: number): Promise<NovelChapterContent | null> {
    const [row] = await this.db
      .select()
      .from(novelChapterContents)
      .where(and(eq(novelChapterContents.novelId, novelId), eq(novelChapterContents.chapterNumber, chapterNumber)))
      .limit(1);

    if (!row) return null;

    const prev = row.prevChapterSlug ? Number(row.prevChapterSlug.replace(/\D+/g, "")) || null : null;
    const next = row.nextChapterSlug ? Number(row.nextChapterSlug.replace(/\D+/g, "")) || null : null;

    return {
      id: row.id,
      novelId: row.novelId,
      chapterNumber: row.chapterNumber,
      chapterSlug: row.chapterSlug,
      title: row.title,
      content: row.content,
      paragraphs: (row.paragraphs as string[]) || [],
      previousChapter: prev || (chapterNumber > 1 ? chapterNumber - 1 : null),
      nextChapter: next || chapterNumber + 1,
    };
  }

  async upsertChapterContent(novelId: string, content: NovelChapterContent, source = "novelfire"): Promise<void> {
    const values = {
      novelId,
      chapterNumber: content.chapterNumber,
      chapterSlug: content.chapterSlug || `chapter-${content.chapterNumber}`,
      title: content.title,
      paragraphs: content.paragraphs,
      content: content.content,
      prevChapterSlug: content.previousChapter ? `chapter-${content.previousChapter}` : null,
      nextChapterSlug: content.nextChapter ? `chapter-${content.nextChapter}` : null,
      source,
      cachedAt: new Date(),
    };

    await this.db
      .insert(novelChapterContents)
      .values(values)
      .onConflictDoUpdate({
        target: [novelChapterContents.novelId, novelChapterContents.chapterNumber],
        set: values,
      })
      .catch(() => undefined);
  }

  #toSummary(row: typeof novel.$inferSelect): NovelSummary {
    return {
      id: row.slug,
      anilistId: row.anilistId || 0,
      title: row.title,
      romajiTitle: row.romajiTitle,
      englishTitle: row.englishTitle,
      nativeTitle: row.nativeTitle,
      coverImage: row.coverUrl,
      bannerImage: row.bannerUrl,
      description: row.description,
      averageScore: row.rating ? parseFloat(row.rating) : null,
      popularity: null,
      status: row.status,
      genres: (row.genres as string[]) || [],
      chapters: row.chapters,
      volumes: row.volumes,
      startYear: row.startYear,
    };
  }
}

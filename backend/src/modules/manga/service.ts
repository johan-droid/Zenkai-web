/**
 * Manga service (P11/P12).
 *
 * Same read-through/write-through shape as `AnimeService`: a route decides what
 * to return, the service decides where it comes from. MangaDex is a cache, so a
 * cache miss pays one upstream call and leaves rows behind for every request
 * after it.
 *
 * P12's page resolution is deliberately short-lived. MangaDex@Home URLs are
 * signed and expire in ~15 minutes, so they are cached for ten minutes and
 * re-resolved rather than treated as durable state.
 */

import { cache } from "../../cache/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import { AnilistProvider } from "../../providers/metadata/anilist.js";
import { MangaDexProvider } from "../../providers/manga/mangadex.js";
import { ZenkaiMangaProvider } from "../../providers/manga/zenkai.js";
import type { MangaProvider, ProviderChapter } from "../../providers/manga/types.js";
import { MangaRepository, type MangaListOptions } from "./repository.js";

export interface ChapterListOptions {
  language?: string;
  source?: string;
}

export class MangaService {
  constructor(
    private readonly repo: MangaRepository,
    private readonly provider: MangaProvider = new MangaDexProvider(),
    private readonly zenkaiProvider: ZenkaiMangaProvider = new ZenkaiMangaProvider(),
  ) {}

  /** Ensure a title is in the database, fetching it if it is not. */
  async ensureCached(providerId: string): Promise<string> {
    try {
      const localId = await this.repo.getLocalIdByProviderId(providerId);
      if (localId) return localId;
    } catch {
      // DB offline
    }

    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);

    return this.repo.upsert(detail).catch(() => providerId);
  }

  /** Detail for one title, backfilled on a cache miss. */
  async getByProviderId(providerId: string): Promise<Record<string, any>> {
    try {
      const cached = await this.repo.getByProviderId(providerId);
      if (cached) return cached;
    } catch {
      // DB offline
    }

    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found`);

    const localId = await this.repo.upsert(detail).catch(() => providerId);
    return { ...detail, id: localId };
  }

  /**
   * Full detail including relations, always refreshed from the provider.
   */
  async getFull(providerId: string): Promise<Record<string, any>> {
    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);

    const localId = await this.repo.upsert(detail).catch(() => providerId);
    await this.repo.replaceRelations(localId, detail).catch(() => undefined);

    return { ...detail, id: localId };
  }

  /**
   * Resolve a manga by its AniList id.
   */
  async getByAnilistId(anilistId: string): Promise<Record<string, any>> {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) {
      throw Object.assign(new Error("invalid anilist id"), { statusCode: 400, reason: "bad_request" });
    }

    try {
      const cached = await this.repo.getByExternalId("anilist", anilistId);
      if (cached) return cached;
    } catch {
      // DB offline
    }

    const anilist = new AnilistProvider();
    const manga = await anilist.getByAnilistId(anilistId, "MANGA");
    if (!manga) throw AppError.notFound(`manga ${anilistId} not found upstream`);

    let mangadexId = manga.externalIds?.mangadex;
    if (!mangadexId) {
      // Fallback: search MangaDex by title if direct cross-reference link is not present
      const searchRes = await this.provider.search(manga.canonicalTitle, 5).catch(() => ({ items: [] }));
      if (searchRes.items.length > 0) {
        mangadexId = searchRes.items[0]!.providerId;
      }
    }

    if (!mangadexId) {
      throw Object.assign(
        new Error(`manga ${anilistId} has no MangaDex cross-reference`),
        { statusCode: 404, reason: "not_found" },
      );
    }

    const full = await this.getFull(mangadexId);
    await this.repo.replaceExternalIds(full.id, { ...(manga.externalIds ?? {}), mangadex: mangadexId }).catch(() => undefined);

    return full;
  }

  /** Catalogue listing straight from the database, with provider fallback when empty or DB offline. */
  async list(options: MangaListOptions): Promise<{ items: Record<string, any>[]; total: number }> {
    const dbCount = await this.count().catch(() => 0);
    if (dbCount > 0) {
      try {
        return await this.repo.list(options);
      } catch {
        // DB error on list; proceed to provider fallback
      }
    }

    let page;
    try {
      page = await this.provider.browse({
        limit: Math.max(options.limit, 20),
        offset: options.offset,
        status: options.status ? [options.status.toLowerCase()] : undefined,
      });
    } catch (err: any) {
      throw Object.assign(
        new Error(`manga provider unavailable: ${err?.message ?? String(err)}`),
        { statusCode: 503, reason: "provider_unavailable" },
      );
    }

    if (page?.items && page.items.length > 0) {
      await Promise.all(
        page.items.map((summary) => this.repo.upsert(summary).catch(() => undefined)),
      );
      try {
        return await this.repo.list(options);
      } catch {
        return { items: page.items as any, total: page.items.length };
      }
    }

    return { items: [], total: 0 };
  }

  /**
   * Title search: the database first, MangaDex on a miss or DB offline.
   */
  async search(query: string, limit: number): Promise<Record<string, any>[]> {
    try {
      const local = await this.repo.search(query, limit);
      if (local.length > 0) return local;
    } catch {
      // DB offline
    }

    const page = await this.provider.search(query, limit);

    await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => undefined)),
    );

    return page.items as unknown as Record<string, any>[];
  }

  /**
   * Chapter list for a title, seeding it from MangaDex when empty.
   */
  async getChapters(
    providerId: string,
    options: ChapterListOptions = {},
  ): Promise<Record<string, any>[]> {
    let targetProviderId = providerId;
    if (Number.isFinite(Number(providerId))) {
      try {
        const manga = await this.getByAnilistId(providerId);
        if (manga && (manga.mangadexId || manga.id)) {
          targetProviderId = manga.mangadexId ?? manga.id;
        }
      } catch {
        // Fall back to providerId as is
      }
    }

    const localId = await this.ensureCached(targetProviderId).catch(() => targetProviderId);
    const language = options.language ?? "en";

    try {
      const existing = await this.repo.listChapters(localId, language);
      if (existing.length > 0) return existing;
    } catch {
      // DB offline
    }

    const key = `manga:chapters:${targetProviderId}:${language}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      let incoming: ProviderChapter[] = [];
      const isZenkaiId = targetProviderId.length === 26 || targetProviderId.startsWith("01");

      if (!isZenkaiId) {
        try {
          incoming = await this.provider.getChapters(targetProviderId, { language, limit: 100 });
        } catch {
          incoming = [];
        }
      }

      if (incoming.length === 0) {
        try {
          incoming = await this.zenkaiProvider.getChapters(targetProviderId, { language });
        } catch {
          // Upstream fallback exhausted
        }
      }

      await this.repo.upsertChapters(localId, incoming).catch(() => undefined);
      return incoming;
    });

    if (!Array.isArray(value) || value.length === 0) return [];

    try {
      const list = await this.repo.listChapters(localId, language);
      if (list.length > 0) return list;
    } catch {
      // DB offline
    }

    return value.map((ch: ProviderChapter) => ({
      id: ch.externalId,
      mangadexChapterId: ch.externalId,
      chapterNumber: ch.chapterNumber,
      volume: ch.volume,
      title: ch.title,
      language: ch.language,
      pages: ch.pages,
      scanlationGroup: ch.scanlationGroup,
      publishedAt: ch.publishedAt ? new Date(ch.publishedAt) : null,
    }));
  }

  /** The newest chapter, for a "read latest" shortcut. */
  async getLatestChapter(providerId: string, options: ChapterListOptions = {}) {
    const chapters = await this.getChapters(providerId, options);
    return chapters[chapters.length - 1] ?? null;
  }

  /** Single chapter by local id. */
  async getChapter(chapterId: string): Promise<Record<string, any> | null> {
    try {
      return await this.repo.getChapter(chapterId);
    } catch {
      return null;
    }
  }

  /**
   * Ordered page images for a chapter (P12).
   */
  async getChapterPages(chapterId: string): Promise<{ pageCount: number; pages: Array<{ pageNumber: number; url: string }> }> {
    let chapter = await this.repo.getChapter(chapterId).catch(() => null);
    if (!chapter) {
      // Treat chapterId as upstream chapter id if DB record not found
      chapter = { id: chapterId, mangadexChapterId: chapterId, pages: 0 };
    }

    const localChapterId = String(chapter.id);
    const cached = await this.repo.getChapterPages(localChapterId).catch(() => null);
    if (cached) {
      return shape(cached.baseUrl, cached.hash, cached.pages, chapter.pages);
    }

    const upstreamId = chapter.mangadexChapterId ?? chapterId;
    if (!upstreamId) {
      throw AppError.notFound(
        `chapter ${chapterId} has no provider id; re-sync the manga chapter list`,
      );
    }

    let upstream;
    const isZenkaiId = String(upstreamId).length === 26 || String(upstreamId).startsWith("01");
    if (isZenkaiId) {
      upstream = await this.zenkaiProvider.getChapterPages(String(upstreamId));
    } else {
      try {
        upstream = await this.provider.getChapterPages(String(upstreamId));
      } catch {
        upstream = await this.zenkaiProvider.getChapterPages(String(upstreamId));
      }
    }

    await this.repo.replaceChapterPages(localChapterId, upstream).catch(() => undefined);

    return shape(upstream.baseUrl, upstream.hash, upstream.pages, chapter.pages);
  }

  /** Distinct genres across the catalogue. */
  async genres(): Promise<string[]> {
    try {
      const rows = await this.repo.listGenres();
      if (rows && rows.length > 0) return rows;
    } catch {
      // DB offline
    }
    return [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Fantasy",
      "Horror",
      "Isekai",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller",
    ];
  }

  /**
   * Look up a manga row by an external provider id.
   */
  async getByExternalId(idType: string, externalId: string): Promise<Record<string, any> | null> {
    try {
      return await this.repo.getByExternalId(idType, externalId);
    } catch {
      return null;
    }
  }

  /** Row count, for the health check. */
  async count(): Promise<number> {
    try {
      return await this.repo.count();
    } catch {
      return 0;
    }
  }
}

/** Build absolute page URLs from an at-home base URL and page list. */
function shape(
  baseUrl: string,
  hash: string,
  pages: Array<{ pageNumber: number; fileName: string }>,
  chapterPageCount: number,
): { pageCount: number; pages: Array<{ pageNumber: number; url: string }> } {
  return {
    pageCount: chapterPageCount || pages.length,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      url: page.fileName.startsWith("http")
        ? page.fileName
        : hash
          ? `${baseUrl}/data/${hash}/${page.fileName}`
          : `${baseUrl}/data/${page.fileName}`,
    })),
  };
}

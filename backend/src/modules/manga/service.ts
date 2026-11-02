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
import { fetchJson } from "../../http/client.js";
import { AppError } from "../../http/errors.js";
import { AnilistProvider } from "../../providers/metadata/anilist.js";
import { MangaDexProvider } from "../../providers/manga/mangadex.js";
import { ZenkaiMangaProvider } from "../../providers/manga/zenkai.js";
import type { ChapterPages, MangaProvider, MangaSummary, Page, ProviderChapter } from "../../providers/manga/types.js";
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

    let detail = await this.provider.getById(providerId).catch(() => null);
    if (!detail) {
      detail = await this.zenkaiProvider.getById(providerId).catch(() => null);
    }
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

    let detail = await this.provider.getById(providerId).catch(() => null);
    if (!detail) {
      detail = await this.zenkaiProvider.getById(providerId).catch(() => null);
    }
    if (!detail) throw AppError.notFound(`manga ${providerId} not found`);

    const localId = await this.repo.upsert(detail).catch(() => providerId);
    return { ...detail, id: localId, canonicalTitle: (detail as any).canonicalTitle ?? detail.titles?.primary ?? "" };
  }

  /**
   * Full detail including relations, always refreshed from the provider.
   */
  async getFull(providerId: string): Promise<Record<string, any>> {
    let detail = await this.provider.getById(providerId).catch(() => null);
    if (!detail) {
      detail = await this.zenkaiProvider.getById(providerId).catch(() => null);
    }
    if (!detail && Number.isFinite(Number(providerId))) {
      return this.getByAnilistId(providerId);
    }
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);

    const localId = await this.repo.upsert(detail).catch(() => providerId);
    await this.repo.replaceRelations(localId, detail).catch(() => undefined);

    const isMangaDex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);
    const mangadexId =
      (detail as any).mangadexId ??
      (isMangaDex ? providerId : ((detail as any).providerId || null));

    return {
      ...detail,
      id: localId,
      mangadexId,
      canonicalTitle: (detail as any).canonicalTitle ?? detail.titles?.primary ?? "",
    };
  }

  /**
   * Resolve a manga by its AniList id or provider id.
   */
  async getByAnilistId(anilistId: string): Promise<Record<string, any>> {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) {
      // If it's a provider ID (e.g. MangaDex UUID), resolve directly via getFull
      return this.getFull(anilistId);
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

    let full: Record<string, any> | null = null;
    if (mangadexId) {
      full = await this.getFull(mangadexId).catch(() => null);
    }

    if (!full) {
      // Fallback 1: try Zenkai provider search (WeebCentral, etc.)
      const zenkaiSearch = await this.zenkaiProvider.search(manga.canonicalTitle, 1).catch(() => null);
      if (zenkaiSearch?.items?.[0]) {
        const item = zenkaiSearch.items[0];
        full = await this.getFull(item.providerId).catch(() => null);
      }
    }

    if (!full) {
      // Fallback 2: Canonical AniList detail representation
      full = {
        id: anilistId,
        mangadexId: null,
        titles: manga.titles,
        canonicalTitle: manga.canonicalTitle,
        description: manga.description,
        coverUrl: manga.coverUrl,
        coverImageLarge: manga.coverImageLarge,
        bannerUrl: manga.bannerUrl,
        status: manga.status,
        contentRating: "safe",
        year: manga.year,
        genres: (manga.genres ?? []).map((g: string) => ({ name: g, group: null })),
        authors: [],
        artists: [],
        totalChapters: (manga as any).totalChapters ?? null,
        totalVolumes: (manga as any).totalVolumes ?? null,
        relations: (manga.relations ?? []).map((r: any) => ({
          type: r.type,
          providerId: String(r.anilistId),
          title: r.title,
          coverUrl: r.coverUrl,
        })),
      };
    }

    if (full.id && mangadexId) {
      await this.repo.replaceExternalIds(full.id, { ...(manga.externalIds ?? {}), mangadex: mangadexId }).catch(() => undefined);
    }
    await this.repo.replaceExternalIds(full.id ?? anilistId, { anilist: anilistId }).catch(() => undefined);

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
        const fallbackItems = page.items.map((item) => ({
          id: item.providerId,
          mangadexId: item.providerId,
          canonicalTitle: item.titles?.primary ?? "Untitled Manga",
          coverUrl: item.coverUrl ?? null,
          coverImageLarge: item.coverImageLarge ?? null,
          bannerUrl: null,
          description: item.description ?? null,
          status: (item.status || "ONGOING").toUpperCase(),
          year: item.year ?? null,
          totalChapters: item.totalChapters ?? null,
          totalVolumes: item.totalVolumes ?? null,
        }));
        return { items: fallbackItems, total: page.items.length };
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

    let page: Page<MangaSummary> | null = null;
    try {
      page = await this.provider.search(query, limit);
    } catch {
      // Upstream MangaDex timeout/failure; attempt Zenkai multi-provider fallback
      try {
        page = await this.zenkaiProvider.search(query, limit);
      } catch {
        return [];
      }
    }

    if (page && page.items.length > 0) {
      await Promise.all(
        page.items.map((summary: MangaSummary) => this.repo.upsert(summary).catch(() => undefined)),
      );

      return page.items.map((item: MangaSummary) => ({
        id: item.providerId,
        mangadexId: item.providerId,
        canonicalTitle: item.titles?.primary ?? "Untitled Manga",
        ...item,
      })) as unknown as Record<string, any>[];
    }

    return [];
  }

  /**
   * Chapter list for a title, seeding it from MangaDex when empty.
   */
  async getChapters(
    providerId: string,
    options: ChapterListOptions = {},
  ): Promise<Record<string, any>[]> {
    let targetProviderId = providerId;
    // If the providerId looks like a numeric AniList ID, attempt to bridge
    // to a MangaDex UUID so downstream providers can resolve the chapters.
    if (Number.isFinite(Number(providerId))) {
      try {
        const manga = await this.getByAnilistId(providerId);
        if (manga && manga.mangadexId) {
          targetProviderId = manga.mangadexId;
        } else {
          // No MangaDex bridge available for this title; skip provider fetch
          // to avoid sending an AniList numeric ID to a MangaDex-backed provider.
          return [];
        }
      } catch {
        // Unable to look up AniList title; skip provider fetch.
        return [];
      }
    }

    const localId = await this.ensureCached(targetProviderId).catch(() => targetProviderId);
    const language = options.language ?? "en";

    try {
      const existing = await this.repo.listChapters(localId, language);
      const hasReadable = existing.some((ch) => !ch.externalUrl);
      if (existing.length > 0 && hasReadable) return existing;
    } catch {
      // DB offline
    }

    const key = `manga:chapters:${targetProviderId}:${language}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      if (!isMangaDexId(targetProviderId)) {
        // Not a MangaDex UUID; cannot fetch chapters from provider.
        return [];
      }

      let incoming: ProviderChapter[] = [];
      try {
        incoming = await this.provider.getChapters(targetProviderId, { language, limit: 100 });
      } catch {
        incoming = [];
      }

      // If MangaDex returned 0 chapters or only external release placeholders with 0 pages,
      // fallback to Zenkai multi-provider (WeebCentral, etc.)
      const hasReadableChapters = incoming.some((ch) => !ch.externalUrl);
      if (incoming.length === 0 || !hasReadableChapters) {
        try {
          const detail = await this.getByProviderId(targetProviderId).catch(() => null);
          const allTitles = [
            detail?.canonicalTitle,
            detail?.titles?.primary,
            ...(detail?.titles?.alternates ?? []),
            ...(Array.isArray(detail?.altTitles) ? detail.altTitles : []),
            ...(Array.isArray(detail?.synonyms) ? detail.synonyms : []),
          ].filter(Boolean) as string[];

          const cleanCandidates = this.#cleanTitleCandidates(allTitles);
          for (const cand of cleanCandidates) {
            const searchRes = await this.zenkaiProvider.search(cand, 3).catch(() => ({ items: [] }));
            if (searchRes.items.length > 0) {
              const zenkaiChs = await this.zenkaiProvider.getChapters(searchRes.items[0].providerId, { language }).catch(() => []);
              if (zenkaiChs.length > 0) {
                incoming = zenkaiChs;
                break;
              }
            }
          }
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
      if (list.length > 0) {
        const extUrlMap = new Map<string, string | null>();
        for (const ch of value) {
          if (ch.externalUrl) {
            extUrlMap.set(ch.externalId, ch.externalUrl);
            extUrlMap.set(ch.chapterNumber, ch.externalUrl);
          }
        }
        return list.map((item) => ({
          ...item,
          externalUrl:
            extUrlMap.get(item.mangadexChapterId ?? item.id) ??
            extUrlMap.get(item.chapterNumber) ??
            null,
        }));
      }
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
      externalUrl: ch.externalUrl ?? null,
    }));
  }

  /** Check if a providerId string is a MangaDex UUID (v4 format: 8-4-4-4-12 hex). */
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
    if (cached && cached.pages && cached.pages.length > 0) {
      return shape(cached.baseUrl, cached.hash, cached.pages, chapter.pages);
    }

    const upstreamId = chapter.mangadexChapterId ?? chapterId;
    if (!upstreamId) {
      throw AppError.notFound(
        `chapter ${chapterId} has no provider id; re-sync the manga chapter list`,
      );
    }

    let upstream: ChapterPages | undefined;
    const isZenkaiId = String(upstreamId).length === 26 || String(upstreamId).startsWith("01");
    if (isZenkaiId) {
      try {
        upstream = await this.zenkaiProvider.getChapterPages(String(upstreamId));
      } catch {
        return { pageCount: 0, pages: [] };
      }
    } else {
      try {
        upstream = await this.provider.getChapterPages(String(upstreamId));
      } catch {
        // MangaDex threw or chapter has no hosted pages (e.g. licensed external release)
      }
    }

    if (!upstream || !upstream.pages || upstream.pages.length === 0) {
      // MangaDex had no hosted pages (e.g. licensed external release on K MANGA / Manga UP!).
      // Seamlessly fall back to Zenkai multi-provider (WeebCentral, etc.) by matching title and chapter number.
      let chapterNumber = chapter?.chapterNumber;
      const mangaTitles: string[] = [];

      if (chapter?.mangaId) {
        const localManga = await this.repo.getById(chapter.mangaId).catch(() => null);
        if (localManga) {
          if (localManga.canonicalTitle) mangaTitles.push(localManga.canonicalTitle);
          if (localManga.titles?.primary) mangaTitles.push(localManga.titles.primary);
          if (localManga.titles?.english) mangaTitles.push(localManga.titles.english);
          if (localManga.titles?.romanized) mangaTitles.push(localManga.titles.romanized);
          if (Array.isArray(localManga.titles?.alternates)) {
            mangaTitles.push(...localManga.titles.alternates);
          }
        }
      }

      // If chapterNumber or manga titles are still unknown, query MangaDex chapter metadata
      if ((!chapterNumber || mangaTitles.length === 0) && isMangaDexId(String(upstreamId))) {
        try {
          const mdChapter = await fetchJson<{
            data?: {
              attributes?: { chapter?: string };
              relationships?: Array<{ id?: string; type?: string }>;
            };
          }>(`https://api.mangadex.org/chapter/${encodeURIComponent(String(upstreamId))}`, { timeoutMs: 8000 });

          if (!chapterNumber && mdChapter?.data?.attributes?.chapter) {
            chapterNumber = mdChapter.data.attributes.chapter;
          }

          const mdMangaId = mdChapter?.data?.relationships?.find((r) => r.type === "manga")?.id;
          if (mdMangaId && mangaTitles.length === 0) {
            const mdManga = await this.getByProviderId(mdMangaId).catch(() => null);
            if (mdManga) {
              if (mdManga.canonicalTitle) mangaTitles.push(mdManga.canonicalTitle);
              if (mdManga.titles?.primary) mangaTitles.push(mdManga.titles.primary);
              if (mdManga.titles?.english) mangaTitles.push(mdManga.titles.english);
              if (mdManga.titles?.romanized) mangaTitles.push(mdManga.titles.romanized);
              if (Array.isArray(mdManga.titles?.alternates)) {
                mangaTitles.push(...mdManga.titles.alternates);
              }
            }
          }
        } catch {
          // Upstream metadata lookup failed
        }
      }

      if (chapterNumber && mangaTitles.length > 0) {
        const fallback = await this.#resolveZenkaiChapterPages(mangaTitles, chapterNumber).catch(() => null);
        if (fallback && fallback.pages && fallback.pages.length > 0) {
          upstream = fallback;
        }
      }
    }

    if (!upstream || !upstream.pages || upstream.pages.length === 0) {
      return { pageCount: 0, pages: [] };
    }

    await this.repo.replaceChapterPages(localChapterId, upstream).catch(() => undefined);

    return shape(upstream.baseUrl, upstream.hash, upstream.pages, chapter.pages);
  }

  /** Clean and deduplicate title search candidates for resilient provider queries. */
  #cleanTitleCandidates(titles: string[]): string[] {
    const result: string[] = [];
    for (const t of titles) {
      if (!t || typeof t !== "string") continue;
      const trimmed = t.trim();
      if (trimmed.length < 2) continue;
      result.push(trimmed);

      // Strip punctuation (e.g. "Dress-Up" -> "Dress Up", "Tensei: Slime" -> "Tensei Slime")
      const noPunct = trimmed.replace(/[-_:]/g, " ").replace(/\s+/g, " ").trim();
      if (noPunct !== trimmed && noPunct.length > 2) {
        result.push(noPunct);
      }

      // Strip common leading articles ("The", "A", "An", "My")
      const withoutArticle = noPunct.replace(/^(the|a|an|my)\s+/i, "").trim();
      if (withoutArticle !== noPunct && withoutArticle.length > 2) {
        result.push(withoutArticle);
      }

      // First 3-4 words for long titles with Japanese particles (e.g. "Sono Bisque Doll wa Koi o Suru" -> "Sono Bisque Doll")
      const words = noPunct.split(" ");
      if (words.length > 3) {
        result.push(words.slice(0, 3).join(" "));
      }
    }
    return Array.from(new Set(result));
  }

  /** Match chapter by exact number, float equivalence, or integer part for decimal editions. */
  #matchChapter(chapters: ProviderChapter[], targetNum: string): ProviderChapter | null {
    const targetFloat = parseFloat(targetNum);
    const targetFloor = Math.floor(targetFloat);

    // 1. Exact string match
    let match = chapters.find((c) => c.chapterNumber === targetNum);
    if (match) return match;

    // 2. Float exact match
    match = chapters.find((c) => parseFloat(c.chapterNumber) === targetFloat);
    if (match) return match;

    // 3. Normalized leading zeros (e.g. "01" vs "1")
    match = chapters.find(
      (c) => c.chapterNumber.replace(/^0+/, "") === targetNum.replace(/^0+/, ""),
    );
    if (match) return match;

    // 4. Floor match for decimal split chapters (e.g. "1.1" -> "1")
    if (Number.isFinite(targetFloat)) {
      match = chapters.find((c) => parseFloat(c.chapterNumber) === targetFloor);
      if (match) return match;
    }

    return null;
  }

  /**
   * Fallback: Resolve chapter pages from Zenkai multi-provider (WeebCentral, etc.)
   * by searching canonical/alternate titles and matching chapter number.
   */
  async #resolveZenkaiChapterPages(
    titles: string[],
    chapterNumber: string | number,
  ): Promise<ChapterPages | null> {
    const cleanCandidates = this.#cleanTitleCandidates(titles);
    if (cleanCandidates.length === 0) return null;

    const targetNum = String(chapterNumber).trim();

    for (const title of cleanCandidates) {
      try {
        const searchRes = await this.zenkaiProvider.search(title, 3);
        if (!searchRes?.items?.length) continue;

        for (const item of searchRes.items) {
          try {
            const chapters = await this.zenkaiProvider.getChapters(item.providerId);
            if (!chapters?.length) continue;

            const match = this.#matchChapter(chapters, targetNum);
            if (match) {
              const pages = await this.zenkaiProvider.getChapterPages(match.externalId);
              if (pages?.pages?.length > 0) {
                return pages;
              }
            }
          } catch {
            // Check next search result
          }
        }
      } catch {
        // Check next candidate title
      }
    }

    return null;
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

/** Check if a providerId string is a MangaDex UUID (v4 format: 8-4-4-4-12 hex). */
function isMangaDexId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

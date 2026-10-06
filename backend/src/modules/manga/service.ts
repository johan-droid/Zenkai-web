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
import type { MangaProvider } from "../../providers/manga/types.js";
import { MangaRepository, type MangaListOptions } from "./repository.js";

export interface ChapterListOptions {
  language?: string;
}

export class MangaService {
  constructor(
    private readonly repo: MangaRepository,
    private readonly provider: MangaProvider = new MangaDexProvider(),
  ) {}

  /** Ensure a title is in the database, fetching it if it is not. */
  async ensureCached(providerId: string): Promise<string> {
    const localId = await this.repo.getLocalIdByProviderId(providerId);
    if (localId) return localId;

    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);

    return this.repo.upsert(detail);
  }

  /** Detail for one title, backfilled on a cache miss. */
  async getByProviderId(providerId: string): Promise<Record<string, any>> {
    const cached = await this.repo.getByProviderId(providerId);
    if (cached) return cached;

    await this.ensureCached(providerId);

    const fresh = await this.repo.getByProviderId(providerId);
    if (!fresh) throw AppError.notFound(`manga ${providerId} not found`);

    return fresh;
  }

  /**
   * Full detail including relations, always refreshed from the provider.
   *
   * Relations are the part that goes stale fastest and the part a detail page
   * shows immediately, so this bypasses the read cache deliberately.
   */
  async getFull(providerId: string): Promise<Record<string, any>> {
    const detail = await this.provider.getById(providerId);
    if (!detail) throw AppError.notFound(`manga ${providerId} not found upstream`);

    const localId = await this.repo.upsert(detail);
    await this.repo.replaceRelations(localId, detail);

    return { ...detail, id: localId };
  }

  /**
   * Resolve a manga by its AniList id.
   *
   * The manga catalogue is keyed by MangaDex id; AniList ids are stored as
   * cross-references on titles that have already been synced. On a cache miss
   * this fetches the title from AniList, extracts the MangaDex id from the
   * provider links, upserts the canonical row and returns the full detail.
   *
   * This is the seam that lets the reader and manga detail routes address
   * titles by the same AniList id the anime side uses, without the frontend
   * ever calling AniList or MangaDex directly.
   */
  async getByAnilistId(anilistId: string): Promise<Record<string, any>> {
    const numericId = Number(anilistId);
    if (!Number.isFinite(numericId)) {
      throw Object.assign(new Error("invalid anilist id"), { statusCode: 400, reason: "bad_request" });
    }

    // DB first: titles already synced carry the anilist id as a cross-reference.
    const cached = await this.repo.getByExternalId("anilist", anilistId);
    if (cached) return cached;

    // Cache miss: one AniList call to bridge the id space, then the normal
    // MangaDex path so the frontend never sees a provider-split response.
    const anilist = new AnilistProvider();
    const manga = await anilist.getByAnilistId(anilistId, "MANGA");
    if (!manga) throw AppError.notFound(`manga ${anilistId} not found upstream`);

    const mangadexId = manga.externalIds?.mangadex;
    if (!mangadexId) {
      throw Object.assign(
        new Error(`manga ${anilistId} has no MangaDex cross-reference`),
        { statusCode: 404, reason: "not_found" },
      );
    }

    // Reuse the normal path so relations, credits and external ids land in the
    // database for every request after the first.
    const full = await this.getFull(mangadexId);

    // Ensure the anilist cross-reference is stored for the next lookup.
    await this.repo.replaceExternalIds(full.id, manga.externalIds).catch(() => undefined);

    return full;
  }

  /** Catalogue listing straight from the database, with provider fallback when empty. */
  async list(options: MangaListOptions): Promise<{ items: Record<string, any>[]; total: number }> {
    const dbCount = await this.count();
    if (dbCount > 0) {
      return this.repo.list(options);
    }

    // Database catalogue is empty: run provider-backed discovery fallback to seed.
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
      return this.repo.list(options);
    }

    return { items: [], total: 0 };
  }

  /**
   * Title search: the database first, MangaDex on a miss.
   *
   * Reading the database first matters because a search hit is nearly always a
   * title the user has already opened, and re-querying MangaDex for it would
   * spend a rate-limited call to return identical data.
   */
  async search(query: string, limit: number): Promise<Record<string, any>[]> {
    const local = await this.repo.search(query, limit);
    if (local.length > 0) return local;

    const page = await this.provider.search(query, limit);

    // Persist before returning. A write failure must not break the response: the
    // caller already holds usable data and the next request will retry.
    await Promise.all(
      page.items.map((summary) => this.repo.upsert(summary).catch(() => undefined)),
    );

    return page.items as unknown as Record<string, any>[];
  }

  /**
   * Chapter list for a title, seeding it from MangaDex when empty.
   *
   * The feed is cached per (title, language) because a chapter list is large and
   * changes only when a scanlation group publishes.
   */
  async getChapters(
    providerId: string,
    options: ChapterListOptions = {},
  ): Promise<Record<string, any>[]> {
    const localId = await this.ensureCached(providerId);
    const language = options.language ?? "en";

    const existing = await this.repo.listChapters(localId, language);
    if (existing.length > 0) return existing;

    const key = `manga:chapters:${providerId}:${language}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      const incoming = await this.provider.getChapters(providerId, { language, limit: 100 });
      await this.repo.upsertChapters(localId, incoming);
      return incoming.length;
    });

    if (value === 0) return [];

    return this.repo.listChapters(localId, language);
  }

  /** The newest chapter, for a "read latest" shortcut. */
  async getLatestChapter(providerId: string, options: ChapterListOptions = {}) {
    await this.getChapters(providerId, options);

    const localId = await this.repo.getLocalIdByProviderId(providerId);
    if (!localId) return null;

    return this.repo.getLatestChapter(localId, options.language ?? "en");
  }

  /** Single chapter by local id. */
  async getChapter(chapterId: string): Promise<Record<string, any> | null> {
    return this.repo.getChapter(chapterId);
  }

  /**
   * Ordered page images for a chapter (P12).
   *
   * The cache TTL is deliberately shorter than the upstream signature lifetime so
   * a page URL is never handed out after it has expired.
   */
  async getChapterPages(chapterId: string): Promise<{ pageCount: number; pages: Array<{ pageNumber: number; url: string }> }> {
    const chapter = await this.repo.getChapter(chapterId);
    if (!chapter) throw AppError.notFound(`chapter ${chapterId} not found`);

    const cached = await this.repo.getChapterPages(chapterId);
    if (cached) {
      return shape(cached.baseUrl, cached.pages, chapter.pages);
    }

    // MangaDex@Home is keyed by the provider's own chapter uuid, which is a
    // different id space from ours. Resolving the mapping here keeps that
    // provider detail in one place instead of leaking into the route layer.
    const upstreamId = chapter.mangadexChapterId;
    if (!upstreamId) {
      throw AppError.notFound(
        `chapter ${chapterId} has no provider id; re-sync the manga chapter list`,
      );
    }

    const upstream = await this.provider.getChapterPages(String(upstreamId));
    await this.repo.replaceChapterPages(chapterId, upstream);

    return shape(upstream.baseUrl, upstream.pages, chapter.pages);
  }

  /** Distinct genres across the catalogue. */
  async genres(): Promise<string[]> {
    return this.repo.listGenres();
  }

  /**
   * Look up a manga row by an external provider id.
   *
   * Used by `getByAnilistId` to find already-cached titles without going
   * through MangaDex first.
   */
  async getByExternalId(idType: string, externalId: string): Promise<Record<string, any> | null> {
    return this.repo.getByExternalId(idType, externalId);
  }

  /** Row count, for the health check. */
  async count(): Promise<number> {
    return this.repo.count();
  }
}

/** Build absolute page URLs from an at-home base URL and page list. */
function shape(
  baseUrl: string,
  pages: Array<{ pageNumber: number; fileName: string }>,
  chapterPageCount: number,
): { pageCount: number; pages: Array<{ pageNumber: number; url: string }> } {
  return {
    pageCount: chapterPageCount || pages.length,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      url: `${baseUrl}/data/${page.fileName}`,
    })),
  };
}

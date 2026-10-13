/**
 * Novel service (Stage 6).
 *
 * Coordinates novel browsing, details, chapter feeds, and chapter content
 * with caching to minimize upstream API calls and guarantee sub-second responses.
 */

import { cache } from "../../cache/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import { NovelProvider, type NovelBrowseOptions, type NovelSummary, type NovelChapter, type NovelChapterContent } from "../../providers/novel/index.js";

export class NovelService {
  constructor(private readonly provider: NovelProvider = new NovelProvider()) {}

  async browse(options: NovelBrowseOptions = {}): Promise<{ items: NovelSummary[]; total: number; hasNextPage: boolean }> {
    const key = `novel:browse:${options.page ?? 1}:${options.perPage ?? 20}:${options.sort ?? "POPULARITY_DESC"}:${options.search ?? ""}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_DISCOVERY_S, async () => {
      return this.provider.browse(options);
    });
    return value;
  }

  async search(query: string, limit = 20): Promise<NovelSummary[]> {
    if (!query || query.trim().length === 0) return [];
    const key = `novel:search:${query.toLowerCase().trim()}:${limit}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_DISCOVERY_S, async () => {
      return this.provider.search(query.trim(), limit);
    });
    return value;
  }

  async getById(id: string): Promise<NovelSummary> {
    const key = `novel:detail:${id}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      return this.provider.getById(id);
    });
    if (!value) {
      throw AppError.notFound(`novel ${id} not found`);
    }
    return value;
  }

  async getChapters(id: string): Promise<NovelChapter[]> {
    const key = `novel:chapters:${id}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      return this.provider.getChapters(id);
    });
    return value;
  }

  async getChapterContent(id: string, chapterNumber: number): Promise<NovelChapterContent> {
    const key = `novel:content:${id}:${chapterNumber}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      return this.provider.getChapterContent(id, chapterNumber);
    });
    if (!value) {
      throw AppError.notFound(`chapter ${chapterNumber} for novel ${id} not found`);
    }
    return value;
  }
}

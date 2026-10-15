/**
 * Novel service (Stage 6 + Database Caching & Multi-source).
 *
 * Coordinates novel browsing, details, chapter feeds, and chapter content
 * with Postgres persistence and Redis caching to minimize upstream API calls and guarantee sub-second responses.
 */

import { cache } from "../../cache/index.js";
import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import {
  NovelProvider,
  type NovelBrowseOptions,
  type NovelSummary,
  type NovelChapter,
  type NovelChapterContent,
} from "../../providers/novel/index.js";
import type { NovelRepository } from "./repository.js";

export class NovelService {
  constructor(
    private readonly provider: NovelProvider = new NovelProvider(),
    private readonly repo?: NovelRepository,
  ) {}

  async browse(options: NovelBrowseOptions = {}): Promise<{ items: NovelSummary[]; total: number; hasNextPage: boolean }> {
    const source = options.source || "novelfire";
    const key = `novel:browse:${source}:${options.page ?? 1}:${options.perPage ?? 20}:${options.sort ?? "POPULARITY_DESC"}:${options.search ?? ""}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_DISCOVERY_S, async () => {
      return this.provider.browse(options);
    });
    return value;
  }

  async search(query: string, limit = 20, source = "novelfire"): Promise<NovelSummary[]> {
    if (!query || query.trim().length === 0) return [];
    const key = `novel:search:${source}:${query.toLowerCase().trim()}:${limit}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_DISCOVERY_S, async () => {
      return this.provider.search(query.trim(), limit, source);
    });
    return value;
  }

  async getById(id: string, source = "novelfire"): Promise<NovelSummary> {
    const key = `novel:detail:${source}:${id}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      if (this.repo) {
        try {
          const isNum = Number.isFinite(Number(id));
          const cached = isNum ? await this.repo.getByAnilistId(Number(id)) : await this.repo.getBySlug(id);
          if (cached) return cached;
        } catch {
          // DB offline or error
        }
      }

      const item = await this.provider.getById(id, source);
      if (item && this.repo) {
        await this.repo.upsert(item, source).catch(() => undefined);
      }
      return item;
    });

    if (!value) {
      throw AppError.notFound(`novel ${id} not found`);
    }
    return value;
  }

  async getChapters(id: string, source = "novelfire"): Promise<NovelChapter[]> {
    const key = `novel:chapters:${source}:${id}`;
    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      if (this.repo) {
        try {
          const cachedChapters = await this.repo.listChapters(id);
          if (cachedChapters.length > 0) return cachedChapters;
        } catch {
          // DB offline or error
        }
      }

      const incoming = await this.provider.getChapters(id, source);
      if (incoming.length > 0 && this.repo) {
        void this.repo.upsertChapters(id, incoming, source).catch(() => undefined);
      }
      return incoming;
    });
    return value;
  }

  async getChapterContent(id: string, chapterNumberOrSlug: number | string, source = "novelfire"): Promise<NovelChapterContent> {
    const num = typeof chapterNumberOrSlug === "number" ? chapterNumberOrSlug : Number(chapterNumberOrSlug.replace(/\D+/g, "")) || 1;
    const key = `novel:content:${source}:${id}:${chapterNumberOrSlug}`;

    const { value } = await cache.remember(key, config.CACHE_TTL_METADATA_S, async () => {
      if (this.repo) {
        try {
          const cachedContent = await this.repo.getChapterContent(id, num);
          if (cachedContent && cachedContent.paragraphs.length > 0) return cachedContent;
        } catch {
          // DB offline or error
        }
      }

      const incoming = await this.provider.getChapterContent(id, chapterNumberOrSlug, source);
      if (incoming && this.repo) {
        await this.repo.upsertChapterContent(id, incoming, source).catch(() => undefined);
      }
      return incoming;
    });

    if (!value) {
      throw AppError.notFound(`chapter ${chapterNumberOrSlug} for novel ${id} not found`);
    }
    return value;
  }
}

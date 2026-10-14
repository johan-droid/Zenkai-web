/**
 * Zenkai multi-source Manga adapter (WeebCentral, MangaDex, ComicK, Manhua, Asura Scans).
 *
 * Implements MangaProvider contract while delegating to the reverse-engineered
 * multi-provider infrastructure from the Zenkai Android & Web ecosystem.
 */

import { fetchJson } from "../../http/client.js";
import { AppError } from "../../http/errors.js";
import type {
  ChapterPages,
  ChapterQuery,
  MangaBrowseQuery,
  MangaDetail,
  MangaProvider,
  MangaSummary,
  Page,
  ProviderChapter,
} from "./types.js";

export const MANGA_SOURCES = [
  { id: "weebcentral", displayName: "WeebCentral", baseUrl: "https://weebcentral.com", badge: "Classic" },
  { id: "mangadex", displayName: "MangaDex", baseUrl: "https://mangadex.org", badge: "Multilingual" },
  { id: "comick", displayName: "ComicK", baseUrl: "https://comick.art", badge: "Manhwa & Manga" },
  { id: "manhua", displayName: "Manhua", baseUrl: "https://comick.art", badge: "Cultivation & Action" },
  { id: "asura", displayName: "Asura Scans", baseUrl: "https://asuracomic.net", badge: "Action / Regression" },
] as const;

export type MangaSourceId = (typeof MANGA_SOURCES)[number]["id"];

export class ZenkaiMangaProvider implements MangaProvider {
  readonly slug = "zenkai";
  readonly name = "Zenkai Multi-Source";
  readonly priority = 2;
  readonly #endpoint = "https://zenkaii.pages.dev/api/manga";

  constructor(private readonly defaultSource: string = "weebcentral") {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetchJson<{ trending?: any[] }>(`${this.#endpoint}/home?source=${encodeURIComponent(this.defaultSource)}`, {
        timeoutMs: 5000,
      });
      return Boolean(res?.trending);
    } catch {
      return false;
    }
  }

  async browse(query: MangaBrowseQuery): Promise<Page<MangaSummary>> {
    const source = this.defaultSource;
    const url = `${this.#endpoint}/home?source=${encodeURIComponent(source)}`;
    const data = await fetchJson<{ trending?: any[]; latest?: any[]; newRelease?: any[] }>(url, {
      timeoutMs: 15000,
    });

    const items: MangaSummary[] = (data.trending ?? []).map((m: any) => this.#toSummary(m, source));
    return {
      items,
      total: items.length,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
  }

  async search(queryText: string, limit = 20, source = this.defaultSource): Promise<Page<MangaSummary>> {
    const url = `${this.#endpoint}/search?q=${encodeURIComponent(queryText)}&source=${encodeURIComponent(source)}`;
    const data = await fetchJson<{ results?: any[] }>(url, { timeoutMs: 15000 });
    const items = (data.results ?? []).slice(0, limit).map((m: any) => this.#toSummary(m, source));

    return {
      items,
      total: items.length,
      limit,
      offset: 0,
    };
  }

  async getById(id: string, source = this.defaultSource): Promise<MangaDetail | null> {
    const url = `${this.#endpoint}/chapters?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`;
    const data = await fetchJson<{ id: string; chapters?: any[] }>(url, { timeoutMs: 15000 });
    if (!data?.id) return null;

    const chapters = data.chapters ?? [];
    return {
      providerId: data.id,
      titles: {
        primary: id,
        alternates: [],
      },
      coverUrl: null,
      status: "ONGOING",
      contentRating: "safe",
      isAdult: false,
      genres: [],
      demographics: [],
      authors: [],
      artists: [],
      totalChapters: chapters.length,
      relations: [],
    };
  }

  async getChapters(id: string, query?: ChapterQuery, source = this.defaultSource): Promise<ProviderChapter[]> {
    const url = `${this.#endpoint}/chapters?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`;
    const data = await fetchJson<{ id: string; chapters?: any[] }>(url, { timeoutMs: 20000 });
    if (!data?.chapters || !Array.isArray(data.chapters)) return [];

    return data.chapters.map((ch: any) => ({
      externalId: ch.chapterId || ch.id,
      chapterNumber: String(ch.number ?? 1),
      volume: ch.volume ?? null,
      title: ch.title ?? `Chapter ${ch.number}`,
      language: query?.language ?? "en",
      pages: 0,
      publishedAt: ch.date ? new Date(ch.date).getTime() : null,
      scanlationGroup: ch.group ?? null,
    }));
  }

  async getChapterPages(chapterId: string, source = this.defaultSource): Promise<ChapterPages> {
    const url = `${this.#endpoint}/pages?chapterId=${encodeURIComponent(chapterId)}&source=${encodeURIComponent(source)}`;
    const data = await fetchJson<{ chapterId: string; pages?: string[] }>(url, { timeoutMs: 25000 });
    if (!data?.pages || !Array.isArray(data.pages) || data.pages.length === 0) {
      throw new AppError("upstream_error", `No pages returned for chapter ${chapterId}`, 502);
    }

    return {
      baseUrl: "",
      hash: "",
      pages: data.pages.map((pageUrl, idx) => ({
        pageNumber: idx + 1,
        fileName: pageUrl,
      })),
    };
  }

  #toSummary(item: any, source: string): MangaSummary {
    return {
      providerId: item.id,
      titles: {
        primary: item.title || item.id,
        alternates: [],
      },
      coverUrl: item.poster || null,
      coverImageLarge: item.poster || null,
      status: item.status ? (item.status.toUpperCase() as any) : "ONGOING",
      contentRating: "safe",
      isAdult: false,
      genres: [],
      demographics: [],
      authors: [],
      artists: [],
      totalChapters: item.chapters || null,
      externalIds: {
        [source]: item.id,
      },
    };
  }
}

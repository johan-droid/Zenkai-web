/**
 * Provider availability service.
 *
 * Aggregates health status for manga and novel providers so the frontend can
 * display which sources are available, restricted, or external-reading-only.
 */

import { mangaHealthRegistry } from "../../providers/manga/health.js";
import { novelHealthRegistry } from "../../providers/novel/health.js";
import { MangaDexProvider } from "../../providers/manga/mangadex.js";
import { ZenkaiMangaProvider } from "../../providers/manga/zenkai.js";
import { NovelProvider } from "../../providers/novel/index.js";
import type { NovelBrowseOptions } from "../../providers/novel/index.js";

export type ProviderAvailabilityStatus =
  | "available"
  | "temporarily_unavailable"
  | "restricted"
  | "unsupported_embedding"
  | "external_reading_only";

export interface ProviderAvailability {
  slug: string;
  name: string;
  kind: "manga" | "novel";
  status: ProviderAvailabilityStatus;
  healthScore: number;
  lastError: string | null;
  lastCheckedAt: number;
  capabilities: string[];
}

/** Known manga providers and their capabilities. */
const MANGA_PROVIDERS: Array<{
  slug: string;
  name: string;
  status: ProviderAvailabilityStatus;
  capabilities: string[];
  check: () => Promise<boolean>;
}> = [
  {
    slug: "mangadex",
    name: "MangaDex",
    status: "available",
    capabilities: ["search", "detail", "chapters", "pages", "embed"],
    check: async () => {
      const provider = new MangaDexProvider();
      return provider.healthCheck();
    },
  },
  {
    slug: "zenkai",
    name: "Zenkai Multi-Source",
    status: "available",
    capabilities: ["search", "detail", "chapters", "pages"],
    check: async () => {
      const provider = new ZenkaiMangaProvider();
      return provider.healthCheck();
    },
  },
];

/** Known novel providers and their capabilities. */
const NOVEL_PROVIDERS: Array<{
  slug: string;
  name: string;
  status: ProviderAvailabilityStatus;
  capabilities: string[];
  check: () => Promise<boolean>;
}> = [
  {
    slug: "novelfire",
    name: "NovelFire",
    status: "available",
    capabilities: ["search", "detail", "chapters", "content"],
    check: async () => {
      const provider = new NovelProvider();
      return provider.healthCheck?.() ?? true;
    },
  },
  {
    slug: "novelfull",
    name: "NovelFull",
    status: "external_reading_only",
    capabilities: ["search", "detail", "chapters"],
    check: async () => true,
  },
  {
    slug: "webnovel",
    name: "WebNovel",
    status: "external_reading_only",
    capabilities: ["search", "detail", "chapters"],
    check: async () => true,
  },
  {
    slug: "lnori",
    name: "Lnori",
    status: "external_reading_only",
    capabilities: ["search", "detail", "chapters"],
    check: async () => true,
  },
];

export class ProviderAvailabilityService {
  async getMangaProviders(): Promise<ProviderAvailability[]> {
    const results: ProviderAvailability[] = [];

    for (const provider of MANGA_PROVIDERS) {
      const health = mangaHealthRegistry.get(provider.slug);
      let available = false;
      let lastError: string | null = null;

      try {
        available = await provider.check();
      } catch (err) {
        available = false;
        lastError = err instanceof Error ? err.message : "check failed";
      }

      if (!available) {
        mangaHealthRegistry.recordFailure(provider.slug, lastError ?? "health check failed");
      } else {
        mangaHealthRegistry.recordSuccess(provider.slug, 0);
      }

      const updated = mangaHealthRegistry.get(provider.slug);

      results.push({
        slug: provider.slug,
        name: provider.name,
        kind: "manga",
        status: available ? provider.status : "temporarily_unavailable",
        healthScore: updated.score,
        lastError: updated.lastError,
        lastCheckedAt: updated.lastCheckedAt,
        capabilities: provider.capabilities,
      });
    }

    return results;
  }

  async getNovelProviders(): Promise<ProviderAvailability[]> {
    const results: ProviderAvailability[] = [];

    for (const provider of NOVEL_PROVIDERS) {
      const health = novelHealthRegistry.get(provider.slug);
      let available = false;
      let lastError: string | null = null;

      try {
        available = await provider.check();
      } catch (err) {
        available = false;
        lastError = err instanceof Error ? err.message : "check failed";
      }

      if (!available) {
        novelHealthRegistry.recordFailure(provider.slug, lastError ?? "health check failed");
      } else {
        novelHealthRegistry.recordSuccess(provider.slug, 0);
      }

      const updated = novelHealthRegistry.get(provider.slug);

      results.push({
        slug: provider.slug,
        name: provider.name,
        kind: "novel",
        status: available ? provider.status : "temporarily_unavailable",
        healthScore: updated.score,
        lastError: updated.lastError,
        lastCheckedAt: updated.lastCheckedAt,
        capabilities: provider.capabilities,
      });
    }

    return results;
  }

  async getAllProviders(): Promise<ProviderAvailability[]> {
    const [manga, novel] = await Promise.all([
      this.getMangaProviders(),
      this.getNovelProviders(),
    ]);
    return [...manga, ...novel];
  }
}

export const providerAvailabilityService = new ProviderAvailabilityService();
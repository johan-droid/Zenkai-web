import { AppError } from "../../http/errors.js";
import { SAGAS, ARCS } from "./manifest.js";
import type {
  GrandLineSaga,
  GrandLineArc,
  GrandLineEpisodeDetail,
  GrandLineStatus,
  GrandLineEpisode,
} from "./types.js";

export interface SearchResultItem {
  episode: GrandLineEpisode;
  arc: {
    id: string;
    title: string;
    sagaId: string;
    sagaName: string;
    order: number;
  };
}

export class GrandLineService {
  private readonly sagas = SAGAS;
  private readonly arcs = ARCS;
  private readonly arcMap = new Map<string, GrandLineArc>();
  /** Flat list of all episodes in chronological order for easy adjacent lookups */
  private readonly allEpisodes: Array<{
    episode: GrandLineEpisode;
    arc: GrandLineArc;
    globalIndex: number;
  }> = [];

  constructor() {
    for (const arc of this.arcs) {
      this.arcMap.set(arc.id, arc);
      for (const ep of arc.episodes) {
        this.allEpisodes.push({
          episode: ep,
          arc,
          globalIndex: this.allEpisodes.length,
        });
      }
    }
  }

  /** Retrieve all 11 sagas with their constituent arc summaries */
  getSagas(): GrandLineSaga[] {
    return this.sagas;
  }

  /** Retrieve all arcs with summary metrics */
  getArcs(): Array<Omit<GrandLineArc, "episodes">> {
    return this.arcs.map(({ episodes, ...rest }) => rest);
  }

  /** Retrieve a single arc by slug with its full episode roster */
  getArc(arcId: string): GrandLineArc {
    const arc = this.arcMap.get(arcId);
    if (!arc) {
      throw new AppError("not_found", `One Pace arc "${arcId}" not found`, 404);
    }
    return arc;
  }

  /** Retrieve episode details, including manga/anime chapter mapping and adjacent navigation */
  getEpisode(arcId: string, episodeNumberOrId: string): GrandLineEpisodeDetail {
    const arc = this.getArc(arcId);
    
    // Normalize query: match "01", 1, or "romance-dawn-01"
    const normalizedTarget = episodeNumberOrId.toLowerCase().trim();
    const episodeIndex = arc.episodes.findIndex(
      (e) =>
        e.id.toLowerCase() === normalizedTarget ||
        e.episodeNumber.toLowerCase() === normalizedTarget ||
        parseInt(e.episodeNumber, 10) === parseInt(normalizedTarget, 10),
    );

    if (episodeIndex === -1) {
      throw new AppError(
        "not_found",
        `Episode "${episodeNumberOrId}" not found in arc "${arcId}"`,
        404,
      );
    }

    const currentEpisode = arc.episodes[episodeIndex];

    // Find in global timeline for seamless saga/arc boundary crossing
    const globalIdx = this.allEpisodes.findIndex(
      (item) => item.episode.id === currentEpisode.id,
    );

    const prevItem = globalIdx > 0 ? this.allEpisodes[globalIdx - 1] : null;
    const nextItem =
      globalIdx >= 0 && globalIdx < this.allEpisodes.length - 1
        ? this.allEpisodes[globalIdx + 1]
        : null;

    return {
      episode: currentEpisode,
      arc: {
        id: arc.id,
        title: arc.title,
        sagaId: arc.sagaId,
        sagaName: arc.sagaName,
        order: arc.order,
      },
      prevEpisode: prevItem
        ? {
            id: prevItem.episode.id,
            arcId: prevItem.arc.id,
            episodeNumber: prevItem.episode.episodeNumber,
            title: prevItem.episode.title,
          }
        : null,
      nextEpisode: nextItem
        ? {
            id: nextItem.episode.id,
            arcId: nextItem.arc.id,
            episodeNumber: nextItem.episode.episodeNumber,
            title: nextItem.episode.title,
          }
        : null,
    };
  }

  /** Search One Pace catalog by episode title, arc, manga chapter, or anime episode number */
  search(query: string, limit = 20): SearchResultItem[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return [];
    }

    const results: SearchResultItem[] = [];

    // Helper to check chapter numbers: if user queries "chapter 1000" or "ch 1000" or "1000"
    const numericMatch = q.match(/\b\d+\b/);
    const num = numericMatch ? numericMatch[0] : null;

    for (const item of this.allEpisodes) {
      const { episode, arc } = item;
      let matched = false;

      // 1. Title or synopsis match
      if (
        episode.title.toLowerCase().includes(q) ||
        episode.synopsis.toLowerCase().includes(q) ||
        arc.title.toLowerCase().includes(q) ||
        arc.sagaName.toLowerCase().includes(q)
      ) {
        matched = true;
      }

      // 2. Manga chapter match
      if (!matched && (episode.mangaChapters.toLowerCase().includes(q) || (num && episode.mangaChapters.includes(num)))) {
        matched = true;
      }

      // 3. Anime episode match
      if (!matched && (episode.animeEpisodes.toLowerCase().includes(q) || (num && episode.animeEpisodes.includes(num)))) {
        matched = true;
      }

      if (matched) {
        results.push({
          episode,
          arc: {
            id: arc.id,
            title: arc.title,
            sagaId: arc.sagaId,
            sagaName: arc.sagaName,
            order: arc.order,
          },
        });
        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  /** Catalog status and metadata freshness */
  getStatus(): GrandLineStatus {
    const totalEpisodes = this.arcs.reduce(
      (sum, arc) => sum + arc.episodeCount,
      0,
    );

    return {
      status: "ok",
      source: "onepace.net",
      officialSite: "https://onepace.net/en/watch",
      officialRss: "https://onepace.net/en/releases/rss.xml",
      sagasCount: this.sagas.length,
      arcsCount: this.arcs.length,
      episodesCount: totalEpisodes,
      lastUpdated: "2026-11-01T00:00:00Z",
    };
  }
}

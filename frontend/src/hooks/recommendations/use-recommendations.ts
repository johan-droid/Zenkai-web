"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface AnimeSummary {
  id: string;
  genres?: string[];
  studios?: string[];
  popularityRank?: number;
  season?: string;
  status?: string;
}

export type RecommendationSource = "watchlist" | "completed" | "favorites" | "history";

export type RecommendationReason =
  | "watched similar"
  | "same genre"
  | "same studio"
  | "popular in season"
  | "highly rated"
  | "recently completed"
  | "watchlist addition"
  | "random discovery"
  | "metadata-matched";

export interface RecommendationItem {
  anime: AnimeSummary;
  reason: RecommendationReason;
  score: number;
}

export interface RecommendationOptions {
  limit?: number;
  source?: RecommendationSource;
  excludeIds?: Set<string>;
}

export function useRecommendations(options: RecommendationOptions = {}) {
  const { limit = 10, source = "watchlist", excludeIds = new Set() } = options;

  // Try API first, fall back to trending data
  const { data: apiData, isLoading, isError } = useQuery<AnimeSummary[]>({
    queryKey: ["anime-recommendations-api", source],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/v1/anime/recommended?source=${source}`);
        if (!res.ok) throw new Error("API error");
        return (await res.json()) as AnimeSummary[];
      } catch {
        // Fall back to trending if API fails
        return [];
      }
    },
    staleTime: 5 * 60_000,
    enabled: false, // Disabled by default, manually enable when needed
  });

  // Use trending anime as source for recommendations
  const { data: trending, isLoading: loading } = useQuery<AnimeSummary[]>({
    queryKey: ["anime-trending", source],
    queryFn: async () => {
      const res = await fetch("/api/v1/anime/trending");
      return (await res.json()) as AnimeSummary[];
    },
    staleTime: 2 * 60_000,
  });

  const calculateCompatibility = (anime: AnimeSummary, userPrefs: {
    watchedGenres: Set<string>;
    favoriteStudios: Set<string>;
    popularityPreference: "high" | "medium" | "low";
    seasonalInterest: boolean;
  }): number => {
    let score = 0;
    const animeGenres = new Set(anime.genres?.map((g) => g.toLowerCase()) ?? []);
    const animeStudios = new Set(anime.studios?.map((s) => s.toLowerCase()) ?? []);

    // Genre match (max 30 points)
    const matchedGenres = [...userPrefs.watchedGenres].filter((g) => animeGenres.has(g));
    score += (matchedGenres.length / Math.max(userPrefs.watchedGenres.size, 1)) * 30;

    // Studio match (max 25 points)
    const matchedStudios = [...userPrefs.favoriteStudios].filter((s) => animeStudios.has(s));
    score += (matchedStudios.length / Math.max(userPrefs.favoriteStudios.size, 1)) * 25;

    // Popularity boost (max 20 points)
    if (anime.popularityRank) {
      const rank = anime.popularityRank;
      if (rank <= 50) score += 20;
      else if (rank <= 100) score += 15;
      else if (rank <= 200) score += 10;
    }

    // Seasonal boost (max 15 points)
    if (anime.season && userPrefs.seasonalInterest) {
      score += 10;
    }

    return Math.min(score, 100);
  };

  // Build user preferences from library/ratings (would come from IndexedDB)
  const userPrefs = useMemo(() => ({
    watchedGenres: new Set<"action" | "adventure" | "comedy" | "drama" | "fantasy" | "horror" | "mystery" | "romance" | "sci-fi" | "slice of life" | "sports" | "supernatural" | "thriller">(),
    favoriteStudios: new Set<"kimo" | "trigger" | "mapa" | "ufotable" | "studio ghibli">(),
    popularityPreference: "medium",
    seasonalInterest: false,
  }) as const, []);

  const recommendations = useMemo(() => {
    const animeList = apiData ?? trending ?? [];

    return animeList
      .filter((anime) => !excludeIds.has(anime.id))
      .map((anime) => {
        const score = calculateCompatibility(anime, userPrefs as any);
        if (score < 30) return null;
        // Assign reason based on highest contributing factor
        let reason: RecommendationReason = "metadata-matched";
        const animeGenres = new Set(anime.genres?.map((g) => g.toLowerCase()) ?? []);
        const animeStudios = new Set(anime.studios?.map((s) => s.toLowerCase()) ?? []);
        const matchedGenres = [...userPrefs.watchedGenres].filter((g) => animeGenres.has(g));
        const matchedStudios = [...userPrefs.favoriteStudios].filter((s) => animeStudios.has(s));

        if (matchedGenres.length > 0 && (matchedGenres.length / Math.max(userPrefs.watchedGenres.size, 1)) * 30 >= 25) {
          reason = "same genre";
        } else if (matchedStudios.length > 0 && (matchedStudios.length / Math.max(userPrefs.favoriteStudios.size, 1)) * 25 >= 20) {
          reason = "same studio";
        } else if (anime.popularityRank && anime.popularityRank <= 50) {
          reason = "popular in season";
        } else if (anime.status === "FINISHED") {
          reason = "recently completed";
        } else {
          reason = "watched similar";
        }

        return { anime, reason, score };
      })
      .filter((r) => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }, [apiData, trending, isLoading, excludeIds, userPrefs]);

  return { recommendations, isLoading, isError, refetch: () => apiData ? {} : {} };
}

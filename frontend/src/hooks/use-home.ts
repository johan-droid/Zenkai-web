"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchGenres, fetchHome, fetchMangaCatalogue } from "@/lib/api/zenkai";

/**
 * Home data hooks.
 *
 * Every home shelf reads the canonical backend through this one module, so a
 * shelf can never quietly grow its own provider call. Caching stays at the
 * backend (its discovery cache is authoritative); React Query only dedupes
 * and holds the last good page across navigations.
 */

export function useHome(perPage = 10) {
  return useQuery({
    queryKey: ["zenkai", "home", perPage],
    queryFn: () => fetchHome(perPage),
    staleTime: 3 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ["zenkai", "genres"],
    queryFn: () => fetchGenres(),
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
}

export function useMangaShelf(limit = 14) {
  return useQuery({
    queryKey: ["zenkai", "manga-shelf", limit],
    queryFn: () => fetchMangaCatalogue(limit),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

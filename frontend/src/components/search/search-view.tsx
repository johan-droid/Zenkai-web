"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, WifiOff, SlidersHorizontal } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { MediaGrid, MediaGridSkeleton } from "@/components/cards/media-grid";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useDebounce } from "@/hooks/use-debounce";
import { SEARCH_MIN_LENGTH } from "@/lib/api/zenkai";
import {
  discoveryCardToMedia,
  fetchAnimeSearch,
  searchState,
} from "@/lib/api/zenkai";

const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

const FORMATS = [
  { label: "TV", value: "TV" },
  { label: "Movie", value: "MOVIE" },
  { label: "OVA", value: "OVA" },
  { label: "ONA", value: "ONA" },
  { label: "Special", value: "SPECIAL" },
];

const STATUSES = [
  { label: "Airing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Upcoming", value: "NOT_YET_RELEASED" },
];

export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const debounced = useDebounce(term, 350);
  const trimmed = debounced.trim();

  const genre = params.get("genre") ?? undefined;
  const format = params.get("format") ?? undefined;
  const status = params.get("status") ?? undefined;

  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      const sp = new URLSearchParams(params.toString());
      if (value === undefined) sp.delete(key);
      else sp.set(key, value);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const query = useQuery({
    queryKey: ["anime-search", trimmed, { genre, format, status }],
    queryFn: () => fetchAnimeSearch(trimmed, 30),
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
    staleTime: 2 * 60_000,
  });

  const filteredCards = (query.data?.items ?? []).filter((card) => {
    if (genre && !card.genres.some((g) => g.toLowerCase() === genre.toLowerCase())) {
      return false;
    }
    if (format && card.format?.toUpperCase() !== format.toUpperCase()) {
      return false;
    }
    if (status && card.status?.toUpperCase() !== status.toUpperCase()) {
      return false;
    }
    return true;
  });

  const state = searchState({
    term: trimmed,
    flags: query,
    items: query.data ? filteredCards.map((card) => discoveryCardToMedia(card, "anime")) : undefined,
  });

  const hasFilters = Boolean(genre || format || status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg p-4 sm:p-5 bg-white/5 backdrop-blur-md">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-zinc-400" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search for a title…"
            className="h-10 rounded-xl border border-white/10 bg-white/3 pl-8 pr-8 text-sm text-zinc-200 placeholder-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {state.kind === "loading" ? (
          <MediaGridSkeleton count={12} />
        ) : state.kind === "items" ? (
          <MediaGrid items={state.items} priorityCount={6} />
        ) : state.kind === "empty" ? (
          <EmptyState
            icon={Search}
            title={`No results for "${trimmed}"`}
            description={hasFilters ? "No titles matched your query with the current filters." : 'Check the spelling or try a shorter query.'}
            action={hasFilters ? (
              <Button variant="outline" className="rounded-xl" onClick={() => {
                setFilter("genre", undefined);
                setFilter("format", undefined);
                setFilter("status", undefined);
              }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        ) : state.kind === "error" ? (
          <EmptyState
            icon={WifiOff}
            title="Search is temporarily unavailable"
            description={query.error?.message ?? "Search is temporarily unavailable"}
            action={
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Start typing to search"
            description="Enter at least two characters. Press ⌘K anywhere for the quick palette."
          />
        )}
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, WifiOff, X, Filter, Sparkles } from "lucide-react";
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
  { label: "All Formats", value: undefined },
  { label: "TV Series", value: "TV" },
  { label: "Movie", value: "MOVIE" },
  { label: "OVA", value: "OVA" },
  { label: "ONA", value: "ONA" },
  { label: "Special", value: "SPECIAL" },
];

const STATUSES = [
  { label: "All Statuses", value: undefined },
  { label: "Currently Airing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Upcoming", value: "NOT_YET_RELEASED" },
];

export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const debounced = useDebounce(term, 300);
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

  const clearAllFilters = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("genre");
    sp.delete("format");
    sp.delete("status");
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [params, router]);

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
      {/* Search Header Container */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#121218]/90 p-4 sm:p-6 backdrop-blur-xl shadow-xl shadow-black/40">
        {/* Search Input Field */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-zinc-400" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search anime titles, genres, studios…"
            className={cn(
              "h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-10 text-sm sm:text-base text-zinc-100 placeholder-zinc-500",
              "focus-visible:border-[#C51F3A] focus-visible:ring-1 focus-visible:ring-[#C51F3A] transition-all",
            )}
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear search input"
              className="absolute right-3 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col gap-3 pt-1">
          {/* Format & Status Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mr-1">
              <Filter className="size-3.5 text-[#C51F3A]" />
              <span>Filters:</span>
            </div>

            {/* Format Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {FORMATS.map((f) => {
                const isSelected = format === f.value || (!format && f.value === undefined);
                return (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFilter("format", f.value)}
                    className={cn(
                      "min-h-10 rounded-lg px-3 py-2 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                      isSelected
                        ? "bg-[#C51F3A] text-white shadow-sm shadow-[#C51F3A]/40 font-semibold"
                        : "bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08]",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Airing Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
              {STATUSES.map((s) => {
                const isSelected = status === s.value || (!status && s.value === undefined);
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setFilter("status", s.value)}
                    className={cn(
                      "min-h-10 rounded-lg px-3 py-2 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                      isSelected
                        ? "bg-white/20 text-white font-semibold ring-1 ring-white/30"
                        : "bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08]",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="ml-auto h-7 rounded-lg px-2 text-xs text-[#ff4a68] hover:bg-[#C51F3A]/20 hover:text-white"
              >
                Clear all
              </Button>
            ) : null}
          </div>

          {/* Genre Chips Carousel */}
          <div className="no-scrollbar -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pt-1 pb-0.5">
            {GENRES.map((g) => {
              const isSelected = genre?.toLowerCase() === g.toLowerCase();
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFilter("genre", isSelected ? undefined : g)}
                  className={cn(
                    "min-h-10 shrink-0 snap-start rounded-lg px-3 py-2 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                    isSelected
                      ? "border border-[#C51F3A] bg-[#C51F3A]/20 text-white font-semibold shadow-sm"
                      : "border border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.08]",
                  )}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Container */}
      <div className="flex flex-col gap-4">
        {state.kind === "loading" ? (
          <MediaGridSkeleton count={12} />
        ) : state.kind === "items" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-zinc-400">
                Found {state.items.length} titles
              </span>
            </div>
            <MediaGrid items={state.items} priorityCount={6} />
          </div>
        ) : state.kind === "empty" ? (
          <EmptyState
            icon={Search}
            title={`No results for "${trimmed}"`}
            description={
              hasFilters
                ? "No titles matched your query with the current filters applied."
                : "Check the spelling or try a broader search query."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  className="rounded-xl border-white/20 bg-white/5 hover:bg-white/10"
                  onClick={clearAllFilters}
                >
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        ) : state.kind === "error" ? (
          <EmptyState
            icon={WifiOff}
            title="Search is temporarily unavailable"
            description={query.error?.message ?? "Unable to reach search service"}
            action={
              <Button
                variant="outline"
                className="rounded-xl border-white/20 bg-white/5 hover:bg-white/10"
                onClick={() => query.refetch()}
              >
                Try again
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Discover anime and manga"
            description="Type at least two characters to search across our full catalog. Press ⌘K anywhere for the instant palette."
          />
        )}
      </div>
    </div>
  );
}

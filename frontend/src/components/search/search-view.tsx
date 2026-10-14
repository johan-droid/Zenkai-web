"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, WifiOff, SlidersHorizontal } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { MediaGrid, MediaGridSkeleton } from "@/components/cards/media-grid";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  discoveryCardToMedia,
  fetchAnimeSearch,
  searchState,
  SEARCH_MIN_LENGTH,
} from "@/lib/api/zenkai";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Horror", "Mystery", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller",
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

  const state = searchState({
    term: trimmed,
    flags: query,
    items: query.data?.items.map((card) => discoveryCardToMedia(card, "anime")),
  });

  const hasFilters = Boolean(genre || format || status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search for a title…"
            className="h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 text-base"
            aria-label="Search anime"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <SlidersHorizontal className="size-3.5" /> Genre
            </span>
            {GENRES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter("genre", genre === item ? undefined : item)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  genre === item
                    ? "border-[#c8102e] bg-[#c8102e] text-white"
                    : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-[#c8102e]/50 hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Format
              </span>
              {FORMATS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter("format", format === item.value ? undefined : item.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    format === item.value
                      ? "border-[#c8102e] bg-[#c8102e] text-white"
                      : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-[#c8102e]/50 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </span>
              {STATUSES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter("status", status === item.value ? undefined : item.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    status === item.value
                      ? "border-[#c8102e] bg-[#c8102e] text-white"
                      : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-[#c8102e]/50 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => {
                setFilter("genre", undefined);
                setFilter("format", undefined);
                setFilter("status", undefined);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {state.kind === "loading" ? (
        <MediaGridSkeleton count={12} />
      ) : state.kind === "items" ? (
        <MediaGrid items={state.items} priorityCount={6} />
      ) : state.kind === "empty" ? (
        <EmptyState
          icon={Search}
          title={`No results for "${state.query}"`}
          description="Check the spelling or try a shorter query."
        />
      ) : state.kind === "error" ? (
        <EmptyState
          icon={WifiOff}
          title="Search is temporarily unavailable"
          description={state.message}
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
  );
}

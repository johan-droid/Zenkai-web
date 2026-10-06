"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, WifiOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

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

/**
 * Anime title search on the canonical backend (P15).
 *
 * The page used to call `browseMedia` in the browser and render AniList rows.
 * It now asks `GET /api/v1/anime/search` for canonical cards and maps them onto
 * the same neutral `MediaSummary` the home shelves use, so a title looks the
 * same wherever it is found and clicking it routes through the existing
 * cross-reference href rather than a provider id.
 *
 * Behaviour deliberately preserved from before the migration: a 350ms debounce,
 * a two-character minimum so typing does not fan out into a request per
 * keystroke, and the same copy for the idle and empty states. This is a
 * migration of the data source, not a redesign of the surface.
 *
 * Manga search is not here yet: its endpoint carries the same two-shape response
 * defect anime search had, and fixing that is P17's job. Until then the Manga
 * tab is absent rather than still calling a provider from this page.
 */
export function SearchView() {
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const debounced = useDebounce(term, 350);
  const trimmed = debounced.trim();

  const query = useQuery({
    queryKey: ["anime-search", trimmed],
    queryFn: () => fetchAnimeSearch(trimmed, 30),
    // Below the minimum length no request is issued at all.
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
    staleTime: 2 * 60_000,
  });

  const state = searchState({
    term: trimmed,
    flags: query,
    items: query.data?.items.map((card) => discoveryCardToMedia(card, "anime")),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search for a title…"
            className="glass h-11 rounded-xl pl-9 text-base"
            aria-label="Search anime"
          />
        </div>
      </div>

      {state.kind === "loading" ? (
        <MediaGridSkeleton count={12} />
      ) : state.kind === "items" ? (
        <MediaGrid items={state.items} priorityCount={6} />
      ) : state.kind === "empty" ? (
        <EmptyState
          icon={Search}
          title={`No results for “${state.query}”`}
          description="Check the spelling or try a shorter query."
        />
      ) : state.kind === "error" ? (
        // Never "no results": nothing was able to answer, which is a different
        // statement from the catalogue having no match.
        <EmptyState
          icon={WifiOff}
          title="Search is temporarily unavailable"
          description={state.message}
          action={
            <Button variant="outline" className="glass rounded-xl" onClick={() => query.refetch()}>
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
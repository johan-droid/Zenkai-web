"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { MediaGrid, MediaGridSkeleton } from "@/components/cards/media-grid";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HttpError } from "@/lib/api/http";
import { fetchBrowsePage } from "@/lib/api/zenkai";
import type { MediaKind } from "@/lib/media";
import { PAGE_SIZE } from "@/config/site";
import { cn } from "@/lib/utils";

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

const ANIME_FORMATS: { label: string; value: string }[] = [
  { label: "TV", value: "TV" },
  { label: "Movie", value: "MOVIE" },
  { label: "OVA", value: "OVA" },
  { label: "ONA", value: "ONA" },
  { label: "Special", value: "SPECIAL" },
];

const ANIME_STATUSES: { label: string; value: string }[] = [
  { label: "Airing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Upcoming", value: "NOT_YET_RELEASED" },
];

const MANGA_STATUSES: { label: string; value: string }[] = [
  { label: "Ongoing", value: "ONGOING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Hiatus", value: "HIATUS" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Sort vocabularies mirror the backend's `ANIME_SORTS`/`MANGA_SORTS` exactly.
 * "trending" is not a catalogue sort — it has no column behind it — so it is
 * routed to the discovery endpoint rather than sent to `/api/v1/anime`, which
 * would reject it with a 400.
 */
const ANIME_SORTS: { label: string; value: string }[] = [
  { label: "Trending", value: "trending" },
  { label: "Popularity", value: "popularity" },
  { label: "Score", value: "score" },
  { label: "Newest", value: "newest" },
  { label: "Recently updated", value: "recently-updated" },
  { label: "Recently added", value: "recently-added" },
  { label: "Title", value: "title" },
];

const MANGA_SORTS: { label: string; value: string }[] = [
  { label: "Most followed", value: "followed" },
  { label: "Rating", value: "rating" },
  { label: "Newest", value: "newest" },
  { label: "Recently updated", value: "recently-updated" },
  { label: "Title", value: "title" },
];

const DEFAULT_SORT: Record<MediaKind, string> = {
  anime: "trending",
  manga: "followed",
  novel: "popular",
};

/** Reads and writes filter values in the URL search params. */
function useFilterState() {
  const router = useRouter();
  const params = useSearchParams();

  const value = useCallback(
    (key: string) => params.get(key) ?? undefined,
    [params],
  );

  const set = useCallback(
    (key: string, next?: string) => {
      const sp = new URLSearchParams(params.toString());
      if (next === undefined) sp.delete(key);
      else sp.set(key, next);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const toggle = useCallback(
    (key: string, option: string) => {
      set(key, params.get(key) === option ? undefined : option);
    },
    [params, set],
  );

  return { value, set, toggle };
}

function sortLabel(kind: MediaKind, value: string): string {
  const options = kind === "anime" ? ANIME_SORTS : MANGA_SORTS;
  return (
    options.find((option) => option.value === value)?.label ??
    options[0]!.label
  );
}

export function BrowseView({ kind }: { kind: MediaKind }) {
  const { value, set, toggle } = useFilterState();

  const genre = value("genre");
  const format = kind === "anime" ? value("format") : undefined;
  const status = value("status");

  const sorts = kind === "anime" ? ANIME_SORTS : MANGA_SORTS;
  const statuses = kind === "anime" ? ANIME_STATUSES : MANGA_STATUSES;
  // A sort value left in the URL by the other kind (or by a hand-edited link)
  // falls back to this kind's default rather than being sent to a backend that
  // would reject it.
  const rawSort = value("sort");
  const sort =
    rawSort && sorts.some((option) => option.value === rawSort)
      ? rawSort
      : DEFAULT_SORT[kind];

  const query = useInfiniteQuery({
    queryKey: ["browse", kind, { genre, format, status, sort }] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchBrowsePage(kind, { genre, format, status, sort }, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasNextPage ? pages.length + 1 : undefined,
    staleTime: 5 * 60_000,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const badRequest =
    query.error instanceof HttpError && query.error.status === 400;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.18em] text-ink-3">
            Genre
          </span>
          <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 sm:flex-wrap">
            {GENRES.map((item) => (
              <FilterChip
                key={item}
                active={genre === item}
                onClick={() => toggle("genre", item)}
              >
                {item}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
          {kind === "anime" && (
            <FilterGroup label="Format">
              {ANIME_FORMATS.map((item) => (
                <FilterChip
                  key={item.value}
                  active={format === item.value}
                  onClick={() => toggle("format", item.value)}
                >
                  {item.label}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Status">
            {statuses.map((item) => (
              <FilterChip
                key={item.value}
                active={status === item.value}
                onClick={() => toggle("status", item.value)}
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[0.65rem] text-ink-3 tabular-nums">
              {total.toLocaleString()} titles
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-md border border-white/10 px-2.5 text-[0.7rem] text-ink-2 hover:border-white/25 hover:text-ink-1"
                >
                  Sort: {sortLabel(kind, sort)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                {sorts.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => set("sort", option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(genre || format || status) && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start px-0 text-[0.7rem] text-ink-3 hover:text-ink-1"
            onClick={() => {
              set("genre");
              set("format");
              set("status");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <MediaGridSkeleton />
      ) : query.isError ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={
            badRequest
              ? "Those filters are not supported"
              : "Browse is temporarily unavailable"
          }
          description={
            badRequest
              ? "One of the selected filters was rejected. Clear the filters and try again."
              : "The catalogue could not be reached. Try again in a moment."
          }
          action={
            <Button
              variant="outline"
              className="glass rounded-xl"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : items.length ? (
        <>
          <MediaGrid items={items} priorityCount={6} />
          {query.hasNextPage ? (
            <Button
              variant="outline"
              className="glass mx-auto rounded-xl"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? (
                <Loader2 className="animate-spin" />
              ) : null}
              Load more
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={SlidersHorizontal}
          title="Nothing matches those filters"
          description="Try removing a filter or two, or search for a specific title instead."
        />
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.18em] text-ink-3">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative min-h-9 shrink-0 px-0.5 py-1.5 text-xs font-medium transition-colors",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-signal after:transition-opacity",
        "focus-visible:outline-none focus-visible:text-ink-1 focus-visible:after:opacity-100",
        active
          ? "text-ink-1 after:opacity-100"
          : "text-ink-3 after:opacity-0 hover:text-ink-1",
      )}
    >
      {children}
    </button>
  );
}

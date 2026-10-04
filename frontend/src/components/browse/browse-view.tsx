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
import {
  browseMedia,
  type AniListMediaFormat,
  type AniListMediaStatus,
  type AniListMediaType,
  type AniListSort,
} from "@/lib/api/anilist";
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

const FORMATS: { label: string; value: AniListMediaFormat }[] = [
  { label: "TV", value: "TV" },
  { label: "Movie", value: "MOVIE" },
  { label: "OVA", value: "OVA" },
  { label: "ONA", value: "ONA" },
  { label: "Special", value: "SPECIAL" },
];

const STATUSES: { label: string; value: AniListMediaStatus }[] = [
  { label: "Airing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Upcoming", value: "NOT_YET_RELEASED" },
];

const SORTS: { label: string; value: AniListSort }[] = [
  { label: "Trending", value: "TRENDING_DESC" },
  { label: "Popularity", value: "POPULARITY_DESC" },
  { label: "Score", value: "SCORE_DESC" },
  { label: "Newest", value: "START_DATE_DESC" },
  { label: "Recently updated", value: "UPDATED_AT_DESC" },
  { label: "Title", value: "TITLE_ROMAJI" },
];

/** Reads a single filter value from the URL search params. */
function useFilterState() {
  const router = useRouter();
  const params = useSearchParams();

  const value = useCallback((key: string) => params.get(key) ?? undefined, [params]);

  const set = useCallback(
    (key: string, next?: string) => {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(key, next);
      else query.delete(key);
      router.replace(`?${query.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const toggle = useCallback(
    (key: string, next: string) => {
      set(key, params.get(key) === next ? undefined : next);
    },
    [params, set],
  );

  return { value, set, toggle };
}

export function BrowseView({ type }: { type: AniListMediaType }) {
  const { value, set, toggle } = useFilterState();

  const genre = value("genre");
  const format = value("format") as AniListMediaFormat | undefined;
  const status = value("status") as AniListMediaStatus | undefined;
  const sort = (value("sort") as AniListSort | undefined) ?? "TRENDING_DESC";
  const search = value("q");

  const query = useInfiniteQuery({
    queryKey: ["browse", type, { genre, format, status, sort, search }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browseMedia({
        type,
        page: pageParam,
        perPage: PAGE_SIZE,
        genre,
        format,
        status,
        sort: [sort],
        search,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.currentPage + 1 : undefined,
    staleTime: 5 * 60_000,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.pageInfo.total ?? 0;
  const activeSort = SORTS.find((option) => option.value === sort) ?? SORTS[0]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 pr-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <SlidersHorizontal className="size-3.5" /> Genre
          </span>
          {GENRES.map((item) => (
            <FilterChip key={item} active={genre === item} onClick={() => toggle("genre", item)}>
              {item}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterGroup label="Format">
            {FORMATS.map((item) => (
              <FilterChip
                key={item.value}
                active={format === item.value}
                onClick={() => toggle("format", item.value)}
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Status">
            {STATUSES.map((item) => (
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
            <span className="text-xs text-muted-foreground">
              {total.toLocaleString()} titles
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="glass rounded-xl">
                  Sort: {activeSort.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                {SORTS.map((option) => (
                  <DropdownMenuItem key={option.value} onSelect={() => set("sort", option.value)}>
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
            className="self-start text-muted-foreground"
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
              {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-400/60 bg-brand-500/20 text-foreground"
          : "border-glass-border bg-white/5 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

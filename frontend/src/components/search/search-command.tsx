"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, TrendingUp, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  discoveryCardToMedia,
  fetchAnimeSearch,
  fetchDiscovery,
  SEARCH_MIN_LENGTH,
} from "@/lib/api/zenkai";
import { displayTitle, mediaHref, type MediaSummary } from "@/lib/media";
import { useDebounce } from "@/hooks/use-debounce";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Command-palette style search. Opens with ⌘K / Ctrl+K or by clicking the
 * trigger passed as `children`.
 *
 * Migrated with the search page (P15): both the query and the trending shelf
 * that shows before a term is typed come from the canonical backend through
 * `lib/api/zenkai`, so the palette has no provider client of its own. Two
 * separate search implementations is exactly how this drift back to a direct
 * provider call happens.
 */
export function SearchCommand({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The pre-search shelf. Canonical trending, not a provider sort enum.
  const trending = useQuery({
    queryKey: ["search", "trending"],
    queryFn: () => fetchDiscovery("trending", { perPage: 6 }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const results = useQuery({
    queryKey: ["anime-search-palette", debounced.trim()],
    queryFn: () => fetchAnimeSearch(debounced.trim(), 8),
    enabled: open && debounced.trim().length >= SEARCH_MIN_LENGTH,
    staleTime: 60_000,
  });

  const go = (media: MediaSummary) => {
    setOpen(false);
    setTerm("");
    router.push(mediaHref(media));
  };

  const showingResults = debounced.trim().length >= SEARCH_MIN_LENGTH;
  const resultItems = results.data?.items.map((card) =>
    discoveryCardToMedia(card, "anime"),
  );
  const trendingItems = trending.data?.items.map((card) =>
    discoveryCardToMedia(card, "anime"),
  );

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {children}
      </span>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Zenkai"
        description="Search anime titles"
        className="glass-strong"
      >
        <CommandInput
          placeholder="Search anime titles…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {showingResults && results.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : null}

          <CommandEmpty>
            {showingResults
              ? results.isError
                ? "Search is temporarily unavailable."
                : "No results found."
              : "Type to search…"}
          </CommandEmpty>

          {showingResults && resultItems?.length ? (
            <CommandGroup heading="Results">
              {resultItems.map((media) => (
                <MediaCommandItem key={`${media.kind}-${media.id}`} media={media} onSelect={go} />
              ))}
            </CommandGroup>
          ) : null}

          {/* A failed shelf must not read as "there is nothing trending". */}
          {!showingResults && trending.isError ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <WifiOff className="size-4" /> Trending is temporarily unavailable.
            </div>
          ) : null}

          {!showingResults && !trending.isError && trendingItems?.length ? (
            <CommandGroup heading="Trending now">
              {trendingItems.map((media) => (
                <MediaCommandItem key={`${media.kind}-${media.id}`} media={media} onSelect={go} />
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function MediaCommandItem({
  media,
  onSelect,
}: {
  media: MediaSummary;
  onSelect: (media: MediaSummary) => void;
}) {
  const title = displayTitle(media.title);
  return (
    <CommandItem value={`${title} ${media.id}`} onSelect={() => onSelect(media)}>
      {media.cover.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.cover.url}
          alt=""
          className="size-9 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
          <TrendingUp className="size-4 text-muted-foreground" />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {media.kind === "anime" ? "Anime" : "Manga"}
          {media.seasonYear ? ` · ${media.seasonYear}` : ""}
        </span>
      </span>
      <Search className="ml-auto size-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
    </CommandItem>
  );
}

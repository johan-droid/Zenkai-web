"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { MediaGrid, MediaGridSkeleton } from "@/components/cards/media-grid";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browseMedia } from "@/lib/api/anilist";
import { useDebounce } from "@/hooks/use-debounce";

export function SearchView() {
  const params = useSearchParams();
  const [kind, setKind] = useState<"ANIME" | "MANGA">("ANIME");
  const [term, setTerm] = useState(params.get("q") ?? "");
  const debounced = useDebounce(term, 350);
  const trimmed = debounced.trim();

  const query = useQuery({
    queryKey: ["search", "full", kind, trimmed],
    queryFn: () => browseMedia({ type: kind, search: trimmed, perPage: 30 }),
    enabled: trimmed.length >= 2,
    staleTime: 2 * 60_000,
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
            aria-label="Search"
          />
        </div>

        <Tabs value={kind} onValueChange={(value) => setKind(value as "ANIME" | "MANGA")}>
          <TabsList className="glass rounded-xl">
            <TabsTrigger value="ANIME">Anime</TabsTrigger>
            <TabsTrigger value="MANGA">Manga</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {trimmed.length < 2 ? (
        <EmptyState
          icon={Search}
          title="Start typing to search"
          description="Enter at least two characters. Press ⌘K anywhere for the quick palette."
        />
      ) : query.isLoading ? (
        <MediaGridSkeleton count={12} />
      ) : query.data?.items.length ? (
        <MediaGrid items={query.data.items} priorityCount={6} />
      ) : (
        <EmptyState
          icon={Search}
          title={`No results for “${trimmed}”`}
          description="Check the spelling or try a shorter query."
        />
      )}
    </div>
  );
}

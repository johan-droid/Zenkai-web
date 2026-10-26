"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tv, Check, Play, Search } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching, useTitleProgress } from "@/hooks/use-progress";
import {
  animeDetailToDetailData,
  classifyDetailError,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
} from "@/lib/api/zenkai";
import { watchHref } from "@/lib/media";
import { cn } from "@/lib/utils";

const EPISODES_PER_CHUNK = 50;

export function AnimeDetailView({ id }: { id: string }) {
  const detailQuery = useQuery({
    queryKey: ["detail", "anime", id],
    queryFn: async () => animeDetailToDetailData(await fetchAnimeDetail(id)),
    staleTime: 10 * 60_000,
  });

  const episodesQuery = useQuery({
    queryKey: ["anime-episodes", id],
    queryFn: () => fetchAnimeEpisodes(id),
    staleTime: 10 * 60_000,
  });

  const continueEntries = useContinueWatching("anime");
  const continueEntry = continueEntries?.find((e) => e.mediaId === id);
  const continueUnit = continueEntry?.unit ?? null;

  const { data, isLoading, error, refetch } = detailQuery;

  if (isLoading) return <DetailSkeleton />;

  if (error) {
    const failure = classifyDetailError(error);
    if (failure === "not_found") return <DetailNotFound kind="anime" />;

    return (
      <EmptyState
        icon={Tv}
        title={
          failure === "invalid_response"
            ? "Unexpected API response"
            : "Could not load this title"
        }
        description={
          failure === "invalid_response"
            ? "The Zenkai API returned data this page could not understand, so nothing was rendered from it."
            : "The Zenkai API could not be reached. This is a loading problem, not a missing title."
        }
        action={
          failure === "invalid_response" ? (
            <Button variant="outline" className="glass rounded-xl" asChild>
              <Link href="/anime">Back to browse</Link>
            </Button>
          ) : (
            <Button variant="outline" className="glass rounded-xl" onClick={() => refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  if (!data) return <DetailNotFound kind="anime" />;

  return (
    <DetailLayout data={data} kind="anime" continueUnit={continueUnit}>
      <EpisodeSection id={id} query={episodesQuery} continueUnit={continueUnit} />
    </DetailLayout>
  );
}

function EpisodeSection({
  id,
  query,
  continueUnit,
}: {
  id: string;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchAnimeEpisodes>>>>;
  continueUnit: number | null;
}) {
  const catalogue = query.data;
  const titleProgress = useTitleProgress("anime", id);
  const [filterQuery, setFilterQuery] = useState("");

  const episodes = useMemo(() => catalogue?.episodes ?? [], [catalogue?.episodes]);
  const totalCount = episodes.length;

  // Determine initial chunk based on continueUnit if present
  const initialChunkIndex = useMemo(() => {
    if (!continueUnit || totalCount <= EPISODES_PER_CHUNK) return 0;
    const idx = episodes.findIndex((ep) => ep.episodeNumber === continueUnit);
    return idx >= 0 ? Math.floor(idx / EPISODES_PER_CHUNK) : 0;
  }, [continueUnit, episodes, totalCount]);

  const [selectedChunk, setSelectedChunk] = useState<number>(initialChunkIndex);

  const watchedSet = useMemo(() => {
    const set = new Set<number>();
    if (titleProgress) {
      for (const record of titleProgress) {
        if (record.completed) set.add(record.unit);
      }
    }
    return set;
  }, [titleProgress]);

  const inProgressSet = useMemo(() => {
    const set = new Set<number>();
    if (titleProgress) {
      for (const record of titleProgress) {
        if (!record.completed && record.positionSeconds > 10) set.add(record.unit);
      }
    }
    return set;
  }, [titleProgress]);

  if (query.isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold tracking-tight">Episodes</h2>
        <p className="text-sm text-muted-foreground">
          The episode list could not be loaded right now.
        </p>
      </section>
    );
  }

  if (catalogue && totalCount === 0) return null;

  // Filter episodes by search input if provided
  const searchTrimmed = filterQuery.trim();
  const isSearching = searchTrimmed.length > 0;

  const displayedEpisodes = isSearching
    ? episodes.filter((ep) => ep.episodeNumber.toString().includes(searchTrimmed))
    : totalCount > EPISODES_PER_CHUNK
    ? episodes.slice(selectedChunk * EPISODES_PER_CHUNK, (selectedChunk + 1) * EPISODES_PER_CHUNK)
    : episodes;

  const totalChunks = Math.ceil(totalCount / EPISODES_PER_CHUNK);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold tracking-tight">
          Episodes
          {catalogue ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {catalogue.knownTotal && catalogue.knownTotal !== catalogue.catalogueCount
                ? `${catalogue.catalogueCount} of ${catalogue.knownTotal} available`
                : `${catalogue.catalogueCount} available`}
            </span>
          ) : null}
        </h2>

        {totalCount > 15 ? (
          <div className="relative w-full sm:w-48">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Find episode…"
              className="h-8 rounded-lg pl-8 text-xs bg-white/5 border-white/10"
              aria-label="Filter episodes"
            />
          </div>
        ) : null}
      </div>

      {/* Episode Range Chunks (for long-running series like One Piece, Bleach, Naruto) */}
      {!isSearching && totalChunks > 1 ? (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {Array.from({ length: totalChunks }).map((_, idx) => {
            const start = idx * EPISODES_PER_CHUNK + 1;
            const end = Math.min((idx + 1) * EPISODES_PER_CHUNK, totalCount);
            const active = selectedChunk === idx;
            return (
              <Button
                key={idx}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedChunk(idx)}
                className={cn(
                  "shrink-0 rounded-xl text-xs font-semibold",
                  active
                    ? "bg-[#c8102e] text-white hover:bg-[#a00d25]"
                    : "glass text-muted-foreground hover:text-white",
                )}
              >
                {start}–{end}
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {catalogue ? (
          displayedEpisodes.map((episode) => {
            const watched = watchedSet.has(episode.episodeNumber);
            const inProgress = inProgressSet.has(episode.episodeNumber);
            const unreleased = episode.airingState === "upcoming";
            const isCurrent = continueUnit === episode.episodeNumber;
            return (
              <Button
                key={episode.id}
                variant="outline"
                className={cn(
                  "relative justify-start rounded-xl transition-all",
                  isCurrent && "border-[#c8102e] bg-[#c8102e]/20 text-white ring-1 ring-[#c8102e]/60",
                  watched && !isCurrent && "border-[#c8102e]/30 bg-[#c8102e]/10 text-white/90",
                  unreleased && "opacity-60",
                )}
                asChild
              >
                <Link
                  href={watchHref(id, episode.episodeNumber)}
                  title={unreleased ? "Not yet aired" : undefined}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {watched && <Check className="size-3 text-[#e52545] shrink-0" />}
                    {inProgress && !watched && <Play className="size-3 text-amber-400 shrink-0" />}
                    <span className="truncate">EP {episode.episodeNumber}</span>
                  </span>
                </Link>
              </Button>
            );
          })
        ) : (
          Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-xl" />
          ))
        )}
      </div>

      {isSearching && displayedEpisodes.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No episode found matching &ldquo;{filterQuery}&rdquo;.
        </p>
      ) : null}
    </section>
  );
}

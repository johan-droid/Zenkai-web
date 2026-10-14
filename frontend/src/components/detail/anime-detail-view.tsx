"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Tv, Check, Play } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching, useUnitProgress, useTitleProgress } from "@/hooks/use-progress";
import {
  animeDetailToDetailData,
  classifyDetailError,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
} from "@/lib/api/zenkai";
import { watchHref } from "@/lib/media";
import { cn } from "@/lib/utils";

const MAX_EPISODE_BUTTONS = 60;

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
    <DetailLayout data={data} kind="anime">
      <EpisodeSection id={id} query={episodesQuery} />
    </DetailLayout>
  );
}

function EpisodeSection({
  id,
  query,
}: {
  id: string;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchAnimeEpisodes>>>>;
}) {
  const catalogue = query.data;
  const titleProgress = useTitleProgress("anime", id);

  const watchedSet = React.useMemo(() => {
    const set = new Set<number>();
    if (titleProgress) {
      for (const record of titleProgress) {
        if (record.completed) set.add(record.unit);
      }
    }
    return set;
  }, [titleProgress]);

  const inProgressSet = React.useMemo(() => {
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

  if (catalogue && catalogue.episodes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold tracking-tight">
        Episodes
        {catalogue ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {catalogue.catalogueCount} episodes
          </span>
        ) : null}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {catalogue ? (
          catalogue.episodes.slice(0, MAX_EPISODE_BUTTONS).map((episode) => {
            const watched = watchedSet.has(episode.episodeNumber);
            const inProgress = inProgressSet.has(episode.episodeNumber);
            const unreleased = episode.airingState === "upcoming";
            return (
              <Button
                key={episode.id}
                variant="outline"
                className={cn(
                  "relative justify-start rounded-xl",
                  watched && "border-[#c8102e]/40 bg-[#c8102e]/10",
                  unreleased && "opacity-60",
                )}
                asChild
              >
                <Link
                  href={watchHref(id, episode.episodeNumber)}
                  title={unreleased ? "Not yet aired" : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {watched && <Check className="size-3 text-[#e52545]" />}
                    {inProgress && !watched && <Play className="size-3 text-amber-400" />}
                    EP {episode.episodeNumber}
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
    </section>
  );
}

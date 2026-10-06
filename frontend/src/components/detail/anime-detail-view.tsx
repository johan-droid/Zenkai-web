"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Tv } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  animeDetailToDetailData,
  classifyDetailError,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
} from "@/lib/api/zenkai";
import { watchHref } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Episodes the grid renders before it stops; presentation limit only. */
const MAX_EPISODE_BUTTONS = 60;

/**
 * The canonical anime detail surface (P13).
 *
 * Every byte of data comes from the Zenkai backend: detail from
 * `GET /api/v1/anime/:id`, the episode grid from the canonical catalogue at
 * `GET /api/v1/anime/:id/episodes`. The view imports no provider client and
 * constructs no provider URL — `test/detail-boundary.test.ts` is the standing
 * regression gate for that rule.
 *
 * Failures stay distinguishable: 404 is "title not found", a payload outside
 * the contract is "unexpected response" (never rendered as data), and anything
 * else is a loading failure with a retry — an outage is not a missing anime.
 */
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

/**
 * The episode shelf, rendered from canonical catalogue rows.
 *
 * Buttons are keyed and addressed by `episodeNumber` from the backend — never
 * by array index — and an episode without an aired slot is visibly marked as
 * not-yet-aired using the canonical `airingState`, without inventing a date
 * or a status the backend did not assert.
 */
function EpisodeSection({
  id,
  query,
}: {
  id: string;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchAnimeEpisodes>>>>;
}) {
  const catalogue = query.data;

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

  // A loaded, genuinely empty catalogue renders no section at all.
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {catalogue ? (
          catalogue.episodes.slice(0, MAX_EPISODE_BUTTONS).map((episode) => (
            <Button
              key={episode.id}
              variant="outline"
              className={cn(
                "glass justify-start rounded-xl",
                episode.airingState === "upcoming" && "opacity-60",
              )}
              asChild
            >
              <Link
                href={watchHref(id, episode.episodeNumber)}
                title={episode.airingState === "upcoming" ? "Not yet aired" : undefined}
              >
                EP {episode.episodeNumber}
              </Link>
            </Button>
          ))
        ) : (
          Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-xl" />
          ))
        )}
      </div>
    </section>
  );
}

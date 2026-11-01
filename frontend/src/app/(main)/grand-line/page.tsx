"use client";

import { useMemo } from "react";
import { GrandLineHero } from "@/components/grand-line/grand-line-hero";
import { ContinueVoyageCard } from "@/components/grand-line/continue-voyage-card";
import { ChapterFinder } from "@/components/grand-line/chapter-finder";
import { SagaCard } from "@/components/grand-line/saga-card";
import { useGrandLineSagas, useGrandLineProgress } from "@/hooks/use-grand-line";
import { Loader2 } from "lucide-react";

export default function GrandLinePage() {
  const { sagas, loading: sagasLoading, error } = useGrandLineSagas();
  const { isWatched, watchedCount, lastVisited } = useGrandLineProgress();

  const totalArcs = useMemo(
    () => sagas.reduce((acc, s) => acc + s.arcCount, 0),
    [sagas],
  );
  const totalEpisodes = useMemo(
    () => sagas.reduce((acc, s) => acc + s.episodeCount, 0),
    [sagas],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-6 md:py-8">
      {/* Grand Line Hero */}
      <GrandLineHero
        sagasCount={sagas.length || 11}
        arcsCount={totalArcs || 38}
        episodesCount={totalEpisodes || 477}
        watchedCount={watchedCount}
      />

      {/* Continue Voyage Card */}
      <ContinueVoyageCard lastVisited={lastVisited} />

      {/* Chapter & Anime Episode Finder */}
      <ChapterFinder />

      {/* Sagas Header & Roster */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">The Grand Line Sagas</h2>
            <p className="text-xs text-zinc-400">
              Browse the 11 canonical sagas from the East Blue to the Final Saga.
            </p>
          </div>
        </div>

        {sagasLoading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-white/5 bg-zinc-950/40">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-amber-400" />
              <span className="text-xs text-zinc-400">Loading Grand Line Sagas...</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6 text-center text-sm text-red-300">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sagas.map((saga) => (
              <SagaCard key={saga.id} saga={saga} isWatched={isWatched} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

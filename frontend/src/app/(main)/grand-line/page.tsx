"use client";

import { useState, useMemo } from "react";
import { GrandLineHero } from "@/components/grand-line/grand-line-hero";
import { ContinueVoyageCard } from "@/components/grand-line/continue-voyage-card";
import { ChapterFinder } from "@/components/grand-line/chapter-finder";
import { SagaCard } from "@/components/grand-line/saga-card";
import { VerticalCatalogue } from "@/components/grand-line/vertical-catalogue";
import { useGrandLineSagas, useGrandLineProgress } from "@/hooks/use-grand-line";
import { Loader2, LayoutGrid, ListFilter } from "lucide-react";

export default function GrandLinePage() {
  const { sagas, loading: sagasLoading, error } = useGrandLineSagas();
  const { isWatched, watchedCount, lastVisited } = useGrandLineProgress();
  const [viewMode, setViewMode] = useState<"vertical" | "grid">("vertical");

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

      {/* Sagas Header & View Mode Switcher */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              The Grand Line Voyage
            </h2>
            <p className="text-xs text-zinc-400">
              Browse the complete verified One Pace catalogue from the East Blue to the Final Saga.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-2xl border border-white/10 bg-zinc-950/60 p-1">
            <button
              type="button"
              onClick={() => setViewMode("vertical")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "vertical"
                  ? "bg-amber-400 text-zinc-950 shadow-sm font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <ListFilter className="size-3.5" />
              <span>Vertical Stream</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "grid"
                  ? "bg-amber-400 text-zinc-950 shadow-sm font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              <span>Saga Cards</span>
            </button>
          </div>
        </div>

        {sagasLoading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-white/5 bg-zinc-950/40">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-amber-400" />
              <span className="text-xs text-zinc-400">Loading Grand Line Catalogue...</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6 text-center text-sm text-red-300">
            {error}
          </div>
        ) : viewMode === "vertical" ? (
          <VerticalCatalogue sagas={sagas} />
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

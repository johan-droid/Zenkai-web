"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Compass,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Tv,
  Clock,
  CheckCircle2,
  Circle,
  Search,
  RefreshCw,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import type { GrandLineSaga } from "@/lib/api/zenkai";
import {
  useGrandLineProgress,
  useGrandLineStatus,
  useGrandLineArc,
} from "@/hooks/use-grand-line";

interface VerticalCatalogueProps {
  sagas: GrandLineSaga[];
}

function ArcEpisodesList({
  arcId,
  arcTitle,
  filterMode,
  isWatched,
  toggleWatched,
  recordLastVisited,
}: {
  arcId: string;
  arcTitle: string;
  filterMode: "all" | "unwatched" | "watched";
  isWatched: (arcId: string, episodeNumber: string) => boolean;
  toggleWatched: (
    episode: { id: string; arcId: string; episodeNumber: string; title: string },
    arcTitle?: string,
  ) => Promise<void>;
  recordLastVisited: (
    episode: { id: string; arcId: string; episodeNumber: string; title: string },
    arcTitle?: string,
  ) => Promise<void>;
}) {
  const { arc, loading, error } = useGrandLineArc(arcId);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-4 animate-spin text-amber-400" />
          <span>Loading episodes for {arcTitle}...</span>
        </div>
      </div>
    );
  }

  if (error || !arc) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-center text-xs text-red-300">
        {error || "Unable to load episodes."}
      </div>
    );
  }

  const episodes = arc.episodes.filter((ep) => {
    const watched = isWatched(arcId, ep.episodeNumber);
    if (filterMode === "watched") return watched;
    if (filterMode === "unwatched") return !watched;
    return true;
  });

  if (episodes.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 text-center text-xs text-zinc-400">
        No episodes in this arc match the current &quot;{filterMode}&quot; filter.
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      {episodes.map((ep) => {
        const watched = isWatched(arcId, ep.episodeNumber);
        return (
          <div
            key={ep.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
              watched
                ? "border-emerald-500/20 bg-emerald-950/10"
                : "border-white/5 bg-zinc-950/60 hover:border-amber-500/20 hover:bg-zinc-900/60"
            }`}
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                  watched
                    ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "bg-white/10 text-zinc-300"
                }`}
              >
                {ep.episodeNumber}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/grand-line/${arcId}/${ep.episodeNumber}`}
                  onClick={() => void recordLastVisited(ep, arcTitle)}
                  className="font-display text-xs font-semibold text-white hover:text-amber-300 truncate block sm:text-sm"
                >
                  {ep.title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-400">
                  {ep.mangaChapters && <span>Ch. {ep.mangaChapters}</span>}
                  {ep.animeEpisodes && <span>Anime {ep.animeEpisodes}</span>}
                  <span>{ep.duration}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => void toggleWatched(ep, arcTitle)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  watched
                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
                title={watched ? "Mark as unwatched" : "Mark as watched"}
              >
                {watched ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>Watched</span>
                  </>
                ) : (
                  <>
                    <Circle className="size-3.5 text-zinc-500" />
                    <span>Mark</span>
                  </>
                )}
              </button>

              <a
                href={ep.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition shadow-sm"
                title="Watch on Official One Pace (opens official stream)"
              >
                <span>Watch</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VerticalCatalogue({ sagas }: VerticalCatalogueProps) {
  const { isWatched, toggleWatched, recordLastVisited, watchedCount } = useGrandLineProgress();
  const { status, syncing, triggerSync } = useGrandLineStatus();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "unwatched" | "watched">("all");
  const [expandedArcs, setExpandedArcs] = useState<Record<string, boolean>>(() => {
    // Expand first 2 arcs by default
    const initial: Record<string, boolean> = {};
    if (sagas[0]?.arcs) {
      for (let i = 0; i < Math.min(2, sagas[0].arcs.length); i++) {
        initial[sagas[0].arcs[i].id] = true;
      }
    }
    return initial;
  });

  const toggleArc = useCallback((arcId: string) => {
    setExpandedArcs((prev) => ({
      ...prev,
      [arcId]: !prev[arcId],
    }));
  }, []);

  const expandAll = useCallback(() => {
    const all: Record<string, boolean> = {};
    for (const saga of sagas) {
      for (const arc of saga.arcs) {
        all[arc.id] = true;
      }
    }
    setExpandedArcs(all);
  }, [sagas]);

  const collapseAll = useCallback(() => {
    setExpandedArcs({});
  }, []);

  // Filter & Search processing
  const normalizedQuery = searchQuery.toLowerCase().trim();

  const filteredSagas = useMemo(() => {
    return sagas
      .map((saga) => {
        const matchingArcs = saga.arcs.filter((arc) => {
          // If search query is present
          if (normalizedQuery) {
            const matchesTitle = arc.title.toLowerCase().includes(normalizedQuery);
            const matchesChapters = arc.mangaChapters.toLowerCase().includes(normalizedQuery);
            const matchesAnime = arc.animeEpisodes.toLowerCase().includes(normalizedQuery);
            const matchesSynopsis = arc.synopsis.toLowerCase().includes(normalizedQuery);
            if (!matchesTitle && !matchesChapters && !matchesAnime && !matchesSynopsis) {
              return false;
            }
          }
          return true;
        });

        return {
          ...saga,
          arcs: matchingArcs,
        };
      })
      .filter((saga) => saga.arcs.length > 0);
  }, [sagas, normalizedQuery]);

  return (
    <div className="space-y-6">
      {/* Sticky Saga Quick-Jump Navigation Bar */}
      <div className="sticky top-16 z-30 -mx-4 overflow-x-auto border-y border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-md md:mx-0 md:rounded-2xl md:border">
        <div className="flex items-center gap-2 min-w-max">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 mr-2">
            <Compass className="size-4" />
            <span>Sagas:</span>
          </span>
          {sagas.map((saga) => (
            <a
              key={saga.id}
              href={`#saga-${saga.id}`}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
            >
              {saga.name.replace(" Saga", "")}
            </a>
          ))}
        </div>
      </div>

      {/* Catalogue Filter & Search Bar */}
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-900/40 p-4 md:flex-row md:items-center md:justify-between md:p-6 backdrop-blur-md">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search arcs by title, manga chapters, anime episodes..."
            className="w-full rounded-2xl border border-white/10 bg-zinc-950/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Controls: Filter & Expand/Collapse */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Watched Count Counter */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-400 mr-2">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span>{watchedCount} Watched</span>
          </div>

          {/* Filter Pills */}
          <div className="flex rounded-xl border border-white/10 bg-zinc-950/60 p-1">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                filterMode === "all"
                  ? "bg-amber-400 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("unwatched")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                filterMode === "unwatched"
                  ? "bg-amber-400 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Unwatched
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("watched")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                filterMode === "watched"
                  ? "bg-amber-400 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Watched
            </button>
          </div>

          {/* Expand/Collapse All Buttons */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={expandAll}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {/* Sagas & Arcs Vertical Stream */}
      <div className="space-y-10">
        {filteredSagas.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-zinc-950/40 p-12 text-center">
            <p className="text-sm text-zinc-400">
              No arcs or episodes match your search query &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
        ) : (
          filteredSagas.map((saga) => (
            <section
              key={saga.id}
              id={`saga-${saga.id}`}
              className="scroll-mt-32 space-y-4 rounded-3xl border border-white/10 bg-zinc-900/30 p-5 md:p-8 backdrop-blur-md"
            >
              {/* Saga Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                    <span>Saga {saga.order.toString().padStart(2, "0")}</span>
                    <span>•</span>
                    <span>{saga.arcCount} Arcs</span>
                    <span>•</span>
                    <span>{saga.episodeCount} Episodes</span>
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-bold text-white md:text-3xl">
                    {saga.name}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">
                    Chronological Story Order
                  </span>
                </div>
              </div>

              {/* Arc Accordions */}
              <div className="space-y-3 pt-2">
                {saga.arcs.map((arc) => {
                  const isExpanded = expandedArcs[arc.id] ?? false;

                  return (
                    <div
                      key={arc.id}
                      className="overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60 transition-all hover:border-amber-500/30"
                    >
                      {/* Arc Header Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleArc(arc.id)}
                        className="flex w-full items-center justify-between p-4 text-left transition hover:bg-white/5 md:p-5"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-display text-base font-bold text-white hover:text-amber-300 md:text-lg">
                              {arc.title}
                            </span>
                            <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                              {arc.episodeCount} {arc.episodeCount === 1 ? "Ep" : "Eps"}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-sky-400" />
                              <span>Ch. {arc.mangaChapters}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Tv className="size-3.5 text-emerald-400" />
                              <span>Anime {arc.animeEpisodes}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="size-3.5 text-amber-400" />
                              <span>{arc.duration}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Link
                            href={`/grand-line/${arc.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
                          >
                            <span>Arc Voyage</span>
                            <ExternalLink className="size-3.5" />
                          </Link>

                          <div className="flex size-8 items-center justify-center rounded-xl bg-white/5 text-zinc-400">
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Arc Expanded Body */}
                      {isExpanded && (
                        <div className="border-t border-white/5 bg-zinc-900/30 p-4 md:p-6 space-y-4">
                          {/* Arc Synopsis */}
                          {arc.synopsis && (
                            <p className="text-xs leading-relaxed text-zinc-300 md:text-sm">
                              {arc.synopsis}
                            </p>
                          )}

                          {/* Full Interactive Episodes List */}
                          <ArcEpisodesList
                            arcId={arc.id}
                            arcTitle={arc.title}
                            filterMode={filterMode}
                            isWatched={isWatched}
                            toggleWatched={toggleWatched}
                            recordLastVisited={recordLastVisited}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Synchronization & Status Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Official One Pace Metadata Engine
            </div>
            <div className="text-[11px] text-zinc-400">
              {status
                ? `Synchronized with ${status.source} • Version ${status.catalogVersion ?? "2.0.0"} • ${status.episodesCount} Total Episodes`
                : "Continuous catalogue synchronization active"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void triggerSync()}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin text-amber-400" : ""}`} />
          <span>{syncing ? "Synchronizing..." : "Sync Catalogue"}</span>
        </button>
      </div>
    </div>
  );
}

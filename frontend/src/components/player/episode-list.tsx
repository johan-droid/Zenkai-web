"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import Link from "next/link";

import { watchHref } from "@/lib/media";
import type { EpisodeCard } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

const CHUNK_SIZE = 100;

export function EpisodeList({
  id,
  episodes,
  currentEpisode,
  watchedEpisodes,
}: {
  /** Routing id of the title, used to build watch links. */
  id: string;
  episodes: EpisodeCard[];
  currentEpisode: number;
  watchedEpisodes: Set<number>;
  maxEpisodes?: number;
}) {
  const sortedEpisodes = useMemo(() => {
    const map = new Map<number, EpisodeCard>();
    for (const ep of episodes) {
      if (typeof ep.episodeNumber === "number" && !Number.isNaN(ep.episodeNumber)) {
        if (!map.has(ep.episodeNumber)) {
          map.set(ep.episodeNumber, ep);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
  }, [episodes]);

  const totalCount = sortedEpisodes.length;
  const initialChunk = useMemo(() => {
    if (totalCount <= CHUNK_SIZE) return 0;
    const idx = sortedEpisodes.findIndex((e) => e.episodeNumber === currentEpisode);
    return idx >= 0 ? Math.floor(idx / CHUNK_SIZE) : 0;
  }, [currentEpisode, sortedEpisodes, totalCount]);

  const [selectedChunk, setSelectedChunk] = useState<number>(initialChunk);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSelectedChunk(initialChunk);
  }, [initialChunk]);

  const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return sortedEpisodes.filter(
        (ep) =>
          String(ep.episodeNumber).includes(q) ||
          ep.title?.toLowerCase().includes(q),
      );
    }
    if (totalCount > CHUNK_SIZE) {
      return sortedEpisodes.slice(selectedChunk * CHUNK_SIZE, (selectedChunk + 1) * CHUNK_SIZE);
    }
    return sortedEpisodes;
  }, [searchQuery, sortedEpisodes, selectedChunk, totalCount]);

  return (
    <div className="glass-panel flex max-h-[32rem] flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-tight">Episodes</h2>
        <span className="text-xs text-muted-foreground">{totalCount} total</span>
      </div>

      {totalChunks > 1 && !searchQuery && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {Array.from({ length: totalChunks }).map((_, idx) => {
            const start = idx * CHUNK_SIZE + 1;
            const end = Math.min((idx + 1) * CHUNK_SIZE, totalCount);
            const active = selectedChunk === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedChunk(idx)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "bg-[#c8102e] text-white"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white",
                )}
              >
                {start}–{end}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Jump to episode #..."
          className="w-full rounded-lg bg-zinc-950/80 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 ring-1 ring-white/10 focus:outline-none focus:ring-[#c8102e]"
        />
      </div>

      <div className="no-scrollbar -mr-2 flex flex-col gap-1 overflow-y-auto pr-2">
        {visible.map((episode) => {
          const active = episode.episodeNumber === currentEpisode;
          const watched = watchedEpisodes.has(episode.episodeNumber);
          const unreleased = episode.airingState === "upcoming";
          return (
            <Link
              key={episode.id}
              href={watchHref(id, episode.episodeNumber)}
              aria-current={active ? "page" : undefined}
              title={unreleased ? "Not yet aired" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active
                  ? "border border-[#c8102e]/60 bg-[#c8102e]/15 text-white font-medium"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                unreleased && !active && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums",
                  active ? "bg-[#c8102e] text-white" : "bg-white/5",
                )}
              >
                {episode.episodeNumber}
              </span>
              <span className="flex-1 truncate">Episode {episode.episodeNumber}</span>
              {unreleased ? (
                <span className="text-xs text-muted-foreground">Unreleased</span>
              ) : null}
              {watched ? <Check className="size-3.5 text-[#e52545]" /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { watchHref } from "@/lib/media";
import type { EpisodeCard } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

export function EpisodeList({
  id,
  episodes,
  currentEpisode,
  watchedEpisodes,
  maxEpisodes = 100,
}: {
  /** Routing id of the title, used to build watch links. */
  id: string;
  episodes: EpisodeCard[];
  currentEpisode: number;
  watchedEpisodes: Set<number>;
  maxEpisodes?: number;
}) {
  const visible = episodes.slice(0, maxEpisodes);

  return (
    <div className="glass-panel flex max-h-[32rem] flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-tight">Episodes</h2>
        <span className="text-xs text-muted-foreground">{episodes.length} total</span>
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
                  ? "glass text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                unreleased && !active && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums",
                  active ? "bg-brand-500/30 text-foreground" : "bg-white/5",
                )}
              >
                {episode.episodeNumber}
              </span>
              <span className="flex-1">Episode {episode.episodeNumber}</span>
              {unreleased ? (
                <span className="text-xs text-muted-foreground">Unreleased</span>
              ) : null}
              {watched ? <Check className="size-3.5 text-brand-400" /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

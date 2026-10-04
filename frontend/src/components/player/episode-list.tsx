"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { watchHref } from "@/lib/media";
import { cn } from "@/lib/utils";

export function EpisodeList({
  mediaId,
  totalEpisodes,
  currentEpisode,
  watchedEpisodes,
  maxEpisodes = 100,
}: {
  mediaId: string;
  totalEpisodes: number | null;
  currentEpisode: number;
  watchedEpisodes: Set<number>;
  maxEpisodes?: number;
}) {
  const count = Math.max(1, Math.min(totalEpisodes ?? currentEpisode, maxEpisodes));
  const episodes = Array.from({ length: count }, (_, index) => index + 1);

  return (
    <div className="glass-panel flex max-h-[32rem] flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-tight">Episodes</h2>
        <span className="text-xs text-muted-foreground">
          {totalEpisodes ? `${totalEpisodes} total` : "Ongoing"}
        </span>
      </div>

      <div className="no-scrollbar -mr-2 flex flex-col gap-1 overflow-y-auto pr-2">
        {episodes.map((episode) => {
          const active = episode === currentEpisode;
          const watched = watchedEpisodes.has(episode);
          return (
            <Link
              key={episode}
              href={watchHref(mediaId, episode)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active
                  ? "glass text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums",
                  active ? "bg-brand-500/30 text-foreground" : "bg-white/5",
                )}
              >
                {episode}
              </span>
              <span className="flex-1">Episode {episode}</span>
              {watched ? <Check className="size-3.5 text-brand-400" /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

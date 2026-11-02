"use client";

import Link from "next/link";
import { Play, ArrowRight, Sparkles, Bookmark } from "lucide-react";
import { ScheduleEntry } from "@/lib/api/zenkai";
import { mediaHref } from "@/lib/media";
import { cleanImageUrl } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";
import {
  formatCountdown,
  getRelativeTimeDescription,
  getUIAiringState,
  useScheduleCountdown,
} from "@/hooks/use-schedule";

interface NextUpPanelProps {
  entries: ScheduleEntry[];
  timeZone: string;
  watchlistAnilistIds?: Set<string>;
  maxItems?: number;
}

const STATE_LABELS: Record<string, { label: string; className: string }> = {
  aired: { label: "Expected to have aired", className: "text-muted-foreground" },
  "airing-soon": { label: "Airing soon", className: "text-signal font-semibold animate-pulse" },
  today: { label: "Today", className: "text-amber-400 font-medium" },
  tomorrow: { label: "Tomorrow", className: "text-blue-400 font-medium" },
  upcoming: { label: "Scheduled", className: "text-muted-foreground" },
};

export function NextUpPanel({
  entries,
  timeZone,
  watchlistAnilistIds,
  maxItems = 3,
}: NextUpPanelProps) {
  const now = useScheduleCountdown();

  // Pick nearest upcoming entries (or those that aired within the last 30 minutes pending release status)
  const sorted = [...entries]
    .filter((e) => {
      const airingTime = new Date(e.airingAt).getTime();
      return airingTime >= now.getTime() - 1800_000;
    })
    .sort((a, b) => {
      // Prioritize watchlist items if available
      const aWatch = watchlistAnilistIds?.has(a.anilistId) ? 1 : 0;
      const bWatch = watchlistAnilistIds?.has(b.anilistId) ? 1 : 0;
      if (aWatch !== bWatch) return bWatch - aWatch;

      return new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime();
    })
    .slice(0, maxItems);

  if (sorted.length === 0) {
    return null;
  }

  return (
    <section className="glass rounded-2xl p-4 sm:p-5 border border-line" aria-label="Next Up">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
          <Sparkles className="size-4 text-signal" aria-hidden="true" />
          Next Up
        </h2>
        <span className="text-xs text-muted-foreground">Nearest scheduled releases</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sorted.map((entry, index) => {
          const airingDate = new Date(entry.airingAt);
          const uiState = getUIAiringState(airingDate, now);
          const stateInfo = STATE_LABELS[uiState] ?? STATE_LABELS.upcoming;
          const secondsLeft = entry.secondsUntil ?? Math.floor((airingDate.getTime() - now.getTime()) / 1000);
          const countdown = formatCountdown(secondsLeft);
          const relative = getRelativeTimeDescription(airingDate, now, timeZone);
          const isWatchlisted = watchlistAnilistIds?.has(entry.anilistId);

          return (
            <Link
              key={entry.scheduleId}
              href={mediaHref({ kind: "anime" as const, id: entry.anilistId })}
              className={cn(
                "glass glass-hover flex items-center gap-3 rounded-xl p-3 transition-colors border border-line group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                index === 0 && "border-signal/40 bg-signal/5"
              )}
            >
              {/* Cover Thumbnail */}
              {entry.coverUrl && !entry.coverUrl.startsWith("file:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cleanImageUrl(entry.coverUrl) ?? entry.coverUrl}
                  alt=""
                  loading="lazy"
                  className="h-16 w-11 shrink-0 rounded-lg object-cover bg-surface-2 border border-line"
                />
              ) : (
                <div className="h-16 w-11 shrink-0 rounded-lg bg-surface-2 border border-line flex items-center justify-center">
                  <Play className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
              )}

              {/* Episode Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink-1 group-hover:text-signal transition-colors">
                    {entry.title}
                  </span>
                  {isWatchlisted && (
                    <Bookmark className="size-3 fill-signal text-signal shrink-0" aria-label="In watchlist" />
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className={cn("text-[11px]", stateInfo.className)}>
                    {stateInfo.label}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    Ep {entry.episodeNumber}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-muted-foreground truncate">{relative}</span>
                  {countdown && (
                    <span className="text-[11px] font-mono font-semibold tabular-nums text-signal shrink-0 pl-1">
                      {countdown}
                    </span>
                  )}
                </div>
              </div>

              <ArrowRight className="size-4 text-muted-foreground group-hover:text-signal group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

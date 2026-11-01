"use client";

import { Calendar, Clock, Tv, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulePulseProps {
  episodesToday: number;
  episodesThisWeek: number;
  distinctAnime: number;
  watchlistEpisodes?: number;
  timeZone: string;
}

export function SchedulePulse({
  episodesToday,
  episodesThisWeek,
  distinctAnime,
  watchlistEpisodes = 0,
  timeZone,
}: SchedulePulseProps) {
  const metrics = [
    {
      icon: Clock,
      value: episodesToday,
      label: "Airing Today",
      color: "text-signal",
      bg: "bg-signal/10",
      border: "border-signal/20",
    },
    {
      icon: Calendar,
      value: episodesThisWeek,
      label: "This Week",
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      border: "border-blue-400/20",
    },
    {
      icon: Tv,
      value: distinctAnime,
      label: "Series Active",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      border: "border-amber-400/20",
    },
    {
      icon: Bookmark,
      value: watchlistEpisodes,
      label: "From Your List",
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      border: "border-purple-400/20",
    },
  ];

  return (
    <div
      className="glass rounded-2xl p-4 border border-line"
      role="region"
      aria-label="Schedule metrics pulse"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "flex flex-col items-center sm:items-start p-3 rounded-xl border transition-colors",
              metric.bg,
              metric.border
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <metric.icon className={cn("size-4", metric.color)} aria-hidden="true" />
              <span className="text-xs text-muted-foreground font-medium">{metric.label}</span>
            </div>
            <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
              {metric.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-3">
        Release slots converted to <span className="font-mono text-foreground">{timeZone}</span>
      </p>
    </div>
  );
}

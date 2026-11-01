"use client";

import Link from "next/link";
import { Clock, Bookmark, Play } from "lucide-react";
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

interface ScheduleRowProps {
  entry: ScheduleEntry;
  timeZone: string;
  showWatchlistDot?: boolean;
  isWatchlisted?: boolean;
}

const STATE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  aired: { bg: "bg-white/5", text: "text-muted-foreground", label: "Aired" },
  "airing-soon": { bg: "bg-signal/20 border border-signal/40", text: "text-signal", label: "Airing soon" },
  today: { bg: "bg-amber-400/15 border border-amber-400/30", text: "text-amber-400", label: "Today" },
  tomorrow: { bg: "bg-blue-400/15 border border-blue-400/30", text: "text-blue-400", label: "Tomorrow" },
  upcoming: { bg: "bg-white/5", text: "text-muted-foreground", label: "Scheduled" },
};

export function ScheduleRow({ entry, timeZone, isWatchlisted }: ScheduleRowProps) {
  const now = useScheduleCountdown();
  const airingDate = new Date(entry.airingAt);
  const uiState = getUIAiringState(airingDate, now);
  const styles = STATE_STYLES[uiState] ?? STATE_STYLES.upcoming;
  const countdown = formatCountdown(entry.secondsUntil);
  const relative = getRelativeTimeDescription(airingDate, now, timeZone);
  const timeStr = airingDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return (
    <Link
      href={mediaHref({ kind: "anime" as const, id: entry.anilistId })}
      className={cn(
        "glass glass-hover flex items-center gap-3.5 rounded-xl p-3 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
        entry.airingState === "aired" && "opacity-65"
      )}
      aria-label={`${entry.title}, Episode ${entry.episodeNumber}, airs ${relative}`}
    >
      {/* Time marker */}
      <div className="w-16 shrink-0 text-sm font-mono font-semibold tabular-nums text-foreground group-hover:text-signal transition-colors text-right sm:text-left">
        {timeStr}
      </div>

      {/* Cover Artwork */}
      {entry.coverUrl && !entry.coverUrl.startsWith("file:") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cleanImageUrl(entry.coverUrl) ?? entry.coverUrl}
          alt=""
          loading="lazy"
          className="h-14 w-10 shrink-0 rounded-lg object-cover bg-surface-2 border border-line"
        />
      ) : (
        <div className="h-14 w-10 shrink-0 rounded-lg bg-surface-2 border border-line flex items-center justify-center">
          <Play className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink-1 group-hover:text-signal transition-colors">
            {entry.title}
          </span>
          {isWatchlisted && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-signal bg-signal/15 px-1.5 py-0.5 rounded-md shrink-0 border border-signal/25"
              title="In your watchlist"
            >
              <Bookmark className="size-2.5 fill-signal" aria-hidden="true" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", styles.bg, styles.text)}>
            {styles.label}
          </span>

          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" aria-hidden="true" />
            Ep {entry.episodeNumber}
            {entry.totalEpisodes && <span>/ {entry.totalEpisodes}</span>}
          </span>

          {countdown && (
            <span className="font-mono tabular-nums text-signal font-medium">
              {countdown}
            </span>
          )}

          {entry.source === "inferred" && (
            <span className="text-[10px] text-muted-foreground/75 italic" title="Cadence-projected slot">
              (est.)
            </span>
          )}
        </div>

        <span className="text-[11px] text-muted-foreground">{relative}</span>
      </div>
    </Link>
  );
}

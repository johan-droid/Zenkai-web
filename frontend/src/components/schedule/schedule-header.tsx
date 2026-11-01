"use client";

import { Clock, Globe, Calendar, Search, Bookmark, X } from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCountdown, useScheduleCountdown } from "@/hooks/use-schedule";
import type { ViewMode } from "./time-horizon-switcher";

interface ScheduleHeaderProps {
  timeZone: string;
  onTimeZoneChange: (tz: string) => void;
  onSearch: (query: string) => void;
  onViewChange: (view: ViewMode) => void;
  currentView: ViewMode;
  searchQuery: string;
  watchlistFilter: boolean;
  onWatchlistFilterChange: (enabled: boolean) => void;
  totalEpisodes: number;
  totalAnime: number;
  watchlistEpisodes: number;
  lastUpdated?: Date;
}

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Tokyo", label: "JST (Tokyo)" },
  { value: "America/New_York", label: "EST/EDT (New York)" },
  { value: "America/Los_Angeles", label: "PST/PDT (Los Angeles)" },
  { value: "Europe/London", label: "GMT/BST (London)" },
  { value: "Europe/Paris", label: "CET/CEST (Paris)" },
  { value: "Asia/Shanghai", label: "CST (Shanghai)" },
  { value: "Asia/Seoul", label: "KST (Seoul)" },
  { value: "Australia/Sydney", label: "AEST/AEDT (Sydney)" },
];

const VIEW_DESCRIPTIONS: Record<ViewMode, string> = {
  today: "Confirmed episodes scheduled to air today in your local time.",
  week: "Everything airing this week, organized by broadcast day.",
  month: "Monthly release density calendar and daily broadcast inspector.",
  season: "Complete seasonal anime lineup and confirmed upcoming airings.",
};

export function ScheduleHeader({
  timeZone,
  onTimeZoneChange,
  onSearch,
  onViewChange,
  currentView,
  searchQuery,
  watchlistFilter,
  onWatchlistFilterChange,
  totalEpisodes,
  totalAnime,
  watchlistEpisodes,
  lastUpdated,
}: ScheduleHeaderProps) {
  const now = useScheduleCountdown();
  const [tzOpen, setTzOpen] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);

  const currentTz = useMemo(
    () => TIMEZONES.find((t) => t.value === timeZone) ?? { value: timeZone, label: timeZone },
    [timeZone]
  );

  // Close timezone dropdown on outside click or escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setTzOpen(false);
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
      setTzOpen(false);
    }
  }, []);

  useEffect(() => {
    if (tzOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [tzOpen, handleKeyDown, handleClickOutside]);

  const clockString = useMemo(() => {
    return now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone,
    });
  }, [now, timeZone]);

  return (
    <header className="flex flex-col gap-4 border-b border-line pb-4" aria-label="Schedule controls">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Title & Context */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Schedule
            </h1>
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded-full bg-signal/15 text-signal font-semibold border border-signal/25">
              Airwave
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {VIEW_DESCRIPTIONS[currentView]}
          </p>
        </div>

        {/* Command Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timezone Dropdown */}
          <div className="relative" ref={tzRef}>
            <Button
              variant="outline"
              size="sm"
              className="glass gap-2 h-9 border border-line"
              onClick={() => setTzOpen(!tzOpen)}
              aria-expanded={tzOpen}
              aria-haspopup="listbox"
              aria-label={`Timezone selector: currently ${currentTz.label}`}
            >
              <Globe className="size-4 text-signal" aria-hidden="true" />
              <span className="text-xs font-semibold">{currentTz.label}</span>
            </Button>

            {tzOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 glass rounded-xl border border-line-strong shadow-2xl overflow-hidden min-w-[220px] max-h-72 overflow-y-auto"
                role="listbox"
                aria-label="Available timezones"
              >
                {TIMEZONES.map((tz) => (
                  <button
                    key={tz.value}
                    onClick={() => {
                      onTimeZoneChange(tz.value);
                      setTzOpen(false);
                    }}
                    className={cn(
                      "w-full px-3.5 py-2.5 text-left text-xs font-medium transition-colors flex items-center justify-between",
                      timeZone === tz.value
                        ? "bg-signal/20 text-signal font-bold"
                        : "text-foreground hover:bg-surface-2"
                    )}
                    role="option"
                    aria-selected={timeZone === tz.value}
                  >
                    <span>{tz.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{tz.value}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Today Button */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "glass gap-1.5 h-9 border border-line",
              currentView === "today" && "bg-surface-2 border-line-strong text-signal"
            )}
            onClick={() => onViewChange("today")}
            aria-pressed={currentView === "today"}
          >
            <Calendar className="size-3.5 text-signal" aria-hidden="true" />
            <span className="text-xs font-semibold">Today</span>
          </Button>

          {/* Search anime filter */}
          <div className="relative flex-1 sm:w-60 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Filter anime..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-8 pr-8 h-9 text-xs bg-surface-1 border border-line rounded-xl focus:ring-1 focus:ring-signal"
              aria-label="Filter schedule by anime title"
            />
            {searchQuery && (
              <button
                onClick={() => onSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                aria-label="Clear filter"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* My Anime Watchlist Filter */}
          <Button
            variant={watchlistFilter ? "default" : "outline"}
            size="sm"
            className={cn(
              "glass gap-1.5 h-9 border border-line transition-all text-xs font-semibold",
              watchlistFilter
                ? "bg-signal text-signal-ink hover:bg-signal-hover border-signal"
                : "text-foreground hover:text-signal"
            )}
            onClick={() => onWatchlistFilterChange(!watchlistFilter)}
            aria-pressed={watchlistFilter}
            aria-label={`Toggle My Anime filter. ${watchlistEpisodes} saved episodes in view.`}
          >
            <Bookmark className={cn("size-3.5", watchlistFilter && "fill-signal-ink")} aria-hidden="true" />
            <span>My Anime</span>
            {watchlistEpisodes > 0 && (
              <span
                className={cn(
                  "text-[10px] rounded-full px-1.5 py-0.2 font-mono tabular-nums",
                  watchlistFilter ? "bg-black/25 text-white" : "bg-signal/20 text-signal"
                )}
              >
                {watchlistEpisodes}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        {/* Live Clock */}
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-signal animate-pulse" aria-hidden="true" />
          <span className="font-mono tabular-nums text-foreground font-semibold">{clockString}</span>
          <span className="text-[11px] text-muted-foreground font-mono">({timeZone})</span>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center gap-3 text-[11px]">
          <span>
            <strong className="text-foreground">{totalEpisodes}</strong> episodes
          </span>
          <span>•</span>
          <span>
            <strong className="text-foreground">{totalAnime}</strong> anime
          </span>
          {watchlistFilter && (
            <>
              <span>•</span>
              <span className="text-signal font-medium">Filtered to your watchlist</span>
            </>
          )}
          {lastUpdated && (
            <>
              <span>•</span>
              <span>Updated {formatCountdown(Math.floor((now.getTime() - lastUpdated.getTime()) / 1000)) || "just now"} ago</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

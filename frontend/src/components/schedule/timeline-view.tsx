"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, AlertCircle, RefreshCw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";

import { db, type LibraryRecord } from "@/lib/db/dexie";
import {
  ScheduleEntry,
  fetchScheduleToday,
  fetchScheduleWeek,
  fetchScheduleMonth,
  fetchScheduleSeason,
  classifyScheduleError,
} from "@/lib/api/zenkai";
import { localDateKey, weekWindow, monthWindow } from "@/hooks/use-schedule";

import { ScheduleHeader } from "./schedule-header";
import { TimeHorizonSwitcher, type ViewMode } from "./time-horizon-switcher";
import { DateNavigator } from "./date-navigator";
import { NextUpPanel } from "./next-up-panel";
import { SchedulePulse } from "./schedule-pulse";
import { ScheduleRow } from "./schedule-row";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TimelineViewProps {
  initialTimeZone?: string;
}

export function TimelineView({ initialTimeZone = "UTC" }: TimelineViewProps) {
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState(false);
  const [selectedMonthDateKey, setSelectedMonthDateKey] = useState<string | null>(null);

  // Detect and apply browser timezone
  const browserTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    if (initialTimeZone === "UTC" && browserTimeZone && browserTimeZone !== "UTC") {
      setTimeZone(browserTimeZone);
    }
  }, [browserTimeZone, initialTimeZone]);

  // Read personal watchlist from Dexie
  const library = useLiveQuery(() => db.library.toArray());
  const watchlistAnilistIds = useMemo(() => {
    if (!library) return new Set<string>();
    return new Set(
      library
        .filter((item: LibraryRecord) => item.kind === "anime")
        .map((item: LibraryRecord) => item.mediaId)
    );
  }, [library]);

  const dateIso = currentDate.toISOString().slice(0, 10);
  const monthKey = dateIso.slice(0, 7);
  const seasonKey = `${currentDate.getFullYear()}-${Math.floor(currentDate.getMonth() / 3)}`;

  // Reactive queries keyed by mode, timezone, and anchor date
  const todayQuery = useQuery({
    queryKey: ["schedule", "today", timeZone, dateIso],
    queryFn: () => fetchScheduleToday(timeZone, currentDate),
    staleTime: 5 * 60_000,
    enabled: viewMode === "today",
  });

  const weekQuery = useQuery({
    queryKey: ["schedule", "week", timeZone, dateIso],
    queryFn: () => fetchScheduleWeek(timeZone, currentDate),
    staleTime: 10 * 60_000,
    enabled: viewMode === "week",
  });

  const monthQuery = useQuery({
    queryKey: ["schedule", "month", timeZone, monthKey],
    queryFn: () => fetchScheduleMonth(timeZone, currentDate),
    staleTime: 15 * 60_000,
    enabled: viewMode === "month",
  });

  const seasonQuery = useQuery({
    queryKey: ["schedule", "season", timeZone, seasonKey],
    queryFn: () => fetchScheduleSeason(timeZone, currentDate),
    staleTime: 30 * 60_000,
    enabled: viewMode === "season",
  });

  const activeQuery =
    viewMode === "today"
      ? todayQuery
      : viewMode === "week"
      ? weekQuery
      : viewMode === "month"
      ? monthQuery
      : seasonQuery;

  const data = activeQuery.data;
  const isLoading = activeQuery.isLoading;
  const error = activeQuery.error;
  const refetch = activeQuery.refetch;

  // Flatten returned entries
  const allEntries = useMemo(() => {
    if (!data) return [];
    const d = data as Record<string, any>;
    if (Array.isArray(d.days)) {
      return d.days.flatMap((day: any) => day.entries as ScheduleEntry[]);
    }
    if (Array.isArray(d.items)) {
      return d.items as ScheduleEntry[];
    }
    return [];
  }, [data]);

  // Filter entries by search query and personal watchlist
  const filteredEntries = useMemo(() => {
    let entries: ScheduleEntry[] = allEntries;

    if (watchlistFilter) {
      entries = entries.filter((e) => watchlistAnilistIds.has(e.anilistId));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      entries = entries.filter((e) => e.title.toLowerCase().includes(q));
    }

    return entries;
  }, [allEntries, watchlistFilter, watchlistAnilistIds, searchQuery]);

  // Compute metrics in the user's timezone
  const metrics = useMemo(() => {
    const todayKey = localDateKey(new Date(), timeZone);
    const { from: weekFrom, to: weekTo } = weekWindow(new Date(), timeZone);

    let episodesToday = 0;
    let episodesThisWeek = 0;
    const animeSet = new Set<string>();

    allEntries.forEach((e: ScheduleEntry) => {
      const dateKey = localDateKey(new Date(e.airingAt), timeZone);
      if (dateKey === todayKey) episodesToday++;
      const airingTime = new Date(e.airingAt).getTime();
      if (airingTime >= weekFrom.getTime() && airingTime <= weekTo.getTime()) {
        episodesThisWeek++;
      }
      animeSet.add(e.anilistId);
    });

    const watchlistCount = allEntries.filter((e) => watchlistAnilistIds.has(e.anilistId)).length;

    return {
      episodesToday,
      episodesThisWeek,
      distinctAnime: animeSet.size,
      watchlistEpisodes: watchlistCount,
    };
  }, [allEntries, timeZone, watchlistAnilistIds]);

  // Group filtered entries by date
  const groupedDays = useMemo(() => {
    const groups = new Map<string, { date: string; dayOfWeek: string; entries: ScheduleEntry[] }>();

    filteredEntries.forEach((entry: ScheduleEntry) => {
      const date = localDateKey(new Date(entry.airingAt), timeZone);
      const dayDate = new Date(`${date}T12:00:00Z`);
      const dayOfWeek = dayDate.toLocaleDateString(undefined, { weekday: "long" });

      const existing = groups.get(date);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(date, { date, dayOfWeek, entries: [entry] });
      }
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [filteredEntries, timeZone]);

  // Month density map for Month View
  const monthDensity = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    filteredEntries.forEach((e) => {
      const k = localDateKey(new Date(e.airingAt), timeZone);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    });
    return map;
  }, [filteredEntries, timeZone]);

  // Month days generator (all days in current month window)
  const monthCalendarDays = useMemo(() => {
    if (viewMode !== "month") return [];
    const { from } = monthWindow(currentDate, timeZone);
    const year = from.getFullYear();
    const month = from.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: { dateKey: string; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Weekday of 1st day (0 = Sun, 1 = Mon ... 6 = Sat). We use Monday-first (0 = Mon .. 6 = Sun)
    const firstWeekday = (firstDay.getDay() + 6) % 7;

    // Pad previous month days for grid alignment
    for (let i = 0; i < firstWeekday; i++) {
      const prevDate = new Date(year, month, -firstWeekday + i + 1);
      days.push({
        dateKey: localDateKey(prevDate, timeZone),
        dayNumber: prevDate.getDate(),
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      days.push({
        dateKey: localDateKey(d, timeZone),
        dayNumber: day,
        isCurrentMonth: true,
      });
    }

    return days;
  }, [viewMode, currentDate, timeZone]);

  // Set default selected month day when entering month view
  useEffect(() => {
    if (viewMode === "month") {
      const currentMonthKey = localDateKey(currentDate, timeZone);
      if (!selectedMonthDateKey || !selectedMonthDateKey.startsWith(monthKey)) {
        // Select today if in this month, otherwise the first day that has events
        if (currentMonthKey.startsWith(monthKey)) {
          setSelectedMonthDateKey(currentMonthKey);
        } else {
          const firstWithEvents = Array.from(monthDensity.keys())[0];
          setSelectedMonthDateKey(firstWithEvents ?? `${monthKey}-01`);
        }
      }
    }
  }, [viewMode, monthKey, currentDate, timeZone, monthDensity, selectedMonthDateKey]);

  const todayDateKey = useMemo(() => localDateKey(new Date(), timeZone), [timeZone]);

  // Reset to today
  const handleTodayClick = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedMonthDateKey(localDateKey(today, timeZone));
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Header Command Center */}
      <ScheduleHeader
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
        onSearch={setSearchQuery}
        onViewChange={(view) => {
          setViewMode(view);
          if (view === "today") handleTodayClick();
        }}
        currentView={viewMode}
        searchQuery={searchQuery}
        watchlistFilter={watchlistFilter}
        onWatchlistFilterChange={setWatchlistFilter}
        totalEpisodes={filteredEntries.length}
        totalAnime={metrics.distinctAnime}
        watchlistEpisodes={metrics.watchlistEpisodes}
      />

      {/* Time Horizon Switcher */}
      <TimeHorizonSwitcher currentView={viewMode} onViewChange={setViewMode} />

      {/* Date Timeline Navigator */}
      <DateNavigator
        currentDate={currentDate}
        viewMode={viewMode}
        timeZone={timeZone}
        onDateChange={setCurrentDate}
        onToday={handleTodayClick}
      />

      {/* Schedule Pulse Metric Counter */}
      <SchedulePulse
        episodesToday={metrics.episodesToday}
        episodesThisWeek={metrics.episodesThisWeek}
        distinctAnime={metrics.distinctAnime}
        watchlistEpisodes={metrics.watchlistEpisodes}
        timeZone={timeZone}
      />

      {/* Nearest Upcoming Episodes Highlight */}
      <NextUpPanel
        entries={allEntries}
        timeZone={timeZone}
        watchlistAnilistIds={watchlistAnilistIds}
        maxItems={3}
      />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading schedule entries">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-surface-2" />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="glass rounded-2xl p-8 text-center border border-line flex flex-col items-center gap-3">
          <AlertCircle className="size-10 text-danger" aria-hidden="true" />
          <h2 className="text-lg font-bold">Schedule Service Unavailable</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {classifyScheduleError(error) === "invalid_response"
              ? "The schedule returned data this page could not understand."
              : "Unable to reach the Zenkai schedule service. Check your connection or try again."}
          </p>
          <Button
            variant="outline"
            className="glass gap-2 mt-2"
            onClick={() => refetch()}
          >
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Populated Content */}
      {!isLoading && !error && (
        <>
          {filteredEntries.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={searchQuery ? `No matches for "${searchQuery}"` : "Nothing airing in this period"}
              description={
                searchQuery
                  ? "Try a different anime title or clear your active filters."
                  : watchlistFilter
                  ? "None of the anime in your library have confirmed airings in this timeframe."
                  : "No episodes are scheduled to air during this time window. Check back closer to the broadcast date."
              }
            />
          ) : viewMode === "month" ? (
            /* Month Horizon: Density Calendar Grid + Day Inspector */
            <div className="flex flex-col gap-6" id="month-horizon-panel">
              <div className="glass rounded-2xl p-4 sm:p-5 border border-line">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-ink-2">
                    Release Density Calendar
                  </h2>
                  <span className="text-xs text-muted-foreground">Select a day to inspect airings</span>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-xs font-semibold text-muted-foreground">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>

                {/* Calendar Cells */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {monthCalendarDays.map((cell) => {
                    const dayEntries = monthDensity.get(cell.dateKey) ?? [];
                    const count = dayEntries.length;
                    const isSelected = selectedMonthDateKey === cell.dateKey;
                    const isToday = cell.dateKey === todayDateKey;

                    return (
                      <button
                        key={cell.dateKey}
                        onClick={() => setSelectedMonthDateKey(cell.dateKey)}
                        disabled={!cell.isCurrentMonth}
                        className={cn(
                          "flex flex-col items-center justify-between p-1.5 sm:p-2.5 rounded-xl min-h-[56px] sm:min-h-[70px] border transition-all text-left relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
                          !cell.isCurrentMonth && "opacity-25 pointer-events-none border-transparent",
                          cell.isCurrentMonth && "glass hover:bg-surface-2 border-line",
                          isToday && "border-signal/50",
                          isSelected && "bg-surface-2 border-signal shadow-md ring-1 ring-signal"
                        )}
                        aria-label={`${cell.dateKey}, ${count} episodes`}
                        aria-pressed={isSelected}
                      >
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            isToday ? "text-signal font-bold" : "text-ink-1"
                          )}
                        >
                          {cell.dayNumber}
                        </span>

                        {count > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className={cn(
                                "text-[10px] sm:text-xs font-mono font-bold px-1.5 py-0.2 rounded-full",
                                count >= 5
                                  ? "bg-signal text-signal-ink"
                                  : "bg-surface-3 text-ink-1 border border-line"
                              )}
                            >
                              {count}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day Inspector for Month View */}
              {selectedMonthDateKey && (
                <section className="flex flex-col gap-3" aria-label="Selected day schedule">
                  <div className="flex items-baseline justify-between border-b border-line pb-2">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-base font-bold text-foreground">
                        {selectedMonthDateKey === todayDateKey ? "Today" : selectedMonthDateKey}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {new Date(`${selectedMonthDateKey}T12:00:00Z`).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {(monthDensity.get(selectedMonthDateKey) ?? []).length} scheduled
                    </span>
                  </div>

                  {(monthDensity.get(selectedMonthDateKey) ?? []).length === 0 ? (
                    <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground border border-line">
                      No anime episodes scheduled for this date.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(monthDensity.get(selectedMonthDateKey) ?? [])
                        .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime())
                        .map((entry) => (
                          <ScheduleRow
                            key={entry.scheduleId}
                            entry={entry}
                            timeZone={timeZone}
                            isWatchlisted={watchlistAnilistIds.has(entry.anilistId)}
                          />
                        ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          ) : (
            /* Today, Week, and Season Horizons: Chronological Grouped Timeline */
            <div className="flex flex-col gap-6" id={`${viewMode}-horizon-panel`}>
              {groupedDays.map((day) => {
                const isToday = day.date === todayDateKey;

                return (
                  <section key={day.date} className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between border-b border-line pb-1.5">
                      <div className="flex items-baseline gap-3">
                        <h2 className={cn("text-base font-bold tracking-tight", isToday ? "text-signal" : "text-foreground")}>
                          {isToday ? "Today" : day.dayOfWeek}
                        </h2>
                        <span className="text-xs text-muted-foreground">
                          {new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {day.entries.length} {day.entries.length === 1 ? "release" : "releases"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {day.entries
                        .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime())
                        .map((entry) => (
                          <ScheduleRow
                            key={entry.scheduleId}
                            entry={entry}
                            timeZone={timeZone}
                            isWatchlisted={watchlistAnilistIds.has(entry.anilistId)}
                          />
                        ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

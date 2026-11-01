"use client";

import { ChevronLeft, ChevronRight, Calendar, CalendarDays, X } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { startOfDay, startOfNextDay, weekWindow, monthWindow, seasonWindow } from "@/hooks/use-schedule";
import type { ViewMode } from "./time-horizon-switcher";

interface DateNavigatorProps {
  currentDate: Date;
  viewMode: ViewMode;
  timeZone: string;
  onDateChange: (date: Date) => void;
  onToday: () => void;
}

export function DateNavigator({
  currentDate,
  viewMode,
  timeZone,
  onDateChange,
  onToday,
}: DateNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState(() => currentDate.toISOString().split("T")[0]);

  // Sync jumpDate with currentDate
  useEffect(() => {
    setJumpDate(currentDate.toISOString().split("T")[0]);
  }, [currentDate]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && pickerOpen) {
        setPickerOpen(false);
      }
    },
    [pickerOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { from, to, label } = useMemo(() => {
    switch (viewMode) {
      case "today": {
        const dayStart = startOfDay(currentDate, timeZone);
        const dayEnd = startOfNextDay(currentDate, timeZone);
        const options: Intl.DateTimeFormatOptions = {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone,
        };
        return {
          from: dayStart,
          to: dayEnd,
          label: dayStart.toLocaleDateString(undefined, options),
        };
      }
      case "week": {
        const { from: wFrom, to: wTo } = weekWindow(currentDate, timeZone);
        const lastDayOfWeek = new Date(wTo.getTime() - 86400000);
        const fromStr = wFrom.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone,
        });
        const toStr = lastDayOfWeek.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone,
        });
        return {
          from: wFrom,
          to: wTo,
          label: `${fromStr} – ${toStr}`,
        };
      }
      case "month": {
        const { from: mFrom, to: mTo } = monthWindow(currentDate, timeZone);
        const mLabel = mFrom.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
          timeZone,
        });
        return {
          from: mFrom,
          to: mTo,
          label: mLabel,
        };
      }
      case "season": {
        const { from: sFrom, to: sTo, season, year } = seasonWindow(currentDate, timeZone);
        const sFromStr = sFrom.toLocaleDateString(undefined, { month: "short", timeZone });
        const lastDayOfSeason = new Date(sTo.getTime() - 86400000);
        const sToStr = lastDayOfSeason.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
          timeZone,
        });
        return {
          from: sFrom,
          to: sTo,
          label: `${season} ${year} (${sFromStr} – ${sToStr})`,
        };
      }
    }
  }, [currentDate, viewMode, timeZone]);

  const handlePrev = () => {
    const d = new Date(currentDate);
    switch (viewMode) {
      case "today":
        d.setDate(d.getDate() - 1);
        break;
      case "week":
        d.setDate(d.getDate() - 7);
        break;
      case "month":
        d.setMonth(d.getMonth() - 1);
        break;
      case "season":
        d.setMonth(d.getMonth() - 3);
        break;
    }
    onDateChange(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    switch (viewMode) {
      case "today":
        d.setDate(d.getDate() + 1);
        break;
      case "week":
        d.setDate(d.getDate() + 7);
        break;
      case "month":
        d.setMonth(d.getMonth() + 1);
        break;
      case "season":
        d.setMonth(d.getMonth() + 3);
        break;
    }
    onDateChange(d);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jumpDate) {
      onDateChange(new Date(`${jumpDate}T12:00:00Z`));
      setPickerOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3" aria-label="Date timeline navigation">
      {/* Previous Period */}
      <Button
        variant="outline"
        size="icon"
        className="glass h-9 w-9 shrink-0 border border-line"
        onClick={handlePrev}
        aria-label={`Previous ${viewMode}`}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>

      {/* Date Range Display & Jump Trigger */}
      <Button
        variant="outline"
        size="sm"
        className="glass gap-2 flex-1 justify-center min-w-0 h-9 font-semibold border border-line"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-label={`Current period: ${label}. Click to jump to date.`}
      >
        <CalendarDays className="size-4 shrink-0 text-signal" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </Button>

      {/* Next Period */}
      <Button
        variant="outline"
        size="icon"
        className="glass h-9 w-9 shrink-0 border border-line"
        onClick={handleNext}
        aria-label={`Next ${viewMode}`}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>

      {/* Today Shortcut Button */}
      <Button
        variant="outline"
        size="sm"
        className="glass gap-1.5 h-9 hidden sm:flex shrink-0 font-medium border border-line"
        onClick={onToday}
      >
        <Calendar className="size-3.5 text-signal" aria-hidden="true" />
        Today
      </Button>

      {/* Jump To Date Dialog */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jump-date-title"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="glass rounded-2xl p-6 w-full max-w-sm border border-line shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="jump-date-title" className="font-bold text-base text-foreground">
                Jump to Date
              </h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleJumpSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="jump-date-input" className="block text-xs text-muted-foreground mb-1.5">
                  Select Calendar Date ({timeZone})
                </label>
                <input
                  id="jump-date-input"
                  type="date"
                  value={jumpDate}
                  onChange={(e) => setJumpDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-signal"
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 glass"
                  onClick={() => setPickerOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-signal text-signal-ink hover:bg-signal-hover">
                  Go
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

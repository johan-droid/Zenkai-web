"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Shared countdown timer for schedule views.
 * Uses a single timer to update visible countdowns,
 * pausing when the document is hidden/inactive to save CPU.
 */
export function useScheduleCountdown() {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function startTimer() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setNow(new Date());
      intervalRef.current = setInterval(() => setNow(new Date()), 1000);
    }

    function stopTimer() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopTimer();
      } else {
        startTimer();
      }
    }

    if (!document.hidden) {
      startTimer();
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return now;
}

/**
 * Format seconds into a human-readable countdown string.
 * Returns null if the event has already aired (seconds < 0).
 */
export function formatCountdown(seconds: number): string | null {
  if (seconds < 0) return null;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) {
    return days === 1 ? "Tomorrow" : `In ${days} days`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Get a relative time description for display alongside absolute time.
 * e.g. "Today at 20:30", "Tomorrow at 18:00", "In 3 days"
 */
export function getRelativeTimeDescription(
  airingAt: Date | string,
  now: Date,
  timeZone: string
): string {
  const airing = new Date(airingAt);
  const diffMs = airing.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  const timeStr = airing.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  if (diffDays < 0) return `Aired at ${timeStr}`;
  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  if (diffDays <= 6) return `In ${diffDays} days at ${timeStr}`;

  const dateStr = airing.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone,
  });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Airing state with more granularity for UI.
 */
export type UIAiringState = "aired" | "airing-soon" | "upcoming" | "today" | "tomorrow";

export function getUIAiringState(airingAt: Date | string, now: Date): UIAiringState {
  const airing = new Date(airingAt);
  const diffMs = airing.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMs <= 0) return "aired";
  if (diffMinutes <= 30) return "airing-soon";
  if (diffMinutes <= 60 * 24) return "today";
  if (diffMinutes <= 60 * 48) return "tomorrow";
  return "upcoming";
}

/* ------------------------------------------------------------------ */
/* Timezone-aware calendar boundaries (mirrored from backend)         */
/* ------------------------------------------------------------------ */

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return asUtc - at.getTime();
}

function zonedWallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - zoneOffsetMs(firstPass, timeZone));
}

function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function localDateKey(at: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function startOfDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day, 0, 0, 0);
}

export function startOfNextDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day + 1, 0, 0, 0);
}

export function weekWindow(
  date: Date,
  timeZone: string
): { from: Date; to: Date } {
  const { year, month, day } = zonedParts(date, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return {
    from: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday, 0, 0, 0),
    to: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday + 7, 0, 0, 0),
  };
}

export function monthWindow(
  date: Date,
  timeZone: string
): { from: Date; to: Date } {
  const { year, month } = zonedParts(date, timeZone);

  return {
    from: zonedWallClockToUtc(timeZone, year, month, 1, 0, 0, 0),
    to: zonedWallClockToUtc(timeZone, year, month + 1, 1, 0, 0, 0),
  };
}

export function seasonWindow(
  date: Date,
  timeZone: string
): { from: Date; to: Date; season: string; year: number } {
  const { year, month } = zonedParts(date, timeZone);

  if (month >= 3 && month <= 5) {
    return {
      from: zonedWallClockToUtc(timeZone, year, 3, 1, 0, 0, 0),
      to: zonedWallClockToUtc(timeZone, year, 6, 1, 0, 0, 0),
      season: "Spring",
      year,
    };
  }

  if (month >= 6 && month <= 8) {
    return {
      from: zonedWallClockToUtc(timeZone, year, 6, 1, 0, 0, 0),
      to: zonedWallClockToUtc(timeZone, year, 9, 1, 0, 0, 0),
      season: "Summer",
      year,
    };
  }

  if (month >= 9 && month <= 11) {
    return {
      from: zonedWallClockToUtc(timeZone, year, 9, 1, 0, 0, 0),
      to: zonedWallClockToUtc(timeZone, year, 12, 1, 0, 0, 0),
      season: "Fall",
      year,
    };
  }

  // Winter: spans December of previous year through February of season year
  const seasonYear = month === 12 ? year + 1 : year;
  const startYear = month === 12 ? year : year - 1;

  return {
    from: zonedWallClockToUtc(timeZone, startYear, 12, 1, 0, 0, 0),
    to: zonedWallClockToUtc(timeZone, seasonYear, 3, 1, 0, 0, 0),
    season: "Winter",
    year: seasonYear,
  };
}
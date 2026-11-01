"use client";

import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { tokens } from "@/config/tokens";

export interface EpisodeAiring {
  animeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  airDateTime: Date;
  airingState: AiringState;
  daysUntilAiring: number | null;
  timezoneOffset: string;
}

export type AiringState = "airing" | "delayed" | "completed" | "unknown";

export interface UseAiringScheduleResult {
  schedule: EpisodeAiring | null;
  isLoading: boolean;
  error: string | null;
  userTimezone: string;
  setUserTimezone: (tz: string) => void;
}

/** Hook for accessing airing schedule data with timezone preferences. */
export function useAiringSchedule(): UseAiringScheduleResult {
  const [userTimezone, setUserTimezone] = useState("+09:00"); // Default JST
  const { data: userSettings } = useAtomValue(() => /* atom from settings store */ {});

  // Parse timezone from user preferences
  const parseTimezone = (tz: string): string => {
    // Validate timezone offset format
    const match = tz.match(/^[+-]\d{2}:\d{2}$/);
    return match ? tz : "+09:00";
  };

  const schedule = useQuery({
    queryKey: ["airing-schedule", userTimezone],
    queryFn: async () => {
      // Try to get schedule for a default anime or return null
      // In full implementation, this would query the backend API
      return null;
    },
    staleTime: 60_000,
  });

  return {
    schedule: schedule.data as EpisodeAiring | null,
    isLoading: schedule.isLoading,
    error: schedule.error as string | null,
    userTimezone: parseTimezone(userTimezone),
    setUserTimezone: (tz: string) => setUserTimezone(parseTimezone(tz)),
  };
}

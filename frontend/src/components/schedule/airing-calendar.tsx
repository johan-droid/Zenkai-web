"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAiringSchedule } from "@/hooks/use-airing";

interface AiringCalendarProps {
  animeId?: string;
  userTimezone?: string;
}

export function AiringCalendar({ animeId, userTimezone }: AiringCalendarProps) {
  const [schedule, setSchedule] = useState<EpisodeAiring | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: userPrefs } = useAiringSchedule();
  
  const timezone = userTimezone || "+09:00";

  useEffect(() => {
    if (animeId) {
      const loadSchedule = async () => {
        setIsLoading(true);
        try {
          const result = await fetch(`/api/v1/anime/${animeId}/airing-schedule`);
          if (!result.ok) throw new Error("Failed to fetch schedule");
          const data = await result.json() as EpisodeAiring;
          setSchedule(data);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setSchedule(null);
        } finally {
          setIsLoading(false);
        }
      };
      loadSchedule();
    }
  }, [animeId]);

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <span className="text-zinc-400 animate-spin size-8 block mx-auto" />
        <p className="mt-2 text-zinc-500">Loading airing schedule...</p>
      </div>
    );
  );

  if (error) {
    return (
      <div className="py-12 text-center">
        <AlertCircle className="size-6 text-red-400 mx-auto mb-2" />
        <p className="text-zinc-400">Failed to load schedule</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="py-12 text-center text-zinc-500">
        <Calendar className="size-6 mx-auto mb-2" />
        <p>No airing schedule available</p>
      </div>
    );
  }

  // Calculate days until airing
  const now = new Date();
  const airDate = new Date(schedule.airDateTime);
  const diffTime = Math.max(0, airDate.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#101014] p-6">
      <div className="flex items-center gap-3 mb-4">
        <Calendar className="size-5 text-amber-400" />
        <span className="text-lg font-bold text-white">{schedule.episodeTitle || "Episode " + schedule.episodeNumber}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-sm text-zinc-400">Airs at</p>
          <p className="text-2xl font-bold text-white">{schedule.airDateTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: schedule.timezoneOffset,
          })}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-400">Status</p>
          <span className={cn(
            "px-2 py-1 rounded text-sm",
            airingStateMap(schedule.airingState),
          )}>
            {airingStateMap(schedule.airingState)}
          </span>
        </div>
      </div>

      {/* Countdown */}
      {schedule.daysUntilAiring !== null ? (
        <div className="mt-4 p-3 rounded bg-[#16161c]">
          <Clock className="size-4 text-amber-400 mb-2 block" />
          {schedule.daysUntilAiring === 1 ? (
            "Airings Tomorrow"
          ) : (
            <span className="text-lg font-medium">
              {schedule.daysUntilAiring} Days
            </span>
          )}
        </div>
      ) : (
        <div className="mt-4 p-3 rounded bg-[#16161c]">
          <Clock className="size-4 text-amber-400 mb-2 block" />
          Currently Airing
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/[0.08]">
        <p className="text-xs text-zinc-400">Timezone: {schedule.timezoneOffset}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(`/anime/${animeId}?tz=${schedule.timezoneOrigin}`, "_blank")}
        >
          View in my timezone
        </Button>
      </div>
    </div>
  );
}

function airingStateMap(state: AiringState): string {
  const map: Record<AiringState, string> = {
    airing: "Now Airing",
    delayed: "Delayed",
    completed: "Completed",
    unknown: "Unknown",
  };
  return map[state] || "Unknown";
}

interface EpisodeAiring {
  animeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  airDateTime: Date;
  airingState: AiringState;
  daysUntilAiring: number | null;
  timezoneOffset: string;
  timezoneOrigin?: string;
}

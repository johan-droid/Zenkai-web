"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchScheduleWeek,
  classifyScheduleError,
  type ScheduleEntry,
} from "@/lib/api/zenkai";
import { mediaHref } from "@/lib/media";

export function ScheduleView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["schedule", "week"],
    queryFn: () => fetchScheduleWeek(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Schedule unavailable"
        description={classifyScheduleError(error) === "invalid_response"
          ? "The schedule returned data this page could not understand."
          : "The schedule service could not answer just now. Check back in a moment."}
      />
    );
  }

  const days = data?.days ?? [];

  if (days.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing airing this week"
        description="The weekly schedule is empty right now. Check back closer to the season."
      />
    );
  }

  const todayKey = new Date().setHours(0, 0, 0, 0);

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        const dayTimestamp = new Date(day.date + "T00:00:00Z").getTime();
        return (
          <section key={day.date} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-base font-bold tracking-tight">
                {dayTimestamp === todayKey ? "Today" : day.dayOfWeek}
              </h2>
              <span className="text-xs text-muted-foreground">
                {new Date(day.date + "T00:00:00Z").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {day.entries.map((entry) => (
                <ScheduleRow key={entry.scheduleId} entry={entry} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  const time = entry.airingAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={mediaHref({ kind: "anime" as const, id: entry.anilistId })}
      className="glass glass-hover flex items-center gap-3 rounded-2xl p-3 hover:border-brand-400/40"
    >
      <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-brand-400">
        {time}
      </span>
      {entry.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.coverUrl}
          alt=""
          loading="lazy"
          className="h-14 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{entry.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          Episode {entry.episodeNumber}
        </span>
      </span>
    </Link>
  );
}

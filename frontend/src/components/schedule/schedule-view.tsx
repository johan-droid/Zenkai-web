"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getAiringSchedule, type ScheduleEntry } from "@/lib/api/anilist";
import { displayTitle, mediaHref } from "@/lib/media";

const DAY_MS = 24 * 60 * 60 * 1000;

export function ScheduleView() {
  // Cover the current week, aligned to local midnight.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekStart = startOfToday.getTime() - startOfToday.getDay() * DAY_MS;
  const weekEnd = weekStart + 7 * DAY_MS;

  const { data, isLoading } = useQuery({
    queryKey: ["schedule", "week", new Date(weekStart).toDateString()],
    queryFn: () =>
      getAiringSchedule({
        perPage: 100,
        airingAtGreater: Math.floor(weekStart / 1000),
        airingAtLesser: Math.floor(weekEnd / 1000),
      }),
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

  const entries = data ?? [];
  const days = groupByDay(entries, weekStart);

  if (!entries.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing airing this week"
        description="The weekly schedule is empty right now. Check back closer to the season."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.timestamp} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-bold tracking-tight">
              {day.isToday ? "Today" : day.label}
            </h2>
            <span className="text-xs text-muted-foreground">
              {new Date(day.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {day.entries.map((entry) => (
              <ScheduleRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  const time = new Date(entry.airingAt * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={mediaHref(entry.media)}
      className="glass glass-hover flex items-center gap-3 rounded-2xl p-3 hover:border-brand-400/40"
    >
      <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-brand-400">
        {time}
      </span>
      {entry.media.cover.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.media.cover.url}
          alt=""
          loading="lazy"
          className="h-14 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{displayTitle(entry.media.title)}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          Episode {entry.episode}
        </span>
      </span>
    </Link>
  );
}

function groupByDay(entries: ScheduleEntry[], weekStart: number) {
  const buckets = new Map<number, ScheduleEntry[]>();

  for (const entry of entries) {
    const day = new Date(entry.airingAt * 1000);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  const todayKey = new Date().setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, offset) => {
    const timestamp = weekStart + offset * DAY_MS;
    return {
      timestamp,
      label: new Date(timestamp).toLocaleDateString(undefined, { weekday: "long" }),
      isToday: timestamp === todayKey,
      entries: (buckets.get(timestamp) ?? []).sort((a, b) => a.airingAt - b.airingAt),
    };
  }).filter((day) => day.entries.length > 0);
}

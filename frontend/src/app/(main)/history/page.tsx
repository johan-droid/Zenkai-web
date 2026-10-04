"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Play, BookOpen, Trash2, Clock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useContinueWatching } from "@/hooks/use-progress";
import { clearHistory, type ContinueEntry } from "@/lib/db/progress";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function HistoryCard({ entry }: { entry: ContinueEntry }) {
  const href =
    entry.kind === "anime"
      ? `/watch/${entry.mediaId}/${entry.unit}`
      : `/read/${entry.mediaId}/${entry.unit}`;

  return (
    <Link
      href={href}
      className="group glass-panel flex gap-4 rounded-2xl p-3 transition-all hover:bg-white/5 hover:scale-[1.01]"
    >
      {/* Cover */}
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {entry.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.coverUrl}
            alt={entry.title}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            {entry.kind === "anime" ? (
              <Play className="size-5 text-muted-foreground" />
            ) : (
              <BookOpen className="size-5 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-5 fill-white text-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-semibold">{entry.title}</p>
          <p className="text-xs text-muted-foreground">
            {entry.kind === "anime" ? `Episode ${entry.unit}` : `Chapter ${entry.unit}`}
            {entry.totalUnits ? ` / ${entry.totalUnits}` : ""}
          </p>
        </div>

        {/* Progress bar (anime only) */}
        {entry.kind === "anime" && entry.durationSeconds && entry.fraction > 0 ? (
          <div className="flex flex-col gap-1">
            <Progress value={entry.fraction * 100} className="h-1" />
            <p className="text-xs text-muted-foreground">
              {formatTime(entry.positionSeconds)} watched
            </p>
          </div>
        ) : null}
      </div>

      {/* Timestamp */}
      <div className="flex shrink-0 items-start gap-1 text-xs text-muted-foreground/60">
        <Clock className="mt-0.5 size-3" />
        {timeAgo(entry.updatedAt)}
      </div>
    </Link>
  );
}

export default function HistoryPage() {
  const [clearing, setClearing] = useState(false);
  const animeEntries = useContinueWatching("anime");
  const mangaEntries = useContinueWatching("manga");

  const allEntries: ContinueEntry[] = [
    ...(animeEntries ?? []),
    ...(mangaEntries ?? []),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  const loading = animeEntries === undefined && mangaEntries === undefined;

  async function handleClear() {
    setClearing(true);
    await clearHistory();
    setClearing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="History"
        description="Everything you have watched or read, stored locally on this device."
        actions={
          allEntries.length > 0 ? (
            <Button
              variant="outline"
              className="glass rounded-xl gap-2"
              onClick={handleClear}
              disabled={clearing}
            >
              <Trash2 className="size-4" />
              {clearing ? "Clearing…" : "Clear history"}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : allEntries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing here yet"
          description="Once you start watching or reading, your progress will appear here so you can pick up where you left off."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {allEntries.map((entry) => (
            <HistoryCard key={`${entry.kind}-${entry.mediaId}-${entry.unit}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

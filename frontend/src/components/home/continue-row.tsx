"use client";

import Link from "next/link";
import { History, Play, BookOpen, X, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useHasAnyProgress, useContinueWatching } from "@/hooks/use-progress";
import { removeProgress, type ContinueEntry } from "@/lib/db/progress";
import { cleanImageUrl } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

function ContinueCard({ entry, index }: { entry: ContinueEntry; index: number }) {
  const href =
    entry.kind === "anime"
      ? `/watch/${entry.mediaId}/${entry.unit}`
      : `/read/${entry.mediaId}/${entry.unit}`;

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void removeProgress(entry.kind, entry.mediaId);
  };

  return (
    <div
      className={cn(
        "relative flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40 select-none",
        "surface-1 border border-surface-2/90 rounded-xl",
      )}
    >
      <Link href={href} className="block">
        {/* Cover */}
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl">
          {cleanImageUrl(entry.coverUrl) ? (
            <img
              src={cleanImageUrl(entry.coverUrl)!}
              alt={entry.title}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-surface-2">
              {entry.kind === "anime" ? (
                <Play className="size-6 text-ink-3/60" />
              ) : (
                <BookOpen className="size-6 text-ink-3/60" />
              )}
            </div>
          )}

          {/* Matte gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-2/70 via-transparent to-transparent" />

          {/* Progress bar */}
          {entry.fraction > 0 ? (
            <div className="absolute inset-x-0 bottom-0">
              <Progress
                value={entry.fraction * 100}
                className="h-[3px] rounded-none bg-signal/12 [&>div]:bg-gradient-to-r [&>div]:from-signal [&>div]:to-signal-red"
              />
            </div>
          ) : null}

          {/* Episode badge */}
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg border border-surface-2/90 bg-surface-1/80 px-1.5 py-0.5 text-xs font-bold text-ink-2 backdrop-blur-md">
            <Clock className="size-2.5 opacity-70" />
            {entry.kind === "anime" ? `EP ${entry.unit}` : `CH ${entry.unit}`}
          </div>

          {/* Top inset highlight */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        </div>

        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-ink-2/85">
          {entry.title}
        </p>
      </Link>

      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Remove ${entry.title} from continue watching`}
        title="Remove"
        className="absolute right-1.5 top-1.5 z-20 flex size-6 items-center justify-center rounded-lg border border-surface-2/90 bg-surface-1/80 text-ink-3 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-background [active]:scale-105 [disabled]:opacity-50 transition-colors duration-200 hover:scale-105 hover:bg-signal hover:border-signal/60 hover:text-white focus:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Continue Watching / Reading.
 *
 * Reads progress straight out of Dexie, so picking up where you left off works
 * immediately with no login required.
 */
export function ContinueRow() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLocalProgress = useHasAnyProgress();
  const animeEntries = useContinueWatching("anime");
  const mangaEntries = useContinueWatching("manga");

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = direction === "left" ? -460 : 460;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (!hasLocalProgress) return null;

  const allEntries: ContinueEntry[] = [
    ...(animeEntries ?? []),
    ...(mangaEntries ?? []),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 14);

  if (allEntries.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-ink-3/70 mb-0.5">
            <History className="size-3.5" />
            <span className="text-[0.65rem] font-semibold text-ink-3">Continue Watching</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-signal to-signal-soft" />
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Pick up where you left off</h2>
          </div>
        </div>
        <Link
          href="/history"
          className="focus-ring rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
        >
          See all
          <ChevronRight className="size-4 hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="group/rail relative">
        {/* Left arrow */}
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => handleScroll("left")}
          className="absolute -left-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-surface-2/90 bg-surface-1 text-ink-2 shadow-none backdrop-blur-none [active]:scale-105 [disabled]:opacity-50 transition-colors duration-200 hover:scale-105 hover:bg-signal hover:border-signal/70 hover:shadow-none group-hover/rail:opacity-100 md-flex"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div
          ref={scrollRef}
          className="no-scrollbar -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2"
        >
          {allEntries.map((entry, i) => (
            <ContinueCard
              key={`${entry.kind}-${entry.mediaId}-${entry.unit}`}
              entry={entry}
              index={i}
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => handleScroll("right")}
          className="absolute -right-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-surface-2/90 bg-surface-1 text-ink-2 shadow-none backdrop-blur-none [active]:scale-105 [disabled]:opacity-50 transition-colors duration-200 hover:scale-105 hover:bg-signal hover:border-signal/70 hover:shadow-none group-hover/rail:opacity-100 md-flex"
        >
          <ChevronRight className="size-4 hover:translate-x-0.5" />
        </button>
      </div>
    </section>
  );
}
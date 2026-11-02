"use client";

import { useRef } from "react";
import Link from "next/link";
import { Play, BookOpen, X, ChevronLeft, ChevronRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useHasAnyProgress, useContinueWatching } from "@/hooks/use-progress";
import { removeProgress, type ContinueEntry } from "@/lib/db/progress";
import { cleanImageUrl } from "@/lib/api/zenkai";

function ContinueCard({ entry }: { entry: ContinueEntry }) {
  const href =
    entry.kind === "anime"
      ? `/watch/${entry.mediaId}/${entry.unit}`
      : `/read/${entry.mediaId}/${entry.unit}`;

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void removeProgress(entry.kind, entry.mediaId);
  };

  const cover = cleanImageUrl(entry.coverUrl);
  const unitLabel = entry.kind === "anime" ? `EP ${entry.unit}` : `CH ${entry.unit}`;
  const percent = Math.round(Math.min(1, Math.max(0, entry.fraction)) * 100);

  return (
    <div className="group/card relative flex w-32 shrink-0 snap-start select-none flex-col sm:w-40 md:w-44">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface-2 ring-1 ring-white/[0.06] transition-[box-shadow] duration-300 group-hover/card:ring-white/20">
        <Link href={href} className="absolute inset-0 z-10" aria-label={`Resume ${entry.title}`}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03]"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-surface-2">
              {entry.kind === "anime" ? (
                <Play className="size-6 text-ink-3" aria-hidden="true" />
              ) : (
                <BookOpen className="size-6 text-ink-3" aria-hidden="true" />
              )}
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-0/90 to-transparent" />
        </Link>

        {/* Resume affordance (desktop hover; the poster itself is the link on touch). */}
        <span className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 sm:flex">
          <span className="flex size-10 items-center justify-center rounded-full bg-signal text-white">
            <Play className="ml-0.5 size-4 fill-white" aria-hidden="true" />
          </span>
        </span>

        {entry.fraction > 0 ? (
          <Progress
            value={percent}
            className="absolute inset-x-0 bottom-0 z-20 h-0.5 rounded-none bg-white/15 [&>div]:bg-signal"
            aria-label={`${percent}% complete`}
          />
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-col">
        <Link
          href={href}
          className="line-clamp-2 text-[0.8rem] font-semibold leading-[1.3] text-ink-1 transition-colors group-hover/card:text-signal-soft focus-visible:outline-none focus-visible:underline"
        >
          {entry.title}
        </Link>
        <div className="mt-1 flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-ink-3 tabular-nums">
            {unitLabel}
            {percent > 0 ? ` · ${percent}%` : ""}
          </span>
          <button
            type="button"
            onClick={handleRemove}
            aria-label={`Remove ${entry.title} from continue watching`}
            title="Remove"
            className="relative -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-signal after:absolute after:-inset-1.5 after:content-[''] sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Continue Watching / Reading.
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
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4 border-b border-white/[0.07] pb-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-mono text-[0.62rem] font-medium tracking-[0.18em] text-signal tabular-nums">
            00
          </span>
          <h2 className="truncate text-[1.05rem] font-bold tracking-[-0.01em] text-ink-1 sm:text-xl">
            Continue Watching
          </h2>
        </div>
        <Link
          href="/history"
          className="group/see -my-2 flex min-h-10 shrink-0 items-center gap-1 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink-1"
        >
          <span>History</span>
          <ChevronRight
            className="size-3 transition-transform duration-200 group-hover/see:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>

      <div className="group/shelf relative">
        <button
          type="button"
          aria-label="Scroll continue watching left"
          onClick={() => handleScroll("left")}
          className="absolute -left-4 top-[38%] z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-0/90 text-ink-1 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-signal md:flex"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>

        <div
          ref={scrollRef}
          className="no-scrollbar -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2"
        >
          {allEntries.map((entry) => (
            <ContinueCard
              key={`${entry.kind}-${entry.mediaId}-${entry.unit}`}
              entry={entry}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Scroll continue watching right"
          onClick={() => handleScroll("right")}
          className="absolute -right-4 top-[38%] z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-0/90 text-ink-1 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-signal md:flex"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

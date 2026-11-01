"use client";

import { useRef } from "react";
import Link from "next/link";
import { Play, BookOpen, X, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useHasAnyProgress, useContinueWatching } from "@/hooks/use-progress";
import { removeProgress, type ContinueEntry } from "@/lib/db/progress";
import { cleanImageUrl } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

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

  return (
    <div
      className={cn(
        "group/card relative flex w-36 shrink-0 snap-start flex-col select-none sm:w-44",
      )}
    >
      {/* Poster container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#16161c] transition-all duration-300 ease-out group-hover/card:scale-[1.03] group-hover/card:border-white/20 group-hover/card:shadow-xl group-hover/card:shadow-black/60">
        <Link href={href} className="absolute inset-0 z-0 focus:outline-none" aria-label={entry.title}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={entry.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-[#1e1e26]">
              {entry.kind === "anime" ? (
                <Play className="size-6 text-zinc-500" />
              ) : (
                <BookOpen className="size-6 text-zinc-500" />
              )}
            </div>
          )}

          {/* Gradients */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#101014] via-[#101014]/20 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[#101014]/70 to-transparent" />
        </Link>

        {/* Progress bar */}
        {entry.fraction > 0 ? (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <Progress
              value={Math.min(100, Math.max(0, entry.fraction * 100))}
              className="h-1 rounded-none bg-black/40 [&>div]:bg-gradient-to-r [&>div]:from-[#C51F3A] [&>div]:to-[#E02E4D]"
            />
          </div>
        ) : null}

        {/* Episode / Chapter badge */}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md border border-white/10 bg-[#101014]/80 px-1.5 py-0.5 text-[0.6rem] font-bold text-zinc-200 backdrop-blur-md">
          <Clock className="size-2.5 opacity-80" />
          <span>{entry.kind === "anime" ? `EP ${entry.unit}` : `CH ${entry.unit}`}</span>
        </div>

        {/* Quick Play overlay */}
        <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover/card:opacity-100 sm:flex">
          <Link
            href={href}
            aria-label={`Resume ${entry.title}`}
            className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-[#C51F3A] text-white shadow-lg shadow-[#C51F3A]/50 transition-transform duration-200 hover:scale-110 active:scale-95"
          >
            <Play className="ml-0.5 size-4 fill-white" />
          </Link>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={handleRemove}
          aria-label={`Remove ${entry.title} from continue watching`}
          title="Remove"
          className="absolute right-1.5 top-1.5 z-20 flex size-6 items-center justify-center rounded-md border border-white/10 bg-[#101014]/80 text-zinc-400 backdrop-blur-md transition-all duration-200 hover:border-[#C51F3A] hover:bg-[#C51F3A] hover:text-white"
        >
          <X className="size-3" />
        </button>

        {/* Inset highlight top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      <Link
        href={href}
        className="mt-2.5 block focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C51F3A] rounded-md"
      >
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-200 transition-colors duration-200 group-hover/card:text-white">
          {entry.title}
        </p>
      </Link>
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
    <section className="flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#C51F3A] to-[#E02E4D] shadow-sm shadow-[#C51F3A]/40" />
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            Continue Watching
          </h2>
        </div>
        <Link
          href="/history"
          className="group/see flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C51F3A]"
        >
          <span>History</span>
          <ChevronRight className="size-3.5 transition-transform duration-200 group-hover/see:translate-x-0.5" />
        </Link>
      </div>

      <div className="group/shelf relative">
        {/* Left arrow */}
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => handleScroll("left")}
          className={cn(
            "absolute -left-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl",
            "border border-white/10 bg-[#16161c]/90 text-zinc-200 backdrop-blur-md shadow-xl",
            "transition-all duration-200 hover:border-[#C51F3A] hover:bg-[#C51F3A] hover:text-white hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A] md:flex",
          )}
        >
          <ChevronLeft className="size-4" />
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

        {/* Right arrow */}
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => handleScroll("right")}
          className={cn(
            "absolute -right-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl",
            "border border-white/10 bg-[#16161c]/90 text-zinc-200 backdrop-blur-md shadow-xl",
            "transition-all duration-200 hover:border-[#C51F3A] hover:bg-[#C51F3A] hover:text-white hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A] md:flex",
          )}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

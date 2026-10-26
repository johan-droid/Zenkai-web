"use client";

import { useRef } from "react";
import Link from "next/link";
import { History, Play, BookOpen, X, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { motion } from "motion/react";

import { Progress } from "@/components/ui/progress";
import { useHasAnyProgress, useContinueWatching } from "@/hooks/use-progress";
import { removeProgress, type ContinueEntry } from "@/lib/db/progress";

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
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        delay: Math.min(index * 0.055, 0.45),
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group relative flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40 select-none"
    >
      <Link href={href} className="block">
        {/* Cover */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 360, damping: 24 }}
          className={[
            "relative aspect-[2/3] overflow-hidden rounded-xl",
            "border border-white/[0.07] bg-[#0b0b0f]",
            "transition-all duration-350",
            "group-hover:border-[#b8102a]/50",
            "group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.9),0_4px_16px_rgba(184,16,42,0.22)]",
          ].join(" ")}
        >
          {entry.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.coverUrl}
              alt={entry.title}
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-[#b8102a]/12 to-background">
              {entry.kind === "anime" ? (
                <Play className="size-6 text-muted-foreground/50" />
              ) : (
                <BookOpen className="size-6 text-muted-foreground/50" />
              )}
            </div>
          )}

          {/* Matte gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Hover play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px] opacity-0 transition-opacity duration-280 group-hover:opacity-100">
            <div className="grid size-10 place-items-center rounded-full bg-[#b8102a] text-white shadow-[0_4px_20px_rgba(184,16,42,0.6)] ring-2 ring-white/20 transition-transform duration-200 group-hover:scale-110">
              <Play className="ml-0.5 size-4 fill-white" />
            </div>
          </div>

          {/* Progress bar */}
          {entry.fraction > 0 ? (
            <div className="absolute inset-x-0 bottom-0">
              <Progress
                value={entry.fraction * 100}
                className="h-[3px] rounded-none bg-white/[0.12] [&>div]:bg-gradient-to-r [&>div]:from-[#b8102a] [&>div]:to-[#e84060]"
              />
            </div>
          ) : null}

          {/* Episode badge */}
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg border border-white/[0.10] bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
            <Clock className="size-2.5 opacity-70" />
            {entry.kind === "anime" ? `EP ${entry.unit}` : `CH ${entry.unit}`}
          </div>

          {/* Top inset highlight */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
        </motion.div>

        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-white/85 transition-colors duration-200 group-hover:text-rose-100">
          {entry.title}
        </p>
      </Link>

      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Remove ${entry.title} from continue watching`}
        title="Remove"
        className="absolute right-1.5 top-1.5 z-20 flex size-6 items-center justify-center rounded-lg border border-white/[0.10] bg-black/80 text-zinc-400 opacity-0 backdrop-blur-md transition-all duration-200 hover:bg-[#b8102a] hover:border-[#b8102a]/60 hover:text-white group-hover:opacity-100 focus:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
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
          <div className="flex items-center gap-2 text-muted-foreground/70 mb-0.5">
            <History className="size-3.5" />
            <span className="text-[0.65rem] font-semibold tracking-[0.14em] uppercase">Continue Watching</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-[#e84060] to-[#b8102a]" />
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Pick up where you left off</h2>
          </div>
        </div>
        <Link
          href="/history"
          className="group flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-white/[0.04]"
        >
          See all
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="group/rail relative">
        {/* Left arrow */}
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => handleScroll("left")}
          className="absolute -left-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-white/[0.09] bg-[#0b0b0f]/90 text-white shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md opacity-0 transition-all duration-250 hover:scale-105 hover:bg-[#b8102a] hover:border-[#b8102a]/70 hover:shadow-[0_8px_24px_rgba(184,16,42,0.4)] group-hover/rail:opacity-100 md:flex"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div
          ref={scrollRef}
          className="no-scrollbar -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2 scroll-smooth"
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
          className="absolute -right-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-white/[0.09] bg-[#0b0b0f]/90 text-white shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md opacity-0 transition-all duration-250 hover:scale-105 hover:bg-[#b8102a] hover:border-[#b8102a]/70 hover:shadow-[0_8px_24px_rgba(184,16,42,0.4)] group-hover/rail:opacity-100 md:flex"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

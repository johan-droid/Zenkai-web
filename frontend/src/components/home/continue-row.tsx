"use client";

import Link from "next/link";
import { History, Play, BookOpen } from "lucide-react";
import { motion } from "motion/react";

import { Progress } from "@/components/ui/progress";
import { useHasAnyProgress, useContinueWatching } from "@/hooks/use-progress";
import type { ContinueEntry } from "@/lib/db/progress";

function ContinueCard({ entry }: { entry: ContinueEntry }) {
  const href =
    entry.kind === "anime"
      ? `/watch/${entry.mediaId}/${entry.unit}`
      : `/read/${entry.mediaId}/${entry.unit}`;

  return (
    <Link href={href} className="group relative flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40 select-none">
      {/* Cover */}
      <motion.div
        whileHover={{ y: -5, scale: 1.025 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 25 }}
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07070a]/90 transition-colors duration-300 group-hover:border-[#c8102e]/60 group-hover:shadow-[0_12px_32px_rgba(200,16,46,0.2)]"
      >
        {entry.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.coverUrl}
            alt={entry.title}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            {entry.kind === "anime" ? (
              <Play className="size-6 text-muted-foreground" />
            ) : (
              <BookOpen className="size-6 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="grid size-10 place-items-center rounded-full bg-[#c8102e] text-white shadow-lg shadow-[#c8102e]/50">
            <Play className="ml-0.5 size-4 fill-white" />
          </div>
        </div>

        {/* Progress bar at bottom of card */}
        {entry.fraction > 0 ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/60">
            <Progress value={entry.fraction * 100} className="h-1 rounded-none bg-white/10 [&>div]:bg-[#c8102e]" />
          </div>
        ) : null}

        {/* Episode badge */}
        <div className="absolute left-2 top-2 rounded-lg border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
          {entry.kind === "anime" ? `EP ${entry.unit}` : `CH ${entry.unit}`}
        </div>
      </motion.div>

      <p className="line-clamp-2 text-xs font-semibold leading-tight text-white/90 group-hover:text-rose-100 transition-colors">
        {entry.title}
      </p>
    </Link>
  );
}

/**
 * Continue Watching / Reading.
 *
 * Reads progress straight out of Dexie, so picking up where you left off works
 * immediately with no login required.
 */
export function ContinueRow() {
  const hasLocalProgress = useHasAnyProgress();
  const animeEntries = useContinueWatching("anime");
  const mangaEntries = useContinueWatching("manga");

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
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <History className="size-4" />
            <span className="text-xs tracking-wide uppercase">Continue watching</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">Pick up where you left off</h2>
          <span className="h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-400 to-transparent" />
        </div>
        <Link
          href="/history"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          See all
        </Link>
      </div>

      <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
        {allEntries.map((entry) => (
          <ContinueCard
            key={`${entry.kind}-${entry.mediaId}-${entry.unit}`}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
}

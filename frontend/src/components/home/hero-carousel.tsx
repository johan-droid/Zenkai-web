"use client";

import { AnimatePresence, motion } from "motion/react";
import { Info, Play, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/hooks/use-progress";
import type { MediaSummary } from "@/lib/media";
import { displayTitle, formatScore, mediaHref, seasonLabel } from "@/lib/media";
import { cn } from "@/lib/utils";

const ROTATE_MS = 7000;

export function HeroCarousel({
  items,
  isLoading,
}: {
  items: MediaSummary[];
  isLoading?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const animeProgress = useContinueWatching("anime");
  const mangaProgress = useContinueWatching("manga");

  useEffect(() => {
    if (items.length <= 1 || isHovered) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length, isHovered]);

  if (isLoading) return <HeroSkeleton />;
  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)]!;

  const activeContinue =
    active.kind === "anime"
      ? animeProgress?.find((p) => p.mediaId === active.id)
      : mangaProgress?.find((p) => p.mediaId === active.id);

  const watchUrl = activeContinue
    ? (active.kind === "anime" ? `/watch/${active.id}/${activeContinue.unit}` : `/read/${active.id}/${activeContinue.unit}`)
    : (active.kind === "anime" ? `/watch/${active.id}/1` : `/read/${active.id}/1`);

  const watchLabel = activeContinue
    ? (active.kind === "anime" ? `Continue EP ${activeContinue.unit}` : `Continue CH ${activeContinue.unit}`)
    : (active.kind === "anime" ? "Watch Now" : "Start Reading");

  return (
    <section
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black sm:rounded-3xl"
    >
      <div className="relative min-h-[clamp(18rem,42vh,26rem)] w-full sm:min-h-[clamp(22rem,52vh,34rem)]">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {active.banner ?? active.cover.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.banner ?? active.cover.url!}
                alt=""
                onError={(e) => {
                  if (active.cover.url && e.currentTarget.src !== active.cover.url) {
                    e.currentTarget.src = active.cover.url;
                  }
                }}
                className="size-full object-cover object-center"
              />
            ) : (
              <div className="size-full bg-gradient-to-br from-[#c8102e]/30 to-background" />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-transparent" />

        <div className="relative flex h-full flex-col justify-end gap-3 p-4 sm:gap-4 sm:p-8">
          <motion.div
            key={`${active.id}-copy`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex max-w-2xl flex-col gap-3 sm:gap-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-lg bg-[#c8102e]/30 px-2.5 py-1 text-xs font-bold tracking-wider text-rose-200 border border-[#c8102e]/40">
                #{(index + 1).toString().padStart(2, "0")} TRENDING
              </Badge>
              {seasonLabel(active.season, active.seasonYear) ? (
                <Badge className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1">
                  {seasonLabel(active.season, active.seasonYear)}
                </Badge>
              ) : null}
              {active.averageScore ? (
                <Badge className="gap-1 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-300">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {formatScore(active.averageScore)}
                </Badge>
              ) : null}
            </div>

            <h1 className="text-balance text-2xl font-black leading-tight tracking-tight text-white drop-shadow-md sm:text-4xl md:text-5xl">
              {displayTitle(active.title)}
            </h1>

            {active.description ? (
              <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-300 sm:line-clamp-3 sm:text-base">
                {active.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1 sm:gap-3 sm:pt-2">
              <Button size="lg" className="rounded-xl bg-[#c8102e] font-bold text-white shadow-lg shadow-[#c8102e]/25 hover:bg-[#a00d25] sm:rounded-xl" asChild>
                <Link href={watchUrl}>
                  <Play className="size-4 fill-current" />
                  {watchLabel}
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 sm:rounded-xl" asChild>
                <Link href={mediaHref(active)}>
                  <Info className="size-4" />
                  Details
                </Link>
              </Button>
            </div>
          </motion.div>

          <div className="mt-2 flex items-center gap-2 sm:mt-4">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${displayTitle(item.title)}`}
                aria-current={itemIndex === index}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  itemIndex === index
                    ? "w-8 bg-[#e52545]"
                    : "w-3 bg-white/25 hover:bg-white/40",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] sm:rounded-3xl">
      <Skeleton className="h-[clamp(18rem,42vh,26rem)] w-full rounded-none sm:h-[clamp(22rem,52vh,34rem)]" />
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { Info, Play, Star, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/hooks/use-progress";
import type { MediaSummary } from "@/lib/media";
import { displayTitle, formatScore, mediaHref, seasonLabel } from "@/lib/media";
import { cn } from "@/lib/utils";

const ROTATE_MS = 7500;

export function HeroCarousel({
  items,
  isLoading,
}: {
  items: MediaSummary[];
  isLoading?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const animeProgress = useContinueWatching("anime");
  const mangaProgress = useContinueWatching("manga");

  const advance = useCallback((dir: 1 | -1 = 1) => {
    setDirection(dir);
    setIndex((v) => (v + dir + items.length) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1 || isHovered) return;
    const timer = setInterval(() => advance(1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length, isHovered, advance]);

  if (isLoading) return <HeroSkeleton />;
  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)]!;

  const activeContinue =
    active.kind === "anime"
      ? animeProgress?.find((p) => p.mediaId === active.id)
      : mangaProgress?.find((p) => p.mediaId === active.id);

  const watchUrl = activeContinue
    ? (active.kind === "anime"
        ? `/watch/${active.id}/${activeContinue.unit}`
        : `/read/${active.id}/${activeContinue.unit}`)
    : (active.kind === "anime" ? `/watch/${active.id}/1` : `/read/${active.id}/1`);

  const watchLabel = activeContinue
    ? (active.kind === "anime"
        ? `Continue EP ${activeContinue.unit}`
        : `Continue CH ${activeContinue.unit}`)
    : (active.kind === "anime" ? "Watch Now" : "Start Reading");

  return (
    <section
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black sm:rounded-3xl"
      style={{
        boxShadow: "0 32px 64px -24px rgba(0,0,0,0.95), 0 1px 0 0 rgba(255,255,255,0.06) inset",
      }}
    >
      <div className="relative min-h-[clamp(18rem,44vh,28rem)] w-full sm:min-h-[clamp(22rem,54vh,36rem)]">

        {/* Background image layer with crossfade */}
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={active.id}
            custom={direction}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {active.banner ?? active.cover.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.banner ?? active.cover.url!}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (active.cover.url && e.currentTarget.src !== active.cover.url) {
                    e.currentTarget.src = active.cover.url;
                  }
                }}
                className="size-full object-cover object-center"
              />
            ) : (
              <div className="size-full bg-gradient-to-br from-[#b8102a]/25 to-background" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Multi-layer matte gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/55 to-transparent" />
        {/* Top edge darken for navbar readability */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

        {/* Matte vignette edges */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,transparent_40%,rgba(6,6,8,0.45)_100%)]" />

        {/* Content */}
        <div className="relative flex h-full flex-col justify-end gap-4 p-5 sm:gap-5 sm:p-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${active.id}-copy`}
              initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(3px)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-2xl flex-col gap-3.5 sm:gap-4"
            >
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-lg border border-[#b8102a]/40 bg-[#b8102a]/20 px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.14em] text-rose-200 backdrop-blur-sm">
                  #{(index + 1).toString().padStart(2, "0")} TRENDING
                </span>
                {seasonLabel(active.season, active.seasonYear) ? (
                  <span className="inline-flex items-center rounded-lg border border-white/[0.12] bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-white/80 backdrop-blur-sm">
                    {seasonLabel(active.season, active.seasonYear)}
                  </span>
                ) : null}
                {active.averageScore ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-300 backdrop-blur-sm">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {formatScore(active.averageScore)}
                  </span>
                ) : null}
              </div>

              <h1 className="text-balance text-2xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl"
                style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
              >
                {displayTitle(active.title)}
              </h1>

              {active.description ? (
                <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-300/90 sm:line-clamp-3 sm:text-base">
                  {active.description}
                </p>
              ) : null}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1 sm:gap-3">
                <Button
                  size="lg"
                  className="rounded-xl bg-[#b8102a] px-5 font-bold text-white shadow-[0_8px_24px_rgba(184,16,42,0.4)] hover:bg-[#9a0d24] hover:shadow-[0_8px_32px_rgba(184,16,42,0.55)] transition-all duration-200"
                  asChild
                >
                  <Link href={watchUrl}>
                    <Play className="size-4 fill-current" />
                    {watchLabel}
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-white/[0.15] bg-white/[0.06] text-white backdrop-blur-sm hover:bg-white/[0.12] hover:border-white/[0.22] transition-all duration-200"
                  asChild
                >
                  <Link href={mediaHref(active)}>
                    <Info className="size-4" />
                    Details
                  </Link>
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots & nav arrows */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {items.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Show ${displayTitle(item.title)}`}
                  aria-current={itemIndex === index}
                  onClick={() => { setDirection(itemIndex > index ? 1 : -1); setIndex(itemIndex); }}
                  className={cn(
                    "h-1 rounded-full transition-all duration-400",
                    itemIndex === index
                      ? "w-8 bg-[#e84060]"
                      : "w-2.5 bg-white/20 hover:bg-white/38",
                  )}
                />
              ))}
            </div>

            {/* Arrow controls */}
            {items.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => advance(-1)}
                  className="grid size-8 place-items-center rounded-xl border border-white/[0.10] bg-black/50 text-white/70 backdrop-blur-md hover:bg-white/[0.10] hover:text-white transition-all duration-200"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => advance(1)}
                  className="grid size-8 place-items-center rounded-xl border border-white/[0.10] bg-black/50 text-white/70 backdrop-blur-md hover:bg-white/[0.10] hover:text-white transition-all duration-200"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom shimmer highlight */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] sm:rounded-3xl">
      <Skeleton className="h-[clamp(18rem,44vh,28rem)] w-full rounded-none sm:h-[clamp(22rem,54vh,36rem)]" />
      {/* Animated shimmer lines to suggest content */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-3">
        <div className="skeleton-shimmer h-3 w-32 rounded-full" />
        <div className="skeleton-shimmer h-8 w-72 rounded-lg" />
        <div className="skeleton-shimmer h-4 w-52 rounded-md" />
        <div className="flex gap-2 pt-1">
          <div className="skeleton-shimmer h-10 w-28 rounded-xl" />
          <div className="skeleton-shimmer h-10 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

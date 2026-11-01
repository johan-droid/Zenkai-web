"use client";

import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useContinueWatching } from "@/hooks/use-progress";
import { useWatchlistEntry } from "@/hooks/use-watchlist";
import { cleanImageUrl } from "@/lib/api/zenkai";
import {
  displayTitle,
  formatScore,
  mediaHref,
  resolveEpisodeCounts,
  sanitizeSynopsis,
  seasonLabel,
  type MediaSummary,
} from "@/lib/media";
import { cn } from "@/lib/utils";

const AUTO_ROTATE_INTERVAL_MS = 7000;

export function HeroCarousel({
  items,
  isLoading,
}: {
  items: MediaSummary[];
  isLoading?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const animeProgress = useContinueWatching("anime");
  const mangaProgress = useContinueWatching("manga");

  const count = items.length;

  const nextSlide = useCallback(() => {
    if (count <= 1) return;
    setIndex((prev) => (prev + 1) % count);
  }, [count]);

  const prevSlide = useCallback(() => {
    if (count <= 1) return;
    setIndex((prev) => (prev - 1 + count) % count);
  }, [count]);

  // 7-second auto-rotation with hover/touch pause
  useEffect(() => {
    if (count <= 1 || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      nextSlide();
    }, AUTO_ROTATE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count, isPaused, nextSlide]);

  if (isLoading) return <HeroSkeleton />;
  if (!items.length) return null;

  const active = items[Math.min(index, count - 1)]!;
  const title = displayTitle(active.title);
  const art = cleanImageUrl(active.banner) ?? cleanImageUrl(active.cover.url);
  const coverUrl = cleanImageUrl(active.cover.url);

  const activeContinue =
    active.kind === "anime"
      ? animeProgress?.find((p) => p.mediaId === active.id)
      : mangaProgress?.find((p) => p.mediaId === active.id);

  const epInfo = resolveEpisodeCounts({
    format: active.format,
    status: active.status,
    episodes: active.episodes,
    totalEpisodes: active.episodes,
    chapters: active.chapters,
  });

  const watchUrl = activeContinue
    ? active.kind === "anime"
      ? `/watch/${active.id}/${activeContinue.unit}`
      : `/read/${active.id}/${activeContinue.unit}`
    : active.kind === "anime"
      ? `/watch/${active.id}/1`
      : `/read/${active.id}/1`;

  const watchLabel = activeContinue
    ? active.kind === "anime"
      ? `Continue Ep ${activeContinue.unit}`
      : `Continue Ch ${activeContinue.unit}`
    : active.kind === "anime"
      ? "Watch Now"
      : "Start Reading";

  const seasonText = active.seasonYear
    ? seasonLabel(active.season, active.seasonYear)
    : null;

  const score = formatScore(active.averageScore);
  const genres = (active.genres || []).slice(0, 3);

  return (
    <HeroItem
      active={active}
      title={title}
      art={art}
      coverUrl={coverUrl}
      epInfoBadge={epInfo.badgeLabel}
      score={score}
      seasonText={seasonText}
      genres={genres}
      watchUrl={watchUrl}
      watchLabel={watchLabel}
      index={index}
      items={items}
      onNext={nextSlide}
      onPrev={prevSlide}
      onSelectIndex={setIndex}
      onPause={() => setIsPaused(true)}
      onResume={() => setIsPaused(false)}
    />
  );
}

function HeroItem({
  active,
  title,
  art,
  coverUrl,
  epInfoBadge,
  score,
  seasonText,
  genres,
  watchUrl,
  watchLabel,
  index,
  items,
  onNext,
  onPrev,
  onSelectIndex,
  onPause,
  onResume,
}: {
  active: MediaSummary;
  title: string;
  art: string | null;
  coverUrl: string | null;
  epInfoBadge: string;
  score: string | null;
  seasonText: string | null;
  genres: string[];
  watchUrl: string;
  watchLabel: string;
  index: number;
  items: MediaSummary[];
  onNext: () => void;
  onPrev: () => void;
  onSelectIndex: (i: number) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const watchlist = useWatchlistEntry(
    active.kind === "anime" ? "anime" : "manga",
    active.id,
    title,
    coverUrl,
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured Anime"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onTouchStart={onPause}
      onTouchEnd={onResume}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl md:rounded-3xl",
        "border border-white/[0.08] bg-[#101014]",
        "min-h-[460px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[620px]",
        "shadow-2xl shadow-black/80",
      )}
    >
      {/* Background Cinematic Art with Smooth Transitions */}
      <div className="absolute inset-0 size-full overflow-hidden">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active.id}
            src={art}
            alt=""
            referrerPolicy="no-referrer"
            fetchPriority="high"
            onError={(e) => {
              if (coverUrl && e.currentTarget.src !== coverUrl) {
                e.currentTarget.src = coverUrl;
              }
            }}
            className="size-full object-cover object-[center_25%] transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="size-full bg-[#16161c]" />
        )}

        {/* Multi-Layer Darkening Gradients */}
        {/* Layer 1: Bottom-to-top darkening gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101014] via-[#101014]/75 to-transparent" />

        {/* Layer 2: Left-to-right darkening gradient on md/lg screens */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#101014] via-[#101014]/90 to-transparent md:w-[75%]" />

        {/* Layer 3: Top edge vignette for navbar contrast */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#101014]/60 to-transparent" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex min-h-[460px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[620px] flex-col justify-end p-6 sm:p-10 md:p-14 lg:p-16">
        <div className="max-w-2xl sm:max-w-3xl">
          {/* Badge Row */}
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C51F3A]/40 bg-[#C51F3A]/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-[#C51F3A] animate-pulse" />
              SPOTLIGHT #{index + 1}
            </span>

            {active.format && active.format !== "UNKNOWN" ? (
              <span className="rounded-md border border-white/10 bg-[#16161c]/80 px-2 py-0.5 text-xs font-semibold text-zinc-300 backdrop-blur-md">
                {active.format}
              </span>
            ) : null}

            {seasonText ? (
              <span className="rounded-md border border-white/10 bg-[#16161c]/80 px-2 py-0.5 text-xs font-semibold text-zinc-300 backdrop-blur-md">
                {seasonText}
              </span>
            ) : null}

            {epInfoBadge ? (
              <span className="rounded-md border border-white/10 bg-[#16161c]/80 px-2 py-0.5 text-xs font-semibold text-zinc-300 backdrop-blur-md">
                {epInfoBadge}
              </span>
            ) : null}

            {score ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#16161c]/80 px-2 py-0.5 text-xs font-bold text-[#f5c518] backdrop-blur-md">
                <Star className="size-3 fill-[#f5c518] text-[#f5c518]" />
                {score}
              </span>
            ) : null}

            {genres.map((g) => (
              <span
                key={g}
                className="hidden sm:inline-block rounded-md border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-xs font-medium text-zinc-400 backdrop-blur-md"
              >
                {g}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl drop-shadow-md line-clamp-2">
            {title}
          </h1>

          {/* Synopsis */}
          {active.description ? (
            <p className="mt-3.5 text-xs sm:text-sm md:text-base text-zinc-300/90 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-2xl drop-shadow">
              {sanitizeSynopsis(active.description)}
            </p>
          ) : null}

          {/* Primary CTA Buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Watch / Continue CTA */}
            <Link
              href={watchUrl}
              className={cn(
                "inline-flex h-11 sm:h-12 items-center gap-2.5 rounded-xl px-5 sm:px-7 text-sm font-bold text-white transition-all duration-200",
                "bg-[#C51F3A] hover:bg-[#a81730] active:scale-95",
                "shadow-lg shadow-[#C51F3A]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              )}
            >
              <Play className="size-4 fill-white" />
              <span>{watchLabel}</span>
            </Link>

            {/* View Details CTA */}
            <Link
              href={mediaHref(active)}
              className={cn(
                "inline-flex h-11 sm:h-12 items-center gap-2 rounded-xl px-4 sm:px-6 text-sm font-semibold text-zinc-200 transition-all duration-200",
                "border border-white/15 bg-white/[0.08] hover:bg-white/[0.16] hover:text-white backdrop-blur-md active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
              )}
            >
              <Info className="size-4" />
              <span>Details</span>
            </Link>

            {/* Interactive Watchlist Button */}
            <button
              type="button"
              onClick={watchlist.toggleWatchlist}
              disabled={watchlist.isUpdating}
              aria-label={
                watchlist.isSaved
                  ? `Remove ${title} from Watchlist`
                  : `Add ${title} to Watchlist`
              }
              className={cn(
                "inline-flex h-11 sm:h-12 items-center gap-2 rounded-xl px-4 sm:px-5 text-sm font-semibold transition-all duration-200 backdrop-blur-md active:scale-95 outline-none",
                watchlist.isSaved
                  ? "border border-[#C51F3A] bg-[#C51F3A]/20 text-[#ff4a68] hover:bg-[#C51F3A]/30"
                  : "border border-white/15 bg-white/[0.08] text-zinc-300 hover:bg-white/[0.16] hover:text-white",
                "focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
              )}
            >
              {watchlist.isSaved ? (
                <>
                  <Check className="size-4 text-[#ff4a68]" />
                  <span>In Watchlist</span>
                </>
              ) : (
                <>
                  <Bookmark className="size-4" />
                  <span>Watchlist</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Carousel Bottom Controls */}
        {items.length > 1 ? (
          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4 sm:pt-5">
            {/* Slide Indicators */}
            <div className="flex items-center gap-1.5">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Slide ${i + 1}: ${displayTitle(item.title)}`}
                  aria-current={i === index}
                  onClick={() => onSelectIndex(i)}
                  className="group/dot relative h-6 px-1 flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A] rounded-md"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-300 ease-out",
                      i === index
                        ? "w-8 bg-[#C51F3A] shadow-sm shadow-[#C51F3A]/50"
                        : "w-2.5 bg-white/20 group-hover/dot:bg-white/40",
                    )}
                  />
                </button>
              ))}
            </div>

            {/* Prev / Next Navigation Arrows */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous featured anime"
                onClick={onPrev}
                className={cn(
                  "flex size-9 sm:size-10 items-center justify-center rounded-xl",
                  "border border-white/10 bg-[#16161c]/80 text-zinc-300 backdrop-blur-md",
                  "transition-all duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                )}
              >
                <ChevronLeft className="size-4 sm:size-5" />
              </button>
              <button
                type="button"
                aria-label="Next featured anime"
                onClick={onNext}
                className={cn(
                  "flex size-9 sm:size-10 items-center justify-center rounded-xl",
                  "border border-white/10 bg-[#16161c]/80 text-zinc-300 backdrop-blur-md",
                  "transition-all duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                )}
              >
                <ChevronRight className="size-4 sm:size-5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl md:rounded-3xl",
        "border border-white/[0.08] bg-[#101014]",
        "min-h-[460px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[620px]",
      )}
    >
      <div className="absolute inset-0 bg-[#16161c] animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#101014] via-[#101014]/80 to-transparent" />
      <div className="relative z-10 flex min-h-[460px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[620px] flex-col justify-end p-6 sm:p-10 md:p-14 lg:p-16">
        <div className="max-w-2xl flex flex-col gap-4">
          <div className="h-6 w-36 rounded-full bg-white/10 animate-pulse" />
          <div className="h-10 sm:h-14 w-4/5 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-4 w-full rounded bg-white/10 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          <div className="mt-4 flex gap-3">
            <div className="h-12 w-36 rounded-xl bg-[#C51F3A]/40 animate-pulse" />
            <div className="h-12 w-28 rounded-xl bg-white/10 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

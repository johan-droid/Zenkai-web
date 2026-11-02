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
        "relative w-full overflow-hidden rounded-xl border border-white/[0.08] bg-surface-1",
        "min-h-[clamp(390px,62dvh,560px)]",
      )}
    >
      {/* Background Cinematic Art with Smooth Transitions */}
      <div className="absolute inset-0 size-full overflow-hidden">
        {art || coverUrl ? (
          <picture>
            {/* Phones get the portrait key art (sharper, more editorial);
                wider screens use the cinematic banner when one exists. */}
            {art && art !== coverUrl ? (
              <source media="(min-width: 768px)" srcSet={art} />
            ) : null}
            <img
              key={active.id}
              src={coverUrl ?? art ?? undefined}
              alt=""
              referrerPolicy="no-referrer"
              fetchPriority="high"
              onError={(e) => {
                if (art && e.currentTarget.src !== art) {
                  e.currentTarget.src = art;
                }
              }}
              className="size-full object-cover object-[center_22%] md:object-[center_25%]"
            />
          </picture>
        ) : (
          <div className="size-full bg-surface-2" />
        )}

        {/* Two local gradients only: legibility at the bottom, breathing room on wide screens. */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/80 to-surface-0/5" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-surface-0 via-surface-0/45 to-transparent md:block" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex min-h-[clamp(390px,62dvh,560px)] flex-col justify-end px-5 pb-5 pt-20 sm:px-8 sm:pb-8 sm:pt-24 md:px-12 md:pb-9 lg:px-14">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Editorial kicker instead of a pile of pills. */}
          <p className="flex items-center gap-2.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.18em] text-signal">
            <span className="h-px w-6 bg-signal/70" aria-hidden="true" />
            Featured · {String(index + 1).padStart(2, "0")}
          </p>

          <h1 className="mt-3 text-balance text-[clamp(1.65rem,6.2vw,3.25rem)] font-black leading-[1.04] tracking-[-0.035em] text-white">
            {title}
          </h1>

          {/* Facts on one line; artwork stays dominant. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.72rem] font-medium text-ink-2">
            {[
              active.format && active.format !== "UNKNOWN" ? active.format : null,
              seasonText,
              epInfoBadge,
              active.status && active.status !== "UNKNOWN"
                ? active.status.replaceAll("_", " ")
                : null,
            ]
              .filter(Boolean)
              .map((fact, i) => (
                <span key={`${fact}-${i}`} className="flex items-center gap-2.5">
                  {i > 0 ? (
                    <span className="text-ink-3/50" aria-hidden="true">
                      /
                    </span>
                  ) : null}
                  <span>{fact}</span>
                </span>
              ))}
            {score ? (
              <span className="flex items-center gap-1">
                <span className="px-1 text-ink-3/50" aria-hidden="true">
                  /
                </span>
                <Star className="size-3 fill-signal text-signal" aria-hidden="true" />
                {score}
              </span>
            ) : null}
          </div>

          {genres.length ? (
            <p className="mt-1.5 truncate text-[0.7rem] tracking-wide text-ink-3">
              {genres.join("  ·  ")}
            </p>
          ) : null}

          {active.description ? (
            <p className="mt-2.5 line-clamp-2 max-w-lg text-[0.8rem] leading-relaxed text-ink-2">
              {sanitizeSynopsis(active.description)}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-2.5">
            <Link
              href={watchUrl}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-signal px-5 text-sm font-bold text-white",
                "transition-colors duration-150 hover:bg-signal-hover",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              )}
            >
              <Play className="size-4 fill-white" aria-hidden="true" />
              <span>{watchLabel}</span>
            </Link>

            <Link
              href={mediaHref(active)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/20 px-4 text-sm font-semibold text-ink-1",
                "transition-colors duration-150 hover:border-white/40 hover:bg-white/[0.06]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
              )}
            >
              <Info className="size-4" aria-hidden="true" />
              <span>Details</span>
            </Link>

            <button
              type="button"
              onClick={watchlist.toggleWatchlist}
              disabled={watchlist.isUpdating}
              aria-pressed={watchlist.isSaved}
              aria-label={
                watchlist.isSaved
                  ? `Remove ${title} from Watchlist`
                  : `Add ${title} to Watchlist`
              }
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-md border transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                watchlist.isSaved
                  ? "border-signal/60 bg-signal/15 text-signal-soft"
                  : "border-white/20 text-ink-2 hover:border-white/40 hover:text-ink-1",
              )}
            >
              {watchlist.isSaved ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Bookmark className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Minimal carousel chrome: position counter, bars on wide screens, arrows. */}
        {items.length > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-2">
            <span className="font-mono text-[0.65rem] tracking-[0.16em] text-ink-3 tabular-nums">
              <span className="text-ink-1">{String(index + 1).padStart(2, "0")}</span>
              <span className="px-1.5">/</span>
              {String(items.length).padStart(2, "0")}
            </span>

            <div className="hidden items-center gap-0.5 sm:flex">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Slide ${i + 1}: ${displayTitle(item.title)}`}
                  aria-current={i === index}
                  onClick={() => onSelectIndex(i)}
                  className="group/dot flex h-11 items-center rounded-md px-1 outline-none focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <span
                    className={cn(
                      "block h-0.5 rounded-full transition-all duration-300 ease-out",
                      i === index
                        ? "w-6 bg-signal"
                        : "w-2.5 bg-white/25 group-hover/dot:bg-white/50",
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous featured anime"
                onClick={onPrev}
                className="flex size-11 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-signal"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next featured anime"
                onClick={onNext}
                className="flex size-11 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-signal"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
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

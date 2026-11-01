"use client";

import { Info, Play, Star, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/hooks/use-progress";
import type { MediaSummary } from "@/lib/media";
import {
  displayTitle,
  formatScore,
  mediaHref,
  seasonLabel,
  sanitizeSynopsis,
  resolveEpisodeCounts,
} from "@/lib/media";
import { cleanImageUrl } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

export function HeroCarousel({
  items,
  isLoading,
}: {
  items: MediaSummary[];
  isLoading?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const animeProgress = useContinueWatching("anime");
  const mangaProgress = useContinueWatching("manga");

  if (isLoading) return <HeroSkeleton />;
  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)]!;
  const art = cleanImageUrl(active.banner) ?? cleanImageUrl(active.cover.url);

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
      ? `Continue episode ${activeContinue.unit}`
      : `Continue chapter ${activeContinue.unit}`
    : active.kind === "anime"
      ? "Watch episode 1"
      : "Start reading";

  const go = (dir: 1 | -1) => {
    setIndex((v) => (v + dir + items.length) % items.length);
  };

  const meta = [
    active.format !== "UNKNOWN" ? active.format : null,
    active.seasonYear ? String(active.seasonYear) : seasonLabel(active.season, active.seasonYear),
    epInfo.badgeLabel,
  ].filter(Boolean);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending now"
      className="relative overflow-hidden rounded-panel border border-line bg-surface-1"
    >
      <div className="grid min-h-[clamp(28rem,72svh,44rem)] grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Key art */}
        <div className="relative order-first min-h-[13rem] overflow-hidden lg:order-last lg:min-h-0">
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={active.id}
              src={art}
              alt=""
              referrerPolicy="no-referrer"
              fetchPriority={index === 0 ? "high" : "auto"}
              onError={(e) => {
                const fallback = cleanImageUrl(active.cover.url);
                if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
              }}
              className="hero-art absolute inset-0 size-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-surface-2" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-1 via-surface-1/20 to-transparent lg:bg-gradient-to-r lg:from-surface-1 lg:via-surface-1/10 lg:to-transparent" />
        </div>

        {/* Copy */}
        <div className="relative z-10 flex flex-col justify-center gap-6 p-6 sm:p-9 lg:p-12">
          <h1 className="display-head max-w-[22ch] text-ink-1">
            {displayTitle(active.title)}
          </h1>

          {active.description ? (
            <p className="lead line-clamp-2 text-ink-2 sm:line-clamp-3">
              {sanitizeSynopsis(active.description)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={watchUrl}
              className="focus-ring inline-flex h-12 items-center gap-2 rounded-control bg-signal px-6 text-sm font-semibold text-signal-ink transition-colors duration-200 hover:bg-signal-hover"
            >
              <Play className="size-4 fill-current" aria-hidden />
              {watchLabel}
            </Link>
            <Link
              href={mediaHref(active)}
              className="focus-ring inline-flex h-12 items-center gap-2 rounded-control border border-line-strong px-5 text-sm font-semibold text-ink-1 transition-colors duration-200 hover:bg-surface-2"
            >
              <Info className="size-4" aria-hidden />
              Details
            </Link>
          </div>

          <div className="meta-row">
            {meta.map((entry) => (
              <span key={entry} className="border-l border-line px-3 first:border-0 first:pl-0">
                {entry}
              </span>
            ))}
            {active.averageScore ? (
              <span className="inline-flex items-center gap-1.5 border-l border-line px-3 text-gold">
                <Star className="size-3.5 fill-current" aria-hidden />
                {formatScore(active.averageScore)}
              </span>
            ) : null}
          </div>

          {items.length > 1 ? (
            <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-5">
              <div className="flex items-center gap-1">
                {items.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Show ${displayTitle(item.title)}`}
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                    className="focus-ring grid h-6 place-items-center px-1"
                  >
                    <span
                      className={cn(
                        "block h-[3px] rounded-full transition-colors duration-200",
                        i === index ? "w-7 bg-signal" : "w-3 bg-line-strong",
                      )}
                    />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous title"
                  onClick={() => go(-1)}
                  className="focus-ring grid size-10 place-items-center rounded-control border border-line text-ink-2 transition-colors duration-200 hover:border-line-strong hover:text-ink-1"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next title"
                  onClick={() => go(1)}
                  className="focus-ring grid size-10 place-items-center rounded-control border border-line text-ink-2 transition-colors duration-200 hover:border-line-strong hover:text-ink-1"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="grid min-h-[clamp(28rem,72svh,44rem)] grid-cols-1 overflow-hidden rounded-panel border border-line bg-surface-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col justify-center gap-5 p-6 sm:p-9 lg:p-12">
        <div className="skeleton-shimmer h-12 w-4/5 rounded-md" />
        <div className="skeleton-shimmer h-4 w-full max-w-[38ch] rounded" />
        <div className="skeleton-shimmer h-4 w-3/4 max-w-[30ch] rounded" />
        <div className="flex gap-3 pt-2">
          <div className="skeleton-shimmer h-12 w-44 rounded-control" />
          <div className="skeleton-shimmer h-12 w-28 rounded-control" />
        </div>
      </div>
      <div className="skeleton-shimmer order-first min-h-[13rem] lg:order-last" />
    </div>
  );
}

"use client";

import { Bookmark, Play, Star } from "lucide-react";
import Link from "next/link";
import { useWatchlistEntry } from "@/hooks/use-watchlist";
import { cleanImageUrl } from "@/lib/api/zenkai";
import {
  displayTitle,
  formatScore,
  mediaHref,
  resolveEpisodeCounts,
  type MediaSummary,
} from "@/lib/media";
import { cn } from "@/lib/utils";

export interface MediaCardProps {
  media: MediaSummary;
  className?: string;
  priority?: boolean;
  index?: number;
  rank?: number;
}

export function MediaCard({
  media,
  className,
  priority = false,
  rank,
}: MediaCardProps) {
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);
  const epInfo = resolveEpisodeCounts({
    format: media.format,
    status: media.status,
    episodes: media.episodes,
    totalEpisodes: media.episodes,
    chapters: media.chapters,
  });

  const detailUrl = mediaHref(media);
  const playUrl =
    media.kind === "anime"
      ? `/watch/${media.id}/1`
      : `/read/${media.id}/1`;

  const coverUrl = cleanImageUrl(media.cover.url);

  const watchlist = useWatchlistEntry(
    media.kind === "anime" ? "anime" : "manga",
    media.id,
    title,
    coverUrl,
  );

  return (
    <div
      className={cn(
        "group/card relative flex flex-col select-none outline-none",
        className,
      )}
    >
      {/* Poster art container */}
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-xl",
          "border border-white/[0.08] bg-[#16161c] transition-all duration-300 ease-out",
          "group-hover/card:scale-[1.03] group-hover/card:border-white/20 group-hover/card:shadow-xl group-hover/card:shadow-black/60",
        )}
      >
        {/* Cover image */}
        {coverUrl && !coverUrl.startsWith("file:") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 bg-[#1e1e26]"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        {/* Cinematic gradient overlays */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#101014] via-[#101014]/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#101014]/70 to-transparent" />

        {/* Clickable base surface linking to detail page */}
        <Link
          href={detailUrl}
          className="absolute inset-0 z-0 focus:outline-none"
          aria-label={title}
          tabIndex={-1}
        />

        {/* Top Badges & Actions */}
        <div className="pointer-events-none relative z-10 flex items-start justify-between gap-1.5 p-2">
          {/* Left badge: Rank or Format/Episodes */}
          <div className="flex items-center gap-1.5">
            {typeof rank === "number" ? (
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[0.65rem] font-black tracking-wider uppercase backdrop-blur-md shadow-sm",
                  rank === 1
                    ? "bg-gradient-to-br from-[#C51F3A] to-[#E02E4D] text-white shadow-[#C51F3A]/40"
                    : rank === 2
                      ? "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-950 font-extrabold"
                      : rank === 3
                        ? "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-50 font-extrabold"
                        : "bg-[#101014]/85 text-zinc-300 border border-white/10 font-bold",
                )}
              >
                #{rank}
              </span>
            ) : null}

            <span className="rounded-md border border-white/10 bg-[#101014]/80 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wide text-zinc-300 backdrop-blur-md">
              {media.kind === "anime"
                ? epInfo.badgeLabel
                : media.kind === "novel"
                  ? "NOVEL"
                  : "MANGA"}
            </span>
          </div>

          {/* Right badges: Score & Watchlist Button */}
          <div className="pointer-events-auto flex items-center gap-1">
            {score ? (
              <span className="flex items-center gap-1 rounded-md border border-white/10 bg-[#101014]/80 px-1.5 py-0.5 text-[0.58rem] font-semibold text-[#f5c518] backdrop-blur-md">
                <Star className="size-2.5 fill-[#f5c518] text-[#f5c518]" />
                {score}
              </span>
            ) : null}

            {/* Watchlist Bookmark Button */}
            <button
              type="button"
              onClick={watchlist.toggleWatchlist}
              disabled={watchlist.isUpdating}
              aria-label={
                watchlist.isSaved
                  ? `Remove ${title} from Watchlist`
                  : `Save ${title} to Watchlist`
              }
              title={watchlist.isSaved ? "Saved in Watchlist" : "Add to Watchlist"}
              className={cn(
                "flex size-6 items-center justify-center rounded-md border transition-all duration-200 backdrop-blur-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                watchlist.isSaved
                  ? "border-[#C51F3A] bg-[#C51F3A] text-white shadow-md shadow-[#C51F3A]/40"
                  : "border-white/10 bg-[#101014]/80 text-zinc-400 hover:border-white/30 hover:bg-[#1e1e26] hover:text-white sm:opacity-0 sm:group-hover/card:opacity-100",
              )}
            >
              <Bookmark
                className={cn(
                  "size-3",
                  watchlist.isSaved ? "fill-white" : "fill-none",
                )}
              />
            </button>
          </div>
        </div>

        {/* Desktop Quick Play Overlay */}
        <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover/card:opacity-100 sm:flex">
          <Link
            href={playUrl}
            aria-label={`Play ${title}`}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-[#C51F3A] text-white shadow-lg shadow-[#C51F3A]/50 transition-transform duration-200 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Play className="ml-0.5 size-5 fill-white" />
          </Link>
        </div>

        {/* Inset highlight top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* Title & Metadata */}
      <Link
        href={detailUrl}
        className="mt-2.5 block focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C51F3A] rounded-md"
        aria-label={title}
      >
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-200 transition-colors duration-200 group-hover/card:text-white">
          {title}
        </p>
        <p className="mt-0.5 text-[0.63rem] font-medium text-zinc-400/90">
          {[
            media.format !== "UNKNOWN" ? media.format : null,
            media.seasonYear,
            media.kind === "anime" && media.episodes
              ? `${media.episodes} EP`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Link>
    </div>
  );
}

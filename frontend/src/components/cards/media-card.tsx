"use client";

import { Bookmark, Check, Play, Star } from "lucide-react";
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

  const metaText = [
    media.format !== "UNKNOWN" ? media.format : null,
    media.seasonYear,
    media.kind === "anime" && media.episodes
      ? `${media.episodes} EP`
      : media.chapters
      ? `${media.chapters} CH`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          "border border-white/[0.08] bg-[#121218]",
          "transition-all duration-300 ease-out",
          "group-hover/card:border-white/20 group-hover/card:shadow-xl group-hover/card:shadow-black/70",
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
            className="absolute inset-0 bg-[#15151e]"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        {/* Cinematic gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0e]/90 via-[#0a0a0e]/20 to-transparent" />

        {/* Top badges: Rank on left, Score or Watchlist on right */}
        <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1 pointer-events-none">
          {typeof rank === "number" ? (
            <span className="flex items-center gap-0.5 rounded-md border border-[#C51F3A]/40 bg-[#C51F3A]/90 px-1.5 py-0.5 text-[0.62rem] font-black text-white shadow-md shadow-[#C51F3A]/30 backdrop-blur-md">
              #{rank}
            </span>
          ) : media.format && media.format !== "UNKNOWN" ? (
            <span className="rounded-md border border-white/10 bg-[#0e0e13]/80 px-1.5 py-0.5 text-[0.58rem] font-semibold text-zinc-300 backdrop-blur-md">
              {media.format}
            </span>
          ) : (
            <span />
          )}

          {score ? (
            <span className="flex items-center gap-0.5 rounded-md border border-amber-400/20 bg-[#0e0e13]/85 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-400 backdrop-blur-md">
              <Star className="size-2.5 fill-amber-400 text-amber-400" />
              {score}
            </span>
          ) : null}
        </div>

        {/* Interactive Watchlist Quick-Button (appears on hover on desktop, always visible if saved) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            watchlist.toggleWatchlist();
          }}
          disabled={watchlist.isUpdating}
          aria-label={
            watchlist.isSaved
              ? `Remove ${title} from Watchlist`
              : `Add ${title} to Watchlist`
          }
          className={cn(
            "absolute bottom-2 right-2 z-20 flex size-7 items-center justify-center rounded-lg border backdrop-blur-md transition-all duration-200 outline-none",
            watchlist.isSaved
              ? "border-[#C51F3A] bg-[#C51F3A] text-white opacity-100 shadow-md shadow-[#C51F3A]/40"
              : "border-white/15 bg-black/60 text-zinc-300 opacity-0 group-hover/card:opacity-100 hover:scale-110 hover:border-white/30 hover:text-white",
            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
          )}
        >
          {watchlist.isSaved ? (
            <Check className="size-3.5" />
          ) : (
            <Bookmark className="size-3.5" />
          )}
        </button>

        {/* Play Action Overlay (Hover on Desktop) */}
        <Link
          href={playUrl}
          aria-label={`Play ${title}`}
          className="absolute inset-0 z-10 hidden sm:flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-200"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-[#C51F3A] text-white shadow-xl shadow-[#C51F3A]/50 transition-transform duration-200 hover:scale-110 active:scale-95">
            <Play className="size-5 fill-white ml-0.5" />
          </span>
        </Link>

        {/* Full-card link to Detail page */}
        <Link
          href={detailUrl}
          className="absolute inset-0 z-0 focus:outline-none"
          aria-label={title}
          tabIndex={-1}
        />
      </div>

      {/* Title & Metadata info section */}
      <Link
        href={detailUrl}
        className="mt-2 flex flex-col focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C51F3A] rounded-md"
        aria-label={title}
      >
        <span className="line-clamp-1 text-xs font-semibold leading-snug text-zinc-200 transition-colors duration-150 group-hover/card:text-[#ff4a68]">
          {title}
        </span>
        {metaText ? (
          <span className="mt-0.5 line-clamp-1 text-[0.62rem] font-medium text-zinc-400/80">
            {metaText}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

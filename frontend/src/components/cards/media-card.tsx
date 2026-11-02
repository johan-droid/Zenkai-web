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
          "relative aspect-[2/3] w-full overflow-hidden rounded-lg border-b border-white/[0.05] bg-[#15151e]"
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
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out"
          />
        ) : (
          <div
            className="absolute inset-0 bg-[#15151e]"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        {/* Subtle bottom accent bar for depth */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-t from-[#15151e] via-transparent to-transparent"
        />

        {/* Clickable base surface linking to detail page */}
        <Link
          href={detailUrl}
          className="absolute inset-0 z-0 focus:outline-none"
          aria-label={title}
          tabIndex={-1}
        />
      </div>

      {/* Essential info overlay – rank on left, title on right */}
      <div
        className="pointer-events-none relative z-10 flex items-start gap-2 p-1.5"
      >
        {/* Rank badge (when present) */}
        {typeof rank === "number" ? (
          <span
            className="rounded-xs border border-white/10 bg-white/5 p-0.5 text-[0.5rem] font-medium text-zinc-300"
          >
            #{rank}</span>
        ) : null}

        {/* Title, always visible and readable */}
        <span
          className="text-sm font-medium text-zinc-200 truncate"
        >
          {title}</span>
      </div>

      {/* Inline play button – visible on hover, not permanent */}
      <div
        className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        <Link
          href={playUrl}
          aria-label={`Play ${title}`}
          className="rounded-full bg-[#C51F3A] text-white px-2.5 py-1.5 text-sm font-medium transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Play className="size-4 ml-1" />
        </Link>
      </div>

      {/* Title & Metadata link */}
      <Link
        href={detailUrl}
        className="mt-2 block focus:outline-none focus-visible:ring-1 focus-visible:ring-signal text-sm font-medium"
        aria-label={title}
      >
        <p className="line-clamp-1 text-xs font-semibold leading-snug text-zinc-200 transition-colors duration-150">
          {title}</p>
        <p className="mt-0.5 text-[0.6rem] font-medium text-zinc-400/60">
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

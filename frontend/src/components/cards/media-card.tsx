"use client";

import { Bookmark, Check, Play, Star } from "lucide-react";
import Link from "next/link";
import { useWatchlistEntry } from "@/hooks/use-watchlist";
import { cleanImageUrl } from "@/lib/api/zenkai";
import {
  displayTitle,
  formatScore,
  mediaHref,
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

/**
 * Catalogue card.
 *
 * Artwork carries the card: no format/score/rank stickers are laid over the
 * poster. Rank is set as an editorial numeral beside the artwork (used by the
 * ranked rail), and metadata sits under the title where it can be read
 * without competing with the image.
 */
export function MediaCard({
  media,
  className,
  priority = false,
  rank,
}: MediaCardProps) {
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);

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
    media.kind === "anime" && media.episodes
      ? `${media.episodes} EP`
      : media.chapters
        ? `${media.chapters} CH`
        : null,
    media.seasonYear,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "group/card relative flex min-w-0 select-none flex-col",
        className,
      )}
    >
      <div className={cn("relative flex items-end", typeof rank === "number" && "gap-2")}>
        {typeof rank === "number" ? (
          <span
            aria-hidden="true"
            className="w-5 shrink-0 pb-0.5 text-right text-[1.65rem] font-black leading-none tracking-tighter text-ink-3/50 tabular-nums transition-colors duration-200 group-hover/card:text-signal/80"
          >
            {String(rank).padStart(2, "0")}
          </span>
        ) : null}

        <div
          className={cn(
            "relative aspect-[2/3] min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2",
            "ring-1 ring-white/[0.06] transition-[box-shadow,transform] duration-300 ease-out",
            "group-hover/card:ring-white/20",
          )}
        >
          {coverUrl && !coverUrl.startsWith("file:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={title}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03]"
            />
          ) : (
            <div
              className="absolute inset-0 bg-surface-2"
              style={{ backgroundColor: media.cover.color ?? undefined }}
            />
          )}

          {/* Detail link covers the whole poster; the play affordance sits above it. */}
          <Link
            href={detailUrl}
            className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            aria-label={title}
          />

          <Link
            href={playUrl}
            aria-label={`Play ${title}`}
            className={cn(
              "absolute inset-0 z-20 hidden items-center justify-center bg-black/25 opacity-0",
              "transition-opacity duration-200 group-hover/card:opacity-100 group-focus-within/card:opacity-100 sm:flex",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-signal text-white shadow-lg shadow-black/40">
              <Play className="ml-0.5 size-5 fill-white" />
            </span>
          </Link>
        </div>
      </div>

      {/* Caption */}
      <div className="mt-2 flex min-w-0 flex-col">
        <Link
          href={detailUrl}
          className="line-clamp-2 text-[0.8rem] font-semibold leading-[1.3] text-ink-1 transition-colors duration-150 group-hover/card:text-signal-soft focus-visible:outline-none focus-visible:underline"
        >
          {title}
        </Link>

        <div className="mt-1 flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium text-ink-3">
            {metaText}
          </span>
          {score ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[0.68rem] font-semibold text-ink-2 tabular-nums">
              <Star className="size-2.5 fill-current text-signal" aria-hidden="true" />
              {score}
            </span>
          ) : null}
          <button
            type="button"
            onClick={watchlist.toggleWatchlist}
            disabled={watchlist.isUpdating}
            aria-label={
              watchlist.isSaved
                ? `Remove ${title} from Watchlist`
                : `Add ${title} to Watchlist`
            }
            aria-pressed={watchlist.isSaved}
            className={cn(
              "relative -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150",
              "after:absolute after:-inset-1.5 after:content-['']",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal",
              watchlist.isSaved
                ? "text-signal"
                : "text-ink-3 hover:text-ink-1 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100",
            )}
          >
            {watchlist.isSaved ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Bookmark className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

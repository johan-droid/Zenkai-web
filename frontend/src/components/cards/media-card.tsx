"use client";

import { Play, Star } from "lucide-react";
import Link from "next/link";
import { displayTitle, formatScore, mediaHref, resolveEpisodeCounts, type MediaSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

export function MediaCard({
  media,
  className,
  priority = false,
  index = 0,
}: {
  media: MediaSummary;
  className?: string;
  priority?: boolean;
  index?: number;
}) {
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);
  const epInfo = resolveEpisodeCounts({
    format: media.format,
    status: media.status,
    episodes: media.episodes,
    totalEpisodes: media.episodes,
  });

  return (
    <Link
      href={mediaHref(media)}
      className={cn("group/card block outline-none select-none", className)}
      aria-label={title}
    >
      <div
        className={cn(
          "relative flex flex-col justify-between aspect-[2/3] overflow-hidden rounded-xl",
          "bg-surface-1 border border-line",
        )}
      >
        {/* Cover image */}
        {media.cover.url && !media.cover.url.startsWith("file:") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.cover.url}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 bg-surface-2"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        {/* Matte gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-2 via-surface-1/20 to-transparent" />

        {/* Top shadow for badge readability */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-surface-1/50 to-transparent" />

        {/* Top badges */}
        <div className="relative z-10 flex items-start justify-between gap-2 p-2">
          <span className="rounded-md border border-line/10 bg-surface-2/80 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wide text-ink-2 backdrop-blur-sm">
            {media.kind === "anime" ? epInfo.badgeLabel : media.kind === "novel" ? "NOVEL" : "MANGA"}
          </span>
          {score ? (
            <span className="flex items-center gap-1 rounded-md border border-line/10 bg-surface-2/80 px-1.5 py-0.5 text-[0.58rem] font-semibold text-gold backdrop-blur-sm">
              <Star className="size-2.5 fill-gold text-gold" />
              {score}
            </span>
          ) : null}
        </div>

        {/* Bottom info */}
        <div className="relative z-10 mt-auto flex flex-col gap-0.5 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink-2">
            {title}
          </p>
          <p className="text-[0.63rem] font-medium text-ink-3/90">
            {[
              media.format !== "UNKNOWN" ? media.format : null,
              media.seasonYear,
              media.kind === "anime" && media.episodes ? `${media.episodes} EP` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Inset highlight top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      </div>
    </Link>
  );
}
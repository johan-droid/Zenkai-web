"use client";

import { Play, Star } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { displayTitle, formatScore, mediaHref, type MediaSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

export function MediaCard({
  media,
  className,
  priority = false,
}: {
  media: MediaSummary;
  className?: string;
  priority?: boolean;
}) {
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);

  return (
    <Link
      href={mediaHref(media)}
      className={cn("group/card block outline-none select-none", className)}
      aria-label={title}
    >
      <div className="relative flex flex-col justify-between aspect-[2/3] overflow-hidden rounded-xl border border-white/[0.08] bg-[#07070a]/95 transition-all duration-300 group-hover/card:border-[#c8102e]/60 group-hover/card:shadow-[0_8px_25px_rgba(200,16,46,0.15)] group-focus-visible/card:ring-2 group-focus-visible/card:ring-[#c8102e]">
        {media.cover.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.cover.url}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover transition-transform duration-300 ease-out group-hover/card:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#c8102e]/20 to-background"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />

        <div className="relative z-10 flex items-start justify-between gap-2 p-2">
          <Badge className="rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-white">
            {media.kind === "anime" ? "ANIME" : "MANGA"}
          </Badge>
          {score ? (
            <Badge className="gap-1 rounded-md border border-amber-400/20 bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-300">
              <Star className="size-2.5 fill-amber-400 text-amber-400" />
              {score}
            </Badge>
          ) : null}
        </div>

        <span
          aria-hidden
          className="absolute bottom-12 right-2 z-10 grid size-9 translate-y-1 place-items-center rounded-full bg-[#c8102e] text-white opacity-0 shadow-lg transition-all duration-200 group-hover/card:translate-y-0 group-hover/card:opacity-100"
        >
          <Play className="ml-0.5 size-3.5 fill-current" />
        </span>

        <div className="relative z-10 mt-auto flex flex-col gap-0.5 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold text-white">
            {title}
          </p>
          <p className="text-[0.65rem] font-medium text-zinc-400">
            {[media.format !== "UNKNOWN" ? media.format : null, media.seasonYear]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
    </Link>
  );
}

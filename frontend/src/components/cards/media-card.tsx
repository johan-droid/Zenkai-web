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
      className={cn("group/card block outline-none", className)}
      aria-label={title}
    >
      <div className="glass-panel relative aspect-[2/3] overflow-hidden rounded-2xl transition-transform duration-300 group-hover/card:-translate-y-1 group-focus-visible/card:ring-3 group-focus-visible/card:ring-ring">
        {media.cover.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.cover.url}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/card:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-brand-700/40 to-background"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-80 transition-opacity group-hover/card:opacity-95" />

        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <Badge className="glass rounded-lg border-glass-border text-[0.65rem] font-medium tracking-wide">
            {media.kind === "anime" ? "ANIME" : "MANGA"}
          </Badge>
          {score ? (
            <Badge className="glass gap-1 rounded-lg border-glass-border text-[0.65rem]">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {score}
            </Badge>
          ) : null}
        </div>

        <span className="glass absolute bottom-2 left-2 grid size-9 translate-y-2 place-items-center rounded-full opacity-0 transition-all duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100">
          <Play className="size-4 fill-current" />
        </span>

        <div className="absolute inset-x-3 bottom-3 flex flex-col gap-0.5">
          <p className="line-clamp-2 text-sm font-semibold text-white drop-shadow">{title}</p>
          <p className="text-[0.7rem] text-white/70">
            {[media.format !== "UNKNOWN" ? media.format : null, media.seasonYear]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
    </Link>
  );
}

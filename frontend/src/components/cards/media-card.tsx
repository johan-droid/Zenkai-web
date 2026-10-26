"use client";

import { Play, Star } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

import { displayTitle, formatScore, mediaHref, type MediaSummary } from "@/lib/media";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: Math.min(index * 0.06, 0.5),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href={mediaHref(media)}
        className={cn("group/card block outline-none select-none", className)}
        aria-label={title}
      >
        <div
          className={cn(
            "relative flex flex-col justify-between aspect-[2/3] overflow-hidden rounded-xl",
            "bg-[#0b0b0f] border border-white/[0.06]",
            "transition-all duration-350 ease-out",
            "group-hover/card:border-[#b8102a]/45",
            "group-hover/card:shadow-[0_16px_40px_rgba(0,0,0,0.9),0_4px_16px_rgba(184,16,42,0.18)]",
            "group-hover/card:-translate-y-1",
            "group-focus-visible/card:ring-2 group-focus-visible/card:ring-[#b8102a]/70",
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
              className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.06]"
            />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#b8102a]/18 to-background"
              style={{ backgroundColor: media.cover.color ?? undefined }}
            />
          )}

          {/* Matte gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/18 to-transparent" />
          {/* Top shadow for badge readability */}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />

          {/* Hover reveal — frosted overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover/card:opacity-100" />

          {/* Top badges */}
          <div className="relative z-10 flex items-start justify-between gap-2 p-2">
            <span className="rounded-md border border-white/[0.08] bg-black/65 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wider text-white/85 backdrop-blur-sm">
              {media.kind === "anime" ? "ANIME" : media.kind === "novel" ? "NOVEL" : "MANGA"}
            </span>
            {score ? (
              <span className="flex items-center gap-1 rounded-md border border-amber-400/20 bg-black/65 px-1.5 py-0.5 text-[0.58rem] font-semibold text-amber-300 backdrop-blur-sm">
                <Star className="size-2.5 fill-amber-400 text-amber-400" />
                {score}
              </span>
            ) : null}
          </div>

          {/* Centered play button on hover */}
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-all duration-250 group-hover/card:opacity-100">
            <span className="grid size-10 place-items-center rounded-full bg-[#b8102a] text-white shadow-[0_4px_24px_rgba(184,16,42,0.6)] ring-2 ring-white/20 transition-transform duration-200 group-hover/card:scale-110">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </div>

          {/* Bottom info */}
          <div className="relative z-10 mt-auto flex flex-col gap-0.5 p-2.5">
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
              {title}
            </p>
            <p className="text-[0.63rem] font-medium text-zinc-400/90">
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
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
        </div>
      </Link>
    </motion.div>
  );
}

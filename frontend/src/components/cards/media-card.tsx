"use client";

import { motion } from "motion/react";
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
      <motion.div
        whileHover={{ y: -6, scale: 1.025 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 25 }}
        className="glass-panel relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07070a]/95 transition-colors duration-300 group-hover/card:border-[#c8102e]/60 group-hover/card:shadow-[0_16px_40px_rgba(200,16,46,0.24)] group-focus-visible/card:ring-2 group-focus-visible/card:ring-[#c8102e]"
      >
        {/* Ambient specular highlight on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 bg-[radial-gradient(ellipse_at_top,_rgba(200,16,46,0.22)_0%,_transparent_70%)]"
        />

        {media.cover.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.cover.url}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-108"
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#c8102e]/30 to-background"
            style={{ backgroundColor: media.cover.color ?? undefined }}
          />
        )}

        {/* OLED deep vignette shadow gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-85 transition-opacity group-hover/card:opacity-95" />

        {/* Top Badges */}
        <div className="relative z-20 flex items-start justify-between gap-2 p-2.5">
          <Badge className="rounded-lg border border-white/10 bg-black/60 px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-white backdrop-blur-md">
            {media.kind === "anime" ? "ANIME" : "MANGA"}
          </Badge>
          {score ? (
            <Badge className="gap-1 rounded-lg border border-amber-400/20 bg-black/60 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 backdrop-blur-md">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {score}
            </Badge>
          ) : null}
        </div>

        {/* Floating Play Action Button */}
        <span
          aria-hidden
          className="absolute bottom-14 right-2.5 z-20 grid size-10 translate-y-2 scale-90 place-items-center rounded-full bg-[#c8102e] text-white opacity-0 shadow-[0_0_20px_rgba(200,16,46,0.7)] transition-all duration-300 ease-out group-hover/card:translate-y-0 group-hover/card:scale-100 group-hover/card:opacity-100"
        >
          <Play className="ml-0.5 size-4 fill-current" />
        </span>

        {/* Bottom Metadata */}
        <div className="relative z-20 mt-auto flex flex-col gap-0.5 p-3">
          <p className="line-clamp-2 text-sm font-bold text-white drop-shadow-sm transition-colors group-hover/card:text-rose-100">
            {title}
          </p>
          <p className="text-[0.7rem] font-medium text-zinc-400">
            {[media.format !== "UNKNOWN" ? media.format : null, media.seasonYear]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}

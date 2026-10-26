"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Hash } from "lucide-react";

import { useGenres } from "@/hooks/use-home";
import { cn } from "@/lib/utils";

/**
 * Genre chips, listing the genres that actually exist in the catalogue.
 *
 * Reads `GET /api/v1/genres` (database-backed) rather than a hard-coded list,
 * so a chip never links to a filter that can only return an empty page.
 */
export function GenreChips({ className }: { className?: string }) {
  const { data: genres, isLoading } = useGenres();

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-[#e84060] to-[#b8102a]" />
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Browse by Genre</h2>
      </div>

      <div className="no-scrollbar -mx-1 flex flex-wrap gap-2 px-1 pb-1">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer h-8 rounded-full"
                style={{ width: `${60 + (i % 4) * 16}px` }}
              />
            ))
          : (genres ?? []).map((genre, i) => (
              <motion.div
                key={genre}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.3,
                  delay: Math.min(i * 0.04, 0.5),
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <Link
                  href={`/anime?genre=${encodeURIComponent(genre)}`}
                  className={cn(
                    "group flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5",
                    "border border-white/[0.07] bg-white/[0.03]",
                    "text-sm font-medium text-zinc-400",
                    "backdrop-blur-sm",
                    "transition-all duration-200",
                    "hover:border-[#b8102a]/45 hover:bg-[#b8102a]/10 hover:text-white",
                    "hover:shadow-[0_4px_16px_rgba(184,16,42,0.25)]",
                  )}
                >
                  <Hash className="size-3 text-zinc-600 transition-colors duration-200 group-hover:text-[#e84060]" />
                  {genre}
                </Link>
              </motion.div>
            ))}
      </div>
    </section>
  );
}

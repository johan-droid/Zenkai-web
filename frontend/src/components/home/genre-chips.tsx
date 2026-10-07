"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { useGenres } from "@/hooks/use-home";
import { cn } from "@/lib/utils";

/**
 * Genre chips, listing the genres that actually exist in the catalogue.
 *
 * Reads `GET /api/v1/genres` (database-backed) rather than a hard-coded list,
 * so a chip never links to a filter that can only return an empty page. While
 * loading, skeleton chips hold the layout; if the API is unreachable the
 * section renders nothing — it is navigation, not content, so it never
 * invents an alternative genre list.
 */
export function GenreChips({ className }: { className?: string }) {
  const { data: genres, isLoading } = useGenres();

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Browse by genre</h2>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {isLoading
          ? Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-24 shrink-0 rounded-full" />
            ))
          : (genres ?? []).map((genre) => (
              <motion.div
                key={genre}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
              >
                <Link
                  href={`/anime?genre=${encodeURIComponent(genre)}`}
                  className="glass block shrink-0 rounded-full border border-white/[0.08] bg-black/60 px-4 py-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:border-[#c8102e]/60 hover:text-white hover:shadow-[0_4px_16px_rgba(200,16,46,0.3)] backdrop-blur-md"
                >
                  {genre}
                </Link>
              </motion.div>
            ))}
      </div>
    </section>
  );
}

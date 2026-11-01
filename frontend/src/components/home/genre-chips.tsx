"use client";

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
        <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-signal to-signal-soft" />
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
          : (genres ?? []).map((genre) => (
              <Link
                key={genre}
                href={`/anime?genre=${encodeURIComponent(genre)}`}
                className={cn(
                  "group flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5",
                  "border border-surface-2/70 bg-surface-1",
                  "text-sm font-medium text-ink-2",
                  "transition-colors duration-200",
                  "hover:border-signal/45 hover:bg-signal/10 hover:text-white",
                  "focus-ring",
                )}
              >
                <Hash className="size-3 text-ink-3/60 transition-colors duration-200 group-hover:text-signal" />
                {genre}
              </Link>
            ))}
      </div>
    </section>
  );
}
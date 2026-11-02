"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { useGenres } from "@/hooks/use-home";
import { cn } from "@/lib/utils";

/**
 * Genre discovery index.
 * Reads `GET /api/v1/genres` (database-backed) rather than a hard-coded list.
 * Presented as a scannable text index instead of a field of pill buttons.
 */
export function GenreChips({ className, index }: { className?: string; index?: number }) {
  const { data: genres, isLoading } = useGenres();

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex min-w-0 items-baseline gap-3 border-b border-white/[0.07] pb-2.5">
        {typeof index === "number" ? (
          <span className="font-mono text-[0.62rem] font-medium tracking-[0.18em] text-signal tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
        ) : null}
        <h2 className="truncate text-[1.05rem] font-bold tracking-[-0.01em] text-ink-1 sm:text-xl">
          Browse by Genre
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-x-7 sm:grid-cols-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border-b border-white/[0.06] py-3.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.07]" />
              </div>
            ))
          : (genres ?? []).map((genre) => (
              <Link
                key={genre}
                href={`/anime?genre=${encodeURIComponent(genre)}`}
                className="group flex min-h-11 items-center justify-between gap-2 border-b border-white/[0.06] text-sm text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:text-ink-1"
              >
                <span className="truncate">{genre}</span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            ))}
      </div>
    </section>
  );
}

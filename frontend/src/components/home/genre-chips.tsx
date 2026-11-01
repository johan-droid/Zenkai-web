"use client";

import Link from "next/link";
import {
  Compass,
  Flame,
  Hash,
  Heart,
  Rocket,
  Shield,
  Smile,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";

import { useGenres } from "@/hooks/use-home";
import { cn } from "@/lib/utils";

const GENRE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Action: Swords,
  Adventure: Compass,
  Comedy: Smile,
  Drama: Sparkles,
  Fantasy: Sparkles,
  Horror: Flame,
  Romance: Heart,
  "Sci-Fi": Rocket,
  Mystery: Shield,
  Supernatural: Zap,
};

/**
 * Genre discovery cards, listing the genres that actually exist in the catalogue.
 * Reads `GET /api/v1/genres` (database-backed) rather than a hard-coded list.
 */
export function GenreChips({ className }: { className?: string }) {
  const { data: genres, isLoading } = useGenres();

  return (
    <section className={cn("flex flex-col gap-3.5", className)}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#C51F3A] to-[#E02E4D] shadow-sm shadow-[#C51F3A]/40" />
        <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
          Browse by Genre
        </h2>
      </div>

      <div className="no-scrollbar -mx-1 flex flex-wrap gap-2.5 px-1 pb-1">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-xl border border-white/[0.06] bg-[#16161c] animate-pulse"
                style={{ width: `${75 + (i % 5) * 16}px` }}
              />
            ))
          : (genres ?? []).map((genre) => {
              const Icon = GENRE_ICONS[genre] ?? Hash;
              return (
                <Link
                  key={genre}
                  href={`/anime?genre=${encodeURIComponent(genre)}`}
                  className={cn(
                    "group flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold sm:text-sm",
                    "border border-white/[0.08] bg-[#16161c]/80 text-zinc-300 backdrop-blur-md",
                    "transition-all duration-200",
                    "hover:border-[#C51F3A]/50 hover:bg-[#C51F3A]/10 hover:text-white hover:scale-105 active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A]",
                  )}
                >
                  <Icon className="size-3.5 text-zinc-400 transition-colors duration-200 group-hover:text-[#ff4a68]" />
                  <span>{genre}</span>
                </Link>
              );
            })}
      </div>
    </section>
  );
}

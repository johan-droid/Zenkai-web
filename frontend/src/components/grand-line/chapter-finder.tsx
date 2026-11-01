"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Search, BookOpen, Tv, Clock, ExternalLink, X, Loader2 } from "lucide-react";
import { searchGrandLine, type GrandLineSearchResultItem } from "@/lib/api/zenkai";

export function ChapterFinder() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GrandLineSearchResultItem[]>([]);
  const [isSearching, startTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await searchGrandLine(query.trim(), 12);
          setResults(res);
          setHasSearched(true);
        } catch (err) {
          console.warn("One Pace search failed", err);
          setResults([]);
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative rounded-2xl border border-white/10 bg-zinc-900/60 p-5 backdrop-blur-md">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-white">Log Pose Navigator & Chapter Finder</h3>
            <p className="text-xs text-zinc-400">
              Find any moment by Manga Chapter (e.g. <span className="text-amber-300 font-mono">1000</span>), Anime Episode (<span className="text-amber-300 font-mono">1071</span>), or character.
            </p>
          </div>
        </div>

        {/* Input Bar */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by chapter, anime episode, arc or title..."
            className="w-full rounded-xl border border-white/10 bg-zinc-950/70 py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 rounded-md p-1 text-zinc-400 hover:text-white"
            >
              <X className="size-4" />
            </button>
          ) : isSearching ? (
            <div className="absolute right-3">
              <Loader2 className="size-4 animate-spin text-amber-400" />
            </div>
          ) : null}
        </div>

        {/* Search Results Dropdown/Grid */}
        {hasSearched && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{results.length} paced episode{results.length === 1 ? "" : "s"} found</span>
            </div>

            {results.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
                No paced episodes matched &ldquo;{query}&rdquo;. Try another chapter number or arc title.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 max-h-96 overflow-y-auto pr-1">
                {results.map(({ episode, arc }) => (
                  <Link
                    key={episode.id}
                    href={`/grand-line/${arc.id}/${episode.episodeNumber}`}
                    className="group flex flex-col justify-between rounded-xl border border-white/5 bg-zinc-950/60 p-3 transition hover:border-amber-500/30 hover:bg-zinc-900/80"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-amber-400">
                        <span className="truncate">{arc.title}</span>
                        <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                          EP {episode.episodeNumber}
                        </span>
                      </div>
                      <h4 className="mt-1 line-clamp-1 text-xs font-medium text-white group-hover:text-amber-300">
                        {episode.title}
                      </h4>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3 text-sky-400" />
                        <span>Ch. {episode.mangaChapters}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Tv className="size-3 text-emerald-400" />
                        <span>Anime {episode.animeEpisodes}</span>
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="size-3 text-zinc-500" />
                        <span>{episode.duration}</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

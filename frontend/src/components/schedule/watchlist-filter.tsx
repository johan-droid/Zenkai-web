"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LibraryRecord } from "@/lib/db/dexie";

interface WatchlistFilterProps {
  watchlistFilter: boolean;
  onWatchlistFilterChange: (enabled: boolean) => void;
}

export function WatchlistFilter({ watchlistFilter, onWatchlistFilterChange }: WatchlistFilterProps) {
  const library = useLiveQuery(() => db.library.toArray());

  const watchlistAnilistIds = useMemo(() => {
    if (!library) return new Set<string>();
    return new Set(
      library
        .filter((item: LibraryRecord) => item.kind === "anime")
        .map((item: LibraryRecord) => item.mediaId)
    );
  }, [library]);

  const hasWatchlist = watchlistAnilistIds.size > 0;

  return (
    <>
      {hasWatchlist && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={watchlistFilter}
            onChange={(e) => onWatchlistFilterChange(e.target.checked)}
            className="rounded border-white/20 text-signal focus:ring-signal"
            aria-label="Show only anime from your library"
          />
          <span className="text-sm font-medium">My Anime</span>
          {watchlistFilter && watchlistAnilistIds.size > 0 && (
            <span className="text-xs bg-signal/20 text-signal rounded-full px-2 py-0.5">
              {watchlistAnilistIds.size}
            </span>
          )}
        </label>
      )}
    </>
  );
}
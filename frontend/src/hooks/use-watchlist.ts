"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getLibraryEntry,
  removeLibraryEntry,
  saveLibraryEntry,
  type LibraryStatus,
} from "@/lib/library";

export function useWatchlistEntry(
  kind: "anime" | "manga" = "anime",
  mediaId: string,
  title?: string,
  coverUrl?: string | null,
) {
  const [isUpdating, setIsUpdating] = useState(false);

  const record = useLiveQuery(
    () => (mediaId ? getLibraryEntry(kind, mediaId) : undefined),
    [kind, mediaId],
  );

  const isSaved = Boolean(record);
  const status = record?.status ?? null;

  const toggleWatchlist = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!mediaId || isUpdating) return isSaved;

      setIsUpdating(true);
      try {
        if (isSaved) {
          await removeLibraryEntry({ kind, mediaId });
          toast.info(`Removed ${title || "title"} from Watchlist`);
          return false;
        } else {
          await saveLibraryEntry({
            kind,
            mediaId,
            title: title || mediaId,
            coverUrl: coverUrl ?? null,
            status: "plan",
          });
          toast.success(`Added ${title || "title"} to Watchlist`);
          return true;
        }
      } catch {
        toast.error("Could not update Watchlist");
        return isSaved;
      } finally {
        setIsUpdating(false);
      }
    },
    [kind, mediaId, title, coverUrl, isSaved, isUpdating],
  );

  const setStatus = useCallback(
    async (newStatus: LibraryStatus) => {
      if (!mediaId || isUpdating) return;
      setIsUpdating(true);
      try {
        await saveLibraryEntry({
          kind,
          mediaId,
          title: title || mediaId,
          coverUrl: coverUrl ?? null,
          status: newStatus,
        });
        toast.success(`Updated Watchlist status to ${newStatus}`);
      } catch {
        toast.error("Could not update Watchlist status");
      } finally {
        setIsUpdating(false);
      }
    },
    [kind, mediaId, title, coverUrl, isUpdating],
  );

  return {
    isSaved,
    status,
    isUpdating,
    toggleWatchlist,
    setStatus,
  };
}

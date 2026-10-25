"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef } from "react";

import {
  getContinueWatching,
  getProgress,
  getTitleProgress,
  saveProgress,
  type ContinueEntry,
  type SaveProgressInput,
} from "@/lib/db/progress";
import type { ProgressKind, ProgressRecord } from "@/lib/db/dexie";

/**
 * Saved progress for a single unit, live-updating.
 * `undefined` means the query has not resolved yet; `null` means no record.
 */
export function useUnitProgress(
  kind: ProgressKind,
  mediaId: string,
  unit: number,
): ProgressRecord | null | undefined {
  return useLiveQuery(
    () => getProgress(kind, mediaId, unit),
    [kind, mediaId, unit],
    undefined,
  );
}

export function useTitleProgress(
  kind: ProgressKind,
  mediaId: string,
): ProgressRecord[] | undefined {
  return useLiveQuery(
    () => getTitleProgress(kind, mediaId),
    [kind, mediaId],
    undefined,
  );
}

/** Latest unfinished unit per title, for the continue rail. */
export function useContinueWatching(kind: ProgressKind = "anime"): ContinueEntry[] | undefined {
  return useLiveQuery(() => getContinueWatching(kind), [kind]);
}

export function useHasAnyProgress(): boolean {
  const entries = useLiveQuery(() => getContinueWatching("anime", 1), []);
  return Boolean(entries && entries.length > 0);
}

/**
 * Throttled progress writer.
 *
 * `timeupdate` fires several times a second, so writes are coalesced: at most one
 * IndexedDB write per `intervalMs`, plus a final flush on unmount.
 */
export function useThrottledProgressSaver(intervalMs = 5_000, remoteSyncIntervalMs = 15_000) {
  const lastWrite = useRef(0);
  const lastRemoteWrite = useRef(0);
  const pending = useRef<SaveProgressInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncRemote = useCallback((input: SaveProgressInput) => {
    if (typeof window === "undefined") return;
    lastRemoteWrite.current = Date.now();
    import("@/lib/api/auth")
      .then(({ saveRemoteProgress }) =>
        saveRemoteProgress(input.kind, input.mediaId, input.unit, {
          positionSeconds: input.positionSeconds,
          durationSeconds: input.durationSeconds,
          page: input.page,
          totalUnits: input.totalUnits,
        }),
      )
      .catch(() => {});
  }, []);

  const flush = useCallback(async () => {
    const input = pending.current;
    if (!input) return;
    pending.current = null;
    lastWrite.current = Date.now();
    await saveProgress(input);
    syncRemote(input);
  }, [syncRemote]);

  const save = useCallback(
    (input: SaveProgressInput) => {
      const now = Date.now();
      const elapsed = now - lastWrite.current;
      const remoteElapsed = now - lastRemoteWrite.current;

      if (elapsed >= intervalMs) {
        void saveProgress(input);
        lastWrite.current = now;

        if (remoteElapsed >= remoteSyncIntervalMs) {
          syncRemote(input);
        }
        return;
      }

      pending.current = input;
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          void flush();
        }, intervalMs - elapsed);
      }
    },
    [flush, intervalMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  return save;
}

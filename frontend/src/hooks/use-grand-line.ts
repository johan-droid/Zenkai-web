"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { db, type ProgressRecord } from "@/lib/db/dexie";
import {
  fetchGrandLineSagas,
  fetchGrandLineArc,
  fetchGrandLineEpisode,
  fetchGrandLineStatus,
  triggerGrandLineSync,
  type GrandLineSaga,
  type GrandLineArc,
  type GrandLineEpisodeDetail,
  type GrandLineStatus,
} from "@/lib/api/zenkai";

const ONE_PACE_MEDIA_ID = "one-pace";

export function formatOnePaceProgressId(arcId: string, episodeNumber: string): string {
  const cleanEp = episodeNumber.padStart(2, "0");
  return `anime:${ONE_PACE_MEDIA_ID}:${arcId}-${cleanEp}`;
}

export function useGrandLineProgress() {
  const [progressRecords, setProgressRecords] = useState<ProgressRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const records = await db.progress
        .where("[kind+mediaId]")
        .equals(["anime", ONE_PACE_MEDIA_ID])
        .toArray();
      setProgressRecords(records);
    } catch (err) {
      console.warn("Failed to read One Pace progress from local database", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    db.progress
      .where("[kind+mediaId]")
      .equals(["anime", ONE_PACE_MEDIA_ID])
      .toArray()
      .then((records) => {
        if (active) {
          setProgressRecords(records);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to read One Pace progress from local database", err);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const watchedSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of progressRecords) {
      if (r.completed) {
        // extract ep key from id "anime:one-pace:arc-ep"
        const parts = r.id.split(":");
        const epKey = parts[2];
        if (epKey) {
          set.add(epKey);
        }
      }
    }
    return set;
  }, [progressRecords]);

  const isWatched = useCallback(
    (arcId: string, episodeNumber: string) => {
      const cleanEp = episodeNumber.padStart(2, "0");
      return watchedSet.has(`${arcId}-${cleanEp}`);
    },
    [watchedSet],
  );

  const toggleWatched = useCallback(
    async (
      episode: { id: string; arcId: string; episodeNumber: string; title: string },
      arcTitle?: string,
    ) => {
      const recordId = formatOnePaceProgressId(episode.arcId, episode.episodeNumber);
      const currentlyWatched = isWatched(episode.arcId, episode.episodeNumber);
      const epNum = parseInt(episode.episodeNumber, 10) || 1;

      if (currentlyWatched) {
        // Mark unwatched
        await db.progress.update(recordId, {
          completed: false,
          updatedAt: Date.now(),
        });
      } else {
        // Mark watched
        await db.progress.put({
          id: recordId,
          kind: "anime",
          mediaId: ONE_PACE_MEDIA_ID,
          title: `One Pace: ${arcTitle ? `${arcTitle} - ` : ""}${episode.title}`,
          coverUrl: null,
          unit: epNum,
          positionSeconds: 0,
          durationSeconds: null,
          totalUnits: null,
          completed: true,
          updatedAt: Date.now(),
        });
      }
      await refresh();
    },
    [isWatched, refresh],
  );

  const recordLastVisited = useCallback(
    async (
      episode: { id: string; arcId: string; episodeNumber: string; title: string },
      arcTitle?: string,
    ) => {
      const recordId = formatOnePaceProgressId(episode.arcId, episode.episodeNumber);
      const epNum = parseInt(episode.episodeNumber, 10) || 1;
      const existing = await db.progress.get(recordId);

      await db.progress.put({
        id: recordId,
        kind: "anime",
        mediaId: ONE_PACE_MEDIA_ID,
        title: `One Pace: ${arcTitle ? `${arcTitle} - ` : ""}${episode.title}`,
        coverUrl: null,
        unit: epNum,
        positionSeconds: existing?.positionSeconds ?? 0,
        durationSeconds: existing?.durationSeconds ?? null,
        totalUnits: null,
        completed: existing?.completed ?? false,
        updatedAt: Date.now(),
      });
      await refresh();
    },
    [refresh],
  );

  const lastVisited = useMemo(() => {
    if (progressRecords.length === 0) return null;
    // Sort descending by updatedAt
    const sorted = [...progressRecords].sort((a, b) => b.updatedAt - a.updatedAt);
    const mostRecent = sorted[0];
    if (!mostRecent) return null;

    const parts = mostRecent.id.split(":");
    const epKey = parts[2] || "";
    // split arc and episode: e.g. "romance-dawn-01" -> arc "romance-dawn", ep "01"
    const lastDash = epKey.lastIndexOf("-");
    const arcId = lastDash !== -1 ? epKey.slice(0, lastDash) : epKey;
    const epNum = lastDash !== -1 ? epKey.slice(lastDash + 1) : "01";

    return {
      id: epKey,
      arcId,
      episodeNumber: epNum,
      title: mostRecent.title.replace(/^One Pace:\s*/, ""),
      completed: mostRecent.completed,
      updatedAt: mostRecent.updatedAt,
    };
  }, [progressRecords]);

  return {
    loading,
    watchedCount: watchedSet.size,
    isWatched,
    toggleWatched,
    recordLastVisited,
    lastVisited,
    refresh,
  };
}

export function useGrandLineSagas() {
  const [sagas, setSagas] = useState<GrandLineSaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const data = await fetchGrandLineSagas();
        if (active) {
          setSagas(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load sagas");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { sagas, loading, error };
}

export function useGrandLineArc(arcId: string) {
  const [arc, setArc] = useState<GrandLineArc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!arcId) return;
      try {
        setLoading(true);
        const data = await fetchGrandLineArc(arcId);
        if (active) {
          setArc(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load arc");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [arcId]);

  return { arc, loading, error };
}

export function useGrandLineEpisode(arcId: string, episodeNumber: string) {
  const [detail, setDetail] = useState<GrandLineEpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!arcId || !episodeNumber) return;
      try {
        setLoading(true);
        const data = await fetchGrandLineEpisode(arcId, episodeNumber);
        if (active) {
          setDetail(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load episode");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [arcId, episodeNumber]);

  return { detail, loading, error };
}

export function useGrandLineStatus() {
  const [status, setStatus] = useState<GrandLineStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchGrandLineStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchGrandLineStatus()
      .then((data) => {
        if (active) {
          setStatus(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load catalog status");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      setSyncing(true);
      const res = await triggerGrandLineSync();
      if (res.catalog) {
        setStatus(res.catalog);
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { status: "error", synced: false, error: msg, catalog: status! };
    } finally {
      setSyncing(false);
    }
  }, [status]);

  return { status, loading, syncing, error, refreshStatus, triggerSync };
}

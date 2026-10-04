"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useThrottledProgressSaver, useUnitProgress, useTitleProgress } from "@/hooks/use-progress";
import { getMediaById } from "@/lib/api/anilist";
import { getSkipTimes } from "@/lib/api/aniskip";
import { probeCandidate, resolveCandidates } from "@/lib/sources/resolver";
import type { SourceCandidate, SourceContext } from "@/lib/sources/types";
import { getActiveSources } from "@/lib/sources/registry";
import { usePlayerStore, type PlayerState } from "@/stores/player";
import { EpisodeList } from "@/components/player/episode-list";
import { PlayerHotkeys } from "@/components/player/player-hotkeys";
import { QualityMenu } from "@/components/player/quality-menu";
import { SourceSwitcher } from "@/components/player/source-switcher";
import { VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResolverStatus = "idle" | "probing" | "ready" | "error";

export function WatchView() {
  const params = useParams();
  const router = useRouter();

  const mediaId = params.id as string;
  const epRaw = params.ep as string;
  const episode = Number(epRaw);
  const validEpisode = Number.isFinite(episode) && episode >= 1;

  // Player settings (persisted in local storage).
  const audio = usePlayerStore((s) => s.audio);
  const autoplayNext = usePlayerStore((s) => s.autoplayNext);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const autoSkip = usePlayerStore((s) => s.autoSkip);
  const theaterMode = usePlayerStore((s) => s.theaterMode);
  const preferredSourceId = usePlayerStore((s) => s.preferredSourceId);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);

  // Title metadata from AniList.
  const detail = useQuery({
    queryKey: ["watch", mediaId],
    queryFn: () => getMediaById({ id: Number(mediaId), type: "ANIME" }),
    staleTime: 10 * 60_000,
  });

  // Context for resolving a playable stream.
  const context = useMemo<SourceContext>(() => ({
    anilistId: Number(mediaId),
    malId: detail.data?.media.idMal ?? null,
    episode: episode,
  }), [mediaId, episode, detail.data?.media]);

  // Ordered candidates: remembered source first, then by config order.
  const candidates = useMemo(() => {
    const list = resolveCandidates(context);
    if (!preferredSourceId) return list;
    const preferred = list.find((item) => item.source.id === preferredSourceId);
    if (!preferred) return list;
    return [preferred, ...list.filter((item) => item.source.id !== preferredSourceId)];
  }, [context, preferredSourceId]);

  // Player-resolver state.
  const [status, setStatus] = useState<ResolverStatus>("idle");
  const [failures, setFailures] = useState<{ sourceId: string; message: string }[]>([]);
  const [currentCandidate, setCurrentCandidate] = useState<SourceCandidate | null>(null);
  const runProbe = useRef<((start?: number) => Promise<void>) | null>(null);

  const runProbeOnce = useCallback(async (start = 0) => {
    if (candidates.length === 0) {
      setStatus("error");
      setCurrentCandidate(null);
      return;
    }

    setStatus("probing");
    setFailures([]);

    for (let index = start; index < candidates.length; index++) {
      const item = candidates[index]!;
      const result = await probeCandidate(item);
      if (result.ok) {
        setCurrentCandidate(item);
        setStatus("ready");
        return;
      }
      setFailures((prev) => [...prev, { sourceId: item.source.id, message: result.message ?? "Unreachable" }]);
    }

    setCurrentCandidate(null);
    setStatus("error");
  }, [candidates]);

  runProbe.current = runProbeOnce;

  // First source is probed on mount; re-probed when the media or candidates change.
  useEffect(() => {
    const probe = () => runProbeOnce(0);
    probe();
    return () => {};
  }, []);

  useEffect(() => {
    void runProbeOnce(0);
  }, [detail.data, candidates]);

  const next = useCallback(() => {
    const index = candidates.findIndex((item) => item.source.id === currentCandidate?.source.id);
    const nextIndex = Math.max(0, index + 1);
    void runProbeOnce(nextIndex);
  }, [candidates, currentCandidate, runProbeOnce]);

  const select = useCallback(
    (item: SourceCandidate) => {
      const index = candidates.findIndex((candidate) => candidate.source.id === item.source.id);
      setCurrentCandidate(item);
      setStatus("ready");
    },
    [candidates],
  );

  // Resume position & title progress.
  const progress = useUnitProgress("anime", mediaId, episode);
  const titleProgress = useTitleProgress("anime", mediaId);

  const watchedSet = useMemo(() => {
    const set = new Set<number>();
    if (titleProgress) {
      for (const record of titleProgress) {
        if (record.completed) set.add(record.unit);
      }
    }
    return set;
  }, [titleProgress]);

  // Skip times for skip intro/outro.
  const skip = useQuery({
    queryKey: ["skip", detail.data?.media.idMal ?? mediaId, episode],
    queryFn: () => getSkipTimes(detail.data?.media.idMal ?? null, episode),
    staleTime: 15 * 60_000,
    enabled: Boolean(detail.data),
  });

  // Throttled progress writer.
  const saveProgress = useThrottledProgressSaver();

  const resumeProgress = useCallback(
    (positionSeconds: number, durationSeconds: number) => {
      if (!detail.data?.media) return;
      void saveProgress({
        kind: "anime",
        mediaId,
        title: detail.data.media.title?.english ?? detail.data.media.title?.romaji ?? mediaId,
        coverUrl: detail.data.media.coverImage?.large ?? null,
        unit: episode,
        positionSeconds,
        durationSeconds,
        totalUnits: detail.data.media.episodes ?? null,
      });
    },
    [mediaId, detail.data, episode, saveProgress],
  );

  // Keyboard shortcuts (Vidstack covers the core inputs).
  useHotkeys("t", () => {
    usePlayerStore.getState().toggleTheaterMode();
  }, { preventDefault: true });
  useHotkeys("n", () => {
    if (episode < (detail.data?.media.episodes ?? Infinity)) router.push(`/watch/${mediaId}/${episode + 1}`);
  }, { preventDefault: true });
  useHotkeys("h", () => {
    usePlayerStore.getState().setTheaterMode(false);
    router.push("/history");
  }, { preventDefault: true });

  // Render.
  // Every hook above must run on every render, so these guards live here rather
  // than at the top of the component.
  if (!validEpisode) {
    return <EmptyPlayer path={`/${mediaId}/${epRaw}`} />;
  }

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-10 w-1/3 animate-pulse rounded-2xl bg-white/5" />
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2 h-64 animate-pulse rounded-2xl bg-white/5" />
          <div className="md:col-span-3 h-40 animate-pulse rounded-2xl bg-white/5" />
        </div>
      </div>
    );
  }

  const totalEpisodes = detail.data?.media.episodes ?? null;

  if (!detail.data || !detail.data.media) {
    return (
      <EmptyPlayer
        path={`/${mediaId}/${episode}`}
        error={detail.error ? detail.error.message : "Not found"}
      />
    );
  }

  const media = detail.data.media;

  return (
    <div className={cn("flex flex-col gap-6", theaterMode ? "max-w-fit" : "max-w-6xl")}>
      <div className="flex items-center gap-2">
        <SourceSwitcher
          candidates={candidates}
          activeId={currentCandidate?.source.id ?? null}
          loading={status === "probing"}
          failures={failures}
          audio={audio}
          onSelect={select}
          onAudioChange={(value) => {
            usePlayerStore.getState().setAudio(value);
          }}
        />
        <QualityMenu rate={playbackRate} onRateChange={(rate) => {
          usePlayerStore.getState().setPlaybackRate(rate);
        }} />
        <PlayerHotkeys
          onTheater={() => {
            usePlayerStore.getState().toggleTheaterMode();
          }}
          onNext={() => {
            if (episode < (totalEpisodes ?? Infinity)) router.push(`/watch/${mediaId}/${episode + 1}`);
          }}
        />
      </div>

      <div className={cn("grid gap-6", theaterMode ? "" : "lg:grid-cols-[1fr_360px]")}>
        <div className={cn("relative", theaterMode ? "lg:col-span-2" : "")}>
          <VideoPlayer
            candidate={currentCandidate}
            title={media.title?.english ?? media.title?.romaji ?? mediaId}
            poster={media.coverImage?.large ?? null}
            initialTime={progress?.positionSeconds}
            skipTimes={skip.data ?? { opening: null, ending: null, recap: null }}
            autoSkip={autoSkip}
            playbackRate={playbackRate}
            volume={volume}
            muted={muted}
            onProgress={resumeProgress}
            onEnded={() => {
              if (autoplayNext && episode < (totalEpisodes ?? Infinity)) {
                router.push(`/watch/${mediaId}/${episode + 1}`);
              }
            }}
            onError={next}
          />
          <EpisodeList
            mediaId={mediaId}
            totalEpisodes={totalEpisodes}
            currentEpisode={episode}
            watchedEpisodes={watchedSet}
          />
        </div>

        <aside className={cn("flex flex-col gap-4", theaterMode ? "hidden md:flex" : "flex")}>
          <div className="glass-panel flex flex-col gap-3 rounded-2xl p-4">
            <h2 className="text-sm font-bold tracking-tight">Now playing</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{media.title?.english ?? media.title?.romaji ?? ""}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {media.title?.native ? `(${media.title.native})` : null}
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground">
                {media.status?.replaceAll("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{media.genres?.slice(0, 3).join(", ") ?? ""}</p>

            <div className="mt-auto flex items-center gap-3 border-t border-glass-border pt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Resume
              </span>
              {progress ? (
                <>
                  <span className="font-mono">
                    {Math.floor(progress.positionSeconds / 60)}:{(progress.positionSeconds % 60).toFixed(0).padStart(2, "0")}
                  </span>
                  <span className="text-muted-foreground">·</span>
                </>
              ) : null}
              <span className="font-mono">00:00</span>
            </div>
          </div>

          <div className="mt-auto flex flex-1 flex-col justify-between gap-3">
            <PlayerHotkeys
              onTheater={() => {
                usePlayerStore.getState().toggleTheaterMode();
              }}
              onNext={() => {
                if (episode < (totalEpisodes ?? Infinity)) router.push(`/watch/${mediaId}/${episode + 1}`);
              }}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Local progress is saved on this device.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyPlayer({ path, error }: { path: string; error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/5 px-4 py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/5">
        <svg className="size-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </span>
      <p className="text-sm text-muted-foreground">{error ?? "No playable source for this episode."}</p>
      <Button variant="outline" className="glass rounded-xl" asChild>
        <a href={`/anime/${path.split("/")[1]}`}>Back to anime</a>
      </Button>
    </div>
  );
}

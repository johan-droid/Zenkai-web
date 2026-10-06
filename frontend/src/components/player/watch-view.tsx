"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { CalendarClock, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useThrottledProgressSaver, useUnitProgress, useTitleProgress } from "@/hooks/use-progress";
import {
  animeDetailToDetailData,
  classifyDetailError,
  classifyPlaybackError,
  executePlayback,
  fallbackPlanSelection,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
  fetchEpisodeMetadata,
  fetchEpisodeNavigation,
  fetchEpisodeSources,
  initialPlanSelection,
  isUnreleased,
  planToServerOption,
  type PlaybackExecution,
} from "@/lib/api/zenkai";
import { displayTitle } from "@/lib/media";
import { usePlayerStore } from "@/stores/player";
import { EmbedPlayer } from "@/components/player/embed-player";
import { EpisodeList } from "@/components/player/episode-list";
import { PlayerHotkeys } from "@/components/player/player-hotkeys";
import { QualityMenu } from "@/components/player/quality-menu";
import { SourceSwitcher } from "@/components/player/source-switcher";
import { VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Automatic retries after a 409 `selection_stale`. Bounded at one: the second
 * stale answer is a failure the user can act on, never an invisible loop.
 */
const MAX_STALE_RETRIES = 1;

/**
 * The canonical watch surface (P14).
 *
 * Every byte comes from the Zenkai backend: the title from
 * `GET /api/v1/anime/:id`, the episode's canonical identity from the catalogue
 * at `GET /api/v1/anime/:id/episodes`, ranked sources from
 * `GET /api/v1/episodes/:id/sources`, the playable URL from
 * `POST /api/v1/playback/execute`, and skip markers from
 * `GET /api/v1/episodes/:id/metadata`. The view imports no provider client,
 * constructs no provider URL, and computes no episode arithmetic of its own.
 *
 * Addressing: the URL keeps the cross-reference id + episode number the detail
 * page links to; the canonical episode UUID is resolved internally and never
 * appears in a URL.
 */
export function WatchView({ id, episode }: { id: string; episode: string }) {
  const router = useRouter();
  const episodeNumber = Number(episode);
  const validEpisode = Number.isFinite(episodeNumber) && episodeNumber >= 1;

  // Player settings (persisted in local storage).
  const autoplayNext = usePlayerStore((s) => s.autoplayNext);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const autoSkip = usePlayerStore((s) => s.autoSkip);
  const theaterMode = usePlayerStore((s) => s.theaterMode);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const language = usePlayerStore((s) => s.audio);

  // Canonical anime for the sidebar. Uses the SAME queryFn as the detail view:
  // a shared cache key must always carry the same derived shape — a detail
  // cache entry produced with a different mapper would poison both pages
  // during soft navigation.
  const detailQuery = useQuery({
    queryKey: ["detail", "anime", id],
    queryFn: async () => animeDetailToDetailData(await fetchAnimeDetail(id)),
    staleTime: 10 * 60_000,
  });

  // Canonical catalogue: episode identity, airing states, navigation.
  const episodesQuery = useQuery({
    queryKey: ["anime-episodes", id],
    queryFn: () => fetchAnimeEpisodes(id),
    staleTime: 10 * 60_000,
  });

  const catalogue = episodesQuery.data;
  const episodeCard = useMemo(
    () => catalogue?.episodes.find((entry) => entry.episodeNumber === episodeNumber) ?? null,
    [catalogue, episodeNumber],
  );
  const unreleased = isUnreleased(episodeCard);

  // Ranked sources for the resolved canonical episode. The query is gated: an
  // unreleased episode never triggers a source request, so "not released yet"
  // can never be mistaken for "no streams".
  const sourcesQuery = useQuery({
    queryKey: ["episode-sources", episodeCard?.id, language],
    queryFn: () => fetchEpisodeSources(episodeCard!.id, language),
    enabled: Boolean(episodeCard) && !unreleased,
    staleTime: 30_000,
  });

  // Canonical previous/next — the backend knows catalogue boundaries and gaps;
  // the client never computes `episodeNumber ± 1`.
  const navigationQuery = useQuery({
    queryKey: ["episode-navigation", id, episodeNumber],
    queryFn: () => fetchEpisodeNavigation(id, episodeNumber),
    enabled: validEpisode && Boolean(catalogue),
    staleTime: 10 * 60_000,
  });

  // Skip markers from the canonical metadata service (P10) — no AniSkip call.
  const metadataQuery = useQuery({
    queryKey: ["episode-metadata", episodeCard?.id],
    queryFn: () => fetchEpisodeMetadata(episodeCard!.id),
    enabled: Boolean(episodeCard) && !unreleased,
    staleTime: 10 * 60_000,
  });

  const plans = useMemo(() => sourcesQuery.data?.plans ?? [], [sourcesQuery.data]);
  // Stable across renders, safe as an effect dependency: destructure it out of
  // the (unstable) query result object.
  const { refetch: refetchSources } = sourcesQuery;

  // The selection is derived, not stored: it is the user's override when there
  // is one, otherwise the backend's top-ranked plan. A new episode or language
  // clears the override (below), so the shelf always matches the audio asked
  // for — and because a new query key starts with no data, no stale plan is
  // ever executed during the refetch.
  const [userSelection, setUserSelection] = useState<string | null>(null);
  const selectedSourceId = userSelection ?? initialPlanSelection(plans);
  const [execution, setExecution] = useState<PlaybackExecution | null>(null);
  const [playbackFailure, setPlaybackFailure] = useState<string | null>(null);
  // Bumped exactly once (after a the first successful sources refetch), so one
  // automatic stale-selection retry happens per attempt — never an invisible loop.
  const [retryNonce, setRetryNonce] = useState(0);

  // A new episode or a language change clears the override, falling back to the
  // backend's top-ranked plan. Adjusted during render so React can re-render
  // before committing, rather than synchronising state from an effect.
  const selectionEpoch = `${episodeCard?.id ?? ""}:${language}`;
  const [lastSelectionEpoch, setLastSelectionEpoch] = useState(selectionEpoch);
  if (lastSelectionEpoch !== selectionEpoch) {
    setLastSelectionEpoch(selectionEpoch);
    setUserSelection(null);
    setRetryNonce(0);
    setExecution(null);
    setPlaybackFailure(null);
  }

  // Execute the selected canonical source. The request carries only episodeId,
  // sourceId and language — the backend re-resolves the plan and returns the
  // only playback URL the client ever sees.
  useEffect(() => {
    if (!episodeCard || !selectedSourceId) return;
    let cancelled = false;

    executePlayback({ episodeId: episodeCard.id, sourceId: selectedSourceId, language })
      .then((result) => {
        if (cancelled) return;
        setExecution(result);
        setPlaybackFailure(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure = classifyPlaybackError(error);
        if (failure === "selection_stale" && retryNonce < MAX_STALE_RETRIES) {
          // The ranked list moved under us: refresh once, then retry the new
          // top-ranked plan. The nonce carries the one-automatic-retry bound.
          void refetchSources().then(() => {
            if (cancelled) return;
            setUserSelection(null);
            setRetryNonce(1);
          });
          return;
        }
        setPlaybackFailure(failure);
      });

    return () => {
      cancelled = true;
    };
  }, [episodeCard, selectedSourceId, language, retryNonce, refetchSources]);

  // Source fallback: a plan that fails at the playback layer advances to the
  // next canonical plan — bounded by the plan list, never an endless cycle.
  const handlePlaybackError = useCallback(() => {
    const next = fallbackPlanSelection(plans, selectedSourceId);
    if (next) {
      setPlaybackFailure("This server failed to start playback. Trying the next server...");
      setUserSelection(next);
      return;
    }
    setPlaybackFailure("Every available server failed to start playback.");
  }, [plans, selectedSourceId]);

  // Resume position & title progress.
  const progress = useUnitProgress("anime", id, episodeNumber);
  const titleProgress = useTitleProgress("anime", id);

  const watchedSet = useMemo(() => {
    const set = new Set<number>();
    if (titleProgress) {
      for (const record of titleProgress) {
        if (record.completed) set.add(record.unit);
      }
    }
    return set;
  }, [titleProgress]);

  // Skip markers mapped from the canonical metadata shape.
  const skipTimes = useMemo(() => {
    const intro = metadataQuery.data?.intro;
    const outro = metadataQuery.data?.outro;
    return {
      opening: intro ? { startTime: intro.start, endTime: intro.end } : null,
      ending: outro ? { startTime: outro.start, endTime: outro.end } : null,
      recap: null,
    };
  }, [metadataQuery.data]);

  // Throttled progress writer.
  const saveProgress = useThrottledProgressSaver();

  const resumeProgress = useCallback(
    (positionSeconds: number, durationSeconds: number) => {
      void saveProgress({
        kind: "anime",
        mediaId: id,
        title: detailQuery.data?.summary.title.preferred ?? id,
        coverUrl: detailQuery.data?.summary.cover.url ?? null,
        unit: episodeNumber,
        positionSeconds,
        durationSeconds,
        totalUnits: catalogue?.knownTotal ?? null,
      });
    },
    [id, detailQuery.data, episodeNumber, catalogue, saveProgress],
  );

  // Airing-aware navigation: the next episode may exist but be unreleased —
  // show it, but never start playback on it.
  const nextNumber = navigationQuery.data?.next ?? null;
  const nextCard =
    nextNumber !== null
      ? (catalogue?.episodes.find((entry) => entry.episodeNumber === nextNumber) ?? null)
      : null;
  const canGoNext = nextNumber !== null && nextCard !== null && nextCard.airingState !== "upcoming";
  const canGoPrev = navigationQuery.data?.previous !== null;

  const goNext = useCallback(() => {
    if (canGoNext && nextNumber !== null) router.push(`/watch/${id}/${nextNumber}`);
  }, [canGoNext, nextNumber, id, router]);

  const goPrev = useCallback(() => {
    const previous = navigationQuery.data?.previous;
    if (previous !== null && previous !== undefined) router.push(`/watch/${id}/${previous}`);
  }, [navigationQuery.data, id, router]);

  // Keyboard shortcuts (Vidstack covers the core inputs).
  useHotkeys("t", () => {
    usePlayerStore.getState().toggleTheaterMode();
  }, { preventDefault: true });
  useHotkeys("n", goNext, { preventDefault: true });
  useHotkeys("p", goPrev, { preventDefault: true });

  const retry = useCallback(() => {
    setPlaybackFailure(null);
    setExecution(null);
    setUserSelection(null);
  }, []);

  // Render.
  // Every hook above must run on every render, so these guards live here rather
  // than at the top of the component.
  if (!validEpisode) {
    return <EmptyPlayer id={id} error="This episode does not exist." />;
  }

  if (detailQuery.isLoading || episodesQuery.isLoading) {
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

  if (detailQuery.error) {
    const failure = classifyDetailError(detailQuery.error);
    if (failure === "not_found") {
      return <EmptyPlayer id={id} error="Title not found." />;
    }
    return (
      <EmptyPlayer
        id={id}
        error={
          failure === "invalid_response"
            ? "The Zenkai API returned data this page could not understand."
            : "The Zenkai API could not be reached. This is a loading problem, not a missing title."
        }
        action={
          <Button
            variant="outline"
            className="glass rounded-xl"
            onClick={() => detailQuery.refetch()}
          >
            Try again
          </Button>
        }
      />
    );
  }

  if (episodesQuery.error) {
    return <EmptyPlayer id={id} error="The episode list could not be loaded right now." />;
  }

  if (!catalogue) {
    return <EmptyPlayer id={id} error="Title not found." />;
  }

  if (!episodeCard) {
    return <EmptyPlayer id={id} error={`Episode ${episodeNumber} was not found.`} />;
  }

  if (unreleased) {
    return <UnreleasedEpisode id={id} episodeNumber={episodeNumber} />;
  }

  const media = detailQuery.data?.summary ?? null;
  const serverOptions = plans.map(planToServerOption);

  return (
    <div className={cn("flex flex-col gap-6", theaterMode ? "max-w-fit" : "max-w-6xl")}>
      <div className="flex items-center gap-2">
        <SourceSwitcher
          options={serverOptions}
          selectedSourceId={selectedSourceId}
          loading={sourcesQuery.isLoading}
          language={language}
          onSelect={(sourceId) => {
            setUserSelection(sourceId);
            setRetryNonce(0);
          }}
          onLanguageChange={(value) => usePlayerStore.getState().setAudio(value)}
        />
        <QualityMenu rate={playbackRate} onRateChange={(rate) => {
          usePlayerStore.getState().setPlaybackRate(rate);
        }} />
        <PlayerHotkeys
          onTheater={() => {
            usePlayerStore.getState().toggleTheaterMode();
          }}
          onNext={goNext}
        />
      </div>

      <div className={cn("grid gap-6", theaterMode ? "" : "lg:grid-cols-[1fr_360px]")}>
        <div className={cn("relative", theaterMode ? "lg:col-span-2" : "")}>
          <PlayerArea
            sourcesQuery={sourcesQuery}
            execution={execution}
            playbackFailure={playbackFailure}
            title={media ? displayTitle(media.title, id) : id}
            poster={media?.cover.url ?? null}
            initialTime={progress?.positionSeconds}
            skipTimes={skipTimes}
            autoSkip={autoSkip}
            playbackRate={playbackRate}
            volume={volume}
            muted={muted}
            onProgress={resumeProgress}
            onEnded={() => {
              if (autoplayNext) goNext();
            }}
            onError={handlePlaybackError}
            onRetry={retry}
          />
          <EpisodeList
            id={id}
            episodes={catalogue.episodes}
            currentEpisode={episodeNumber}
            watchedEpisodes={watchedSet}
          />
        </div>

        <aside className={cn("flex flex-col gap-4", theaterMode ? "hidden md:flex" : "flex")}>
          <div className="glass-panel flex flex-col gap-3 rounded-2xl p-4">
            <h2 className="text-sm font-bold tracking-tight">Now playing</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {media ? displayTitle(media.title, id) : ""}
              </span>
              {media?.title.native ? (
                <span className="font-mono text-xs text-muted-foreground">
                  ({media.title.native})
                </span>
              ) : null}
              {media?.status && media.status !== "UNKNOWN" ? (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground">
                  {media.status.replaceAll("_", " ")}
                </span>
              ) : null}
            </div>
            {media && media.genres.length > 0 ? (
              <p className="text-xs text-muted-foreground">{media.genres.slice(0, 3).join(", ")}</p>
            ) : null}

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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="glass flex-1 rounded-xl"
                onClick={goPrev}
                disabled={!canGoPrev}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                className="glass flex-1 rounded-xl"
                onClick={goNext}
                disabled={!canGoNext}
                title={nextCard?.airingState === "upcoming" ? "Not yet aired" : undefined}
              >
                {nextCard?.airingState === "upcoming" ? "Next (unreleased)" : "Next"}
              </Button>
            </div>
            <PlayerHotkeys
              onTheater={() => {
                usePlayerStore.getState().toggleTheaterMode();
              }}
              onNext={goNext}
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

/** The player area: source resolution, execution and the two playback kinds. */
function PlayerArea({
  sourcesQuery,
  execution,
  playbackFailure,
  title,
  poster,
  initialTime,
  skipTimes,
  autoSkip,
  playbackRate,
  volume,
  muted,
  onProgress,
  onEnded,
  onError,
  onRetry,
}: {
  sourcesQuery: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof fetchEpisodeSources>>>
  >;
  execution: PlaybackExecution | null;
  playbackFailure: string | null;
  title: string;
  poster: string | null;
  initialTime?: number;
  skipTimes: { opening: { startTime: number; endTime: number } | null; ending: { startTime: number; endTime: number } | null; recap: null };
  autoSkip: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  onProgress: (positionSeconds: number, durationSeconds: number) => void;
  onEnded: () => void;
  onError: () => void;
  onRetry: () => void;
}) {
  if (sourcesQuery.isLoading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 glass-panel">
        <p className="animate-pulse text-sm text-muted-foreground">Finding available sources...</p>
      </div>
    );
  }

  if (sourcesQuery.error) {
    const failure = classifyPlaybackError(sourcesQuery.error);
    if (failure === "not_found") {
      return <ErrorMessage message="This episode was not found." />;
    }
    if (failure === "no_sources") {
      return (
        <ErrorMessage
          message="Streaming services are temporarily unavailable. This is not the same as the episode having no streams — please try again shortly."
          action={<RetryButton onClick={onRetry} />}
        />
      );
    }
    if (failure === "invalid_response") {
      return <ErrorMessage message="The Zenkai API returned data this page could not understand." />;
    }
    return (
      <ErrorMessage
        message="Sources could not be loaded right now."
        action={<RetryButton onClick={onRetry} />}
      />
    );
  }

  // A 200 with an empty plan list is a fact about the episode, not an outage.
  if (sourcesQuery.data && sourcesQuery.data.plans.length === 0) {
    return <ErrorMessage message="No sources are currently available for this episode." />;
  }

  if (playbackFailure) {
    return (
      <ErrorMessage
        message={playbackFailure}
        action={<RetryButton onClick={onRetry} />}
      />
    );
  }

  if (!execution) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 glass-panel">
        <p className="animate-pulse text-sm text-muted-foreground">Finding available sources...</p>
      </div>
    );
  }

  // P6's invariant: an embed is never a media source and a media source is
  // never an embed. The execution's kind decides the element — never the URL.
  if (execution.kind === "embed") {
    return <EmbedPlayer execution={execution} />;
  }

  return (
    <VideoPlayer
      execution={execution}
      title={title}
      poster={poster}
      initialTime={initialTime}
      skipTimes={skipTimes}
      autoSkip={autoSkip}
      playbackRate={playbackRate}
      volume={volume}
      muted={muted}
      onProgress={onProgress}
      onEnded={onEnded}
      onError={onError}
    />
  );
}

function ErrorMessage({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-white/5 px-4 py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/5">
        <Play className="size-6 text-muted-foreground" />
      </span>
      <p className="max-w-md text-center text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" className="glass rounded-xl" onClick={onClick}>
      Try again
    </Button>
  );
}

function UnreleasedEpisode({ id, episodeNumber }: { id: string; episodeNumber: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/5 px-4 py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/5">
        <CalendarClock className="size-6 text-muted-foreground" />
      </span>
      <p className="text-sm text-muted-foreground">
        Episode {episodeNumber} has not been released yet.
      </p>
      <Button variant="outline" className="glass rounded-xl" asChild>
        <a href={`/anime/${id}`}>Back to anime</a>
      </Button>
    </div>
  );
}

function EmptyPlayer({ id, error, action }: { id: string; error: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/5 px-4 py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/5">
        <Play className="size-6 text-muted-foreground" />
      </span>
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" className="glass rounded-xl" asChild>
        <a href={`/anime/${id}`}>Back to anime</a>
      </Button>
      {action}
    </div>
  );
}

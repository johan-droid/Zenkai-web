"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { CalendarClock, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useThrottledProgressSaver, useUnitProgress, useTitleProgress } from "@/hooks/use-progress";
import {
  animeDetailToDetailData,
  classifyDetailError,
  classifyPlaybackError,
  executePlayback,
  fetchAnimeDetail,
  fetchAnimeEpisodes,
  fetchEpisodeMetadata,
  fetchEpisodeNavigation,
  fetchEpisodeServers,
  fetchEpisodeSources,
  initialPlanSelection,
  isUnreleased,
  type PlaybackExecution,
} from "@/lib/api/zenkai";
import { displayTitle } from "@/lib/media";
import { usePlayerStore } from "@/stores/player";
import { NextEpisodeCountdownController } from "@/lib/player/automation";
import {
  classifyPlaybackError as classifyMediaError,
  nextPhase,
  normalisePlaybackError,
  PlaybackRecoverySession,
  RESUME_GUARD_TOLERANCE_S,
  selectFallbackPlan,
  validateExecution,
  type PlaybackPhase,
} from "@/lib/player/recovery";
import { EmbedPlayer } from "@/components/player/embed-player";
import { EpisodeList } from "@/components/player/episode-list";
import { NextEpisodeOverlay } from "@/components/player/next-episode-overlay";
import { PlayerHotkeys } from "@/components/player/player-hotkeys";
import { QualityMenu } from "@/components/player/quality-menu";
import { ServerSelectionPanel } from "@/components/player/server-selection-panel";
import { IssueReportModal } from "@/components/player/issue-report-modal";
import { computeResumePosition, VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Flag } from "lucide-react";

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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
  const autoSkipIntro = usePlayerStore((s) => s.autoSkipIntro);
  const autoSkipOutro = usePlayerStore((s) => s.autoSkipOutro);
  const nextEpisodeCountdown = usePlayerStore((s) => s.nextEpisodeCountdown);
  const showSkipButtons = usePlayerStore((s) => s.showSkipButtons);
  const theaterMode = usePlayerStore((s) => s.theaterMode);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const language = usePlayerStore((s) => s.audio);
  const preferredServer = usePlayerStore((s) => s.preferredServer);
  const autoServerFallback = usePlayerStore((s) => s.autoServerFallback);

  // Track playback position in real-time to preserve position across server switches
  const currentPlaybackTimeRef = useRef<number>(0);
  const [switchResumeTime, setSwitchResumeTime] = useState<number | null>(null);
  const [isRefreshingServers, setIsRefreshingServers] = useState(false);

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
  const servers = sourcesQuery.data?.servers;
  // Stable across renders, safe as an effect dependency: destructure it out of
  // the (unstable) query result object.
  const { refetch: refetchSources } = sourcesQuery;

  /* ---------------------------------------------------------------- */
  /* Authoritative playback state (P20)                               */
  /* ---------------------------------------------------------------- */

  /**
   * What the player is actually playing, and the source it came from, in ONE
   * value. They can never disagree: a stale execution cannot be rendered under
   * a newer selection, because there is no pair to get out of sync.
   */
  const [playback, setPlayback] = useState<{
    sourceId: string;
    execution: PlaybackExecution;
  } | null>(null);

  /**
   * The source the user (or the recovery engine) asked for. `null` means "not
   * pinned yet" and the backend's top-ranked plan is discovered instead.
   *
   * The distinction matters: the old code derived the active source from the
   * live plan list on every render, so a sources refetch that re-ranked the
   * list silently replaced the stream mid-playback. A committed selection is
   * pinned; only a user action, an episode/language change, or a validated
   * fallback may move it.
   */
  const [desiredSourceId, setDesiredSourceId] = useState<string | null>(null);
  const [playbackFailure, setPlaybackFailure] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportTimeSeconds, setReportTimeSeconds] = useState(0);
  // Bumped exactly once (after the first successful sources refetch), so one
  // automatic stale-selection retry happens per attempt — never an invisible loop.
  const [retryNonce, setRetryNonce] = useState(0);

  const [phase, setPhaseState] = useState<PlaybackPhase>("idle");
  const phaseRef = useRef<PlaybackPhase>("idle");
  const applyPhase = useCallback((next: PlaybackPhase) => {
    const resolved = nextPhase(phaseRef.current, next);
    if (resolved === phaseRef.current) return;
    phaseRef.current = resolved;
    setPhaseState(resolved);
  }, []);

  // Per episode + audio shelf: what already failed, and how much budget is left.
  const recoveryRef = useRef(new PlaybackRecoverySession());
  // One recovery operation at a time. `switching` blocks further automatic
  // changes until the new execution settles; `recovering` blocks duplicates of
  // the same failure while hls.js retries in place.
  const transactionRef = useRef<"recovering" | "switching" | null>(null);
  // In-place recovery hook, supplied by the mounted player for the HLS instance
  // it actually owns. Null whenever no recoverable provider is attached.
  const hlsRecoveryRef = useRef<((kind: "network" | "media") => boolean) | null>(null);
  const registerRecovery = useCallback(
    (recover: ((kind: "network" | "media") => boolean) | null) => {
      hlsRecoveryRef.current = recover;
    },
    [],
  );
  // While set, progress reports below the target are the replacement stream
  // booting at 0s, not a seek: they must not overwrite the saved position.
  const resumeGuardRef = useRef<{ target: number; at: number } | null>(null);

  /** Remember where we were before a source change, for restoration. */
  const guardResume = useCallback((position: number) => {
    if (!Number.isFinite(position) || position <= 1) return;
    resumeGuardRef.current = { target: position, at: Date.now() };
    setSwitchResumeTime(position);
  }, []);

  // The backend's top-ranked (preferred/available) plan — used only until a
  // source is committed. After that it is inert, which is the whole point.
  const discoverySourceId = useMemo(
    () => initialPlanSelection(plans, preferredServer, servers),
    [plans, preferredServer, servers],
  );
  const targetSourceId = desiredSourceId ?? discoverySourceId;
  const activeSourceId = playback?.sourceId ?? null;

  // A new episode, anime title, or language change resets everything: nothing
  // from the previous identity may leak into the next playback.
  // selectionEpoch includes the canonical anime id and episode number so that
  // a change in route id or episode number is immediately detected, even before
  // the async source query resolves.
  const selectionEpoch = `${id}:${episodeNumber}:${episodeCard?.id ?? ""}:${language}`;
  const [lastSelectionEpoch, setLastSelectionEpoch] = useState(selectionEpoch);
  if (lastSelectionEpoch !== selectionEpoch) {
    setLastSelectionEpoch(selectionEpoch);
    setDesiredSourceId(null);
    setPlayback(null);
    setPlaybackFailure(null);
    setSwitchResumeTime(null);
    setRetryNonce(0);
    setPhaseState("idle");
  }

  useEffect(() => {
    currentPlaybackTimeRef.current = 0;
    recoveryRef.current.reset();
    phaseRef.current = "idle";
    resumeGuardRef.current = null;
    transactionRef.current = null;
  }, [selectionEpoch]);

  // Generation counter to ensure asynchronous playback execution cannot overwrite
  // a subsequent or cancelled selection.
  const playbackAttemptRef = useRef(0);

  // Execute the requested canonical source. The request carries only episodeId,
  // sourceId and language — the backend re-resolves the plan and returns the
  // only playback URL the client ever sees.
  const episodeId = episodeCard?.id ?? null;
  useEffect(() => {
    if (!episodeId || !targetSourceId) return;

    // Already playing the requested source. Re-running here on every re-render
    // or background refetch is what used to reload the stream for no reason.
    if (playback?.sourceId === targetSourceId) return;

    const currentAttempt = ++playbackAttemptRef.current;
    let cancelled = false;
    applyPhase("executing");

    executePlayback({ episodeId, sourceId: targetSourceId, language })
      .then((result) => {
        if (cancelled || currentAttempt !== playbackAttemptRef.current) return;

        // Never render an execution we cannot prove belongs to this request:
        // wrong source, wrong audio shelf, or an embed dressed as media.
        const valid = validateExecution(result, {
          sourceId: targetSourceId,
          language,
        });
        if (!valid.ok) {
          transactionRef.current = null;
          setPlaybackFailure("This server returned a source this player cannot use.");
          applyPhase("failed");
          return;
        }

        recoveryRef.current.beginSource(targetSourceId);
        transactionRef.current = null;
        setPlayback({ sourceId: targetSourceId, execution: result });
        setPlaybackFailure(null);
        applyPhase("ready");
      })
      .catch((error: unknown) => {
        if (cancelled || currentAttempt !== playbackAttemptRef.current) return;
        transactionRef.current = null;
        const failure = classifyPlaybackError(error);
        if (failure === "selection_stale" && retryNonce < MAX_STALE_RETRIES) {
          // The ranked list moved under us: refresh once, then re-discover.
          // The nonce carries the one-automatic-retry bound.
          void refetchSources().then(() => {
            if (cancelled || currentAttempt !== playbackAttemptRef.current) return;
            setDesiredSourceId(null);
            setRetryNonce(1);
          });
          return;
        }
        setPlaybackFailure(playbackFailureMessage(failure));
        applyPhase("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [
    episodeId,
    targetSourceId,
    language,
    retryNonce,
    refetchSources,
    playback?.sourceId,
    applyPhase,
  ]);

  // Manual server switch with watch position preservation.
  const handleServerSwitch = useCallback(
    (sourceId: string, serverName?: string) => {
      const currentTime = currentPlaybackTimeRef.current;
      guardResume(currentTime);
      transactionRef.current = null;
      setPlaybackFailure(null);
      applyPhase("switching");
      setDesiredSourceId(sourceId);
      setRetryNonce(0);

      const targetPlan = plans.find((p) => p.sourceId === sourceId);
      const name = serverName || targetPlan?.providerName || "Server";
      const timeStr = currentTime > 1 ? ` at ${formatTimestamp(currentTime)}` : "";
      toast.info(`Switched to ${name}${timeStr}`);
    },
    [plans, applyPhase, guardResume],
  );

  /**
   * The only path that may change the provider automatically.
   *
   * Order of escalation: classify → recover the current stream in place →
   * (only then) validate and commit an alternative. Everything is bounded by
   * the recovery session and one operation runs at a time.
   */
  const handlePlaybackError = useCallback(
    (event: unknown) => {
      const normalised = normalisePlaybackError(event);
      const category = classifyMediaError(normalised);

      // Pause, seek, speed/volume change, teardown, navigation: not a provider
      // problem, and never a reason to change servers.
      if (category === "non_provider") return;

      // A switch is already being committed. Errors still coming from the old
      // stream must not advance the plan a second time.
      if (transactionRef.current === "switching") return;
      // A duplicate of the failure already being recovered in place. A fatal
      // error is new evidence and is allowed to escalate.
      if (transactionRef.current === "recovering" && category !== "fatal_provider") {
        return;
      }

      const session = recoveryRef.current;
      const position = currentPlaybackTimeRef.current;

      // 1. Keep the working provider whenever it can still work.
      if (
        (category === "transient_network" || category === "unknown") &&
        session.canRecoverInPlace()
      ) {
        const kind =
          normalised.code === 3 || /mediaerror|bufferstalled/i.test(normalised.detail ?? "")
            ? "media"
            : "network";
        session.noteInPlaceRecovery();
        if (hlsRecoveryRef.current?.(kind)) {
          transactionRef.current = "recovering";
          applyPhase("recovering");
          // The next progress report from this stream clears `recovering`; a
          // second fatal error escalates below with the budget spent.
          return;
        }
      }

      // 2. The current source is unusable. Failover, bounded and validated.
      session.noteFailure(activeSourceId, playback?.execution.providerSlug ?? null, category);

      if (!autoServerFallback) {
        transactionRef.current = null;
        setPlaybackFailure(
          "This server failed to start playback. Automatic fallback is disabled in player settings.",
        );
        applyPhase("failed");
        return;
      }

      if (!session.canAttemptAnotherProvider()) {
        transactionRef.current = null;
        setPlaybackFailure("Every available server failed to play this episode.");
        applyPhase("failed");
        return;
      }

      const next = selectFallbackPlan(plans, {
        failedSourceId: activeSourceId,
        failedSourceIds: session.failedSourceIds,
        failedProviderSlugs: session.failedProviderSlugs,
        language,
        servers,
      });

      if (!next) {
        transactionRef.current = null;
        setPlaybackFailure("Every available server failed to play this episode.");
        applyPhase("failed");
        return;
      }

      // Transactional replacement: keep the current surface and position, and
      // only commit the alternative once its execution validates.
      guardResume(position);
      setPlaybackFailure(null);
      transactionRef.current = "switching";
      applyPhase("switching");
      setDesiredSourceId(next.sourceId);
    },
    [
      activeSourceId,
      applyPhase,
      autoServerFallback,
      guardResume,
      language,
      plans,
      playback?.execution.providerSlug,
      servers,
    ],
  );

  // Resume position & title progress.
  const progress = useUnitProgress("anime", id, episodeNumber);
  const titleProgress = useTitleProgress("anime", id);
  const initialTime = computeResumePosition(progress);

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
      // The replacement stream boots at 0s and seeks to the preserved position.
      // Reports below that target are the boot, not a user rewind: writing them
      // would erase the resume point and can mark the episode complete.
      const guard = resumeGuardRef.current;
      if (guard) {
        const expired = Date.now() - guard.at > 20_000;
        if (!expired && positionSeconds < guard.target - RESUME_GUARD_TOLERANCE_S) return;
        resumeGuardRef.current = null;
      }

      currentPlaybackTimeRef.current = positionSeconds;

      // Playback resumed: any in-place recovery has succeeded.
      if (transactionRef.current === "recovering") transactionRef.current = null;
      if (phaseRef.current === "recovering") applyPhase("ready");
      else if (phaseRef.current === "ready") applyPhase("playing");

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
    [id, detailQuery.data, episodeNumber, catalogue, saveProgress, applyPhase],
  );

  const handleRefreshServers = useCallback(async () => {
    if (!episodeCard) return;
    setIsRefreshingServers(true);
    try {
      await fetchEpisodeServers(episodeCard.id, { language, refresh: true });
      await refetchSources();
      toast.success("Server health statuses refreshed");
    } catch {
      toast.error("Failed to refresh server status");
    } finally {
      setIsRefreshingServers(false);
    }
  }, [episodeCard, language, refetchSources]);

  // Airing-aware navigation: the next episode may exist but be unreleased —
  // show it, but never start playback on it.
  const nextNumber = navigationQuery.data?.next ?? null;
  const nextCard =
    nextNumber !== null
      ? (catalogue?.episodes.find((entry) => entry.episodeNumber === nextNumber) ?? null)
      : null;
  const canGoNext = nextNumber !== null && nextCard !== null && nextCard.airingState !== "upcoming";
  const canGoPrev = navigationQuery.data?.previous !== null;

  const [countdownState, setCountdownState] = useState<{
    episodeEpoch: string;
    remaining: number;
    isPaused: boolean;
  } | null>(null);

  const countdownControllerRef = useRef<NextEpisodeCountdownController | null>(null);

  // Clean up running countdown controller when episode changes or unmounts
  useEffect(() => {
    return () => {
      countdownControllerRef.current?.destroy();
      countdownControllerRef.current = null;
    };
  }, [id, episodeNumber]);

  const cancelCountdown = useCallback(() => {
    countdownControllerRef.current?.cancel();
    countdownControllerRef.current = null;
    setCountdownState(null);
  }, []);

  const togglePauseCountdown = useCallback(() => {
    const controller = countdownControllerRef.current;
    if (!controller) return;
    const currentState = controller.getState();
    if (currentState === "counting") {
      controller.pause();
      setCountdownState((prev) => (prev ? { ...prev, isPaused: true } : null));
    } else if (currentState === "paused") {
      controller.resume();
      setCountdownState((prev) => (prev ? { ...prev, isPaused: false } : null));
    }
  }, []);

  const goNext = useCallback(() => {
    countdownControllerRef.current?.destroy();
    countdownControllerRef.current = null;
    setCountdownState(null);
    if (canGoNext && nextNumber !== null) router.push(`/watch/${id}/${nextNumber}`);
  }, [canGoNext, nextNumber, id, router]);

  const goPrev = useCallback(() => {
    cancelCountdown();
    const previous = navigationQuery.data?.previous;
    if (previous !== null && previous !== undefined) router.push(`/watch/${id}/${previous}`);
  }, [cancelCountdown, navigationQuery.data, id, router]);

  const handleEnded = useCallback(() => {
    if (!autoplayNext || !canGoNext || nextNumber === null) {
      return;
    }

    if (nextEpisodeCountdown <= 0) {
      goNext();
      return;
    }

    const currentEpoch = `${id}:${episodeNumber}`;
    countdownControllerRef.current?.destroy();
    const controller = new NextEpisodeCountdownController({
      durationSeconds: nextEpisodeCountdown,
      onTick: (remaining) => {
        setCountdownState((prev) => (prev ? { ...prev, remaining } : null));
      },
      onComplete: () => {
        setCountdownState(null);
        goNext();
      },
      onCancel: () => {
        setCountdownState(null);
      },
    });

    countdownControllerRef.current = controller;
    setCountdownState({
      episodeEpoch: currentEpoch,
      remaining: nextEpisodeCountdown,
      isPaused: false,
    });
    controller.start();
  }, [autoplayNext, canGoNext, nextNumber, nextEpisodeCountdown, goNext, id, episodeNumber]);

  // Keyboard shortcuts (Vidstack covers the core inputs).
  useHotkeys("t", () => {
    usePlayerStore.getState().toggleTheaterMode();
  }, { preventDefault: true });
  useHotkeys("n", goNext, { preventDefault: true });
  useHotkeys("p", goPrev, { preventDefault: true });

  const retry = useCallback(() => {
    recoveryRef.current.reset();
    transactionRef.current = null;
    resumeGuardRef.current = null;
    setPlaybackFailure(null);
    setPlayback(null);
    setDesiredSourceId(null);
    applyPhase("discovering");
    void refetchSources();
  }, [refetchSources, applyPhase]);

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

  const effectiveInitialTime =
    switchResumeTime !== null && switchResumeTime > 1
      ? switchResumeTime
      : initialTime;

  return (
    <div className={cn("flex flex-col gap-6", theaterMode ? "max-w-fit" : "max-w-6xl")}>
      <div className="flex items-center gap-2">
        <ServerSelectionPanel
          plans={plans}
          servers={servers}
          availableAudioLanguages={sourcesQuery.data?.availableAudioLanguages}
          selectedSourceId={activeSourceId ?? targetSourceId}
          loading={sourcesQuery.isLoading}
          isRefreshing={isRefreshingServers}
          language={language}
          onSelect={handleServerSwitch}
          onLanguageChange={(value) => usePlayerStore.getState().setAudio(value)}
          onRefresh={handleRefreshServers}
        />
        <QualityMenu rate={playbackRate} onRateChange={(rate) => {
          usePlayerStore.getState().setPlaybackRate(rate);
        }} />
        <PlayerHotkeys />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Snapshot the position when the dialog opens; reading the ref in
            // render is both a lint error and a stale-by-a-frame value.
            setReportTimeSeconds(currentPlaybackTimeRef.current);
            setIsReportOpen(true);
          }}
          className="rounded-xl border-white/[0.08] bg-white/[0.03] text-xs text-zinc-300 hover:text-white"
          title="Report playback problem"
        >
          <Flag className="size-3.5 mr-1 text-red-500" />
          <span>Report</span>
        </Button>
      </div>

      <IssueReportModal
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        episodeId={episodeCard?.id ?? `${id}-${episodeNumber}`}
        animeId={id}
        providerSlug={playback?.execution.providerSlug}
        sourceId={activeSourceId ?? undefined}
        audioLanguage={language}
        currentTimeSeconds={reportTimeSeconds}
      />

      <div className={cn("grid gap-6", theaterMode ? "" : "lg:grid-cols-[1fr_360px]")}>
        <div className={cn("relative flex flex-col gap-4", theaterMode ? "lg:col-span-2" : "")}>
          <PlayerArea
            key={`${id}-${episodeNumber}-${activeSourceId ?? "pending"}`}
            sourcesQuery={sourcesQuery}
            execution={playback?.execution ?? null}
            playbackFailure={playbackFailure}
            recovering={phase === "recovering" || phase === "switching"}
            registerRecovery={registerRecovery}
            title={media ? displayTitle(media.title, id) : id}
            poster={media?.cover.url ?? null}
            episodeId={episodeCard?.id ?? `${id}-${episodeNumber}`}
            episodeNumber={episodeNumber}
            initialTime={effectiveInitialTime}
            skipTimes={skipTimes}
            autoSkip={autoSkip}
            autoSkipIntro={autoSkipIntro}
            autoSkipOutro={autoSkipOutro}
            showSkipButtons={showSkipButtons}
            playbackRate={playbackRate}
            volume={volume}
            muted={muted}
            onProgress={resumeProgress}
            onEnded={handleEnded}
            onError={handlePlaybackError}
            onRetry={retry}
            language={language}
            onLanguageChange={(value) => usePlayerStore.getState().setAudio(value)}
            overlay={
              countdownState !== null &&
              countdownState.episodeEpoch === `${id}:${episodeNumber}` &&
              canGoNext &&
              nextNumber !== null ? (
                <NextEpisodeOverlay
                  remainingSeconds={countdownState.remaining}
                  nextEpisodeNumber={nextNumber}
                  nextEpisodeTitle={nextCard?.title}
                  isPaused={countdownState.isPaused}
                  onPlayNow={goNext}
                  onCancel={cancelCountdown}
                  onTogglePause={togglePauseCountdown}
                />
              ) : null
            }
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
            <PlayerHotkeys />
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
  recovering = false,
  registerRecovery,
  title,
  poster,
  episodeId,
  episodeNumber,
  initialTime,
  skipTimes,
  autoSkip,
  autoSkipIntro,
  autoSkipOutro,
  showSkipButtons,
  playbackRate,
  volume,
  muted,
  onProgress,
  onEnded,
  onError,
  onRetry,
  language,
  onLanguageChange,
  overlay,
}: {
  sourcesQuery: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof fetchEpisodeSources>>>
  >;
  execution: PlaybackExecution | null;
  playbackFailure: string | null;
  /** A source change is in progress: keep the surface, do not show an error. */
  recovering?: boolean;
  registerRecovery?: (recover: ((kind: "network" | "media") => boolean) | null) => void;
  title: string;
  poster: string | null;
  episodeId?: string;
  episodeNumber?: number;
  initialTime?: number;
  skipTimes: { opening: { startTime: number; endTime: number } | null; ending: { startTime: number; endTime: number } | null; recap: null };
  autoSkip: boolean;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  showSkipButtons: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  onProgress: (positionSeconds: number, durationSeconds: number) => void;
  onEnded: () => void;
  onError: (event: unknown) => void;
  onRetry: () => void;
  language: "sub" | "dub" | "multi";
  onLanguageChange: (value: "sub" | "dub" | "multi") => void;
  overlay?: React.ReactNode;
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
  // The emptyReason tells the user what actually happened instead of a
  // generic "no sources" that hides whether providers are down, blocked,
  // or genuinely have nothing for this episode.
  if (sourcesQuery.data && sourcesQuery.data.plans.length === 0) {
    const reason = sourcesQuery.data.emptyReason;
    if (reason === "all_failed" || reason === "quarantined") {
      return (
        <ErrorMessage
          message="Streaming providers could not be reached. Your network may be blocking them — a VPN often helps — or they may be temporarily down."
          action={<RetryButton onClick={onRetry} />}
        />
      );
    }
    // ponytail: dub-requested-but-only-sub-exists dead-ends without this — the
    // servers report names the available track, so offer a one-tap switch.
    const servers = sourcesQuery.data.servers ?? [];
    const other = language === "dub" ? "sub" : language === "sub" ? "dub" : null;
    if (other !== null && servers.some((s) => (other === "dub" ? s.dub : s.sub))) {
      const label = other.toUpperCase();
      return (
        <ErrorMessage
          message={`No ${language.toUpperCase()} streams for this episode, but ${label} is available.`}
          action={
            <div className="flex gap-2">
              <Button variant="outline" className="glass rounded-xl" onClick={() => onLanguageChange(other)}>
                {`Switch to ${label}`}
              </Button>
              <RetryButton onClick={onRetry} />
            </div>
          }
        />
      );
    }
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
    return <EmbedPlayer execution={execution} title={title} episodeNumber={episodeNumber} />;
  }

  return (
    <div className="relative">
      <VideoPlayer
        execution={execution}
        title={title}
        poster={poster}
        initialTime={initialTime}
        skipTimes={skipTimes}
        autoSkip={autoSkip}
        autoSkipIntro={autoSkipIntro}
        autoSkipOutro={autoSkipOutro}
        showSkipButtons={showSkipButtons}
        episodeId={episodeId}
        playbackRate={playbackRate}
        volume={volume}
        muted={muted}
        onProgress={onProgress}
        onEnded={onEnded}
        onError={onError}
        registerRecovery={registerRecovery}
        overlay={overlay}
      />

      {/*
        Recovery is a state of the player, not a page: a subtle badge over the
        live surface. No error screen, no toast, controls stay usable.
      */}
      {recovering ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-3 py-1 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md">
            <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Reconnecting…
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** One honest message per failure class — never a provider diagnostic. */
function playbackFailureMessage(failure: ReturnType<typeof classifyPlaybackError>): string {
  switch (failure) {
    case "not_found":
      return "This episode was not found.";
    case "no_sources":
      return "Streaming services are temporarily unavailable. This is not the same as the episode having no streams — please try again shortly.";
    case "invalid_response":
      return "The Zenkai API returned data this page could not understand.";
    default:
      return "This server failed to start playback.";
  }
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

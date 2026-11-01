"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Compass,
  ChevronRight,
  BookOpen,
  Tv,
  Clock,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Download,
  ShieldCheck,
} from "lucide-react";
import { useGrandLineEpisode, useGrandLineProgress } from "@/hooks/use-grand-line";

export default function EpisodeDetailPage() {
  const params = useParams<{ arcId: string; episodeNumber: string }>();
  const arcId = params?.arcId || "";
  const episodeNumber = params?.episodeNumber || "";

  const { detail, loading, error } = useGrandLineEpisode(arcId, episodeNumber);
  const { isWatched, toggleWatched, recordLastVisited } = useGrandLineProgress();

  useEffect(() => {
    if (detail?.episode && detail?.arc) {
      void recordLastVisited(detail.episode, detail.arc.title);
    }
  }, [detail, recordLastVisited]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-amber-400" />
          <span className="text-sm text-zinc-400">Loading Episode Voyage Details...</span>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-red-300">
          <h2 className="text-xl font-bold">Episode Not Found</h2>
          <p className="mt-2 text-sm text-zinc-400">
            {error || `Episode ${episodeNumber} does not exist in arc "${arcId}".`}
          </p>
          <Link
            href={`/grand-line/${arcId}`}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Arc</span>
          </Link>
        </div>
      </div>
    );
  }

  const { episode, arc, prevEpisode, nextEpisode } = detail;
  const watched = isWatched(arc.id, episode.episodeNumber);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/grand-line" className="hover:text-amber-400">
          Grand Line
        </Link>
        <ChevronRight className="size-3.5 text-zinc-600" />
        <Link href={`/grand-line/${arc.id}`} className="hover:text-amber-400">
          {arc.title}
        </Link>
        <ChevronRight className="size-3.5 text-zinc-600" />
        <span className="font-semibold text-white">Episode {episode.episodeNumber}</span>
      </div>

      {/* Main Focus Card */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-zinc-900/90 p-6 md:p-10 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col gap-6">
          {/* Header Metadata */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 font-mono text-sm font-bold text-amber-300 ring-1 ring-amber-500/40">
                {episode.episodeNumber}
              </span>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                <span>{arc.title}</span>
                <span className="mx-1.5">•</span>
                <span className="text-zinc-400">{arc.sagaName}</span>
              </div>
            </div>

            {/* Watched Toggle Button */}
            <button
              type="button"
              onClick={() => void toggleWatched(episode, arc.title)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm ${
                watched
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-white/10 text-zinc-300 ring-1 ring-white/10 hover:bg-white/20 hover:text-white"
              }`}
            >
              {watched ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <span>Completed</span>
                </>
              ) : (
                <>
                  <Circle className="size-4 text-zinc-400" />
                  <span>Mark as Watched</span>
                </>
              )}
            </button>
          </div>

          {/* Episode Title & Synopsis */}
          <div className="space-y-3">
            <h1 className="font-display text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
              {episode.title}
            </h1>
            {episode.synopsis && (
              <p className="text-sm leading-relaxed text-zinc-300 md:text-base">
                {episode.synopsis}
              </p>
            )}
          </div>

          {/* Manga vs Anime Canon Comparison Box */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                <BookOpen className="size-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Manga Chapters
                </div>
                <div className="font-display text-sm font-bold text-sky-300">
                  {episode.mangaChapters || "N/A"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Tv className="size-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Adapted Anime
                </div>
                <div className="font-display text-sm font-bold text-emerald-300">
                  {episode.animeEpisodes || "N/A"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <Clock className="size-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Paced Runtime
                </div>
                <div className="font-display text-sm font-bold text-amber-300">
                  {episode.duration || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action Button: Launch on Official One Pace */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>Official stream opens directly at the official One Pace timestamp</span>
            </div>

            <a
              href={episode.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-3 text-sm font-extrabold text-zinc-950 transition hover:from-amber-300 hover:to-amber-400 active:scale-95 shadow-lg shadow-amber-500/20"
            >
              <span>Watch on Official One Pace</span>
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Controls: Previous / Next Episode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {prevEpisode ? (
          <Link
            href={`/grand-line/${prevEpisode.arcId}/${prevEpisode.episodeNumber}`}
            className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-amber-500/30 hover:bg-zinc-900/80"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/5 text-zinc-400 group-hover:text-white">
              <ArrowLeft className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Previous Episode
              </div>
              <div className="font-display text-xs font-semibold text-white group-hover:text-amber-300 truncate">
                EP {prevEpisode.episodeNumber} • {prevEpisode.title}
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-4 opacity-40">
            <span className="text-xs text-zinc-500">First episode of the odyssey</span>
          </div>
        )}

        {nextEpisode ? (
          <Link
            href={`/grand-line/${nextEpisode.arcId}/${nextEpisode.episodeNumber}`}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/50 p-4 text-right transition hover:border-amber-500/30 hover:bg-zinc-900/80"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Next Episode
              </div>
              <div className="font-display text-xs font-semibold text-white group-hover:text-amber-300 truncate">
                EP {nextEpisode.episodeNumber} • {nextEpisode.title}
              </div>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/5 text-zinc-400 group-hover:text-white">
              <ArrowRight className="size-5" />
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-4 text-right opacity-40">
            <span className="text-xs text-zinc-500">Caught up with One Pace</span>
          </div>
        )}
      </div>
    </div>
  );
}

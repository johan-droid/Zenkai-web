"use client";

import { use } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Compass, ChevronRight, BookOpen, Tv, Clock, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import { useGrandLineArc, useGrandLineProgress } from "@/hooks/use-grand-line";
import { EpisodeRow } from "@/components/grand-line/episode-row";

export default function ArcDetailPage() {
  const params = useParams<{ arcId: string }>();
  const arcId = params?.arcId || "";

  const { arc, loading, error } = useGrandLineArc(arcId);
  const { isWatched, toggleWatched, recordLastVisited } = useGrandLineProgress();

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-amber-400" />
          <span className="text-sm text-zinc-400">Loading Arc & Episodes...</span>
        </div>
      </div>
    );
  }

  if (error || !arc) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-red-300">
          <h2 className="text-xl font-bold">Arc Not Found</h2>
          <p className="mt-2 text-sm text-zinc-400">{error || `Arc "${arcId}" does not exist.`}</p>
          <Link
            href="/grand-line"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Grand Line</span>
          </Link>
        </div>
      </div>
    );
  }

  const watchedInArc = arc.episodes.filter((ep) => isWatched(arc.id, ep.episodeNumber)).length;
  const percentWatched = arc.episodes.length > 0 ? Math.round((watchedInArc / arc.episodes.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6 md:py-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/grand-line" className="hover:text-amber-400">
          Grand Line
        </Link>
        <ChevronRight className="size-3.5 text-zinc-600" />
        <span className="text-zinc-500">{arc.sagaName}</span>
        <ChevronRight className="size-3.5 text-zinc-600" />
        <span className="font-semibold text-white">{arc.title}</span>
      </div>

      {/* Arc Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-950/20 via-zinc-950 to-zinc-900/80 p-6 md:p-8 backdrop-blur-xl">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <span>{arc.sagaName}</span>
            <span>•</span>
            <span className="text-zinc-400">Arc {arc.order.toString().padStart(2, "0")}</span>
          </div>

          <h1 className="font-display text-3xl font-extrabold text-white md:text-4xl">
            {arc.title}
          </h1>

          {arc.synopsis && (
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">
              {arc.synopsis}
            </p>
          )}

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5 text-sky-300">
              <BookOpen className="size-4 text-sky-400" />
              <span>Manga Chapters: {arc.mangaChapters}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-emerald-300">
              <Tv className="size-4 text-emerald-400" />
              <span>Anime Episodes: {arc.animeEpisodes}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Clock className="size-4 text-zinc-500" />
              <span>Total Duration: {arc.duration}</span>
            </span>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs text-zinc-400">
              Arc Progress: <strong className="text-white">{watchedInArc}</strong> / {arc.episodes.length} ({percentWatched}%)
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                style={{ width: `${percentWatched}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Episodes List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">
            Paced Episodes ({arc.episodes.length})
          </h2>
          <span className="text-xs text-zinc-400">
            Ordered chronologically per manga canon
          </span>
        </div>

        <div className="space-y-3">
          {arc.episodes.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              arcId={arc.id}
              arcTitle={arc.title}
              isWatched={isWatched(arc.id, episode.episodeNumber)}
              onToggleWatched={toggleWatched}
              onRecordVisited={recordLastVisited}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

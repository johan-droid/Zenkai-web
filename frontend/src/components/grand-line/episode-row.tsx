import Link from "next/link";
import { BookOpen, Tv, Clock, ExternalLink, CheckCircle2, Circle, Eye } from "lucide-react";
import type { GrandLineEpisode } from "@/lib/api/zenkai";

interface EpisodeRowProps {
  episode: GrandLineEpisode;
  arcId: string;
  arcTitle: string;
  isWatched: boolean;
  onToggleWatched: (episode: GrandLineEpisode, arcTitle: string) => Promise<void>;
  onRecordVisited: (episode: GrandLineEpisode, arcTitle: string) => Promise<void>;
}

export function EpisodeRow({
  episode,
  arcId,
  arcTitle,
  isWatched,
  onToggleWatched,
  onRecordVisited,
}: EpisodeRowProps) {
  return (
    <div
      className={`group relative flex flex-col gap-3 rounded-2xl border p-4 md:p-5 transition-all ${
        isWatched
          ? "border-emerald-500/20 bg-emerald-950/10"
          : "border-white/10 bg-zinc-900/50 hover:border-amber-500/30 hover:bg-zinc-900/80"
      }`}
    >
      {/* Top Header: Ep Number, Title, Watched Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
              isWatched
                ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                : "bg-white/10 text-zinc-300 ring-1 ring-white/10 group-hover:bg-amber-500/20 group-hover:text-amber-300"
            }`}
          >
            {episode.episodeNumber}
          </span>
          <div>
            <Link
              href={`/grand-line/${arcId}/${episode.episodeNumber}`}
              onClick={() => void onRecordVisited(episode, arcTitle)}
              className="font-display text-sm font-semibold text-white transition hover:text-amber-300 md:text-base"
            >
              {episode.title}
            </Link>
          </div>
        </div>

        {/* Watched Toggle Button */}
        <button
          type="button"
          onClick={() => void onToggleWatched(episode, arcTitle)}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
            isWatched
              ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
              : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
          }`}
          title={isWatched ? "Mark unwatched" : "Mark as watched"}
        >
          {isWatched ? (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              <span>Watched</span>
            </>
          ) : (
            <>
              <Circle className="size-3.5 text-zinc-500" />
              <span>Mark Watched</span>
            </>
          )}
        </button>
      </div>

      {/* Synopsis if available */}
      {episode.synopsis && (
        <p className="text-xs leading-relaxed text-zinc-300 line-clamp-2 md:line-clamp-3">
          {episode.synopsis}
        </p>
      )}

      {/* Metadata Badges & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 text-sky-300 font-medium">
            <BookOpen className="size-3.5 text-sky-400" />
            <span>Manga Ch. {episode.mangaChapters}</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
            <Tv className="size-3.5 text-emerald-400" />
            <span>Anime Ep. {episode.animeEpisodes}</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Clock className="size-3.5 text-zinc-500" />
            <span>{episode.duration}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Detailed view */}
          <Link
            href={`/grand-line/${arcId}/${episode.episodeNumber}`}
            onClick={() => void onRecordVisited(episode, arcTitle)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <Eye className="size-3" />
            <span>Details</span>
          </Link>

          {/* Official Watch Link Action */}
          <a
            href={episode.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void onRecordVisited(episode, arcTitle)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95 shadow-sm"
          >
            <span>Watch on One Pace</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

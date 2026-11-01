import Link from "next/link";
import { Play, CheckCircle2, Navigation, ArrowRight } from "lucide-react";

interface ContinueVoyageProps {
  lastVisited: {
    id: string;
    arcId: string;
    episodeNumber: string;
    title: string;
    completed: boolean;
    updatedAt: number;
  } | null;
}

export function ContinueVoyageCard({ lastVisited }: ContinueVoyageProps) {
  if (!lastVisited) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
            <Navigation className="size-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-white">Begin Your Voyage</h3>
            <p className="text-xs text-zinc-400">Start from the beginning at Romance Dawn with Straw Hat Luffy.</p>
          </div>
        </div>
        <Link
          href="/grand-line/romance-dawn"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95"
        >
          <span>Set Sail (Romance Dawn)</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  const formattedDate = new Date(lastVisited.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 via-zinc-900/80 to-zinc-900/40 p-5 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40">
          <Play className="size-5 fill-amber-300" />
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <span>Continue Voyage</span>
            <span>•</span>
            <span className="text-zinc-400">{formattedDate}</span>
            {lastVisited.completed && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-300">
                <CheckCircle2 className="size-2.5" /> Watched
              </span>
            )}
          </div>
          <h3 className="font-display text-base font-semibold text-white">
            {lastVisited.title}
          </h3>
          <p className="text-xs text-zinc-400">
            Episode {lastVisited.episodeNumber} in Arc <span className="capitalize">{lastVisited.arcId.replace(/-/g, " ")}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 w-full sm:w-auto">
        <Link
          href={`/grand-line/${lastVisited.arcId}/${lastVisited.episodeNumber}`}
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95 shadow-md shadow-amber-500/20"
        >
          <Play className="size-3.5 fill-current" />
          <span>Resume Episode {lastVisited.episodeNumber}</span>
        </Link>
        <Link
          href={`/grand-line/${lastVisited.arcId}`}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          Arc View
        </Link>
      </div>
    </div>
  );
}

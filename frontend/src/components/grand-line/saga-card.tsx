import Link from "next/link";
import { Compass, BookOpen, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import type { GrandLineSaga, GrandLineArcSummary } from "@/lib/api/zenkai";

interface SagaCardProps {
  saga: GrandLineSaga;
  isWatched?: (arcId: string, episodeNumber: string) => boolean;
}

export function SagaCard({ saga, isWatched }: SagaCardProps) {
  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-zinc-900/40 p-5 md:p-6 backdrop-blur-md transition-all hover:border-amber-500/30 hover:bg-zinc-900/60 shadow-lg">
      {/* Saga Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <span>Saga {saga.order.toString().padStart(2, "0")}</span>
            <span>•</span>
            <span className="text-zinc-400">{saga.arcCount} Arcs</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white md:text-2xl">
            {saga.name}
          </h2>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-300">
          {saga.episodeCount} Episodes
        </div>
      </div>

      {/* Arcs List */}
      <div className="mt-5 space-y-2.5">
        {saga.arcs.map((arc) => (
          <Link
            key={arc.id}
            href={`/grand-line/${arc.id}`}
            className="group flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/40 p-3 transition-all hover:border-amber-500/30 hover:bg-zinc-900/80 hover:translate-x-1"
          >
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold text-white group-hover:text-amber-300 truncate">
                  {arc.title}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-zinc-400">
                  ({arc.episodeCount} eps)
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                <span className="truncate">Ch. {arc.mangaChapters}</span>
                <span>•</span>
                <span className="truncate">{arc.duration}</span>
              </div>
            </div>

            <ChevronRight className="size-4 shrink-0 text-zinc-500 transition-transform group-hover:text-amber-400 group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

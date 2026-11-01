import Link from "next/link";
import { Compass, ExternalLink, Sparkles, ShieldCheck, Clock, BookOpen, Film } from "lucide-react";

interface GrandLineHeroProps {
  sagasCount?: number;
  arcsCount?: number;
  episodesCount?: number;
  watchedCount?: number;
}

export function GrandLineHero({
  sagasCount = 11,
  arcsCount = 38,
  episodesCount = 477,
  watchedCount = 0,
}: GrandLineHeroProps) {
  const percentComplete = episodesCount > 0 ? Math.round((watchedCount / episodesCount) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 via-zinc-950 to-zinc-900/90 p-6 md:p-10 shadow-2xl backdrop-blur-xl">
      {/* Decorative Nautical Background Elements */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-80 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 size-72 rounded-full bg-sky-600/10 blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 opacity-5">
        <Compass className="size-96" />
      </div>

      <div className="relative z-10 flex flex-col gap-6">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <Compass className="size-3.5 animate-spin-slow" />
            <span>Zenkai Grand Line</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span>Verified Official One Pace Index</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <Sparkles className="size-3.5 text-sky-400" />
            <span>~45% Pacing Reduction</span>
          </div>
        </div>

        {/* Headline & Description */}
        <div className="max-w-3xl space-y-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
            Experience the Odyssey <br />
            <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Manga-Paced & Pure
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-zinc-300 md:text-base">
            The canonical fan-edit of Eiichiro Oda&apos;s masterpiece. Filler scenes, lingering reactions, and padded recap sequences are seamlessly trimmed to match the pacing and choreography of the original manga.
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:max-w-2xl">
          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Film className="size-3.5 text-amber-400" />
              <span>Sagas</span>
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-white">{sagasCount}</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Compass className="size-3.5 text-amber-400" />
              <span>Story Arcs</span>
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-white">{arcsCount}</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <BookOpen className="size-3.5 text-amber-400" />
              <span>Paced Episodes</span>
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-white">{episodesCount}</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Clock className="size-3.5 text-amber-400" />
              <span>Hours Saved</span>
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-emerald-400">~150+ hrs</div>
          </div>
        </div>

        {/* Progress Bar & Official Source Link */}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-zinc-400">
              Your Voyage: <span className="font-bold text-white">{watchedCount}</span> / {episodesCount} ({percentComplete}%)
            </div>
            <div className="h-2 w-32 md:w-48 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          <a
            href="https://onepace.net/en"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-amber-300"
          >
            <span>Official One Pace Project</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

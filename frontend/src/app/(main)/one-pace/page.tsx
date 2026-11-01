"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  ShieldCheck,
  Tv,
  Download,
  Info,
  Users,
  Compass,
  RefreshCw,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

export default function OnePacePage() {
  const [embedMode, setEmbedMode] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const officialUrl = "https://onepace.net/en";
  const officialWatchUrl = "https://onepace.net/en/watch";
  const officialReleasesUrl = "https://onepace.net/en/releases";
  const officialAboutUrl = "https://onepace.net/en/about";
  const officialCommunityUrl = "https://onepace.carrd.co";

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header */}
      <PageHeader
        title="One Pace"
        description="The definitive, manga-accurate fan edit of the One Piece anime. Cut to match Eiichiro Oda's original pacing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEmbedMode(!embedMode);
                setFrameLoaded(false);
              }}
              className="glass rounded-xl text-xs font-semibold gap-1.5"
            >
              {embedMode ? (
                <>
                  <Info className="size-3.5" />
                  <span>Portal View</span>
                </>
              ) : (
                <>
                  <Tv className="size-3.5" />
                  <span>Try Embed Frame</span>
                </>
              )}
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-xl bg-[#c8102e] hover:bg-[#a00d24] text-white font-semibold text-xs gap-1.5 shadow-lg shadow-red-700/20"
            >
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Launch official site"
              >
                <span>Open Official Site</span>
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        }
      />

      {/* Main Content Area */}
      {embedMode ? (
        /* Phase 3 & Phase 4: Embedded Frame with Graceful Fallback */
        <div className="flex flex-col gap-4">
          <div className="relative flex aspect-video min-h-[500px] w-full flex-col overflow-hidden rounded-2xl bg-[#08080c] shadow-2xl ring-1 ring-white/10">
            {/* Top Toolbar */}
            <div className="z-20 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-2.5 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-lg bg-red-600/20 p-1 ring-1 ring-red-500/30">
                  <GlobeIcon className="size-3.5 text-red-400" />
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white tracking-wide">
                    onepace.net/en
                  </span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-amber-300 ring-1 ring-amber-500/30">
                    X-Frame-Options Enforced
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setFrameLoaded(false);
                    setReloadKey((prev) => prev + 1);
                  }}
                  title="Reload Frame"
                  className="flex size-7 items-center justify-center rounded-lg bg-white/10 text-zinc-300 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="flex size-7 items-center justify-center rounded-lg bg-white/10 text-zinc-300 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>

            {/* Loading Indicator */}
            {!frameLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#08080c] backdrop-blur-sm">
                <Loader2 className="size-8 animate-spin text-red-500" />
                <span className="text-xs text-zinc-400">Loading onepace.net frame...</span>
              </div>
            )}

            {/* Embedded Iframe */}
            <iframe
              key={reloadKey}
              src={officialUrl}
              title="Official One Pace Website"
              className="h-full w-full flex-1 border-0 bg-transparent"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              onLoad={() => setFrameLoaded(true)}
            />

            {/* Browser Security Block Notice Overlay */}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-xl border border-amber-500/30 bg-black/90 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <AlertCircle className="size-5 shrink-0 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">
                    Embedding Notice: Browser Security Active
                  </span>
                  <p className="text-[0.7rem] text-zinc-400">
                    The official One Pace server sets <code className="text-amber-300">X-Frame-Options: SAMEORIGIN</code>. If your browser blocks this frame, launch directly below.
                  </p>
                </div>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <Button
                  size="sm"
                  asChild
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs gap-1"
                >
                  <a href={officialUrl} target="_blank" rel="noopener noreferrer">
                    <span>Open in New Tab</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Phase 4 & Phase 5: High-Fidelity Official Portal & Fallback Hub */
        <div className="flex flex-col gap-8">
          {/* Official Launch Hero Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-red-950/40 via-zinc-950 to-zinc-900/90 p-6 md:p-10 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-red-600/20 text-red-400 ring-1 ring-red-500/40">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                      Verified Official Source
                    </span>
                    <span className="text-xs font-semibold text-zinc-300">
                      onepace.net/en
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-400">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Direct Project Mirror</span>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-2xl font-black text-white sm:text-3xl md:text-4xl">
                  Watch One Pace on the Official Platform
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
                  One Pace cuts out filler scenes, pacing padding, and animation errors from the original anime adaptation, condensing over 1,000 episodes into a streamlined, manga-faithful experience.
                </p>
              </div>

              {/* Security & Access Information */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                    <Info className="size-4" />
                  </div>
                  <div className="text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-200">Frame Policy Notice: </span>
                    <span>
                      The official One Pace site enforces <code className="rounded bg-white/10 px-1 py-0.5 text-amber-300">X-Frame-Options: SAMEORIGIN</code> to safeguard stream security. Zenkai honors this policy directly.
                    </span>
                  </div>
                </div>

                <Button
                  asChild
                  size="lg"
                  className="w-full sm:w-auto shrink-0 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm gap-2 shadow-lg shadow-red-700/30"
                >
                  <a
                    href={officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>Launch on One Pace</span>
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Official Site Navigation Shortcuts */}
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                Official Project Destinations
              </h3>
              <p className="text-xs text-zinc-400">
                Direct access to official viewing sections, downloads, and project documentation.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Watch Portal */}
              <a
                href={officialWatchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all hover:border-amber-500/30 hover:bg-zinc-900/60 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform">
                    <Tv className="size-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm group-hover:text-amber-300 transition-colors">
                      Watch & Sagas Hub
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      Stream all 11 sagas from the East Blue to Egghead Island with PixelDrain mirrors.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <span>Open Watch Portal</span>
                  <ExternalLink className="size-3" />
                </div>
              </a>

              {/* Releases & Downloads */}
              <a
                href={officialReleasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all hover:border-amber-500/30 hover:bg-zinc-900/60 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
                    <Download className="size-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm group-hover:text-amber-300 transition-colors">
                      Releases & Torrents
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      High-speed torrent magnet links, batch saga downloads, and RSS releases.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <span>Browse Downloads</span>
                  <ExternalLink className="size-3" />
                </div>
              </a>

              {/* About the Edit */}
              <a
                href={officialAboutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all hover:border-amber-500/30 hover:bg-zinc-900/60 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
                    <Info className="size-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm group-hover:text-amber-300 transition-colors">
                      About the Project
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      How the team eliminates filler scenes, corrects dialogue, and restructures audio.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <span>Read About One Pace</span>
                  <ExternalLink className="size-3" />
                </div>
              </a>

              {/* Community & Discord */}
              <a
                href={officialCommunityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all hover:border-amber-500/30 hover:bg-zinc-900/60 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform">
                    <Users className="size-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm group-hover:text-amber-300 transition-colors">
                      Community & Carrd
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                      Official Discord guides, viewing order charts, translation teams, and FAQ.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <span>Community Carrd</span>
                  <ExternalLink className="size-3" />
                </div>
              </a>
            </div>
          </div>

          {/* Integrated Grand Line Bridge */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-950/20 via-zinc-950 to-zinc-900/60 p-6 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40">
                  <Compass className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      Zenkai Grand Line Voyage Tracker
                    </span>
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-amber-400">
                      In-App
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Track your One Pace progress across sagas, search by manga chapters, and mark episodes as completed inside Zenkai.
                  </p>
                </div>
              </div>

              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto glass rounded-xl text-xs font-semibold gap-1.5 hover:border-amber-500/40"
              >
                <Link href="/grand-line">
                  <Sparkles className="size-3.5 text-amber-400" />
                  <span>Open Grand Line Tracker</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

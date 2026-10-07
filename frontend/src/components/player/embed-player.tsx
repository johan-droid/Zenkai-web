"use client";

import { useRef, useState, useCallback } from "react";
import { ExternalLink, Maximize2, RefreshCw } from "lucide-react";
import type { PlaybackExecution } from "@/lib/api/zenkai";

export interface EmbedPlayerProps {
  execution: PlaybackExecution & { kind: "embed" };
  title?: string;
  episodeNumber?: number;
  onNext?: () => void;
  hasNext?: boolean;
}

/**
 * Zenkai CinePlayer Embed Player (P6/P8).
 *
 * Provides a clean theater wrapper around streaming mirrors:
 * - Top chrome with Zenkai logo, active server badge & audio track
 * - Instant reload button for stalled buffers
 * - Direct popout and full-screen controls
 * - High-speed iframe sandbox with full multimedia permissions
 */
export function EmbedPlayer({
  execution,
  title,
  episodeNumber,
}: EmbedPlayerProps) {
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleReload = useCallback(() => {
    setLoaded(false);
    setReloadKey((prev) => prev + 1);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current.requestFullscreen?.();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="group relative flex aspect-video w-full flex-col overflow-hidden rounded-2xl bg-[#08080c] shadow-2xl ring-1 ring-white/10"
    >
      {/* Top CinePlayer Theater Bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent p-3 opacity-90 transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-lg bg-red-600/20 p-1 ring-1 ring-red-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 884 457"
              role="img"
              aria-label="Zenkai logo"
              className="h-full w-full"
            >
              <path fill="#c8102e" d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z" />
              <path fill="#f2f2f2" d="M884 0h-93L248 377h93L884 0Z" />
            </svg>
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
              {execution.providerName || execution.providerSlug}
            </span>
            <span className="rounded-md bg-red-600/30 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-red-300 ring-1 ring-red-500/30">
              {execution.language.toUpperCase()}
            </span>
            {episodeNumber ? (
              <span className="text-xs font-medium text-zinc-300">
                EP {episodeNumber}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReload}
            title="Reload Embed Stream"
            className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <a
            href={execution.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new window"
            className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
          >
            <ExternalLink className="size-3.5" />
          </a>
          <button
            type="button"
            onClick={handleFullscreen}
            title="Fullscreen"
            className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0a0f] backdrop-blur-sm">
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 p-2.5 shadow-lg shadow-red-700/30 animate-pulse">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 884 457"
              role="img"
              aria-label="Zenkai logo"
              className="h-full w-full"
            >
              <path fill="#ffffff" d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z" />
              <path fill="#f2f2f2" d="M884 0h-93L248 377h93L884 0Z" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-sm font-semibold tracking-wide text-white">
              Connecting to {execution.providerName || "Stream Server"}...
            </span>
            <span className="text-xs text-zinc-400">
              Loading CinePlayer stream ({execution.language.toUpperCase()})
            </span>
          </div>
        </div>
      )}

      {/* The Iframe */}
      <iframe
        key={reloadKey}
        src={execution.url}
        title={title ? `${title} - Episode ${episodeNumber ?? ""}` : "Zenkai CinePlayer"}
        className="absolute inset-0 h-full w-full border-0"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

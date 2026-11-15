"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ExternalLink, Maximize2, RefreshCw, ShieldAlert } from "lucide-react";
import type { PlaybackExecution } from "@/lib/api/zenkai";

export interface EmbedPlayerProps {
  execution: PlaybackExecution & { kind: "embed" };
  title?: string;
  episodeNumber?: number;
  onNext?: () => void;
  hasNext?: boolean;
}

/**
 * Strict provider origin allowlist for isolated embed streaming.
 * Rejects unverified third-party ad networks, pop-under origins, and malicious redirects.
 */
export const ALLOWED_EMBED_ORIGINS = [
  "cdn.4animo.xyz",
  "flixera.co",
  "zangetsu.cc",
  "megacloud.tv",
  "rapid-cloud.ru",
  "rabbitstream.net",
  "animesalt.cc",
  "animesalt.to",
  "novuscloud.buzz",
  "megaplay.buzz",
];

export function isAllowedEmbedOrigin(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_EMBED_ORIGINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

/**
 * Validates that an embed URL is structurally safe:
 * - Scheme must be http or https (no file:, javascript:, data:, blob:)
 * - Host must not be localhost, loopback, or RFC-1918 private subnets
 * - Domain must match the approved provider allowlist
 */
export function isSafeEmbedUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172.16.") ||
      host.startsWith("172.17.") ||
      host.startsWith("172.18.") ||
      host.startsWith("172.19.") ||
      host.startsWith("172.2") ||
      host.startsWith("172.30.") ||
      host.startsWith("172.31.")
    ) {
      return false;
    }
    return isAllowedEmbedOrigin(rawUrl);
  } catch {
    return false;
  }
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
function EmbedPlayerInner({
  execution,
  title,
  episodeNumber,
  onReload,
}: {
  execution: PlaybackExecution & { kind: "embed" };
  title?: string;
  episodeNumber?: number;
  onReload: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOriginAllowed = useMemo(() => isSafeEmbedUrl(execution.url), [execution.url]);

  const handleOpenExternal = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!execution.url || !isSafeEmbedUrl(execution.url)) return;
      const proceed = window.confirm(
        "Notice: You are leaving Zenkai's isolated player to open an external third-party stream. External websites may contain unverified content, popups, or ads. Do you wish to proceed?",
      );
      if (proceed) {
        window.open(execution.url, "_blank", "noopener,noreferrer");
      }
    },
    [execution.url],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 12000);
    return () => clearTimeout(timer);
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
            onClick={onReload}
            title="Reload Embed Stream"
            className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className="size-3.5" />
          </button>
          {execution.url && !execution.url.startsWith("file:") && (
            <button
              type="button"
              onClick={handleOpenExternal}
              title="Open in new window (isolated)"
              className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
            >
              <ExternalLink className="size-3.5" />
            </button>
          )}
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

      {!isOriginAllowed ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0a0f] p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
            <ShieldAlert className="size-6" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-sm font-semibold text-white">External Embed Provider Blocked</h4>
            <p className="text-xs text-zinc-400">
              The provider origin is not on Zenkai&apos;s approved ad-free allowlist. For your security and to prevent unverified popups, this embed has been quarantined.
            </p>
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-500">
            {execution.url ? new URL(execution.url).hostname : "unknown"}
          </div>
        </div>
      ) : (
        <>
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

              {timedOut && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onReload}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                  >
                    Reload Mirror
                  </button>
                  {execution.url && !execution.url.startsWith("file:") && (
                    <button
                      type="button"
                      onClick={handleOpenExternal}
                      className="rounded-xl border border-[#c8102e]/50 bg-[#c8102e]/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-[#c8102e]/40 transition-colors"
                    >
                      Open in New Tab
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sandboxed Isolated Iframe */}
          {execution.url && !execution.url.startsWith("file:") ? (
            <iframe
              src={execution.url}
              title={title ? `${title} - Episode ${episodeNumber ?? ""}` : "Zenkai CinePlayer"}
              className="absolute inset-0 h-full w-full border-0"
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              onLoad={() => setLoaded(true)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export function EmbedPlayer({
  execution,
  title,
  episodeNumber,
}: EmbedPlayerProps) {
  const [reloadKey, setReloadKey] = useState(0);

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
  }, []);

  return (
    <EmbedPlayerInner
      key={`${execution.url}-${reloadKey}`}
      execution={execution}
      title={title}
      episodeNumber={episodeNumber}
      onReload={handleReload}
    />
  );
}

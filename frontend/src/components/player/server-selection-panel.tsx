"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Radio,
  RotateCw,
  Server,
  Star,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  PlaybackLanguage,
  PlaybackPlan,
  ServerAvailabilityItem,
  ServerStatus,
} from "@/lib/api/zenkai";
import { usePlayerStore } from "@/stores/player";
import { cn } from "@/lib/utils";

const LANGUAGES: { value: PlaybackLanguage; label: string }[] = [
  { value: "sub", label: "Sub" },
  { value: "dub", label: "Dub" },
  { value: "multi", label: "Multi" },
];

export interface ServerSelectionPanelProps {
  plans: PlaybackPlan[];
  servers?: ServerAvailabilityItem[];
  selectedSourceId: string | null;
  loading: boolean;
  isRefreshing?: boolean;
  language: PlaybackLanguage;
  onSelect: (sourceId: string, serverName?: string) => void;
  onLanguageChange: (language: PlaybackLanguage) => void;
  onRefresh?: () => void;
  triggerClassName?: string;
}

export function ServerSelectionPanel({
  plans,
  servers = [],
  selectedSourceId,
  loading,
  isRefreshing = false,
  language,
  onSelect,
  onLanguageChange,
  onRefresh,
  triggerClassName,
}: ServerSelectionPanelProps) {
  const [open, setOpen] = useState(false);

  const preferredServer = usePlayerStore((s) => s.preferredServer);
  const setPreferredServer = usePlayerStore((s) => s.setPreferredServer);
  const autoServerFallback = usePlayerStore((s) => s.autoServerFallback);
  const setAutoServerFallback = usePlayerStore((s) => s.setAutoServerFallback);

  const activePlan = plans.find((plan) => plan.sourceId === selectedSourceId);
  const activeServerInfo = servers.find(
    (s) =>
      s.sourceId === selectedSourceId ||
      s.serverId === activePlan?.endpointSlug ||
      s.name === activePlan?.endpointSlug,
  );

  const activeDisplayName =
    activeServerInfo?.displayName ||
    activeServerInfo?.serverName ||
    activePlan?.providerName ||
    "Servers";

  // Synthesize or normalize server entries so every plan or server is accounted for
  const serverEntries = normalizeServerEntries(plans, servers, language);

  const availableCount = serverEntries.filter((s) => s.status === "AVAILABLE").length;
  const totalCount = serverEntries.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "group relative flex items-center gap-2.5 rounded-xl border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.07]",
            triggerClassName,
          )}
          title="Playback server selection and availability"
        >
          {loading ? (
            <RotateCw className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="relative flex size-2.5">
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-75",
                  activeServerInfo?.status === "DEGRADED"
                    ? "bg-amber-400"
                    : activeServerInfo?.status === "UNAVAILABLE" || activeServerInfo?.status === "ERROR"
                      ? "bg-red-400"
                      : "bg-emerald-400",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  activeServerInfo?.status === "DEGRADED"
                    ? "bg-amber-500"
                    : activeServerInfo?.status === "UNAVAILABLE" || activeServerInfo?.status === "ERROR"
                      ? "bg-red-500"
                      : "bg-emerald-500",
                )}
              />
            </span>
          )}

          <Server className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span className="max-w-36 truncate">{activeDisplayName}</span>
          {activePlan?.quality && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white/80">
              {activePlan.quality}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl rounded-2xl border-white/[0.08] bg-[#0c0d12]/95 p-6 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="gap-1.5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#c8102e]/30 to-black/50 border border-white/10">
                <Radio className="size-4 text-[#e52545]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                  Playback Servers
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  Switch stream sources and inspect dynamic server reachability
                </DialogDescription>
              </div>
            </div>

            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-8 gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 text-xs text-zinc-300 hover:bg-white/[0.08]"
                title="Force refresh server status"
              >
                <RotateCw className={cn("size-3.5", isRefreshing && "animate-spin text-[#e52545]")} />
                <span>{isRefreshing ? "Checking..." : "Refresh"}</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Audio Track Selector & Server Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-white/[0.06] py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Audio Track:</span>
            <div className="flex gap-1 rounded-lg bg-black/40 p-1 border border-white/5">
              {LANGUAGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onLanguageChange(option.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-all",
                    language === option.value
                      ? "bg-[#c8102e] text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {availableCount} of {totalCount} Available
            </span>
          </div>
        </div>

        {/* Server List */}
        <div className="mt-2 flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
          {serverEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <WifiOff className="size-8 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No servers discovered for this episode</p>
              <p className="text-xs text-zinc-500">Try changing audio track or refresh availability</p>
            </div>
          ) : (
            serverEntries.map((item) => {
              const isCurrent = activePlan && (item.sourceId === selectedSourceId || item.name === activePlan.endpointSlug);
              const isPreferred = preferredServer && (preferredServer === item.name || preferredServer === item.serverId);

              return (
                <ServerCard
                  key={item.serverId || item.name}
                  item={item}
                  isCurrent={Boolean(isCurrent)}
                  isPreferred={Boolean(isPreferred)}
                  onSelect={() => {
                    if (item.selectable && item.sourceId) {
                      onSelect(item.sourceId, item.displayName || item.serverName);
                      setOpen(false);
                    }
                  }}
                  onTogglePreferred={() => {
                    const identifier = item.serverId || item.name;
                    setPreferredServer(isPreferred ? null : identifier);
                  }}
                />
              );
            })
          )}
        </div>

        {/* Preferences & Automation Section */}
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-[#e52545]" />
              <span className="font-medium text-zinc-200">Auto-Switch on Playback Error</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoServerFallback}
              onClick={() => setAutoServerFallback(!autoServerFallback)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                autoServerFallback ? "bg-[#c8102e]" : "bg-zinc-700",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  autoServerFallback ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>
          <p className="text-[0.7rem] text-zinc-400">
            Automatically failover to the next healthy verified server and preserve your exact watch position if current stream encounters an error.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface NormalizedServerEntry {
  serverId: string;
  sourceId?: string;
  name: string;
  serverName: string;
  displayName: string;
  status: ServerStatus;
  statusMessage?: string;
  quality?: string;
  type: "hls" | "embed" | "mp4";
  selectable: boolean;
  sub: boolean;
  dub: boolean;
  diagnosticCategory?: string;
}

function normalizeServerEntries(
  plans: PlaybackPlan[],
  servers: ServerAvailabilityItem[],
  language: PlaybackLanguage,
): NormalizedServerEntry[] {
  const result: NormalizedServerEntry[] = [];
  const processedNames = new Set<string>();

  // 1. Process server availability items reported by backend
  for (const s of servers) {
    processedNames.add(s.name);
    processedNames.add(s.serverId || "");

    const matchingPlan = plans.find(
      (p) =>
        p.endpointSlug === s.name ||
        p.sourceId === s.sourceId ||
        p.endpointSlug === s.serverId,
    );

    const servesLang =
      language === "multi"
        ? s.sub || s.dub
        : language === "dub"
          ? s.dub
          : s.sub;

    const status: ServerStatus = !servesLang
      ? "UNAVAILABLE"
      : s.status || "AVAILABLE";

    result.push({
      serverId: s.serverId || s.name,
      sourceId: s.sourceId || matchingPlan?.sourceId,
      name: s.name,
      serverName: s.serverName || s.name,
      displayName: s.displayName || s.label || s.serverName || s.name,
      status,
      statusMessage: !servesLang
        ? `No ${language.toUpperCase()} track available`
        : s.statusMessage,
      quality: s.quality || matchingPlan?.quality || (matchingPlan?.resolution ? `${matchingPlan.resolution}p` : undefined),
      type: s.type || (matchingPlan?.mechanism === "iframe" ? "embed" : "hls"),
      selectable: servesLang && (s.selectable !== false) && status !== "UNAVAILABLE" && Boolean(matchingPlan || s.sourceId),
      sub: s.sub,
      dub: s.dub,
      diagnosticCategory: s.diagnosticCategory,
    });
  }

  // 2. Add any plans not explicitly in servers array
  for (const plan of plans) {
    if (!processedNames.has(plan.endpointSlug) && !processedNames.has(plan.sourceId)) {
      result.push({
        serverId: plan.endpointSlug,
        sourceId: plan.sourceId,
        name: plan.endpointSlug,
        serverName: plan.providerName,
        displayName: plan.providerName,
        status: plan.validated ? "AVAILABLE" : "UNKNOWN",
        quality: plan.quality || (plan.resolution ? `${plan.resolution}p` : undefined),
        type: plan.mechanism === "iframe" ? "embed" : "hls",
        selectable: true,
        sub: plan.language === "sub",
        dub: plan.language === "dub",
      });
    }
  }

  return result;
}

function ServerCard({
  item,
  isCurrent,
  isPreferred,
  onSelect,
  onTogglePreferred,
}: {
  item: NormalizedServerEntry;
  isCurrent: boolean;
  isPreferred: boolean;
  onSelect: () => void;
  onTogglePreferred: () => void;
}) {
  const isAvailable = item.status === "AVAILABLE";
  const isDegraded = item.status === "DEGRADED";
  const isChecking = item.status === "CHECKING";
  const isUnavailable = item.status === "UNAVAILABLE" || item.status === "ERROR";

  return (
    <div
      onClick={() => {
        if (item.selectable) onSelect();
      }}
      className={cn(
        "group relative flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all",
        isCurrent
          ? "border-[#c8102e]/60 bg-[#c8102e]/10 shadow-[0_0_15px_rgba(200,16,46,0.15)]"
          : item.selectable
            ? "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05] cursor-pointer"
            : "border-white/[0.04] bg-white/[0.01] opacity-45 cursor-not-allowed",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Status Dot */}
        <div className="relative flex size-3 shrink-0 items-center justify-center">
          {isAvailable && (
            <>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </>
          )}
          {isDegraded && (
            <span className="relative inline-flex size-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          )}
          {isChecking && (
            <RotateCw className="size-3 animate-spin text-blue-400" />
          )}
          {isUnavailable && (
            <span className="relative inline-flex size-2 rounded-full bg-zinc-600" />
          )}
        </div>

        {/* Server Info */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-sm font-semibold", isCurrent ? "text-white" : "text-zinc-200")}>
              {item.displayName}
            </span>

            {/* Badges */}
            {isCurrent && (
              <span className="rounded-full bg-[#c8102e] px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase shadow-sm">
                Playing Now
              </span>
            )}

            {isPreferred && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 border border-amber-500/30">
                <Star className="size-2.5 fill-amber-300" />
                Preferred
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            {item.quality && (
              <span className="rounded bg-white/10 px-1.5 py-0.2 text-[0.65rem] font-medium text-zinc-300">
                {item.quality}
              </span>
            )}

            <span className="text-[0.7rem] uppercase text-zinc-500">
              {item.type === "embed" ? "Embed Player" : "HLS Direct"}
            </span>

            <div className="flex items-center gap-1">
              <TrackBadge track="SUB" on={item.sub} />
              <TrackBadge track="DUB" on={item.dub} />
            </div>

            {isDegraded && (
              <span className="flex items-center gap-1 text-[0.7rem] text-amber-400">
                <AlertTriangle className="size-3" />
                Degraded upstream
              </span>
            )}

            {isUnavailable && item.statusMessage && (
              <span className="truncate text-[0.7rem] text-zinc-500">
                {item.statusMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Toggle Preferred Button */}
        <button
          type="button"
          onClick={onTogglePreferred}
          title={isPreferred ? "Remove preferred server" : "Set as preferred server"}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-all",
            isPreferred
              ? "border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
              : "border-white/5 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300",
          )}
        >
          <Star className={cn("size-3.5", isPreferred && "fill-amber-300")} />
        </button>

        {/* Switch / Selected Indicator */}
        {isCurrent ? (
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#c8102e]/20 text-[#e52545]">
            <Check className="size-4" />
          </div>
        ) : item.selectable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onSelect}
            className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-2.5 text-xs font-medium hover:bg-white/[0.1] hover:text-white"
          >
            Switch
          </Button>
        ) : (
          <div className="flex size-8 items-center justify-center text-zinc-600">
            <WifiOff className="size-4" />
          </div>
        )}
      </div>
    </div>
  );
}

function TrackBadge({ track, on }: { track: "SUB" | "DUB"; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[0.6rem] font-bold tracking-wider",
        on
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
          : "bg-white/5 text-zinc-600 line-through",
      )}
    >
      {track}
    </span>
  );
}

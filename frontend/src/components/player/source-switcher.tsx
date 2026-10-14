"use client";

import { Check, Loader2, Server, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  PlaybackLanguage,
  PlaybackPlan,
  ServerAvailability,
} from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

/** The canonical audio shelves — the only language values the watch path sends. */
const LANGUAGES: { value: PlaybackLanguage; label: string }[] = [
  { value: "sub", label: "Sub" },
  { value: "dub", label: "Dub" },
  { value: "multi", label: "Multi" },
];

/**
 * Server picker with pre-checked availability.
 *
 * `servers` is the backend's per-episode availability report: every server the
 * provider knows, with its sub/dub flags for THIS episode. A server missing a
 * track renders dulled and disabled — the user can never pick a combination
 * the episode does not serve. Plans resolve the (server, language) choice to
 * the canonical sourceId the execute call needs.
 *
 * When the backend reports no availability (older response, other providers),
 * the picker degrades to the flat plan list rather than inventing states.
 */
export function SourceSwitcher({
  plans,
  servers,
  selectedSourceId,
  loading,
  language,
  onSelect,
  onLanguageChange,
}: {
  plans: PlaybackPlan[];
  servers?: ServerAvailability[];
  selectedSourceId: string | null;
  loading: boolean;
  language: PlaybackLanguage;
  onSelect: (sourceId: string) => void;
  onLanguageChange: (language: PlaybackLanguage) => void;
}) {
  const active = plans.find((plan) => plan.sourceId === selectedSourceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.03]">
          {loading ? <Loader2 className="animate-spin" /> : <Server />}
          <span className="max-w-40 truncate">{active?.providerName ?? "Sources"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl border-white/[0.08] bg-[#0e0e14]/95 backdrop-blur-2xl">
        <DropdownMenuLabel>Server</DropdownMenuLabel>
        {servers && servers.length > 0 ? (
          servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              plans={plans}
              language={language}
              selectedSourceId={selectedSourceId}
              onSelect={onSelect}
              onLanguageChange={onLanguageChange}
            />
          ))
        ) : plans.length === 0 ? (
          <DropdownMenuItem disabled>No sources available</DropdownMenuItem>
        ) : (
          plans.map((plan) => (
            <DropdownMenuItem
              key={plan.sourceId}
              onSelect={() => onSelect(plan.sourceId)}
              className="gap-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{plan.providerName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {plan.quality ?? (plan.resolution ? `${plan.resolution}p` : "Standard")}
                </span>
              </span>
              {plan.sourceId === selectedSourceId ? <Check className="size-4 text-[#e52545]" /> : null}
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <div className="flex gap-1 p-1">
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onLanguageChange(option.value)}
              aria-pressed={language === option.value}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium uppercase transition-colors",
                language === option.value
                  ? "bg-[#c8102e]/25 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ServerRow({
  server,
  plans,
  language,
  selectedSourceId,
  onSelect,
  onLanguageChange,
}: {
  server: ServerAvailability;
  plans: PlaybackPlan[];
  language: PlaybackLanguage;
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
  onLanguageChange: (language: PlaybackLanguage) => void;
}) {
  // The effective track: the current language when the server serves it,
  // otherwise the other track the server does serve (multi serves both).
  const servesCurrent =
    language === "multi" ? server.sub || server.dub : server[language];
  const fallbackLanguage: PlaybackLanguage | null = servesCurrent
    ? null
    : server.sub
      ? "sub"
      : server.dub
        ? "dub"
        : null;
  const effectiveLanguage = servesCurrent ? language : fallbackLanguage;

  const plan =
    effectiveLanguage !== null
      ? plans.find(
          (candidate) =>
            candidate.endpointSlug === server.name &&
            (effectiveLanguage === "multi"
              ? candidate.language === "sub" || candidate.language === "dub"
              : candidate.language === effectiveLanguage),
        )
      : undefined;

  const selectable = effectiveLanguage !== null && plan !== undefined;
  const selected =
    plan !== undefined && plan.sourceId === selectedSourceId;

  return (
    <DropdownMenuItem
      disabled={!selectable}
      onSelect={() => {
        if (!selectable || !plan) return;
        if (effectiveLanguage !== null && effectiveLanguage !== language) {
          onLanguageChange(effectiveLanguage);
        }
        onSelect(plan.sourceId);
      }}
      className={cn("gap-2", !selectable && "opacity-45")}
      title={
        !selectable
          ? `${server.label} does not serve this episode`
          : undefined
      }
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-sm">
          {server.label}
          <TrackBadge track="SUB" on={server.sub} />
          <TrackBadge track="DUB" on={server.dub} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {!selectable
            ? "Unavailable for this episode"
            : plan?.quality ?? (plan?.resolution ? `${plan.resolution}p` : "Standard")}
        </span>
      </span>
      {selected ? (
        <Check className="size-4 shrink-0 text-[#e52545]" />
      ) : !selectable ? (
        <WifiOff className="size-3.5 shrink-0 text-muted-foreground/60" />
      ) : null}
    </DropdownMenuItem>
  );
}

function TrackBadge({ track, on }: { track: "SUB" | "DUB"; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[0.6rem] font-bold tracking-wider",
        on
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-white/5 text-zinc-600 line-through",
      )}
    >
      {track}
    </span>
  );
}

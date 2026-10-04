"use client";

import { Check, Loader2, Server, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SourceCandidate } from "@/lib/sources/types";
import type { AudioPreference } from "@/stores/player";
import { cn } from "@/lib/utils";

export function SourceSwitcher({
  candidates,
  activeId,
  loading,
  failures,
  audio,
  onSelect,
  onAudioChange,
}: {
  candidates: SourceCandidate[];
  activeId: string | null;
  loading: boolean;
  failures: { sourceId: string; message: string }[];
  audio: AudioPreference;
  onSelect: (candidate: SourceCandidate) => void;
  onAudioChange: (audio: AudioPreference) => void;
}) {
  const active = candidates.find((candidate) => candidate.source.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="glass rounded-xl">
          {loading ? <Loader2 className="animate-spin" /> : <Server />}
          <span className="max-w-40 truncate">{active?.source.name ?? "Sources"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-64">
        <DropdownMenuLabel>Source</DropdownMenuLabel>
        {candidates.length === 0 ? (
          <DropdownMenuItem disabled>No sources available</DropdownMenuItem>
        ) : (
          candidates.map((candidate) => {
            const failed = failures.some((failure) => failure.sourceId === candidate.source.id);
            return (
              <DropdownMenuItem
                key={candidate.source.id}
                onSelect={() => onSelect(candidate)}
                className="gap-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{candidate.source.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {candidate.kind === "direct" ? "Direct stream" : "Embed"}
                    {candidate.source.note ? ` · ${candidate.source.note}` : ""}
                  </span>
                </span>
                {failed ? <TriangleAlert className="size-3.5 text-amber-400" /> : null}
                {candidate.source.id === activeId ? <Check className="size-4 text-brand-400" /> : null}
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Audio</DropdownMenuLabel>
        <div className="flex gap-1 p-1">
          {(["sub", "dub"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAudioChange(option)}
              aria-pressed={audio === option}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium uppercase transition-colors",
                audio === option
                  ? "bg-brand-500/25 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

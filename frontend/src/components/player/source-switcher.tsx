"use client";

import { Check, Loader2, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlaybackLanguage, ServerOption } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

/** The canonical audio shelves — the only language values the watch path sends. */
const LANGUAGES: { value: PlaybackLanguage; label: string }[] = [
  { value: "sub", label: "Sub" },
  { value: "dub", label: "Dub" },
  { value: "multi", label: "Multi" },
];

export function SourceSwitcher({
  options,
  selectedSourceId,
  loading,
  language,
  onSelect,
  onLanguageChange,
}: {
  options: ServerOption[];
  selectedSourceId: string | null;
  loading: boolean;
  language: PlaybackLanguage;
  onSelect: (sourceId: string) => void;
  onLanguageChange: (language: PlaybackLanguage) => void;
}) {
  const active = options.find((option) => option.sourceId === selectedSourceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="glass rounded-xl">
          {loading ? <Loader2 className="animate-spin" /> : <Server />}
          <span className="max-w-40 truncate">{active?.label ?? "Sources"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-64">
        <DropdownMenuLabel>Server</DropdownMenuLabel>
        {options.length === 0 ? (
          <DropdownMenuItem disabled>No sources available</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuItem
              key={option.sourceId}
              onSelect={() => onSelect(option.sourceId)}
              className="gap-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{option.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {option.quality ?? (option.resolution ? `${option.resolution}p` : "Standard")}
                </span>
              </span>
              {option.sourceId === selectedSourceId ? <Check className="size-4 text-brand-400" /> : null}
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
                  ? "bg-brand-500/25 text-foreground"
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

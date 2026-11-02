"use client";

import { Search } from "lucide-react";

import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";

/**
 * Both search triggers for the one ⌘K palette: a field-shaped control from
 * `sm` up, an icon button below it.
 *
 * They share a single `SearchCommand` on purpose. Two instances meant two
 * document-level ⌘K listeners and two dialogs fighting over the same key — the
 * desktop and mobile triggers are CSS-toggled, so both were always mounted.
 */
export function HeaderSearch() {
  return (
    <SearchCommand>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Search anime and manga"
        className="hidden h-10 w-44 items-center justify-start gap-2 rounded-xl border border-white/[0.08] bg-surface-1/80 px-3 text-xs font-normal text-ink-3 transition-colors hover:border-white/20 hover:bg-surface-2 hover:text-ink-1 sm:flex lg:w-56"
      >
        <Search className="size-3.5" aria-hidden />
        <span>Search titles…</span>
        <kbd className="ml-auto hidden font-sans text-[0.65rem] tracking-normal text-ink-3/70 lg:inline">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Search anime and manga"
        className="flex size-11 items-center justify-center rounded-xl text-ink-2 hover:bg-white/[0.08] hover:text-ink-1 active:scale-95 sm:hidden"
      >
        <Search className="size-4" aria-hidden />
      </Button>
    </SearchCommand>
  );
}

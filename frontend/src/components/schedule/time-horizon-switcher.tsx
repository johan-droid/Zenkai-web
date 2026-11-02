"use client";

import { cn } from "@/lib/utils";

export type ViewMode = "today" | "week" | "month" | "season";

interface TimeHorizonSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const VIEWS: { value: ViewMode; label: string; description: string }[] = [
  { value: "today", label: "Today", description: "Remaining today" },
  { value: "week", label: "Week", description: "7-day timeline" },
  { value: "month", label: "Month", description: "Overview & density" },
  { value: "season", label: "Season", description: "Seasonal calendar" },
];

export function TimeHorizonSwitcher({ currentView, onViewChange }: TimeHorizonSwitcherProps) {
  return (
    <div
      className="flex gap-5 border-b border-white/[0.08]"
      role="tablist"
      aria-label="Schedule time horizon"
    >
      {VIEWS.map((view) => {
        const isSelected = currentView === view.value;
        return (
          <button
            key={view.value}
            role="tab"
            aria-selected={isSelected}
            aria-controls={`${view.value}-horizon-panel`}
            id={`${view.value}-horizon-tab`}
            onClick={() => onViewChange(view.value)}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center px-2 pt-1 pb-2.5 text-xs font-medium transition-colors",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-signal after:transition-opacity",
              "focus-visible:outline-none focus-visible:text-ink-1 focus-visible:after:opacity-100 sm:text-sm",
              isSelected
                ? "text-ink-1 after:opacity-100"
                : "text-ink-3 after:opacity-0 hover:text-ink-1",
            )}
          >
            <span>{view.label}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline font-normal">
              {view.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
      className="glass rounded-xl p-1.5 flex gap-1 border border-line"
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
              "flex-1 flex flex-col items-center justify-center py-2 px-3 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
              isSelected
                ? "bg-surface-2 text-signal shadow-sm border border-line-strong"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-1"
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

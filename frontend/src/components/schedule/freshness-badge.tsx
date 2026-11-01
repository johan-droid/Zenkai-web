"use client";

import { Clock, RefreshCw } from "lucide-react";
import { formatCountdown, useScheduleCountdown } from "@/hooks/use-schedule";
import { cn } from "@/lib/utils";

interface FreshnessBadgeProps {
  lastUpdated?: Date;
  compact?: boolean;
}

export function FreshnessBadge({ lastUpdated, compact = false }: FreshnessBadgeProps) {
  const now = useScheduleCountdown();

  if (!lastUpdated) return null;

  const ageSeconds = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
  const age = formatCountdown(ageSeconds);

  if (compact) {
    return (
      <span className={cn("flex items-center gap-1 text-xs", age ? "text-muted-foreground" : "text-signal")}>
        <Clock className="size-3" />
        {age ? `Updated ${age} ago` : "Just updated"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RefreshCw className="size-3" />
      <span>{age ? `Updated ${age} ago` : "Just updated"}</span>
    </div>
  );
}
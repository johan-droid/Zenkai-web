"use client";

import { SkipForward } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Floating skip control. When `autoSkip` is on it counts down and fires on its
 * own; pressing it skips immediately.
 */
export function SkipButton({
  label,
  autoSkip,
  seconds = 5,
  onSkip,
}: {
  label: string;
  autoSkip: boolean;
  seconds?: number;
  onSkip: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!autoSkip) {
      setRemaining(seconds);
      return;
    }

    setRemaining(seconds);
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer);
          onSkip();
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoSkip, seconds, onSkip]);

  return (
    <div className="absolute right-4 bottom-20 z-20 sm:bottom-24">
      <Button
        size="lg"
        onClick={onSkip}
        className="glass-strong rounded-xl border-glass-border shadow-lg"
      >
        <SkipForward className="fill-current" />
        {label}
        {autoSkip && remaining > 0 ? (
          <span className="ml-1 rounded-md bg-black/30 px-1.5 py-0.5 text-xs tabular-nums">
            {remaining}
          </span>
        ) : null}
      </Button>
    </div>
  );
}

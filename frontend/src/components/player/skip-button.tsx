"use client";

import { FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SkipButtonProps {
  label: string;
  onSkip: () => void;
}

/**
 * Floating manual skip control for verified intro and outro segments.
 * Skips immediately upon interaction with full keyboard accessibility.
 */
export function SkipButton({ label, onSkip }: SkipButtonProps) {
  return (
    <div className="absolute right-4 bottom-20 z-20 sm:bottom-24 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <Button
        size="lg"
        onClick={onSkip}
        className="glass-strong rounded-xl border border-glass-border px-4 py-2 font-semibold shadow-2xl backdrop-blur-md transition-transform hover:scale-105 active:scale-95 bg-black/75 hover:bg-black/90 text-white"
        aria-label={label}
      >
        <FastForward className="mr-1.5 size-4 fill-current text-amber-400" />
        <span>{label}</span>
      </Button>
    </div>
  );
}

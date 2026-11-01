"use client";

import React from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RatingDisplayProps {
  averageRating: number;
  totalRatings: number;
  userRating?: number;
  canRate: boolean;
  onRate?: (rating: number) => void;
}

export function RatingDisplay({ averageRating, totalRatings, userRating, canRate, onRate }: RatingDisplayProps) {
  const stars = Array.from({ length: 5 }, (_, i) => i);

  const getStarClass = (index: number, userRating?: number, averageRating?: number) => {
    if (userRating !== undefined) {
      return index < userRating ? "text-amber-400" : "text-zinc-500/30";
    }
    // Average-based: fill stars proportionally
    const filled = Math.floor(averageRating);
    const half = averageRating % 1 >= 0.5;
    if (index < filled) return "text-amber-400";
    if (index === filled && half) return "text-amber-400/50";
    return "text-zinc-500/30";
  };

  return (
    <div className="flex items-center gap-2 text-zinc-400">
      {stars.map((_, i) => (
        <Star
          key={i}
          size={18}
          className={cn("cursor-pointer", getStarClass(i, userRating, averageRating))}
          fill={getStarClass(i, userRating, averageRating) === "text-amber-400" ? "currentColor" : "none"}
          onClick={() => userRating !== undefined && onRate?.(i + 1)}
          title={`Rate ${i + 1} stars`}
        />
      ))}

      <span className="text-zinc-500/60">
        {averageRating.toFixed(1)} ({totalRatings}%)
      </span>
    </div>
  );
}

"use client";

import React from "react";
import { Star, Flag, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReviewProps {
  animeId: string;
  animeTitle: string;
  rating: number;
  content: string;
  createdAt: string;
  author: string;
  isSpoiler: boolean;
  helpfulVotes: number;
  totalVotes: number;
  canEdit: boolean;
  canDelete: boolean;
}

export function ReviewCard({ animeId, animeTitle, rating, content, createdAt, author, isSpoiler, helpfulVotes, totalVotes, canEdit, canDelete }: ReviewProps) {
  const spoilerClass = isSpoiler ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400";
  const spoilerText = isSpoiler ? "[Spoiler] " : "";

  return (
    <div className="border border-white/[0.08] rounded-2xl p-5 mb-4 bg-[#101014]">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#16161c] flex items-center justify-center flex-shrink-0">
          <Flag className="size-5 text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-zinc-300 font-medium">{author}</span>
            <span className="text-xs text-zinc-500">{new Date(createdAt).toLocaleDateString()}</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed truncate max-w-full">{content}</p>
        </div>
      </div>

      {/* Rating stars */}
      <div className="mt-3 flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={cn(
              "size-4",
              i < rating ? "text-amber-400" : "text-zinc-500/50"
            )}
            fill={i < rating ? "currentColor" : "none"}
          />
        ))}
      </div>

      {/* Spoiler tag */}
      {isSpoiler && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-red-400 rounded bg-red-500/20 px-2 py-1">
          <Flag className="size-3" /> Spoiler
        </span>
      )}

      {/* Actions (author only) */}
      {canEdit && (
        <div className="mt-3 flex gap-2 text-xs text-zinc-400">
          <Button variant="ghost" size="sm">Edit</Button>
          <Button variant="ghost" size="sm" danger>Delete</Button>
        </div>
      )}

      {/* Helpfulness */}
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <span>{helpfulVotes} helpful</span>
        <span>/ {totalVotes} total votes</span>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { Shield, Flag, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModerationPanelProps {
  comments: any[];
  onDelete: (commentId: string) => void;
  onSpoilerToggle: (commentId: string) => void;
  onReport: (commentId: string) => void;
}

export function ModerationPanel({ comments, onDelete, onSpoilerToggle, onReport }: ModerationPanelProps) {
  return (
    <div className="hidden sm:block border-white/[0.08] rounded-xl bg-[#101014]/80 p-4 mb-4 backdrop-blur-md">
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <Shield className="size-3" /> Moderation
      </div>
      <div className="flex gap-2">
        {comments.map((comment) => (
          <div key={comment.id} className="flex items-center gap-2">
            <Flag className="size-2 text-red-400" />
            <span className="hover:text-red-300 cursor-pointer" onClick={() => onSpoilerToggle(comment.id)}>
              Toggle Spoiler
            </span>
            <span className="ml-2 text-zinc-500">{comment.createdAt?.slice(11, 16)}</span>
            {canModerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(comment.id)}
                className="text-destructive hover:text-destructive/80"
              >
                Del
              </Button>
            )}
            {canModerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReport(comment.id)}
                className="text-amber-400 hover:text-amber-300"
              >
                Report
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

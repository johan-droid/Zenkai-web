"use client";

import React from "react";
import { Shield, Clock, User, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface CommentProps {
  id: string;
  animeId: string;
  content: string;
  author: string;
  createdAt: string;
  isSpoiler: boolean;
  replies: CommentProps[];
  depth: number;
  canDelete: boolean;
  canReport: boolean;
}

export function CommentCard({ id, animeId, content, author, createdAt, isSpoiler, replies, depth, canDelete, canReport }: CommentProps) {
  const [isReporting, setIsReporting] = useState(false);

  const spoilerClass = isSpoiler ? "bg-red-500/20 border-red-500/20 text-red-300" : "bg-green-500/20 border-green-500/20 text-green-300";
  const spoilerIcon = isSpoiler ? "🔒" : "";

  const handleReport = async () => {
    setIsReporting(true);
    // TODO: Implement report submission
    setIsReporting(false);
  };

  const replyDepth = depth + 1;

  return (
    <div className="border border-white/[0.08] rounded-xl p-4 mb-3 bg-[#101014]">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-[#16161c] flex items-center justify-center flex-shrink-0">
          <User className="size-4 text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-zinc-300 font-medium">{author}</span>
            <span className="text-xs text-zinc-500">{new Date(createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{content}</p>
        </div>
      </div>

      {/* Spoiler indicator */}
      {isSpoiler && (
        <span className="mt-1 inline-flex items-center gap-1 text-xs rounded bg-red-500/20 px-2 py-0.5 text-red-300">
          {spoilerIcon} Spoiler
        </span>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-3 pl-3 border-t border-white/[0.04] text-xs text-zinc-400">
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              {...reply}
              depth={replyDepth}
              canDelete={canDelete}
              canReport={canReport}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
        <span>
          <Clock className="size-3 mr-1" /> {new Date(createdAt).getTime()}
        </span>
        {canDelete && (
          <Button variant="ghost" size="sm" className="text-transparent">Del</Button>
        )}
        {canReport && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReport}
            title="Report"
            className="text-red-400 hover:text-red-300"
          >
            <Flag className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

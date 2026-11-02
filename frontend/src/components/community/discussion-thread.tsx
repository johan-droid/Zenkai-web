"use client";

import React, { useState } from "react";
import { MessageCircle, TextCursor, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CommentCard, type CommentProps } from "@/components/community/comment-card";

interface DiscussionThreadProps {
  animeId: string;
  initialComments: CommentProps[];
  onAddComment: (comment: Omit<CommentProps, "id" | "replies" | "depth">) => void;
  canModerate: boolean;
}

export function DiscussionThread({ animeId, initialComments, onAddComment, canModerate }: DiscussionThreadProps) {
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    onAddComment({
      animeId,
      content: newComment.trim(),
      author: "CurrentUser", // Would come from auth
      createdAt: new Date().toISOString(),
      isSpoiler: false,
      canDelete: canModerate,
      canReport: canModerate,
    });
    setNewComment("");
  };

  return (
    <div className="border border-white/[0.08] rounded-2xl bg-[#101014]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08]">
        <h3 className="font-medium text-white">
          <MessageCircle className="size-4 mr-2 text-amber-400" /> Discussions
        </h3>
      </div>

      {/* Comments list */}
      <div className="h-96 overflow-y-auto space-y-3 px-4 pb-4">
        {initialComments.map((comment) => (
          <CommentCard key={comment.id} {...comment} />
        ))}
      </div>

      {/* Comment form */}
      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-white/[0.08]">
        <div className="flex gap-2">
          <Input
            placeholder="Write a comment or spoiler-protected thought…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={editingId !== null}
            className="flex-1 rounded-xl border border-white/[0.08] bg-[#16161c]/80 px-3 py-2 text-sm"
            maxLength={500}
          />
          <Button type="submit" disabled={!newComment.trim()}>
            Post
            {editingId ? <X className="size-3" /> : null}
          </Button>
        </div>
      </form>
    </div>
  );
}

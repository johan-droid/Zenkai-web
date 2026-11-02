"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Flag, Loader2 } from "lucide-react";

import {
  reportPlaybackIssue,
  type PlaybackIssueCategory,
  type PlaybackIssueInput,
} from "@/lib/api/zenkai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IssueReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  animeId?: string;
  providerSlug?: string;
  sourceId?: string;
  audioLanguage?: string;
  currentTimeSeconds?: number;
}

const ISSUE_CATEGORIES: Array<{
  value: PlaybackIssueCategory;
  label: string;
  description: string;
}> = [
  {
    value: "dead_stream",
    label: "Video Won't Play",
    description: "Stream failed to load, black screen, or error message",
  },
  {
    value: "audio_desync",
    label: "Audio Out of Sync",
    description: "Audio lags behind or precedes the video",
  },
  {
    value: "buffering",
    label: "Constant Buffering",
    description: "Stream stutters, pauses repeatedly, or speeds drop",
  },
  {
    value: "wrong_episode",
    label: "Wrong Episode Content",
    description: "Video belongs to a different episode or series",
  },
  {
    value: "subtitles_missing",
    label: "Subtitles Defective",
    description: "Subtitles are missing, desynced, or in wrong language",
  },
  {
    value: "audio_missing",
    label: "No Audio Track",
    description: "Video plays without sound or audio cuts out",
  },
  {
    value: "other",
    label: "Other Defect",
    description: "Aspect ratio distortion, visual artifacts, or metadata mismatch",
  },
];

export function IssueReportModal({
  open,
  onOpenChange,
  episodeId,
  animeId,
  providerSlug,
  sourceId,
  audioLanguage,
  currentTimeSeconds = 0,
}: IssueReportModalProps) {
  const [category, setCategory] = useState<PlaybackIssueCategory>("dead_stream");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    const payload: PlaybackIssueInput = {
      episodeId,
      animeId,
      providerSlug,
      sourceId,
      issueCategory: category,
      playbackTimestampSeconds: Math.floor(Math.max(0, currentTimeSeconds)),
      audioLanguage,
      userDescription: description.trim() || undefined,
    };

    try {
      const res = await reportPlaybackIssue(payload);
      if (res.success) {
        setStatusMessage({
          type: "success",
          text: res.message || "Thank you! Your playback report has been recorded.",
        });
        setTimeout(() => {
          onOpenChange(false);
          setStatusMessage(null);
          setDescription("");
        }, 1800);
      } else {
        setStatusMessage({
          type: "error",
          text: res.message || "Failed to submit report. Please try again.",
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err?.message || "Error submitting playback report. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-red-500">
            <Flag className="size-5" />
            <h2 id="report-modal-title" className="text-base font-semibold text-white">
              Report Playback Issue
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400 hover:text-white text-lg font-mono leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {statusMessage ? (
          <div
            className={cn(
              "my-6 flex items-center gap-3 rounded-xl p-4 text-sm",
              statusMessage.type === "success"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-red-500/15 text-red-300 border border-red-500/30",
            )}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-5 shrink-0" />
            ) : (
              <AlertCircle className="size-5 shrink-0" />
            )}
            <p>{statusMessage.text}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">
                What went wrong?
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {ISSUE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={cn(
                      "flex flex-col items-start p-2.5 rounded-lg border text-left transition-colors",
                      category === cat.value
                        ? "border-red-500/60 bg-red-500/10 text-white"
                        : "border-white/5 bg-white/[0.02] text-zinc-300 hover:border-white/20",
                    )}
                  >
                    <span className="text-xs font-semibold">{cat.label}</span>
                    <span className="text-[11px] text-zinc-400 leading-tight">
                      {cat.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="issue-desc" className="text-xs font-medium text-zinc-300">
                Additional Details (Optional)
              </label>
              <textarea
                id="issue-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Stream buffered at 12:45, audio cut out completely..."
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Timestamp: {Math.floor(currentTimeSeconds)}s</span>
              <span>Server: {providerSlug || "Default"}</span>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-medium"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

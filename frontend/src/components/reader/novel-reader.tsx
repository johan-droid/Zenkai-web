"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SunMedium,
  Moon,
  Coffee,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import {
  fetchNovelChapterContent,
  fetchNovelChapters,
  fetchNovelDetail,
} from "@/lib/api/zenkai";
import { useThrottledProgressSaver } from "@/hooks/use-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NovelReaderProps {
  novelId: string;
  chapterNumber: number;
}

export type ReaderTheme = "dark" | "sepia" | "black";
export type FontSize = "sm" | "base" | "lg" | "xl";

export const NOVEL_SOURCES = [
  { id: "novelfire", label: "NovelFire" },
  { id: "novelfull", label: "NovelFull" },
  { id: "webnovel", label: "WebNovel" },
  { id: "lnori", label: "Lnori" },
] as const;

export function NovelReader({ novelId, chapterNumber }: NovelReaderProps) {
  const router = useRouter();

  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [source, setSource] = useState<string>("novelfire");

  // Query novel detail
  const detailQuery = useQuery({
    queryKey: ["novel", novelId, source],
    queryFn: () => fetchNovelDetail(novelId, source),
    staleTime: 10 * 60_000,
  });

  // Query chapters list for navigation dropdown
  const chaptersQuery = useQuery({
    queryKey: ["chapters", "novel", novelId, source],
    queryFn: () => fetchNovelChapters(novelId, source),
    staleTime: 10 * 60_000,
  });

  // Query chapter content
  const contentQuery = useQuery({
    queryKey: ["novel-content", novelId, chapterNumber, source],
    queryFn: () => fetchNovelChapterContent(novelId, chapterNumber, source),
    staleTime: 10 * 60_000,
  });

  const novelTitle = detailQuery.data?.title ?? "Novel";
  const coverUrl = detailQuery.data?.coverImage ?? null;
  const totalChapters = chaptersQuery.data?.items.length ?? detailQuery.data?.chapters ?? 1;

  // Local-first reading progress persistence in Dexie
  const saveProgress = useThrottledProgressSaver();

  // Mark chapter progress
  useEffect(() => {
    saveProgress({
      kind: "novel",
      mediaId: novelId,
      title: novelTitle,
      coverUrl,
      unit: chapterNumber,
      positionSeconds: 100,
      durationSeconds: 100,
      totalUnits: totalChapters,
    });
  }, [novelId, chapterNumber, novelTitle, coverUrl, totalChapters, saveProgress]);

  const content = contentQuery.data;
  const previousChapter = content?.previousChapter ?? (chapterNumber > 1 ? chapterNumber - 1 : null);
  const nextChapter = content?.nextChapter ?? (chapterNumber < totalChapters ? chapterNumber + 1 : null);

  const goToPrev = useCallback(() => {
    if (previousChapter) {
      router.push(`/read-novel/${novelId}/${previousChapter}`);
    }
  }, [previousChapter, router, novelId]);

  const goToNext = useCallback(() => {
    if (nextChapter) {
      router.push(`/read-novel/${novelId}/${nextChapter}`);
    }
  }, [nextChapter, router, novelId]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" || e.key === "p") {
        goToPrev();
      } else if (e.key === "ArrowRight" || e.key === "n") {
        goToNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // Theme styling configurations
  const themeClasses: Record<ReaderTheme, string> = {
    dark: "bg-zinc-950 text-zinc-100 selection:bg-[#c8102e]/30 selection:text-white",
    sepia: "bg-[#fbf0d9] text-[#433422] selection:bg-[#dfc49c] selection:text-[#332211]",
    black: "bg-black text-zinc-200 selection:bg-zinc-800 selection:text-white",
  };

  const fontClasses: Record<FontSize, string> = {
    sm: "text-sm leading-relaxed",
    base: "text-base leading-relaxed sm:text-lg sm:leading-8",
    lg: "text-lg leading-loose sm:text-xl sm:leading-9",
    xl: "text-xl leading-loose sm:text-2xl sm:leading-10",
  };

  return (
    <div className={cn("min-h-screen transition-colors duration-200 flex flex-col", themeClasses[theme])}>
      {/* Sticky Top Reader Controls Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-xl bg-black/60 px-4 py-3 shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl" asChild>
              <Link href={`/novel/${novelId}`} title="Back to Novel Details">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-md font-medium">
                {novelTitle}
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Chapter {chapterNumber}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Novel Source Provider Selector */}
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-7 rounded-xl bg-white/5 px-2 text-xs text-zinc-300 ring-1 ring-white/10 border-0 focus:ring-1 focus:ring-white/30 cursor-pointer"
              title="Novel Provider Source"
            >
              {NOVEL_SOURCES.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900 text-zinc-200">
                  {s.label}
                </option>
              ))}
            </select>

            {/* Font Size Selector */}
            <div className="flex items-center rounded-xl bg-white/5 p-0.5 ring-1 ring-white/10">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 px-2 text-xs", fontSize === "sm" && "bg-white/15")}
                onClick={() => setFontSize("sm")}
              >
                A-
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 px-2 text-xs", fontSize === "base" && "bg-white/15")}
                onClick={() => setFontSize("base")}
              >
                A
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 px-2 text-xs", fontSize === "lg" && "bg-white/15")}
                onClick={() => setFontSize("lg")}
              >
                A+
              </Button>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center rounded-xl bg-white/5 p-0.5 ring-1 ring-white/10">
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-7 rounded-lg", theme === "dark" && "bg-white/15")}
                onClick={() => setTheme("dark")}
                title="Dark theme"
              >
                <Moon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-7 rounded-lg", theme === "sepia" && "bg-white/15 text-amber-500")}
                onClick={() => setTheme("sepia")}
                title="Sepia theme"
              >
                <Coffee className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-7 rounded-lg", theme === "black" && "bg-white/15")}
                onClick={() => setTheme("black")}
                title="Pitch black theme"
              >
                <SunMedium className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Text Reader Container */}
      <main className="mx-auto flex-1 w-full max-w-3xl px-5 py-10 sm:py-14 sm:px-8">
        {contentQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <Loader2 className="size-8 animate-spin text-[#c8102e]" />
            <p className="text-sm text-muted-foreground font-medium">Loading chapter {chapterNumber}...</p>
          </div>
        ) : contentQuery.isError || !content ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
            <p className="text-base text-red-400 font-semibold">Could not load this chapter content.</p>
            <Button variant="outline" className="glass rounded-xl" onClick={() => contentQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <article className="flex flex-col gap-6">
            <div className="border-b border-current/15 pb-6 mb-2">
              <span className="text-xs uppercase tracking-widest opacity-60 font-semibold">
                {novelTitle}
              </span>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
                {content.title || `Chapter ${chapterNumber}`}
              </h1>
            </div>

            <div className={cn("flex flex-col gap-5 font-serif", fontClasses[fontSize])}>
              {content.paragraphs.map((para, i) => (
                <p key={i} className="text-justify indent-4 sm:indent-6 leading-relaxed">
                  {para}
                </p>
              ))}
            </div>

            <div className="mt-12 flex items-center justify-center gap-2 text-xs opacity-60">
              <CheckCircle2 className="size-4 text-[#c8102e]" />
              <span>Chapter {chapterNumber} finished</span>
            </div>
          </article>
        )}
      </main>

      {/* Chapter Footer Navigation */}
      <footer className="border-t border-white/10 backdrop-blur-xl bg-black/40 px-4 py-4 mt-auto">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Button
            variant="outline"
            className="glass rounded-xl gap-2 text-sm"
            disabled={!previousChapter}
            onClick={goToPrev}
          >
            <ChevronLeft className="size-4" />
            <span>Previous</span>
          </Button>

          <span className="text-xs text-muted-foreground font-medium">
            Chapter {chapterNumber} of {totalChapters}
          </span>

          <Button
            variant="outline"
            className="glass rounded-xl gap-2 text-sm"
            disabled={!nextChapter}
            onClick={goToNext}
          >
            <span>Next</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
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
  Menu,
  BookOpen,
  Maximize,
  Minimize,
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

export type ReaderTheme = "light" | "dark" | "sepia" | "system";
export type FontSize = "sm" | "base" | "lg" | "xl";
export type LineHeightOption = "tight" | "normal" | "relaxed" | "loose";
export type ParagraphSpacing = "none" | "small" | "normal" | "large";

const THEME_OPTIONS = ["light", "dark", "sepia", "system"];
const FONT_SIZE_OPTIONS = ["sm", "base", "lg", "xl"];
const LINE_HEIGHT_OPTIONS = ["tight", "normal", "relaxed", "loose"];
const PARAGRAPH_SPACING_OPTIONS = ["none", "small", "normal", "large"];

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getThemeClass(theme: ReaderTheme): string {
  switch (theme) {
    case "light": return "bg-white text-slate-900 border-white/20";
    case "dark": return "bg-[#07070a] text-zinc-100 border-white/10";
    case "sepia": return "bg-[#f3e9d2] text-[#3e2723] border-[#d4bf8a]";
    case "system": return "bg-background text-foreground border-border";
    default: return "bg-white text-slate-900 border-white/20";
  }
}

function getFontSizeClass(fontSize: FontSize): string {
  switch (fontSize) {
    case "sm": return "text-sm";
    case "base": return "text-base";
    case "lg": return "text-lg";
    case "xl": return "text-xl";
    default: return "text-base";
  }
}

function getLineHeightClass(lineHeight: LineHeightOption): string {
  switch (lineHeight) {
    case "tight": return "leading-tight";
    case "normal": return "leading-normal";
    case "relaxed": return "leading-relaxed";
    case "loose": return "leading-loose";
    default: return "leading-relaxed";
  }
}

function getParagraphSpacingClass(paragraphSpacing: ParagraphSpacing): string {
  switch (paragraphSpacing) {
    case "none": return "gap-1";
    case "small": return "gap-3";
    case "normal": return "gap-6";
    case "large": return "gap-10";
    default: return "gap-6";
  }
}

export function NovelReader({ novelId, chapterNumber }: NovelReaderProps) {
  const router = useRouter();

  // DECLARE ALL STATE FIRST
  const [theme, setTheme] = useState<ReaderTheme>("system");
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [lineHeight, setLineHeight] = useState<LineHeightOption>("relaxed");
  const [paragraphSpacing, setParagraphSpacing] = useState<ParagraphSpacing>("normal");
  const [source, setSource] = useState<string>("novelfire");
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }, []);

  // Query novel detail
  const detailQuery = useQuery({
    queryKey: ["novel", novelId, source],
    queryFn: () => fetchNovelDetail(novelId, source),
    staleTime: 10 * 60_000,
  });

  // Query chapters list for navigation dropdown and table of contents
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
  const chaptersList = chaptersQuery.data?.items ?? [];
  const totalChapters = chaptersList.length > 0 ? chaptersList.length : detailQuery.data?.chapters ?? 1;

  const effectiveTheme = theme === "system" ? getSystemTheme() : theme;

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
  const currentChapter = chaptersList.find((ch) => ch.chapterNumber === chapterNumber);
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

  const goToChapter = useCallback((num: number) => {
    router.push(`/read-novel/${novelId}/${num}`);
  }, [router, novelId]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goToPrev();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goToNext();
      if (e.key === "s") setShowSettings((prev) => !prev);
      if (e.key === "t") setShowToc((prev) => !prev);
      if (e.key === "f") toggleFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext, setShowSettings, setShowToc, toggleFullscreen]);

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Group chapters by volume for table of contents
  const chaptersByVolume = useMemo(() => {
    const grouped = new Map<number, { number: number; title: string; chapters: typeof chaptersList }>();
    for (const ch of chaptersList) {
      const volNum = Math.ceil(ch.chapterNumber / 10);
      if (!grouped.has(volNum)) {
        grouped.set(volNum, { number: volNum, title: `Volume ${volNum}`, chapters: [] });
      }
      grouped.get(volNum)!.chapters.push(ch);
    }
    return Array.from(grouped.values()).sort((a, b) => a.number - b.number);
  }, [chaptersList]);

  // Sanitize paragraph content - remove any script tags or dangerous HTML
  const sanitizedParagraphs = useMemo(() => {
    return (content?.paragraphs ?? []).map((para) => {
      // Strip script tags and event handlers
      return para
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/on\w+\s*=\s*'[^']*'/gi, "");
    });
  }, [content?.paragraphs]);

  if (contentQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-[#07070a] flex items-center justify-center text-zinc-100">
        <Loader2 className="size-8 animate-spin text-[#c8102e]" />
        <p className="ml-2 text-sm text-muted-foreground font-medium">Loading chapter {chapterNumber}...</p>
      </div>
    );
  }

  if (contentQuery.isError || !content) {
    return (
      <div className="min-h-dvh bg-[#07070a] flex flex-col items-center justify-center text-zinc-100 p-6">
        <p className="text-base text-red-400 font-semibold">Could not load this chapter content.</p>
        <Button variant="outline" className="glass rounded-xl mt-4" onClick={() => contentQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const readerClasses = cn(
    "min-h-dvh flex flex-col",
    getThemeClass(theme),
    isFullscreen ? "fixed inset-0 z-50 overflow-hidden" : "",
  );

  const textClasses = cn(
    "flex font-serif",
    getFontSizeClass(fontSize),
    getLineHeightClass(lineHeight),
    getParagraphSpacingClass(paragraphSpacing),
  );

  return (
    <div className={readerClasses}>
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-current/15 bg-current/5 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Link
            href={`/novel/${novelId}`}
            className="group flex items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-signal"
            aria-label="Back to Novel"
          >
            <BookOpen className="size-5 text-[#c8102e] group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold tracking-tight hidden sm:inline">{novelTitle}</span>
          </Link>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="rounded-md bg-current/10 px-2 py-0.5 text-[0.65rem] font-bold text-current/70 ring-1 ring-current/20">
            CH {chapterNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={() => setShowToc((prev) => !prev)}
            title="Table of contents (T)"
          >
            <Menu className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={() => setShowSettings((prev) => !prev)}
            title="Reading settings (S)"
          >
            <BookOpen className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={toggleFullscreen}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Reading Settings Panel */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-current/5 border border-current/10 rounded-2xl p-6 max-w-md w-full text-current text-sm">
            <h3 className="text-lg font-bold mb-4">Reading Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-current/70 uppercase tracking-wider">Theme</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {THEME_OPTIONS.map((t) => (
                    <Button
                      key={t}
                      variant={theme === t ? "default" : "outline"}
                      size="sm"
                      className={cn("rounded-lg text-xs", theme === t && "bg-current text-current/90")}
                      onClick={() => setTheme(t as ReaderTheme)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-current/70 uppercase tracking-wider">Font Size</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {FONT_SIZE_OPTIONS.map((s) => (
                    <Button
                      key={s}
                      variant={fontSize === s ? "default" : "outline"}
                      size="sm"
                      className={cn("rounded-lg text-xs", fontSize === s && "bg-current text-current/90")}
                      onClick={() => setFontSize(s as FontSize)}
                    >
                      {s.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-current/70 uppercase tracking-wider">Line Height</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {LINE_HEIGHT_OPTIONS.map((lh) => (
                    <Button
                      key={lh}
                      variant={lineHeight === lh ? "default" : "outline"}
                      size="sm"
                      className={cn("rounded-lg text-xs", lineHeight === lh && "bg-current text-current/90")}
                      onClick={() => setLineHeight(lh as LineHeightOption)}
                    >
                      {lh.charAt(0).toUpperCase() + lh.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-current/70 uppercase tracking-wider">Paragraph Spacing</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PARAGRAPH_SPACING_OPTIONS.map((ps) => (
                    <Button
                      key={ps}
                      variant={paragraphSpacing === ps ? "default" : "outline"}
                      size="sm"
                      className={cn("rounded-lg text-xs", paragraphSpacing === ps && "bg-current text-current/90")}
                      onClick={() => setParagraphSpacing(ps as ParagraphSpacing)}
                    >
                      {ps.charAt(0).toUpperCase() + ps.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" size="sm" className="glass rounded-lg" onClick={() => setShowSettings(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents */}
      {showToc && (
        <div className="absolute inset-0 z-40 flex items-center justify-start bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-current/5 border border-current/10 rounded-2xl p-6 max-w-lg w-full text-current overflow-y-auto max-h-[80vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Table of Contents</h3>
              <Button variant="outline" size="sm" className="glass rounded-lg" onClick={() => setShowToc(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-2">
              {chaptersByVolume.map((volume) => (
                <div key={volume.number} className="mb-3">
                  <h4 className="text-sm font-semibold text-current/70 mb-2 uppercase tracking-wider">
                    {volume.title}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {volume.chapters.map((ch) => (
                      <Button
                        key={ch.chapterNumber}
                        variant={ch.chapterNumber === chapterNumber ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "rounded-lg text-xs min-w-[40px]",
                          ch.chapterNumber === chapterNumber && "bg-current text-current/90",
                        )}
                        onClick={() => {
                          goToChapter(ch.chapterNumber);
                          setShowToc(false);
                        }}
                      >
                        {ch.chapterNumber}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Text Reader Container */}
      <main className="flex-1 w-full px-5 py-10 sm:py-14 sm:px-8 lg:px-12">
        <article className={cn("flex flex-col gap-6 max-w-3xl mx-auto", textClasses)}>
          <div className="border-b border-current/15 pb-6 mb-2">
            <span className="text-xs uppercase tracking-widest opacity-60 font-semibold">
              {novelTitle}
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
              {content.title || `Chapter ${chapterNumber}`}
            </h1>
          </div>

          <div className={cn("flex flex-col", getParagraphSpacingClass(paragraphSpacing))}>
            {sanitizedParagraphs.map((para, i) => (
              <p key={i} className="text-justify indent-4 sm:indent-6">
                {para}
              </p>
            ))}
          </div>

          <div className="mt-12 flex items-center justify-center gap-2 text-xs opacity-60">
            <CheckCircle2 className="size-4 text-[#c8102e]" />
            <span>Chapter {chapterNumber} finished</span>
          </div>
        </article>
      </main>

      {/* Chapter Footer Navigation */}
      <footer className="border-t border-current/10 backdrop-blur-xl bg-current/5 px-4 py-4 mt-auto">
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

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Expand,
  Loader2,
  Maximize,
  Maximize2,
  Minimize,
  Square,
  Smartphone,
  ArrowRight,
} from "lucide-react";

import {
  fetchMangaChapters,
  fetchMangaChapterPages,
  type MangaChapter,
} from "@/lib/api/zenkai";
import { useThrottledProgressSaver, useUnitProgress } from "@/hooks/use-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReaderMode = "vertical" | "paged" | "double" | "rtl";

export interface MangaReaderProps {
  /** MangaDex UUID or local UUID. */
  mangaId: string;
  /** Optional AniList / catalogue ID used for navigation. */
  anilistId?: string;
  /** 1-based chapter number as shown in the URL. */
  chapterNumber: number;
  title: string;
  coverUrl?: string | null;
}

/** Zoom level presets. */
export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 200;

export function MangaReader({
  mangaId,
  anilistId,
  chapterNumber,
  title,
  coverUrl,
}: MangaReaderProps) {
  const [mode, setMode] = useState<ReaderMode>("vertical");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [fitMode, setFitMode] = useState<"none" | "width" | "height">("none");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const feed = useQuery({
    queryKey: ["manga-chapters", mangaId],
    queryFn: () => fetchMangaChapters(mangaId, "en"),
    staleTime: 5 * 60_000,
  });

  // The URL carries a chapter number; resolve it to the closest feed entry so
  // `/read/12/12.5` can open chapter 12.5 instead of failing outright.
  const chapter = useMemo(
    () => resolveChapter(chapterNumber, feed.data?.items),
    [chapterNumber, feed.data],
  );
  const chapterId = chapter?.id ?? null;

  // Next and previous chapter calculation for effortless reading continuation
  const nextChapter = useMemo(() => {
    if (!feed.data?.items) return null;
    const sorted = [...feed.data.items]
      .map((item) => ({ item, num: Number(item.chapterNumber) }))
      .filter((e) => Number.isFinite(e.num) && e.num > chapterNumber)
      .sort((a, b) => a.num - b.num);
    return sorted[0]?.num ?? null;
  }, [feed.data, chapterNumber]);

  const prevChapter = useMemo(() => {
    if (!feed.data?.items) return null;
    const sorted = [...feed.data.items]
      .map((item) => ({ item, num: Number(item.chapterNumber) }))
      .filter((e) => Number.isFinite(e.num) && e.num < chapterNumber)
      .sort((a, b) => b.num - a.num);
    return sorted[0]?.num ?? null;
  }, [feed.data, chapterNumber]);

  const readRouteBase = anilistId ? `/read/${anilistId}` : `/read/${mangaId}`;
  const mangaRoute = anilistId ? `/manga/${anilistId}` : `/manga/${mangaId}`;

  const pages = useQuery({
    queryKey: ["manga-pages", chapterId],
    queryFn: () => fetchMangaChapterPages(chapterId as string),
    enabled: Boolean(chapterId),
    // Chapter page URLs are signed and short-lived upstream, so the client must
    // treat them as ephemeral: render them now and let them age out of the cache
    // rather than persisting them.
    staleTime: 10 * 60_000,
    gcTime: 12 * 60_000,
  });

  const pageUrls = useMemo(() => (pages.data?.pages ?? []).map((page) => page.url), [pages.data]);
  const total = pageUrls.length;

  const progress = useUnitProgress("manga", mangaId, chapterNumber);
  const saveProgress = useThrottledProgressSaver(4_000);
  const savedPage = progress?.page;

  const reportPage = useCallback(
    (index: number) => {
      if (!total) return;
      void saveProgress({
        kind: "manga",
        mediaId: mangaId,
        title,
        coverUrl: coverUrl ?? null,
        unit: chapterNumber,
        positionSeconds: 0,
        durationSeconds: total,
        page: index + 1,
        totalUnits: feed.data?.items.length ?? null,
      });
    },
    [saveProgress, total, mangaId, title, coverUrl, chapterNumber, feed.data?.items.length],
  );

  // Restore the saved page once we know how many pages there are.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !total || mode === "vertical") return;
    restored.current = true;
    if (savedPage && savedPage > 1 && savedPage <= total) {
      queueMicrotask(() => {
        setPage(savedPage - 1);
      });
    }
  }, [total, savedPage, mode]);

  // Track fullscreen state changes
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }, []);

  const zoomIn = useCallback(() => {
    const levels: ZoomLevel[] = [50, 75, 100, 125, 150, 200];
    const idx = levels.indexOf(zoom);
    if (idx < levels.length - 1) setZoom(levels[idx + 1]);
    setFitMode("none");
  }, [zoom]);

  const zoomOut = useCallback(() => {
    const levels: ZoomLevel[] = [50, 75, 100, 125, 150, 200];
    const idx = levels.indexOf(zoom);
    if (idx > 0) setZoom(levels[idx - 1]);
    setFitMode("none");
  }, [zoom]);

  const resetZoom = useCallback(() => {
    setZoom(100);
    setFitMode("none");
  }, []);

  const fitWidth = useCallback(() => {
    setFitMode("width");
    setZoom(100);
  }, []);

  const fitHeight = useCallback(() => {
    setFitMode("height");
    setZoom(100);
  }, []);

  // Paged modes: arrows navigate (reversing for RTL). Fullscreen works in every mode.
  useHotkeys("arrowright, d", () => (mode === "rtl" ? goTo(page - 1) : goTo(page + 1)), {
    enabled: mode !== "vertical",
  });
  useHotkeys("arrowleft, a", () => (mode === "rtl" ? goTo(page + 1) : goTo(page - 1)), {
    enabled: mode !== "vertical",
  });
  useHotkeys("f", toggleFullscreen);
  useHotkeys("+", zoomIn);
  useHotkeys("-", zoomOut);
  useHotkeys("0", resetZoom);
  useHotkeys("w", fitWidth);
  useHotkeys("h", fitHeight);

  const goTo = useCallback(
    (next: number) => {
      if (!total) return;
      const clamped = Math.max(0, Math.min(total - 1, next));
      setDirection(clamped >= page ? "forward" : "backward");
      setPage(clamped);
      reportPage(clamped);
    },
    [total, page, reportPage],
  );

  if (feed.isLoading || pages.isLoading) {
    return (
      <ReaderShell title={title} chapterNumber={chapterNumber} mangaRoute={mangaRoute}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-red-500" />
          <span className="text-sm font-medium text-zinc-400">Loading chapter pages...</span>
        </div>
      </ReaderShell>
    );
  }

  const error = feed.error ?? pages.error;
  if (error) {
    const externalUrl = chapter?.externalUrl ?? null;
    return (
      <ReaderShell title={title} chapterNumber={chapterNumber} mangaRoute={mangaRoute}>
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="text-sm text-red-400">
            Could not load this chapter: {(error as Error).message}
          </p>
          {externalUrl ? (
            <Button
              className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-700/30"
              asChild
            >
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                Read on {chapter?.scanlationGroup ?? "Official Provider"} ↗
              </a>
            </Button>
          ) : null}
          <Button variant="outline" className="glass rounded-xl" asChild>
            <Link href={mangaRoute}>Back to title</Link>
          </Button>
        </div>
      </ReaderShell>
    );
  }

  if (!chapter) {
    return (
      <ReaderShell title={title} chapterNumber={chapterNumber} mangaRoute={mangaRoute}>
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="text-sm text-zinc-400">
            This chapter has no readable pages hosted directly.
          </p>
          <Button variant="outline" className="glass rounded-xl" asChild>
            <Link href={mangaRoute}>Back to title</Link>
          </Button>
        </div>
      </ReaderShell>
    );
  }

  const readerStyle = useMemo(() => {
    if (fitMode === "width") {
      return { width: "100%", height: "auto" };
    }
    if (fitMode === "height") {
      return { width: "auto", height: "100vh" };
    }
    return { width: `${zoom}%`, height: "auto" };
  }, [fitMode, zoom]);

  return (
    <ReaderShell
      title={title}
      chapterNumber={chapterNumber}
      mangaRoute={mangaRoute}
      toolbar={
        <ReaderToolbar
          mode={mode}
          onModeChange={setMode}
          onFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          zoom={zoom}
          fitMode={fitMode}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onFitWidth={fitWidth}
          onFitHeight={fitHeight}
        />
      }
    >
      {mode === "vertical" ? (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1">
          {pageUrls.map((url, index) => (
            <ReaderImage
              key={url}
              src={url}
              index={index}
              onVisible={() => reportPage(index)}
              style={readerStyle}
            />
          ))}

          {/* End of Chapter Card (Matches Zenkai Experience) */}
          <div className="mt-8 mb-16 flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-xl shadow-xl">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-red-600/20 p-2 text-red-500 ring-1 ring-red-500/30">
              <BookOpen className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-white">End of Chapter {chapterNumber}</span>
              <span className="text-xs text-zinc-400">You finished reading all {total} pages</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {prevChapter !== null ? (
                <Button variant="outline" className="glass rounded-xl" asChild>
                  <Link href={`${readRouteBase}/${prevChapter}`}>
                    ← Ch {prevChapter}
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" className="glass rounded-xl" asChild>
                <Link href={mangaRoute}>Overview</Link>
              </Button>
              {nextChapter !== null ? (
                <Button className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-700/30" asChild>
                  <Link href={`${readRouteBase}/${nextChapter}`}>
                    Next Ch {nextChapter} <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <PagedView
          pageUrls={pageUrls}
          page={page}
          mode={mode}
          direction={direction}
          onGoTo={goTo}
          onReport={reportPage}
          readRouteBase={readRouteBase}
          nextChapter={nextChapter}
          prevChapter={prevChapter}
          mangaRoute={mangaRoute}
          readerStyle={readerStyle}
        />
      )}
    </ReaderShell>
  );
}

const MODE_OPTIONS: { value: ReaderMode; label: string; icon: typeof Square }[] = [
  { value: "vertical", label: "Webtoon scroll", icon: Smartphone },
  { value: "rtl", label: "Manga (RTL)", icon: ChevronLeft },
  { value: "paged", label: "Single page", icon: Square },
  { value: "double", label: "Double spread", icon: Columns2 },
];

function ReaderToolbar({
  mode,
  onModeChange,
  onFullscreen,
  isFullscreen,
  zoom,
  fitMode,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitHeight,
}: {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  zoom: ZoomLevel;
  fitMode: "none" | "width" | "height";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">Mode:</span>
        {MODE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={mode === option.value ? "default" : "outline"}
            className={cn("glass rounded-xl size-9", mode === option.value && "bg-red-600/20")}
            onClick={() => onModeChange(option.value)}
            aria-label={option.label}
            size="icon"
          >
            <option.icon className="size-4" />
          </Button>
        ))}
      </div>

      <div className="h-6 w-px bg-white/20 mx-2" />

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">Zoom:</span>
        <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onZoomOut} title="Zoom out (-)">
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="text-xs font-mono text-zinc-300 w-8 text-center">{zoom}%</span>
        <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onZoomIn} title="Zoom in (+)">
          <ChevronRight className="size-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onResetZoom} title="Reset zoom (0)">
          <Square className="size-3.5" />
        </Button>
        {fitMode === "none" ? (
          <>
            <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onFitWidth} title="Fit to width (W)">
              <Expand className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onFitHeight} title="Fit to height (H)">
              <Expand className="size-3.5" rotate={90} />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="icon" className="glass rounded-lg" onClick={onResetZoom} title="Reset fit">
            <Minimize className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="h-6 w-px bg-white/20 mx-2" />

      <Button
        variant="outline"
        size="icon"
        className="glass rounded-lg"
        onClick={onFullscreen}
        title="Fullscreen (F)"
      >
        {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
      </Button>
    </div>
  );
}

function ReaderImage({
  src,
  index,
  onVisible,
  style,
}: {
  src: string;
  index: number;
  onVisible: () => void;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) onVisible();
        });
      },
      { threshold: 0.1 },
    );
    const el = ref.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center mb-4"
      style={style}
    >
      <img
        src={src}
        alt={`Page ${index + 1}`}
        className="max-w-full h-auto rounded-lg shadow-xl"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function PagedView({
  pageUrls,
  page,
  mode,
  direction,
  onGoTo,
  onReport,
  readRouteBase,
  nextChapter,
  prevChapter,
  mangaRoute,
  readerStyle,
}: {
  pageUrls: string[];
  page: number;
  mode: ReaderMode;
  direction: "forward" | "backward";
  onGoTo: (next: number) => void;
  onReport: (index: number) => void;
  readRouteBase: string;
  nextChapter: number | null;
  prevChapter: number | null;
  mangaRoute: string;
  readerStyle: React.CSSProperties;
}) {
  const total = pageUrls.length;

  const goPrev = useCallback(() => onGoTo(page - 1), [page, onGoTo]);
  const goNext = useCallback(() => onGoTo(page + 1), [page, onGoTo]);

  const isDouble = mode === "double";
  const isRTL = mode === "rtl";

  return (
    <div
      className="mx-auto flex max-w-6xl items-center justify-center gap-4 p-4"
      style={{ minHeight: "calc(100vh - 160px)" }}
    >
      {isDouble ? (
        <>
          {pageUrls.map((url, index) => {
            const isVisible = isRTL ? index >= total - page - 2 : index >= page * 2 && index < page * 2 + 2;
            if (!isVisible) return null;
            return (
              <ReaderImage
                key={url}
                src={url}
                index={index}
                onVisible={() => onReport(index)}
                style={readerStyle}
              />
            );
          })}
        </>
      ) : (
        <ReaderImage
          key={pageUrls[page]}
          src={pageUrls[page]}
          index={page}
          onVisible={() => onReport(page)}
          style={readerStyle}
        />
      )}

      <div className="absolute bottom-8 flex w-full justify-between px-4 sm:px-6 lg:px-8 pointer-events-none">
        <Button
          variant="outline"
          size="icon"
          className="glass rounded-xl pointer-events-auto"
          disabled={page === 0 || (isDouble && page === 0)}
          onClick={goPrev}
        >
          <ChevronLeft className="size-5" />
          <span className="ml-1 hidden sm:inline">Previous</span>
        </Button>

        <div className="flex flex-col items-center gap-1 pointer-events-auto">
          <span className="text-xs font-medium text-zinc-400">
            Page {page + 1} of {total}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="glass rounded-xl pointer-events-auto"
          disabled={
            page >= total - 1 ||
            (isDouble && page >= total - 2)
          }
          onClick={goNext}
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
        {prevChapter !== null ? (
          <Button variant="outline" className="glass rounded-xl pointer-events-auto" asChild>
            <Link href={`${readRouteBase}/${prevChapter}`}>
              ← Ch {prevChapter}
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" className="glass rounded-xl pointer-events-auto" asChild>
          <Link href={mangaRoute}>Overview</Link>
        </Button>
        {nextChapter !== null ? (
          <Button className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-700/30 pointer-events-auto" asChild>
            <Link href={`${readRouteBase}/${nextChapter}`}>
              Next Ch {nextChapter} <ArrowRight className="ml-1 size-3" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReaderShell({
  children,
  title,
  chapterNumber,
  mangaRoute,
  toolbar,
}: {
  children: React.ReactNode;
  title: string;
  chapterNumber: number;
  mangaRoute: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#09090e]/90 px-4 py-2.5 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <Link
            href={mangaRoute ?? "/manga"}
            className="group flex items-center gap-2 rounded-xl outline-none"
            aria-label="Back to Manga"
          >
            <div className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#14141d] to-[#20202c] p-1 shadow-md shadow-black/40 ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 884 457"
                role="img"
                aria-label="Zenkai logo"
                className="h-full w-full drop-shadow-[0_0_6px_rgba(200,16,46,0.6)]"
              >
                <path fill="#c8102e" d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z" />
                <path fill="#f2f2f2" d="M884 0h-93L248 377h93L884 0Z" />
              </svg>
            </div>
            <span className="hidden text-sm font-bold tracking-wider text-white sm:inline">
              ZEN<span className="text-[#e52545]">KAI</span>
            </span>
          </Link>

          <span className="text-zinc-600">/</span>

          <div className="flex items-center gap-2 min-w-0">
            <span className="max-w-[160px] truncate text-xs font-semibold text-zinc-300 sm:max-w-xs md:max-w-md">
              {title}
            </span>
            {chapterNumber ? (
              <span className="rounded-md bg-red-600/20 px-2 py-0.5 text-[0.65rem] font-bold text-red-300 ring-1 ring-red-500/30">
                CH {chapterNumber}
              </span>
            ) : null}
          </div>
        </div>

        {toolbar}
      </div>
      <div className="py-4">{children}</div>
    </div>
  );
}

/**
 * Resolve a chapter number to a feed entry.
 *
 * Falls back to the closest chapter at or below the requested number so that
 * `/read/1/12` can open chapter 12.5 instead of failing outright.
 */
function resolveChapter(
  chapterNumber: number,
  items: MangaChapter[] | undefined,
): MangaChapter | null {
  if (!items?.length) return null;

  // Exact chapter match: prefer readable entries (pages > 0 and no externalUrl) over external placeholders
  const exactMatches = items.filter((item) => Number(item.chapterNumber) === chapterNumber);
  if (exactMatches.length > 0) {
    const readable = exactMatches.find((item) => (item.pages ?? 0) > 0 && !item.externalUrl);
    return readable ?? exactMatches[0];
  }

  const numeric = items
    .map((item) => ({ item, value: Number(item.chapterNumber) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => a.value - b.value);

  const belowMatches = [...numeric].reverse().filter((entry) => entry.value <= chapterNumber);
  if (belowMatches.length > 0) {
    const targetValue = belowMatches[0].value;
    const sameValueGroup = belowMatches.filter((entry) => entry.value === targetValue);
    const readable = sameValueGroup.find(
      (entry) => (entry.item.pages ?? 0) > 0 && !entry.item.externalUrl,
    );
    return readable?.item ?? sameValueGroup[0].item;
  }

  return numeric[0]?.item ?? items[0] ?? null;
}

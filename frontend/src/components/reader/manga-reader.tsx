"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Maximize2,
  Square,
  Smartphone,
} from "lucide-react";

import {
  fetchMangaChapters,
  fetchMangaChapterPages,
  type MangaChapter,
} from "@/lib/api/zenkai";
import { useThrottledProgressSaver, useUnitProgress } from "@/hooks/use-progress";
import { cn } from "@/lib/utils";

export type ReaderMode = "vertical" | "paged" | "double";

export interface MangaReaderProps {
  /** MangaDex UUID. */
  mangaId: string;
  /** 1-based chapter number as shown in the URL. */
  chapterNumber: number;
  title: string;
  coverUrl?: string | null;
}

/**
 * The manga reader.
 *
 * Pages come from the MangaDex@Home image server. Those base URLs are
 * short-lived (about 15 minutes), so pages are resolved when the reader mounts
 * rather than cached ahead of time.
 *
 * Three modes:
 *  - `vertical` long-strip scroll, the default most readers expect
 *  - `paged`    one page at a time
 *  - `double`   two pages side by side, for wide spreads
 */
export function MangaReader({
  mangaId,
  chapterNumber,
  title,
  coverUrl,
}: MangaReaderProps) {
  const [mode, setMode] = useState<ReaderMode>("vertical");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const feed = useQuery({
    queryKey: ["manga-chapters", mangaId],
    queryFn: () => fetchMangaChapters(mangaId, "en"),
    staleTime: 5 * 60_000,
  });

  // The URL carries a chapter number; resolve it to the closest feed entry so
  // `/read/12/12.5` can open chapter 12.5 instead of failing outright.
  const chapter = useMemo(
    () => resolveChapter(chapterNumber, feed.data?.items),
    [chapterNumber, feed.data?.items],
  );
  const chapterId = chapter?.id ?? null;

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
    if (restored.current || !total || mode !== "paged") return;
    restored.current = true;
    if (savedPage && savedPage > 1 && savedPage <= total) {
      setPage(savedPage - 1);
    }
  }, [total, savedPage, mode]);

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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  // Paged modes: arrows navigate. Fullscreen works in every mode.
  useHotkeys("arrowright, d", () => goTo(page + 1), { enabled: mode !== "vertical" });
  useHotkeys("arrowleft, a", () => goTo(page - 1), { enabled: mode !== "vertical" });
  useHotkeys("f", toggleFullscreen);

  if (feed.isLoading || pages.isLoading) {
    return (
      <ReaderShell title={title}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </ReaderShell>
    );
  }

  const error = feed.error ?? pages.error;
  if (error) {
    return (
      <ReaderShell title={title}>
        <p className="p-8 text-center text-sm text-destructive">
          Could not load this chapter: {(error as Error).message}
        </p>
      </ReaderShell>
    );
  }

  if (!chapter) {
    return (
      <ReaderShell title={title}>
        <p className="p-8 text-center text-sm text-muted-foreground">
          Chapter {chapterNumber} is not available for this title.
        </p>
      </ReaderShell>
    );
  }

  if (!total) {
    return (
      <ReaderShell title={title}>
        <p className="p-8 text-center text-sm text-muted-foreground">
          This chapter has no readable pages.
        </p>
      </ReaderShell>
    );
  }

  return (
    <ReaderShell
      title={title}
      toolbar={
        <ReaderToolbar mode={mode} onModeChange={setMode} onFullscreen={toggleFullscreen} />
      }
    >
      {mode === "vertical" ? (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1">
          {pageUrls.map((url, index) => (
            <ReaderImage key={url} src={url} index={index} onVisible={() => reportPage(index)} />
          ))}
          <div className="py-8 text-center text-xs text-muted-foreground">
            End of chapter {chapterNumber}
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
        />
      )}
    </ReaderShell>
  );
}

const MODE_OPTIONS: { value: ReaderMode; label: string; icon: typeof Square }[] = [
  { value: "vertical", label: "Vertical scroll", icon: Smartphone },
  { value: "paged", label: "Single page", icon: Square },
  { value: "double", label: "Double page", icon: Columns2 },
];

function ReaderToolbar({
  mode,
  onModeChange,
  onFullscreen,
}: {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
        {MODE_OPTIONS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => onModeChange(entry.value)}
            aria-pressed={mode === entry.value}
            title={entry.label}
            className={cn(
              "grid size-8 place-items-center rounded-lg transition-colors",
              mode === entry.value
                ? "bg-brand-500/30 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <entry.icon className="size-4" />
            <span className="sr-only">{entry.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onFullscreen}
        title="Fullscreen (F)"
        className="grid size-8 place-items-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Maximize2 className="size-4" />
        <span className="sr-only">Toggle fullscreen</span>
      </button>
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
}: {
  pageUrls: string[];
  page: number;
  mode: ReaderMode;
  direction: "forward" | "backward";
  onGoTo: (page: number) => void;
  onReport: (index: number) => void;
}) {
  const total = pageUrls.length;
  const spread = spreadFor(pageUrls, page, mode);

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center">
      <div
        className={cn(
          "flex w-full items-center justify-center gap-1",
          direction === "backward" && "flex-row-reverse",
        )}
      >
        {spread.map(({ url, index }) => (
          <ReaderImage key={url} src={url} index={index} onVisible={() => onReport(index)} />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onGoTo(page - 1)}
          disabled={page === 0}
          className="grid size-10 place-items-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="w-24 text-center text-xs tabular-nums text-muted-foreground">
          {page + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => onGoTo(page + 1)}
          disabled={page >= total - 1}
          className="grid size-10 place-items-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <input
        type="range"
        min={1}
        max={total}
        value={page + 1}
        onChange={(event) => onGoTo(Number(event.target.value) - 1)}
        className="mt-3 w-full max-w-md accent-brand-500"
        aria-label="Page"
      />
    </div>
  );
}

/** Which pages are visible for the current page index and mode. */
function spreadFor(
  urls: string[],
  page: number,
  mode: ReaderMode,
): { url: string; index: number }[] {
  const url = urls[page];
  if (!url) return [];
  if (mode !== "double") return [{ url, index: page }];

  // Pair pages so a spread never starts on an odd index.
  const start = page % 2 === 0 ? page : Math.max(0, page - 1);
  const slice = urls.slice(start, start + 2);
  if (slice.length === 0) return [{ url, index: page }];
  return slice.map((item, offset) => ({ url: item, index: start + offset }));
}

/**
 * A single page image.
 *
 * `loading="lazy"` keeps long chapters from pulling every full-resolution page
 * at once. Only the first page that scrolls into view reports progress, so the
 * saved position does not jitter while scrolling.
 *
 * Page URLs are signed and short-lived upstream and are consumed ephemeraly by
 * the reader: they are rendered now and allowed to age out of the query cache,
 * never persisted to IndexedDB or localStorage.
 */
function ReaderImage({
  src,
  index,
  onVisible,
}: {
  src: string;
  index: number;
  onVisible: () => void;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const ref = useRef<HTMLDivElement | null>(null);
  const reported = useRef(false);
  const startedAt = useRef(0);

  // Avoid calling performance.now during render; initialise in an effect so
  // the linter's purity rule is satisfied.
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || reported.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !reported.current) {
            reported.current = true;
            onVisible();
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div className="relative w-full" ref={ref}>
      {state === "loading" ? (
        <div className="flex aspect-[2/3] w-full items-center justify-center bg-white/5">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {state === "error" ? (
        <div className="flex aspect-[2/3] w-full items-center justify-center bg-white/5 text-xs text-muted-foreground">
          Page {index + 1} failed to load
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Page ${index + 1}`}
        loading="lazy"
        decoding="async"
        onLoad={() => {
          setState("loaded");
        }}
        onError={() => {
          setState("error");
        }}
        className={cn("w-full select-none", state === "loaded" ? "block" : "hidden")}
      />
    </div>
  );
}

function ReaderShell({
  title,
  toolbar,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black/95">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-4 py-2 backdrop-blur">
        <span className="text-sm font-semibold">{title}</span>
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

  const exact = items.find((item) => Number(item.chapterNumber) === chapterNumber);
  if (exact) return exact;

  const numeric = items
    .map((item) => ({ item, value: Number(item.chapterNumber) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => a.value - b.value);

  const below = [...numeric].reverse().find((entry) => entry.value <= chapterNumber);
  return below?.item ?? numeric[0]?.item ?? null;
}

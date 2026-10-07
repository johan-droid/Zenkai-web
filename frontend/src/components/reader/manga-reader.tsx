"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Maximize2,
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
  anilistId,
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

  // Next and previous chapter calculation for effortless reading continuation
  const nextChapter = useMemo(() => {
    if (!feed.data?.items) return null;
    const sorted = [...feed.data.items]
      .map((item) => ({ item, num: Number(item.chapterNumber) }))
      .filter((e) => Number.isFinite(e.num) && e.num > chapterNumber)
      .sort((a, b) => a.num - b.num);
    return sorted[0]?.num ?? null;
  }, [feed.data?.items, chapterNumber]);

  const prevChapter = useMemo(() => {
    if (!feed.data?.items) return null;
    const sorted = [...feed.data.items]
      .map((item) => ({ item, num: Number(item.chapterNumber) }))
      .filter((e) => Number.isFinite(e.num) && e.num < chapterNumber)
      .sort((a, b) => b.num - a.num);
    return sorted[0]?.num ?? null;
  }, [feed.data?.items, chapterNumber]);

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

  // Paged modes: arrows navigate (reversing for RTL). Fullscreen works in every mode.
  useHotkeys("arrowright, d", () => (mode === "rtl" ? goTo(page - 1) : goTo(page + 1)), {
    enabled: mode !== "vertical",
  });
  useHotkeys("arrowleft, a", () => (mode === "rtl" ? goTo(page + 1) : goTo(page - 1)), {
    enabled: mode !== "vertical",
  });
  useHotkeys("f", toggleFullscreen);

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
    return (
      <ReaderShell title={title} chapterNumber={chapterNumber} mangaRoute={mangaRoute}>
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="text-sm text-red-400">
            Could not load this chapter: {(error as Error).message}
          </p>
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
            Chapter {chapterNumber} is not available for this title.
          </p>
          <Button variant="outline" className="glass rounded-xl" asChild>
            <Link href={mangaRoute}>Back to title</Link>
          </Button>
        </div>
      </ReaderShell>
    );
  }

  if (!total) {
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

  return (
    <ReaderShell
      title={title}
      chapterNumber={chapterNumber}
      mangaRoute={mangaRoute}
      toolbar={
        <ReaderToolbar mode={mode} onModeChange={setMode} onFullscreen={toggleFullscreen} />
      }
    >
      {mode === "vertical" ? (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1">
          {pageUrls.map((url, index) => (
            <ReaderImage key={url} src={url} index={index} onVisible={() => reportPage(index)} />
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
}: {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
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
                ? "bg-red-600/30 text-white ring-1 ring-red-500/40"
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
        className="grid size-8 place-items-center rounded-lg bg-white/5 text-muted-foreground ring-1 ring-white/10 transition-colors hover:text-foreground"
      >
        <Maximize2 className="size-4" />
        <span className="sr-only">Toggle fullscreen</span>
      </button>
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
}: {
  pageUrls: string[];
  page: number;
  mode: ReaderMode;
  direction: "forward" | "backward";
  onGoTo: (page: number) => void;
  onReport: (index: number) => void;
  readRouteBase?: string;
  nextChapter?: number | null;
  prevChapter?: number | null;
  mangaRoute?: string;
}) {
  const total = pageUrls.length;
  const spread = spreadFor(pageUrls, page, mode);

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-4">
      <div
        className={cn(
          "flex w-full items-center justify-center gap-1",
          (direction === "backward" || mode === "rtl") && "flex-row-reverse",
        )}
      >
        {spread.map(({ url, index }) => (
          <ReaderImage key={url} src={url} index={index} onVisible={() => onReport(index)} />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onGoTo(mode === "rtl" ? page + 1 : page - 1)}
          disabled={mode === "rtl" ? page >= total - 1 : page === 0}
          className="grid size-10 place-items-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 disabled:opacity-30 ring-1 ring-white/10"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-32 text-center text-xs tabular-nums text-zinc-300">
          Page {page + 1} of {total} ({mode.toUpperCase()})
        </span>
        <button
          type="button"
          onClick={() => onGoTo(mode === "rtl" ? page - 1 : page + 1)}
          disabled={mode === "rtl" ? page === 0 : page >= total - 1}
          className="grid size-10 place-items-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 disabled:opacity-30 ring-1 ring-white/10"
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
        className="mt-3 w-full max-w-md accent-red-500"
        aria-label="Page"
      />

      {page >= total - 1 && nextChapter !== null && nextChapter !== undefined && (
        <div className="mt-8 flex items-center gap-3">
          <Button className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-700/30" asChild>
            <Link href={`${readRouteBase}/${nextChapter}`}>
              Next Chapter {nextChapter} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function ReaderShell({
  title,
  chapterNumber,
  mangaRoute,
  toolbar,
  children,
}: {
  title: string;
  chapterNumber?: number;
  mangaRoute?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
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

  const exact = items.find((item) => Number(item.chapterNumber) === chapterNumber);
  if (exact) return exact;

  const numeric = items
    .map((item) => ({ item, value: Number(item.chapterNumber) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => a.value - b.value);

  const below = [...numeric].reverse().find((entry) => entry.value <= chapterNumber);
  return below?.item ?? numeric[0]?.item ?? null;
}

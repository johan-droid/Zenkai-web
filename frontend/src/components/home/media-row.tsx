"use client";

import { useRef } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Star, WifiOff } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import { cleanImageUrl, type ShelfState } from "@/lib/api/zenkai";
import {
  displayTitle,
  formatScore,
  mediaHref,
  type MediaSummary,
} from "@/lib/media";
import { cn } from "@/lib/utils";

function SectionHeader({
  title,
  href,
  index,
}: {
  title: string;
  href?: string;
  index?: number;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/[0.07] pb-2.5">
      <div className="flex min-w-0 items-baseline gap-3">
        {typeof index === "number" ? (
          <span className="font-mono text-[0.62rem] font-medium tracking-[0.18em] text-signal tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
        ) : null}
        <h2 className="truncate text-[1.05rem] font-bold tracking-[-0.01em] text-ink-1 sm:text-xl">
          {title}
        </h2>
      </div>
      {href ? (
        <Link
          href={href}
          className="group/see -my-2 flex min-h-10 shrink-0 items-center gap-1 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:text-ink-1"
        >
          <span>View all</span>
          <ChevronRight
            className="size-3 transition-transform duration-200 group-hover/see:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}

export function MediaRow({
  title,
  href,
  state,
  className,
  ranked = false,
  index,
}: {
  title: string;
  href?: string;
  state: ShelfState;
  className?: string;
  ranked?: boolean;
  /** Section order on the page, used as an editorial running number. */
  index?: number;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SectionHeader title={title} href={href} index={index} />
      <ShelfBody state={state} ranked={ranked} />
    </section>
  );
}

/**
 * A ranked shelf set as a two-column reading list rather than another poster
 * rail: the homepage needs one surface where titles and scores can be scanned
 * side by side instead of a sixth identical carousel.
 */
export function RankedList({
  title,
  href,
  state,
  className,
  index,
  limit = 6,
}: {
  title: string;
  href?: string;
  state: ShelfState;
  className?: string;
  index?: number;
  limit?: number;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SectionHeader title={title} href={href} index={index} />
      {state.kind === "items" ? (
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {state.items.slice(0, limit).map((media, i) => (
            <RankedListItem key={`${media.kind}-${media.id}`} media={media} rank={i + 1} />
          ))}
        </ol>
      ) : state.kind === "loading" ? (
        <div className="grid gap-x-8 sm:grid-cols-2">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-white/[0.06] py-3">
              <div className="h-4 w-5 rounded bg-white/10" />
              <div className="h-16 w-11 shrink-0 rounded-md bg-white/[0.06]" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3 w-3/5 rounded bg-white/10" />
                <div className="h-2.5 w-2/5 rounded bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      ) : state.kind === "empty" ? (
        <ShelfNote
          icon={ChevronRight}
          title="Nothing ranked yet"
          description="This list fills in as the catalogue gains scored titles."
        />
      ) : state.kind === "unavailable" ? (
        <ShelfNote
          icon={WifiOff}
          title="Rankings are temporarily unavailable"
          description="The data source could not be reached; this is not an empty list."
        />
      ) : (
        <ShelfNote icon={AlertTriangle} title="Could not load rankings" description={state.message} />
      )}
    </section>
  );
}

function RankedListItem({ media, rank }: { media: MediaSummary; rank: number }) {
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);
  const cover = cleanImageUrl(media.cover.url);

  return (
    <li className="border-b border-white/[0.06]">
      <Link
        href={mediaHref(media)}
        className="group/rank flex items-center gap-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal sm:gap-4"
        aria-label={`${title}${score ? `, rated ${score}` : ""}`}
      >
        <span className="w-5 shrink-0 font-mono text-sm font-semibold text-ink-3 tabular-nums group-hover/rank:text-signal">
          {String(rank).padStart(2, "0")}
        </span>

        <span className="relative block h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-white/[0.06]">
          {cover && !cover.startsWith("file:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : null}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-1 text-sm font-semibold text-ink-1 group-hover/rank:text-signal-soft">
            {title}
          </span>
          <span className="truncate text-[0.68rem] text-ink-3">
            {[media.format !== "UNKNOWN" ? media.format : null, media.seasonYear]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        {score ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-2 tabular-nums">
            <Star className="size-3 fill-signal text-signal" aria-hidden="true" />
            {score}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function ShelfBody({
  state,
  ranked,
}: {
  state: ShelfState;
  ranked?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = direction === "left" ? -480 : 480;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (state.kind === "loading") {
    return (
      <div className="no-scrollbar -mx-1 flex gap-3.5 overflow-hidden px-1 pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={cn("shrink-0", ranked ? "w-40 sm:w-48 md:w-52" : "w-32 sm:w-40 md:w-44")}>
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-surface-2" />
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="h-3 w-4/5 rounded bg-white/10" />
              <div className="h-2.5 w-1/2 rounded bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === "items") {
    return (
      <div className="group/shelf relative">
        <button
          type="button"
          aria-label="Scroll shelf left"
          onClick={() => handleScroll("left")}
          className={cn(
            "absolute -left-4 top-[38%] z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full",
            "border border-white/15 bg-surface-0/90 text-ink-1 backdrop-blur-sm",
            "transition-colors duration-150 hover:border-white/35 hover:bg-surface-2",
            "focus-visible:outline-2 focus-visible:outline-signal md:flex",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>

        <div
          ref={scrollRef}
          className="no-scrollbar -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2"
        >
          {state.items.map((media, i) => (
            <MediaCard
              key={`${media.kind}-${media.id}-${i}`}
              media={media}
              index={i}
              rank={ranked ? i + 1 : undefined}
              className={cn(
                "shrink-0 snap-start",
                ranked ? "w-40 sm:w-48 md:w-52" : "w-32 sm:w-40 md:w-44",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Scroll shelf right"
          onClick={() => handleScroll("right")}
          className={cn(
            "absolute -right-4 top-[38%] z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full",
            "border border-white/15 bg-surface-0/90 text-ink-1 backdrop-blur-sm",
            "transition-colors duration-150 hover:border-white/35 hover:bg-surface-2",
            "focus-visible:outline-2 focus-visible:outline-signal md:flex",
          )}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <ShelfNote
        icon={ChevronRight}
        title="Nothing here right now"
        description="No titles are in this shelf at the moment."
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <ShelfNote
        icon={WifiOff}
        title="This shelf is temporarily unavailable"
        description="Its data source could not be reached. It will return automatically — this is not an empty shelf."
      />
    );
  }

  return (
    <ShelfNote
      icon={AlertTriangle}
      title="Could not load this shelf"
      description={state.message}
    />
  );
}

function ShelfNote({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof AlertTriangle;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-y border-white/[0.07] py-6">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink-1">{title}</p>
      </div>
      {description ? (
        <p className="pl-6 text-xs leading-relaxed text-ink-3">{description}</p>
      ) : null}
    </div>
  );
}

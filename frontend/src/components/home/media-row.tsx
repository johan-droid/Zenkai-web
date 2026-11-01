"use client";

import { useRef } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import type { ShelfState } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

export function MediaRow({
  title,
  href,
  state,
  className,
}: {
  title: string;
  href?: string;
  state: ShelfState;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {/* Section header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            {/* Crimson accent bar */}
            <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-signal to-signal-soft" />
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
          </div>
        </div>
        {href ? (
          <Link
            href={href}
            className="focus-ring rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-signal"
          >
            See all
            <ChevronRight className="size-4 hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>

      <ShelfBody state={state} />
    </section>
  );
}

function ShelfBody({ state }: { state: ShelfState }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = direction === "left" ? -480 : 480;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (state.kind === "loading") {
    return (
      <div className="flex gap-3.5 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="w-36 shrink-0 sm:w-44">
            <div className="aspect-[2/3] rounded-xl bg-surface-1" />
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="h-2.5 rounded-full bg-surface-1 w-4/5" />
              <div className="h-2 rounded-full bg-surface-1 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === "items") {
    return (
      <div className="group/shelf relative">
        {/* Left arrow */}
        <button
          type="button"
          aria-label="Scroll shelf left"
          onClick={() => handleScroll("left")}
          className="absolute -left-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-surface-2/90 bg-surface-1 text-ink-2 shadow-none backdrop-blur-none focus-visible:ring-2 focus-visible:ring-signal [&]:active:[scale-105] [&]:disabled:[opacity-50] md-flex"
        >
          <ChevronLeft className="size-4" />
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
              className="w-36 shrink-0 snap-start sm:w-44"
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          aria-label="Scroll shelf right"
          onClick={() => handleScroll("right")}
          className="absolute -right-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl border border-surface-2/90 bg-surface-1 text-ink-2 shadow-none backdrop-blur-none focus-visible:ring-2 focus-visible:ring-signal [&]:active:[scale-105] [&]:disabled:[opacity-50] md-flex"
        >
          <ChevronRight className="size-4" />
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
    <div className="glass-panel flex flex-col gap-1.5 rounded-2xl px-5 py-7">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="size-4 shrink-0" />
        <p className="text-sm font-medium text-ink-2">{title}</p>
      </div>
      {description ? (
        <p className="pl-6 text-xs leading-relaxed text-ink-3/80">{description}</p>
      ) : null}
    </div>
  );
}
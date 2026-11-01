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
  ranked = false,
}: {
  title: string;
  href?: string;
  state: ShelfState;
  className?: string;
  ranked?: boolean;
}) {
  return (
    <section className={cn("flex flex-col gap-3.5", className)}>
      {/* Section header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {/* Crimson accent bar */}
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#C51F3A] to-[#E02E4D] shadow-sm shadow-[#C51F3A]/40" />
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            {title}
          </h2>
        </div>
        {href ? (
          <Link
            href={href}
            className="group/see flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C51F3A]"
          >
            <span>See all</span>
            <ChevronRight className="size-3.5 transition-transform duration-200 group-hover/see:translate-x-0.5" />
          </Link>
        ) : null}
      </div>

      <ShelfBody state={state} ranked={ranked} />
    </section>
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
          <div key={i} className="w-36 shrink-0 sm:w-44">
            <div className="aspect-[2/3] w-full rounded-xl border border-white/[0.06] bg-[#16161c] animate-pulse" />
            <div className="mt-2.5 flex flex-col gap-1.5">
              <div className="h-3 w-4/5 rounded bg-white/10 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/10 animate-pulse" />
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
          className={cn(
            "absolute -left-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl",
            "border border-white/10 bg-[#16161c]/90 text-zinc-200 backdrop-blur-md shadow-xl",
            "transition-all duration-200 hover:border-[#C51F3A] hover:bg-[#C51F3A] hover:text-white hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A] md:flex",
          )}
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
              rank={ranked ? i + 1 : undefined}
              className="w-36 shrink-0 snap-start sm:w-44"
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          aria-label="Scroll shelf right"
          onClick={() => handleScroll("right")}
          className={cn(
            "absolute -right-3 top-[40%] z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-xl",
            "border border-white/10 bg-[#16161c]/90 text-zinc-200 backdrop-blur-md shadow-xl",
            "transition-all duration-200 hover:border-[#C51F3A] hover:bg-[#C51F3A] hover:text-white hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C51F3A] md:flex",
          )}
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
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-[#16161c]/70 px-5 py-7 backdrop-blur-md">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon className="size-4 shrink-0" />
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
      </div>
      {description ? (
        <p className="pl-6 text-xs leading-relaxed text-zinc-400/80">{description}</p>
      ) : null}
    </div>
  );
}

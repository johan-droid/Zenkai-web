"use client";

import { AlertTriangle, ChevronRight, WifiOff } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShelfState } from "@/lib/api/zenkai";
import { cn } from "@/lib/utils";

/**
 * A discovery shelf row.
 *
 * The row is presentational: the page feeds it a `ShelfState` derived from the
 * canonical API, so the four meaningful outcomes stay visually distinct —
 * loading skeletons, populated cards, a genuine "nothing here", and an
 * unavailable/error note that never masquerades as empty content.
 */
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
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
          <span className="h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-400 to-transparent" />
        </div>
        {href ? (
          <Link
            href={href}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See all
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>

      <ShelfBody state={state} />
    </section>
  );
}

function ShelfBody({ state }: { state: ShelfState }) {
  if (state.kind === "loading") {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[2/3] w-36 shrink-0 rounded-2xl sm:w-44" />
        ))}
      </div>
    );
  }

  if (state.kind === "items") {
    return (
      <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
        {state.items.map((media, index) => (
          <MediaCard
            // A shelf can list several units of one title (the upcoming shelf
            // lists episodes), so the position disambiguates the key.
            key={`${media.kind}-${media.id}-${index}`}
            media={media}
            className="w-36 shrink-0 snap-start sm:w-44"
          />
        ))}
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
    <div className="glass-panel flex flex-col gap-1 rounded-2xl px-5 py-8">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { browseMedia, type BrowseMediaParams } from "@/lib/api/anilist";
import { cn } from "@/lib/utils";

export function MediaRow({
  title,
  href,
  queryKey,
  params,
  className,
}: {
  title: string;
  href?: string;
  queryKey: string;
  params: BrowseMediaParams;
  className?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["row", queryKey],
    queryFn: () => browseMedia(params),
    staleTime: 5 * 60_000,
  });

  const items = data?.items ?? [];

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

      {isLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[2/3] w-36 shrink-0 rounded-2xl sm:w-44" />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
          {items.map((media) => (
            <MediaCard
              key={`${media.kind}-${media.id}`}
              media={media}
              className="w-36 shrink-0 snap-start sm:w-44"
            />
          ))}
        </div>
      )}
    </section>
  );
}

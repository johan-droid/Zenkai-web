import { MediaCard } from "@/components/cards/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MediaSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

export function MediaGrid({
  items,
  className,
  priorityCount = 0,
}: {
  items: MediaSummary[];
  className?: string;
  priorityCount?: number;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {items.map((media, index) => (
        <MediaCard
          key={`${media.kind}-${media.id}`}
          media={media}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}

export function MediaGridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl bg-white/[0.05]" />
          <Skeleton className="h-3.5 w-4/5 rounded bg-white/[0.05]" />
          <Skeleton className="h-2.5 w-1/2 rounded bg-white/[0.03]" />
        </div>
      ))}
    </div>
  );
}

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
        "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="aspect-[2/3] rounded-2xl" />
      ))}
    </div>
  );
}

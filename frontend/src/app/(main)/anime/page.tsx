import { Suspense } from "react";

import { BrowseView } from "@/components/browse/browse-view";
import { MediaGridSkeleton } from "@/components/cards/media-grid";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Anime · Zenkai" };

export default function AnimePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Anime"
        description="Filter by genre, format, status and sort to find your next watch."
      />
      <Suspense fallback={<MediaGridSkeleton />}>
        <BrowseView type="ANIME" />
      </Suspense>
    </div>
  );
}

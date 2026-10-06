import { Suspense } from "react";

import { BrowseView } from "@/components/browse/browse-view";
import { MediaGridSkeleton } from "@/components/cards/media-grid";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Manga · Zenkai" };

export default function MangaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Manga"
        description="Browse and filter the catalogue, then jump straight into the reader."
      />
      <Suspense fallback={<MediaGridSkeleton />}>
        <BrowseView kind="manga" />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";

import { BrowseView } from "@/components/browse/browse-view";
import { MediaGridSkeleton } from "@/components/cards/media-grid";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Light Novels · Zenkai" };

export default function NovelPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Light Novels"
        description="Browse and explore light novels, and dive into formatted chapter reading."
      />
      <Suspense fallback={<MediaGridSkeleton />}>
        <BrowseView kind="novel" />
      </Suspense>
    </div>
  );
}

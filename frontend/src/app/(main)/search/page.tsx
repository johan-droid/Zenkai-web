import { Suspense } from "react";

import { MediaGridSkeleton } from "@/components/cards/media-grid";
import { SearchView } from "@/components/search/search-view";

export const metadata = { title: "Search · Zenkai" };

export default function SearchPage() {
  return (
    <Suspense fallback={<MediaGridSkeleton />}>
      <SearchView />
    </Suspense>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import {
  fetchMangaDetail,
  fetchMangaChapters,
  classifyMangaError,
  mangaDetailToDetailData,
} from "@/lib/api/zenkai";
import { readHref } from "@/lib/media";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/hooks/use-progress";

/** Chapters the grid renders before it stops; presentation limit only. */
const MAX_CHAPTER_BUTTONS = 100;

/**
 * The manga detail surface (P17).
 *
 * Reads the canonical backend instead of the legacy AniList client. The route
 * addresses the title by its AniList id, which is what browse, search and the
 * library link to; the backend bridges that id to the MangaDex catalogue
 * internally and the frontend never sees a provider split.
 *
 * Failure semantics match the contract: a 404 is a missing title, a network or
 * contract failure is "unavailable", and a partial payload is never rendered as
 * a full detail.
 */
export function MediaDetailView({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["detail", "manga", id],
    queryFn: () => fetchMangaDetail(id),
    staleTime: 10 * 60_000,
  });

  const mediaId = data?.mangadexId ?? data?.id ?? id;

  const chaptersQuery = useQuery({
    queryKey: ["detail-chapters", "manga", mediaId],
    queryFn: () => fetchMangaChapters(mediaId),
    enabled: Boolean(data),
    staleTime: 10 * 60_000,
  });

  const continueEntries = useContinueWatching("manga");
  const continueEntry = continueEntries?.find(
    (e) => e.mediaId === id || (mediaId && e.mediaId === mediaId),
  );
  const continueUnit = continueEntry?.unit ?? null;

  if (isLoading) return <DetailSkeleton />;

  if (error) {
    const failure = classifyMangaError(error);
    if (failure === "not_found") return <DetailNotFound kind="manga" />;
    return (
      <div className="flex flex-col gap-8">
        <p className="text-sm text-destructive">
          Could not load this manga: {failure === "invalid_response"
            ? "This manga returned data the page could not understand."
            : "The manga service could not answer just now."}
        </p>
      </div>
    );
  }

  if (!data) return <DetailNotFound kind="manga" />;

  const detailData = mangaDetailToDetailData(data, id);
  const chapters = chaptersQuery.data?.items ?? [];
  // Use chapters from the backend API; do not fabricate synthetic 1..N chapters
  // from data.totalChapters. If the backend returns no chapters, show "no chapters"
  // rather than rendering phantom chapter buttons.
  const hasChapters = chapters.length > 0;

  return (
    <DetailLayout data={detailData} kind="manga" continueUnit={continueUnit}>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Chapters</h2>
          {hasChapters && (
            <span className="text-xs text-muted-foreground">{chapters.length} available</span>
          )}
        </div>

        {hasChapters ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {chapters.slice(0, MAX_CHAPTER_BUTTONS).map((ch) => (
              <Button
                key={ch.id}
                variant="outline"
                className="glass justify-start rounded-xl truncate"
                asChild
              >
                <Link href={readHref(id, ch.chapterNumber)} title={ch.title ? `Chapter ${ch.chapterNumber}: ${ch.title}` : `Chapter ${ch.chapterNumber}`}>
                  <span className="truncate">CH {ch.chapterNumber}{ch.title ? ` - ${ch.title}` : ""}</span>
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No chapters available for this title yet.</p>
        )}

        {chaptersQuery.isLoading && !hasChapters ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : null}
      </section>
    </DetailLayout>
  );
}
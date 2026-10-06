"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import {
  fetchMangaDetail,
  classifyMangaError,
} from "@/lib/api/zenkai";
import { readHref } from "@/lib/media";

/** Chapters the grid renders before it stops; presentation limit only. */
const MAX_CHAPTER_BUTTONS = 60;

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

  // The canonical id the reader routes address by; falls back to the local id
  // when the backend has not yet bridged the title to a MangaDex catalogue row.
  const mediaId = data.mangadexId ?? data.id;
  const shownUnits = Math.min(data.totalChapters ?? 0, MAX_CHAPTER_BUTTONS);

  return (
    <DetailLayout data={data as unknown as import("@/lib/media").DetailData} kind="manga">
      {shownUnits > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold tracking-tight">Chapters</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: shownUnits }, (_, index) => index + 1).map((unit) => (
              <Button
                key={unit}
                variant="outline"
                className="glass justify-start rounded-xl"
                asChild
              >
                <Link href={readHref(mediaId, unit)}>CH {unit}</Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </DetailLayout>
  );
}
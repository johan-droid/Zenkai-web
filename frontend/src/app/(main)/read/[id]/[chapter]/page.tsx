"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { MangaReader } from "@/components/reader/manga-reader";
import { EmptyState } from "@/components/common/empty-state";
import { SearchX } from "lucide-react";
import {
  fetchMangaDetail,
  classifyMangaError,
} from "@/lib/api/zenkai";

/**
 * Manga reader route (P17).
 *
 * The URL uses AniList ids — that is what browse, search and the library link
 * to — and the canonical backend bridges that id to the MangaDex catalogue
 * internally. The frontend no longer calls AniList or MangaDex directly: one
 * validated request resolves the title, and the reader component fetches
 * chapters and pages from the same backend.
 *
 * Failure semantics match the contract: a 404 is a missing title, a network or
 * contract failure is an unavailable title, and a partial payload is never
 * rendered as a full reader.
 */
export default function ReadPage() {
  const params = useParams();
  const anilistId = params.id as string;
  const chapterNumber = Number(params.chapter as string);

  const media = useQuery({
    queryKey: ["read-media", anilistId],
    queryFn: () => fetchMangaDetail(anilistId),
    enabled: Boolean(anilistId && anilistId !== "undefined"),
    staleTime: 10 * 60_000,
  });

  const title =
    media.data?.titles?.primary ??
    media.data?.canonicalTitle ??
    "";

  const mangaId = media.data?.mangadexId ?? media.data?.id ?? null;

  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
    return (
      <EmptyState
        icon={SearchX}
        title="Invalid chapter"
        description={`"${params.chapter as string}" is not a chapter number.`}
      />
    );
  }

  if (media.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Finding this title...</span>
      </div>
    );
  }

  if (media.isError) {
    const failure = classifyMangaError(media.error);
    if (failure === "not_found") {
      return (
        <EmptyState
          icon={SearchX}
          title="Title not found"
          description={title
            ? `"${title}" could not be found in the manga catalogue. Try browsing Manga titles instead.`
            : "This title could not be found in the manga catalogue."}
        />
      );
    }
    return (
      <EmptyState
        icon={SearchX}
        title="Could not load this title"
        description={failure === "invalid_response"
          ? "This title returned data the reader could not understand."
          : "The manga service could not answer just now. Try again in a moment."}
      />
    );
  }

  if (!mangaId) {
    return (
      <EmptyState
        icon={SearchX}
        title="No readable edition found"
        description={title
          ? `"${title}" is in the catalogue but has no readable edition available yet.`
          : "This title has no readable edition available yet."}
      />
    );
  }

  return (
    <MangaReader
      mangaId={mangaId}
      anilistId={anilistId}
      chapterNumber={chapterNumber}
      title={title}
      coverUrl={media.data?.coverUrl ?? media.data?.coverImageLarge ?? null}
    />
  );

}


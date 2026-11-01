"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Loader2, SearchX } from "lucide-react";

import { MangaReader } from "@/components/reader/manga-reader";
import { EmptyState } from "@/components/common/empty-state";
import {
  fetchMangaDetail,
  classifyMangaError,
  cleanImageUrl,
} from "@/lib/api/zenkai";

export interface ReadViewProps {
  id?: string;
  chapter?: string;
}

/**
 * Manga reader client view.
 *
 * Accepts id and chapter from server page props or falls back safely to
 * useParams with optional chaining to prevent hydration null reference errors.
 */
export function ReadView({ id, chapter }: ReadViewProps) {
  const routeParams = useParams<{ id?: string; chapter?: string }>();
  const anilistId = (id || routeParams?.id || "").trim();
  const rawChapter = (chapter || routeParams?.chapter || "1").trim();
  const chapterNumber = Number(rawChapter);

  const media = useQuery({
    queryKey: ["read-media", anilistId],
    queryFn: () => fetchMangaDetail(anilistId),
    enabled: Boolean(anilistId && anilistId !== "undefined"),
    staleTime: 10 * 60_000,
  });

  const title =
    media.data?.titles?.primary ??
    media.data?.canonicalTitle ??
    (media.data as { title?: string } | undefined)?.title ??
    "";

  const mangaId = media.data?.mangadexId ?? media.data?.id ?? null;

  if (!Number.isFinite(chapterNumber) || chapterNumber < 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Invalid chapter"
        description={`"${rawChapter}" is not a chapter number.`}
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
          description={
            title
              ? `"${title}" could not be found in the manga catalogue. Try browsing Manga titles instead.`
              : "This title could not be found in the manga catalogue."
          }
        />
      );
    }
    return (
      <EmptyState
        icon={SearchX}
        title="Could not load this title"
        description={
          failure === "invalid_response"
            ? "This title returned data the reader could not understand."
            : "The manga service could not answer just now. Try again in a moment."
        }
      />
    );
  }

  if (!mangaId) {
    return (
      <EmptyState
        icon={SearchX}
        title="No readable edition found"
        description={
          title
            ? `"${title}" is in the catalogue but has no readable edition available yet.`
            : "This title has no readable edition available yet."
        }
      />
    );
  }

  return (
    <MangaReader
      mangaId={mangaId}
      anilistId={anilistId}
      chapterNumber={chapterNumber}
      title={title}
      coverUrl={cleanImageUrl(media.data?.coverImageLarge ?? media.data?.coverUrl)}
    />
  );
}

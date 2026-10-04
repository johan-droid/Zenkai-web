"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { MangaReader } from "@/components/reader/manga-reader";
import { EmptyState } from "@/components/common/empty-state";
import { SearchX } from "lucide-react";
import { getMediaById } from "@/lib/api/anilist";
import { findMangaDexByTitle } from "@/lib/api/mangadex";
import { displayTitle } from "@/lib/media";

/**
 * Reader route.
 *
 * The URL uses AniList ids (that is what browse and detail pages link to), but
 * chapters and page images only exist on MangaDex, which has its own id space.
 * So this resolves the AniList title to a MangaDex entry before opening the
 * reader.
 */
export default function ReadPage() {
  const params = useParams();
  const mediaId = params.id as string;
  const chapterNumber = Number(params.chapter as string);

  const media = useQuery({
    queryKey: ["read-media", mediaId],
    queryFn: () => getMediaById({ id: Number(mediaId), type: "MANGA" }),
    enabled: Number.isFinite(Number(mediaId)),
    staleTime: 10 * 60_000,
  });

  const title = media.data ? displayTitle(media.data.summary.title) : "";

  const match = useQuery({
    queryKey: ["mangadex-match", mediaId, title],
    queryFn: () =>
      findMangaDexByTitle(title, {
        signals: media.data
          ? [
              media.data.summary.title.english,
              media.data.summary.title.romaji,
            ]
          : undefined,
      }),
    enabled: Boolean(title),
    staleTime: 60 * 60_000,
  });

  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
    return (
      <EmptyState
        icon={SearchX}
        title="Invalid chapter"
        description={`"${params.chapter as string}" is not a chapter number.`}
      />
    );
  }

  if (media.isLoading || match.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Finding this title on MangaDex...</span>
      </div>
    );
  }

  if (media.isError) {
    return (
      <EmptyState
        icon={SearchX}
        title="Could not load this title"
        description={(media.error as Error).message}
      />
    );
  }

  if (!match.data) {
    return (
      <EmptyState
        icon={SearchX}
        title="No MangaDex edition found"
        description={
          title
            ? `"${title}" could not be matched to a readable edition on MangaDex. Try browsing Manga titles instead.`
            : "This title could not be matched to a readable edition on MangaDex."
        }
      />
    );
  }

  return (
    <MangaReader
      mangaId={match.data.id}
      chapterNumber={chapterNumber}
      title={title}
      coverUrl={media.data?.summary.cover.url ?? null}
    />
  );
}


"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNovelDetail, fetchNovelChapters, novelSummaryToMedia } from "@/lib/api/zenkai";
import { readNovelHref } from "@/lib/media";

export function NovelDetailView({ id }: { id: string }) {
  const detailQuery = useQuery({
    queryKey: ["detail", "novel", id],
    queryFn: () => fetchNovelDetail(id),
    staleTime: 10 * 60_000,
  });

  const chaptersQuery = useQuery({
    queryKey: ["chapters", "novel", id],
    queryFn: () => fetchNovelChapters(id),
    enabled: Boolean(detailQuery.data),
    staleTime: 10 * 60_000,
  });

  if (detailQuery.isLoading) return <DetailSkeleton />;

  if (detailQuery.error || !detailQuery.data) {
    return <DetailNotFound kind="novel" />;
  }

  const novel = detailQuery.data;
  const mediaSummary = novelSummaryToMedia(novel);
  const detailData = {
    summary: mediaSummary,
    relations: [],
    recommendations: [],
    characters: [],
  };

  const chapters = chaptersQuery.data?.items ?? [];

  return (
    <DetailLayout data={detailData} kind="novel">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-brand-400" />
            <h2 className="text-lg font-bold tracking-tight">Chapters</h2>
          </div>
          {chapters.length > 0 && (
            <span className="text-xs text-muted-foreground">{chapters.length} available</span>
          )}
        </div>

        {chaptersQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : chapters.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {chapters.map((ch) => (
              <Button
                key={ch.id}
                variant="outline"
                className="glass justify-start rounded-xl truncate"
                asChild
              >
                <Link href={readNovelHref(id, ch.chapterNumber)}>
                  <span className="truncate">CH {ch.chapterNumber}</span>
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No chapters available for this novel yet.</p>
        )}
      </section>
    </DetailLayout>
  );
}

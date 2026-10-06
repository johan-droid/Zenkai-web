"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { DetailLayout, DetailNotFound, DetailSkeleton } from "@/components/detail/detail-layout";
import { Button } from "@/components/ui/button";
import { getMediaById } from "@/lib/api/anilist";
import { readHref } from "@/lib/media";

/** Chapters the grid renders before it stops; presentation limit only. */
const MAX_CHAPTER_BUTTONS = 60;

/**
 * The manga detail surface.
 *
 * Behaviour unchanged from before P13: it still reads the legacy client. The
 * anime branch was removed — the anime route now renders `AnimeDetailView`
 * from the canonical backend — and the shared `DetailLayout` renders the
 * same DOM this component always produced. Manga migrates in P17.
 */
export function MediaDetailView({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["detail", "manga", id],
    queryFn: () => getMediaById({ id: Number(id), type: "MANGA" }),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return <DetailSkeleton />;

  if (!data) return <DetailNotFound kind="manga" />;

  const shownUnits = Math.min(data.summary.chapters ?? 0, MAX_CHAPTER_BUTTONS);

  return (
    <DetailLayout data={data} kind="manga">
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
                <Link href={readHref(data.summary.id, unit)}>CH {unit}</Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </DetailLayout>
  );
}
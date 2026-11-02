"use client";

import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Check, ChevronDown, Clock, Eye, Play, Star, Trash2, Tv, XCircle, Plus } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getLibraryEntry,
  removeLibraryEntry,
  saveLibraryEntry,
  type LibraryStatus,
} from "@/lib/library";
import { displayTitle, formatScore, readHref, seasonLabel, watchHref, type DetailData, type MediaKind } from "@/lib/media";

/**
 * The shared detail layout (P13).
 *
 * Pure presentation: it receives an already-fetched `DetailData` and renders
 * hero, metadata, actions and the characters/relations/recommendations
 * shelves. It imports no API client.
 *
 * Composition: the banner is the stage, the poster and identity sit on it, and
 * facts are set as one text line rather than a row of badges.
 */

const LIBRARY_OPTIONS: { value: LibraryStatus; label: string; icon: React.ElementType }[] = [
  { value: "watching", label: "Watching", icon: Eye },
  { value: "plan", label: "Plan to watch", icon: Clock },
  { value: "completed", label: "Completed", icon: Check },
  { value: "dropped", label: "Dropped", icon: XCircle },
];

function LibraryButton({
  kind,
  mediaId,
  title,
  coverUrl,
}: {
  kind: MediaKind;
  mediaId: string;
  title: string;
  coverUrl: string | null;
}) {
  if (kind === "novel") return null;
  return (
    <LibraryButtonContent
      kind={kind as "anime" | "manga"}
      mediaId={mediaId}
      title={title}
      coverUrl={coverUrl}
    />
  );
}

function LibraryButtonContent({
  kind,
  mediaId,
  title,
  coverUrl,
}: {
  kind: "anime" | "manga";
  mediaId: string;
  title: string;
  coverUrl: string | null;
}) {
  const record = useLiveQuery(
    () => getLibraryEntry(kind, mediaId),
    [kind, mediaId],
  );

  const currentStatus = record?.status;
  const currentOption = LIBRARY_OPTIONS.find((o) => o.value === currentStatus);

  async function setStatus(status: LibraryStatus) {
    await saveLibraryEntry({ kind, mediaId, title, coverUrl, status });
  }

  async function remove() {
    await removeLibraryEntry({ kind, mediaId });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          variant="ghost"
          className="min-h-11 gap-2 rounded-md border border-white/20 px-3.5 text-sm font-semibold text-ink-1 hover:border-white/35 hover:bg-white/[0.05]"
        >
          {currentOption ? (
            <>
              <currentOption.icon className="size-4" aria-hidden="true" />
              {currentOption.label}
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden="true" />
              Add to library
            </>
          )}
          <ChevronDown className="size-3 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {LIBRARY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className="gap-2"
            >
              <Icon className="size-4" aria-hidden="true" />
              {opt.label}
              {currentStatus === opt.value ? (
                <Check className="ml-auto size-3 text-signal" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {currentStatus ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={remove} className="gap-2 text-ink-3">
              <Trash2 className="size-4" aria-hidden="true" />
              Remove from library
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shared "the requested title does not exist" state for every detail view. */
export function DetailNotFound({ kind }: { kind: MediaKind }) {
  return (
    <EmptyState
      icon={kind === "anime" ? Tv : BookOpen}
      title="Title not found"
      description="This entry may have been removed from the metadata provider."
      action={
        <Button variant="outline" className="rounded-md" asChild>
          <Link href={kind === "anime" ? "/anime" : "/manga"}>Back to browse</Link>
        </Button>
      }
    />
  );
}

/** Shared loading skeleton for every detail view. */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-[clamp(220px,36dvh,400px)] w-full rounded-xl" />
      <div className="flex gap-4">
        <Skeleton className="aspect-[2/3] w-24 rounded-lg sm:w-40" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}

export function DetailLayout({
  data,
  kind,
  children,
  continueUnit,
}: {
  data: DetailData;
  kind: MediaKind;
  children?: React.ReactNode;
  continueUnit?: number | null;
}) {
  const media = data?.summary;
  if (!media) return null;
  const title = displayTitle(media.title ?? {});
  const score = formatScore(media.averageScore);
  const coverUrl = media.cover?.url ?? null;
  const bannerUrl = media.banner ?? coverUrl;
  const genres = media.genres ?? [];
  const characters = data.characters ?? [];
  const relations = data.relations ?? [];
  const recommendations = data.recommendations ?? [];

  const facts = [
    seasonLabel(media.season, media.seasonYear),
    media.format && media.format !== "UNKNOWN" ? media.format : null,
    media.status ? media.status.replaceAll("_", " ") : null,
    kind === "anime" && media.episodes
      ? `${media.episodes} ${media.episodes === 1 ? "episode" : "episodes"}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-9">
      <section className="relative">
        <div className="relative h-[clamp(210px,34dvh,380px)] w-full overflow-hidden rounded-lg bg-surface-2">
          {bannerUrl && !bannerUrl.startsWith("file:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              fetchPriority="high"
              referrerPolicy="no-referrer"
              className="size-full object-cover object-[center_28%]"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/45 to-transparent" />
        </div>

        <div className="relative -mt-20 flex flex-col gap-5 px-1 sm:-mt-28 sm:flex-row sm:items-end sm:gap-7">
          <div className="w-24 shrink-0 sm:w-40">
            <div className="aspect-[2/3] overflow-hidden rounded-md bg-surface-2 shadow-2xl shadow-black/70 ring-1 ring-white/10">
              {coverUrl && !coverUrl.startsWith("file:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt={title}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
            <h1 className="text-balance text-[clamp(1.6rem,4.6vw,2.75rem)] font-black leading-[1.03] tracking-[-0.04em] text-ink-1">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.74rem] font-medium text-ink-2">
              {facts.map((fact, i) => (
                <span key={`${fact}-${i}`} className="flex items-center gap-2.5">
                  {i > 0 ? (
                    <span className="text-ink-3/50" aria-hidden="true">
                      /
                    </span>
                  ) : null}
                  <span>{fact}</span>
                </span>
              ))}
              {score ? (
                <span className="flex items-center gap-1">
                  <span className="px-1 text-ink-3/50" aria-hidden="true">
                    /
                  </span>
                  <Star className="size-3 fill-signal text-signal" aria-hidden="true" />
                  <span className="tabular-nums">{score}</span>
                </span>
              ) : null}
              {data.airing ? (
                <span className="flex items-center gap-1.5 text-signal">
                  <span className="px-1 text-ink-3/50" aria-hidden="true">
                    /
                  </span>
                  <Clock className="size-3" aria-hidden="true" />
                  EP {data.airing.episode} ·{" "}
                  {new Date(data.airing.airingAt * 1000).toLocaleString()}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <Button
                size="lg"
                className="min-h-[44px] gap-2 rounded-md bg-signal px-5 font-bold text-white hover:bg-signal-hover"
                asChild
              >
                <Link
                  href={
                    kind === "anime"
                      ? watchHref(media.id, continueUnit ?? 1)
                      : readHref(media.id, continueUnit ?? 1)
                  }
                >
                  {kind === "anime" ? (
                    <Play className="size-4 fill-current" aria-hidden="true" />
                  ) : (
                    <BookOpen className="size-4" aria-hidden="true" />
                  )}
                  {continueUnit
                    ? (kind === "anime" ? `Continue EP ${continueUnit}` : `Continue CH ${continueUnit}`)
                    : (kind === "anime" ? "Watch Episode 1" : "Start Reading")}
                </Link>
              </Button>
              {continueUnit && continueUnit > 1 ? (
                <Button
                  size="lg"
                  variant="ghost"
                  className="min-h-[44px] rounded-md border border-white/20 px-3.5 text-ink-1 hover:border-white/35 hover:bg-white/[0.05]"
                  asChild
                >
                  <Link href={kind === "anime" ? watchHref(media.id, 1) : readHref(media.id, 1)}>
                    {kind === "anime" ? "Episode 1" : "Chapter 1"}
                  </Link>
                </Button>
              ) : null}
              <LibraryButton
                kind={kind}
                mediaId={String(media.id)}
                title={title}
                coverUrl={coverUrl}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 border-t border-white/[0.07] pt-5 sm:grid-cols-[minmax(0,1fr)_15rem] sm:gap-8">
          {media.description ? (
            <p className="max-w-2xl text-[0.85rem] leading-relaxed text-ink-2">
              {media.description}
            </p>
          ) : (
            <span />
          )}

          {genres.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-ink-3">
                Genres
              </span>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-[0.72rem]">
                {genres.map((genre, i) => (
                  <span key={genre} className="flex items-center gap-2">
                    {i > 0 ? (
                      <span className="text-ink-3/50" aria-hidden="true">
                        /
                      </span>
                    ) : null}
                    <Link
                      href={
                        kind === "manga"
                          ? `/manga?genre=${encodeURIComponent(genre)}`
                          : kind === "novel"
                            ? `/novel?genre=${encodeURIComponent(genre)}`
                            : `/anime?genre=${encodeURIComponent(genre)}`
                      }
                      className="text-ink-3 transition-colors hover:text-ink-1"
                    >
                      {genre}
                    </Link>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {children}

      {characters.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="border-b border-white/[0.07] pb-2.5 text-[1.05rem] font-bold tracking-[-0.01em] sm:text-xl">
            Characters
          </h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {characters.map((character) => (
              <div key={character.id} className="w-24 shrink-0 sm:w-28">
                <div className="mb-2 aspect-square overflow-hidden rounded-md bg-surface-2 ring-1 ring-white/[0.06]">
                  {character.image && !character.image.startsWith("file:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={character.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <p className="truncate text-xs font-semibold text-ink-1">{character.name}</p>
                <p className="text-[0.62rem] text-ink-3">{character.role}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {relations.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="border-b border-white/[0.07] pb-2.5 text-[1.05rem] font-bold tracking-[-0.01em] sm:text-xl">
            Related
          </h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {relations.map((relation) => (
              <div key={`${relation.media?.kind ?? "manga"}-${relation.media?.id ?? ""}`} className="w-32 shrink-0">
                {relation.media ? <MediaCard media={relation.media} /> : null}
                <p className="mt-1 truncate text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                  {relation.relationType?.replaceAll("_", " ") ?? ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {recommendations.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="border-b border-white/[0.07] pb-2.5 text-[1.05rem] font-bold tracking-[-0.01em] sm:text-xl">
            Recommended
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {recommendations.map((media) => (
              <MediaCard key={`${media.kind}-${media.id}`} media={media} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

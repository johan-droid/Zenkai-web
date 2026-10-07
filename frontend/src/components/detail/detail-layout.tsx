"use client";

import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Check, ChevronDown, Clock, Eye, Play, Star, Trash2, Tv, XCircle, Plus } from "lucide-react";
import Link from "next/link";

import { MediaCard } from "@/components/cards/media-card";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
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
 * shelves. It imports no API client — the anime view feeds it canonical
 * backend data, the manga view feeds it the legacy payload until P17 — which
 * is what lets the P13 boundary test scan this file for provider imports.
 *
 * The unit section (episodes/chapters) is injected as children between the
 * hero and the lower shelves because its data source differs per kind: the
 * canonical episode catalogue for anime, a chapter count for manga.
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
  kind: "anime" | "manga";
  mediaId: string;
  title: string;
  coverUrl: string | null;
}) {
  const dbKind = kind === "anime" ? "anime" : "manga";
  const record = useLiveQuery(
    () => getLibraryEntry(dbKind, mediaId),
    [dbKind, mediaId],
  );

  const currentStatus = record?.status;
  const currentOption = LIBRARY_OPTIONS.find((o) => o.value === currentStatus);

  async function setStatus(status: LibraryStatus) {
    await saveLibraryEntry({ kind: dbKind, mediaId, title, coverUrl, status });
  }

  async function remove() {
    await removeLibraryEntry({ kind: dbKind, mediaId });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          variant="outline"
          className="glass rounded-xl gap-2"
        >
          {currentOption ? (
            <>
              <currentOption.icon className="size-4" />
              {currentOption.label}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Add to library
            </>
          )}
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-panel w-44">
        {LIBRARY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className="gap-2"
            >
              <Icon className="size-4" />
              {opt.label}
              {currentStatus === opt.value ? (
                <Check className="ml-auto size-3 text-brand-400" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {/* P16: removal semantics. Setting a status is not the same as being
            able to leave the list, and P11 lists removal as a requirement. */}
        {currentStatus ? (
          <>
            <DropdownMenuSeparator className="bg-glass-border" />
            <DropdownMenuItem onClick={remove} className="gap-2 text-muted-foreground">
              <Trash2 className="size-4" />
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
        <Button variant="outline" className="glass rounded-xl" asChild>
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
      <Skeleton className="h-72 w-full rounded-3xl" />
      <div className="flex gap-4">
        <Skeleton className="aspect-[2/3] w-32 rounded-2xl" />
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
}: {
  data: DetailData;
  kind: MediaKind;
  children?: React.ReactNode;
}) {
  const media = data.summary;
  const title = displayTitle(media.title);
  const score = formatScore(media.averageScore);

  return (
    <div className="flex flex-col gap-8">
      <section className="glass-panel relative overflow-hidden rounded-3xl">
        <div className="relative h-56 w-full sm:h-72">
          {media.banner ?? media.cover.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.banner ?? media.cover.url!}
              alt=""
              className="size-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="relative -mt-20 flex flex-col gap-5 p-5 sm:-mt-24 sm:flex-row sm:p-6">
          <div className="w-32 shrink-0 sm:w-44">
            <div className="glass-panel aspect-[2/3] overflow-hidden rounded-2xl">
              {media.cover.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.cover.url} alt={title} className="size-full object-cover" />
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 pt-2">
            <h1 className="text-balance text-2xl font-black tracking-tight sm:text-4xl">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {seasonLabel(media.season, media.seasonYear) ? (
                <Badge variant="secondary" className="rounded-lg">
                  {seasonLabel(media.season, media.seasonYear)}
                </Badge>
              ) : null}
              <Badge variant="secondary" className="rounded-lg">
                {media.format}
              </Badge>
              <Badge variant="secondary" className="rounded-lg">
                {media.status.replaceAll("_", " ")}
              </Badge>
              {score ? (
                <Badge variant="secondary" className="gap-1 rounded-lg">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {score}
                </Badge>
              ) : null}
              {data.airing ? (
                <Badge variant="secondary" className="gap-1 rounded-lg">
                  <Clock className="size-3" />
                  EP {data.airing.episode} ·{" "}
                  {new Date(data.airing.airingAt * 1000).toLocaleString()}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="lg" className="rounded-xl" asChild>
                <Link href={kind === "anime" ? watchHref(media.id, 1) : readHref(media.id, 1)}>
                  {kind === "anime" ? <Play className="fill-current" /> : <BookOpen />}
                  {kind === "anime" ? "Watch episode 1" : "Start reading"}
                </Link>
              </Button>
              <LibraryButton
                kind={kind}
                mediaId={String(media.id)}
                title={title}
                coverUrl={media.cover.url ?? null}
              />
            </div>

            {media.description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {media.description}
              </p>
            ) : null}

            {media.genres.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {media.genres.map((genre) => (
                  <Link
                    key={genre}
                    href={`/anime?genre=${encodeURIComponent(genre)}`}
                    className="rounded-full border border-glass-border bg-white/5 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {children}

      {data.characters.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold tracking-tight">Characters</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {data.characters.map((character) => (
              <div key={character.id} className="glass w-28 shrink-0 rounded-2xl p-2 text-center">
                <div className="mb-2 aspect-square overflow-hidden rounded-xl bg-muted">
                  {character.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={character.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <p className="truncate text-xs font-medium">{character.name}</p>
                <p className="text-[0.65rem] text-muted-foreground">{character.role}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.relations.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold tracking-tight">Related</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {data.relations.map((relation) => (
              <div key={`${relation.media.kind}-${relation.media.id}`} className="w-36 shrink-0">
                <MediaCard media={relation.media} />
                <p className="mt-1 truncate text-center text-[0.7rem] text-muted-foreground">
                  {relation.relationType.replaceAll("_", " ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.recommendations.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold tracking-tight">Recommended</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {data.recommendations.map((media) => (
              <MediaCard key={`${media.kind}-${media.id}`} media={media} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

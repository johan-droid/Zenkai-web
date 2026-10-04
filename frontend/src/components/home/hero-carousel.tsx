"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Play, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { browseMedia } from "@/lib/api/anilist";
import { displayTitle, formatScore, mediaHref, seasonLabel } from "@/lib/media";
import { cn } from "@/lib/utils";

const ROTATE_MS = 7000;

export function HeroCarousel() {
  const { data, isLoading } = useQuery({
    queryKey: ["home", "hero"],
    queryFn: () => browseMedia({ type: "ANIME", perPage: 6, sort: ["TRENDING_DESC"] }),
    staleTime: 5 * 60_000,
  });

  const items = data?.items ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  if (isLoading) return <HeroSkeleton />;
  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)]!;

  return (
    <section className="glass-panel relative overflow-hidden rounded-3xl">
      <div className="relative min-h-[clamp(22rem,52vh,34rem)] w-full">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {active.banner ?? active.cover.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.banner ?? active.cover.url!}
                alt=""
                className="size-full object-cover object-center"
              />
            ) : (
              <div className="size-full bg-gradient-to-br from-brand-700/50 to-background" />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-transparent" />

        <div className="relative flex h-full flex-col justify-end gap-4 p-6 sm:p-10">
          <motion.div
            key={`${active.id}-copy`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex max-w-2xl flex-col gap-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-purple-600/30 text-purple-200 border-purple-500/40 rounded-lg px-2.5 py-1 tracking-wider text-xs font-bold">
                #{(index + 1).toString().padStart(2, "0")} TRENDING
              </Badge>
              {seasonLabel(active.season, active.seasonYear) ? (
                <Badge className="bg-white/10 text-white border-white/15 rounded-lg px-2.5 py-1">
                  {seasonLabel(active.season, active.seasonYear)}
                </Badge>
              ) : null}
              {active.averageScore ? (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1 rounded-lg px-2.5 py-1 font-semibold">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {formatScore(active.averageScore)}
                </Badge>
              ) : null}
            </div>

            <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-white drop-shadow-md sm:text-5xl md:text-6xl">
              {displayTitle(active.title)}
            </h1>

            {active.description ? (
              <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base font-normal">
                {active.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="lg" className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-600/30" asChild>
                <Link href={`/watch/${active.id}/1`}>
                  <Play className="fill-current size-4" />
                  Watch Now
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="glass rounded-xl border-white/20 text-white hover:bg-white/10" asChild>
                <Link href={mediaHref(active)}>
                  <Info className="size-4" />
                  Details
                </Link>
              </Button>
            </div>
          </motion.div>

          <div className="mt-4 flex items-center gap-2">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${displayTitle(item.title)}`}
                aria-current={itemIndex === index}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  itemIndex === index
                    ? "w-8 bg-brand-400"
                    : "w-3 bg-white/25 hover:bg-white/40",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl">
      <Skeleton className="h-[clamp(22rem,52vh,34rem)] w-full rounded-none" />
    </div>
  );
}

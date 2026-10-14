"use client";

import { GenreChips } from "@/components/home/genre-chips";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { MediaRow } from "@/components/home/media-row";
import { ContinueRow } from "@/components/home/continue-row";
import { useHome, useMangaShelf } from "@/hooks/use-home";
import {
  catalogueToShelfState,
  homeSectionToShelfState,
  mangaCatalogueItemToMedia,
} from "@/lib/api/zenkai";

export default function HomePage() {
  const home = useHome(10);
  const manga = useMangaShelf(14);

  const trending = homeSectionToShelfState(home.data?.trending, {
    isLoading: home.isLoading,
    isError: home.isError,
  });

  const mangaItems = manga.data
    ? manga.data.items.map(mangaCatalogueItemToMedia)
    : undefined;

  return (
    <div className="flex flex-col gap-10">
      <div id="hero" className="scroll-mt-28">
        <HeroCarousel
          items={trending.kind === "items" ? trending.items : []}
          isLoading={trending.kind === "loading"}
        />
      </div>

      <div id="continue" className="scroll-mt-28">
        <ContinueRow />
      </div>

      <div id="trending" className="scroll-mt-28">
        <MediaRow title="Trending Now" href="/anime" state={trending} />
      </div>

      <div id="seasonal" className="scroll-mt-28">
        <MediaRow
          title="Popular This Season"
          href="/anime"
          state={homeSectionToShelfState(home.data?.seasonal, {
            isLoading: home.isLoading,
            isError: home.isError,
          })}
        />
      </div>

      <div id="top-rated" className="scroll-mt-28">
        <MediaRow
          title="All-Time Top Rated"
          href="/anime"
          state={homeSectionToShelfState(home.data?.topRated, {
            isLoading: home.isLoading,
            isError: home.isError,
          })}
        />
      </div>

      <div id="genres" className="scroll-mt-28">
        <GenreChips />
      </div>

      <div id="manga" className="scroll-mt-28">
        <MediaRow
          title="Top Manga & Novels"
          href="/manga"
          state={catalogueToShelfState(mangaItems, {
            isLoading: manga.isLoading,
            isError: manga.isError,
          })}
        />
      </div>

      <div id="upcoming" className="scroll-mt-28">
        <MediaRow
          title="Most Anticipated"
          href="/schedule"
          state={homeSectionToShelfState(home.data?.upcoming, {
            isLoading: home.isLoading,
            isError: home.isError,
          })}
        />
      </div>
    </div>
  );
}

"use client";

import { ContinueRow } from "@/components/home/continue-row";
import { GenreChips } from "@/components/home/genre-chips";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { MediaRow } from "@/components/home/media-row";
import { useAnimeMovies, useHome, useMangaShelf } from "@/hooks/use-home";
import {
  catalogueToShelfState,
  discoveryCardToMedia,
  homeSectionToShelfState,
  mangaCatalogueItemToMedia,
} from "@/lib/api/zenkai";

export default function HomePage() {
  const home = useHome(10);
  const manga = useMangaShelf(14);
  const movies = useAnimeMovies(14);

  const homeFlags = {
    isLoading: home.isLoading,
    isError: home.isError,
  };

  const trending = homeSectionToShelfState(home.data?.trending, homeFlags);
  const seasonal = homeSectionToShelfState(home.data?.seasonal, homeFlags);
  const recent = homeSectionToShelfState(home.data?.recent, homeFlags);
  const topRated = homeSectionToShelfState(home.data?.topRated, homeFlags);
  const popular = homeSectionToShelfState(home.data?.popular, homeFlags);
  const upcoming = homeSectionToShelfState(home.data?.upcoming, homeFlags);

  const mangaItems = manga.data
    ? manga.data.items.map(mangaCatalogueItemToMedia)
    : undefined;

  const mangaShelf = catalogueToShelfState(mangaItems, {
    isLoading: manga.isLoading,
    isError: manga.isError,
  });

  const movieItems = movies.data?.items
    ? movies.data.items.map((item) => discoveryCardToMedia(item, "anime"))
    : undefined;

  const movieShelf = catalogueToShelfState(movieItems, {
    isLoading: movies.isLoading,
    isError: movies.isError,
  });

  return (
    <div className="flex flex-col gap-10 sm:gap-14 pb-12">
      {/* 1. Cinematic Hero Carousel */}
      <div id="hero" className="scroll-mt-28">
        <HeroCarousel
          items={trending.kind === "items" ? trending.items : []}
          isLoading={trending.kind === "loading"}
        />
      </div>

      {/* 2. Pick up where you left off (Continue Watching) */}
      <div id="continue" className="scroll-mt-28">
        <ContinueRow />
      </div>

      {/* 3. Trending Now with Rank Numerals (#1 - #10) */}
      <div id="trending" className="scroll-mt-28">
        <MediaRow
          title="Trending Now"
          href="/anime"
          state={trending}
          ranked
        />
      </div>

      {/* 4. Popular This Season */}
      <div id="seasonal" className="scroll-mt-28">
        <MediaRow
          title="Popular This Season"
          href="/anime"
          state={seasonal}
        />
      </div>

      {/* 5. Recently Released & Airing */}
      <div id="recent" className="scroll-mt-28">
        <MediaRow
          title="Recently Released & Airing"
          href="/anime"
          state={recent}
        />
      </div>

      {/* 6. Top Rated Anime */}
      <div id="top-rated" className="scroll-mt-28">
        <MediaRow
          title="All-Time Top Rated"
          href="/anime"
          state={topRated}
        />
      </div>

      {/* 7. Anime Movies */}
      <div id="movies" className="scroll-mt-28">
        <MediaRow
          title="Popular Anime Movies"
          href="/anime?format=MOVIE"
          state={movieShelf}
        />
      </div>

      {/* 8. Browse by Genre Discovery */}
      <div id="genres" className="scroll-mt-28">
        <GenreChips />
      </div>

      {/* 9. Popular All Time */}
      <div id="popular" className="scroll-mt-28">
        <MediaRow
          title="Popular All Time"
          href="/anime"
          state={popular}
        />
      </div>

      {/* 10. Top Manga & Light Novels */}
      <div id="manga" className="scroll-mt-28">
        <MediaRow
          title="Top Manga & Light Novels"
          href="/manga"
          state={mangaShelf}
        />
      </div>

      {/* 11. Most Anticipated Upcoming */}
      <div id="upcoming" className="scroll-mt-28">
        <MediaRow
          title="Most Anticipated"
          href="/schedule"
          state={upcoming}
        />
      </div>
    </div>
  );
}

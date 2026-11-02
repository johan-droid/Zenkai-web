"use client";

import { ContinueRow } from "@/components/home/continue-row";
import { GenreChips } from "@/components/home/genre-chips";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { MediaRow, RankedList } from "@/components/home/media-row";
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
    <div className="relative w-full space-y-9 pb-16 md:space-y-12">
      {/* ── 1. Featured Anime Spotlight Hero ── */}
      <section id="hero" className="scroll-mt-28">
        <HeroCarousel
          items={trending.kind === "items" ? trending.items : []}
          isLoading={trending.kind === "loading"}
        />
      </section>

      {/* ── 2. Continue Watching (Rendered only when local progress exists) ── */}
      <section id="continue" className="scroll-mt-28">
        <ContinueRow />
      </section>

      {/* ── 3. Trending This Week (Ranked #1 - #10) ── */}
      <section id="trending" className="scroll-mt-28">
        <MediaRow
          title="Trending This Week"
          href="/anime?sort=TRENDING_DESC"
          state={trending}
          ranked
          index={1}
        />
      </section>

      {/* ── 4. Popular This Season ── */}
      <section id="seasonal" className="scroll-mt-28">
        <MediaRow
          title="Popular This Season"
          href="/anime?season=current"
          state={seasonal}
          index={2}
        />
      </section>

      {/* ── 5. Currently Airing & New Releases ── */}
      <section id="airing" className="scroll-mt-28">
        <MediaRow
          title="Currently Airing"
          href="/anime?status=RELEASING"
          state={recent}
          index={3}
        />
      </section>

      {/* ── 6. All-Time Top Rated Anime ── */}
      <section id="top-rated" className="scroll-mt-28">
        <RankedList
          title="All-Time Top Rated"
          href="/anime?sort=SCORE_DESC"
          state={topRated}
          index={4}
        />
      </section>

      {/* ── 7. Popular Anime Movies ── */}
      <section id="movies" className="scroll-mt-28">
        <MediaRow
          title="Popular Anime Movies"
          href="/anime?format=MOVIE"
          state={movieShelf}
          index={5}
        />
      </section>

      {/* ── 8. Explore by Genre ── */}
      <section id="genres" className="scroll-mt-28">
        <GenreChips index={6} />
      </section>

      {/* ── 9. Most Anticipated Upcoming ── */}
      <section id="upcoming" className="scroll-mt-28">
        <MediaRow
          title="Most Anticipated"
          href="/schedule"
          state={upcoming}
          index={7}
        />
      </section>

      {/* ── 10. Top Manga & Light Novels ── */}
      <section id="manga" className="scroll-mt-28">
        <MediaRow
          title="Top Manga & Light Novels"
          href="/manga"
          state={mangaShelf}
          index={8}
        />
      </section>
    </div>
  );
}

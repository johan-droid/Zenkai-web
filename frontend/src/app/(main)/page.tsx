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
import { cn } from "@/lib/utils";
import { tokens } from "@/config/tokens";

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
    <section
      className={cn(
        "relative w-full overflow-x-hidden",
        "space-y-10 md:space-y-0"
      )}
    >
      {/* ── 1. Cinematic Featured Anime Hero ── */}
      <section
        id="hero"
        className={cn(
          "relative w-full overflow-hidden rounded-3xl md:rounded-4xl mb-10",
          "border border-white/[0.08] bg-gradient-to-b from-[#{tokens.colors.navy[950]}] to-[#{tokens.colors.navy[900]}]",
          "scroll-mt-28"
        )}
      >
        <HeroCarousel
          items={trending.kind === "items" ? trending.items : []}
          isLoading={trending.kind === "loading"}
        />
        {/* Hero gradient overlay */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-[#101014] via-transparent to-transparent/90 opacity-80 blur-xl md:opacity-60",
            "opacity-0 md:opacity-80 transition-opacity hover:opacity-100"
          )}
        />
      </section>

      {/* ── 2. Continue Watching ── */}
      <section
        id="continue"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <ContinueRow />
      </section>

      {/* ── 3. Trending This Week ── */}
      <section
        id="trending-week"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Trending This Week"
          href="/anime"
          state={trending}
          ranked
        />
      </section>

      {/* ── 4. Currently Airing ── */}
      <section
        id="currently-airing"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Currently Airing"
          href="/anime?airing=true"
          state={recent}
        />
      </section>

      {/* ── 5. Upcoming Anime ── */}
      <section
        id="upcoming"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Upcoming Anime"
          href="/schedule"
          state={upcoming}
        />
      </section>

      {/* ── 6. Popular Anime ── */}
      <section
        id="popular"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Popular Anime"
          href="/anime"
          state={popular}
        />
      </section>

      {/* ── 7. Hidden Gems ── */}
      <section
        id="hidden-gems"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Hidden Gems"
          href="/anime?hidden=true"
          state={popular}
        />
      </section>

      {/* ── 8. Recently Added ── */}
      <section
        id="recently-added"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Recently Added"
          href="/anime?new=true"
          state={recent}
        />
      </section>

      {/* ── 9. Personalized Recommendations ── */}
      <section
        id="recommendations"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Personalized Recommendations"
          href="/anime"
          state={popular}
        />
      </section>

      {/* ── 10. Genre-Based Collections ── */}
      <section
        id="genre-collections"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <GenreChips />
      </section>

      {/* ── 11. Seasonal Anime Collections ── */}
      <section
        id="seasonal"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Seasonal Anime"
          href="/anime?season=true"
          state={seasonal}
        />
      </section>

      {/* ── 12. Recently Updated Episodes ── */}
      <section
        id="updated-episodes"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Recently Updated Episodes"
          href="/anime"
          state={recent}
        />
      </section>

      {/* ── 13. Random Anime Discovery ── */}
      <section
        id="random-discovery"
        className={cn(
          "relative w-full mb-10",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Random Anime Discovery"
          href="/anime/random"
          state={popular}
        />
      </section>

      {/* ── 14. Top Manga & Light Novels ── */}
      <section
        id="manga"
        className={cn(
          "relative w-full",
          "scroll-mt-28"
        )}
      >
        <MediaRow
          title="Top Manga & Light Novels"
          href="/manga"
          state={mangaShelf}
        />
      </section>
    </section>
  );
}

"use client";

import { GenreChips } from "@/components/home/genre-chips";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { MediaRow } from "@/components/home/media-row";
import { ContinueRow } from "@/components/home/continue-row";
import { FeaturesBanner } from "@/components/home/features-banner";
import { CtaBanner } from "@/components/home/cta-banner";
import { useHome, useMangaShelf } from "@/hooks/use-home";
import {
  catalogueToShelfState,
  homeSectionToShelfState,
  mangaCatalogueItemToMedia,
} from "@/lib/api/zenkai";

/**
 * Home (P12).
 *
 * Every populated shelf here comes from the canonical Zenkai API: one
 * `GET /api/v1/home` request feeds hero/trending/seasonal/top/upcoming (the
 * backend composes and degrades the sections server-side), `/api/v1/genres`
 * feeds the chips, and `/api/v1/manga` feeds the manga shelf. The continue
 * rail stays local on purpose — IndexedDB progress has no backend endpoint
 * and none is proposed (P11).
 *
 * Shelf order preserves the existing page composition; the exact Android
 * shelf order is UNKNOWN (P11), so nothing here claims parity with it.
 */
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
    <div className="flex flex-col gap-12">
      {/* Featured Hero Carousel */}
      <div id="hero" className="scroll-mt-28">
        <HeroCarousel
          items={trending.kind === "items" ? trending.items : []}
          isLoading={trending.kind === "loading"}
        />
      </div>

      {/* Continue Watching Section (local progress only) */}
      <div id="continue" className="scroll-mt-28">
        <ContinueRow />
      </div>

      {/* Trending Now Section */}
      <div id="trending" className="scroll-mt-28">
        <MediaRow title="Trending Now" href="/anime" state={trending} />
      </div>

      {/* Popular This Season Section */}
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

      {/* Top Rated Section */}
      <div id="top-rated" className="scroll-mt-28">
        <MediaRow
          title="All-Time Top Rated Anime"
          href="/anime"
          state={homeSectionToShelfState(home.data?.topRated, {
            isLoading: home.isLoading,
            isError: home.isError,
          })}
        />
      </div>

      {/* Genre Chips Section */}
      <div id="genres" className="scroll-mt-28">
        <GenreChips />
      </div>

      {/* Top Manga Section */}
      <div id="manga" className="scroll-mt-28">
        <MediaRow
          title="Top Rated Manga & Novels"
          href="/manga"
          state={catalogueToShelfState(mangaItems, {
            isLoading: manga.isLoading,
            isError: manga.isError,
          })}
        />
      </div>

      {/* Most Anticipated Section (canonical schedule upcoming) */}
      <div id="upcoming" className="scroll-mt-28">
        <MediaRow
          title="Most Anticipated Releases"
          href="/schedule"
          state={homeSectionToShelfState(home.data?.upcoming, {
            isLoading: home.isLoading,
            isError: home.isError,
          })}
        />
      </div>

      {/* Platform Features Highlight Banner */}
      <FeaturesBanner />

      {/* Bottom CTA Banner */}
      <CtaBanner />
    </div>
  );
}

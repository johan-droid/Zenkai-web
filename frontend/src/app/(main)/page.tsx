import { GenreChips } from "@/components/home/genre-chips";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { MediaRow } from "@/components/home/media-row";
import { ContinueRow } from "@/components/home/continue-row";
import { FeaturesBanner } from "@/components/home/features-banner";
import { CtaBanner } from "@/components/home/cta-banner";

const CURRENT_YEAR = new Date().getFullYear();

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      {/* Featured Hero Carousel */}
      <HeroCarousel />

      {/* Continue Watching Section */}
      <div id="continue" className="scroll-mt-28">
        <ContinueRow />
      </div>

      {/* Trending Now Section */}
      <div id="trending" className="scroll-mt-28">
        <MediaRow
          title="Trending Now"
          href="/anime"
          queryKey="trending"
          params={{ type: "ANIME", perPage: 14, sort: ["TRENDING_DESC"] }}
        />
      </div>

      {/* Popular This Season Section */}
      <div id="seasonal" className="scroll-mt-28">
        <MediaRow
          title="Popular This Season"
          href="/anime"
          queryKey="seasonal"
          params={{
            type: "ANIME",
            perPage: 14,
            season: seasonForDate(new Date()),
            seasonYear: CURRENT_YEAR,
            sort: ["POPULARITY_DESC"],
          }}
        />
      </div>

      {/* Top Rated Section */}
      <div id="top-rated" className="scroll-mt-28">
        <MediaRow
          title="All-Time Top Rated Anime"
          href="/anime"
          queryKey="top-rated"
          params={{ type: "ANIME", perPage: 14, sort: ["SCORE_DESC"] }}
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
          queryKey="manga-top"
          params={{ type: "MANGA", perPage: 14, sort: ["SCORE_DESC"] }}
        />
      </div>

      {/* Most Anticipated Section */}
      <div id="upcoming" className="scroll-mt-28">
        <MediaRow
          title="Most Anticipated Releases"
          href="/anime"
          queryKey="upcoming"
          params={{ type: "ANIME", perPage: 14, status: "NOT_YET_RELEASED", sort: ["POPULARITY_DESC"] }}
        />
      </div>

      {/* Platform Features Highlight Banner */}
      <FeaturesBanner />

      {/* Bottom CTA Banner */}
      <CtaBanner />
    </div>
  );
}

function seasonForDate(date: Date): "WINTER" | "SPRING" | "SUMMER" | "FALL" {
  const month = date.getMonth();
  if (month <= 1 || month === 11) return "WINTER";
  if (month <= 4) return "SPRING";
  if (month <= 7) return "SUMMER";
  return "FALL";
}

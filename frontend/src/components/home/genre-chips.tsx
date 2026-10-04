import Link from "next/link";

import { cn } from "@/lib/utils";

const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

export function GenreChips({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Browse by genre</h2>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {GENRES.map((genre) => (
          <Link
            key={genre}
            href={`/anime?genre=${encodeURIComponent(genre)}`}
            className="glass glass-hover shrink-0 rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {genre}
          </Link>
        ))}
      </div>
    </section>
  );
}

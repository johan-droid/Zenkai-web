import type { Source } from "@/lib/sources/types";

/**
 * The source registry.
 *
 * This mirrors what will become a database table. Until the backend exists it is
 * a typed, in-memory list.
 *
 * Every entry here is either a public test asset or a clearly-marked example.
 * Point these at licensed or public-domain providers, or your own library.
 * Unlicensed aggregators are deliberately not included.
 */
export const SOURCES: Source[] = [
  {
    id: "demo-hls-a",
    name: "Demo HLS (test stream)",
    pattern: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    kind: "direct",
    multiAudio: false,
    active: true,
    order: 10,
    note: "Public test stream used to exercise the player. Not real content.",
  },
  {
    id: "demo-hls-b",
    name: "Demo HLS (alt)",
    pattern: "https://test-streams.mux.dev/pts_shift/master.m3u8",
    kind: "direct",
    multiAudio: false,
    active: true,
    order: 20,
    note: "Second public test stream, used to demo source switching and fallback.",
  },
  {
    id: "self-hosted",
    name: "Self-hosted library",
    pattern: "/media/{anilist_id}/{episode}.m3u8",
    kind: "direct",
    multiAudio: true,
    active: false,
    order: 30,
    languages: ["ja", "en"],
    note: "Example: serve your own licensed files from /public/media.",
  },
  {
    id: "archive-embed",
    name: "Internet Archive",
    pattern: "https://archive.org/embed/{archive_id}",
    kind: "embed",
    multiAudio: false,
    active: false,
    order: 40,
    note: "Example: public-domain items. Requires an archive_id per title.",
  },
];

/** Active sources, in the order they should be tried. */
export function getActiveSources(): Source[] {
  return SOURCES.filter((source) => source.active).sort((a, b) => a.order - b.order);
}

export function getSourceById(id: string): Source | undefined {
  return SOURCES.find((source) => source.id === id);
}

/** Toggle a source's active flag. In-memory until the DB table exists. */
export function setSourceActive(id: string, active: boolean): Source[] {
  const source = SOURCES.find((entry) => entry.id === id);
  if (source) source.active = active;
  return getActiveSources();
}

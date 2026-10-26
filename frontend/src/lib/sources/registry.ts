import type { Source } from "@/lib/sources/types";

/**
 * ⚠️ LEGACY / ORPHANED ⚠️
 *
 * This file is pre-P14 browser-side source resolution code that was abandoned
 * when server-side provider resolution was introduced. Zero inbound imports
 * exist across the active frontend UI (all views use
 * `frontend/src/lib/api/zenkai.ts`). Kept for reference; do not add new
 * imports, logic, or registered sources here. Future work: remove or move to
 * a `legacy/` directory after confirming no external consumers.
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

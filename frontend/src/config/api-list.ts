/**
 * The API list.
 *
 * A single source of truth for every external data API the app talks to. The
 * UI (settings, debug panels) and future proxy routes read from here instead of
 * hard-coding endpoints across the codebase.
 *
 * Metadata providers below are all legitimate public APIs. No scraping or
 * unlicensed aggregators are registered, by design.
 */

export type ApiAuth = "none" | "optional" | "required";
export type ApiStatus = "wired" | "planned";

export interface ApiDefinition {
  /** Stable key used by the registry and query keys. */
  id: string;
  name: string;
  /** Base endpoint, no trailing slash. */
  endpoint: string;
  /** GraphQL, REST or a browser-embedded widget. */
  protocol: "graphql" | "rest" | "iframe";
  auth: ApiAuth;
  /** Env var that holds the credential, when one is needed. */
  envKey?: string;
  /** What this API is used for. */
  purpose: string;
  /** Docs URL for contributors. */
  docs: string;
  /** Whether the client module exists yet. */
  status: ApiStatus;
  /** Client module path, when wired. */
  client?: string;
  /** Data domains this API supplies. */
  provides: Array<"anime" | "manga" | "novel" | "video" | "schedule" | "themes" | "images" | "metadata">;
  /** Free-text note about limits or usage rules. */
  notes?: string;
}

export const API_LIST: ApiDefinition[] = [
  {
    id: "anilist",
    name: "AniList GraphQL",
    endpoint: "https://graphql.anilist.co",
    protocol: "graphql",
    auth: "none",
    purpose: "Primary anime/manga metadata, search, browse, relations, characters, airing schedule.",
    docs: "https://docs.anilist.co/",
    status: "wired",
    client: "@/lib/api/anilist",
    provides: ["anime", "manga", "metadata", "schedule"],
    notes: "Rate limited (~90 req/min). Public reads need no auth.",
  },
  {
    id: "mangadex",
    name: "MangaDex",
    endpoint: "https://api.mangadex.org",
    protocol: "rest",
    auth: "optional",
    purpose: "Manga chapters, page images (at-home server), cover art.",
    docs: "https://api.mangadex.org/docs/",
    status: "wired",
    client: "@/lib/api/mangadex",
    provides: ["manga", "images", "metadata"],
    notes: "At-home base URLs expire in ~15 min. Report image loads to api.mangadex.network.",
  },
  {
    id: "jikan",
    name: "Jikan (MyAnimeList)",
    endpoint: "https://api.jikan.moe/v4",
    protocol: "rest",
    auth: "none",
    purpose: "MAL fallback metadata, MAL ids, seasonal and top lists.",
    docs: "https://docs.api.jikan.moe/",
    status: "planned",
    provides: ["anime", "manga", "metadata"],
    notes: "3 req/sec, 60 req/min. Cache aggressively.",
  },
  {
    id: "kitsu",
    name: "Kitsu",
    endpoint: "https://kitsu.io/api/edge",
    protocol: "rest",
    auth: "none",
    purpose: "Backup metadata and id mapping when AniList/MAL are missing an entry.",
    docs: "https://kitsu.docs.apiary.io/",
    status: "planned",
    provides: ["anime", "manga", "metadata"],
  },
  {
    id: "tmdb",
    name: "TMDB",
    endpoint: "https://api.themoviedb.org/3",
    protocol: "rest",
    auth: "required",
    envKey: "TMDB_API_KEY",
    purpose: "Movies and TV metadata, posters, backdrops, trailers.",
    docs: "https://developer.themoviedb.org/docs",
    status: "planned",
    provides: ["video", "images", "metadata"],
  },
  {
    id: "aniskip",
    name: "AniSkip",
    endpoint: "https://api.aniskip.com",
    protocol: "rest",
    auth: "none",
    purpose: "Community skip-intro / skip-outro timestamps keyed by MAL id.",
    docs: "https://github.com/aniskip/aniskip-api",
    status: "planned",
    provides: ["anime", "metadata"],
  },
  {
    id: "animethemes",
    name: "AnimeThemes",
    endpoint: "https://api.animethemes.moe",
    protocol: "rest",
    auth: "none",
    purpose: "Opening and ending video references for anime.",
    docs: "https://animethemes.moe/wiki/API",
    status: "planned",
    provides: ["anime", "video"],
  },
  {
    id: "anime-offline-database",
    name: "Anime Offline Database",
    endpoint: "https://raw.githubusercontent.com/manami-project/anime-offline-database/master",
    protocol: "rest",
    auth: "none",
    purpose: "Offline dataset and cross-provider id mapping (MAL / AniList / Kitsu / AniDB).",
    docs: "https://github.com/manami-project/anime-offline-database",
    status: "planned",
    provides: ["anime", "manga", "metadata"],
    notes: "Large JSON; fetch once and cache locally.",
  },
  {
    id: "jellyfin",
    name: "Jellyfin",
    endpoint: "user-configured",
    protocol: "rest",
    auth: "required",
    envKey: "JELLYFIN_URL",
    purpose: "Optional: play from a user's own self-hosted media library.",
    docs: "https://api.jellyfin.org/",
    status: "planned",
    provides: ["video"],
    notes: "Per-user instance; never a shared default.",
  },
];

export type ApiId = (typeof API_LIST)[number]["id"];

export function getApi(id: string): ApiDefinition | undefined {
  return API_LIST.find((api) => api.id === id);
}

export function wiredApis(): ApiDefinition[] {
  return API_LIST.filter((api) => api.status === "wired");
}

/** APIs whose credentials are missing from the environment. */
export function missingCredentials(env: Record<string, string | undefined> = process.env): string[] {
  return API_LIST.filter((api) => api.auth === "required" && api.envKey && !env[api.envKey]).map(
    (api) => api.envKey!,
  );
}

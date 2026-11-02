# Zenkai Web — API to Frontend Traceability Mapping

This document traces the complete execution chain from user interaction to backend controller and rendered UI state for every active feature in Zenkai.

---

## 1. Feature Traceability Chains

### 1.1 Home Page & Discovery Shelves
- **User Action**: User visits `/` or clicks the Zenkai logo.
- **UI Component**: `frontend/src/app/(main)/page.tsx` (`HomePage`) -> `HeroCarousel`, `MediaRow`, `RankedList`.
- **Frontend Hook/Client**: `useHome(10)` in `hooks/use-home.ts` -> `fetchHome(10)` in `lib/api/zenkai.ts`.
- **HTTP Request**: `GET /api/v1/home?perPage=10`.
- **Backend Route & Controller**: `app.get("/api/v1/home")` in `modules/anime/routes.ts` -> `DiscoveryService.home(perPage)`.
- **Response Transformation**: `homeSectionToShelfState()` transforms raw section into neutral `{ kind: "items", items: Media[] }` or `{ kind: "empty" }` or `{ kind: "unavailable", reason }`.
- **Rendered UI**:
  - `HeroCarousel` displays items from `trending`.
  - `MediaRow` displays horizontal scrollable lists for `seasonal`, `recent`, `upcoming`.
  - `RankedList` displays numbered rows 1-10 for `topRated`.
- **Loading / Error / Empty States**:
  - Loading: Skeleton cards (`MediaCardSkeleton`).
  - Error: Error shelf with retry button.
  - Empty: Clean empty shelf without broken placeholders.

---

### 1.2 Title Search & Typeahead
- **User Action**: User types in global search bar or visits `/search?q=attack`.
- **UI Component**: `SearchView` in `components/search/search-view.tsx`.
- **Frontend Hook/Client**: `useQuery` -> `fetchAnimeSearch(q, limit)` in `lib/api/zenkai.ts`.
- **HTTP Request**: `GET /api/v1/anime/search?q=attack&limit=20`.
- **Backend Route & Controller**: `app.get("/api/v1/anime/search")` in `modules/anime/routes.ts` -> `AnimeService.search(q, limit)`.
- **Response Transformation**: `searchResultSchema` parses items; `discoveryCardToMedia()` maps to `MediaSummary`.
- **Rendered UI**: `MediaGrid` showing matched cards with title, score, year, format, and cover image.
- **Loading / Error / Empty States**:
  - Loading: Spinning loader / skeleton grid.
  - Error: `EmptyState` displaying "Search temporarily unavailable".
  - Empty: `EmptyState` displaying "No anime matching '<query>'".

---

### 1.3 Anime Detail & Episode Discovery
- **User Action**: User clicks an anime card or navigates to `/anime/:id`.
- **UI Component**: `AnimeDetailView` in `components/detail/anime-detail-view.tsx` -> `DetailLayout`.
- **Frontend Hook/Client**:
  - `fetchAnimeDetail(id)` -> `GET /api/v1/anime/:id`.
  - `fetchAnimeEpisodes(id)` -> `GET /api/v1/anime/:id/episodes`.
- **Backend Route & Controller**:
  - `app.get("/api/v1/anime/:id")` in `modules/anime/routes.ts` -> `AnimeService.getFull(id)`.
  - `app.get("/api/v1/anime/:id/episodes")` in `modules/anime/routes.ts` -> `EpisodeService.catalogue(id)`.
- **Response Transformation**:
  - `animeDetailToDetailData()` constructs view model with relations.
  - `recommendations` and `characters` are set to `[]` because the backend contract does not expose them.
- **Rendered UI**: Cover image, banner backdrop, metadata badges, synopsis, action button ("Watch Episode 1" or "Continue EP X"), relations carousel, and 50-episode chunked episode buttons.
- **Loading / Error / Empty States**:
  - Loading: `DetailSkeleton`.
  - Error: `DetailNotFound` for 404, or retryable `EmptyState` for 5xx.

---

### 1.4 Video Playback & Server Switching
- **User Action**: User clicks an episode button or navigates to `/watch/:id/:ep`.
- **UI Component**: `WatchView` in `components/player/watch-view.tsx` -> `VideoPlayer` (HLS) or `EmbedPlayer` (iframe).
- **Frontend Hook/Client**:
  - `fetchEpisodeSources(episodeId, language)` -> `GET /api/v1/episodes/:episodeId/sources`.
  - `fetchEpisodeServers(episodeId, language)` -> `GET /api/v1/episodes/:episodeId/servers`.
  - `executePlayback(episodeId, sourceId, language)` -> `POST /api/v1/playback/execute`.
  - `fetchEpisodeMetadata(episodeId)` -> `GET /api/v1/episodes/:episodeId/metadata`.
- **Backend Route & Controller**:
  - Fastify playback routes in `modules/playback/routes.ts` -> `PlaybackResolver.resolveEpisode()`, `ServerAvailabilityService.getAvailability()`, `playbackGateway.planAll()`.
- **Response Transformation**:
  - `VideoPlayer` mounts Vidstack for direct HLS streams.
  - `EmbedPlayer` mounts sandboxed `<iframe>` for embed plans.
  - Auto-skips intro/outro if configured in `usePlayerStore`.
- **Loading / Error / Empty States**:
  - Loading: Video buffering skeleton and server probing spinner.
  - 503 `all_failed`: Displays "Every playback provider encountered an issue. Try refreshing or selecting another server."
  - 409 `selection_stale`: Automatic single re-resolution attempt.

---

### 1.5 Airing Schedule Horizons
- **User Action**: User visits `/schedule` and toggles Horizon Switcher (Today, Week, Month, Season).
- **UI Component**: `TimelineView` in `components/schedule/timeline-view.tsx`.
- **Frontend Hook/Client**:
  - Today: `GET /api/v1/schedule/today?timeZone=...`
  - Week: `GET /api/v1/schedule/week?timeZone=...`
  - Month: `GET /api/v1/schedule/month?timeZone=...`
  - Season: `GET /api/v1/schedule/season?timeZone=...`
- **Backend Route & Controller**: `registerScheduleRoutes()` in `modules/schedule/routes.ts` -> `ScheduleService`.
- **Rendered UI**: Day-by-day release timeline with air time, episode number, countdown timer, and airing badges.

---

### 1.6 User Library & Cross-Device Synchronization
- **User Action**: User clicks library status dropdown (Watching, Plan, Completed, Dropped) on detail page or visits `/library`.
- **UI Component**: `LibraryPage` (`app/(main)/library/page.tsx`) and `DetailLayout`.
- **Frontend Hook/Client**:
  - Guest: Directly updates local IndexedDB `db.library` table.
  - Authenticated: `useAuth()` calls `putLibraryEntry(kind, mediaId, { status })` -> `PUT /api/v1/user/library/:kind/:mediaId`.
  - Cloud Sync: `syncNow()` calls `POST /api/v1/user/sync` with offline batch.
- **Backend Route & Controller**: `modules/library/routes.ts` and `modules/progress/routes.ts` -> `LibraryService.upsert()` and `LWW` sync.
- **Rendered UI**: Tabs for Watching, Plan to Watch, Completed, Dropped with exact live entry counts.

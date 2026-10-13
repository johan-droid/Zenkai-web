# Zenkai Feature Inventory & Audit Record

**Date:** 2026-10-14  
**Workspace:** `/home/ashutoshsahoo/Downloads/Zenkai Website`  
**Git Commit:** `d1d233b` (`main`)  
**Mission:** `ZENKAI-PRODUCT-RECOVERY-01` & `ZENKAI-P0-IDENTITY-LOCK`

---

## 1. Executive Summary

This inventory documents all user-facing and backend architectural capabilities discovered in the Zenkai repository through static source code analysis, database schema inspection, and test execution.

---

## 2. Route & Component Inventory

| Route / Component | Type | Current State | Backing Contract / Data Source | Assessment & Notes |
|---|---|---|---|---|
| `/(main)/` (`page.tsx`) | Page | **Verified** | `GET /api/v1/anime/home`, Dexie progress | Renders HeroCarousel, Continue Watching, FeaturesBanner, GenreChips, MediaRows (trending, popular, seasonal, topRated, updated). Degrades gracefully when sections fail. |
| `/(main)/anime` (`page.tsx`) | Page | **Verified** | `GET /api/v1/anime/browse` or `/discovery/trending` | Filterable by genre, format, status, sort. Paginated with MediaGrid. |
| `/(main)/anime/[id]` (`page.tsx`) | Page | **Partially Verified / Needs Fix** | `GET /api/v1/anime/:id`, `GET /api/v1/anime/:id/episodes` | Displays canonical title, artwork, rating, synopsis, airing countdown, and episode grid (up to 60). Bug: Degraded mode synthetic episodes fabricate 12 episodes regardless of anime format (e.g., movies). |
| `/(main)/watch/[id]/[ep]` (`page.tsx`) | Page | **P0 Defect Identified** | `GET /api/v1/episodes/:id/sources`, `POST /api/v1/playback/execute` | Renders Vidstack VideoPlayer / EmbedPlayer, server switcher, audio toggle, episode list, skip buttons. P0 defects: 1) Provider candidate fuzzy search conflates sequels/spinoffs. 2) Fallback selects `candidates[0]`. 3) Late async responses overwrite active selection without checking epoch/token. |
| `/(main)/manga` (`page.tsx`) | Page | **Verified** | `GET /api/v1/manga` (MangaDex catalog) | Filterable by genre, status, sort. Fully wired to backend. |
| `/(main)/manga/[id]` (`page.tsx`) | Page | **Partially Implemented / Defective** | `GET /api/v1/manga/by-anilist/:id` | Renders detail layout, but chapters are synthetically generated `1..shownUnits` from `totalChapters` instead of querying `GET /api/v1/manga/:id/chapters`. |
| `/(main)/read/[id]/[chapter]` (`page.tsx`) | Page | **Partially Implemented** | `GET /api/v1/manga/by-anilist/:id`, `GET /api/v1/manga/:id/chapters`, `GET /api/v1/manga/chapters/:id/pages` | Full reader component exists (vertical, paged, double, rtl, progress saving). Defect: If ID is not yet bridged from AniList to MangaDex UUID, chapter lookup fails. |
| `/(main)/novel` | Page | **Missing** | None | No novel catalog or browse route exists in frontend. |
| `/(main)/read-novel/[id]/[chapter]` | Page | **Missing** | None | No text novel reader route exists in frontend. |
| `/(main)/library` (`page.tsx`) | Page | **Verified** | IndexedDB (Dexie `library` table) | Local-first watchlist supporting 4 statuses (Watching, Plan, Completed, Dropped). Includes removal semantics, import/export validation with Zod `.strict()`. |
| `/(main)/history` (`page.tsx`) | Page | **Verified** | IndexedDB (Dexie `progress` table) | Lists recently watched anime and read manga with progress bars, timestamps, and clear history action. |
| `/(main)/schedule` (`page.tsx`) | Page | **Verified** | `GET /api/v1/schedule/week` | Shows 7-day schedule grouped by weekday in configured timezone. |
| `/(main)/search` (`page.tsx`) | Page | **Verified (Anime)** | `GET /api/v1/anime/search` | Debounced canonical search with status states (`idle`, `loading`, `empty`, `items`, `error`). Missing: Manga & Novel search tabs. |
| `/(main)/settings` (`page.tsx`) | Page | **Verified** | LocalStorage, IndexedDB import/export | Audio preference (sub/dub/multi), autoplay next, auto-skip intro, theme selector, export/import data. |
| Command Palette (`⌘K`) | Component | **Verified** | `GET /api/v1/anime/search` | Global quick-search dialog with trending shortcuts. |

---

## 3. Backend API Inventory

| Path | Method | Module | Status | Security / Caching / Invariants |
|---|---|---|---|---|
| `/api/v1/anime/home` | GET | `anime/discovery` | Verified | Composed home payload (trending, popular, seasonal, topRated, updated). Section-isolated failure. |
| `/api/v1/anime/browse` | GET | `anime/discovery` | Verified | Canonical browse by genre, format, status, sort. Clamped pagination. |
| `/api/v1/anime/search` | GET | `anime/service` | Verified | Title search. DB catalog first, AniList fallback. Normalizes to DiscoveryCard. |
| `/api/v1/anime/:id` | GET | `anime/service` | Verified | Canonical detail by AniList ID. Circuit breaker fallback on DB offline. |
| `/api/v1/anime/:id/episodes` | GET | `anime/episodes` | Needs Hardening | Episode catalogue. Degraded mode fabricates 12 episodes regardless of media format. |
| `/api/v1/anime/:id/episodes/:num/navigation` | GET | `anime/episodes` | Verified | Honours gaps; computes previous/next strictly by episode number order. |
| `/api/v1/episodes/:id/sources` | GET | `playback/service` | **P0 Defect** | Resolves playback sources and plans. Defects in provider matching and candidate validation. |
| `/api/v1/playback/execute` | POST | `playback/execution` | **P0 Defect** | Re-resolves and validates execution target. Must ensure episode identity is returned and verified. |
| `/api/v1/episodes/:id/metadata` | GET | `playback/metadata` | Verified | Returns skip markers (intro/outro) and subtitles. |
| `/api/v1/manga` | GET | `manga/routes` | Verified | Manga catalogue listing from PostgreSQL / MangaDex fallback. |
| `/api/v1/manga/search` | GET | `manga/routes` | Verified | Manga title search. |
| `/api/v1/manga/:id` | GET | `manga/routes` | Verified | Manga detail by MangaDex ID. |
| `/api/v1/manga/:id/chapters` | GET | `manga/routes` | Needs Bridge | Chapter feed. Throws if ID is AniList numeric ID rather than MangaDex UUID. |
| `/api/v1/manga/chapters/:id/pages` | GET | `manga/routes` | Verified | Short-lived signed page URLs from MangaDex@Home. Cache-Control: `no-store`. |
| `/api/v1/manga/by-anilist/:id` | GET | `manga/routes` | Verified | Bridges AniList ID to MangaDex catalog. |
| `/api/v1/novel/*` | ALL | `novel` | **Missing** | `src/providers/novel/index.ts` is an empty placeholder. Needs routes and provider service. |
| `/api/v1/schedule/week` | GET | `schedule/routes` | Verified | Airing schedule for 7-day window. |

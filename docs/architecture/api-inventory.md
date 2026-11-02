# Zenkai Web — Complete API Inventory

This document represents the complete, verified inventory of all 80 exposed API endpoints in the Zenkai backend. Every endpoint has been verified against backend source implementations (`backend/src/app.ts` and `backend/src/modules/**/routes.ts`).

---

## 1. System & Observability Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| S1 | `GET` | `/health` | Public | System liveness and database readiness probe with catalogue metrics | VERIFIED_FROM_BOTH |
| S2 | `GET` | `/api/v1/health` | Public | Lightweight public liveness endpoint without internal metrics | VERIFIED_FROM_BOTH |
| S3 | `GET` | `/api/v1/providers/health` | Public | Observability health snapshot of streaming providers & gateway counters | VERIFIED_FROM_BOTH |
| S4 | `POST` | `/api/v1/providers/reset` | Protected | Reset quarantined providers after transient upstream recovery | VERIFIED_FROM_BOTH |
| S5 | `GET` | `/api/v1/proxy` | Public | SSRF-guarded media and image proxy for referer-gated CDN assets | VERIFIED_FROM_BOTH |
| S6 | `GET` | `/api/v1/providers` | Public | Availability list for all registered manga and novel providers | VERIFIED_FROM_BOTH |
| S7 | `GET` | `/api/v1/providers/manga` | Public | Availability list for manga providers | VERIFIED_FROM_BOTH |
| S8 | `GET` | `/api/v1/providers/novel` | Public | Availability list for novel providers | VERIFIED_FROM_BOTH |

---

## 2. Authentication & Identity Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| U1 | `POST` | `/api/v1/auth/register` | Public (Rate-limited) | Create new user account and issue HttpOnly session cookie | VERIFIED_FROM_BOTH |
| U2 | `POST` | `/api/v1/auth/login` | Public (Rate-limited) | Authenticate credentials and issue HttpOnly session cookie | VERIFIED_FROM_BOTH |
| U3 | `POST` | `/api/v1/auth/logout` | Public | Invalidate current session token and clear session cookie | VERIFIED_FROM_BOTH |
| U4 | `GET` | `/api/v1/auth/me` | Protected | Return currently authenticated user profile and session metadata | VERIFIED_FROM_BOTH |
| U5 | `GET` | `/api/v1/users/check-username` | Public (Rate-limited) | Real-time check of username availability with suggestions | VERIFIED_FROM_BOTH |
| U6 | `GET` | `/api/v1/auth/check-username` | Public (Rate-limited) | Alias route for username availability check | VERIFIED_FROM_BOTH |
| U7 | `PATCH` | `/api/v1/users/profile` | Protected | Update displayName, bio, and avatarUrl for authenticated user | VERIFIED_FROM_BOTH |
| U8 | `PATCH` | `/api/v1/auth/profile` | Protected | Alias route for updating profile | VERIFIED_FROM_BOTH |
| U9 | `GET` | `/api/v1/users/:username` | Public | Public user profile information by username | VERIFIED_FROM_BOTH |

---

## 3. User Library & Watch Progress Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| L1 | `GET` | `/api/v1/user/library` | Protected | Get user library items with status breakdown counts | VERIFIED_FROM_BOTH |
| L2 | `PUT` | `/api/v1/user/library/:kind/:mediaId` | Protected | Upsert status/rating/notes for a library title | VERIFIED_FROM_BOTH |
| L3 | `DELETE` | `/api/v1/user/library/:kind/:mediaId` | Protected | Delete a title from the user's remote library | VERIFIED_FROM_BOTH |
| L4 | `POST` | `/api/v1/user/library/batch` | Protected | Batch merge offline library records with LWW conflict handling | VERIFIED_FROM_BOTH |
| P1 | `GET` | `/api/v1/user/progress` | Protected | Get progress rows by mediaId or recent items | VERIFIED_FROM_BOTH |
| P2 | `GET` | `/api/v1/user/continue` | Protected | Get continue watching/reading rail computed for authenticated user | VERIFIED_FROM_BOTH |
| P3 | `PUT` | `/api/v1/user/progress/:kind/:mediaId/:unit` | Protected | Save playback or reading progress for a unit | VERIFIED_FROM_BOTH |
| P4 | `DELETE` | `/api/v1/user/progress/:kind/:mediaId` | Protected | Clear watch progress for a single media title | VERIFIED_FROM_BOTH |
| P5 | `DELETE` | `/api/v1/user/progress` | Protected | Clear all watch history for the user | VERIFIED_FROM_BOTH |
| P6 | `POST` | `/api/v1/user/sync` | Protected | Full bi-directional sync of library & progress with LWW | VERIFIED_FROM_BOTH |

---

## 4. Anime Discovery, Catalogue & Detail Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| A1 | `GET` | `/api/v1/home` | Public | Aggregated home shelf (trending, popular, seasonal, top, upcoming, recent) | VERIFIED_FROM_BOTH |
| A2 | `GET` | `/api/v1/genres` | Public | List of all anime genres present in the catalogue | VERIFIED_FROM_BOTH |
| A3 | `GET` | `/api/v1/anime` | Public | Paginated catalogue listing with genre, status, format, season filters | VERIFIED_FROM_BOTH |
| A4 | `GET` | `/api/v1/anime/search` | Public | Title search against Postgres catalogue with provider fallback | VERIFIED_FROM_BOTH |
| A5 | `GET` | `/api/v1/anime/trending` | Public | Trending anime discovery bucket | VERIFIED_FROM_BOTH |
| A6 | `GET` | `/api/v1/anime/popular` | Public | All-time popular anime discovery bucket | VERIFIED_FROM_BOTH |
| A7 | `GET` | `/api/v1/anime/seasonal` | Public | Seasonal anime discovery bucket with optional year and season | VERIFIED_FROM_BOTH |
| A8 | `GET` | `/api/v1/anime/top` | Public | Top rated anime discovery bucket | VERIFIED_FROM_BOTH |
| A9 | `GET` | `/api/v1/anime/topRated` | Public | Alias route for top rated anime discovery bucket | VERIFIED_FROM_BOTH |
| A10 | `GET` | `/api/v1/anime/recent` | Public | Recently added anime titles in the catalogue | VERIFIED_FROM_BOTH |
| A11 | `GET` | `/api/v1/anime/recently-updated`| Public | Recently updated upstream anime titles | VERIFIED_FROM_BOTH |
| A12 | `GET` | `/api/v1/anime/discovery/:bucket` | Public | Generic bucket route for trending, popular, seasonal, topRated | VERIFIED_FROM_BOTH |
| A13 | `GET` | `/api/v1/anime/:id` | Public | Full anime metadata detail and relations | VERIFIED_FROM_BOTH |
| A14 | `GET` | `/api/v1/anime/:id/relations` | Public | Media relations for an anime title | VERIFIED_FROM_BOTH |
| A15 | `GET` | `/api/v1/anime/:id/episodes` | Public | Episode catalogue for an anime title | VERIFIED_FROM_BOTH |
| A16 | `GET` | `/api/v1/anime/:id/episodes/:number` | Public | Single episode details by anime ID and episode number | VERIFIED_FROM_BOTH |
| A17 | `GET` | `/api/v1/anime/:id/episodes-next` | Public | Next episode to air derived from canonical schedule | VERIFIED_FROM_BOTH |
| A18 | `GET` | `/api/v1/anime/:id/episodes/:number/navigation` | Public | Prev/next episode numbers honouring gaps in release | VERIFIED_FROM_BOTH |
| A19 | `GET` | `/api/v1/episodes/:id` | Public | Single episode metadata by local database UUID | VERIFIED_FROM_BOTH |

---

## 5. Playback & Streaming Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| PL1 | `GET` | `/api/v1/episodes/:episodeId/sources` | Public | Ranked streaming sources and playback execution plans | VERIFIED_FROM_BOTH |
| PL2 | `GET` | `/api/v1/episodes/:episodeId/servers` | Public | Dynamic server health, availability, and playability categories | VERIFIED_FROM_BOTH |
| PL3 | `POST` | `/api/v1/playback/execute` | Public | Re-resolve and construct fresh execution target for a selected source plan | VERIFIED_FROM_BOTH |
| PL4 | `GET` | `/api/v1/episodes/:episodeId/metadata` | Public | Episode subtitles and skip markers (intro/outro/recap/preview) | VERIFIED_FROM_BOTH |
| PL5 | `POST` | `/api/v1/episodes/:episodeId/skip-timing` | Public | Submit community intro/outro skip timings | VERIFIED_FROM_SOURCE |
| PL6 | `POST` | `/api/v1/skip-timing/:timingId/report` | Public | Report incorrect community skip timing | VERIFIED_FROM_SOURCE |
| PL7 | `GET` | `/api/v1/playback/providers` | Public | Provider health snapshot and gateway delivery metrics | VERIFIED_FROM_BOTH |
| PL8 | `POST` | `/api/v1/playback/providers/check` | Public | Force a synchronous re-probe of all stream providers | VERIFIED_FROM_SOURCE |
| PL9 | `GET` | `/api/v1/playback/manifest` | Public | Relay HLS master/variant playlists and rewrite child segments | VERIFIED_FROM_BOTH |
| PL10 | `GET` | `/api/v1/playback/subtitle` | Public | CORS-bypassing subtitle relay for sidecar tracks | VERIFIED_FROM_BOTH |

---

## 6. Manga Catalogue & Reader Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| M1 | `GET` | `/api/v1/manga` | Public | Paginated manga catalogue with genre, status, adult filters | VERIFIED_FROM_BOTH |
| M2 | `GET` | `/api/v1/manga/catalogue` | Public | Alias route for manga catalogue | VERIFIED_FROM_BOTH |
| M3 | `GET` | `/api/v1/manga/search` | Public | Manga title search | VERIFIED_FROM_BOTH |
| M4 | `GET` | `/api/v1/manga/:id` | Public | Full manga metadata detail and relations by MangaDex ID | VERIFIED_FROM_BOTH |
| M5 | `GET` | `/api/v1/manga/:id/relations` | Public | Relations for a manga title | VERIFIED_FROM_BOTH |
| M6 | `GET` | `/api/v1/manga/:id/chapters` | Public | Chapter feed for a manga title (supports language query) | VERIFIED_FROM_BOTH |
| M7 | `GET` | `/api/v1/manga/:id/latest` | Public | Latest released chapter shortcut | VERIFIED_FROM_BOTH |
| M8 | `GET` | `/api/v1/manga/chapters/:chapterId` | Public | Single chapter metadata by local chapter UUID | VERIFIED_FROM_BOTH |
| M9 | `GET` | `/api/v1/manga/chapters/:chapterId/pages` | Public | Ordered, signed page image URLs for reader (`Cache-Control: no-store`) | VERIFIED_FROM_BOTH |
| M10 | `GET` | `/api/v1/manga/by-anilist/:anilistId` | Public | Cross-reference resolver bridging AniList ID to MangaDex row | VERIFIED_FROM_BOTH |
| M11 | `GET` | `/api/v1/manga/genres` | Public | List of manga genres present in catalogue | VERIFIED_FROM_BOTH |

---

## 7. Novel Catalogue & Reader Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| N1 | `GET` | `/api/v1/novel` | Public | Paginated light novel catalogue with search, genre, sort, source | VERIFIED_FROM_BOTH |
| N2 | `GET` | `/api/v1/novel/catalogue` | Public | Alias route for novel catalogue | VERIFIED_FROM_BOTH |
| N3 | `GET` | `/api/v1/novel/search` | Public | Novel title search across sources | VERIFIED_FROM_BOTH |
| N4 | `GET` | `/api/v1/novel/:id` | Public | Light novel details by ID or slug | VERIFIED_FROM_BOTH |
| N5 | `GET` | `/api/v1/novel/:id/chapters` | Public | Chapter list for a light novel | VERIFIED_FROM_BOTH |
| N6 | `GET` | `/api/v1/novel/:id/chapters/:chapter` | Public | Sanitized chapter reading content (paragraphs) | VERIFIED_FROM_BOTH |

---

## 8. Schedule Endpoints

| # | Method | Route | Auth | Purpose | Verification Status |
|---|---|---|---|---|---|
| SC1 | `GET` | `/api/v1/schedule` | Public | Airing schedule entries across a specified date window | VERIFIED_FROM_BOTH |
| SC2 | `GET` | `/api/v1/schedule/today` | Public | Airing schedule for current day in target timezone | VERIFIED_FROM_BOTH |
| SC3 | `GET` | `/api/v1/schedule/week` | Public | Airing schedule for current week (Mon-Sun) in target timezone | VERIFIED_FROM_BOTH |
| SC4 | `GET` | `/api/v1/schedule/month` | Public | Airing schedule for current calendar month | VERIFIED_FROM_BOTH |
| SC5 | `GET` | `/api/v1/schedule/season` | Public | Airing schedule for current 3-month season | VERIFIED_FROM_BOTH |
| SC6 | `GET` | `/api/v1/schedule/next` | Public | Next upcoming episode release across all tracked anime | VERIFIED_FROM_BOTH |
| SC7 | `GET` | `/api/v1/schedule/upcoming` | Public | Paginated upcoming episodes ordered soonest first | VERIFIED_FROM_BOTH |
| SC8 | `GET` | `/api/v1/schedule/recent` | Public | Recently aired episodes within specified days | VERIFIED_FROM_BOTH |
| SC9 | `GET` | `/api/v1/anime/:id/schedule` | Public | Airing schedule history & upcoming slots for a single anime title | VERIFIED_FROM_BOTH |
| SC10| `POST`| `/api/v1/schedule/sync/:id` | Public | Force a synchronization with AniList for a title | VERIFIED_FROM_SOURCE |

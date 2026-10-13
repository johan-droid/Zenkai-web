# Zenkai Current Architecture & System Map

**Date:** 2026-10-14  
**Workspace:** `/home/ashutoshsahoo/Downloads/Zenkai Website`  
**Mission:** `ZENKAI-PRODUCT-RECOVERY-01` & `ZENKAI-P0-IDENTITY-LOCK`

---

## 1. System Topology

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│  Next.js 16 (App Router) + React 19 + Vidstack / HLS.js     │
│  TanStack Query v5 + Zustand + Dexie IndexedDB (Local-First)│
└──────────────┬──────────────────────────────▲───────────────┘
               │ HTTP / JSON                  │ Ephemeral HLS Streams
               │ (Zenkai API only)            │ / Signed Manga Pages
┌──────────────▼──────────────────────────────┴───────────────┐
│                    Zenkai Backend (Fastify)                 │
│  Fastify 5 + Drizzle ORM + Zod v3 + in-memory LRU / Redis    │
│  - Anime Discovery & Episode Catalog                        │
│  - Streaming Provider Gateway & Health Registry             │
│  - Manga Catalogue & MangaDex Adapter                       │
│  - Playback Execution & Manifest Relay                      │
└──────────────┬──────────────────────────────▲───────────────┘
               │ Upstream                     │ Upstream
               │ Queries                      │ Responses
┌──────────────▼──────────────────────────────┴───────────────┐
│                    External Free Providers                  │
│  - AniList GraphQL API (Metadata, Schedule, Relations)      │
│  - MangaDex REST API (Manga, Chapters, Page Images)         │
│  - Consumet / In-Process Scrapers (Anime Streaming Sources) │
│  - Demo Mux HLS Test Streams (Testing & Validation)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Identity Flow & Invariants

### 2.1 The Canonical Anime Identity Chain

```
Catalog Card (media.id = AniList ID: "16498")
  │
  ▼
Anime Detail Route (/anime/16498)
  │
  ├─▶ GET /api/v1/anime/16498 (AnimeDetail)
  │     └─▶ Returns canonical title, genres, relations, format, totalEpisodes
  │
  └─▶ GET /api/v1/anime/16498/episodes (EpisodeCatalogue)
        └─▶ Returns episode array with canonical episode.id ("ep-16498-1" or UUID)
              and episodeNumber: 1
  │
  ▼
Watch Route (/watch/16498/1)
  │
  ├─▶ Finds episodeCard by episodeNumber: 1
  │     └─▶ episodeCard.id = canonical episode ID
  │
  ├─▶ Airing Gate: if airingState === "upcoming" -> STOP (unreleased UI)
  │
  ├─▶ GET /api/v1/episodes/:episodeId/sources?language=sub
  │     └─▶ Resolves external IDs (AniList ID, MAL ID, provider episode IDs)
  │     └─▶ Queries registered providers (InProcess, Consumet, Template)
  │     └─▶ Probes and ranks candidates
  │     └─▶ Returns PlaybackSource[] and PlaybackPlan[]
  │
  └─▶ POST /api/v1/playback/execute { episodeId, sourceId, language }
        └─▶ Re-resolves exact plan and verifies identity
        └─▶ Returns PlaybackExecution (HLS / progressive / embed)
  │
  ▼
Video Player (Vidstack / HLS.js)
  └─▶ Mounts <MediaPlayer> with validated execution target
```

### 2.2 Local-First Storage Architecture

Watchlist and reading/viewing history are deliberately implemented as **local-first** using Dexie IndexedDB:
- `db.library`: Saves `{ id: "${kind}:${mediaId}", kind, mediaId, title, coverUrl, status, updatedAt }`.
- `db.progress`: Saves `{ id: "${kind}:${mediaId}:${unit}", kind, mediaId, title, coverUrl, unit, positionSeconds, durationSeconds, page, totalUnits, completed, updatedAt }`.

This provides fast response times, zero server-side storage costs, zero authentication/cookie tracking overhead, and complete user privacy.

---

## 3. Free-Tier Infrastructure Constraints

1. **No External Paid Infrastructure:** No AWS S3, Redis Cloud, paid Supabase, or paid proxies.
2. **Local Memory Caching:** The caching layer uses an in-memory LRU (`cache/index.ts`) with optional Redis fallback.
3. **Bounded Timeouts:** Provider calls must enforce strict deadlines (max 2500–3000ms) to prevent slow upstream requests from blocking worker threads.
4. **No Unbounded Crawling:** Requests are triggered strictly on-demand by user browsing, with client-side and server-side TTL caching.

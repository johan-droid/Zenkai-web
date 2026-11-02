# Zenkai Request Lifecycle

## Overview
This document traces the complete request flow from user interaction through to rendered UI, defining the authorized path for all major features.

## 1. Standard Request Flow

### 1.1 User Initiation
```
USER INTERACTION
  ├── Clicks navigation item
  ├── Submits search form
  ├── Clicks favorite heart
  ├── Opens episode detail
  └── Clicks playback play button
```

### 1.2 Frontend Preparation
```
FRONTEND COMPONENT
  ├── Display pending state (skeleton, spinner, disabled button)
  ├── Gather required parameters (id, episodeNumber, query)
  ├── Construct API call via api layer
  ├── Show loading UI
  └── Disable interactive elements (prevent double-submit)
```

### 1.3 API Call Construction
```
CLIENT-SIDE API LAYER
  ├── api.fetchAnimeDetail(id)
  │   → GET /api/v1/anime/${encodeURIComponent(id)}
  │   └── Validate with animeDetailSchema
  │
  ├── api.fetchAnimeEpisodes(id, options)
  │   → GET /api/v1/episodes/catalogue/${anilistId}
  │   └── Validate with EpisodeCatalogue schema
  │
  ├── api.search(term, filters)
  │   → GET /api/v1/anime/list?q=${term}&genre=&format=&status=&sort=&page=
  │   └── Validate with query schema (parseOrThrow)
  │
  └── api.toggleWatchlist(entry) 
      → POST /api/v1/user/library (auth required)
      └── Validate with libraryRecordSchema .strict()
```

### 1.3 Authentication & Authorization
```
AUTHENTICATION CHECK
  ├── If route requires auth (library, user routes):
  │   ├── Check request.user existence
  │   │   └─ If missing → 401 Unauthorized
  │   └─ If present → Proceed to authorization
  └─ If route is public (anime list, anime detail, search):
  │   └─ Proceed without auth (core product features)
```

### 1.3 Request Validation
```
REQUEST VALIDATION
  ├── Zod schema parseOrThrow(request.query)
  │   └─ If invalid → 400 Bad Request { error: "bad_request", reason }
  └─ If valid → Proceed to business logic
```

### 1.4 Business Logic & Data Access
```
BUSINESS/SERVICE LAYER
  ├── Cache check (TTL: discovery, metadata)
  │   └─ If cache hit → Return cached result
  │   └─ If cache miss → Proceed to provider
  │
  ├── External Provider Calls
  │   ├── AniList GraphQL API (primary metadata)
  │   ├── MangaDex REST API (manga chapters, images)
  │   └── Consumet / In-Process Scrapers (anime streaming)
  │
  ├── Repository Operations
  │   ├── db.animales.upsert(localId, detail)
  │   ├── db.progress.bulkPut(progressRecords)
  │   ├── db.library.bulkPut(libraryEntries)
  │   └── db.animeRepository.getLocalIdByAnilistId(anilistId)
  │
  └── Data Consistency
      ├── Cross-reference ID verification (AniList ID ↔ local ID)
      ├── TTL enforcement (discovery TTL, metadata TTL)
      ├── Cache invalidation on successful write
      └── Fallback to cached data on provider failure
```

### 1.5 Server Response
```
SERVER RESPONSE
  ├── Controlled JSON response (never raw data)
  ├── Appropriate HTTP status codes
  │   └─ 200 OK (success)
  │   └─ 400 Bad Request (validation failure)
  │   └─ 401 Unauthorized (missing auth)
  │   └─ 404 Not Found (resource not found)
  │   └─ 503 Service Unavailable (provider down)
  └── Controlled fields only (never raw upstream data)
      ├── status: "ok" | "unavailable"
      ├── reason?: string (absent when status is "ok")
      ├── items: [...] (DiscoveryCard[] or EpisodeCard[])
      ├── page, perPage, hasNextPage, total (pagination)
      └── source: "provider" | "cache" | "database"
```

## 2. Feature-Specific Request Flows

### 2.1 Anime Detail Request

```
1. USER: Clicks anime card → Navigates to /anime/[id]
2. FE: useAnimeDetail(id) → fetchAnimeDetail(id)
3. BE: GET /api/v1/anime/${encodeURIComponent(id)}
4. BE: Zod validation (animeDetailSchema)
5. BE: Cache check (anime:full:${anilistId}, TTL: metadata TTL)
6. BE: If cache miss → AniList GraphQL API call
7. BE: If cache hit → Return cached AnimeDetail
8. BE: Return { data, status, reason? }
9. FE: Transform with mediaHref(), displayTitle(), formatScore()
10. FE: Render anime detail page
10. FE: Episode grid from fetchAnimeEpisodes(id)
11. FE: Watch progress from useContinueWatching("anime")
```

**Error Handling**:
- 404 → `DetailNotFound` component
- Provider failure → `EmptyState` with "Could not load this title"
- Schema validation failure → 400 error with user-friendly message

### 2.2 Episode Catalogue Request

```
1. USER: Clicks "Watch Episode 1" or navigates to episode page
2. FE: useEpisodeCatalogue(anilistId) → fetchAnimeEpisodes(id)
3. BE: GET /api/v1/episodes/catalogue/${anilistId}
4. BE: Zod validation (EpisodeCatalogue schema)
5. BE: Cache check (anime:episodes:${anilistId}, TTL: discovery TTL)
6. BE: If cache miss → Provider sync (AniList + Consumet)
7. BE: If cache hit → Return cached EpisodeCatalogue
8. BE: Episode catalogue with: episodes[], catalogueCount, airedCount, knownTotal
9. FE: Transform episodes.map(toCard)
10. FE: Render episode grid with watched indicators
11. FE: Watch progress from useContinueWatching("anime")
```

**Episode Number Integrity**:
- **Never** silently substitute episode 1 for missing/unnumbered IDs
- **Always** return episodeNumber from API response
- **Always** reject ambiguous IDs with 400/404 instead of guessing

### 2.3 Favorites Request

```
1. USER: Clicks heart button on anime card
2. FE: showPendingState() (heart animates to "loading")
3. FE: useWatchlistEntry(entry) → toggleWatchlist()
4. BE: POST /api/v1/user/library (auth required)
5. BE: request.user existence check
6. BE: If !request.user → 401 Unauthorized
7. BE: Library service: upsert entry (Zod .strict() validation)
8. BE: If valid → { success: true }
9. BE: If invalid → LibraryContractError → 400
10. FE: Update heart state (filled/outline)
11. FE: revalidateLibrary() → refresh dependent UI
11. FE: Show toast "Added to Watchlist" or "Removed from Watchlist"
```

**Error Handling**:
- 401 → Show "Authentication required" toast, redirect to login if needed
- 400 → Show "Could not save to watchlist" toast
- Network error → Show "Network error, please retry" toast

### 2.4 Search Request

```
1. USER: Types in search input (debounced 350ms)
2. FE: useSearch(term) → fetchAnimeSearch(trimmed, 30)
3. BE: GET /api/v1/anime/list?q=${term}&genre=&format=&status=&sort=&page=
4. BE: Zod query validation (parseOrThrow)
5. BE: If invalid → 400 with user-friendly message
6. BE: Discovery service: ranking/recent/genre filter
7. BE: If cache miss → AniList GraphQL API
8. BE: If cache hit → Return cached results
9. BE: Return items with status indicators (ok/unavailable)
10. FE: Transform with discoveryCardToMedia
11. FE: Render MediaGrid with priorityCount={6}
12. FE: Show empty state if no items match
13. FE: Show error state if API failed
```

**Filter Handling**:
- Genre: `genre` param filter (case-insensitive match on `genres[]`)
- Format: `format` param filter (enum: TV, MOVIE, OVA, ONA, SPECIAL, MUSIC)
- Status: `status` param filter (enum: FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS)
- Sort: `sort` param filter (enum: TRENDING, POPULARITY_DESC, SCORE_DESC, START_DATE_DESC, FAVOURITES_DESC, TITLE_ROMAJI)
- Pagination: `page` (default 1), `perPage` (default 20, max 50)

### 2.5 Library Request

```
1. USER: Clicks "Remove from Library" or "Add to Library"
2. FE: useWatchlistEntry(entry) → action
3. BE: GET|POST|DELETE /api/v1/user/library (auth required)
4. BE: request.user existence check
5. BE: If !request.user → 401 Unauthorized
6. BE: Library service operation:
   - GET: return { library: LibraryEntry[] }
   - POST: batchSync(userId, body) → { result }
   - DELETE: remove(userId, kind, mediaId) → { deleted: boolean }
7. FE: Update local Dexie DB (db.library.bulkPut/update/delete)
8. FE: Refresh library state (libraryState input)
9. FE: Show toast confirmation
```

**Local-First Guarantee**:
- Dexie DB is the authoritative source for local state
- Backend routes exist for future accounts phase but are not relied upon
- Export/import payloads validated with exportPayloadSchema .strict()
- Contract violation → "Your local library could not be read: stored data does not match this version of Zenkai."

### 2.6 Playback Request

```
1. USER: Clicks "Play Episode 1" on episode grid
2. FE: episodeNumber === 1 check + airing gate
3. BE: GET /api/v1/episodes/:episodeId/sources?language=sub
4. BE: Zod validation (source resolution schema)
5. BE: Provider resolution (InProcess, Consumet, Template)
6. BE: Rank candidates by quality/speed/legal status
7. BE: Return PlaybackSource[] and PlaybackPlan[]
8. FE: Select best source, display playback UI
9. USER: Clicks "Play" → POST /api/v1/playback/execute
10. BE: Verification of execution target
11. BE: Return PlaybackExecution (HLS/progressive/embed)
11. FE: Mount Vidstack <MediaPlayer> with validated target
```

**Airing Gate**:
- If airingState === "upcoming" → STOP, show unreleased UI
- Never trigger source resolution or execution for unreleased episodes

## 3. Error Flow

### 2.1 API Error Responses

| Status | Frontend Handling | UI Component |
|--------|------------------|--------------|
| 200 OK | Use response data | Normal render |
| 400 Bad Request | Show error message | EmptyState with action |
| 401 Unauthorized | Show auth required toast + redirect | AuthPage |
| 404 Not Found | Show not found message | EmptyState |
| 503 Service Unavailable | Show provider down message | EmptyState with retry |
| Network Error | Show network error toast | EmptyState with retry |

### 2.2 Error Normalization
```
backend error → normalized error object
{
  kind: "api_error",
  status: number,
  message: string,
  retryable: boolean,
}
```

**Frontend handling**:
```typescript
const handleError = (error: unknown) => {
  const normalized = classifyError(error)
  setErrorState(normalized)
  setTimeout(() => setErrorState(null), 5000) // auto-dismiss
}
```

### 2.2 Retry Logic
```
- Transient errors (503, network timeout): retry after 2s, max 3 attempts
- Validation errors (400): do not retry, show user-friendly message
- Authentication errors (401): do not retry, show login required
- Not found (404): do not retry, show different content
```

## 3. State Management Flow

### 3.1 Global State (Zustand)
```
UI State Change
    ↓
zustand store update
    ↓
React components subscribe to store
    ↓
Re-render with new state
```

### 3.2 Local State (Dexie IndexedDB)
```
Dexie DB write
    ↓
useContinueWatching hook update
    ↓
Components read from hook
    ↓
Re-render with persisted state
```

**Persistence Guarantee**:
- `db.progress.bulkPut()` → indexedDB
- `db.library.bulkPut()` → indexedDB
- Export payload validated with .strict()
- Import validates with .strict(), rejects streamUrl/etc
- Classify error: "contract_violation" vs "unavailable"

### 3.3 URL State
```
URL Param Change
    ↓
useSearchParams() hook update
    ↓
React effect re-runs
    ↓
Component re-renders with new params
```

**URL parameters never directly persist data** — they trigger fetches that populate Dexie DB.

## 4. Loading States

### 4.1 Global Loading
```
<Skeleton className="h-64 w-48" />
```
Displayed on initial page load while API calls resolve.

### 4.2 Per-Section Loading
Each home section carries its own `status: "ok" | "unavailable"`:
- `status: "ok"` → Show items, skeleton for loading
- `status: "unavailable"` → Show unavailable banner with reason

### 4.2 Per-Component Loading
- `MediaGridSkeleton` — 12 skeleton items
- `EpisodeSkeleton` — 6 episode cards
- `DetailSkeleton` — h-64 w-48 skeleton
- `Input` — disabled state with placeholder

## 5. Empty States

### 5.1 Empty State Categories
| Category | Trigger | Component |
|----------|---------|-----------|
| No results | Search returned 0 items | EmptyState (icon, title, description, action) |
| No episodes | Episode catalogue empty | EmptyState or grid with fewer items |
| No favorites | Library empty | EmptyState with "Add first anime" CTA |
| No chapters | Manga chapter list empty | EmptyState with "No chapters available" |
| No novel results | Novel search returned 0 | EmptyState with search CTA |

### 5.2 Empty State Component
```typescript
<EmptyState
  icon={Search}
  title={`No results for "${trimmed}"`}
  description={hasFilters ? "No titles matched your query." : 'Check the spelling or try a shorter query.'}
  action={hasFilters ? (
    <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
  ) : undefined}
/>
```

## 6. Error States

### 6.1 Error Categories
| Category | Trigger | Component |
|----------|---------|-----------|
| API failure | Network error or 5xx | EmptyState with retry |
| Validation error | 400 Bad Request | EmptyState with message |
| Auth failure | 401 Unauthorized | AuthPage + toast |
| Not found | 404 Not Found | EmptyState + navigate |
| Provider unavailable | 503 Service Unavailable | EmptyState with retry later |

### 6.2 Error Handling Pattern
```typescript
try {
  const result = await apiCall()
  setData(result.data)
  setError(null)
} catch (error) {
  const normalized = classifyError(error)
  setError(normalized)
  setTimeout(() => setError(null), 5000)
}
```

**`classifyError`** maps backend errors to user-facing messages:
- `api_error` with status 503 → "Provider temporarily unavailable, please retry"
- `api_error` with status 400 → "Invalid search query"
- `api_error` with status 401 → "Please log in to continue"
- `api_error` with status 404 → "Anime not found in catalogue"
- `network_error` → "Network error, please check connection"

## 7. Retry Logic

```
Retry Policy:
- Transient errors (503, network timeout): retry after 2s, max 3 attempts
- Validation errors (400): do not retry, show user-friendly message
- Authentication errors (401): do not retry, show login required
- Not found (404): do not retry, show different content or redirect

Implementation:
const retryAttempts = 3
const retryDelay = 2000 // 2 seconds

const attempt = async (fn: () => Promise<void>, attempt = 1) => {
  try {
    await fn()
  } catch (error) {
    if (attempt >= retryAttempts) throw error
    const isTransient = isTransientError(error)
    if (isTransient) {
      await new Promise(r => setTimeout(r, retryDelay))
      await attempt(fn, attempt + 1)
    } else {
      throw error
    }
  }
}
```

## 8. Caching Strategy

```
Cache Levels:
1. HTTP Response Cache (Next.js Turbopatch)
2. TanStack Query Cache (staleTime: 2min for search, 10min for detail)
3. Dexie IndexedDB (local-first, no expiry TTL from backend)
4. Provider Cache (LRU in-memory, TTL from config.CACHE_TTL_*)

Provider TTL Configuration:
- trending: config.CACHE_TTL_DISCOVERY_S (hourly)
- popular: config.CACHE_TTL_DISCOVERY_S (hourly)
- seasonal: config.CACHE_TTL_DISCOVERY_S * 4 (4 hours)
- topRated: config.CACHE_TTL_DISCOVERY_S * 4 (4 hours)
- updated: config.CACHE_TTL_DISCOVERY_S (hourly)

Cache Invalidation:
- On successful write (upsert, create, update)
- On explicit revalidate() call
- On page refocus (if enabled)
- On manual clear (user action)
```

---

## 9. Failure Mode Inventory

| Failure Mode | Symptom | Recovery |
|-------------|---------|----------|
| Provider timeout | Search hangs → timeout error | Show "Search is temporarily unavailable" + retry |
| Cache stale | Old data displayed → refresh required | Pull-to-refresh or manual revalidate |
| Schema mismatch | Unexpected fields → component error | Zod strict validation + fallback UI |
| Auth expired | Session timed out → 401 → redirect to login | Show auth required toast + login |
| Provider down | All sources fail → unavailable state | Show "unavailable" banner with reason |
| User session expired | Library operations fail → 401 | Show auth required, clear local state |
| Local DB corrupt | Dexie corrupt → contract violation | Show "library data error, retrying" + export/import |

## 9. Success Flow

```
1. USER: Clicks anime card → navigates to /anime/[id]
2. FE: useAnimeDetail(id) → fetchAnimeDetail(id) → loading skeleton
3. BE: GET /api/v1/anime/:id → 200 + AnimeDetail schema
4. FE: Transform data → render anime detail page
5. BE: GET /api/v1/episodes/catalogue/:anilistId → 200 + EpisodeCatalogue
6. FE: Transform episodes → render episode grid
7. FE: useContinueWatching("anime") → Dexie check → watched indicators
8. USER: Clicks "Watch Episode 1" → verified airing gate
9. BE: GET /api/v1/episodes/:episodeId/sources → 200 + PlaybackSource[]
10. FE: Mount Vidstack MediaPlayer with validated source
11. USER: Watches episode → progress tracked in Dexie DB
12. USER: Clicks heart → toggleWatchlist → Dexie update + API POST
13. FE: Toast "Added to Watchlist" / "Removed from Watchlist"
```

---
*This document is derived from the actual Zenkai repository structure and verified implementation. It must be kept synchronized with code changes.*

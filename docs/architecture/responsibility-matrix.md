# Zenkai Responsibility Matrix

## Feature Ownership Classification

This matrix classifies every feature into one of three ownership categories:
- **FE**: Frontend owns the presentation and interaction
- **BE**: Backend owns the authoritative behavior and persistence
- **SE**: Shared — both layers have defined responsibilities with clear contracts

### 1. Navigation

| Aspect | Owner | Contract |
|--------|-------|----------|
| Menu and routing UI | FE | Route authorization where required |
| Active page tracking | FE | URL state (` pathname` ) |
| Protected route enforcement | BE | Token validation + role checks |

### 2. Search

| Aspect | Owner | Contract |
|--------|-------|----------|
| Input and results presentation | FE | Search query params, response schema |
| Search execution, validation, protected data access | BE | `/api/v1/anime/list` with validated filters |
| Genre chip filtering | FE | `/api/v1/genres` enum values |
| Pagination and sort | FE | `page`, `perPage`, `sort` params |

### 3. Anime Catalogue

| Aspect | Owner | Contract |
|--------|-------|----------|
| Rendering and interaction | FE | Card clicks, hover states |
| Data retrieval and availability rules | BE | `/api/v1/anime/list` with filters |
| Discovery bucket routing | BE | `/api/v1/anime/discovery/:bucket` |
| Empty state handling | FE | Based on `status: "unavailable"` from API |

### 4. Anime Details

| Aspect | Owner | Contract |
|--------|-------|----------|
| Layout and display | FE | Card grid, metadata presentation |
| Authoritative metadata retrieval | BE | `/api/v1/anime/:id` → `AnimeDetail` schema (28 fields) |
| Episode catalogue | BE | `/api/v1/episodes/catalogue/:anilistId` → `EpisodeCatalogue` |
| Watch progress state | SE | Dexie DB local-first + backend progress service |

### 5. Episode Catalogue

| Aspect | Owner | Contract |
|--------|-------|----------|
| Episode selection UI | FE | Clickable episode numbers |
| Episode catalogue and data integrity | BE | `/api/v1/episodes/catalogue/:anilistId` |
| Episode number validation | BE | Episode IDs must match `episodeNumber` field |
| Missing episode handling | FE | Show unavailable state, don't fabricate |

### 6. Video Player

| Aspect | Owner | Contract |
|--------|-------|----------|
| Playback interface/controls | FE | Vidstack player controls |
| Protected source resolution and access rules | BE | `/api/v1/episodes/:episodeId/sources` |
| Source resolution and execution | BE | `/api/v1/playback/execute` |
| Playback plan verification | BE | Identity verification via execution |

### 7. Watch Progress

| Aspect | Owner | Contract |
|--------|-------|----------|
| Progress display and temporary updates | FE | Dexie DB local-first |
| Validation and persistence | BE | Progress service with TTL caching |
| Authoritative retrieval and calculation | BE | `useContinueWatching` hook + server sync |

### 8. Favorites

| Aspect | Owner | Contract |
|--------|-------|----------|
| Toggle UI and optimistic feedback | FE | Heart button click |
| Ownership validation and persistence | BE | `/api/v1/user/library` (auth required) |
| Library persistence | BE | Dexie DB with export/import |

### 9. User Profile

| Aspect | Owner | Contract |
|--------|-------|----------|
| Profile presentation and forms | FE | Form fields, display name |
| Identity verification and profile persistence | BE | `/api/v1/user/profile` (future) |

### 9. Recommendations

| Aspect | Owner | Contract |
|--------|-------|----------|
| Display and interaction | FE | Grid of suggested anime |
| Recommendation generation when data-dependent | BE | Requires backend service (not yet implemented) |

### 10. Notifications

| Aspect | Owner | Contract |
|--------|-------|----------|
| Rendering and interaction | FE | Toast notifications (`sonner`) |
| Delivery, persistence and authorization | BE | Server-side notification service |

### 9. Rate Limiting

| Aspect | Owner | Contract |
|--------|-------|----------|
| Handle feedback and display errors | FE | Show rate limit error from API |
| Enforce actual rate limits | BE | Provider rate limiting (60/min for proxy) |

### 10. Authentication

| Aspect | Owner | Contract |
|--------|-------|----------|
| Login forms and session-aware UI | FE | Login form, session display |
| Verify credentials and sessions | BE | `/api/v1/auth/*` endpoints |

### 11. Admin Dashboard

| Aspect | Owner | Contract |
|--------|-------|----------|
| Admin interface | FE | Admin UI (protected route) |
| Admin authorization and protected operations | BE | Role-based access control |

## 2. Shared Code Guidelines

### 2.1 What Can Be Shared
- Type definitions (with runtime validation at trust boundaries)
- Pure formatting functions
- Non-sensitive constants
- UI-independent validation schemas
- Serialization helpers
- Simple deterministic transformations

### 2.2 What Must NOT Be Shared
- Database clients with browser code
- Secret configuration
- Server authentication internals
- Private provider clients
- Server-only business services
- Environment-dependent modules without explicit boundaries

**Organization**: Keep shared modules in `shared/` with clear `server/` and `client/` subdirectories. Use explicit import paths and never assume shared code can be executed in both environments.

## 3. API Contract Ownership

### 3.1 Frontend-Owned APIs
- `fetchAnimeDetail(id)` — `/api/v1/anime/${encodeURIComponent(id)}`
- `fetchAnimeEpisodes(id, options)` — `/api/v1/episodes/catalogue/${anilistId}`
- `useHome()` — Home payload query
- `useContinueWatching(kind)` — Dexie local-first
- `useWatchlistEntry()` — Library entry management
- `useSearch()` — Discovery search

### 3.2 Backend-Owned APIs
- `GET /api/v1/anime/discovery/:bucket` — Ranking endpoints
- `GET /api/v1/genres` — Genre list (cached)
- `GET /api/v1/home` — Aggregated home payload
- `GET /api/v1/episodes/catalogue/:anilistId` — Episode catalogue
- `GET /api/v1/episodes/:episodeId/sources` — Source resolution
- `POST /api/v1/playback/execute` — Playback execution
- `GET /api/v1/user/library` — Library (auth required)
- `POST /api/v1/user/library/batch` — Library batch sync (auth required)
- `DELETE /api/v1/user/library/:kind/:mediaId` — Remove from library (auth required)

### 3.2 Shared API Contracts
- `AnimeDetail` schema (Zod) — frontend validates response, backend validates request
- `EpisodeCatalogue` schema (Zod) — both layers use, backend enforces
- `DiscoveryCard` schema (Zod) — both layers reference
- `EpisodeCard` schema (Zod) — both layers reference

## 3. Data Flow Diagrams

### 3.1 Anime Detail Flow
```
USER CLICKS anime card
    ↓
FE: Navigate to /anime/[id]
    ↓
FE: useAnimeDetail(id) → fetchAnimeDetail(id)
    ↓
BE: GET /api/v1/anime/:id (AnimeDetail schema validated)
    ↓
BE: Repository: getByAnilistId(anilistId)
    ↓
BE: If cache miss → AniList GraphQL API
    ↓
BE: Cache result (TTL: metadata TTL)
    ↓
BE: Return AnimeDetail schema response
    ↓
FE: Transform with mediaHref, displayTitle, formatScore
    ↓
FE: Render anime detail page
```

### 3.2 Episode Catalogue Flow
```
USER CLICKS "Watch Episode 1"
    ↓
FE: useEpisodeCatalogue(anilistId) → fetchAnimeEpisodes(id)
    ↓
BE: GET /api/v1/episodes/catalogue/:anilistId
    ↓
BE: Repository: listEpisodes(localId) or syncEpisodes(anilistId)
    ↓
BE: If cache miss → AniList GraphQL API + provider sync
    ↓
BE: Cache result (TTL: discovery TTL)
    ↓
BE: Return EpisodeCatalogue response
    ↓
FE: Transform with toCard(), episode matching
    ↓
FE: Render episode grid
```

### 3.3 Favorites Flow
```
USER CLICKS heart button
    ↓
FE: useWatchlistEntry(entry) → toggleWatchlist()
    ↓
BE: POST /api/v1/user/library (auth required)
    ↓
BE: Auth verification (request.user check)
    ↓
BE: Library service: upsert entry (Zod .strict() validation)
    ↓
BE: Return { success: true }
    ↓
FE: Update heart state (filled/outline)
    ↓
BE: Optional: revalidateLibrary() to refresh dependent UI
```

### 3.4 Search Flow
```
USER TYPES in search input
    ↓
FE: debounced search term → useSearch(term)
    ↓
BE: GET /api/v1/anime/list with filters (q, genre, format, status, sort, page)
    ↓
BE: Zod query validation (parseOrThrow)
    ↓
BE: Discovery service: ranking/recent/genre filter
    ↓
BE: If cache miss → AniList GraphQL API
    ↓
BE: Cache result (TTL: discovery TTL)
    ↓
BE: Return filtered items with status indicators
    ↓
FE: Transform with discoveryCardToMedia
    ↓
FE: Render MediaGrid with priorityCount
```

## 4. Security Boundaries

### 4.1 Frontend Cannot
- Connect directly to PostgreSQL or any private database
- Import database clients (Drizzle, pg, better-sqlite3)
- Execute raw SQL queries
- Access database credentials from environment
- Bypass authentication checks via UI manipulation
- Present fake success states for failed backend operations
- Modify protected resource ownership

### 4.2 Backend Must
- Validate all incoming requests with Zod schemas
- Enforce ownership before data modification
- Rate-limit all endpoints (per-user, per-IP)
- Return controlled error responses (never stack traces)
- Log security events for audit
- Reject requests missing required authentication

### 4.2 Data Integrity Boundaries
- **Never** trust client-provided IDs or counts
- **Always** verify ownership before data modification
- **Always** validate response schemas against Zod definitions
- **Always** check TTL before using cached data
- **Always** verify external provider responses before presenting

## 5. violation Detection

### 5.1 Automated Checks
1. Client code importing server-only modules → ESLint rule
2. Database clients imported by browser code → TypeScript error
3. Secret environment variables referenced by client code → `next-build` failure
4. Server-only SDKs included in client bundles → Bundle analysis
5. Direct database access from frontend components → ESLint + TypeScript
6. Unauthorized direct upstream provider requests → API contract check
7. Duplicate API request implementations → Import analysis
8. Missing request validation → Zod schema coverage
9. Missing authorization on protected mutations → Auth check middleware
10. Inconsistent API response contracts → Schema comparison

### 5.2 Manual Review Items
- [ ] Every protected mutation has auth check on backend
- [ ] Every API response validates against Zod schema
- [ ] No browser code directly accesses Dexie beyond library hooks
- [ ] No `NEXT_PUBLIC_` variables contain secrets
- [ ] Every mutation has corresponding backend endpoint
- [ ] Every endpoint has Zod request validation
- [ ] Error responses never expose internal details
- [ ] Caching TTLs are documented and reasonable

## 5. Remediation Priorities

| Priority | Issue | File(s) | Fix |
|--------|-------|---------|-----|
| P0 | Database access from browser | `src/lib/library.ts` | Already local-first; verify no new imports |
| P0 | Secrets in frontend bundles | `src/config/tokens.ts` | Verify no `NEXT_PUBLIC_` secrets |
| P0 | Frontend enforcing security | All protected routes | Backend authorization |
| P1 | Business logic duplication | `src/components/` vs `src/modules/` | Move to services |
| P1 | Fake persistence | `src/hooks/use-watchlist.ts` | Verify local-first documented |
| P2 | Inconsistent API contracts | `src/lib/api/zenkai.ts` | Zod schemas both sides |
| P3 | Unauthorized upstream requests | `src/lib/api/zenkai.ts` | Rate limiting + auth |

---
*This document is derived from the actual Zenkai repository structure and verified implementation. It must be kept synchronized with code changes.*

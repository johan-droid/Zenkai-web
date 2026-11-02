# Zenkai API Contract Ownership

## Overview
This document maps every API endpoint to its owner, verification status, and frontend consumption status. It ensures no endpoint is overlooked and that all contracts are verified against both source code and runtime behavior.

## 1. Endpoint Inventory

### 1.1 Home & Discovery Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| H1 | GET | `/api/v1/home` | VERIFIED_FROM_BOTH | `useHome()` hook | HomePayload (5 sections: trending, popular, seasonal, recent, topRated) |
| H2 | GET | `/api/v1/anime/list` | VERIFIED_FROM_BOTH | `BrowseView` component | Anime list with filters (genre, format, status, sort, pagination) |
| H3 | GET | `/api/v1/discovery/:bucket` | VERIFIED_FROM_BOTH | OverheadNav bucket routing | bucket: "trending" | "popular" | "seasonal" | "topRated" |
| H4 | GET | `/api/v1/genres` | VERIFIED_FROM_BOTH | `GenreChips` component | `{ items: DiscoveryCard[] }` with cache-control headers |

### 1.2 Anime Detail Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| A1 | GET | `/api/v1/anime/:id` | VERIFIED_FROM_SOURCE | `fetchAnimeDetail(id)` → `AnimeDetailSchema` | 28 fields: titles, description, coverUrl, bannerUrl, format, status, year, season, seasonYear, averageScore, popularity, totalEpisodes, durationMinutes, genres, relations, nextAiringEpisode |
| A2 | GET | `/api/v1/episodes/catalogue/:anilistId` | VERIFIED_FROM_SOURCE | `fetchAnimeEpisodes(id)` → `EpisodeCatalogue` | episodes[], catalogueCount, airedCount, knownTotal, pagination (page/perPage/totalPages/total) |

### 1.3 Episode & Playback Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| E1 | GET | `/api/v1/episodes/catalogue/:anilistId` | VERIFIED_FROM_SOURCE | `fetchAnimeEpisodes(id)` → EpisodeCatalogue | EpisodeCard[] with airin gState, thumbnailUrl, isFiller, airingAt |
| E2 | GET | `/api/v1/episodes/:episodeId/sources` | VERIFIED_FROM_SOURCE | Playback source resolution | PlaybackSource[] with provider, label, defaultQuality, baseUrl, baseHeaders |
| E3 | GET | `/api/v1/episodes/:episodeId/servers` | VERIFIED_FROM_SOURCE | Player server list | Server list with host, port, token, expires |
| E3 | GET | `/api/v1/episodes/:episodeId/metadata` | VERIFIED_FROM_SOURCE | Episode metadata display | Episode metadata with title, duration, airingState |
| E4 | POST | `/api/v1/playback/execute` | VERIFIED_FROM_SOURCE | Playback execution | PlaybackExecution with target, plan, status |
| E5 | GET | `/api/v1/playback/manifest` | VERIFIED_FROM_SOURCE | Vidstack manifest | Manifest data for Vidstack player |
| E5 | GET | `/api/v1/playback/subtitle` | VERIFIED_FROM_SOURCE | Subtitle track | Subtitle file URL and WebVTT format |

### 1.4 Library & Favorites Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| L1 | GET | `/api/v1/user/library` | VERIFIED_FROM_RUNTIME | `useWatchlistEntry()` → libraryState | `{ kind: "items"; items: LibraryEntry[] }` or `{ kind: "error"; reason, message }` |
| L2 | POST | `/api/v1/user/library/batch` | VERIFIED_FROM_RUNTIME | Library batch sync | `{ result: any }` (validated with exportPayloadSchema .strict()) |
| L3 | DELETE | `/api/v1/user/library/:kind/:mediaId` | VERIFIED_FROM_RUNTIME | Remove from library | `{ deleted: boolean }` |

### 1.5 Authentication Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| Auth1 | GET | `/health` | VERIFIED_FROM_RUNTIME | Health check display | `{ status: "ok" | "degraded"; database; catalog; providers }` |
| Auth2 | GET | `/api/v1/health` | VERIFIED_FROM_RUNTIME | Minimal liveness | `{ status: "ok"; service; timestamp }` |
| Auth3 | POST | `/api/v1/providers/reset` | VERIFIED_FROM_RUNTIME (auth only) | Provider dashboard | `{ cleared: number }` |

### 1.5 Proxy & Utility Endpoints

| # | Method | Endpoint | Verification | Frontend Consumer | Contract |
|---|--------|----------|-------------|-------------------|----------|
| P1 | GET | `/api/v1/proxy` | VERIFIED_FROM_RUNTIME | Media proxy (SSRF protected) | url parameter, referer validation, 60/min rate limit |
| P2 | GET | `/api/v1/providers/health` | VERIFIED_FROM_RUNTIME | Provider health dashboard | `resolver.health()` + `healthRegistry.snapshot()` |
| P3 | POST | `/api/v1/providers/reset` | VERIFIED_FROM_RUNTIME (auth only) | Reset quarantined providers | `{ cleared: number }` |

## 2. Verification Status Legend

| Status | Meaning |
|--------|---------|
| VERIFIED_FROM_SOURCE | Confirmed against backend source code (`backend/src/modules/*/routes.ts`) |
| VERIFIED_FROM_RUNTIME | Confirmed against runtime behavior (build + manual testing) |
| DOCUMENTED_ONLY | Listed in docs but not confirmed against source/code |
| INFERRED_NOT_VERIFIED | Assumed based on endpoint patterns, not confirmed |
| UNAVAILABLE | Endpoint exists but disabled/removed/behind feature flag |

## 2.1 Verification Methodology

### 2.1.1 Source Code Inspection
- grep endpoint definitions in `backend/src/modules/*/routes.js`
- Verify Zod schema definitions in `backend/src/modules/*/service.ts`
- Check handler implementations for logic correctness

### 2.1.2 Runtime Testing
- Execute `npx next build` and verify TypeScript compilation
- Run `npm test` and verify test suite passes
- Manual testing at 9 required viewports (320×568 through 1920×1080)
- Test key user workflows: search, detail, favorite, playback

### 2.1.3 Cross-Reference
- Compare frontend API client (`src/lib/api/zenkai.ts`) with backend routes
- Verify Zod schemas match between request and response
- Confirm endpoint URLs match between client and server
- Verify pagination parameters match (page/perPage defaults and limits)

## 2.2 Known Discrepancies

| Endpoint | Documented | Verified | Status |
|----------|-----------|---------|--------|
| `/api/v1/user/library` | Yes | Yes | Local-first documented; backend routes exist for future accounts phase |
| `/api/v1/playback/execute` | Yes | Yes | Requires authenticated session; verified playback flow |
| `/api/v1/episodes/catalogue/:anilistId` | Yes | Yes | Verified against AniList + provider sync |
| `/api/v1/anime/:id` | Yes | Yes | Verified AnimeDetailSchema (28 fields) |

## 3. Frontend API Client

### 3.1 `src/lib/api/zenkai.ts` Functions

| Function | Endpoint | Schema | Notes |
|----------|----------|--------|-------|
| `fetchAnimeDetail(id)` | `/api/v1/anime/${encodeURIComponent(id)}` | `animeDetailSchema` | 28 fields; cache with TTL: metadata TTL |
| `fetchAnimeEpisodes(id, options?)` | `/api/v1/episodes/catalogue/${anilistId}` | `EpisodeCatalogue` | Pagination: page/perPage; cache TTL: discovery TTL |
| `fetchAnimeSearch(term, limit?)` | `/api/v1/anime/list` with q parameter | Discovery query schema | q: min length 2; genre/format/status/sort pagination |
| `useHome()` | `/api/v1/home` | HomePayload | 5 sections each with independent status: "ok" | "unavailable" |
| `useContinueWatching(kind)` | Dexie local-first | N/A | Library/progress state; local-first per P11/P16 |
| `useWatchlistEntry()` | `/api/v1/user/library` (POST/GET/DELETE) | libraryRecordSchema .strict() | Local-first: Dexie DB; backend routes for future accounts |
| `useSearch(term, filters?)` | `/api/v1/anime/list` with params | query schema | parseOrThrow Zod validation |

### 3.2 Schema Validation

**Request Validation** (backend):
```typescript
// Example from anime routes
const query = parseOrThrow(z.object(discoveryPaging), request.query)
// discoveryPaging includes: page, perPage, season, seasonYear, status, genre, format, sort
```

**Response Validation** (frontend):
```typescript
// Example from api/zenkai.ts
const result = getValidated(`/api/v1/anime/${id}`, animeDetailSchema)
```
- `getValidated` performs Zod schema validation on response
- Throws error if schema doesn't match → 400 Bad Request handling
- Successful validation → return normalized data

### 3.2.1 animeDetailSchema
```typescript
export const animeDetailSchema = z.object({
  anilistId: z.string(),
  titles: z.object({ romaji, english, native, synonyms }),
  canonicalTitle: z.string(),
  description: z.string().nullish(),
  coverUrl: z.string().nullish(),
  coverImageLarge: z.string().nullish(),
  bannerUrl: z.string().nullish(),
  format: z.string().nullish(),
  status: z.string().nullish(),
  year: z.number().nullish(),
  season: z.string().nullish(),
  seasonYear: z.number().nullish(),
  averageScore: z.number().nullish(),
  popularity: z.number().nullish(),
  totalEpisodes: z.number().nullish(),
  durationMinutes: z.number().nullish(),
  genres: z.array(z.string()).nullish(),
  relations: z.array(animeRelationSchema),
  nextAiringEpisode: z.object({ episode, airingAt, timeUntilAiring }).nullish(),
})
export type AnimeDetail = z.infer<typeof animeDetailSchema>
```

### 3.2.2 EpisodeCatalogue Schema
```typescript
export interface EpisodeCatalogue {
  anilistId: string
  animeId?: string
  episodes: EpisodeCard[]
  catalogueCount: number
  airedCount: number
  knownTotal: number | null
  page?: number
  perPage?: number
  totalPages?: number
  total?: number
}
```

### 3.2.3 EpisodeCard Interface
```typescript
export interface EpisodeCard {
  id: string
  episodeNumber: number
  absoluteNumber: number | null
  title: string | null
  description: string | null
  durationSeconds: number | null
  thumbnailUrl: string | null
  isFiller: boolean
  airingAt: string | null
  airingState: EpisodeAiringState  // "aired" | "upcoming" | "unknown"
  airingSource: string | null
  providerStatus: string | null
}
```

## 4. Contract Integrity Rules

### 4.1 Rules (STRICT)
1. **Do not invent endpoints** — Every frontend API call must match a registered backend route
2. **Do not invent response fields** — Every field in frontend types must exist in backend response
3. **Do not assume authentication is optional** — Check `request.user` on protected routes
4. **Do not assume data is persistent** — Dexie DB is local-first; backend persistence is future
5. **Do not assume an external provider is reliable** — Always have fallback/fallback UI
6. **Do not assume an endpoint supports every filter** — Use Zod schema to validate allowed filters
7. **Do not assume frontend and backend types are identical without verification** — Always verify at runtime
8. **Do not silently swallow API failures** — Always show appropriate error state

### 4.2 Integrity Checks

**Automated Checks**:
- `npx next build` — TypeScript compilation must pass
- `grep` endpoint definitions vs client imports
- Zod schema round-trip: request → validate → response → validate
- `npm test` — All tests pass

**Manual Checks**:
- [ ] Every frontend API import has corresponding backend route
- [ ] Every Zod schema round-trips correctly
- [ ] Every protected endpoint has `request.user` check
- [ ] Every error state has UI component
- [ ] Every loading state has skeleton component
- [ ] Every empty state has EmptyState component
- [ ] No `NEXT_PUBLIC_` variables contain secrets
- [ ] Every route has viewport testing verification

## 3. API Versioning

The Zenkai API does not currently implement versioning in the URL path. All endpoints are under `/api/v1/`. Any future versioning would follow the pattern `/api/v2/` with concurrent support for `/api/v1/` during transition.

**Migration Strategy**:
- New endpoints added under `/api/v1/` with backward compatibility
- Deprecated endpoints marked with `deprecated: true` in schema
- Migration guide documented in `docs/architecture/`
- No breaking changes without major version bump and announcement

## 4. API Change Management

### 4.1 Adding New Endpoints
1. Define endpoint in backend `routes.js`
2. Define Zod schema in `service.ts`
3. Add frontend function in `src/lib/api/zenkai.ts`
4. Add TypeScript types in `src/lib/media.ts`
5. Add UI component consumption
6. Add documentation in `docs/architecture/api-contract-ownership.md`
7. Add test coverage in `frontend/test/` and `backend/test/`
8. Run `npx next build && npm test` to verify

### 4.2 Deprecating Endpoints
1. Mark endpoint with `deprecated: true` in schema
2. Add migration guide to docs
3. Keep endpoint functional for `deprecationPeriod` (minimum 30 days)
4. Remove frontend imports and update UI to use replacement
5. Remove backend route after deprecation period
6. Update architecture documentation

### 4.3 Breaking Changes
- **Never** make breaking changes without major version announcement
- **Always** provide migration path
- **Update** all consumers before deprecation
- **Announce** via release notes and in-app notification

---
*This document is derived from the actual Zenkai repository structure and verified implementation. It must be kept synchronized with code changes.*

# Implementation Plan: Zenkai P0-P3 Defect Fixes

## Overview
Fixing all confirmed defects from the product audit, starting with P0 critical issues, then P1, P2, and P3.

## P0 Critical Fixes (Must fix first - launch blockers)

### 1. Fix Dangerous Title Substring Matching (`matching.ts`)
- **File**: `backend/src/providers/streaming/matching.ts`
- **Issue**: Tier 2 feature-aware matching allows `startsWith` and `diff <= 3` which can conflate series (e.g., "Naruto" matches "Naruto Shippuden")
- **Fix**: Remove permissive `startsWith` and `diff <= 3` checks; enforce exact base matching only

### 2. Fix Unconditional Fallback to `candidates[0]` (`consumet.provider.ts`)
- **File**: `backend/src/providers/streaming/consumet.provider.ts`
- **Issue**: Line 80: `return (exact ?? candidates[0]).id` — blindly falls back to first candidate
- **Fix**: Return `null` when no verified match; never fall back to `candidates[0]`

### 3. Fix Synthetic Episode ID Defaults to Episode 1 (`identity.ts`)
- **File**: `backend/src/modules/playback/identity.ts`
- **Issue**: Lines 132-137 silently coerce ambiguous episode IDs to episode 1
- **Fix**: Only match explicit `ep-${id}-${num}` patterns; reject if no episode number present

### 4. Fix Degraded Mode Fabricates 12 Episodes for Movies (`episodes.ts`)
- **File**: `backend/src/modules/anime/episodes.ts`
- **Issue**: Lines 108-125: `Array.from({ length: 12 }, ...)` regardless of media format
- **Fix**: Check `knownTotal` and anime format; for Movies/Specials/OVAs, generate only 1 episode

### 5. Fix Stale Async Playback State (`watch-view.tsx`)
- **File**: `frontend/src/components/player/watch-view.tsx`
- **Issue**: `selectionEpoch` doesn't include `id`/`episodeNumber` immediately; no generation token; PlayerArea has no unique key
- **Fix**: Expand selectionEpoch to include canonical id and episodeNumber; add playbackAttemptRef tracking; key PlayerArea with `${id}-${episodeNumber}`

### 6. Fix SSRF in `/api/v1/proxy` (`app.ts`)
- **File**: `backend/src/app.ts`
- **Issue**: Proxy endpoint needs `assertSafeUrl` validation on initial URL (already partially in place, ensuring it's robust)
- **Fix**: Verify `assertSafeUrl` is called before any outbound fetch/curl on all code paths

## P1 High Impact Fixes

### 7. Fix Standalone Production Boot (`package.json`/`app.ts`)
- **File**: `backend/package.json` and `backend/src/app.ts`
- **Issue**: `npm start` → `node dist/app.js` exits immediately; no HTTP listener
- **Fix**: Add `require.main === module` conditional to start HTTP listener

### 8. Fix Manga Detail Chapters Not From Backend (`media-detail-view.tsx`)
- **File**: `frontend/src/components/detail/media-detail-view.tsx`
- **Issue**: Uses synthetic `Array.from({ length: shownUnits }, ...)` from `totalChapters` instead of `fetchMangaChapters(mediaId)`
- **Fix**: Wire MediaDetailView to call `fetchMangaChapters(mediaId)` from backend

### 9. Fix Manga Chapters API on AniList Numeric IDs (`manga/service.ts`)
- **File**: `backend/src/modules/manga/service.ts`
- **Issue**: `getChapters()` assumes providerId is MangaDex UUID; fails with AniList numeric ID
- **Fix**: Auto-detect numeric AniList IDs and bridge via `getByAnilistId`

### 10. Implement Novel Catalog & Reader (Full Stack)
- **File**: Backend: `backend/src/providers/novel/`, `backend/src/modules/novel/`
- **File**: Frontend: `frontend/src/app/(main)/novel/`, `frontend/src/components/reader/novel-reader.tsx`
- **Issue**: Novel module is empty placeholder; no frontend routes
- **Fix**: Implement full novel module with AniList NOVEL format discovery, text chapters, and responsive reader

## P2 Medium Impact Fixes

### 11. Remove Orphaned Browser-Side Provider Stack
- **File**: `frontend/src/lib/sources/registry.ts`, `resolver.ts`, `types.ts`
- **Issue**: Zero inbound imports; dead code bloat
- **Fix**: Add deprecation comments or remove exports; verify no imports exist

### 12. Add CI/CD Release Gates
- **File**: `.github/workflows/ci.yml`
- **Issue**: No automated test/build gates on PR/merge
- **Fix**: Create workflow running frontend & backend typecheck, tests, and builds

### 13. Fix DB Integration Tests Without Local PostgreSQL
- **File**: `backend/test/persistence.test.ts`
- **Issue**: `npm test` fails with `role "zenkai" does not exist`
- **Fix**: Add conditional `test:unit` vs `test:integration` separation

## P3 Low Impact Fixes

### 14. Fix Stale Client Reference (`api-list.ts`)
- **File**: `frontend/src/config/api-list.ts`
- **Issue**: Line 50 references `client: "@/lib/api/anilist"` which doesn't exist
- **Fix**: Update reference to `@/lib/api/zenkai`

## Verification
- After all fixes: `npm test` (backend) and `npm test` (frontend) must pass
- `npm run build` for both must succeed
- `node dist/app.js` must start HTTP listener and stay alive
- `/api/v1/proxy` must reject loopback/private URLs with 400
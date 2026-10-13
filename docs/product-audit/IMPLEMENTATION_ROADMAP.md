# Zenkai Implementation Roadmap

**Mission:** `ZENKAI-PRODUCT-RECOVERY-01` & `ZENKAI-P0-IDENTITY-LOCK`  
**Execution Order:** Dependency-Driven, Stage-by-Stage Verification  

---

## Stage 0: Baseline & Audit (Complete)
- [x] Inspect Git history, branches, file structure, package manifests.
- [x] Trace complete identity chain across backend and frontend.
- [x] Establish test baseline: Frontend (172/172 pass), Backend unit & playback tests pass.
- [x] Document system map, feature inventory, and confirmed defects.

---

## Stage 1: P0 Playback Identity & Stability Fixes
- [ ] **Hardened Provider Title Matching:**
  - In `backend/src/providers/streaming/inprocess.provider.ts`: Replace loose substring matching with strict exact title and verified alternate title matching; reject candidates with extra season/part/format tokens; key cache by AniList ID.
  - In `backend/src/providers/streaming/consumet.provider.ts`: Eliminate unconditional fallback to `candidates[0]`; return `null` when identity cannot be verified.
- [ ] **Safe Episode ID Resolution:**
  - In `backend/src/modules/playback/identity.ts`: Remove dangerous fallback to episode 1 on ambiguous IDs. Require explicit episode numbers.
- [ ] **Frontend Stale Async & Generation Token Lock:**
  - In `frontend/src/components/player/watch-view.tsx`: Expand `selectionEpoch` to include canonical `id` and `episodeNumber`. Add playback generation token tracking to discard out-of-order async responses. Key `PlayerArea` with `${id}-${episodeNumber}` to prevent cross-resource state bleed.
- [ ] **Unit & Regression Tests:**
  - Add regression suite in `backend/test/` and `frontend/test/` asserting rejection of wrong-title candidates, sequel confusion prevention, stale response cancellation, and identical-episode cross-anime isolation.

---

## Stage 2: Anime Details & Core Navigation
- [ ] **Episode Catalogue Scaffolding:**
  - In `backend/src/modules/anime/episodes.ts`: Honour media format (Movie/OVA/Special) so movies generate only 1 episode instead of 12 phantom episodes.
- [ ] **Core Navigation Flow Verification:**
  - Verify `Home → Browse → Detail → Episode Grid → Watch` preserves canonical identity at every step.

---

## Stage 3: Watchlist & Library Functionality
- [ ] **Library Validation & Synchronization:**
  - Verify add/remove/status toggle across detail pages and library view.
  - Verify Dexie IndexedDB persistence, removal semantics, and empty states.
  - Support novel items in Dexie `library` and `progress` tables.

---

## Stage 4: Playback & API Reliability
- [ ] **Source Validation & Error Distinctions:**
  - Ensure distinction between `no_streams` (200 with empty plans) and `all_failed` (503 retryable outage).
  - Verify coalescing of concurrent source resolution requests.

---

## Stage 5: Manga Catalog & Reader Completion
- [ ] **Real Chapter Feed on Detail Page:**
  - In `frontend/src/components/detail/media-detail-view.tsx`: Replace synthetic chapter loop with `useQuery` calling `fetchMangaChapters(mediaId)`.
- [ ] **AniList ID to MangaDex Bridging:**
  - In `backend/src/modules/manga/service.ts`: Detect numeric AniList IDs in `getChapters` and bridge automatically via `getByAnilistId`.
- [ ] **Reader UI & Progress:**
  - Verify reader modes (vertical, paged, double, rtl), image preloading, and Dexie progress resumption.

---

## Stage 6: Novel Catalog & Reader Implementation
- [ ] **Backend Novel Module:**
  - Create `backend/src/providers/novel/types.ts` & `anilist.ts`: Light novel metadata search and detail via AniList (`format: NOVEL`).
  - Create `backend/src/modules/novel/routes.ts` & `service.ts`: Routes for novel catalog, search, detail, and chapter retrieval.
  - Register novel routes in `backend/src/app.ts`.
- [ ] **Frontend Novel Surfaces:**
  - Create `frontend/src/app/(main)/novel/page.tsx` & `novel/[id]/page.tsx`: Novel browse and detail views.
  - Create `frontend/src/components/reader/novel-reader.tsx`: Responsive text reader with font-size controls, line height, themes (light, dark, sepia), chapter navigation, and Dexie progress saving.
  - Create `frontend/src/app/(main)/read-novel/[id]/[chapter]/page.tsx`: Novel reader route.

---

## Stage 7: Unified Discovery & Polish
- [ ] Add content-type tabs to global search (`Anime`, `Manga`, `Novels`).
- [ ] Update navigation bar to include Novels.
- [ ] Add Novel tab to History and Library pages.

---

## Stage 8: Full Regression & Verification
- [ ] Run full backend test suite (`npm test`).
- [ ] Run full frontend test suite (`npm test`).
- [ ] Typecheck both backend and frontend (`tsc --noEmit`).
- [ ] Build both backend and frontend.

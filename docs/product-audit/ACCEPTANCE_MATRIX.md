# Zenkai Feature Acceptance Matrix

**Mission:** `ZENKAI-PRODUCT-RECOVERY-01` & `ZENKAI-P0-IDENTITY-LOCK`  
**Date:** 2026-10-14  

---

## Acceptance Criteria & Status

| ID | Feature / Invariant | Priority | Expected Result | Verification Method | Status |
|---|---|---|---|---|---|
| **AC-01** | Cross-title source isolation | P0 | A search for anime A must never match or play media from anime B, sequel A2, or spinoff. | Deterministic test with similar titles ("Naruto" vs "Naruto Shippuden", "Bleach" vs "Bleach TYBW"). | **Ready for Test** |
| **AC-02** | Consumet fallback safety | P0 | If no exact candidate matches verified titles, return null; never pick `candidates[0]`. | Mocked Consumet search returning unrelated first candidate; assert empty sources. | **Ready for Test** |
| **AC-03** | Episode number preservation | P0 | Resolver must never silently substitute episode 1 for a missing or unnumbered ID. | Pass ambiguous ID; assert 400/404 rejection instead of episode 1. | **Ready for Test** |
| **AC-04** | Stale async cancellation | P0 | Rapidly switching episodes must never allow an earlier slow request to overwrite the active selection. | Test rapid episode state change; verify only current selection plays. | **Ready for Test** |
| **AC-05** | Airing gate integrity | P0 | An unreleased episode must never trigger source resolution or execution requests. | Open unreleased episode; assert 0 source requests fired and unreleased UI shown. | **Verified** |
| **AC-06** | Movie episode count | P1 | Movies and single-episode specials must show 1 episode, not 12 phantom episodes. | Query `/api/v1/anime/:id/episodes` for a Movie; assert 1 episode returned. | **Ready for Fix** |
| **AC-07** | Watchlist persistence & removal | P1 | Adding an item persists across reload; removing it clears it; state is isolated per user device. | Dexie test: add, check, remove, check empty; verify `.strict()` schema. | **Verified** |
| **AC-08** | Manga detail real chapters | P1 | Detail page displays actual available chapters from MangaDex, not synthetic 1..N. | Open MangaDetailView; assert real chapters rendered from `fetchMangaChapters`. | **Ready for Fix** |
| **AC-09** | Manga reader progress | P1 | Reading a manga chapter saves page and unit progress to IndexedDB and resumes correctly. | Dexie test: save unit/page progress, verify resumption. | **Verified** |
| **AC-10** | Novel catalog & search | P1 | Users can discover light novels with cover art, synopsis, genres, and ratings. | Browse `/novel` and search; verify AniList NOVEL format queries. | **In Progress** |
| **AC-11** | Novel chapter reading | P1 | Users can open a chapter, read formatted text, adjust font size, and navigate chapters. | Open `/read-novel/:id/:chapter`; verify text render, typography controls, prev/next. | **In Progress** |
| **AC-12** | Free-tier compliance | P0 | Zero paid services, zero cloud storage costs, bounded timeouts, local caching. | Architecture audit confirming only existing free APIs & local Dexie used. | **Verified** |
| **AC-13** | Regression test preservation | P0 | All existing backend and frontend tests must continue to pass. | Execute `npm test` across frontend and backend. | **Verified** |

# Zenkai Known Defects & Remediation Log

**Mission ID:** `ZENKAI-P0-IDENTITY-LOCK` & `ZENKAI-PRODUCT-RECOVERY-01`  
**Date:** 2026-10-14  

---

## 1. P0 Identity Defects Confirmed in Codebase

### Defect 1: Dangerous Title Substring Matching in `InProcessProvider`
- **Location:** `backend/src/providers/streaming/inprocess.provider.ts` lines 162–169
- **Root Cause:**
  ```typescript
  const close = candidates.find((c) => {
    if (!c.title) return false;
    const normalizedC = normalize(c.title);
    return normalizedC.includes(wanted) || wanted.includes(normalizedC);
  });
  ```
  `normalizedC.includes(wanted) || wanted.includes(normalizedC)` permits dangerous cross-title substitutions.
- **Impact:**
  - Searching for "Naruto" matches "Naruto Shippuden" or "Boruto: Naruto Next Generations".
  - Searching for "Bleach" matches "Bleach: Thousand-Year Blood War".
  - Searching for "Attack on Titan" matches Season 2 or Season 3.
  - Sequels, prequels, movies, and spinoffs overwrite the requested anime.
- **Required Fix:** Enforce strict exact-title matching and verified alternate title matching. Reject candidates whose titles introduce extra season, part, or franchise tokens not present in the canonical title. Key `showIdCache` by `request.anilistId` rather than a loose string.

---

### Defect 2: Unconditional Fallback to `candidates[0]` in `ConsumetProvider`
- **Location:** `backend/src/providers/streaming/consumet.provider.ts` line 80
- **Root Cause:**
  ```typescript
  return (exact ?? candidates[0]).id;
  ```
- **Impact:** If an exact match is not found, Consumet blindly selects the first search result returned by the scraper. If the wanted anime is missing on the scraper, it silently streams whatever random anime was returned first.
- **Required Fix:** Replace `(exact ?? candidates[0]).id` with verified matching. If no candidate matches verified titles, return `null`. Never fall back to `candidates[0]`.

---

### Defect 3: Synthetic Episode ID Defaults to Episode 1 in `resolveEpisodeIdentity`
- **Location:** `backend/src/modules/playback/identity.ts` lines 132–137
- **Root Cause:**
  ```typescript
  const epMatch = episodeId.match(/^(?:ep-)?(\d+)$/);
  if (epMatch) {
    anilistId = epMatch[1]!;
    episodeNumber = 1;
  }
  ```
- **Impact:** If an episode ID with no episode number suffix is passed, it silently coerces the episode number to 1, causing the user's selected episode to play Episode 1.
- **Required Fix:** Only match explicit `ep-${anilistId}-${episodeNumber}` patterns. If no episode number is present in the identifier and not in the DB, reject the resolution instead of fabricating Episode 1.

---

### Defect 4: Degraded Mode Fabricates 12 Episodes for Movies & Specials
- **Location:** `backend/src/modules/anime/episodes.ts` lines 108–125
- **Root Cause:** When database episode rows are empty, `EpisodeService.catalogue` generates `Array.from({ length: 12 }, ...)` without checking the anime format or known total episodes.
- **Impact:** A 1-episode Movie or OVA displays 12 episodes in the UI, causing episodes 2–12 to be unplayable phantom cards.
- **Required Fix:** Use `knownTotal` or query AniList format: for Movies, Specials, or OVAs with 1 episode, generate only 1 episode. For shows with known episode counts, bound by `knownTotal`.

---

### Defect 5: Stale Async Playback State in `WatchView`
- **Location:** `frontend/src/components/player/watch-view.tsx` lines 144–186
- **Root Cause:**
  1. `selectionEpoch` is defined as `${episodeCard?.id ?? ""}:${language}`. When navigating between anime, `episodeCard` is temporarily null, so the epoch does not immediately change when route `id` changes.
  2. `executePlayback` callback does not verify an attempt generation token or verify that `result.sourceId` and `episodeCard.id` still match the active selection.
  3. `<PlayerArea>` has no unique React key tied to `${id}-${episodeNumber}`, allowing DOM state to persist across navigations.
- **Impact:** Switching episodes quickly can cause an earlier, slower response to finish late and replace the newer episode's playback source, or leave the previous video playing under the new title.
- **Required Fix:** Include `id` and `episodeNumber` in `selectionEpoch`. Introduce an active playback generation token. Add `key={`${id}-${episodeNumber}`}` to PlayerArea.

---

## 2. P1 Feature Gaps Confirmed in Codebase

### Gap 1: Manga Detail Chapters Not Loaded from Backend
- **Location:** `frontend/src/components/detail/media-detail-view.tsx` line 57
- **Issue:** Uses `Array.from({ length: shownUnits }, ...)` derived from `data.totalChapters` rather than calling `fetchMangaChapters(mediaId)`.
- **Impact:** If `totalChapters` is null/0, no chapters render. Non-consecutive or fractional chapters are broken.
- **Required Fix:** Wire `MediaDetailView` to `fetchMangaChapters(mediaId)`.

### Gap 2: Manga Chapters API Fails on AniList Numeric ID
- **Location:** `backend/src/modules/manga/service.ts` line 176
- **Issue:** `getChapters(providerId)` assumes `providerId` is a MangaDex UUID. If an AniList ID is passed, it fails upstream.
- **Required Fix:** Auto-detect numeric AniList IDs in `getChapters` and bridge via `getByAnilistId`.

### Gap 3: Novel Catalog and Reader Completely Missing
- **Location:** `backend/src/providers/novel/index.ts` is empty; frontend has no novel routes.
- **Impact:** Users cannot browse or read light novels.
- **Required Fix:** Implement `NovelService`, AniList `format: NOVEL` discovery, text chapter retrieval, and responsive reader with typography controls and Dexie progress persistence.

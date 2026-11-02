# Zenkai Web — Known Architectural Limitations & Deferred Capabilities

This document tracks all discovered contract discrepancies, unimplemented backend capabilities, and deferred frontend features.

---

## 1. Discrepancies Discovered & Remediated

### 1.1 Non-existent `/api/v1/anime/:id/airing-schedule`
- **Discovery**: `src/components/schedule/airing-calendar.tsx` contained a hardcoded fetch call to `/api/v1/anime/${animeId}/airing-schedule`.
- **Actual Backend Contract**: The backend route is registered as `GET /api/v1/anime/:id/schedule` in `backend/src/modules/schedule/routes.ts`.
- **Remediation**: Corrected URL in `airing-calendar.tsx` to `/api/v1/anime/${animeId}/schedule`.

### 1.2 Unbacked `/api/v1/anime/recommended`
- **Discovery**: `src/hooks/recommendations/use-recommendations.ts` attempted to fetch `/api/v1/anime/recommended?source=${source}`.
- **Actual Backend Contract**: The backend has no recommendation route. Recommendations are only exposed via canonical franchise relations (`/api/v1/anime/:id/relations`) or discovery ranking buckets (`/api/v1/anime/trending`).
- **Remediation**: Marked `useRecommendations` as deprecated/unverified; disabled execution; verified that production detail pages (`AnimeDetailView`) do not call this endpoint.

### 1.3 Unexposed User Settings Route (`/api/v1/auth/settings`)
- **Discovery**: `src/lib/api/auth.ts` defined `fetchUserSettings` and `updateUserSettings` calling `/api/v1/auth/settings`.
- **Actual Backend Contract**: While the database table `users` contains an encrypted `settings` column, and the repository supports AES-256-CBC encryption, Fastify has no route handler registered for `/api/v1/auth/settings`.
- **Remediation**: Documented in `src/lib/api/auth.ts`. Confirmed that device preferences (`cardDensity`, `readerLayout`, `motionPreference`) are intentionally persisted locally on each device via `localStorage` (`src/lib/preferences.ts`), preventing unwanted cross-device display leakage.

---

## 2. Currently Deferred Features (Require Backend Implementation)

1. **User Reviews and Comments**:
   - *Status*: Tables `reviews`, `comments`, and `comment_likes` exist in Drizzle schema (`backend/src/db/schema/comments.ts`), but no services, repositories, or Fastify routes exist.
   - *Rule*: Frontend must not implement review creation or comment threads until backend routes (`/api/v1/reviews/*`, `/api/v1/comments/*`) are developed, tested, and exposed.
2. **Community Skip Timing Submission & Reporting UI**:
   - *Status*: Backend routes `POST /api/v1/episodes/:episodeId/skip-timing` and `POST /api/v1/skip-timing/:timingId/report` are fully functional and tested.
   - *Deferred*: UI submission modals and reporting buttons are deferred until a dedicated UX workflow is designed.
3. **Machine-Learned Content Recommendations**:
   - *Status*: No recommendation engine exists on backend.
   - *Rule*: Frontend renders `recommendations: []` as empty; section is hidden on detail pages.

---

## 3. Frontend-Only Capabilities (Genuinely Supported Locally)

1. **Guest Offline Library & Progress**:
   - Managed completely inside browser IndexedDB via Dexie.js. Does not require server persistence or network access.
2. **Device Display Preferences**:
   - Card density (`comfortable` vs `compact`), reader layout (`rtl`, `ltr`, `vertical`), and motion preference (`system`, `reduced`, `full`) are stored in `localStorage` and never synchronized to the server, preserving device-specific ergonomic settings.

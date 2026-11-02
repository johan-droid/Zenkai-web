# Zenkai Integration Implementation Plan

**Objective:** Integrate verified capabilities from the external Zenkai API (`https://zenkaii.pages.dev`), address capability gaps identified in the analysis, and deliver production-quality end-to-end media engineering.

---

## Phase 1: Backend Streaming Provider Adapter (`ZenkaiStreamingProvider`)
1. Create `backend/src/providers/streaming/zenkai.provider.ts`:
   - Implement `StreamingProvider` interface.
   - Connect to `https://zenkaii.pages.dev/api/servers` and `/api/stream` using `zenkaiShield` or embed headers.
   - Support `megaplay`, `vidstream`, `flixcloud`, and `acdn` (AnimeSalt).
   - Extract direct HLS streams, ASS/SRT/VTT subtitles, intro/outro skip timings, and multi-audio flags.
   - Handle timeouts (8s budget), upstream rate limits, and fallback cleanly.
2. Register `ZenkaiStreamingProvider` in `backend/src/providers/streaming/registry.ts`:
   - Priority 15 (between NovusCloud and in-process scrapers).
   - Enable by default with config flag `ZENKAI_STREAMING_ENABLED`.

## Phase 2: Regional Audio & Multi-Audio Track Extensions
1. Update playback contracts in `backend/src/modules/playback/contract.ts` and `backend/src/providers/streaming/types.ts`:
   - Define `AudioTrackDetail`: `{ code: string; name: string; type: AudioTrack; isDefault?: boolean; providerTrackId?: string }`.
   - Add optional `audioTracks?: AudioTrackDetail[]` to `PlaybackSource` and `PlaybackPlan`.
   - Add `availableAudioLanguages?: AudioTrackDetail[]` to `playbackSourcesResponseSchema`.
2. Enhance `backend/src/modules/playback/service.ts`:
   - Compute available audio tracks across eligible plans and sources.
   - Normalize language codes using standard BCP-47 identifiers (`ja`, `en`, `hi`, `es`, `pt`, etc.).
   - Support language-aware source selection and failover.
3. Update frontend API client (`frontend/src/lib/api/zenkai.ts`) & player:
   - Add `AudioTrackDetail` schema and fields to `PlaybackSource` / `PlaybackPlan`.
   - Update player store (`frontend/src/stores/player.ts`) to track `preferredAudioLanguage` (e.g. "ja" vs "en" vs "hi").
   - Update player controls to display available audio tracks and switch seamlessly.

## Phase 3: Subtitle Discovery Integration
1. Enhance `backend/src/modules/playback/metadata.ts`:
   - Connect to `https://zenkaii.pages.dev/api/subtitles?id={anilistId}&ep={episode}` using `zenkaiShield`.
   - Normalize OpenSubtitles records into canonical `SubtitleTrack` shape with BCP-47 language codes and descriptive labels.
   - Merge and deduplicate with stream-extracted subtitles.
   - Relay external subtitles securely via `/api/v1/playback/subtitle` to prevent browser CORS issues.

## Phase 4: Playback Issue Reporting Subsystem
1. Database Schema:
   - Create `backend/src/db/schema/playback_reports.ts` with `playbackIssueReports` table.
   - Fields: `id`, `episodeId`, `providerSlug`, `sourceId`, `issueCategory`, `playbackTimestampSeconds`, `audioLanguage`, `subtitleLanguage`, `userDescription`, `ipHash`, `createdAt`.
   - Strict constraints and indexes on `episode_id` and `created_at`.
   - Export in `backend/src/db/schema/index.ts`.
2. Route & Service Layer:
   - Create `POST /api/v1/playback/issues` in `backend/src/modules/playback/routes.ts`.
   - Request validation with Zod (`issueCategoryEnum`, `playbackTimestampSeconds`, `audioLanguage`, `userDescription`).
   - Rate limiting: max 5 reports per 15 minutes per IP hash.
   - Duplicate deduplication: same episode + issue category within 5 minutes.
3. Frontend Integration:
   - Add `reportPlaybackIssue` function to `frontend/src/lib/api/zenkai.ts`.
   - Add "Report Issue" button and modal dialog in video player overlay (`frontend/src/components/player/issue-report-modal.tsx`).
   - Automatically pre-populate episode ID, current server, audio track, and timestamp.

## Phase 5: Filler & Canon Episode Identity Enrichment
1. Create `backend/src/providers/metadata/filler.ts`:
   - Query `https://zenkaii.pages.dev/api/filler?t={title}` with timeout and cache.
   - Map episode numbers to `isFiller = true` and `canonType = "filler" | "mixed" | "canon"`.
2. Integrate in `backend/src/modules/anime/service.ts`:
   - Enrich episode listings with verified filler flags when canonical catalogue lists are requested.

## Phase 6: Verification, Testing & Documentation
1. Run backend unit and integration test suites:
   - Test `ZenkaiStreamingProvider` adapter.
   - Test `AudioTrackDetail` serialization and contract validation.
   - Test `POST /api/v1/playback/issues` route, rate limiting, and duplicate prevention.
   - Test subtitle discovery and deduplication.
2. Run frontend test suites:
   - Validate updated `zenkai.ts` API contracts and schemas.
   - Test issue reporting client calls and audio track selectors.
3. Update documentation in `docs/integrations/`.

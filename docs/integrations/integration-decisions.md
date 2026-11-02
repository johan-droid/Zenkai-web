# Zenkai Architectural Integration Decisions

**Date:** November 2026  
**Status:** Approved & Implemented  
**Scope:** Media, Playback, Subtitles, Regional Audio, Reporting, and Metadata Enrichment  

---

## Decision 1: Dedicated Provider Adapter for External Streaming API (`zenkai-api`)

### Context
`https://zenkaii.pages.dev/api` exposes `/api/servers` and `/api/stream` returning direct HLS master playlists (MegaPlay, Vidstream, FlixCloud) and embed targets (ACDN / AnimeSalt). Previously, the backend only supported NovusCloud (`cdn.4animo.xyz`), HiAnime embeds, and Consumet scrapers.

### Decision
Create `ZenkaiApiStreamingProvider` in `backend/src/providers/streaming/zenkai.provider.ts` and register it in `registry.ts` with priority 12.
- The adapter communicates with `https://zenkaii.pages.dev/api` using `ZenkaiShieldManager` headers (`x-zenkai-shield`) and `X-Zenkai-Embed: 1`.
- Raw HLS stream URLs are unwrapped from external proxies and delivered with appropriate referers (`https://megaplay.buzz/`, `https://flixcloud.cc/`).
- Stream intro and outro markers are captured and stored in memory for `getSkipMarkers()` resolution.
- Multi-audio playback is resolved directly via AnimeSalt embed iframe (`https://ravok.buzz/video/...`) or multi-stream HLS playlists.

### Consequences
- Resilient source resolution with genuine Full HD HLS and ASS/SRT subtitles.
- No scraper scraping fragility on the critical path.

---

## Decision 2: Regional Audio and Language Representation

### Context
The previous playback schema only defined coarse `AudioTrack = "sub" | "dub" | "multi"`. There was no mechanism to specify regional audio languages (Japanese, English, Hindi, Spanish, Portuguese, etc.) or track availability.

### Decision
Extend the playback contract in a backward-compatible manner:
- Keep `language: AudioTrack` (`"sub" | "dub" | "multi"`).
- Introduce `AudioTrackDetail`:
  ```ts
  export interface AudioTrackDetail {
    code: string; // BCP-47 identifier e.g. "ja", "en", "hi", "es", "pt"
    name: string; // "Japanese", "English", "Hindi", "Spanish", "Portuguese"
    type: AudioTrack; // "sub" | "dub" | "multi"
    isDefault?: boolean;
    providerTrackId?: string;
  }
  ```
- Expose `availableAudioLanguages: AudioTrackDetail[]` in `GET /api/v1/episodes/:episodeId/sources` and plans.
- Add `preferredAudioLanguage` to frontend player store with local persistence.

---

## Decision 3: Subtitle Discovery Integration via OpenSubtitles

### Context
`https://zenkaii.pages.dev/api/subtitles?id={anilistId}&ep={episode}` exposes 30+ regional languages in VTT format sourced from OpenSubtitles. Previously, Zenkai only served embedded stream subtitles.

### Decision
In `backend/src/modules/playback/metadata.ts`, integrate OpenSubtitles fetching into `#collectSubtitles(request)`.
- Ephemeral URLs are relayed or fetched cross-origin securely.
- Descriptors (`language`, `kind`) are persisted in `episode_playback_meta` without storing transient URLs or credentials.

---

## Decision 4: Playback Issue Reporting Subsystem

### Context
Users had no channel to report dead streams, desynced audio, missing subtitles, or buffering defects. `skip_timing_reports` was exclusively designed for skip marker corrections.

### Decision
Implement end-to-end playback issue reporting:
- **Database Table:** `playback_issue_reports` in `backend/src/db/schema/playback_reports.ts`.
- **Backend Route:** `POST /api/v1/playback/issues` and observability summary `GET /api/v1/playback/issues/summary`.
- **Security & Privacy:** Store SHA-256 hash of client IP for rate limiting; never store raw IP, signed stream URLs, or session credentials.
- **Abuse Prevention:** Rate limit to 5 submissions per 15 minutes per IP. Automatically deduplicate identical reports submitted within 5 minutes.
- **Frontend Integration:** Add `IssueReportModal` component and "Report" button in player toolbar.

---

## Decision 5: Filler & Canon Metadata Classification

### Context
`https://zenkaii.pages.dev/api/filler?t={title}` provides canonical lists of filler and mixed-canon episode numbers for long-running shows (e.g. One Piece, Naruto, Bleach).

### Decision
Implement `FillerClassifier` in `backend/src/providers/metadata/filler.ts`:
- Fetch and cache filler lists in memory for 24 hours.
- Enrich `EpisodeCard` with `isFiller: boolean` and `canonType: "canon" | "filler" | "mixed"`.

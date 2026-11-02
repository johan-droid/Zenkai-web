# Zenkai Capability Gap Analysis

**Date:** November 2026  
**Baseline Repository:** `johan-droid/Zenkai-web` (main branch)  
**External API:** `https://zenkaii.pages.dev` and associated metadata proxies  

---

## 1. Capability Matrix

| Capability | External API Support | Current Zenkai Implementation | Classification | Action Required |
|---|---|---|---|---|
| **Streaming Sources (MegaPlay, Vidstream, FlixCloud, ACDN)** | High (HLS 1080p, ASS/SRT subtitles, skip markers) | Partial (NovusCloud 4animo, HiAnime embeds, Consumet, static templates) | **PARTIAL** | Implement dedicated `ZenkaiApiStreamingProvider` adapter in backend provider registry. |
| **Regional Audio & Multi-Audio** | High (`sub`, `dub`, `multi` audio modes + multi-lingual OpenSubtitles) | Partial (`AudioTrack = "sub" \| "dub" \| "multi"` with no regional language codes) | **PARTIAL** | Extend playback contract with `audioTracks` (BCP-47 code, display name, type, default, providerTrackId). Add frontend language picker. |
| **Subtitle Discovery (OpenSubtitles)** | High (`/api/subtitles` exposes 30+ regional languages in VTT format) | Partial (Only static/NovusCloud subtitles resolved) | **PARTIAL** | Integrate `/api/subtitles` into playback metadata pipeline so all regional subtitles are available. |
| **Skip Intro & Outro Markers** | High (Stream response carries `intro` and `outro` timestamps) | Partial (NovusCloud extraction + community skip timings) | **PARTIAL** | Enrich `episode_playback_meta` from stream resolution intro/outro timestamps. |
| **Filler & Canon Episode Identity** | High (`/api/filler?t={title}` returns exact filler and mixed episode numbers) | Partial (`isFiller` and `canonType` columns exist in DB but lack dynamic enrichment) | **PARTIAL** | Integrate `/api/filler` into episode catalogue sync. |
| **Playback Issue Reporting** | Absent (External API has no reporting endpoint) | Missing (Only `skip_timing_reports` existed for skip markers) | **MISSING** | Create `playback_issue_reports` table, backend route `POST /api/v1/playback/issues`, rate limiting, and player UI reporting control. |
| **External ID Mapping (ARM / AniBridge / TMDB)** | High (`/api/tmdb` maps AniList to TMDB, MAL, TVDB, IMDB, AniDB) | Partial (Local database `external_ids` table exists but needs automated lookup) | **PARTIAL** | Integrate ARM / AniBridge mapping resolver for TMDB & IMDB IDs. |
| **Movie & Television Discovery** | High (TMDB trending movies feed + movie embed players) | Partial (Only anime movies with `format="MOVIE"` in catalogue) | **PARTIAL** | Expose movies discovery shelf and movie stream resolution. |
| **Light Novel Discovery & Reading** | High (`/api/novel/*` endpoints with rankings, search, detail, chapters) | Implemented (`NovelProvider` with Zenkai Shield + resilient fallbacks) | **IMPLEMENTED** | Ensure parameter name compatibility and resilient chapter text delivery. |
| **Manga Reading & Page Delivery** | High (MangaDex integration + signed page delivery) | Implemented (`MangaProvider` with MangaDex + fallback) | **IMPLEMENTED** | Maintain cache headers and reading direction preferences. |

---

## 2. Detailed Gap Breakdown & Architectural Decisions

### 2.1 Streaming Provider: Zenkai API Streaming Adapter
- **External API:** Provides `/api/servers` and `/api/stream` returning direct HLS master playlists for MegaPlay, Vidstream, FlixCloud, and embed targets for ACDN / AnimeSalt.
- **Current Zenkai:** Uses NovusCloud (`cdn.4animo.xyz`) and static templates. If NovusCloud is slow or rate-limited, fallback options were limited to embeds.
- **Decision:** Implement `ZenkaiStreamingProvider` adhering to `StreamingProvider` interface in `backend/src/providers/streaming/zenkai.provider.ts`. Register it in `registry.ts` with priority 15 (between NovusCloud and in-process scrapers). The adapter will query `/api/servers` and `/api/stream` with `x-zenkai-shield` or embed authorization headers, and return ranked HLS/embed sources.

### 2.2 Regional Audio & Multi-Audio
- **External API:** Provides multi-audio flag and distinct audio track streams (`sub`, `dub`, `multi`).
- **Current Zenkai:** `AudioTrack` is restricted to `"sub" | "dub" | "multi"`. The client cannot distinguish between English dub, Hindi dub, Spanish dub, or original Japanese audio.
- **Decision:** Backward-compatible contract expansion:
  - Keep `language: AudioTrack` (`"sub" | "dub" | "multi"`).
  - Add `audioTracks: Array<{ code: string; name: string; type: AudioTrack; isDefault?: boolean }>` to `PlaybackSource`, `PlaybackPlan`, and `playbackSourcesResponseSchema`.
  - Add frontend audio language selector in the player settings menu with persistence in player store.

### 2.3 Subtitle Discovery Pipeline
- **External API:** Exposes `/api/subtitles?id={anilistId}&ep={episode}` returning dozens of verified subtitles from OpenSubtitles with ISO/BCP-47 codes.
- **Current Zenkai:** `metadata.ts` only resolves subtitles embedded in the stream or registered manually.
- **Decision:** In `backend/src/modules/playback/metadata.ts`, query `/api/subtitles` during episode metadata resolution, merge them with stream subtitles, and deduplicate by language code.

### 2.4 Playback Issue Reporting
- **Current Zenkai:** The codebase has `skipTimingReports` for skip timing markers, but NO mechanism for users to report broken video streams, audio desync, missing subtitles, or dead servers.
- **Decision:** Implement end-to-end playback issue reporting:
  - Database table: `playback_issue_reports` in `backend/src/db/schema/playback_reports.ts`.
  - Columns: `id`, `episodeId`, `providerSlug`, `sourceId`, `issueCategory` (`dead_stream`, `audio_desync`, `wrong_episode`, `buffering`, `subtitles_missing`, `other`), `playbackTimestampSeconds`, `audioLanguage`, `subtitleLanguage`, `userDescription`, `clientInfo`, `createdAt`.
  - Never store signed URLs, session secrets, or tokens.
  - Route: `POST /api/v1/playback/issues` with IP-based rate limiting (max 5 reports per 15 minutes per IP).
  - Frontend: Add a "Report Issue" action in player controls that pre-fills episode, server, audio, and current playback time.

### 2.5 Long-Running Anime Episode Identity & Filler Tagging
- **External API:** `/api/filler?t={title}` provides canonical filler and mixed episode numbers.
- **Current Zenkai:** `episodes` table has `isFiller` and `canonType` columns, but they remain default false when AniList metadata does not specify them.
- **Decision:** Create a filler service helper that enriches episode cards using `/api/filler` data.

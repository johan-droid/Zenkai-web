# Zenkai Web — Feature Capability & Feasibility Matrix

This matrix establishes the verified relationship between backend capabilities, API contracts, and frontend features in Zenkai. Every feature has a clear, non-negotiable decision based on verified source implementation.

---

## 1. Feature Feasibility Decision Matrix

| Potential UI Feature | Required Backend Capability | Verified API / Source | Decision | Scope & Limitations |
|---|---|---|---|---|
| **Anime Catalogue & Shelves** | Aggregated home shelf and paginated catalogue APIs | `GET /api/v1/home`<br>`GET /api/v1/anime` | `IMPLEMENT` | Fully supported. Shelves handle partial degradation per section. |
| **Title Search** | Dedicated title search with ranked fuzzy matching | `GET /api/v1/anime/search`<br>`GET /api/v1/manga/search`<br>`GET /api/v1/novel/search` | `IMPLEMENT` | Fully supported across anime, manga, and light novels. |
| **Anime Details & Metadata** | Detail endpoint returning titles, description, score, season, airing | `GET /api/v1/anime/:id` | `IMPLEMENT` | Fully supported (28 metadata fields). |
| **Episode Catalogue** | Episode list endpoint with airing status and fillers | `GET /api/v1/anime/:id/episodes` | `IMPLEMENT` | Fully supported with client-side chunking (50 episodes/chunk). |
| **Media Relations** | Related franchises (prequel, sequel, spin-off) | `GET /api/v1/anime/:id/relations`<br>`GET /api/v1/manga/:id/relations` | `IMPLEMENT` | Fully supported. Displayed in horizontal carousel on detail page. |
| **Video Playback (Direct Streams)** | Source resolution and execution gateway for direct HLS | `GET /api/v1/episodes/:id/sources`<br>`POST /api/v1/playback/execute` | `IMPLEMENT` | Fully supported via Vidstack HTML5 video player. |
| **Video Playback (Embed Streams)** | Sandboxed iframe plan execution | `POST /api/v1/playback/execute` | `IMPLEMENT_WITH_LIMITATIONS` | Supported inside sandboxed `<iframe>` (`EmbedPlayer`). Custom video player controls cannot overlay external iframes due to browser security models. |
| **Dynamic Server Switching** | Probe server availability and fallback sequentially | `GET /api/v1/episodes/:id/servers` | `IMPLEMENT` | Fully supported. User preference persisted in `usePlayerStore`. |
| **Skip Markers (Intro/Outro)** | Subtitle and skip metadata timings | `GET /api/v1/episodes/:id/metadata` | `IMPLEMENT` | Fully supported for intro and outro markers. |
| **Community Skip Submissions** | Submit and report community skip timings | `POST /api/v1/episodes/:id/skip-timing`<br>`POST /api/v1/skip-timing/:timingId/report` | `DEFER` | Backend routes exist, but UI submission modals and voting controls are not yet designed in the frontend design system. |
| **Airing Schedule Horizons** | Synced airing schedule across today, week, month, season | `GET /api/v1/schedule/*` | `IMPLEMENT` | Fully supported with timezone-aware calendar views. |
| **Offline Library & History** | Client-side persistent storage | Dexie.js (IndexedDB) | `FRONTEND_ONLY` | Fully supported locally for guest users without requiring account login. |
| **Cloud Library & Progress Sync** | Authenticated user library and watch progress persistence | `GET /api/v1/user/library`<br>`PUT /api/v1/user/library/:kind/:mediaId`<br>`POST /api/v1/user/sync` | `IMPLEMENT` | Fully supported with Last-Write-Wins (LWW) conflict resolution. |
| **Manga Reading Engine** | Chapter feeds, latest chapter shortcut, signed page images | `GET /api/v1/manga/:id/chapters`<br>`GET /api/v1/manga/chapters/:chapterId/pages` | `IMPLEMENT` | Fully supported. Signed images served with `Cache-Control: no-store`. |
| **Novel Reading Engine** | Multi-source chapter feed and sanitized text reader | `GET /api/v1/novel/:id/chapters`<br>`GET /api/v1/novel/:id/chapters/:chapter` | `IMPLEMENT` | Fully supported with clean typography and chapter pagination. |
| **Device Display Preferences** | Card density (comfort/compact), reader layout, motion | `localStorage` | `FRONTEND_ONLY` | Intentionally device-specific. Does NOT sync across devices to preserve device-specific ergonomics. |
| **Recommendations (Detail View)** | Machine learning or similarity recommendation engine | None exposed in backend contract | `DEFER` | **Unsupported by backend**: Anime detail schema returns `recommendations: []`. The UI correctly hides this section instead of generating fake recommendations. |
| **Character Voice Actors** | Character and staff cast database | None exposed in backend contract | `DEFER` | **Unsupported by backend**: Anime detail schema returns `characters: []`. Section hidden when empty. |
| **User Reviews & Comments** | User review creation, comment threads, upvoting | Postgres tables exist (`reviews`, `comments`), but NO routes exist | `DEFER` | **Unsupported by backend**: Database schema has tables, but no Fastify routes, controllers, or services are implemented. |
| **Push Notifications** | Web push service worker notifications | No push server/vapid keys configured | `REJECT` | Out of current product scope. |

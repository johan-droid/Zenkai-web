# Zenkai Web — API Contract Ownership & Verification Registry

## 1. Overview & Verification Legend

Every API endpoint is classified by its ownership, operational contract, and verification status:
- **VERIFIED_FROM_BOTH**: Confirmed from both backend source code and runtime test execution.
- **VERIFIED_FROM_SOURCE**: Confirmed from backend route handlers and controller implementations.
- **DOCUMENTED_ONLY**: Described in planning documents but not implemented in code.
- **UNAVAILABLE**: Deprecated, non-existent, or pending backend development.

---

## 2. API Contract Ownership Inventory

### 2.1 System & Observability
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/health` | VERIFIED_FROM_BOTH | Backend | Monitoring & Health Checks |
| `GET` | `/api/v1/health` | VERIFIED_FROM_BOTH | Backend | Minimal Public Health Checks |
| `GET` | `/api/v1/providers/health` | VERIFIED_FROM_BOTH | Backend | Observability Dashboard |
| `POST` | `/api/v1/providers/reset` | VERIFIED_FROM_BOTH | Backend | Admin Provider Quarantine Reset |
| `GET` | `/api/v1/proxy` | VERIFIED_FROM_BOTH | Backend | Media & Image Proxy (`MangaReader`) |
| `GET` | `/api/v1/providers` | VERIFIED_FROM_BOTH | Backend | Reader Provider Status |
| `GET` | `/api/v1/providers/manga` | VERIFIED_FROM_BOTH | Backend | Manga Provider Status |
| `GET` | `/api/v1/providers/novel` | VERIFIED_FROM_BOTH | Backend | Novel Provider Status |

### 2.2 Authentication & User Identity
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | VERIFIED_FROM_BOTH | Backend | `register()` in `lib/api/auth.ts` |
| `POST` | `/api/v1/auth/login` | VERIFIED_FROM_BOTH | Backend | `login()` in `lib/api/auth.ts` |
| `POST` | `/api/v1/auth/logout` | VERIFIED_FROM_BOTH | Backend | `logout()` in `lib/api/auth.ts` |
| `GET` | `/api/v1/auth/me` | VERIFIED_FROM_BOTH | Backend | `fetchCurrentUser()` in `lib/api/auth.ts` |
| `GET` | `/api/v1/auth/check-username` | VERIFIED_FROM_BOTH | Backend | `checkUsernameAvailability()` in `lib/api/auth.ts` |
| `PATCH` | `/api/v1/auth/profile` | VERIFIED_FROM_BOTH | Backend | `updateUserProfile()` in `lib/api/auth.ts` |
| `GET` | `/api/v1/users/:username` | VERIFIED_FROM_BOTH | Backend | `fetchPublicProfile()` in `lib/api/auth.ts` |

### 2.3 User Library & Watch Progress
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/user/library` | VERIFIED_FROM_BOTH | Backend | `fetchRemoteLibrary()` in `lib/api/auth.ts` |
| `PUT` | `/api/v1/user/library/:kind/:mediaId` | VERIFIED_FROM_BOTH | Backend | `putLibraryEntry()` in `lib/api/auth.ts` |
| `DELETE` | `/api/v1/user/library/:kind/:mediaId` | VERIFIED_FROM_BOTH | Backend | `deleteLibraryEntry()` in `lib/api/auth.ts` |
| `POST` | `/api/v1/user/library/batch` | VERIFIED_FROM_BOTH | Backend | `batchSyncLibrary()` in `lib/api/auth.ts` |
| `GET` | `/api/v1/user/progress` | VERIFIED_FROM_BOTH | Backend | `fetchRemoteProgress()` in `lib/api/auth.ts` |
| `GET` | `/api/v1/user/continue` | VERIFIED_FROM_BOTH | Backend | `fetchContinueRail()` in `lib/api/auth.ts` |
| `PUT` | `/api/v1/user/progress/:kind/:mediaId/:unit` | VERIFIED_FROM_BOTH | Backend | `putProgressEntry()` in `lib/api/auth.ts` |
| `DELETE` | `/api/v1/user/progress/:kind/:mediaId` | VERIFIED_FROM_BOTH | Backend | `clearMediaProgress()` in `lib/api/auth.ts` |
| `DELETE` | `/api/v1/user/progress` | VERIFIED_FROM_BOTH | Backend | `clearAllProgress()` in `lib/api/auth.ts` |
| `POST` | `/api/v1/user/sync` | VERIFIED_FROM_BOTH | Backend | `syncAllUserData()` in `lib/api/auth.ts` |

### 2.4 Anime Discovery & Catalogue
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/home` | VERIFIED_FROM_BOTH | Backend | `fetchHome()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/genres` | VERIFIED_FROM_BOTH | Backend | `fetchGenres()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime` | VERIFIED_FROM_BOTH | Backend | `fetchAnimeBrowse()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/search` | VERIFIED_FROM_BOTH | Backend | `fetchAnimeSearch()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/trending` | VERIFIED_FROM_BOTH | Backend | `fetchTrending()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/popular` | VERIFIED_FROM_BOTH | Backend | `fetchPopular()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/seasonal` | VERIFIED_FROM_BOTH | Backend | `fetchSeasonal()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/top` | VERIFIED_FROM_BOTH | Backend | `fetchTopRated()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/recent` | VERIFIED_FROM_BOTH | Backend | `fetchRecent()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/recently-updated`| VERIFIED_FROM_BOTH | Backend | `fetchRecentlyUpdated()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/discovery/:bucket` | VERIFIED_FROM_BOTH | Backend | `fetchDiscoveryBucket()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/:id` | VERIFIED_FROM_BOTH | Backend | `fetchAnimeDetail()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/:id/relations` | VERIFIED_FROM_BOTH | Backend | `fetchAnimeRelations()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/:id/episodes` | VERIFIED_FROM_BOTH | Backend | `fetchAnimeEpisodes()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/:id/episodes/:number` | VERIFIED_FROM_BOTH | Backend | `fetchEpisodeByNumber()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/anime/:id/episodes-next` | VERIFIED_FROM_BOTH | Backend | Next episode to air resolution |
| `GET` | `/api/v1/anime/:id/episodes/:number/navigation` | VERIFIED_FROM_BOTH | Backend | `fetchEpisodeNavigation()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/episodes/:id` | VERIFIED_FROM_BOTH | Backend | Episode by local UUID |

### 2.5 Playback & Streaming
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/episodes/:episodeId/sources` | VERIFIED_FROM_BOTH | Backend | `fetchEpisodeSources()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/episodes/:episodeId/servers` | VERIFIED_FROM_BOTH | Backend | `fetchEpisodeServers()` in `lib/api/zenkai.ts` |
| `POST` | `/api/v1/playback/execute` | VERIFIED_FROM_BOTH | Backend | `executePlayback()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/episodes/:episodeId/metadata` | VERIFIED_FROM_BOTH | Backend | `fetchEpisodeMetadata()` in `lib/api/zenkai.ts` |
| `POST` | `/api/v1/episodes/:episodeId/skip-timing` | VERIFIED_FROM_SOURCE | Backend | [Deferred UI Integration] |
| `POST` | `/api/v1/skip-timing/:timingId/report` | VERIFIED_FROM_SOURCE | Backend | [Deferred UI Integration] |
| `GET` | `/api/v1/playback/providers` | VERIFIED_FROM_BOTH | Backend | Provider monitor |
| `POST` | `/api/v1/playback/providers/check` | VERIFIED_FROM_SOURCE | Backend | Provider check trigger |
| `GET` | `/api/v1/playback/manifest` | VERIFIED_FROM_BOTH | Backend | HLS media/manifest relay |
| `GET` | `/api/v1/playback/subtitle` | VERIFIED_FROM_BOTH | Backend | Subtitle relay |

### 2.6 Manga Catalogue & Reader
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/manga` | VERIFIED_FROM_BOTH | Backend | `fetchMangaCatalogue()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/manga/search` | VERIFIED_FROM_BOTH | Backend | `fetchMangaSearch()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/manga/:id` | VERIFIED_FROM_BOTH | Backend | `fetchMangaDetail()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/manga/:id/relations` | VERIFIED_FROM_BOTH | Backend | Manga relations |
| `GET` | `/api/v1/manga/:id/chapters` | VERIFIED_FROM_BOTH | Backend | `fetchMangaChapters()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/manga/:id/latest` | VERIFIED_FROM_BOTH | Backend | Latest chapter shortcut |
| `GET` | `/api/v1/manga/chapters/:chapterId` | VERIFIED_FROM_BOTH | Backend | Single chapter metadata |
| `GET` | `/api/v1/manga/chapters/:chapterId/pages` | VERIFIED_FROM_BOTH | Backend | `fetchMangaPages()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/manga/by-anilist/:anilistId` | VERIFIED_FROM_BOTH | Backend | Cross-reference resolver |
| `GET` | `/api/v1/manga/genres` | VERIFIED_FROM_BOTH | Backend | Manga genre chips |

### 2.7 Novel Catalogue & Reader
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/novel` | VERIFIED_FROM_BOTH | Backend | `fetchNovelBrowse()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/novel/search` | VERIFIED_FROM_BOTH | Backend | `fetchNovelSearch()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/novel/:id` | VERIFIED_FROM_BOTH | Backend | `fetchNovelDetail()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/novel/:id/chapters` | VERIFIED_FROM_BOTH | Backend | `fetchNovelChapters()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/novel/:id/chapters/:chapter` | VERIFIED_FROM_BOTH | Backend | `fetchNovelChapterContent()` in `lib/api/zenkai.ts` |

### 2.8 Schedule
| Method | Endpoint | Verification | Owner | Frontend Consumer |
|---|---|---|---|---|
| `GET` | `/api/v1/schedule` | VERIFIED_FROM_BOTH | Backend | `fetchScheduleWindow()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/schedule/today` | VERIFIED_FROM_BOTH | Backend | `fetchScheduleToday()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/schedule/week` | VERIFIED_FROM_BOTH | Backend | `fetchScheduleWeek()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/schedule/month` | VERIFIED_FROM_BOTH | Backend | `fetchScheduleMonth()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/schedule/season` | VERIFIED_FROM_BOTH | Backend | `fetchScheduleSeason()` in `lib/api/zenkai.ts` |
| `GET` | `/api/v1/schedule/next` | VERIFIED_FROM_BOTH | Backend | Nearest upcoming episode slot |
| `GET` | `/api/v1/schedule/upcoming` | VERIFIED_FROM_BOTH | Backend | Upcoming episodes list |
| `GET` | `/api/v1/schedule/recent` | VERIFIED_FROM_BOTH | Backend | Recently aired list |
| `GET` | `/api/v1/anime/:id/schedule` | VERIFIED_FROM_BOTH | Backend | `AiringCalendar` / Schedule for title |
| `POST` | `/api/v1/schedule/sync/:id` | VERIFIED_FROM_SOURCE | Backend | Force sync schedule |

# Zenkai Web — Frontend Architecture & Component Guide

## 1. Directory Structure

```
frontend/src/
├── app/
│   ├── (main)/
│   │   ├── layout.tsx              # Main application shell (Navbar, MobileNav, Footer)
│   │   ├── page.tsx                # Home page (Hero, Shelves, Continue watching)
│   │   ├── anime/
│   │   │   ├── page.tsx            # Anime browse with genre, format, status filters
│   │   │   └── [id]/page.tsx       # Anime detail, relations, episodes chunking
│   │   ├── watch/[id]/[ep]/
│   │   │   └── page.tsx            # WatchView: Vidstack/Embed video player & server selection
│   │   ├── manga/
│   │   │   ├── page.tsx            # Manga browse & filters
│   │   │   └── [id]/page.tsx       # Manga detail & chapter feed
│   │   ├── read/[id]/[chapter]/
│   │   │   └── page.tsx            # MangaReader: multi-layout webtoon/manga reader
│   │   ├── novel/
│   │   │   ├── page.tsx            # Novel browse & multi-source selection
│   │   │   └── [id]/page.tsx       # Novel detail & chapter listings
│   │   ├── read-novel/[id]/[chapter]/
│   │   │   └── page.tsx            # NovelReader: typography & chapter paginator
│   │   ├── schedule/
│   │   │   └── page.tsx            # TimelineView: calendar horizons (today, week, month, season)
│   │   ├── search/
│   │   │   └── page.tsx            # Unified search across anime, manga, and novel
│   │   ├── library/
│   │   │   └── page.tsx            # Local & cloud library management
│   │   ├── history/
│   │   │   └── page.tsx            # Watch & read history view
│   │   ├── settings/
│   │   │   └── page.tsx            # Preferences, device settings, account & backup
│   │   └── user/[username]/
│   │       └── page.tsx            # Public profile view & edit modal
│   ├── globals.css                 # CSS variables, tokens, clamp scales, animations
│   └── layout.tsx                  # Root layout, viewport-fit=cover, theme provider
├── components/
│   ├── browse/                     # Infinite scroll browse grids and dropdown menus
│   ├── cards/                      # MediaCard (comfort/compact), MediaGrid, skeleton loaders
│   ├── common/                     # EmptyState, error boundaries, badge indicators
│   ├── detail/                     # DetailLayout, AnimeDetailView, MangaDetailView
│   ├── home/                       # HeroCarousel, ContinueRow, MediaRow, GenreChips
│   ├── layout/                     # Navbar, MobileNav, Brand, Footer, PageHeader
│   ├── player/                     # VideoPlayer, EmbedPlayer, QualityMenu, ServerSelectionPanel
│   ├── providers/                  # QueryProvider, AuthProvider, PWAProvider, ThemeProvider
│   ├── reader/                     # MangaReader, NovelReader, chapter navigation
│   ├── schedule/                   # TimelineView, HorizonSwitcher, ScheduleHeader
│   ├── search/                     # SearchView, search inputs, result grids
│   ├── settings/                   # PreferencesPanel, auth modals, export/import forms
│   └── ui/                         # Primitives: Button, Dialog, Sheet, Command, Input, Tabs
├── config/                         # site.ts, api-list.ts
├── hooks/                          # Custom hooks for home, search, progress, airing, debounce
├── lib/
│   ├── api/
│   │   ├── http.ts                 # Base HTTP transport, retry logic, timeout, backoff
│   │   ├── auth.ts                 # Auth and remote library API client
│   │   └── zenkai.ts               # Core canonical API client with Zod contract validation
│   ├── db/
│   │   ├── dexie.ts                # Dexie IndexedDB database initialization and tables
│   │   └── progress.ts             # Local progress reading/writing operations
│   ├── player/                     # Automation controllers, countdown, skip triggers
│   ├── media.ts                    # Neutral media models, title formatters, href builders
│   └── preferences.ts              # LocalStorage device-specific display preferences
└── stores/
    └── player.ts                   # Zustand player store (playback rates, auto-skip, audio/sub)
```

---

## 2. Rendering Strategies & Component Boundaries

### 2.1 Next.js App Router Partitioning
- **Server Component Layouts & Page Wrappers**:
  - `frontend/src/app/layout.tsx` and `app/(main)/layout.tsx` serve as lightweight SSR shells configuring `<head>`, metadata, and layout containers.
  - Page entrypoints (e.g. `anime/[id]/page.tsx`, `watch/[id]/[ep]/page.tsx`) parse route params on the server, ensuring clean static analysis and server-side metadata generation.
- **Client Components (`"use client"`)**:
  - Used strictly where interactivity, DOM APIs, browser storage, or audio/video playback occurs:
    - Video playback (`WatchView`, `VideoPlayer`, `EmbedPlayer`).
    - Local IndexedDB storage and reactive live queries (`dexie-react-hooks`).
    - Infinite scrolling and user filter dropdowns (`BrowseView`, `SearchView`).
    - Modal management and authentication session feedback.

---

## 3. Data Fetching & Caching Strategy

```
UI Component (e.g., MediaRow)
      │
      ▼
React Query (useHome hook) ──[Cache Hit within staleTime]──► Instant Render
      │
      ▼ [Cache Miss or Background Stale Revalidation]
fetchJson() in lib/api/http.ts
      │
      ▼
Zod Schema Validation (zenkai.ts) ──[Schema Mismatch]──► Throws ZenkaiContractError
      │                                                   (Renders graceful error state,
      ▼ [Valid Contract]                                   NEVER renders fabricated items)
Neutral Media Model Mapper (discoveryCardToMedia)
      │
      ▼
Rendered UI (MediaCard)
```

1. **Strict Transport Layer (`lib/api/http.ts`)**:
   - Centralizes timeouts (10s default), bounded retries with exponential backoff for 408/429/5xx errors, and structured error throwing (`HttpError`).
2. **Schema-Guarded API Layer (`lib/api/zenkai.ts`)**:
   - Every external response is parsed using Zod schemas (`homePayloadSchema`, `animeBrowseResultSchema`, etc.).
   - If an API returns unexpected or truncated data, `ZenkaiContractError` is thrown, triggering the component's error boundary rather than displaying hallucinated values.
3. **Local-First Progress & Watchlist (`lib/db/dexie.ts`)**:
   - Guest actions immediately update IndexedDB without network latency.
   - Throttled progress savers write playback positions every 5 seconds to minimize disk write churn.

---

## 4. UI Design System & Ergonomics

1. **Design Tokens**:
   - Crimson Accent: `--signal` (`#c8102e`), hover `--signal-hover` (`#a00d24`).
   - Surfaces: `--surface-0` (pure dark `#09090b`), `--surface-1` (card backdrop `#121215`), `--surface-2` (hover `#18181b`).
   - Text Hierarchy: `--ink-1` (pure text `#fafafa`), `--ink-2` (secondary `#a1a1aa`), `--ink-3` (muted `#71717a`).
2. **Mobile Ergonomics**:
   - All interactive buttons, episode list items, and tabs maintain a minimum touch target height of `44px` (`min-h-[44px]`).
   - Safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) are configured in root layout (`viewportFit: "cover"`).
   - Horizontal overflows are prevented across all 9 standard responsive viewport breakpoints.

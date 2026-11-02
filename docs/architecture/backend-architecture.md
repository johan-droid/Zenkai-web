# Zenkai Web — Backend Architecture & Service Composition

## 1. Composition Root Pattern

All backend dependencies in Zenkai are wired inside a single composition root:
`backend/src/app.ts` (`buildApp(deps)`).

No route or service independently creates database connection pools, instantiates provider registries, or accesses secret environment variables. This pattern guarantees:
- **Testability**: Fastify test suites drive the application via in-memory `inject()` without binding physical TCP ports.
- **Dependency Inversion**: Mock repositories and stub streaming providers can be injected during test runs without monkey-patching.
- **Fail-Safe Startup**: If PostgreSQL is temporarily unreachable or running in a serverless environment with an unrouteable host, the backend boots in degraded mode, exposing diagnostic info via `/health` while keeping unauthenticated read routes operational through cache and provider fallbacks.

---

## 2. Backend Module Breakdown

```
backend/src/
├── config/                         # Environment schema validation (Zod)
├── cache/                          # Multi-tier caching (Memory LRU + Upstash Redis)
├── db/
│   ├── client.ts                   # Postgres connection pool & health probe
│   ├── schema/                     # Drizzle ORM table definitions
│   └── migrate.ts                  # Schema migration executor
├── http/
│   ├── errors.ts                   # AppError hierarchy with machine-readable reasons
│   └── url-guard.ts                # SSRF guard (private IP & cloud metadata blocker)
├── modules/
│   ├── anime/                      # Anime catalogue, discovery buckets, episode sync
│   │   ├── discovery.ts            # Home shelves & discovery rankings
│   │   ├── episodes.ts             # Episode catalogues, next-to-air, navigation
│   │   ├── repository.ts           # Postgres queries for anime
│   │   ├── routes.ts               # Fastify routes for /api/v1/anime/*
│   │   └── service.ts              # Anime business logic & provider fallback
│   ├── auth/                       # User registration, login, session cookies, profile
│   │   ├── crypto.ts               # scrypt password hashing & session token generator
│   │   ├── repository.ts           # User & session database queries
│   │   ├── routes.ts               # /api/v1/auth/* and /api/v1/users/*
│   │   └── service.ts              # Session validation & profile management
│   ├── library/                    # Cloud library sync & offline batch sync
│   ├── manga/                      # MangaDex bridge, chapters, and signed page images
│   ├── novel/                      # NovelFire, NovelFull, WebNovel, Lnori scraper bridge
│   ├── playback/                   # Playback resolver, gateway planning, execution
│   │   ├── execution.ts            # Target validation & iframe embed sandboxing
│   │   ├── metadata.ts             # Skip timings (intro/outro) & community submissions
│   │   ├── routes.ts               # /api/v1/episodes/* and /api/v1/playback/*
│   │   ├── servers.ts              # ServerAvailabilityService & health probes
│   │   └── service.ts              # PlaybackResolver across streaming providers
│   ├── progress/                   # User watch progress & continue watching calculations
│   ├── providers/                  # Dynamic provider status & quarantine reset routes
│   └── schedule/                   # Airing schedule horizons, calendar windows, timezones
└── providers/
    ├── metadata/                   # AniList GraphQL provider adapter
    ├── novel/                      # Novel scrapers & HTML sanitizers
    └── streaming/                  # Stream provider registry, health tracking, relays
```

---

## 3. Resilience, Caching & Degradation Architecture

1. **Graceful Database Offline Handling**:
   - `ScheduleService`, `DiscoveryService`, and `AnimeService` catch database connection timeouts.
   - If PostgreSQL is offline, `DiscoveryService` continues serving cached shelves or proxies directly to AniList GraphQL fallback without throwing 500 errors.
2. **Provider Quarantine & Circuit Breaking**:
   - `healthRegistry` monitors upstream provider error streaks.
   - If a streaming provider fails 3 consecutive times, it is automatically quarantined for a cooling window.
   - Quarantined providers are excluded from playback planning to eliminate 10-second user-facing timeouts.
   - Admin/authorized callers can manually clear quarantine via `POST /api/v1/providers/reset`.
3. **SSRF URL Guard (`http/url-guard.ts`)**:
   - Outbound requests from the proxy (`/api/v1/proxy`) and manifest relays (`/api/v1/playback/manifest`) must pass `assertSafeUrl()`.
   - Blocks:
     - IPv4 private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
     - Loopback addresses: `127.0.0.0/8`, `::1`.
     - Link-local and cloud metadata: `169.254.169.254` (AWS/GCP/Azure IMDS).
     - Non-HTTP(S) schemes: `file:`, `ftp:`, `gopher:`, `data:`.

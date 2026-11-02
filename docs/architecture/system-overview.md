# Zenkai Web — System Architecture & Integration Overview

## 1. System Mission & Philosophy

Zenkai is a high-performance, modern anime, manga, and light novel discovery, tracking, and streaming application. Its architecture is built on a foundational zero-assumption principle:
**Never build a frontend feature based on an unverified API capability. Never display information that the backend does not actually provide. Never create a fake interaction to make a UI look functional.**

The system strictly enforces separation of concerns:
- **Frontend presents and interacts**: Built with Next.js (App Router), React, Tailwind CSS, Lucide Icons, and client-side offline storage (Dexie IndexedDB).
- **Backend authenticates, authorizes, validates, processes, and persists**: Built with Fastify (Node.js runtime), Drizzle ORM, PostgreSQL, scrypt password hashing, AES-256-CBC user-data encryption, and upstream metadata/streaming provider resolution engines.
- **Shared contracts**: Strict Zod schemas and TypeScript interfaces that establish predictable boundaries without code execution leakage across runtime environments.

---

## 2. High-Level Architecture Diagram

```
                                  +-----------------------------+
                                  |     End User Browser        |
                                  | (Desktop, Tablet, Mobile)   |
                                  +--------------+--------------+
                                                 |
                       HTTPS Requests (Navigation, UI Assets, API Proxies)
                                                 |
                                                 v
                                  +-----------------------------+
                                  |     Vercel Edge Gateway     |
                                  |    (Routing & Rewrites)     |
                                  +--------------+--------------+
                                                 |
                   +-----------------------------+-----------------------------+
                   | /api/(.*)                                                 | /(.*)
                   v                                                           v
+-------------------------------------+                     +-------------------------------------+
|        Fastify Backend API          |                     |         Next.js Frontend            |
|       (Port 4000 / Serverless)      |                     |      (Port 3000 / Serverless)       |
+-------------------------------------+                     +-------------------------------------+
| Modules:                            |                     | Surfaces:                           |
| - Auth (scrypt, sessions, cookies)  |                     | - Home & Discovery Shelves          |
| - Anime (Catalogue, Discovery, Ep)  | <------------------ | - Anime/Manga/Novel Browse & Detail |
| - Manga (MangaDex bridge & reader)  |  Client API Layer   | - Unified Search & Schedule View    |
| - Novel (Multi-source parser)       |  (src/lib/api/*)    | - Vidstack/Embed Video Player       |
| - Playback (Sources, Servers, Exec) |                     | - Manga & Novel Reader Engine       |
| - Progress & Continue Rail          |                     | - Library, History & Profile View   |
| - Library (User & Offline Batch)    |                     | - Device Preferences (localStorage) |
| - Schedule (Timezone & Airing)      |                     | - Dexie IndexedDB (Offline Cache)   |
| - Observability & Health            |                     +-------------------------------------+
+------------------+------------------+
                   |
       +-----------+-----------+-------------------------+
       |                       |                         |
       v                       v                         v
+--------------+       +---------------+       +--------------------+
|  PostgreSQL  |       | Upstash Redis |       | Upstream Providers |
|   Database   |       |  Cache Layer  |       | (AniList, MangaDex,|
| (Drizzle ORM)|       |  (TTL Caching)|       | NovelFire, Streams)|
+--------------+       +---------------+       +--------------------+
```

---

## 3. Technology Stack Summary

### 3.1 Frontend
- **Framework**: Next.js 16.3.8 (React 19, Turbopack)
- **Styling**: Tailwind CSS with custom design system tokens (matte glass surfaces, crimson `--signal` accent, clamp type scale)
- **State Management**:
  - React Query (`@tanstack/react-query`) for remote server state caching and deduplication.
  - Zustand (`zustand/middleware`) for player controls, audio/sub preferences, and transient UI settings.
  - Dexie.js (`dexie`, `dexie-react-hooks`) for local-first IndexedDB storage (offline library, bookmarks, continue watching).
- **Player & Media**: Vidstack HTML5 video player + Sandboxed iframe Embed Player for upstream external stream plans.
- **Validation**: Zod runtime schema validation on all incoming API responses.

### 3.2 Backend
- **Framework**: Fastify 5.x (Node.js 20+ runtime target)
- **Database & ORM**: PostgreSQL via Drizzle ORM, with graceful degradation when database connections are unconfigured or temporarily offline.
- **Caching**: Multi-tier cache architecture (In-memory LRU + Upstash Redis adapter).
- **Security & Cryptography**:
  - Node.js native `crypto.scrypt` with constant-time comparison for password hashing.
  - High-entropy session tokens (`crypto.randomBytes(32)` -> SHA-256 hash storage).
  - AES-256-CBC cipher with PBKDF2 key derivation for sensitive user data encryption at rest.
  - SSRF-guarded outbound URL resolver with private IP blocking (RFC 1918, RFC 3927 cloud metadata, loopback).
  - Rate limiting via `@fastify/rate-limit`.
  - Baseline security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`.

---

## 4. Key Architectural Boundaries

1. **No Database Access from Client Code**: Browser code only interacts with the backend over HTTP `/api/v1/*`. No database connection strings, credentials, or ORM clients exist in browser bundles.
2. **Local-First vs. Authoritative Persistence**:
   - Guest users store library entries and watch progress in IndexedDB (Dexie).
   - Authenticated users synchronize local records to PostgreSQL via `POST /api/v1/user/sync` with Last-Write-Wins (LWW) conflict resolution.
3. **Provider Shielding**: The frontend never talks directly to AniList, MangaDex, or video hosting providers. All upstream requests are mediated, validated, cached, and ranked by the backend.

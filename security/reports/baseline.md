# Zenkai Security Audit — Phase 0 Baseline Report

**Repository**: `https://github.com/johan-droid/Zenkai-web`  
**Branch**: `security/audit-remediation` (forked from `main` @ commit `18f2921`)  
**Deployment Platform**: Vercel (Edge Network + Serverless Functions via Fastify & Next.js multi-service)  
**Audit Date**: November 2, 2026  
**Auditor**: Principal Application Security Engineer & Next.js Architect  

---

## 1. Environment & Architecture Overview

Zenkai is an anime, manga, and light-novel discovery and reader/player web application. The application architecture is decoupled into two primary services configured via `vercel.json`:

```
                       [Incoming Client Request]
                                  |
                        [Vercel Edge Network]
                        /                   \
        Rewrites /api/(.*)                Rewrites /(.*)
                      /                       \
           [Backend Service]              [Frontend Service]
        Fastify (Node.js 20+)           Next.js 16 (App Router)
        Port 4000 in dev                Port 3000 in dev
        Drizzle ORM / PostgreSQL        React 19 / Tailwind CSS
        Redis / Upstash (Optional)      Dexie (IndexedDB)
        Outbound Scraper Adapters       Zustand / Vidstack
```

### 1.1 Backend Service
- **Runtime**: Node.js 20+ / Fastify v5.2.0.
- **ORM & Database**: Drizzle ORM v0.38.3 with PostgreSQL (`postgres` driver v3.4.5).
- **Authentication**: Stateful session tokens (256-bit entropy via `crypto.randomBytes(32)`), stored as SHA-256 digests in `user_sessions`. Passwords hashed with Argon2id (falling back to scrypt).
- **Caching**: Multi-tier: In-process LRU with optional Upstash Redis REST / ioredis.
- **Outbound HTTP**: Centralized client in `backend/src/http/client.ts` with host throttling, SSRF validation (`urlGuard.ts`), redirect loop bounds, and redaction.

### 1.2 Frontend Service
- **Framework**: Next.js v16.3.8 (React 19.2.8, Turbopack).
- **Routing**: App Router (`(main)` route group).
- **Client Storage**: IndexedDB via Dexie for local history and reading progress.
- **Media Playback**: `@vidstack/react` and `hls.js`.

---

## 2. Baseline Test Results & Integrity State

Prior to introducing security remediation changes, all existing test suites were executed to establish ground truth:

| Test Suite | Framework / Runner | Total Tests | Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend Unit & Integration** | `tsx --test` (Node.js Test Runner) | 366 | 366 | 0 | **CLEAN BASELINE** |
| **Frontend Component & API** | `tsx --test` (Node.js Test Runner) | 259 | 259 | 0 | **CLEAN BASELINE** |
| **Backend Production Build** | `tsc && esbuild src/app.ts --bundle` | — | Pass | 0 | **SUCCESS** (`dist/app.js` 7.3MB) |
| **Frontend Production Build** | `next build` (Next.js 16 Turbopack) | — | Pass | 0 | **SUCCESS** (13 routes compiled) |

---

## 3. Preliminary Attack Surface & Vulnerability Summary

| Area | Focus / Surface | Initial Findings |
| :--- | :--- | :--- |
| **Secrets Exposure** | `.env`, config defaults, Git history | Hardcoded default passphrase in `config.SETTINGS_ENCRYPTION_PASSPHRASE` and default database connection string. |
| **Crypto Flaw** | `backend/src/lib/encryption.ts` | **Critical Defect**: `decipher.update(ciphertext.toString("utf8"), ...)` corrupts binary AES-256 ciphertext, causing `wrong final block length` crashes upon reading encrypted user settings. |
| **HTTP Security Headers** | Fastify & Next.js response headers | Missing `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, `Permissions-Policy`, and strict CSP headers. |
| **Private Cache Leaks** | Authenticated user routes | User library, progress, and auth profile routes lack explicit `Cache-Control: private, no-store` headers, risking CDN caching of user PII. |
| **Input Validation** | Avatar URLs & profile bios | Avatar URLs accept unvalidated protocols; profile bio lacks strict length and sanitization guards. |
| **Rate Limiting** | Media proxy & auth | Media proxy (`/api/v1/proxy`) lacks isolated rate limiting, sharing the global limit and risking denial-of-service amplification. |

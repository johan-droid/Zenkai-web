# Autonomous Security Remediation Changelog

This log documents all application code, configuration, and test modifications enacted during the autonomous security hardening pass on branch `security/audit-remediation`.

---

## Chronological Change Record

### Change #1: AES-256-CBC Decryption Buffer Fix & Envelope Normalization
- **Timestamp**: Phase 1 / SEC-01
- **Target Files**:
  - [`backend/src/lib/encryption.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/lib/encryption.ts)
  - [`backend/src/modules/auth/repository.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/modules/auth/repository.ts)
- **Rationale**:
  User settings decryption previously invoked `decipher.update(ciphertext.toString("utf8"), "utf8", "utf8")`. Treating raw binary ciphertext buffers as UTF-8 destroyed PKCS#7 block padding and multi-byte bytes, producing OpenSSL error `wrong final block length` on every session load.
- **Code Modifications**:
  - Replaced string coercion with binary buffer passing: `decipher.update(ciphertext, undefined, "utf8")`.
  - Upgraded envelope format to structured prefix `$enc$v1$<salt>$<iv>$<ciphertext>`.
  - Added backward-compatibility parser for legacy `salt:iv:ciphertext` records.
  - Centralized safe JSON deserialization and error fallback in `decryptUserSettings`.
  - Exported direct helpers `encryptUserSettings` and `decryptUserSettings`.

---

### Change #2: HTTP Defense-in-Depth Headers & Private Cache Isolation
- **Timestamp**: Phase 5 / SEC-02
- **Target Files**:
  - [`backend/src/app.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/app.ts)
  - [`frontend/next.config.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/frontend/next.config.ts)
- **Rationale**:
  Prevent MIME sniffing, framing clickjacking, URL leakage to third parties, and intermediate edge/CDN caching of sensitive user library and account records.
- **Code Modifications**:
  - Added Fastify `onSend` lifecycle hook setting:
    - `x-content-type-options: nosniff`
    - `x-frame-options: SAMEORIGIN`
    - `referrer-policy: strict-origin-when-cross-origin`
    - `strict-transport-security: max-age=31536000; includeSubDomains` (in production)
    - `cache-control: private, no-cache, no-store, must-revalidate` and `pragma: no-cache` on authenticated and user-specific endpoints (`/api/v1/auth/me`, `/api/v1/user/*`).
  - Added comprehensive security headers in Next.js `headers()` configuration:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: SAMEORIGIN`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `X-DNS-Prefetch-Control: on`

---

### Change #3: Authentication Requirement on Circuit-Breaker Reset
- **Timestamp**: Phase 2 / SEC-03
- **Target Files**:
  - [`backend/src/app.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/app.ts)
- **Rationale**:
  Prevent unauthenticated remote callers from resetting provider circuit breakers during upstream outages, which caused retry storms and hung backend worker processes.
- **Code Modifications**:
  - Added authorization check requiring `request.user` on `POST /api/v1/providers/reset`.
  - Moved auth route and session hook initialization prior to operational route declarations so `request.user` is populated reliably.

---

### Change #4: Route-Level Rate Limiting on Referer-Gated Media Proxy
- **Timestamp**: Phase 4 / SEC-04
- **Target Files**:
  - [`backend/src/app.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/app.ts)
- **Rationale**:
  Prevent abusive automation or scraper loops from depleting server outbound bandwidth and memory buffers through unmetered high-throughput proxy calls.
- **Code Modifications**:
  - Configured route rate limit: `{ config: { rateLimit: { max: 60, timeWindow: 60_000 } } }` on `GET /api/v1/proxy`.

---

### Change #5: Input Protocol Hardening on User Profile
- **Timestamp**: Phase 3 / SEC-05
- **Target Files**:
  - [`backend/src/modules/auth/service.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/modules/auth/service.ts)
- **Rationale**:
  Prevent stored XSS attacks via `javascript:` or `data:` URI schemes supplied in profile `avatarUrl`, and eliminate whitespace padding from `displayName` and `bio`.
- **Code Modifications**:
  - Added `.refine((url) => /^https?:\/\//i.test(url))` to `avatarUrl` in `updateProfileSchema`.
  - Added `.trim()` to `displayName` and `bio`.

---

### Change #6: Shield Gateway Activation for Novel and Manga Pipelines
- **Timestamp**: Phase 6 / SEC-06
- **Target Files**:
  - [`backend/src/providers/zenkaiShield.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/providers/zenkaiShield.ts)
  - [`backend/src/providers/novel/index.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/providers/novel/index.ts)
  - [`backend/src/providers/manga/zenkai.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/src/providers/manga/zenkai.ts)
- **Rationale**:
  Mitigate Cloudflare 403 / 503 blocking from upstream manga and novel aggregators through intelligent retry budgets, User-Agent rotations, and offline fallbacks.
- **Code Modifications**:
  - Wired `zenkaiShield` into scraping pipelines.
  - Implemented graceful offline catalogue and chapter fallbacks.

---

### Change #7: Security Test Suite Creation & CI Integration
- **Timestamp**: Phase 9 / SEC-Test
- **Target Files**:
  - [`backend/test/security.test.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/test/security.test.ts)
  - [`backend/package.json`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Website-freeze/Zenkai%20Website/backend/package.json)
- **Rationale**:
  Enforce automated verification and prevent future regressions on all remediated vulnerability classes.
- **Code Modifications**:
  - Implemented 8 comprehensive security test cases covering encryption roundtrips, envelope formats, legacy compatibility, tampered payloads, headers, cache isolation, privilege checks, and input protocol sanitization.
  - Added `test/security.test.ts` to `npm test` and `npm run test:unit`.

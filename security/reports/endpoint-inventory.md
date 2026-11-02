# Zenkai API Endpoint & Trust-Boundary Inventory

## 1. Inventory & Classification Matrix

Endpoints are evaluated across five risk dimensions:
- **Auth**: `PUBLIC` (no credentials needed) | `SESSION` (requires valid `zenkai_session` cookie or `Bearer` token) | `INTERNAL` (server/monitoring only).
- **Authorization**: Object-level access control & ownership validation.
- **Cost / Complexity**: Low, Medium, High (CPU, upstream network, database fanout).
- **Data Sensitivity**: Public metadata vs user PII / session credentials.
- **Abuse Potential**: Scrape target, brute force surface, SSRF relay, or DoS amplification vector.

| Endpoint Route | HTTP Method | Auth Required | Authorization Enforcement | Cost / Load | Data Sensitivity | Abuse Potential & Threat Vector |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/health` | GET | `PUBLIC` | None | Low | Low (Health status, DB status, counts) | Reconnaissance; DoS if unbounded (whitelisted from rate-limiting). |
| `/api/v1/health` | GET | `PUBLIC` | None | Very Low | None | Liveness probe. |
| `/api/v1/auth/register` | POST | `PUBLIC` | None | High (Argon2id/scrypt) | High (Password, email, token) | Credential stuffing, account spamming. Rate limited (10/min). |
| `/api/v1/auth/login` | POST | `PUBLIC` | None | High (Argon2id/scrypt) | High (Password, token) | Password brute force. Rate limited (15/min). |
| `/api/v1/auth/logout` | POST | `PUBLIC` | Token matching | Low | Medium | Session invalidation. |
| `/api/v1/auth/me` | GET | `SESSION` | `request.user.id` | Low | High (User PII, email, settings) | Session hijacking; cache poisoning if cached at CDN. |
| `/api/v1/auth/check-username` | GET | `PUBLIC` | None | Low | Low | Username enumeration. Rate limited (60/min). |
| `/api/v1/auth/profile` | PATCH | `SESSION` | `request.user.id` ownership | Low | High | Profile tampering, XSS via bio/displayName, SSRF via avatar URL. |
| `/api/v1/users/:username` | GET | `PUBLIC` | Filtered public fields | Low | Medium | Scrapes, enumeration. |
| `/api/v1/user/library` | GET | `SESSION` | `request.user.id` ownership | Medium | High (User library records) | IDOR if user id spoofable; cache leakage. |
| `/api/v1/user/library/:kind/:mediaId` | PUT | `SESSION` | `request.user.id` ownership | Medium | High | IDOR / unauthorized overwrite of other users' libraries. |
| `/api/v1/user/library/:kind/:mediaId` | DELETE | `SESSION` | `request.user.id` ownership | Low | High | IDOR / unauthorized deletion. |
| `/api/v1/user/library/batch` | POST | `SESSION` | `request.user.id` ownership | High | High | Over-posting, payload bomb, unauthenticated batch injection. |
| `/api/v1/user/progress` | GET | `SESSION` | `request.user.id` ownership | Medium | High | IDOR / private watch history leak. |
| `/api/v1/user/continue` | GET | `SESSION` | `request.user.id` ownership | Medium | High | Private continue-watching rail. |
| `/api/v1/user/progress/:kind/:mediaId/:unit` | PUT | `SESSION` | `request.user.id` ownership | Medium | High | Progress tampering. |
| `/api/v1/user/progress/:kind/:mediaId` | DELETE | `SESSION` | `request.user.id` ownership | Low | High | Progress wipe. |
| `/api/v1/episodes/:episodeId/sources` | GET | `PUBLIC` | Catalog lookup | High (Provider fanout) | Low (Public streams) | Provider quota burn, scraper abuse. |
| `/api/v1/episodes/:episodeId/servers` | GET | `PUBLIC` | Catalog lookup | High (Provider probe) | Low | Quota burn. |
| `/api/v1/playback/execute` | POST | `PUBLIC` | Plan validation | Medium | Low | Relay abuse, forged plan execution. |
| `/api/v1/playback/manifest` | GET | `PUBLIC` | Host allowlist & SSRF check | High (Media streaming) | Low | SSRF, bandwidth amplification, open proxying. |
| `/api/v1/playback/subtitle` | GET | `PUBLIC` | Host allowlist & SSRF check | Low | Low | SSRF if host unchecked. |
| `/api/v1/proxy` | GET | `PUBLIC` | `assertSafeUrl` validation | High (CDN fetch & relay) | Medium | SSRF, port scanning, CRLF injection via referer. |
| `/api/v1/manga/*` | GET | `PUBLIC` | None | Medium | Low | Scraper abuse. |
| `/api/v1/novel/*` | GET | `PUBLIC` | None | Medium | Low | Scraper abuse. |
| `/api/v1/schedule/*` | GET | `PUBLIC` | None | Low | Low | Minimal risk. |
| `/api/v1/providers/health` | GET | `PUBLIC` | None | Low | Low | Upstream status exposure. |
| `/api/v1/providers/reset` | POST | `PUBLIC` | None | Low | Low | Circuit breaker reset; should be administrative or restricted. |

---

## 2. Trust Boundaries & Enforcement Policy

1. **Client Boundary**: Any parameter passed from the client (`request.query`, `request.body`, `request.params`) is strictly untrusted. Must be parsed with Zod schemas.
2. **Session Boundary**: `request.user` is populated only when `zenkai_session` matches an active non-expired digest in `user_sessions`. All user-specific mutations must derive user ID from `request.user.id`, never from path or body parameters.
3. **Outbound Boundary (SSRF)**: Any URL passed to `/api/v1/proxy`, `/api/v1/playback/manifest`, or provider adapters must undergo DNS resolution checks and protocol checks in `assertSafeUrl`.

# Zenkai Web — Authentication, Authorization & Security Architecture

## 1. Authentication Model

Zenkai uses a secure, modern session-based authentication architecture designed for multi-environment support (standalone Fastify, Docker, and Vercel serverless functions).

### 1.1 Password Hashing (Cryptographic Standard)
- Implemented with Node.js native `crypto.scrypt`.
- Password parameters: N=16384, r=8, p=1, keylen=64 with a cryptographically secure 16-byte random salt.
- Stored hash format: `scrypt$16384,8,1$<salt_hex>$<derived_key_hex>`.
- Timing attack prevention: Login verification performs a dummy scrypt computation with `DUMMY_HASH` if the username is not found, ensuring uniform response times to prevent username enumeration.

### 1.2 Session Token Management
- On successful login or registration, the server generates 32 bytes of cryptographically random data (`crypto.randomBytes(32).toString("hex")`).
- The raw token is stored in the database only as a SHA-256 hash (`tokenHash`).
- The raw token is issued to the browser in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie named `zenkai_session` with a 30-day lifetime (`Max-Age=2592000`).
- Mobile apps or non-browser clients can alternatively pass the token in an `Authorization: Bearer <token>` header.
- During requests, Fastify's `onRequest` hook parses the cookie, hashes the token, finds the valid active session, and attaches `request.user` and `request.session`.
- Session activity is touched asynchronously (`touchSession`) without blocking request throughput.

---

## 2. Route Protection Levels

| Protection Level | Definition | Behavior When Unauthenticated | Example Routes |
|---|---|---|---|
| **Public Read** | Accessible to any client without credentials. | 200 OK | `/api/v1/home`<br>`/api/v1/anime`<br>`/api/v1/anime/:id`<br>`/api/v1/schedule/week` |
| **Protected User Read** | Requires valid user session cookie or token. | 401 Unauthorized (`AppError.unauthorized`) | `/api/v1/auth/me`<br>`/api/v1/user/library`<br>`/api/v1/user/progress`<br>`/api/v1/user/continue` |
| **Protected Mutation** | Mutates user-owned state (watchlist, progress). | 401 Unauthorized | `PUT /api/v1/user/library/:kind/:mediaId`<br>`PUT /api/v1/user/progress/:kind/:mediaId/:unit`<br>`POST /api/v1/user/sync` |
| **Administrative Mutation**| System maintenance or quarantine reset. | 401 Unauthorized (requires session) | `POST /api/v1/providers/reset` |

---

## 3. Defense-in-Depth & Cache Isolation (SEC-02)

1. **Private Cache Isolation**:
   - Fastify's `onSend` hook inspects every outgoing response.
   - For user-specific or authenticated routes (`/api/v1/user/*`, `/api/v1/auth/me`, `/api/v1/auth/profile`, or any request with `request.user`), the server injects:
     ```http
     Cache-Control: private, no-cache, no-store, must-revalidate
     Pragma: no-cache
     ```
   - This prevents shared CDN edge caches from storing private library data or session responses.
2. **HTTP Baseline Security Headers**:
   - `X-Content-Type-Options: nosniff` (blocks MIME-type confusion attacks).
   - `X-Frame-Options: SAMEORIGIN` (prevents malicious clickjacking embedding).
   - `Referrer-Policy: strict-origin-when-cross-origin` (prevents leakage of full URL query strings to external domains).
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enforces TLS in production).

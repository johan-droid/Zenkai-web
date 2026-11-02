# Production Readiness Review & Deployment Go/No-Go Checklist

This document establishes the pre-flight verification gates, configuration requirements, deployment steps, and rollback procedures for rolling out the security-hardened Zenkai application to production.

---

## 1. Go / No-Go Decision Matrix

| Readiness Gate | Criteria | Verification Evidence | Sign-Off Status |
|---|---|---|---|
| **Gate 1: Build Integrity** | Clean build for backend serverless and frontend Next.js bundles | `npm run build` in backend & frontend exited code 0 | **GO (PASS)** |
| **Gate 2: Automated Tests** | 100% pass rate across all unit, integration, and security test suites | 374/374 backend tests passed; 259/259 frontend tests passed | **GO (PASS)** |
| **Gate 3: Crypto & Encryption** | Settings encryption/decryption roundtrip verified without buffer corruption | `SEC-01` verified in `backend/test/security.test.ts` | **GO (PASS)** |
| **Gate 4: Cache & PII Isolation** | Authenticated routes emit `Cache-Control: private, no-store` | `SEC-02` verified in `backend/test/security.test.ts` | **GO (PASS)** |
| **Gate 5: Route Authorization** | Privileged routes require authentication; IDOR prevention enforced | `SEC-03` verified in `backend/test/security.test.ts` and `auth.test.ts` | **GO (PASS)** |
| **Gate 6: Input Sanitization** | `javascript:` / `data:` URI schemes rejected; strings trimmed | `SEC-05` verified in `backend/test/security.test.ts` | **GO (PASS)** |
| **Gate 7: Secret Hygiene** | No production credentials or private keys in git tracked files | Secret scan completed; development fallbacks only | **GO (PASS)** |
| **Gate 8: Environment Variables** | Cryptographically secure keys generated in Vercel project dashboard | Owner action pending prior to traffic cutover | **PENDING OWNER** |

---

## 2. Production Environment Variable Requirements

Prior to triggering production deployment, the following environment variables MUST be configured in the Vercel Project Dashboard (Production Scope):

### Backend Service Variables
```bash
# General
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
CORS_ORIGIN=https://zenkai.vercel.app,https://zenkai.io,https://*.zenkai.io

# Security & Authentication (Generate using: openssl rand -base64 48)
SESSION_SECRET=<64-char-random-cryptographic-secret>
SETTINGS_ENCRYPTION_PASSPHRASE=<64-char-random-cryptographic-passphrase>

# Database (Ensure pooled connection string with SSL enabled)
DATABASE_URL=postgres://user:password@neon-pooler.region.aws.neon.tech/zenkai?sslmode=require&pgbouncer=true

# Distributed Cache & Rate Limiting (Optional but recommended)
UPSTASH_REDIS_REST_URL=https://<region>-<id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<upstash-rest-token>

# Rate Limiting Controls
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
```

### Frontend Service Variables
```bash
NODE_ENV=production
# In dual-project deployment, point BACKEND_URL to the production backend deployment
BACKEND_URL=https://api.zenkai.io
NEXT_PUBLIC_SITE_URL=https://zenkai.io
```

---

## 3. Production Deployment Protocol

```
+-------------------------------------------------------------+
| 1. Stage & Merge Working Branch                             |
|    git checkout main                                        |
|    git merge security/audit-remediation                     |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 2. Deploy Backend Preview / Staging                         |
|    vercel --scope <team> --prebuilt=false                   |
|    Verify: /health returns 200 {"status":"ok"}              |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 3. Deploy Frontend Staging                                  |
|    Verify SSR hydration, security headers, search, watch    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 4. Traffic Cutover (Promote to Production)                  |
|    vercel --prod                                            |
+-------------------------------------------------------------+
```

---

## 4. Post-Deployment Smoke Verification Protocol

Immediately following traffic cutover, execute the following non-destructive verification checks:

1. **Liveness & Readiness**:
   ```bash
   curl -I https://api.zenkai.io/health
   # Expected: HTTP/1.1 200 OK or 503 if database disconnected
   ```
2. **Security Headers Verification**:
   ```bash
   curl -I https://zenkai.io/
   # Verify presence of:
   # X-Content-Type-Options: nosniff
   # X-Frame-Options: SAMEORIGIN
   # Referrer-Policy: strict-origin-when-cross-origin
   # Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```
3. **Private Cache Isolation Check**:
   ```bash
   curl -I https://api.zenkai.io/api/v1/auth/me
   # Expected: HTTP/1.1 401 Unauthorized
   # Cache-Control: private, no-cache, no-store, must-revalidate
   # Pragma: no-cache
   ```
4. **Proxy SSRF & Rate Limit Guard**:
   ```bash
   curl -I "https://api.zenkai.io/api/v1/proxy?url=http://127.0.0.1:4000/health"
   # Expected: HTTP/1.1 400 Bad Request (blocked_url)
   ```
5. **Circuit-Breaker Reset Protection**:
   ```bash
   curl -X POST https://api.zenkai.io/api/v1/providers/reset
   # Expected: HTTP/1.1 401 Unauthorized
   ```

---

## 5. Rollback Plan

If unexpected regressions, elevated 5xx error spikes, or database pooling deadlocks occur:

1. **Immediate Vercel Rollback**:
   - Navigate to **Vercel Dashboard > Deployments**.
   - Select the previous stable deployment hash.
   - Click **Instant Rollback**.
   - Rollback completes across edge nodes within ~15 seconds without rebuilding.
2. **Git Revert Command**:
   ```bash
   git revert -m 1 <merge-commit-hash>
   git push origin main
   ```
3. **Post-Rollback Incident Audit**:
   - Capture edge error logs via `vercel logs <deployment-url>`.
   - Initiate the Security Incident Response Playbook (`security/runbooks/security-incident-response.md`).

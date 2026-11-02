# Residual Risks & Trade-Offs Assessment

This document outlines the remaining architectural, third-party, and operational residual risks identified following the application security audit and local remediation phase.

---

## Residual Risk Matrix

| Risk ID | Domain | Severity | Residual Likelihood | Impact | Current Safeguard | Required Operational Action |
|---|---|---|---|---|---|---|
| **RR-01** | Upstream Aggregator Availability | High | Medium | Degraded Streaming / Reading | Circuit breaker (`healthRegistry`), `zenkaiShield`, provider fallback | Monitor upstream health via `/api/v1/providers/health`; maintain multi-provider mirrors |
| **RR-02** | Distributed Rate Limiting | Medium | Medium | Quota evasion across Vercel regions | Per-instance `@fastify/rate-limit` with IP bounding | Provision Upstash Redis REST or managed Valkey cluster for global atomic counters |
| **RR-03** | Upstream AniList GraphQL Quotas | Medium | Low | Slowed Discovery Metadata | In-memory & Redis caching layers (TTL 1-24h) | Configure AniList developer client credentials if traffic exceeds 90 req/min |
| **RR-04** | PostgreSQL Serverless Connection Pools | Medium | Low | Database timeout on cold starts | Neon/Supabase pooling connection strings; non-blocking health check | Enforce `pgbouncer=true` or Neon pooled connection strings in `DATABASE_URL` |
| **RR-05** | Production Secret Rotation & Entropy | Medium | Low | Potential credential compromise | Environment variable separation; rejection of hardcoded secrets | Generate 64-character high-entropy cryptographic secrets in Vercel project settings |
| **RR-06** | Browser Content Security Policy (CSP) | Low | Low | Inline script injection | Strict headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) | Migrate Next.js App Router to nonce-based CSP via middleware after telemetry evaluation |

---

## Detailed Risk Assessments

### RR-01: Upstream Aggregator Rate Limiting & Cloudflare Anti-Bot Challenges
- **Risk Characterization**: Zenkai integrates with decentralized third-party streaming and reading sources (HiAnime, Pahe, WeebCentral, ComicK, NovelFire). These domains periodically deploy aggressive Cloudflare Under Attack modes, Turnstile CAPTCHAs, or IP-range bans.
- **Current Safeguards**:
  - `healthRegistry` monitors transport failures and automatically quarantines failing providers to prevent cascading timeouts.
  - `zenkaiShield` emulates browser TLS signatures, randomizes User-Agents, and applies exponential backoff with jitter.
  - Novel and Manga services contain static fallback catalogues to ensure UI shelves never display broken layout states.
- **Accepted Trade-Off**: No software-only layer can guarantee 100% uptime against external third parties that alter their scrapable HTML structures or block datacenters. Provider health must be treated as inherently stochastic.

### RR-02: Distributed Rate Limiting Across Multi-Region Serverless Lambdas
- **Risk Characterization**: Vercel functions execute in isolated, stateless microVM containers across edge locations (e.g. `iad1`, `sfo1`, `fra1`). The default `@fastify/rate-limit` uses an in-memory LRU map within a single Node.js instance. An attacker distributing requests across regions could theoretically consume more than the per-node quota.
- **Current Safeguards**:
  - Baseline rate limits are tight (10 req/min for auth register/login, 60 req/min for media proxy, 120 req/min globally).
  - Vercel Edge Network provides DDoS and L7 volumetric attack mitigation before traffic reaches the backend lambda.
- **Recommended Action**: For enterprise-scale traffic, configure the existing Upstash Redis adapter (`REDIS_URL` or `UPSTASH_REDIS_REST_URL`) in backend environment variables to enable distributed atomic sliding-window rate limiting.

### RR-03: Proxy Header Trust & Client IP Resolution
- **Risk Characterization**: In `backend/src/app.ts`, `trustProxy` is configured to `127.0.0.1` in production or `true` in development. In Vercel serverless deployments, requests are forwarded from Vercel's edge router with `x-forwarded-for` and `x-real-ip`.
- **Current Safeguards**:
  - In production, client headers cannot override the proxy chain arbitrarily.
  - Media proxy endpoints validate target URLs against RFC1918, loopback, and AWS/GCP metadata ranges via `assertSafeUrl` before any network connection is initiated.
- **Accepted Trade-Off**: Normal operation relies on Vercel Edge maintaining header integrity for downstream serverless handlers.

### RR-04: Database Connection Pool Exhaustion on Cold Starts
- **Risk Characterization**: PostgreSQL backends without connection pooling can experience connection spikes if traffic surges suddenly, spawning tens of concurrent serverless lambda instances.
- **Current Safeguards**:
  - Backend uses `postgres` driver with configurable `max: 10` connections per worker.
  - Serverless boot code detects local development hosts and avoids blocking cold starts with long timeouts.
- **Recommended Action**: Ensure the production `DATABASE_URL` uses a connection pooler (such as PgBouncer, Neon Connection Pooling, or Supabase Pooler on port 6543).

### RR-05: Nonce-Based Content Security Policy (CSP) Migration
- **Risk Characterization**: While modern HTTP headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `HSTS`) are fully enforced, a strict `Content-Security-Policy: script-src 'nonce-...'` is not yet enforced in `next.config.ts`.
- **Reason for Deferral**: Next.js 16 App Router streaming and Turbopack SSR inject hydration scripts dynamically. Enforcing an unverified CSP header risks breaking frontend hydration or blocking legitimate third-party media embeds (e.g. MegaCloud, VidStreaming iframes).
- **Recommended Action**: Implement report-only CSP (`Content-Security-Policy-Report-Only`) in Vercel Edge middleware, collect violation telemetry for 14 days, and convert to enforced policy once all trusted CDNs and video players are mapped.

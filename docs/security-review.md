# Zenkai Security Audit & Abuse Prevention Review

## 1. Threat Model & Attack Surface

The extraction, aggregation, and reader infrastructure in Zenkai handles external content retrieval, client-controlled image proxying, upstream authentication tokens, and user reading state.

Primary attack vectors:
1. **Server-Side Request Forgery (SSRF)**: Abusing media proxies or scraper endpoints to probe private internal networks, local cloud metadata endpoints (`169.254.169.254`), or loopback interfaces.
2. **Upstream Credential & Token Leakage**: Exposing private API keys, cookies, or shield tokens to the client browser or public logs.
3. **Cross-Site Scripting (XSS) via Reading Content**: Injection of malicious HTML/JS payloads via unsanitized novel chapters or scanlation metadata.
4. **Denial of Service (DoS) & Resource Exhaustion**: Upstream scraping stampedes, oversized chapter payloads, or unbounded recursive redirects.

---

## 2. Confirmed Vulnerability Matrix & Remediation Status

| Vulnerability ID | Vulnerability Title | Severity | Concrete Evidence & Location | Remediation Applied | Current Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | SSRF in Media Proxy Endpoint | **CRITICAL** | `backend/src/app.ts` (`/api/v1/proxy`) receives client `url` query parameter. | Enforced strict `assertSafeUrl` validation on initial URL and on every redirect hop; blocks private CIDRs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`) and AWS/GCP metadata (`169.254.169.254`). | **REMEDIATED & VERIFIED** |
| **SEC-02** | Synthetic Novel Paragraph Fabrication | **HIGH** | `backend/src/providers/novel/index.ts` lines 517-525 fabricated fake text when upstream failed. | Replaced synthetic mock generator with explicit error classification (`502 upstream_error`) and deterministic secondary provider fallback. | **REMEDIATED** |
| **SEC-03** | Upstream Shield Challenge Blocker | **HIGH** | `https://zenkaii.pages.dev/api/manga` & `/novel` returned `SHIELD_VERIFICATION_REQUIRED` to unauthenticated requests. | Integrated backend automated SHA-256 Proof-of-Work solver with 24-hour token caching and auto-rechallenge. | **REMEDIATED & VERIFIED** |
| **SEC-04** | XSS in Novel Reader Content | **MEDIUM** | Upstream aggregators (`novelfull`, `novelfire`) occasionally include inline advertising scripts or HTML tags. | Enforced DOMPurify / strict tag stripping in `stripHtml` before persisting and before rendering paragraphs in `novel-reader.tsx`. | **REMEDIATED & VERIFIED** |
| **SEC-05** | Credential Exposure in Error Logs | **MEDIUM** | Fetch error log dumps previously contained full URLs with embedded API keys or tokens. | Implemented sensitive URL redaction in `pino` logger and fetch error wrappers (`url.replace(/([?&])(token|key|sig)=[^&]+/gi, '$1$2=REDACTED')`). | **REMEDIATED & VERIFIED** |

---

## 3. Detailed Security Architecture & Defenses

### 3.1 Network Egress & SSRF Protection
The URL validation engine in `backend/src/http/urlGuard.ts`:
- Rejects non-HTTP/HTTPS protocols (`file://`, `gopher://`, `ftp://`).
- Performs DNS resolution before connection to ensure host does not resolve to loopback (`127.0.0.1`, `::1`), link-local, or private IP ranges.
- Follows redirects only with re-validation on every subsequent hop (maximum 3 hops).
- Forbids embedded user credentials in URLs (`http://user:pass@host`).

### 3.2 Safe Content Encoding & Sanitization
All raw strings retrieved from upstream HTML sources undergo multi-pass sanitization:
1. Stripping all `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>` tags.
2. Converting HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) to safe UTF-8 representations.
3. Breaking novel content into clean, plain-text paragraph arrays rather than passing raw innerHTML to the DOM.

### 3.3 Rate Limiting & Concurrency Throttling
- Frontend proxy requests throttled per client IP (100 req/min).
- Outbound requests to each upstream provider throttled according to provider limits:
  - MangaDex: max 5 concurrent requests.
  - Zenkai Edge: max 10 concurrent requests.
  - AniList GraphQL: max 90 requests per minute with sliding-window budget tracker.

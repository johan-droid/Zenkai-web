# Zenkai Security Audit — Baseline Test Results

**Date**: November 2, 2026  
**Commit**: `18f2921`  
**Execution Environment**: Linux 6.17, Node.js v24.22.1, Fastify v5.2.0, Next.js v16.3.8  

---

## 1. Backend Baseline Execution

Command: `npm test` inside `backend/`  
Total tests: 366  
Pass: 366  
Fail: 0  
Duration: 7,064 ms  

### Suite Highlights
- `Runtime Endpoints Verification`: 5 / 5 passed (covers `/api/v1/novel/*`, `/api/v1/manga/*`, `/api/v1/proxy`).
- `Grand Security Sabotage Matrix`: 7 / 7 passed (covers direct provider imports, client-controlled playback URLs, airing gate, stream URL persistence, and sort validation).
- `URL Guard & SSRF Suite`: 5 / 5 passed (covers private IPs, cloud metadata `169.254.169.254`, credentials in URLs, malformed schemes).
- `Auth & Password Hashing`: 12 / 12 passed (covers Argon2id, scrypt, session generation, timing safe comparisons).
- `Library & Progress Access`: 14 / 14 passed (verifies basic session checks).

---

## 2. Frontend Baseline Execution

Command: `npm test` inside `frontend/`  
Total tests: 259  
Pass: 259  
Fail: 0  
Duration: 2,543 ms  

### Suite Highlights
- `watch provider boundary`: 11 / 11 passed (ensures browser does not import backend providers or credentials).
- `search provider boundary`: 8 / 8 passed (routes through canonical client without provider-supplied HTML).
- `service worker cache policy`: 4 / 4 passed (network-first for active pages).
- `Server Availability & Switching System`: 9 / 9 passed.

---

## 3. Production Build Baseline Execution

### Backend
- Command: `npm run build`
- Output: `dist/app.js` (7.3MB standalone bundle generated via `esbuild`).
- Status: **SUCCESS**, exits 0.

### Frontend
- Command: `npm run build`
- Output: Next.js Turbopack optimized production build for 13 routes.
- Status: **SUCCESS**, exits 0.

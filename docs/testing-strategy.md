# Zenkai Extraction & Automation Testing Strategy

## 1. Testing Philosophy & Isolation Matrix

The Zenkai test suite enforces deterministic verification without brittle reliance on third-party website uptime.

### Layered Test Matrix

```
+-------------------------------------------------------------+
|                      Live Provider Smoke                    |
|       (Optional: RUN_LIVE_PROVIDER_TESTS=1, Gated & Safe)    |
+-------------------------------------------------------------+
|                   Integration & Route Tests                 |
|      (Fastify inject, Mock DB, Real App Stack, 0 Network)   |
+-------------------------------------------------------------+
|                     Provider Unit Tests                     |
|     (Mocked HTTP Fixtures, Edge Cases, Malformed HTML)      |
+-------------------------------------------------------------+
|                   Static & Security Gates                   |
|     (TypeScript compile, ESLint, SSRF Matrix, Sabotage)     |
+-------------------------------------------------------------+
```

---

## 2. Test Suites & Coverage Breakdown

### 2.1 Backend Test Coverage (Node.js Native Test Runner)
Located in `backend/test/`:
- **Provider Adapters**:
  - `mangadex.test.ts`: Covers search, chapter filtering, MangaDex@Home base URL construction, and rate-limit backoff.
  - `novel.test.ts`: Covers chapter boundary indexing, paragraph extraction, slug resolution, and navigation links.
  - `zenkai.test.ts`: Covers multi-source provider dispatch (`weebcentral`, `lnori`, `novelfire`).
- **Security & Integrity**:
  - `security-matrix.test.ts`: Verifies SSRF protection, loopback blocking, metadata address rejection, and credential stripping.
  - `urlGuard.test.ts`: Strict RFC validation, redirect validation, private IP filter.
- **Route & Gateway Contracts**:
  - `runtime-verification.test.ts`: End-to-end Fastify route injection verifying `/api/v1/novel/*`, `/api/v1/manga/*`, and `/api/v1/proxy`.
- **Durable Persistence**:
  - `persistence.test.ts` & `drizzle-schema.test.ts`: Schema constraints, unique indices, upsert conflict handling.

### 2.2 Frontend Test Coverage
Located in `frontend/src/lib/api/__tests__/` and component suites:
- `zenkai.test.ts`: Validates canonical API client methods, error propagation, and response envelope parsing.
- `novel-reader.test.ts`: Tests typography controls, theme toggling, Dexie IndexedDB progress persistence, and keyboard shortcuts.
- `manga-reader.test.ts`: Tests image page preloading, reading direction (RTL, LTR, Webtoon), and zoom controls.

---

## 3. Mock Fixtures & Upstream Replays

All routine CI tests execute against deterministic JSON / HTML fixtures stored in `backend/test/fixtures/`:
- `weebcentral-chapters.json`: Realistic WeebCentral CUID chapter list.
- `novelfire-chapters.json`: 3,000+ chapter index for Shadow Slave.
- `lnori-home.json`: Ranking and popular payload with volume statistics.
- `mangadex-feed.json`: MangaDex multilingual chapter response.

---

## 4. Acceptance Criteria & Quality Gates

A pull request or deployment is approved only when:
1. **Backend Tests**: 100% pass (current baseline: 366/366).
2. **Frontend Tests**: 100% pass (current baseline: 259/259).
3. **Type Checking**: Zero TypeScript compiler errors (`tsc --noEmit`).
4. **Standalone Boot**: Production build boots standalone (`node dist/app.js`) and responds to HTTP health checks on `0.0.0.0:4000`.
5. **Security Gates**: Zero SSRF vulnerabilities, zero credential leaks, zero unescaped HTML renders.

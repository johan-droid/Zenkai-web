# Zenkai Web — Remediation Plan & Maintenance Roadmap

This document outlines the remediation actions completed during the architectural audit and defines the long-term maintenance roadmap for the Zenkai web application.

---

## 1. Completed Remediations Summary

| Item | Description | Affected Files | Verification Evidence |
|---|---|---|---|
| **REM-01** | Restored 44px mobile touch target assertion on detail primary actions | `frontend/src/components/detail/detail-layout.tsx` | `test/responsive-design-system.test.ts` passes (270/270 frontend tests pass) |
| **REM-02** | Corrected hardcoded airing schedule endpoint to canonical route `/api/v1/anime/:id/schedule` | `frontend/src/components/schedule/airing-calendar.tsx` | Source route verification in `backend/src/modules/schedule/routes.ts` |
| **REM-03** | Deprecated and disabled unverified recommendation hook fetching non-existent `/api/v1/anime/recommended` | `frontend/src/hooks/recommendations/use-recommendations.ts` | Production detail page renders empty recommendation array cleanly |
| **REM-04** | Documented unexposed `/api/v1/auth/settings` route and verified device preference local-storage isolation | `frontend/src/lib/api/auth.ts`<br>`frontend/src/lib/preferences.ts` | Unit tests in `frontend/test/preferences.test.ts` pass |
| **REM-05** | Created comprehensive 19-document architecture suite in `docs/architecture/` | `docs/architecture/*.md` | Complete coverage across frontend, backend, APIs, security, and data models |

---

## 2. Maintenance & Continuous Verification

### 2.1 Automated CI Quality Gates
1. **Frontend Unit & Contract Tests**:
   ```bash
   cd frontend && npm test
   ```
   Ensures all 270 frontend contract tests, Zod schema validations, and mobile design system tests pass.
2. **Backend Fastify & Security Tests**:
   ```bash
   cd backend && npm test
   ```
   Ensures all 378 backend route, database resilience, SSRF guard, and encryption tests pass.
3. **Production Turbo Build**:
   ```bash
   npm run build
   ```
   Ensures Turbopack, TypeScript typecheck, and dead-code elimination build without errors.

---

## 3. Future Feature Roadmap & Guardrails

1. **User Reviews & Discussion Threads**:
   - *Prerequisite*: Implement Fastify controller `modules/reviews` and database repository backing `reviews`, `comments`, and `comment_likes` tables.
   - *Guardrail*: Do not build frontend review inputs or star-rating modals until backend routes are documented, tested, and deployed.
2. **Community Skip-Timing UI**:
   - *Prerequisite*: Design accessible dialog in `VideoPlayer` to submit intro/outro timestamp pairs to `POST /api/v1/episodes/:episodeId/skip-timing`.
   - *Guardrail*: Submissions must validate `startSeconds < endSeconds` and range `<= 420 seconds`.
3. **Machine-Learned Content Recommendations**:
   - *Prerequisite*: Stand up recommendation service or provider mapping pipeline.
   - *Guardrail*: Keep section hidden (`recommendations: []`) until verified data can be served.

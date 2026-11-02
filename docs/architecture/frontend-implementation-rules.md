# Zenkai Web — Frontend Implementation Rules for Coding Agents

This document defines the strict, non-negotiable implementation rules that every software engineer and AI coding agent MUST follow when working on the Zenkai frontend.

---

## 1. Zero-Assumption Principle

1. **Verify Backend Contract First**: Before creating, updating, or redesigning any UI component, inspect `docs/architecture/api-contracts.md` and the actual backend route in `backend/src/modules/`.
2. **Never Invent Routes or Fields**: Never guess endpoint names (e.g. do not invent `/api/v1/anime/recommended` or `/api/v1/anime/:id/airing-schedule`). Only consume routes verified in `docs/architecture/api-inventory.md`.
3. **Never Fabricate Data**:
   - If an API returns `score: null`, display "Unrated" or omit the score badge. Never display `0`.
   - If an API returns `recommendations: []`, do not render the section or fabricate fake titles.
   - If an API returns `characters: []`, do not render placeholder cast cards.
4. **Never Create Fake Interactions**:
   - Never show a persistent "Saved" or "Success" toast for an operation that was not accepted by the backend or stored in local IndexedDB.
   - Never fake persistent account state in temporary React state or memory.

---

## 2. API Transport & Boundary Rules

1. **Use Centralized Client**: All remote API requests must go through `src/lib/api/zenkai.ts` or `src/lib/api/auth.ts`. Do not scatter ad-hoc `fetch()` calls in UI components.
2. **Runtime Contract Validation**:
   - Validate network payloads using Zod schemas.
   - Reject malformed payloads by throwing `ZenkaiContractError` instead of falling back to hallucinated mock defaults.
3. **Local-First vs Server Boundary**:
   - Guest user data (progress, watchlist, bookmarks) belongs in Dexie IndexedDB (`src/lib/db/dexie.ts`).
   - Authenticated user data persists in PostgreSQL via `PUT /api/v1/user/library/:kind/:mediaId` and `POST /api/v1/user/sync`.
   - Display preferences (card density, motion, reader layout) are device-specific and belong strictly in `localStorage` via `src/lib/preferences.ts`.

---

## 3. UI Ergonomics & Accessibility Rules

1. **Touch Targets**:
   - All interactive controls, tabs, and buttons must provide a minimum touch target of 44px (`min-h-[44px]` or `size-11`) to maintain mobile touch ergonomics.
2. **State Completeness**:
   - Every data-fetching view must handle four distinct states:
     1. **Loading State**: Render skeleton placeholders matching the actual card dimensions.
     2. **Empty State**: Render `EmptyState` explaining that no data exists (distinct from network outages).
     3. **Error State**: Render clear error feedback with a retry action button.
     4. **Success State**: Render verified data only.
3. **Reduced Motion**:
   - Always honor `prefers-reduced-motion` and user settings (`setMotionPreference`).
   - Intro animations must support instant bypass under reduced motion and use `sessionStorage` to avoid repeating on every page navigation.

# Zenkai Security Boundaries

## Overview
This document defines the security boundaries between frontend and backend, ensuring that presentation logic never overrides authoritative security decisions. All security enforcement must happen on the backend.

## 1. Core Principles

### 1.1 Non-Negotiable Rules

**Rule 1: No Database Access from Browser**
- Browser-executed code must never:
  - Connect directly to PostgreSQL or another private database
  - Import database clients (Drizzle, pg, better-sqlite3, etc.)
  - Import ORM clients
  - Access database credentials from environment variables
  - Execute raw SQL queries
  - Access private storage credentials

**All database operations must pass through an authorized server-side layer.**

**Verification**: Inspect `frontend/src/` for any import statements referencing database clients or ORM libraries. The only allowed database access is through `src/lib/library.ts` which uses Dexie IndexedDB explicitly documented as local-first.

**Rule 2: No Secrets in the Frontend**
**Never expose** through browser bundles, client-side environment variables, source maps, API responses, or logs accessible to users:
- API keys (AniList, Jikan, TMDB, etc.)
- Database URLs and connection strings
- Private signing secrets
- Provider credentials and tokens
- Internal service tokens
- Administrative tokens
- Private environment configuration variables

**Use server-only environment variables** and server-side modules.

**For Next.js**: A `NEXT_PUBLIC_` variable must never contain a secret. The current frontend has no `NEXT_PUBLIC_` environment variables with secrets — verify by checking all `.env` files and build output.

**Verification**: Run `npx next build` and inspect the generated `.next/` bundle for any leaked secrets. Run `grep -Ri "key\|secret\|token\|password" --include="*.next*" .next/` (should find nothing sensitive).

**Rule 3: Frontend Must Not Enforce Security**
**Never rely on**:
- Hidden buttons or disabled controls as security boundaries
- Client-side role checks
- Local storage permissions
- Client-side subscription checks
- Frontend-only rate limits
- Hidden routes (changing URL doesn't grant access)
- UI visibility conditions (hiding a button doesn't authorize the action)

**The backend must enforce the actual permission.** The frontend may show disabled states as presentation mechanics, but the backend authorizes the action.

**Verification**: Every protected mutation (favorite toggle, library edit, playback execution) must go through backend authorization, not UI state.

**Rule 4: Never Duplicate Authoritative Business Logic**
**Prohibited duplication**:
- Calculating user entitlement independently in the browser
- Reimplementing subscription validity checks
- Deciding whether a user owns a resource
- Determining protected content access
- Calculating authoritative watch history
- Recreating backend filtering rules that affect access or correctness

**The frontend may format, summarize, or present server-provided results.**

**Verification**: Ensure all business logic decisions come from API responses, not recomputed in UI components. Check that `src/lib/library.ts` is the sole authority for library state, not individual components.

**Rule 5: No Fake Persistence**
**Never pretend** that a feature is persistent when it only updates:
- React state
- Context state
- Zustand state
- Local storage
- Session storage
- IndexedDB

These tools may support temporary state or explicitly designed offline functionality, but must not be presented as authoritative backend persistence.

**If an API does not exist, report the limitation rather than fabricating success.**

**Verification**: Check that `src/lib/library.ts` explicitly documents local-first design: "nothing syncs until an accounts phase ships" (P11/P16). The Dexie DB is the authoritative source for local state; backend routes exist for future accounts phase but are not relied upon.

**Rule 6: No Arbitrary Backend Calls from UI Components**
**Do not** scatter fetch calls throughout unrelated UI components.

**Use a consistent API access layer** (`src/lib/api/zenkai.ts` or similar) that handles:
- Request construction
- Response parsing
- Type validation where appropriate
- Error normalization
- Authentication/session handling
- Cancellation
- Timeouts where appropriate
- Retry policies where safe

**Components should consume typed application operations** rather than independently implementing transport behavior.

**Verification**: Ensure all data fetches go through `frontend/src/lib/api/zenkai.ts` or verified hooks like `useHome()`, `useAnimeDetail()`, `useContinueWatching()`, etc.

**Rule 7: Server-Only Modules Must Remain Server-Only**
**Inspect Next.js execution boundaries** carefully.

**Never import** server-only modules into browser-executed code.

**Pay special attention to**:
- Database modules
- Authentication verification
- Private API clients
- File-system access
- Secret configuration
- Server-only SDKs
- Internal service modules

**Use the framework's supported server-only mechanisms where appropriate** (e.g., Next.js `dynamic('import', { ssr: false })` for opt-in client loading, or separate server/client entry points).

**Verification**: Check that `src/lib/api/zenkai.ts` only makes HTTP requests (no database imports). Check that `src/lib/library.ts` only uses Dexie (client-side IndexedDB). Check that no `import` statements in `src/components/` reference server-only modules.

**Rule 8: Do Not Expose Internal Infrastructure**
**The frontend should not receive**:
- Database schema details unnecessarily
- Internal stack traces
- Private infrastructure addresses
- Internal service credentials
- Raw upstream provider errors
- Private server configuration

**Return controlled API responses** with appropriate error codes and safe messages.

**Example of controlled response** (backend error handler):
```json
{ "error": "not_found", "message": "no route for /url" }
```

**Example of unsafe exposure**: Raw AniList GraphQL errors passed through to UI.

## 2. Security Boundary Verification

### 2.1 Automated Checks
1. **Client code importing server-only modules** → ESLint rule
   - `grep -r "import.*from.*@/lib/db" --include="*.tsx" frontend/src/` should return nothing sensitive
   - `grep -r "import.*from.*drizzle" --include="*.tsx" frontend/src/` should return nothing

2. **Database clients imported by browser code** → TypeScript error
   - `grep -r "pg\|drizzle\|kysely" --include="*.tsx" frontend/src/ | grep -v "library.ts"` should return nothing

3. **Secret environment variables referenced by client code** → Build failure or warning
   - `grep -r "NEXT_PUBLIC_" frontend/src/ | grep -v " harmless "` should return nothing meaningful

4. **Server-only SDKs included in client bundles** → Bundle analysis
   - `npx next build && npx source-map-explorer .next/static/js/*.js` to verify no server modules in client bundle

5. **Direct database access from frontend components** → ESLint + TypeScript
   - `grep -r "prisma\|mongoose\|mongoose\|kysely" --include="*.tsx" frontend/src/` should return nothing

6. **Unauthorized direct upstream provider requests** → API contract check
   - Every upstream provider call should go through backend service, not directly from UI

7. **Duplicate API request implementations** → Import analysis
   - Every fetch call should go through `src/lib/api/zenkai.ts`

8. **Missing request validation** → Zod schema coverage
   - Every API call should have corresponding Zod schema validation

9. **Missing authorization on protected mutations** → Auth check middleware
   - Every POST/DELETE endpoint should have `request.user` check

10. **Inconsistent API response contracts** → Schema comparison
    - Every response should validate against Zod schema

### 2.2 Manual Review Items
- [ ] Every protected mutation has auth check on backend
- [ ] Every API response validates against Zod schema
- [ ] No browser code directly accesses Dexie beyond `useContinueWatching` hook
- [ ] No `NEXT_PUBLIC_` variables contain secrets
- [ ] Every mutation has corresponding backend endpoint
- [ ] Every endpoint has Zod request validation
- [ ] Error responses never expose internal details
- [ ] Server-only modules remain server-only (verified by import analysis)
- [ ] No unnecessary business logic has leaked into UI components
- [ ] Existing features still work after all security changes

### 2.3 Security Priority Matrix

| Priority | Issue | Impact | Fix Location |
|---------|-------|--------|--------------|
| P0 | Database access from browser | Critical — data exposure | `src/lib/library.ts` (already local-first) |
| P0 | Secrets in frontend bundles | Critical — credential theft | `src/config/tokens.ts`, `.env` files |
| P0 | Frontend enforces security | Critical — bypassable auth | All protected routes in `backend/src/modules/` |
| P1 | Business logic duplication | Medium — maintenance burden | Move to services (`src/modules/`) |
| P1 | Fake persistence | Medium — user confusion | `src/lib/library.ts` (documented local-first) |
| P2 | Inconsistent API contracts | Low — bugs | `src/lib/api/zenkai.ts` + `src/lib/media.ts` |
| P2 | Missing authorization | Medium — security risk | All protected routes in backend |
| P3 | Code quality issues | Low | Refactoring opportunities |

## 3. Enforcement

### 3.1 CI/CD Checks
```yaml
# Example GitHub Actions check for security boundaries
- name: Check for database clients in frontend
  run: |
    grep -r "import.*from.*@/lib/db" --include="*.tsx" frontend/src/ || echo "PASS: No database clients in frontend"
    
- name: Check for secrets in bundles
  run: |
    npx next build
    grep -Ri "AKIA\|SECRET\|TOKEN" .next/static/ | grep -v "harmless" || echo "PASS: No secrets in bundle"
    
- name: Check auth on protected routes
  run: |
    grep -rn "request.user" backend/src/modules/ --include="*.ts" --include="*.js" | wc -l
    # Should be > 0 for all protected routes
```

### 3.2 Code Review Checklist
- [ ] No database access from browser code
- [ ] No secrets in frontend bundles
- [ ] Backend enforces all authorization
- [ ] Client state not presented as persistent
- [ ] API responses validated at boundaries
- [ ] Server-only modules remain server-only
- [ ] No unnecessary business logic in UI components
- [ ] Existing features still work

### 3.3 Documentation Requirements
- Keep `docs/architecture/` synchronized with actual implementation
- Update when contracts change
- Document new endpoints before implementation
- Record all architectural decisions with rationale

### 3.4 Violation Response
If a security violation is discovered:
1. Document the violation in `docs/architecture/architectural-violations.md`
2. Assign priority (P0, P1, P2, P3)
3. Implement fix in smallest safe way
4. Add CI check to prevent regression
5. Update documentation
6. Run full test suite to verify no regressions

---
*This document is derived from the actual Zenkai repository structure and verified implementation. It must be kept synchronized with code changes.*

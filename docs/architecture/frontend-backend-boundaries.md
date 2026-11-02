# Zenkai Frontend-Backend Boundaries

## Overview
This document defines the strict separation between frontend (client) and backend responsibilities in the Zenkai application. It ensures maintainability, security, and scalability by clearly delineating which layer owns what functionality.

## 1. Frontend Responsibilities

### 1.1 User Interface
- Page layouts and navigation menus
- Dropdowns, modals, and dialogs
- Buttons and interactive controls
- Loading indicators and skeleton screens
- Toast notifications and error messages
- Animations and transitions
- Responsive layouts adapting to viewport
- Theme selection and presentation preferences

### 1.2 Client-Side Interaction
- Form input management and temporary state
- Search input interaction and results presentation
- Sorting already-loaded display data
- Client-side filtering of bounded datasets
- Tab selection and interface state
- Pagination controls and player controls
- Keyboard shortcuts and scroll position
- Display preferences and user settings

### 1.3 Client-Side Validation (Usability Only)
- Required field indicators
- Input formatting (e.g., email format)
- Basic type checks
- Password confirmation feedback
- Immediate user feedback messages
- Friendly validation messages

**Important**: Client-side validation is only for usability. The backend must independently validate every security-sensitive or business-critical input.

### 1.4 Client-State Management
Use client state for temporary interface state:
- Is the navigation menu open?
- Which tab is selected?
- Is a modal visible?
- What is the current search input?
- Which episode is selected?
- Is the player currently displaying controls?
- Which filter is currently selected?

Use URL state where appropriate for shareable navigation and filters.
Use persistent client storage (Dexie IndexedDB) only for appropriate non-sensitive preferences.

**Never treat browser state as authoritative proof of**:
- Identity
- Entitlement
- Permissions
- Ownership

## 2. Backend Responsibilities

### 2.1 Security and Identity
- Authentication (login, session verification)
- Authorization (role/permission enforcement)
- Ownership verification (does user own this resource?)
- Access control lists
- Token validation and refresh
- API abuse prevention
- Security-sensitive rate limiting

### 2.2 Business Logic
- Subscription and entitlement decisions
- Account restrictions and limitations
- Content availability rules
- Watch-history processing and calculations
- Continue-watching determinations
- Favorite persistence and management
- User-specific recommendations (when based on protected data)
- Business rules and eligibility checks
- Data consistency rules
- Any operation producing an authoritative result

### 2.3 Data Management
- Database connections and pooling
- Database queries (PostgreSQL via Drizzle ORM)
- Data insertion, updates, and deletions
- Database transactions
- Data migrations
- Persistent user settings and preferences
- User profiles and their persistence
- Watch progress tracking
- Favorites/Watchlist management
- Ratings and reviews
- Audit records

### 2.4 API Responsibilities
- Request validation (Zod schemas)
- Response construction with controlled schemas
- Error handling with appropriate status codes
- Pagination enforcement
- Filtering against authoritative data
- Cache policy (TTL, stale-while-revalidate)
- Rate limiting (per-user, per-endpoint)
- Request authorization
- Idempotency where necessary
- External API orchestration

### 2.5 Secrets and Integrations
- **Never expose** through browser bundles, client-side environment variables, source maps, API responses, or logs accessible to users:
  - API keys and secrets
  - Database URLs
  - Private signing secrets
  - Provider credentials (AniList, Jikan, etc.)
  - Internal service tokens
  - Administrative tokens
  - Private environment configuration
- Use server-only environment variables (`NODE_ENV` contexts)
- Server-side modules only (`import from '@/lib/server/*'`)

## 3. Shared Responsibilities

### 3.1 Shared Type Definitions
- TypeScript type definitions for API contracts
- Can be shared between frontend and backend
- **BUT**: Runtime validation at trust boundaries is mandatory
- Shared types do NOT replace backend validation

### 3.2 Pure Utilities
- Formatting functions (date, number, currency)
- Deterministic transformations
- Serialization helpers
- Simple utility functions

**Rules**:
- A shared type does NOT mean shared execution
- A shared validation schema does NOT mean client validation is authoritative
- Client-side validation is only for usability; backend validation is authoritative

## 4. Execution Boundaries

### 4.1 Server Components (Next.js App Router)
**Preferred for**:
- Initial data retrieval on page load
- Server-rendered pages
- Non-interactive content
- Server-only data access
- Reducing unnecessary client JavaScript

**Never import** server-only modules into browser-executed code.

### 4.2 Client Components
**Use for**:
- Interactive state and event handlers
- Browser APIs (localStorage, sessionStorage)
- Animations and transitions
- Player controls and playback interface
- Menus and dialogs
- Client-side navigation interactions

**Do not** mark entire page trees as client components merely because one small component needs interaction. Extract the interactive portion.

### 4.3 Route Handlers (App Router)
**Use for**:
- HTTP API endpoints
- Validated request processing
- Controlled responses
- Server-side operations

**Do not** duplicate existing backend endpoints by creating unnecessary route handlers.

### 4.4 Server Actions
**Use only** when they fit the existing architecture and security requirements.
**Never** treat Server Actions as automatically secure simply because they execute on the server.
**Must**: Validate input, authenticate, authorize, and protect mutations.

### 4.5 Middleware
**Use for**:
- Suitable request-level concerns (auth checks, i18n, logging)
- Do not move complex business logic or database workflows into middleware without demonstrated need.

## 5. Shared Code Guidelines

### 5.1 What Can Be Shared
- Type definitions (with runtime validation at trust boundaries)
- Pure formatting functions
- Non-sensitive constants
- UI-independent validation schemas
- Serialization helpers
- Simple deterministic transformations

### 5.2 What Must NOT Be Shared
- Database clients with browser code
- Secret configuration
- Server authentication internals
- Private provider clients
- Server-only business services
- Environment-dependent modules without explicit boundaries

**Organization**: Keep shared modules in `shared/` with clear `server/` and `client/` subdirectories. Use explicit import paths and never assume shared code can be executed in both environments.

## 6. Request Flow Diagram

```
USER INTERACTION
    ↓
FRONTEND COMPONENT (Client)
    ↓
CLIENT-SIDE API LAYER (/api calls)
    ↓
AUTHENTICATION CHECK (if required)
    ↓
REQUEST VALIDATION (Zod schemas on backend)
    ↓
BUSINESS/SERVICE LAYER
    ↓
REPOSITORY/DATA ACCESS LAYER
    ↓
DATABASE OR EXTERNAL PROVIDER
    ↓
SERVER RESPONSE (controlled JSON)
    ↓
FRONTEND DATA TRANSFORMATION
    ↓
UI STATE UPDATE
    ↓
USER SEES RESULT
```

## 6. Key Principles

### Principle 1: No Database Access from Browser
Browser-executed code must never:
- Connect directly to PostgreSQL or another private database
- Import database clients (Drizzle, pg, etc.)
- Import ORM clients
- Access database credentials
- Execute raw SQL
- Access private storage credentials

**All database operations must pass through an authorized server-side layer.**

### Principle 2: No Secrets in the Frontend
**Never expose** through browser bundles, client-side environment variables, source maps, API responses, or logs accessible to users:
- API keys
- Database URLs
- Private signing secrets
- Provider credentials
- Internal service tokens
- Administrative tokens
- Private environment configuration

**Use server-only environment variables and server-side modules.**

For Next.js: A `NEXT_PUBLIC_` variable must never contain a secret. Verify actual usage and exposure.

### Principle 3: Frontend Must Not Enforce Security
**Never rely on**:
- Hidden buttons or disabled controls
- Client-side role checks
- Local storage permissions
- Client-side subscription checks
- Frontend-only rate limits
- Hidden routes
- UI visibility conditions

**The backend must enforce the actual permission.** The frontend may show disabled states as presentation, but the backend authorizes the action.

### Principle 4: Never Duplicate Authoritative Business Logic
**Prohibited duplication**:
- Calculating user entitlement independently in the browser
- Reimplementing subscription validity checks
- Deciding whether a user owns a resource
- Determining protected content access
- Calculating authoritative watch history
- Recreating backend filtering rules that affect access or correctness

**The frontend may format, summarize, or present server-provided results.**

### Principle 5: No Fake Persistence
**Never pretend** that a feature is persistent when it only updates:
- React state
- Context state
- Zustand state
- Local storage
- Session storage
- IndexedDB

These tools may support temporary state or explicitly designed offline functionality, but must not be presented as authoritative backend persistence.

**If an API does not exist, report the limitation rather than fabricating success.**

### Principle 6: No Arbitrary Backend Calls from UI Components
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

### Principle 7: Server-Only Modules Must Remain Server-Only
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

### Principle 8: Do Not Expose Internal Infrastructure
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

---

## 6. Violation Detection Checklist

Automated checks to implement:

1. Client code importing server-only modules
2. Database clients imported by browser code
3. Secret environment variables referenced by client code
4. Server-only SDKs included in client bundles
5. Direct database access from frontend components
6. Unauthorized direct upstream provider requests
7. Duplicate API request implementations
8. Missing request validation
9. Missing authorization on protected mutations
10. Inconsistent API response contracts

**Tooling**: ESLint, TypeScript, framework-supported server-only checks, dependency boundary rules, build output inspection, automated tests, secret scanning, dependency auditing.

---

## 7. Enforcement

### CI/CD Checks
Add checks to prevent architectural violations:

```yaml
# Example GitHub Actions check
- name: Check for server-only imports in client code
  run: |
    grep -r "import.*from.*@/lib/db" --include="*.tsx" frontend/src/ || echo "PASS"
    grep -r "import.*from.*@/lib/api" --include="*.tsx" frontend/src/ || echo "PASS"
```

### Code Review Checklist
- [ ] No database access from browser code
- [ ] No secrets in frontend bundles
- [ ] Backend enforces all authorization
- [ ] Client state not presented as persistent
- [ ] API responses validated at boundaries
- [ ] Server-only modules remain server-only

### Documentation Requirements
- Keep `docs/architecture/` synchronized with actual implementation
- Update when contracts change
- Document new endpoints before implementation
- Record all architectural decisions with rationale

---
*This document is derived from the actual Zenkai repository structure and verified implementation. It must be kept synchronized with code changes.*

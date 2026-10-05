# P12 — Home / Discovery: canonical backend migration

Phase record for P12. Inputs: the P11 evidence set
(`android-parity-sources.md`, `android-parity-contract.md`,
`android-parity-api-map.md`, `android-parity-roadmap.md`,
`android-parity-tests.md`). No backend contract was changed; no new frontend
provider abstraction was introduced.

## What changed

The Home surface (`/`) no longer calls metadata providers from the browser.
Every shelf reads the canonical Zenkai API through one new boundary module:

```
frontend/src/app/(main)/page.tsx        composition: shelves + states
frontend/src/hooks/use-home.ts          React Query hooks (home/genres/manga)
frontend/src/lib/api/zenkai.ts          THE canonical API boundary
frontend/src/components/home/*          presentational components
```

## Home frontend data flow

```
HomePage
   ↓ useHome()
zenkai.ts (fetch + zod contract validation)
   ↓
GET {NEXT_PUBLIC_ZENKAI_API_URL:-http://localhost:4000}/api/v1/home
GET /api/v1/genres
GET /api/v1/manga
```

- One `GET /api/v1/home` request feeds hero/trending/seasonal/topRated/
  upcoming. The backend composes the shelves and degrades each section
  independently; the browser adds no second aggregation layer.
- The continue rail stays local (Dexie). No backend endpoint exists and none
  is proposed (P11 API map).
- Provider pages (`anime`, `manga`, `search`, `schedule`, detail, player,
  reader) still use the legacy direct-provider stack; P12 scope was Home only
  (P11 roadmap).

## Canonical Home API dependency

| Shelf | Endpoint | Note |
|---|---|---|
| Hero + Trending | `GET /api/v1/home` → `trending` | hero is a projection of the trending shelf |
| Popular This Season | `GET /api/v1/home` → `seasonal` | backend derives the current season window |
| All-Time Top Rated | `GET /api/v1/home` → `topRated` | |
| Most Anticipated | `GET /api/v1/home` → `upcoming` | canonical schedule; no client-side airing math |
| Browse by genre | `GET /api/v1/genres` | catalogue genres, not a hard-coded list |
| Top Rated Manga & Novels | `GET /api/v1/manga` | database-backed listing |

## Home state semantics

`zenkai.ts` validates every response against the P2 contract and maps each
home section to a `ShelfState` the UI renders verbatim:

| Backend fact | ShelfState | UI |
|---|---|---|
| request in flight | `loading` | skeleton cards |
| `status:"ok"`, items present | `items` | cards |
| `status:"ok"`, no items | `empty` | "Nothing here right now" |
| `status:"unavailable"` (+ reason) | `unavailable` | "temporarily unavailable… not an empty shelf" |
| HTTP error / unreachable | `error` | "Could not load this shelf" |
| payload fails the contract | `error` (ZenkaiContractError) | same as error — never rendered as data |

Unavailable is never flattened into empty; backend errors are never converted
into `[]`; malformed payloads are rejected rather than rendered with invented
defaults. Null metadata (score, episodes, season) renders as absent — never
as zero.

## Card mapping

`discoveryCardToMedia` / `mangaCatalogueItemToMedia` map the canonical card
onto the provider-neutral `MediaSummary` (`provider: "zenkai"`). The routing
id is the card's cross-reference id (`anilistId`, falling back to the
catalogue id) because detail/watch routes address titles by it today; P13/P14
will revisit addressing. Card fields render only what the contract defines.

## Remaining unmigrated frontend provider paths

Unchanged in P12, tracked for their own phases (P11 roadmap):

- `lib/api/anilist.ts` + `lib/schemas/anilist.ts` — used by search (P15),
  browse (P15), schedule (P12 left as-is), detail (P13), player (P14),
  read route (P17)
- `lib/api/mangadex.ts` + `lib/schemas/mangadex.ts` — reader/manga (P17)
- `lib/api/aniskip.ts` — player skip markers (P14; backend `/metadata` is
  canonical)
- `lib/sources/registry.ts` + `resolver.ts` — player sources (P14; backend
  plans/execute is canonical)
- `config/api-list.ts` — documentation registry only (not a violation)

Home components no longer import any of these. `test/home-boundary.test.ts`
is the standing regression gate: it fails if a home module imports a provider
module, references a provider host, or carries a credential.

## Verification (P12)

- Backend tests: 279 pass (pre-existing suites untouched).
- Frontend tests: 27 pass (`npm test`, new P12 suites).
- TypeScript: clean. Production build: clean.
- Lint: 21 problems, all pre-existing in files outside P12 scope; the
  migration itself removed two pre-existing warnings (unused imports in the
  home banners).
- Browser verification: Home renders canonical data; network shows only the
  three canonical API calls (image CDN hosts inside canonical `coverUrl`
  values are server-supplied content, not API calls); console clean; backend
  failure renders the error state, never a fake empty.
- Fresh-DB verification: fresh database → migrations → isolated backend →
  `/home` → populated/empty shelves render correctly in the browser.
- Sabotage matrix A–E: all DETECTED, all mutations reverted.

## Scope notes

- Shelf order preserves the existing page composition; exact Android shelf
  order is UNKNOWN (P11) and nothing claims parity with it.
- No schema changes; no backend contract changes (Rule 6/26/27).

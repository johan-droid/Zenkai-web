# P13 — Anime Detail / Title page: canonical backend migration

Phase record for P13. Inputs: the P11 evidence set and the P12 verification.
One backend defect was exposed and fixed in this phase (see "Backend defect:
unknown title returned 502"). One UI regression test of behaviour preserved in
the record. No new frontend provider abstraction was introduced; the existing
canonical boundary in `frontend/src/lib/api/zenkai.ts` was extended.

## What changed

The anime detail page (`/anime/[id]`) no longer calls metadata providers from
the browser. It reads the canonical Zenkai API through the same boundary as
Home (P12):

```
frontend/src/app/(main)/anime/[id]/page.tsx     composition (server component)
frontend/src/components/detail/anime-detail-view.tsx   canonical anime detail
frontend/src/components/detail/detail-layout.tsx       shared presentational layout
frontend/src/lib/api/zenkai.ts                         canonical API boundary (extended)
frontend/src/lib/media.ts                              DetailData / DetailAiring types
```

`media-detail-view.tsx` was restricted to manga (its caller is the manga
route); it still imports `getMediaById` and is untouched on the manga path
until P17.

## Anime detail data flow

```
AnimeDetailView
   ↓ detail query + episodes query + navigation
zenkai.ts (fetch + zod contract validation)
   ↓
GET {NEXT_PUBLIC_ZENKAI_API_URL:-http://localhost:4000}/api/v1/anime/:id
GET {NEXT_PUBLIC_ZENKAI_API_URL:-http://localhost:4000}/api/v1/anime/:id/episodes
   ↓
client-side keyboard navigation (arrow keys) across the episode grid
```

- Function props cannot cross the server/client boundary, so the view owns its
  queries rather than receiving them as props; the page component renders
  `<AnimeDetailView id={...} />` and stays thin.
- Two requests, independent failure states, no client-side airing math: the
  next-airing badge comes straight from the canonical `nextAiringEpisode`.
- Provider pages still on the legacy stack (search P15, schedule P12-leaves,
  player P14, reader P17).

## Canonical field mapping (AniList node → detail UI)

| Detail surface | Canonical backend field | Note |
|---|---|---|
| routing id | `anilistId` (cross-reference) | address space unchanged |
| title | `canonicalTitle` | no native-title fallback on the canonical path |
| cover | `coverImageLarge ?? coverUrl` | never a missing-image placeholder for a real title |
| format / status badges | `format`, `status` | null → absent, never zero |
| description | `description` (stripped) | |
| episode count | catalogue rows (`episode.id`) | count = rows keyed by id, never array index |
| episode grid | `/episodes` → `episodes[]` | number + airState, titles/thumbnails when known |
| airing badge | `nextAiringEpisode.{episode,airingAt}` | RELEASING only |
| relations | `relations[]` → `type` + relation media titles/covers | SEQUEL/PARENT/SPIN_OFF cards |
| recommendations/characters | `[]` | sections hidden, nothing fabricated |

## Canonical API dependency

| Surface | Endpoint |
|---|---|
| Detail | `GET /api/v1/anime/:id` |
| Episode grid + navigation | `GET /api/v1/anime/:id/episodes` |

Both keyed by the URL id (an AniList id today). Empty legitimate grid (a
RELEASING title not yet catalogued) renders an empty episode list with its air
state, not a failure.

## Detail state semantics

`zenkai.ts` validates every response with zod denormalised from the P2
contract and maps failures via `classifyDetailError` / `DetailFailure`:

| Backend fact | DetailFailure | UI |
|---|---|---|
| request in flight | `loading` | skeleton |
| detail + episodes ok | `ready` | full page |
| HTTP 404 | `not_found` | "Title not found — may have been removed from the provider" |
| payload fails the contract | `invalid_response` | never rendered as data |
| HTTP 5xx / provider unavailable | `unavailable` | "Could not load" + Try again |

Backend errors are never converted into a fake empty; a 404 is never shown as
"provider down". The episodes list and the detail block fail independently.

## Backend defect exposed and fixed (Rule 21)

AniList answers an unknown Media id with an **HTTP 404** whose body still
carries `data: { Media: null }`. `fetchJson` surfaced every non-2xx as
`upstream_error → 502`, so `/api/v1/anime/:id` for a dead id reported "provider
down" — the 404 the route should return was unreachable, and the detail page
could never show "Title not found".

Fix (smallest correct layer): `AnilistProvider.getByAnilistId` now recognises
the 404 whose body has `data.Media === null` as a definitive absence and
returns `null`, which `getFull`/`getEpisodes` turn into `AppError.notFound`
(404). A 404 without a parseable evidence body still propagates as
`upstream_error`. Only the single-Media lookup is affected; browse/search
semantics are untouched.

Regression coverage: `backend/test/anilist-provider.test.ts` (3 tests) pins the
HTTP-404-with-null-Media → `null` mapping, the happy detail path, and the
errors-without-data → 502 guard.

## Remaining unmigrated frontend provider paths

Unchanged in P13, tracked for their own phases:

- `lib/api/anilist.ts` — search/browse (P15), schedule (P12 scope), player (P14)
- `lib/api/mangadex.ts` — reader/manga detail remains on `media-detail-view` (P17)
- `lib/api/aniskip.ts`, `lib/sources/*` — player (P14; backend canonical)
- `config/api-list.ts` — documentation registry only

`test/detail-boundary.test.ts` is the standing regression gate: it fails if an
anime-detail module imports a provider module, references a provider host,
or carries a credential, and asserts the anime page renders the canonical view.

## Verification (P13)

- Backend tests: 282 pass (279 pre-existing + 3 new provider-semantics tests).
- Frontend tests: 48 pass (`npm test`, new P13 suites).
- TypeScript: clean (both). Production build: clean.
- Browser verification (Playwright): `/anime/16498` renders title, cover,
  description, format/status badges, SEQUEL relation card, 25-episode grid
  with keyboard-navigable entries, and an episode link that routes to
  `/watch/16498/1`. `/anime/209219` renders the airing badge (RELEASING,
  EP 3). `/anime/999999999` renders "Title not found". Network shows only the
  two canonical API calls per view; no AniList/provider/playback requests.
- Sabotage: an injected provider import into `anime-detail-view.tsx` is
  DETECTED by `detail-boundary.test.ts`; mutation reverted.

## Scope notes

- No schema changes. One backend provider change (the Rule-21 defect fix
  above); no backend contract changes.
- Manga detail keeps the legacy provider view until P17; the shared layout
  (`detail-layout.tsx`) is presentational and imports no provider/client code.
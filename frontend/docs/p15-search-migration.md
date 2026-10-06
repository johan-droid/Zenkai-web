# P15 — Canonical anime search

Phase record for P15. Inputs: P11 evidence matrix, P12 home migration,
P13/P14 canonical clients, and the product-parity criterion in
`frontend/docs/product-parity.md`.

The frontend search experience reached AniList from the browser. It now reaches
the catalogue only through `GET /api/v1/anime/search`, behind one canonical
client that both search surfaces share.

## What changed

```
frontend/src/lib/api/zenkai.ts            + fetchAnimeSearch, searchState
frontend/src/components/search/search-view.tsx     canonical page
frontend/src/components/search/search-command.tsx  canonical palette
frontend/src/components/ui/command.tsx    palette crash fix (see below)
frontend/test/search-client.test.ts       contract + state tests
frontend/test/search-boundary.test.ts     standing architectural gate
backend/src/modules/anime/repository.ts   row -> card projection
backend/src/modules/anime/service.ts      one shape from either branch
backend/src/modules/anime/routes.ts       search contract
backend/test/anime-search.test.ts         the defect's regression test
```

## The backend contract defect this had to fix first

`AnimeService.search` answered with **two different shapes**. Postgres returned
full catalogue rows; the provider fallback returned raw AniList objects. So the
response type depended on cache state, and no single Zod schema could describe it
honestly. The frontend could not be migrated onto that.

The fix is normalisation, not a redesign: the row → card projection already
written inside `listCards` was extracted to `rowToCard` and reused by `search`,
and the fallback branch now maps provider summaries through the existing
`toCard`. Both branches answer with the same `DiscoveryCard`, so search results
are literally the same records home shelves render — one schema, one UI model.

`AnimeService.search`'s provider branch is unchanged in behaviour otherwise: it
still persists results before returning, and a failed write still does not fail
the response.

`/api/v1/manga/search` has the identical defect and is untouched here — see
Scope below.

## Scope decision: why there is no Manga tab

The search page had Anime/Manga kind tabs, both calling `browseMedia`. Migrating
only anime would have left a provider call inside the migrated file, and leaving
both alone would have migrated nothing. Per phase decision, **P15 is anime-only**
and the Manga tab is removed until P17, which owns manga and fixes that endpoint
the same way. The palette's copy was corrected so it no longer advertises manga
search that it does not do.

This is a deliberate, temporary product regression, recorded here rather than
hidden.

## States

`searchState()` folds the query lifecycle into one discriminated union —
`idle | loading | empty | items | error` — so the components cannot collapse an
outage into "no matches". Error outranks data on purpose: a failed refetch must
not leave the previous term's results on screen looking like the answer to the
new one.

The failure copy is deliberately worded so it never restates a count. The first
draft said "this is not the same as no matches", which a test rejected for
containing the phrase it was trying to avoid.

## Preserved behaviour

A migration, not a redesign. The 350ms debounce, the two-character minimum, the
idle and empty copy, the trending shelf in the palette and the cross-reference
routing are all as they were. The threshold now lives in one place
(`SEARCH_MIN_LENGTH`) instead of a literal in two components.

## The palette was broken before this phase

`CommandDialog` rendered its children without a `<Command>` wrapper, so cmdk
never established its context. Opening ⌘K threw `Cannot read properties of
undefined (reading 'subscribe')` and the palette had never worked. Found by
opening it during browser verification, fixed in the shared primitive, and
confirmed in the browser.

## Verification

Backend 293/293, frontend 109/109, both typechecks clean, production build
clean, lint unchanged at the pre-P15 baseline (7 errors / 4 warnings, same files
— zero new debt).

Live browser, seeded database: search → result → `/anime/16498` → episode →
canonical sources → `POST /playback/execute` → player, plus server switch and a
sub→dub language change re-resolving sources. Exactly one canonical search
request; zero AniList/AniSkip/MangaDex API calls. Debounce measured at 6 rapid
keystrokes → 1 request. Empty state, 503 error state and palette-under-503 all
verified in the browser with mocked responses.

Live fresh database (migrations only, empty catalogue): search served entirely
from the provider fallback returned canonical cards — no raw row, no raw provider
shape — and integrated through detail and the episode catalogue.

Sabotage A–F all detected. Two of them initially passed and the gates were
strengthened rather than the results being accepted: C (a page taught to report
`isError: false` fooled the structural check) and D (dropping the term from the
cache key).

## Known limitations

- No manga search until P17.
- Cover and banner **images** still load from AniList's CDN. The frontend never
  constructs those URLs — they arrive as catalogue metadata in the canonical
  response, and they are stable public image URLs rather than API calls. Routing
  every image through the backend would mean new image-proxy infrastructure,
  which is outside this phase. The same applies to home and detail.
- `/anime` and `/manga` browse still call the legacy provider client. Home was
  migrated in P12; browse is a separate surface.
- `lib/sources/registry.ts` and `lib/sources/resolver.ts` are now imported by
  nothing, since P14 removed the watch path's last consumer. Dead, not deleted.
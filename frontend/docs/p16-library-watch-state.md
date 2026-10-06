# P16 — Library / watch state

Phase record for P16. Inputs: P11 evidence matrix, P11 roadmap P16 scope, and
the product-parity criterion in `frontend/docs/product-parity.md`.

## What this phase actually was

The phase brief assumed library and watch state would be migrated onto canonical
backend endpoints. **There are none, and there are not supposed to be.** The
schema has no library, progress, favourites or user table, and three P11 sources
say so deliberately:

- roadmap P16 — "*Local-first* … **Rule: nothing syncs until an accounts phase
  ships**"
- contract — watchlist/library web support is "*YES (local Dexie)*", server sync
  UNKNOWN
- contract — "*removal semantics must exist*"

There is also no user identity, so server-owned library state would have to be
either globally shared or need a new anonymous-token subsystem. That is the
account system the phase's own stop-rule forbids inventing. Confirmed with the
phase owner before writing code.

So "canonical" here means the part that is actually enforceable: one validated
boundary, canonical identity, distinct states, and playback data kept out —
while persistence stays on the device, as documented.

## What changed

```
frontend/src/lib/library.ts               NEW  validated boundary (P16)
frontend/src/app/(main)/library/page.tsx        boundary + removal + error state
frontend/src/components/detail/detail-layout.tsx  removal on a saved title
frontend/src/components/settings/preferences-panel.tsx  validated import
frontend/src/lib/db/progress.ts                  continue-rail roll-forward fix
frontend/test/library-contract.test.ts    NEW  schemas, identity, import, states
frontend/test/library-boundary.test.ts    NEW  standing architectural gate
```

## The real defect: imports were never validated

`importData` merged a parsed JSON file straight into IndexedDB with no schema
check. An export file is hand-editable and travels between installs, so a file
carrying `streamUrl`, `provider` or a token would have been persisted — the local
equivalent of the thing the backend's storage policy forbids in Postgres.

Import/export now live in the boundary behind `.strict()` schemas and are
validated with `parseImport`, never cast. Both entry points are covered: the
library page and the settings panel. The blind `importData` is gone rather than
merely unused.

## Removal semantics (P16 requirement, previously absent)

A title could be added from its detail page but never removed from anywhere.
There is now a per-card remove control and a "Remove from library" item on the
detail page.

Removal deletes the library row and deliberately **not** the watch progress:
membership in a list and how far someone got in an episode are separate facts,
and clearing a "plan to watch" entry must not destroy their position.

## Continue-watching roll-forward fix

The rail rolled a finished episode forward to `unit + 1` unconditionally, so a
show whose final episode was finished produced an entry for an episode that does
not exist. When the catalogue count is known and the finished unit is the last
one, the title now leaves the rail. Verified in the browser with a seeded
two-episode show: it is correctly absent, while a finished mid-series episode
still rolls forward.

## Mobile defect caught in the browser

The remove control was `opacity-0 group-hover:opacity-100` — invisible on touch,
where there is no hover to reveal it, at 28×28px. It is now always visible at
36×36. Only found by measuring the rendered element at a 390px viewport.

## States

`libraryState()` returns `loading | empty | items | error`, mirroring P15's
`searchState`. A read failure is caught and carried as data rather than
rethrown, so it renders as a state instead of needing an error boundary, and an
unreadable store is never shown as an empty library.

## Verification

Backend 293/293 (unchanged), frontend 152/152, both typechecks clean, production
build clean. Lint unchanged at the pre-P16 baseline: 7 errors / 4 warnings, same
files, zero new debt. The backend storage-policy gate still passes.

Browser, real user journey: anime detail → add to library → library shows it →
reload → still there → remove → gone → reload → still gone. Detail page removal
verified. The `/library` page issues **zero network requests**, which is the
correct result for a device-local surface. Desktop 1440×900 and mobile 390×844
both checked for overflow, control visibility and touch target size. No console
errors.

Fresh database: the cross-reference ids the browser library holds (16498,
1535) both resolve to real catalogue titles on `zenkai_p16_fresh`, seeded purely
from the provider fallback. Worth stating plainly — had the library stored the
local catalogue uuid instead, every entry would have been orphaned by a database
rebuild. The identity choice is what makes saved titles portable.

Sabotage A–H all detected. Three gates were wrong before they were right, and in
one case the sabotage found a genuine code defect rather than only a weak test:

- **F** passed: removal swallowed failures, leaving a title on screen looking
  removed. Fixed the handler to report the failure, then added the gate.
- **B** and **H** initially failed on *clean* files — my own helpers were wrong.
  One matched a doc comment; the other truncated the function body at the
  `}): Promise<void> {` line because `"\n}"` matches it too.

## Known limitations

- The full browser journey was not run against a fresh database in one stack.
  Next refuses a second dev server per directory and Turbopack rejects an
  out-of-tree `node_modules` symlink, so the fresh-DB catalogue was verified at
  the API level and composed with the browser evidence. Since the library page
  makes no requests at all, a fresh database cannot affect library state.
- Dexie write paths are not unit-tested; there is no IndexedDB implementation
  under `node:test` and adding `fake-indexeddb` would be a new dependency for
  this phase. Writes are covered by the browser journey instead.
- Status vocabulary remains a documented web proposal; the Android set is
  UNKNOWN.
- Manga library rows are supported by the schema but the manga surfaces are P17.
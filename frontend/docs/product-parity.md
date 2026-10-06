# Product parity: Zenkai Web ≈ Nyyrox/Zenkai

Standing acceptance criterion for P15–P20. Read this before starting a UI phase.

## Objective

> **Zenkai Web ≈ Nyyrox/Zenkai in product feel and user flow, while using our own
> canonical web architecture underneath.**

Two halves, both required. Neither substitutes for the other:

```
                      ZENKAI WEB
                          │
            ┌─────────────┴─────────────┐
            │                           │
       PRODUCT LAYER              ARCHITECTURE
            │                           │
   Home, discovery, detail,       Backend owns providers
   episodes, watch, search,       Dynamic source resolution
   library, manga, reader,        No frontend provider calls
   settings, responsive feel      No media storage
                                  Ephemeral playback URLs
```

Not "a generic anime website that happens to have Zenkai's backend", and not
"Nyyrox's UI with our plumbing". Both halves ship together.

## Per-phase acceptance criterion

A UI phase is not done on green tests alone. It is done when both hold:

1. **Architecture gates** — the standing tests pass: provider-isolation
   boundary gates, Zod contract validation, canonical routing, storage policy
   (`backend/test/persistence-policy.test.ts`), typecheck, build, no new lint.
2. **Observable product behavior** — the surface a user touches matches the
   Zenkai product concept: layout and discovery philosophy, card and metadata
   presentation, detail → episodes → watch flow, search experience,
   library/watch-state, manga reading, settings, navigation structure,
   loading/empty/error states, episode/source selection, airing behavior,
   continue-watching, responsive interactions, dark/mobile-first feel.

The test for the second half is a question, not a checklist:

> Would this feel like the same product if a Zenkai Android user opened the
> website?

"Technically works" is not the bar. Neither is "matches Nyyrox pixel for
pixel" — see the boundary below.

## Migration must preserve product feel

A phase that migrates a surface to the canonical backend is a *migration*, not a
rewrite. If the pre-migration UX already had the right feel, keep it and change
only the data source. Do not degrade a working interaction because the canonical
response is shaped differently — adapt the mapping, not the experience.

## Do not invent undocumented behavior

P11's evidence matrix is the authority:
`backend/docs/android-parity-contract.md` (hierarchy and per-behavior rows) and
`backend/docs/android-parity-sources.md` (source grading).

```
CONFIRMED   → reproduce
SUPPORTED   → reproduce
INFERRED    → simplest compatible behavior
UNKNOWN     → do not pretend to know
```

An UNKNOWN is not a requirement and not a license to guess. If a behavior is
UNKNOWN, either pick the simplest web-native option and record it as a web
choice, or leave it out. The official Nyyrox repository does not expose the
original Android UI source, so a confident-looking Android behavior that no
source supports is a fabrication.

Web-specific choices (debounce thresholds, hero rotation, skeleton shapes,
layout order within an UNKNOWN) are legitimate — label them as web choices in
the phase record so they are not later mistaken for Android facts.

## Boundary: parity is not copying

Reproduce the observable product concept and documented/evidenced behavior.
Do not copy proprietary assets, private source, or undocumented internals. Our
implementation is our own.

## Cross-references

- Phase scope and order: `backend/docs/android-parity-roadmap.md`
- Evidence matrix: `backend/docs/android-parity-contract.md`, `-sources.md`
- Phase records: `frontend/docs/pNN-*.md`
- Storage policy (architecture half): `backend/test/persistence-policy.test.ts`
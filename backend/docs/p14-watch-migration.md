# P14 — Episode + Watch + Playback: canonical backend migration

Phase record for P14. Inputs: P11 evidence set, P12 home-migration record,
P13 anime-detail record. No new backend contract change was required: P7/P8/P10
already held the authoritative playback contract and it was consumed as-is.
All testing in this phase is interface-level: mocked canonical backend for
plain function tests (node:test), the live backend for browser verification,
static boundary scans for the architectural gate. No provider websites are
contacted from tests.

## What changed

The `/watch/:id/:episode` page renders a new canonical view; it no longer
imports AniList/AniSkip, the local source resolver, or the built-in registry.
Every byte comes from the Zenkai backend:

```
frontend/src/app/(main)/watch/[id]/[ep]/page.tsx   params -> WatchView
frontend/src/components/player/watch-view.tsx       canonical watch orchestration
frontend/src/components/player/video-player.tsx       media execution player
frontend/src/components/player/embed-player.tsx       iframe execution renderer
frontend/src/components/player/source-switcher.tsx    ranked server + language UI
frontend/src/components/player/episode-list.tsx       canonical catalogue rendering
frontend/src/stores/player.ts                         persisted player settings
frontend/src/lib/api/zenkai.ts                        canonical API boundary (extended)
frontend/test/watch-boundary.test.ts                  standing architectural gate
frontend/test/playback-client.test.ts                 P7/P8/P10 contract tests
```

`usePlayerStore.audio` now uses the canonical language values
(`sub | dub | multi`). Preferred-source and last-candidate story values were
removed: source selection is server-ranked on every request, and a stale local
preference was precisely the failure mode the strict execution boundary
guards against.

## Canonical watch flow

```
GET /api/v1/anime/:id            title/sidebar render (shared cache key with P13)
GET /api/v1/anime/:id/episodes   catalogue: find episode by episodeNumber -> canonical id
(airing gate)                    airingState === "upcoming" -> unreleased UI, no source call
GET /api/v1/episodes/:id/sources?language=    ranked PlaybackSource[] + PlaybackPlan[]
GET /api/v1/episodes/:id/metadata  skip markers + subtitles (P10, replaces AniSkip)
GET /api/v1/anime/:id/episodes/:number/navigation   canonical prev/next
POST /api/v1/playback/execute    { episodeId, sourceId, language } -> PlaybackExecution
```

The route keeps the same address format as the detail page
(`/watch/:anilistId/:episodeNumber`): the cross-reference id is the routing
id, and the episode's canonical UUID is resolved internally via the catalogue
and never appears in the URL. "Resolve the identity, not the number" — the
client never fabricates an episode id, never computes prev/next as `number ±
1`, and never reads a provider id out of the shelf.

## Episode identity

The URL's `:ep` segment is a 1-based episode number. The catalogue rows carry
the canonical `episode.id` (uuid). Sources, execution, metadata all receive
that canonical id. `episodeNumber` appears only in navigation and rendering,
never for a provider call.

## Airing gate

`isUnreleased()` (airingState === "upcoming") gates both the sources and the
metadata query on the resolved episode: an unreleased episode renders the
"Episode N has not been released yet." state and **zero** source/execute
requests fire. `unknown` is explicitly not unreleased (no schedule is not a
promise about the future), so an episode with no schedule still attempts
playback through the backend — the contract, not the client, decides
availability. The same gate blocks *next episode* autoplay: the next number
may exist while its episode is unreleased.

## Source resolution + server selection

```text
episode.id + language
      ↓ GET /episodes/:id/sources
sources[] / plans[] / attempts / skipped / emptyReason / resolutionTimeMs
```

`plans` are index-aligned with `sources` and pre-ranked by the backend
(P5 ranks, P7 carries them). The UI never re-ranks. `plans[0]` is the default
and the selection resets to it on episode/language change. The dropdown only
renders canonical labels: "Server N", quality, resolution. Language changes
always trigger a fresh sources fetch and a fresh execution; the currently
playing URL is never swapped in place.

## Playback execution

The client sends exactly `{ episodeId, sourceId, language }` — the strict
backend schema rejects every other field, including any URL, provider or
header field. The execution it returns is the only playback authority:

- `kind: "media"` + `mechanism: "hls"` render with an HLS provider
  (`application/vnd.apple.mpegurl`), using `proxyUrl` verbatim when
  `delivery === "proxied"`.
- `kind: "media"` + `mechanism: "progressive"` render as direct `<video>`
  with the execution URL and the canonical `mediaType` (HLS detection never
  depends on the resolver).
- `kind: "embed"` renders an `<iframe>`; it is never fed to the media player.

## HLS / progressive / embed

`VideoPlayer` keeps Vidstack + hls.js. Every `useMedia*` call moved into a
`MediaEffects` child rendered *inside* `<MediaPlayer>`; the parent previously
called the same hooks outside (page-crash) and never rendered `MediaProvider`,
which is why no `<video>` element ever appeared. Typed
`src = { src, type }` now feeds Vidstack so the provider is chosen correctly.
Local Chrome lacks H.264/MSE, so a `.m3u8` URL yields the player chrome (video
elements mount) but no playback in headless-dev-mode Chrome; the canonical
chain was additionally proven end-to-end with a local WebM fixture.

## Fallback, stale selection, failure states

- **Provider fallback.** A `<video>` error advances the selection to the next
  canonical plan (`fallbackPlanSelection`), bounded by the plan list — no
  cycling.
- **Stale selection.** 409 retries exactly once (`retryNonce` carries the
  one-automatic-retry bound; an incremented list is never re-fetched); the
  second stale response becomes a failure state.
- **No sources.** 200 with `plans: []` renders "No sources are currently
  available."
- **Outage.** 503 renders "Streaming services are temporarily unavailable."
  Distinct from "no sources" and from 404.
- **Playback failure.** Media-layer errors during a running stream advance the
  plan order instead of reporting "no sources".
- **Intermediate states.** Sources loading shows "Finding available
  sources..."; an in-flight execution awaits without painting a fake player.

## Provider isolation

```
Browser → Zenkai frontend client (lib/api/zenkai.ts) → Zenkai backend → providers
```

Any attempt path that reaches the provider from the browser is a regression.
 `test/watch-boundary.test.ts` statically scans every executable module of the
watch surface and fails the suite on any provider-client import, provider
host reference, credential, or provider-shaped identifier in an execution
request. `test/playback-client.test.ts` pins the canonical wire shapes, the
strict execute payload, the bounded stale retry byte for nonce + nonce, and
the language enum (`sub | dub | multi` only).

Manual verification: after opening an anime, all episode/sources/metadata/
execution calls are to `localhost:4000`; zero requests hit AniList, AniSkip,
MangaDex, or a streaming provider from the browser.

## Security

- Execution request body is `{ episodeId, sourceId, language }` only — the
  client cannot steer the upstream URL, does not send headers, and cannot
  supply a provider identity.
- `episode_playback_meta` stores only stable descriptors (intro/outro offsets,
  subtitle language/kind, sourceUpdatedAt). No stream URL, manifest URL,
  signed URL, token, cookie, or credential is persisted.
- Embed players render from the execution URL inside an iframe; the client
  does not fetch the embed as media and never treats it as a progressive file.
- Nothing in the watch path reads or forwards a provider credential.

## Verification

- Backend tests: **282/282** (P13 baseline, unchanged — no backend code
  change in P14).
- Frontend tests: **79/79** (48 baseline + 31 new boundary/client tests).
- TypeScript: clean (both trees).
- Build: clean.
- Browser verification: anime detail → EP 1 → watch page renders the Vidstack
  player with `<video>`; only canonical API calls are made; `POST
  /playback/execute` carries exactly the three canonical fields; the sources
  UI lists "Server 1"/"Server 2" from the ranked plans; next/previous run via
  the canonical navigation endpoint; `/watch/212888/3` (airing today) shows
  the unreleased gate and issues zero source/execute calls; an unknown anime
  route surfaces the not-found state.
- Network verification: zero AniList/AniSkip/MangaDex/streaming-provider
  requests from the migrated watch flow.
- Persistence: `episode_playback_meta` rows carry stable metadata only.
- Sabotage matrix: all mutations detected by the boundary/client tests and
  all reverted (A direct provider import, B URL injection into execute,
  C plan-index authority, D airing-gate removal from the sources query,
  E language removed from the sources query key, F stale retry bound removed,
  G embed branch removed, H fallback advance removed). After restoration the
  full suite is green again.

## Lint

11 problems remaining, all pre-existing in files outside the P14 authored
surface (`history/page.tsx`, `library/page.tsx`, `hyprland-dock.tsx`,
`player-hotkeys.tsx`, `skip-button.tsx`, `manga-reader.tsx`, and the
`player.volume`/`player.currentTime` mutations in `video-player.tsx`, which
were lint-flagged before the migration). Zero P14-introduced lint issues.

## Known limitations

- Headless Chromium compiled without proprietary codecs cannot play the
  mux demo HLS streams (or any H.264/H.265 content). The player mounts and
  renders control chrome, duration metadata resolves, but actual playback
  requires Google Chrome. The executing→`<video>` mount was proven with a
  local WebM progressive fixture.
- `execution.composition` fields (`capabilities.seekable/ranged`, some
  `mediaType` entries) may still be null/`?` until providers publish evidence;
  P14 surfaces them exactly as the contract reports them.
- `enableDemoStreams` must be set server-side for the demo HLS URL fixtures;
  production sources still require real licensed/streaming providers.

## Scope notes

No new dependencies added. `lib/sources/{registry,resolver,types}.ts` is no
longer imported by the watch path but remains on disk suspended for later
self-hosted/legacy experiments; the boundary test is the tripwire if it creeps
back into the migrated path.
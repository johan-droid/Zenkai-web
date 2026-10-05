# Playback gateway (P6)

`PlaybackResolver` (P5) answers **WHERE** a stream is. `PlaybackGateway` (P6)
answers **HOW** a client should consume it. The boundary is deliberate:

```
PlaybackResolver        PlaybackGateway
provider discovery      source -> plan mapping
identity                mechanism / media type / delivery
fallback                validation carried through
validation              deterministic, pure, no network
ranking
dedupe
```

## Canonical playback contract

```
GET /api/v1/episodes/:episodeId/sources
        |
        v
  PlaybackResolver.resolveEpisode()
        |
        v
  validated PlaybackSource[]        <- P5 owns this
        |
        v
  playbackGateway.planAll(sources)  <- P6 owns this
        |
        v
  { sources, attempts, skipped, plans, planCount, emptyReason }
```

`plans[i]` describes `sources[i]`, in P5's ranked order. The gateway never
re-ranks, never re-orders, never substitutes a provider, and never calls one.

## `PlaybackPlan`

| Field | Source of truth |
| --- | --- |
| `sourceId` / `providerSlug` / `providerName` / `endpointSlug` | copied from the source |
| `access` | copied verbatim; never reinterpreted |
| `mechanism` | pure derivation: `hls` -> `hls`, `mp4`/`direct` -> `progressive`, `embed` -> `iframe` |
| `mediaType` | derived from `access` first (never the extension); `direct` derives from the extension and may be `null` |
| `url` | the source's URL, structurally validated (http(s), host, no embedded credentials) |
| `delivery` | `client` by default; `proxied` only for HLS through the relay when explicitly enabled and allowlisted |
| `language` / `quality` / `resolution` | copied |
| `validated` / `playable` | P5's probe outcome, carried through; the gateway never upgrades it |
| `capabilities` | `{ seekable: null, ranged: null }` -- unknown is honest, a guess is not |
| `subtitles` | only the provider-attached sidecars for this source, copied; never scraped or translated |

## Access modes

| access | mechanism | mediaType |
| --- | --- | --- |
| `hls` | `hls` (HLS pipeline) | `application/vnd.apple.mpegurl` |
| `mp4` | `progressive` | `video/mp4` |
| `direct` | `progressive` | extension-derived or `null` |
| `embed` | `iframe` | `text/html` |

An unknown access mode is refused, never rounded to `direct`. An embed must have
a page path; credentials embedded in a URL are refused.

## Validation semantics

`validated: true` means a real probe succeeded (P5). `validated: false` yields
`playable: false`. "Valid URL syntax" is not "playable".

## Duplicate probing policy

P5 probes each candidate once and records the answer in `validated`. The gateway
is `plan()`-pure: planning issues **0 additional network calls**. There is no
second probe to remove because there is no probe at all. If a future security
requirement genuinely needs a second check, document why the first validation
cannot provide it before adding a request.

## Provider isolation

`PlaybackGateway` imports no resolver, registry, provider adapter, or probing
client. `plan(source)` triggers zero provider-resolution calls. Verified by
tests (`imports no resolver...`, `makes zero provider-resolution calls...`,
`issues no probe...`).

## URL security

The playback URL always comes from the canonical `PlaybackSource`. The request
never accepts `?url=`, `?provider=`, or `?access=` to override it (tested).
The gateway is not an SSRF primitive: it takes no URL from the caller.

## Header policy

No provider headers are forwarded to the browser. `direct`/`hls`/`mp4` plans are
plain client fetches; the relay (`fetchManifest`) sends only a fixed
User-Agent/Accept pair. Provider API keys, cookies, and authorization headers
never appear in a plan.

## Logging / observability

Route logs record `episodeId, sourceId, provider, access, mechanism, delivery,
validated`, and the URL with every query-parameter value redacted
(`redactPlaybackUrl`). Signed query strings (token, hdnts, policy, sig, ...)
never reach a log line, under any parameter name.

`GET /api/v1/playback/providers` now also reports
`gateway: { planned, unmapped }` -- two counters on the existing health surface,
not a second metrics system.

## Error states

| P5 state | P6 behavior |
| --- | --- |
| success | `plans` in the same ranked order, plus eager metadata |
| `no_streams` | `plans: []`, `planCount: 0`, `emptyReason: "no_streams"` preserved |
| `all_failed` | stays a 503 with the failure detail |
| `all_skipped` | preserved, with per-provider skip reasons |

The gateway never flattens these into one generic error and never turns
`all_failed` into `no_streams`.

## Ephemeral URLs

Stream URLs are signed and short-lived. They are not persisted; the gateway
writes nothing to `episode_playback_meta`. That table remains P5/P4 canonical
metadata only.

## Known limitations

- `direct` media types are `null` unless the extension is a recognized one.
- `capabilities` are always `null` until a provider actually publishes evidence.
- Subtitle/audio tracks are transported only when the provider attached them.

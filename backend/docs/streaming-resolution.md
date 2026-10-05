# Streaming source resolution (P5)

How a canonical episode becomes a ranked list of playable sources, and what the
service refuses to claim.

## The flow

```
GET /api/v1/episodes/:episodeId/sources
        |
        v
  PlaybackResolver.resolveEpisode(canonical episode id)
        |
        +-- load episode -> (anime_id, episode_number)
        +-- load anime_external_ids + episode_external_ids
        +-- partition providers: applicable vs skipped
        +-- call applicable providers concurrently (bounded, with a deadline)
        +-- normalise -> PlaybackSource
        +-- validate -> rank -> de-duplicate
        v
  { sources, attempts, skipped }
```

The route does none of this. It validates the episode id, asks the service, and
shapes the response. Before P5 it assembled `anilistId` and `malId` by hand, which
meant the HTTP layer knew about provider id spaces -- and any new provider would
have needed a route change.

## Canonical episode to provider identity

A canonical episode is `(anime_id, episode_number)`. A provider needs an AniList
id, a MAL id, or a provider-native episode slug. These are **different id
spaces**, and conflating them is how a resolver ends up sending `null`,
`undefined` or a canonical uuid to an adapter and calling the result "no
streams".

`src/modules/playback/identity.ts` is the only place that translation happens.
It loads every external id the title holds -- not just AniList and MAL, so a
provider keyed on a space the resolver does not special-case still works -- and
splits providers into:

| `eligible` | Providers we hold the identity to ask |
| --- | --- |
| `skipped` | Everything else, with a reason |

### The defect this fixed

`#resolveUncached` hardcoded `needsMalId: false`. A provider declaring
`requiresMalId: true` was therefore **called with no MAL id**; its adapter
returned an empty list; and the resolution reported `no_streams`.

That is a claim about a provider that was never in a position to answer. It is
now skipped up front, before any call, and reported separately.

## Provider skipping is not failure

A skipped provider and a failing provider are different facts and are reported
differently.

| Reason | Meaning |
| --- | --- |
| `missing_required_id` | We hold no id it can use. Not applicable. |
| `inactive` | Disabled by configuration. |
| `quarantined` | Failing repeatedly; deliberately not asked. |
| `unsupported_language` | Does not serve the requested language. |
| `unsupported_access` | Cannot provide the requested access mode. |

`attempts` records providers that **were** asked. `skipped` records those that
were not. Merging them would let a client read "that provider had nothing" about
a provider that was never asked.

## no_streams != all_failed

The distinction is the point, so it is stated plainly:

| Condition | Meaning | HTTP |
| --- | --- | --- |
| Every applicable provider answered `[]` | Nothing is hosted for this episode | 200, `emptyReason: "no_streams"` |
| Every applicable provider errored or timed out | Unknown; may well be playable | 503, `no_sources` |
| Every provider was skipped | None applicable | 200, with `skipped` explaining why |

A provider outage is never reported as an empty shelf.

## Timeouts and fallback

Each provider call is bounded by a deadline applied from outside the adapter, not
by trusting the adapter's own HTTP stack. One provider timing out does not abort
the resolution: the others continue, and the timeout is recorded as a
`timeout` outcome rather than a generic error.

Providers are called concurrently with a bounded worker pool. Resolution is
therefore bounded by the slowest provider's deadline, not by the sum.

## Quarantine

Health is keyed by **provider**, not by `(provider, endpointSlug)`. That was the
P0 bug: the resolver recorded under one key and ranking read under another, so a
quarantined provider kept playing. One provider instance serves one endpoint, so
the endpoint key bought nothing but a way to disagree.

A quarantined provider is skipped **before** the call, so it never sits on the
critical path of a play request.

**Known limitation:** health state is an in-memory process singleton. A restart
clears quarantine, and two instances do not share it. Persistence belongs with
the observability work, not here.

## Normalisation

Language and access mode are normalised **inside adapters**, so
`"English Dub"`, `"eng"`, `"ENG-DUB"` and `"dubbed"` cannot reach the API. The
canonical model is unchanged from P0:

- Language: `sub` | `dub` | `multi`
- Access: `direct` | `embed` | `hls` | `mp4`

No second source representation was introduced.

## Validation

Two different things, deliberately not conflated:

| Check | Meaning |
| --- | --- |
| Structural | URL parses, scheme is http(s), host is non-empty |
| Reachability | A probe was issued and answered |

A source is only marked `validated: true` after a probe succeeds. A
syntactically valid URL that has never been contacted is not "playable", and the
resolver does not claim it is.

If every candidate fails validation, the originals are returned anyway with
`validated: false`: a possibly-dead source is still more useful to a player than
an empty list, and the flag says which is which.

## De-duplication

Keyed on `(provider, url, language, access)`, not on the URL alone.

URL-only dedupe was what this repository did, and it is wrong in both
directions:

- Two providers serving the same file from the same CDN collapse into one, and
  the source that would have played from this network is deleted.
- One provider offering the same URL as a dub and a sub collapses into one, and
  a real choice is hidden from the reader.

## Ranking

Unchanged from P0 and P3; no weights were touched.

Access type and provider health dominate, then resolution, then latency, with
the provider's own priority breaking ties. Deterministic: the same providers,
sources and health state produce the same order. No randomness, no iteration-order
dependence, and no timestamp used as a tie-breaker.

## What is persisted

**Stream URLs are not persisted.** They are signed, short-lived and provider-owned;
storing them as canonical metadata would be storing an expiry date and calling it
data. `episode_playback_meta` holds only stable, cross-provider facts: intro and
outro markers, subtitle tracks.

Resolution results are cached briefly in the existing cache layer, keyed per
episode, and a failed resolution is never cached.

## Security

- Provider URLs originate only from a provider adapter, endpoint configuration or
  a validated provider result. No user input becomes a provider URL, so the
  resolver is not an SSRF primitive.
- Endpoint templates are rendered from configured values only. No shell, no
  command construction, no interpolation that can escape the URL structure.
- Log lines carry provider slug, outcome and latency. They do not carry stream
  URLs, which frequently contain signed query parameters.

## Known gaps

- **`PlaybackGateway.plan()` is still dead.** Every branch returns
  `direct: true`, and the resolver probes a source that the gateway then probes
  again. Fixing this properly is playback work, so it is left for P6 rather than
  half-rewritten here. The double probe costs one extra request per candidate.
- Health is in-memory only, so quarantine is per-process and lost on restart.
- The in-process scrapers are blocking: with two of them timing out, a live
  resolution measured ~14s, bounded by the 12s provider deadline. Moving them off
  the request path belongs with the background-jobs work.
- Language preference is a filter, not a ranking preference. `multi` is always
  retained because a dual-audio track is strictly better than no source.

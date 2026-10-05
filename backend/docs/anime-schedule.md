# Airing schedule (P3)

The canonical airing model, where its data comes from, and what each endpoint
promises. Written to be checkable against the code.

## The model

```
Anime ──< Episode ──< AiringSlot
                     (anime_id, episode_number, airing_at)
```

`airing_schedule` stores concrete `(anime_id, episode_number, airing_at)` rows.
AniList publishes only `nextAiringEpisode` per series, which is enough for a
countdown but not for a week view: a show airing twice a week has one AniList
slot and two real ones. Storing concrete slots is what lets `/schedule/week`
answer without extrapolation games.

## Episode identity

A slot is identified by **`(anime_id, episode_number)`**, enforced by the
`schedule_slot_unique` constraint. Episode numbers are not globally unique, and
Anime A Episode 1 and Anime B Episode 1 are different records — asserted in
`schedule.persistence.test.ts`.

Slot rows are not duplicated into the anime table, and episode metadata is not
duplicated into the slot. The schedule owns *when*; the episode domain owns
*what*. P4 owns the episode catalogue.

## Three concepts, kept apart

| Concept | Where it lives |
| --- | --- |
| An episode exists | `episodes` (P4) |
| An episode has aired | Derived from `airing_at` vs the clock, on every read |
| An episode is scheduled | The presence of a row in `airing_schedule` |

Airing state is **never** derived from the episode number, and never from when
the row was written.

### `airingState` versus `providerStatus`

Every schedule item carries both:

```json
{ "airingState": "aired", "providerStatus": "NOT_YET_AIRRED" }
```

- `airingState` is derived from `airing_at` compared to the injected clock. It
  is always current.
- `providerStatus` is what the provider claimed at sync time, kept verbatim.

The reason for both is a real defect this phase fixed: `status` was written once
at sync and never revised, so a slot written `NOT_YET_AIRRED` still read that
way weeks after the episode had aired. Conflating "what the provider said" with
"what the clock says" is what made a schedule quietly wrong. Before the fix, a
slot backdated by two days still reported `NOT_YET_AIRRED`.

Only two states exist: `aired` (at or before now) and `upcoming` (after now).
There is deliberately **no** "airing now" state — nothing in the repository
establishes that Zenkai distinguishes a currently-broadcasting episode, and
inventing a window would be fabricated product behaviour.

## Time and timezone

- **Stored**: `airing_at` is `timestamptz` and is always an absolute instant.
  A weekday string is never canonical.
- **Derived**: `dayOfWeek` and `secondsUntil` are computed per read, so a
  response is never stale about a countdown.
- **"Today" and "this week"**: civil days in `SCHEDULE_TIMEZONE`, not the
  server's local day and not a rolling 24 hours. The response echoes the zone it
  used, so a client never has to guess.

The default is UTC, which is what the service did before this was configurable.
`startOfDay` is implemented with `Intl` and verified against UTC+9 and against a
US daylight-saving transition, because the naive
`new Date(); setHours(0,0,0,0)` truncates in the *server's* zone and shifts a
viewer's whole evening of broadcasts into the wrong day.

An invalid zone name fails at boot, not on the first schedule request.

## Data source

| Aspect | Value |
| --- | --- |
| Primary | AniList `Media.nextAiringEpisode` |
| Fallback | Jikan, only when AniList returns no airing data |
| Extrapolation | Weekly cadence, capped by `total_episodes`, stored with `source: "inferred"` |

`anime.updatedAt` is **not** used as an airing time. It is when the provider's
record last changed, which is a different concept from when an episode airs.

The stored `status` is derived from `timeUntilAiring` at sync time. AniList's
`nextAiringEpisode` fragment carries no status field of its own, so deriving it
from the clock is the honest option; inventing a separate state would be
fabrication. A series cancelled or delayed upstream is not represented here
because the upstream data does not carry it — `unknown` is preferable to a
fabricated date.

## Sync behaviour

`POST /api/v1/schedule/sync/:id` is the only route that talks to a provider.

- **Idempotent**: upsert on `(anime_id, episode_number)`. Three syncs leave one
  row. Asserted both through the service and by a raw duplicate insert being
  rejected by the constraint, so idempotency does not depend on every caller
  remembering to upsert.
- **Updates in place**: a changed airing time updates the existing row.
- **Cascades**: deleting an anime removes its slots.

## Failure semantics

- A failed sync returns **502 with a reason**. It does not return an empty
  schedule: a client could not tell "nothing scheduled" from "we could not ask".
- Schedule **reads are database-backed and never call a provider**, so they keep
  working when AniList is down. Verified live against an unreachable endpoint:
  sync returned 502 while `upcoming` still returned rows.

## Cache

Schedule reads are **not** cached, deliberately. The `airing_schedule` table is
already a materialised projection maintained by sync, so it is the cache: adding
a second layer in front of it would create a third copy of the same data with no
invalidation hook and a real risk of serving a day view that disagrees with the
rows sync just wrote. Reads are indexed on `airing_at` and bounded to 100 rows
per page.

## Endpoints

| Endpoint | Shape |
| --- | --- |
| `GET /api/v1/schedule` | `{ items }` in an explicit window |
| `GET /api/v1/schedule/today` | `{ date, timeZone, items }` |
| `GET /api/v1/schedule/week` | `{ from, to, timeZone, days }` |
| `GET /api/v1/schedule/upcoming` | `{ items }`, strictly future, paged |
| `GET /api/v1/schedule/recent` | `{ items }`, most recent first |
| `GET /api/v1/anime/:id/schedule` | `{ items }` for one title |
| `POST /api/v1/schedule/sync/:id` | `{ anilistId, written }` |

Pagination is bounded and **rejected** with 400 outside `1..100` rather than
silently clamped. `recent` looks back at most 90 days.

No endpoint resolves streaming sources. Playback is reached later, by episode
identity, from the playback module.

## Known gaps

- A slot is only as good as the last sync. There is no background sync job yet
  (P19), so a show's schedule does not update unless something triggers it.
- One provider request per title, not per schedule row. A week view reads from
  the table and makes no provider calls at all, but a bulk sync across N titles
  still costs N requests; that belongs with the background job.
- Aired episodes stay in the table indefinitely. `recent` windows them, but
  nothing prunes old rows yet.

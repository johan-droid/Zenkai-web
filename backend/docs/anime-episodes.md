# Episode catalogue (P4)

The canonical episode domain: what identifies an episode, what it knows, and
deliberately what it does not.

## The model

```
Anime ──< Episode ──< AiringSlot
                    (anime_id, episode_number, airing_at)
```

`episodes` holds *what the episode is*. `airing_schedule` holds *when it airs*.
They are separate tables and the separation is load-bearing: an airing slot can
be rescheduled, extrapolated, or replaced by a different provider without
touching the episode's identity, and an episode can exist with no schedule at
all.

## Identity

An episode is identified by **`(anime_id, episode_number)`**, enforced by the
`anime_episode_num_unique` constraint. Not by a provider's episode id, and not by
the episode number alone:

- Anime A Episode 1 and Anime B Episode 1 are different episodes.
- Two rows for the same title and number are rejected by the database, not by
  application code, so idempotency does not depend on every caller remembering
  to upsert.

Provider-native ids live in `episode_external_ids`, keyed by
`(provider_slug, external_id)`. They are a cross-reference for the resolver, never
the identity.

## What an episode does not carry

- **No streaming URL.** Those belong to a provider and a source, they rotate, and
  they expire while the episode does not. Storing them here would make the
  catalogue wrong within hours.
- **No airing state.** Aired/upcoming is derived from `airing_at` and the
  injected clock on every read, per P3. A stored value goes stale the moment an
  episode airs.
- **No `next_episode` column.** Derived from episodes plus future slots, for the
  same reason.

This is what lets playback attach sources to a stable identity without the
catalogue being rewritten.

## Three counts, never collapsed

| Count | Meaning |
| --- | --- |
| `knownTotal` | What the provider stated. `null` when it has not. |
| `catalogueCount` | Episode rows we actually hold. |
| `airedCount` | Episodes that have aired by the current clock. |

A show with 24 episodes, 7 aired, is `knownTotal: 24`, `catalogueCount: 24`,
`airedCount: 7`. Reporting the held count as "total episodes" tells a reader the
show is finished.

`knownTotal` is `null` when the provider has not stated it, and is never coerced
to `0`. Zero claims a show has no episodes at all, which is a much stronger claim
than "we were not told".

## The merge contract

P1's rule, applied to episodes:

| Provider sends | Stored value |
| --- | --- |
| field omitted (`undefined`) | kept |
| field present but `null` | cleared |
| field with a value | overwritten |

Implemented in JS rather than SQL. A `coalesce(excluded.x, x)` would stop a
sparse sync from erasing data, but it cannot tell an explicit null from an absent
field once both are a column, so a provider genuinely reporting "this episode has
no description" could never clear a stale one. The decision has to be made while
the difference is still visible.

**This defect was live.** `upsertEpisodes` assigned `excluded.title` and friends,
which meant a sparse re-sync blanked out every episode title, description and
duration. Demonstrated before fixing:

```
after sparse re-sync: {"episode_number":1,"title":null,"description":null,"duration_seconds":null}
```

against a row that had held `title: "The Journey", description: "A story",
duration: 1440`. The same defect P1 fixed on the anime row, reintroduced one level
down.

The merge is also **per episode**, not per batch: one payload may be rich for
episode 1 and empty for episode 2.

### Placeholders

AniList publishes only an episode *count* for anime, so episodes are initially
scaffolded from `totalEpisodes`. Those placeholder fields are `undefined`, not
`null`: they mean "we only know the number". A null would claim the provider
reported the field as empty, and would clear real data on the next sync.

## Ordering

Ordered by `episode_number` on an integer column, so `1, 2, 3, 10, 11`. A text
sort produces `1, 10, 11, 2, 3`; switching to one is caught by the suite.

## Missing episodes

If the provider reports 1, 2 and 4, the catalogue holds 1, 2 and 4. Episode 3 is
not invented. A gap is missing provider data, and navigation honours it: "next"
from 2 is 4.

## Navigation

`previous` / `next` are derived from episode **number** order, never from
insertion order or a uuid, so they are stable regardless of how rows were written.

## Airing integration

Episodes are left-joined to their slot. An episode with no slot reports
`airingState: "unknown"` and `airingAt: null` — which is not the same as
"upcoming", and not the same as "aired". An inner join would hide those episodes
from the catalogue entirely.

`nextEpisode` returns the earliest episode that has not aired **and has a slot**.
An episode whose airing time is unknown is never reported as next, because that
would be inventing a release date.

## API

| Endpoint | Shape |
| --- | --- |
| `GET /api/v1/anime/:id/episodes` | full catalogue with the three counts |
| `GET /api/v1/anime/:id/episodes/:number` | one episode |
| `GET /api/v1/anime/:id/episodes-next` | derived next episode, or `null` |
| `GET /api/v1/anime/:id/episodes/:number/navigation` | `{ previous, next }` |

**Not paginated.** The Zenkai episode list is a single scrollable column, and
paging a 24-episode show would be pagination applied for its own sake. The
response is a lightweight `EpisodeCard`, not full rows.

A provider failure while seeding on first read surfaces as an error, not an empty
list, so a client can tell "no episodes" from "we could not check".

## Caching

Not added. Episode lists are cheap indexed reads off `(anime_id, episode_number)`,
which already covers "by title", "by number" and "ordered by number". The same
reasoning as P3: the table is the cache, and a layer in front of it would be a
second copy with no invalidation hook.

## Known gaps

- **Episode metadata is thin.** AniList exposes no per-episode title, description
  or duration for anime, so these are null until a real per-episode source exists.
  The columns and the merge are ready for it; the data is not.
- **Specials and OVAs are not modelled.** AniList's `episodes` count does not
  distinguish a special from a main episode. Rather than invent a broken
  representation, this is a recorded limitation.
- No range pagination, because the Zenkai client does not need one. Revisit if a
  very long franchise makes the full list unwieldy.

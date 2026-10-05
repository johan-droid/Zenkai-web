# Anime discovery (P2)

What each discovery endpoint reads, how fresh it is, and what it does when the
part it depends on is unavailable. Written to be checkable against the code
rather than aspirational.

## The split

Discovery has two halves with genuinely different characteristics. Collapsing
them is how a home page ends up lying.

| Section        | Source      | Why                                                |
| -------------- | ----------- | -------------------------------------------------- |
| trending       | AniList     | A ranking over the whole catalogue. Postgres only  |
|                |             | holds titles we have cached, so it cannot compute   |
|                |             | this.                                               |
| popular        | AniList     | Same.                                                |
| seasonal       | AniList     | Same, filtered to a season window.                  |
| top            | AniList     | Global rating. See the score note below.            |
| recent         | PostgreSQL  | A fact about our own catalogue.                     |
| recently-updated | PostgreSQL | Ordered by the provider's own `updatedAt`.          |
| genres         | PostgreSQL  | A fact about our own catalogue.                     |

The canonical half is what makes the service useful when AniList is down: the
database holds the rows, so `recent` and `genres` answer regardless.

## Endpoints

| Endpoint | Data source | Cache TTL | Failure |
| --- | --- | --- | --- |
| `GET /api/v1/anime/trending` | AniList | 30 min | 502 `upstream_error` |
| `GET /api/v1/anime/popular` | AniList | 30 min | 502 `upstream_error` |
| `GET /api/v1/anime/seasonal` | AniList | 2 h | 502 `upstream_error` |
| `GET /api/v1/anime/top` | AniList | 2 h | 502 `upstream_error` |
| `GET /api/v1/anime/recent` | PostgreSQL | 5 min | 500 if the database is down |
| `GET /api/v1/anime/recently-updated` | PostgreSQL | 5 min | 500 if the database is down |
| `GET /api/v1/genres` | PostgreSQL | none | 500 if the database is down |
| `GET /api/v1/home` | both | per section | 200 with per-section status |

TTLs are `CACHE_TTL_DISCOVERY_S` (default 1800s) and multiples of it, configured
in `src/config/index.ts`.

## Response contract

```json
{
  "items": [ /* DiscoveryCard */ ],
  "page": 1,
  "perPage": 20,
  "hasNextPage": true,
  "total": 5000,
  "source": "provider | cache | database"
}
```

`source` is honest provenance, not decoration: `provider` means this response was
just fetched, `cache` means it is a possibly older copy, `database` means no
provider was involved. AniList's `pageInfo` object never reaches a client.

`DiscoveryCard` is deliberately smaller than the full anime detail. A home page
asks for five sections at twenty rows each; shipping relations, external ids and
studio credits for every card is payload nobody reads.

## Failure semantics

This is the part worth being precise about.

- **Provider failure is never an empty list.** A timeout, a 5xx and a malformed
  response all surface as an error carrying the reason. Returning `items: []`
  would tell a client "nothing is trending", which is a different and false claim.
- **A valid empty response is empty.** Zero results from a healthy provider is a
  successful empty answer, and is reported as `items: []` with no error.
- **Home degrades per section.** One dead ranking does not 500 the page, and does
  not fake an empty shelf either. Each section reports `status: "unavailable"`
  with a `reason`, which a client can render as "temporarily unavailable" rather
  than "no results".

```json
{
  "trending": { "status": "unavailable", "items": [], "reason": "provider_timeout" },
  "recent":   { "status": "ok", "items": [ ... ] }
}
```

## Cache

Keys are deterministic and built only from already-validated values, so no raw
user input reaches a key:

```
discovery:v2:<bucket>:<year>-<season|all>:p<page>:n<perPage>   provider-backed
discovery:v2:<section>:p<page>:n<perPage>                      canonical
```

Cached payloads are the **normalised** discovery response, never the raw
provider JSON, so a provider schema change cannot be served from cache after the
code is fixed.

A cached copy is served when the provider is unreachable. That is deliberate
stale-but-valid behaviour, and it is why `source` is in the response: a client
can tell a fresh answer from a warm one.

Redis is an acceleration layer, never the source of truth. If it is unavailable
the service reads from the in-process cache, then from the provider or Postgres.

## Scores

`top` sorts on AniList's `averageScore` (0-100), which P1 copies into the
canonical `average_score` column. Scores from different providers are never
averaged together — a blended score would be a number this service invented, and
no user asked for it.

A title with no score returns `"averageScore": null`, not `0`. "Nobody has rated
this" and "everyone rated this zero" are different facts, and a client rendering
`0%` from the first one is telling the user something false.

## Seasonal default

`GET /api/v1/anime/seasonal` with no parameters uses the season the **server** is
currently in, derived from the clock (`currentSeason`). It is not hard-coded, so
it does not rot into "whatever season it was when this was written".

December reports the *upcoming* year, because December belongs to the winter that
ends in January.

An explicit window (`?season=SPRING&year=2024`) overrides it. The public
parameter is `year`, not AniList's `seasonYear`: the client should not have to
know how the provider names its filters.

Without this default, `seasonal` and `popular` are the same query with no season
filter applied, and one endpoint silently duplicates the other. That was the
actual pre-P2 behaviour.

## Pagination

`page >= 1` and `1 <= perPage <= 50`, validated with zod and rejected with 400
outside those bounds rather than silently clamped. An absurd `perPage` is a
client bug or an attempt at unbounded work, and quietly returning a smaller page
hides it from whoever has to debug it.

## Database-backed sections

`recent` orders by `created_at`: when this service first learned about the title.

`recently-updated` orders by `source_updated_at`, which is AniList's own
`updatedAt`. It is deliberately **not** `updated_at`, which records when we last
synchronised. Ranking by that would surface whatever title a background job
happened to touch, which is not the question a reader is asking. Rows with no
upstream marker sort last rather than pretending to be from 1970.

## Known gaps

- Recommendations are not implemented. They would need relation-aware ranking
  (P1 stores relations but nothing scores them), and a "related" list that is
  really just another popularity list would be worse than none.
- `top` is provider-ranked. A database-side "top of our catalogue" is possible
  and would work offline, but it is a different question and currently
  unrequested.
- Genres are de-duplicated case-insensitively within a payload (P1) and across
  the catalogue (P2), but there is no global genre taxonomy. See the note in
  `anime-identity.md`: that belongs with multi-provider enrichment.

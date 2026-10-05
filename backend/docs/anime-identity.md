# Canonical anime identity (P1)

This is the answer to "what identifies an anime in Zenkai", and the reasoning
behind the constraints in `src/db/schema/anime.ts`.

## The shape

```
Zenkai anime
    │
    ├── id          uuid, our own. The canonical identity.
    │
    ├── slug        stable, URL-safe, derived from the canonical title + AniList id
    │
    └── external ids (anime_external_ids, one row per provider)
            ├── anilist = 16498
            ├── mal     = 16498
            └── tmdb / kitsu / anidb ...
```

## The internal id is not the AniList id

`anime.id` is a generated uuid and is the only identity the rest of the service
should join on. `anime.anilist_id` exists because AniList is the origin catalogue
and re-sync must find the same row again, so it carries a unique constraint — but
that is an *upsert key*, not the domain identity.

The distinction is not academic. `anime_relations.related_anilist_id` and the
`anime.id` column beside it are deliberately different types: the relation stores
a provider id for a title that may not exist locally yet, while `anime_id` is a
uuid that must. `playback/routes.ts` documents the same trap, where an episode's
`animeId` is a local uuid and `anilistId` is the provider id.

## The questions, answered

**Can two AniList records map to one anime?** Not today, and deliberately so. Two
AniList entries for the same work (a season split, a re-list) would create two
canonical rows, because there is no cross-provider merge yet. `AnimeSummary`
carries `enrichedFrom` and `anime.enriched_from` exist for that merge, and
`getByExternalId` in the adapter contract is its seam. This is a known gap, not
an oversight — see "Known limitations" in the P1 report.

**Can one anime have multiple external ids?** Yes. `anime_external_ids` holds one
row per provider and `anime_external_ids.anime_id` cascades on delete, so a title
can be addressed on AniList, MAL, TMDB, Kitsu or AniDB simultaneously.

**Can an anime be imported twice?** No. Two constraints prevent it:

| Constraint                              | Prevents                                    |
| --------------------------------------- | ------------------------------------------- |
| `anime_anilist_id_unique`                | the same AniList id creating a second row   |
| `anime_external_lookup_unique (id_type, external_id)` | one provider id pointing at two anime |

The second is the one that matters most for correctness: it makes the lookup
`find by (provider, external_id)` unambiguous, so a title resolved from AniList
and the same title resolved from MAL cannot diverge into separate rows once a
shared id is known.

**Can repeated sync duplicate fan-out rows?** No, and this is tested. Genres and
studios are replaced wholesale per sync, the search index upserts on `anime_id`,
and external ids upsert on `(anime_id, id_type)`. `anime.persistence.test.ts`
syncs the same title three times and asserts every row count is unchanged.

## Why genres and studios are replaced rather than appended

Appending would let a tag accumulate as upstream renames it, and a genre filter
that drifts is worse than one that is simply rebuilt. The `anime_genres` primary
key is `(anime_id, genre)` and is case-sensitive, so values are de-duplicated
case-insensitively before insert — otherwise one payload containing both "Action"
and "action" would create two rows for one tag. Cross-title genre canonicalisation
is deliberately **not** done here: that is a product taxonomy decision, not a
persistence detail.

## The merge contract: omitted vs empty

The single most consequential rule in this domain, because getting it wrong
silently destroys the catalogue:

| Provider sends            | Canonical value | Upsert behaviour        |
| ------------------------- | --------------- | ----------------------- |
| field absent              | `undefined`     | keep the stored value   |
| field present but `null`  | `null`          | clear the stored value  |
| field present with a value| the value       | overwrite               |

JSON renders "absent" and "present but null" almost identically once accessed with
`?.`, so `toSummary` uses a `present()` key check to tell them apart. Without it,
`AnimeService.search` and `AnimeService.discovery` — which upsert *every* provider
result they return — would blank out descriptions, artwork, scores and episode
counts across the catalogue on any partial response, and nothing downstream could
distinguish that from a genuinely empty catalogue.

The same rule governs genres and studios, where "absent" (`undefined`) keeps the
stored set and an explicit `[]` clears it.
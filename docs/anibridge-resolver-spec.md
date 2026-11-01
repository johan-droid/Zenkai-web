# AniBridge-style multi-server embedding — resolver spec

**Source of evidence**: Nyyrox/Zenkai v1.6.0 APK (SHA-256 `1e07be52…45ae`),
static DEX string inspection. Method bodies unobserved — URL patterns and host
names are observed constants; request/response shapes are inferred from URL
structure and class/field names only.

**Target**: this repo's existing streaming-provider architecture
(`backend/src/providers/streaming/`). The frontend needs **no changes**: every
server below is either an `embed` (iframe) or a direct manifest, both already
modelled by `PlaybackPlan.mechanism`.

---

## 1. Design principle: no new abstraction

The APK's five resolvers (Anikoto / AnimeSalt / ReAnime / AniBridge / Direct)
are *scrapers keyed on different id spaces*. This repo already models exactly
that: `TemplateProvider` renders `urlTemplate` from `{mal_id}`/`{anilist_id}`/
`{episode}`, and `requiredIdType` declares which id a host needs. **The AniBridge
"aggregator" is not a component to build — it is the fan-out the registry
already does** across eligible providers.

Therefore the work splits three ways by how much logic each host actually needs:

| Tier | Hosts | Work |
|---|---|---|
| **T1 — data only** | 10 embed hosts | `provider_endpoints` rows (migration) |
| **T2 — small adapters** | 3 extractors | 3 `StreamingProvider` classes |
| **T3 — optional asset** | slug-keyed hosts | MAL→slug mappings table, seeded from AniBridge `mappings.min.json` |

---

## 2. Tier 1 — template endpoints (zero code) — **ALREADY IMPLEMENTED**

**Status correction (post-spec discovery):** the T1 rows already exist in
`backend/src/db/seed-providers.ts` (`RAW_ROWS`), seeded from an earlier
Android-spec pass, and their recorded patterns are more accurate than the
inferred ones originally tabulated here. There is **no migration to write** —
a raw-SQL migration would create a second source of truth that a run of
`seed-providers.ts` overwrites (`ON CONFLICT … DO UPDATE` rewrites
`url_template`, `active`, `priority` on every endpoint keyed
`(provider_id, slug)`, and force-reactivates providers). Note:
`npm run db:seed` is a **stub** (`src/db/seed.ts` never calls
`seed-providers.ts`); the seed only runs manually via
`npx tsx src/db/seed-providers.ts`. The seed file is the source of truth for T1.

**Smoke-tested 2026-11-01** (curl, `mal/ani=21`, `ep=1`, `tmdb=1396`; HTTP
200 + player/iframe/m3u8 markers counted as OK). Dead rows were flipped to
`isActive: false` in the seed with dated comments:

| provider | endpoint | urlTemplate (verbatim from seed) | derived id¹ | lang | access | smoke 2026-11-01 |
|---|---|---|---|---|---|---|
| megaplay | sub / dub | `https://megaplay.buzz/stream/mal/{mal_id}/{episode}/sub?autonext=1&autoskip=1` (dub analogous) | mal | sub/dub | embed | ❌ 410 error page → **disabled** |
| megaplay | s2-sub / s2-dub | `…?server=vidstream&autonext=1&autoskip=1` | mal | sub/dub | embed | ❌ same 410 page (s2-sub tested) → **disabled** |
| zokoanime | sub / dub | `https://zokoanime.video/stream/mal/{mal_id}/{episode}/sub?color=35d5bf` | mal | sub/dub | embed | ✅ player page |
| tryembed | sub / dub | `https://tryembed.us.cc/e/{mal_id}/{episode}/sub?autonext=1&autoskip=1` | mal | sub/dub | embed | ❌ 404 (`/e/` route gone) → **disabled** |
| vidnest | sub / dub / multi | `https://vidnest.fun/anime/{id}/{e}/sub` | **none**² | sub/dub/multi | embed | ✅ player + m3u8 markers |
| 2embed | sub / dub | `https://www.2embed.stream/embed/tv/{tmdb_id}/1/{episode}` | tmdb | sub/dub | embed | ✅ correct title + iframe |
| yumezone | zoko-direct-sub/dub | `https://yumezone.qzz.io/api/zoko/source?mal={mal_id}&ani={anilist_id}&ep={episode}&lang=sub` | mal³ | sub/dub | direct | ⚠️ connect timeout (inconclusive) |
| yumezone | megaplay-/animesalt- embeds | `https://yumezone.qzz.io/embed/{megaplay\|animesalt}/ani/{anilist_id}/{episode}/sub` | anilist | sub/dub/multi | embed | ⚠️ connect timeout (inconclusive) |
| recloud | sub / dub | `https://cdn.4animo.xyz/embed/hd-2/ani/{anilist_id}/{episode}/sub?k=1` | anilist | sub/dub | embed | ✅ 301 → `novuscloud.buzz` player |
| animesalt | mystream-multi | `https://animesalt.cx/episode/{slug}/?server=mystream` | slug | multi | embed | ❌ 404 → **disabled** |

¹ As computed by `deriveRequiredId` (`seed-providers.ts:617`), not as idealised.
² `{id}` is **not** tested by `deriveRequiredId` → `requiredIdType: "none"`,
which skips the id guards; an id-less request renders the malformed URL
`https://vidnest.fun/anime//{e}/sub` instead of being skipped. Pre-existing;
fix by switching the pattern to `{mal_id}` or `{anilist_id}` once the id space
is confirmed (undetermined: the smoke id 21 collides MAL↔AniList).
³ First-match-wins: `{mal_id}` precedes the anilist token, so the anilist
param renders but does not gate.

Notes:
- `recloud` (cdn.4animo.xyz) is also live via `STATIC_FALLBACK_ENDPOINTS` +
  the `novuscloud` adapter — the seed row and the adapter coexist; the DB row
  wins when the DB is reachable.
- Inert placeholder rows (bare domain, no `{episode}` placeholder →
  `renderTemplate` returns `null`, so they never emit a source): `reanime`,
  `anikoto`, `anineko`, `anibd`, `animegg`, `kaa`, `animesalt-multi`. Harmless
  dead data; leave or prune, no behavior either way.
- Remaining caveat is unchanged: patterns were recorded from the APK spec
  pass, **not smoke-tested against the live hosts**. Verify with one `GET`
  per host before relying on any row; flip `isActive` in the seed if one
  fails.

---

## 3. Tier 2 — extractors (small adapters)

Three hosts need a fetch-and-extract step before a URL exists. Each is a
`StreamingProvider` implementing the existing contract; **no route changes** —
`gateway.ts` picks them up from the registry like the existing
`hianime-embed`/`novuscloud` adapters.

### 3.1 `animesalt` — multi-server episode page
- Observed: `https://animesalt.cx/episode/{slug}/?server=mystream`
- The APK parsed per-server links out of the episode page
  (`AnimeSaltServerEntry(name=…)`), i.e. one page → N servers.
- **Spec**: `resolve()` fetches the episode page, extracts the server list,
  and returns one `PlaybackSource` per server with `providerSlug: "animesalt"`
  and `endpointSlug` = server name (e.g. `mystream`). Needs a MAL→episode-slug
  step (title search via the host's filter endpoint, or the T3 mappings table).
- `kind: "scrape"`, `timeoutMs: 15_000` (multi-step), capabilities:
  `languages: ["sub","dub"]`, `accessTypes: ["embed"]`, `requiresMalId: true`.

### 3.2 `reanime` — FlixCloud, with decrypt
- Observed: `https://reanime.to/api/flix/` + decrypt helper
  `https://enc-dec.app/api/dec-flixcloud?type=token`
- **Spec**: fetch the flix endpoint with the MAL id → encrypted token →
  call `enc-dec.app` to decrypt → construct the playable URL. Two fetches on
  the critical path, so `timeoutMs: 15_000` and `validated: false` until the
  gateway's probe confirms.
- ⚠️ The decrypt service is a third-party dependency that can disappear; on
  failure return `[]` (empty = "no stream", not an error), letting the
  resolver fall through per the contract.

### 3.3 `anikoto` — MegaPlay direct
- Observed: `https://anikototv.to/filter?keyword=` (search) and
  `resolveDirectMegaPlayWithServer` (field name) → direct HLS, and a
  `"MegaPlay / MegaCloud channel handling"` comment with
  `d.channel === 'megacloud' | 'megaplay'` — i.e. the player-side channel
  vocabulary. The APK also had `megaplay-direct-sub/dub` and
  `megaplay-s2-sub/dub` labels plus `MEGAPLAY_IV`/`MEGAPLAY_KEY` constants
  (IV/key strongly suggest an AES step in the extractor).
- **Spec**: search the title → pick the entry → fetch the MegaPlay channel →
  decrypt (AES-GCM with the observed IV/key constants) → emit an `hls` or
  `mp4` `PlaybackSource`. `accessType: "direct"` so the plan's mechanism is
  `hls`/`progressive`, not iframe — this is the one path where a real manifest
  reaches the player.
- ⚠️ The IV/key constants are observed *names*, not values; the actual bytes
  must be recovered from the decompiled class before this adapter can work
  (requires the JADX provider, currently unconfigured).

---

## 4. Tier 3 — optional: MAL→slug mappings (only if T2.1 needs it)

AniBridge shipped an 8.7 MB `mappings.min.json` (MAL-id keyed) because some
hosts address shows by **slug**, not MAL id. Only the slug-keyed extractors
(AnimeSalt, and any T1 row that turns out to be slug-based in verification)
need this.

**Spec**: one table `mappings(mal_id bigint PK, slug text, host text)` + a
one-time seed script that ingests the JSON. `renderTemplate` gains a `{slug}`
placeholder resolution against this table — or, lazier, the extractor does the
lookup itself and no template change is needed.

Do **not** build this until a Tier-2 adapter actually requires a slug. The T1
rows are all MAL-keyed by observed pattern.

---

## 5. Delivery path (proxy)

- **Embeds (T1, T2.1, T2.2)**: no proxy needed. Iframes load cross-origin by
  design; the browser plays them. `PLAYBACK_PROXY_ALLOWLIST` stays as-is.
- **Direct manifests (T2.3)**: when the MegaPlay CDN requires an origin
  `Referer`, set `PlaybackSource.referer` (already supported) and let the
  existing `/api/v1/proxy` relay it — the host must be added to
  `PLAYBACK_PROXY_ALLOWLIST`. No new proxy code; this is config.

## 6. Rollout

1. ~~Migration: T1 rows, `active = false`.~~ **Already done** — T1 rows exist
   in `seed-providers.ts`. Smoke test 2026-11-01: 7 dead rows disabled in the
   seed (megaplay ×4, tryembed ×2, animesalt ×1); zokoanime, vidnest, 2embed,
   recloud verified live; yumezone unverifiable from the test network.
2. To change row state: edit `isActive` in `seed-providers.ts` and run
   `npx tsx src/db/seed-providers.ts` (NOT `npm run db:seed` — that script is
   a stub and never touches these tables). Upserts are idempotent.
3. T2.1 (AnimeSalt) first if a slug-keyed host proves necessary — it is the
   smallest extractor with the best coverage signal in the APK. The
   `animesalt` seed row is `{slug}`-keyed and inert until a slug source
   (T3 mappings or title search) exists.
4. T2.3 (MegaPlay) last: needs the IV/key bytes recovered first. The `s2`
   embed rows already cover MegaPlay as an iframe without the extractor.
5. Health: every new adapter gets a `healthCheck()` that does a cheap HEAD/GET
   against the host root; the existing quarantine loop then deprioritizes dead
   hosts automatically.

## 7. Explicit unknowns (do not treat as fact)

- Exact path shapes for every T1 row — **mostly resolved**: the seed records
  concrete patterns (see §2), but none are smoke-tested against live hosts.
- Request/response JSON shapes for the ReAnime flix endpoint.
- The MegaPlay IV/key *values* (names observed only).
- Whether `animesalt` (slug-keyed) can be served without the T3 mappings
  table — the only T1 row that needs a slug source.
- Availability/licensing posture of every host; all carry the same
  "hosts no content" disclaimer risk as the source app.

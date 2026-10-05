# TODO: route the frontend through the Zenkai API

Status: open. Recorded during P1 (canonical anime domain), which deliberately did
not change frontend behaviour.

## The problem

`frontend/src` talks to AniList, MangaDex and AniSkip directly from the browser.
Nothing references the Zenkai API, so two independent provider stacks exist:

| Concern                  | Backend (canonical)                        | Frontend (duplicate)                    |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| Anime metadata           | `providers/metadata/anilist.ts`            | `lib/api/anilist.ts`                    |
| Manga metadata           | `providers/manga/mangadex.ts`              | `lib/api/mangadex.ts`                   |
| Skip markers             | `modules/playback/metadata.ts`             | `lib/api/aniskip.ts`                    |
| Playback source resolve  | `modules/playback/service.ts`              | `lib/sources/resolver.ts`               |
| Source ranking/health    | `providers/streaming/ranking.ts`           | none                                    |
| Title normalisation      | `domain/media.ts`                          | `lib/api/mangadex.ts` (own copy)        |

Consequences: the browser burns provider rate limit that the backend's cache
cannot absorb, provider outages are handled twice and differently, and the
frontend can render data the backend never validated.

## Files carrying direct coupling

```
src/lib/api/anilist.ts        graphql.anilist.co
src/lib/api/mangadex.ts       api.mangadex.org, uploads.mangadex.org
src/lib/api/aniskip.ts        api.aniskip.com
src/lib/schemas/anilist.ts    AniList response shapes (zod)
src/lib/schemas/mangadex.ts   MangaDex response shapes (zod)
src/lib/sources/registry.ts   hard-coded stream URLs
src/lib/sources/resolver.ts   pattern fill + probe + fallback
src/config/api-list.ts        endpoint registry (documentation only)
```

## Steps

- [ ] Add an API base URL and a typed client for the Zenkai API.
- [ ] Anime: replace `lib/api/anilist.ts` with `/api/v1/anime*`; keep the existing
      component props stable so the UI does not change shape mid-migration.
- [ ] Manga: replace `lib/api/mangadex.ts` with `/api/v1/manga*`.
- [ ] Playback: delete `lib/sources/` and consume `/api/v1/episodes/:id/sources`,
      which already ranks, validates and falls back server-side.
- [ ] Subtitles/skip markers: consume `/api/v1/episodes/:id/metadata`.
- [ ] Delete the duplicated zod schemas once backend responses are proven
      equivalent. Two definitions of one contract is the thing to remove, not keep.

## Sequencing

Do this after the backend contract is frozen (P22) so the frontend is written once
against a stable API. Doing it earlier means rewriting the client twice.
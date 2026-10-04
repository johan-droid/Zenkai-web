# Zenkai Web

An anime and manga browser. Browse titles, read chapters, and watch episodes.

Two independent packages:

| Folder     | Stack                    | Purpose                       |
| ---------- | ------------------------ | ----------------------------- |
| `frontend` | Next.js 16, React 19, TS | App Router UI, player, reader |
| `backend`  | Node, Fastify, Drizzle   | Provider API and persistence  |

## Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

Other scripts: `build`, `start`, `lint`.

If port 3000 is busy, pick another: `npm start -- -p 3001`.

### Data sources

Metadata comes from **AniList** (GraphQL) — no API key needed. Chapters and page
images come from **MangaDex** (REST + the MangaDex@Home image network).

AniList and MangaDex use unrelated id spaces, so the reader resolves an AniList
title to a MangaDex edition by title match before opening a chapter. That match
is a heuristic and can pick the wrong edition for ambiguous titles.

### Video sources

The bundled source registry points at public demo HLS streams (Big Buck Bunny
and similar test assets) so the player can be exercised without a licensed
provider. They are not real episodes. Register a licensed or self-hosted
provider in `frontend/src/lib/sources/registry.ts` to play real content.

### Local data

Reading and watch progress live in the browser via IndexedDB (Dexie) and never
leave the device unless you export them from Settings.

## Backend

```bash
cd backend
cp .env.example .env    # then edit the values
npm install
npm run dev
```

Requires a PostgreSQL database, configured through `DATABASE_URL` in `.env`.

> `.env` holds real credentials and is git-ignored. Only `.env.example` is
> committed. Never commit `.env`.

## Project layout

```
frontend/src
  app/(main)/<route>/page.tsx   route entry points
  components/<area>/            UI by feature area
  lib/api/                      provider clients (AniList, MangaDex)
  lib/sources/                  video source registry and resolver
  lib/db/                       IndexedDB schema and progress queries
  hooks/                        reusable React hooks

backend/src
  db/schema/                    Drizzle table definitions
  domain/                       shared types
  providers/                    source resolvers
```

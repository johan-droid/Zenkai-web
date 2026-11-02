# Zenkai Web — Authoritative Data Models & Entities

This document defines the core data entities, database schemas, TypeScript interfaces, and normalization rules used across the Zenkai application.

---

## 1. Database Entities (PostgreSQL via Drizzle ORM)

### 1.1 `users`
- `id`: `uuid` (Primary Key, auto-generated).
- `username`: `varchar(32)` (Unique, Not Null).
- `email`: `varchar(255)` (Unique, Not Null).
- `passwordHash`: `text` (Not Null, scrypt hash).
- `displayName`: `varchar(64)` (Nullable).
- `avatarUrl`: `text` (Nullable, HTTPS URL).
- `bio`: `text` (Nullable, max 500 chars).
- `settings`: `text` (Nullable, AES-256-CBC encrypted base64 payload).
- `isActive`: `boolean` (Default: `true`).
- `createdAt`, `updatedAt`: `timestamp with time zone`.

### 1.2 `user_sessions`
- `id`: `uuid` (Primary Key).
- `userId`: `uuid` (Foreign Key -> `users.id`, onDelete cascade).
- `tokenHash`: `varchar(64)` (Unique, SHA-256 hash of high-entropy token).
- `userAgent`: `text` (Nullable).
- `ipAddress`: `varchar(45)` (Nullable).
- `expiresAt`: `timestamp with time zone` (Not Null).
- `lastSeenAt`: `timestamp with time zone` (Not Null).

### 1.3 `user_library`
- `id`: `uuid` (Primary Key).
- `userId`: `uuid` (Foreign Key -> `users.id`, onDelete cascade).
- `kind`: `varchar(16)` (Not Null, `"anime" | "manga" | "novel"`).
- `mediaId`: `varchar(64)` (Not Null, cross-reference ID).
- `status`: `varchar(16)` (Not Null, `"watching" | "plan" | "completed" | "dropped"`).
- `rating`: `varchar(10)` (Nullable, user rating).
- `notes`: `text` (Nullable).
- `createdAt`, `updatedAt`: `timestamp with time zone`.
- *Constraints*: Unique compound index on `(userId, kind, mediaId)`.

### 1.4 `user_progress`
- `id`: `uuid` (Primary Key).
- `userId`: `uuid` (Foreign Key -> `users.id`, onDelete cascade).
- `kind`: `varchar(16)` (Not Null).
- `mediaId`: `varchar(64)` (Not Null).
- `unit`: `integer` (Not Null, episode or chapter number).
- `positionSeconds`: `integer` (Not Null, default 0).
- `durationSeconds`: `integer` (Nullable).
- `page`: `integer` (Nullable, manga reader page).
- `totalUnits`: `integer` (Nullable).
- `completed`: `boolean` (Not Null, default false).
- `updatedAt`: `timestamp with time zone`.

### 1.5 `anime` & `episodes`
- `anime`: Primary catalogue table containing `id`, `anilistId`, `malId`, `titleRomaji`, `titleEnglish`, `titleNative`, `description`, `coverUrl`, `bannerUrl`, `format`, `status`, `season`, `seasonYear`, `averageScore`, `popularity`, `totalEpisodes`, `durationMinutes`, `genres` (json array).
- `episodes`: Synced episodes table containing `id`, `animeId`, `episodeNumber`, `title`, `airingAt`, `durationSeconds`, `thumbnailUrl`, `isFiller`.

---

## 2. Client-Side Dexie (IndexedDB) Schema

### 2.1 Database Configuration (`frontend/src/lib/db/dexie.ts`)
```ts
db.version(1).stores({
  progress: "id, kind, mediaId, updatedAt, [kind+mediaId]",
  bookmarks: "id, kind, mediaId, createdAt",
  library: "id, kind, mediaId, status, updatedAt",
  history: "id, kind, mediaId, endedAt, createdAt, [kind+mediaId]",
});
```

### 2.2 Composite Key Rules
- `progress`: Composite ID `${kind}:${mediaId}:${unit}`.
- `library`: Composite ID `${kind}:${mediaId}`.
- `history`: Composite ID `${kind}:${mediaId}`.

---

## 3. Neutral Frontend Media Model (`lib/media.ts`)

To avoid coupling UI components to provider-specific field names (e.g. AniList's `coverImage.large` vs MangaDex's `fileName`), all catalogue, browse, and search responses are transformed into a neutral `MediaSummary` interface:

```ts
export interface MediaSummary {
  id: string;               // Cross-reference ID or database UUID
  kind: "anime" | "manga" | "novel";
  title: string;            // Preferred display title (English -> Romaji -> Native)
  coverUrl: string | null;  // Nullable cover image
  bannerUrl?: string | null;// Nullable header banner
  format?: string | null;   // TV, MOVIE, MANGA, NOVEL
  status?: string | null;   // RELEASING, FINISHED, ONGOING
  year?: number | null;     // Release year
  score?: number | null;    // Score (0-100 scale; null when unrated, NEVER 0)
  totalUnits?: number | null; // Total episodes or chapters
}
```

### Normalization Rules
1. **Scores**: An unrated title has `score: null`. It is NEVER fabricated as `0`, because 0 reads as the lowest possible rating rather than unrated.
2. **Titles**: If `titleEnglish` is null or empty string, fallback to `titleRomaji`, then `titleNative`.
3. **Empty Arrays**: Missing relations or chapters default to `[]`.

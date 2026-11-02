# Zenkai Web — API Contracts & Schema Registry

This registry documents the verified request parameters, HTTP methods, headers, response schemas, and status codes for Zenkai's core API contracts.

---

## 1. Authentication Contracts

### `POST /api/v1/auth/register`
- **Request Body**:
  ```json
  {
    "username": "string (3-32 chars, regex: ^[a-zA-Z0-9_-]+$)",
    "email": "string (valid email, max 255)",
    "password": "string (8-128 chars)",
    "displayName": "string (optional, max 64)"
  }
  ```
- **Responses**:
  - `201 Created`: Sets `Set-Cookie: zenkai_session=...; HttpOnly; SameSite=Lax; Path=/`
    ```json
    {
      "user": {
        "id": "uuid",
        "username": "string",
        "email": "string",
        "displayName": "string | null",
        "avatarUrl": "string | null",
        "bio": "string | null",
        "createdAt": "ISO string",
        "updatedAt": "ISO string"
      },
      "token": "string"
    }
    ```
  - `400 Bad Request`: Validation failure (e.g. invalid username format).
  - `409 Conflict`: Username or email already registered.
  - `429 Too Many Requests`: Rate limit exceeded (max 10 requests / minute).

### `POST /api/v1/auth/login`
- **Request Body**:
  ```json
  {
    "login": "string (username or email)",
    "password": "string"
  }
  ```
- **Responses**:
  - `200 OK`: Sets `Set-Cookie: zenkai_session=...`
    ```json
    {
      "user": { ...UserProfile },
      "token": "string"
    }
    ```
  - `401 Unauthorized`: Invalid credentials (constant-time scrypt protection).

### `GET /api/v1/auth/me`
- **Headers**: Requires valid `Cookie: zenkai_session=...` or `Authorization: Bearer <token>`.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "user": { ...UserProfile },
      "session": {
        "id": "uuid",
        "expiresAt": "ISO string",
        "lastSeenAt": "ISO string"
      }
    }
    ```
  - `401 Unauthorized`: If unauthenticated.

---

## 2. Media Discovery & Catalogue Contracts

### `GET /api/v1/home`
- **Query Parameters**:
  - `perPage` (optional integer, 1-50, default 10).
- **Response**: `200 OK`
  ```json
  {
    "trending": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "popular": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "seasonal": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "topRated": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "upcoming": { "status": "ready", "items": [ ...UpcomingCard ] },
    "recent": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "recentlyUpdated": { "status": "ready", "items": [ ...DiscoveryCard ] },
    "generatedAt": "ISO string"
  }
  ```
  *Note*: If an upstream provider fails for one section, its `status` is set to `"unavailable"` with `reason` while other sections render normally.

### `GET /api/v1/anime`
- **Query Parameters**:
  - `page`: integer (min 1, default 1).
  - `perPage`: integer (min 1, max 50, default 20).
  - `season`: `"WINTER" | "SPRING" | "SUMMER" | "FALL"` (optional; requires `seasonYear`).
  - `seasonYear`: integer (1900-2200, optional).
  - `status`: `"FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS"` (optional).
  - `genre`: string (optional, 1-64 chars).
  - `format`: `"TV" | "TV_SHORT" | "MOVIE" | "OVA" | "ONA" | "SPECIAL" | "MUSIC"` (optional).
  - `sort`: `"POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC" | "FAVOURITES_DESC" | "TITLE_ROMAJI"` (optional).
- **Response**: `200 OK`
  ```json
  {
    "items": [ ...DiscoveryCard ],
    "page": 1,
    "perPage": 20,
    "total": 1420
  }
  ```

### `GET /api/v1/anime/:id`
- **Path Parameter**: `id` (positive integer or UUID).
- **Response**: `200 OK`
  ```json
  {
    "id": "string",
    "anilistId": 16498,
    "malId": 16498,
    "titles": {
      "romaji": "string | null",
      "english": "string | null",
      "native": "string | null"
    },
    "description": "string | null",
    "coverUrl": "string | null",
    "bannerUrl": "string | null",
    "format": "string | null",
    "status": "string",
    "year": 2013,
    "season": "SPRING",
    "seasonYear": 2013,
    "averageScore": 84,
    "popularity": 420000,
    "totalEpisodes": 25,
    "durationMinutes": 24,
    "genres": ["Action", "Fantasy"],
    "relations": [
      {
        "id": "string",
        "type": "SEQUEL",
        "title": "string",
        "coverUrl": "string | null",
        "format": "TV"
      }
    ],
    "nextAiringEpisode": {
      "episodeNumber": 26,
      "airingAt": "ISO string",
      "timeUntilAiring": 3600
    }
  }
  ```

---

## 3. Streaming & Playback Contracts

### `GET /api/v1/episodes/:episodeId/sources`
- **Path Parameter**: `episodeId` (string, local UUID or synthetic `"ep-<anilistId>-<num>"`).
- **Query Parameters**:
  - `language`: `"sub" | "dub" | "multi"` (default `"sub"`).
- **Responses**:
  - `200 OK`:
    ```json
    {
      "episode": {
        "id": "string",
        "episodeNumber": 1,
        "title": "To You, in 2000 Years",
        "durationSeconds": 1440,
        "thumbnailUrl": "string | null",
        "isFiller": false
      },
      "sources": [ ...RawSource ],
      "sourceCount": 3,
      "plans": [
        {
          "sourceId": "string",
          "providerSlug": "stream-provider",
          "access": "direct | embed",
          "mechanism": "hls | iframe",
          "delivery": "proxy | direct",
          "validated": true,
          "url": "string"
        }
      ],
      "planCount": 3,
      "servers": [
        {
          "serverId": "string",
          "serverName": "Sub HD 1",
          "status": "AVAILABLE",
          "type": "hls",
          "selectable": true
        }
      ],
      "resolutionTimeMs": 245
    }
    ```
  - `503 Service Unavailable`: `all_failed` (every provider encountered network failure; frontend renders retry action).

### `POST /api/v1/playback/execute`
- **Request Body**:
  ```json
  {
    "episodeId": "string",
    "sourceId": "string",
    "language": "sub | dub | multi"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "execution": {
        "target": {
          "type": "hls | embed",
          "url": "string (authorized stream URL or sandboxed embed URL)",
          "headers": { ...safeHeaders }
        },
        "plan": { ...PlaybackPlan },
        "status": "ready"
      }
    }
    ```
  - `409 Conflict`: Selection stale (upstream token or source expired; triggers bounded single auto-recovery).

# External API Inventory: Zenkai Streaming & Metadata API

**Inspected Host:** `https://zenkaii.pages.dev`  
**Inspection Date:** November 2026  
**Security & Access:** Protected by Zenkai Shield PoW / Captcha and `X-Zenkai-Embed` header controls.  
**Backend Proxy & Normalization Base:** Canonical Zenkai Backend API (`/api/v1/*`).

---

## 1. Discovered Endpoints

| # | Method | Path | Required Auth / Headers | Purpose | Verified Status |
|---|---|---|---|---|---|
| E1 | `GET` | `/api` | None | API metadata, version descriptor, and route catalogue | VERIFIED_LIVE |
| E2 | `GET` | `/api/servers` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Available streaming servers (`megaplay`, `vidstream`, `flixcloud`, `acdn`) per AniList ID and episode | VERIFIED_LIVE |
| E3 | `GET` | `/api/servers-available` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Alternative server availability discovery with optional title query | VERIFIED_LIVE |
| E4 | `GET` | `/api/stream` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Source resolution: direct HLS master playlists, skip timings, subtitles, multi-audio tracks | VERIFIED_LIVE |
| E5 | `GET` | `/api/subtitles` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Multi-language subtitle tracks via OpenSubtitles with ISO/BCP-47 language codes | VERIFIED_LIVE |
| E6 | `GET` | `/api/embed/animesalt` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Embed iframe resolution for AnimeSalt / Ravok multi-audio player | VERIFIED_LIVE |
| E7 | `GET` | `/api/filler` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Episode filler and mixed-canon catalogue classifications by title | VERIFIED_LIVE |
| E8 | `GET` | `/api/tmdb` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Cross-referenced external IDs (AniList, MAL, TMDB, TVDB, IMDB, AniDB) and TMDB metadata | VERIFIED_LIVE |
| E9 | `GET` | `/api/tmdb/episodes`| `X-Zenkai-Embed: 1` or `x-zenkai-shield` | TMDB episode metadata (episode numbers, names, overviews, still images, runtimes, air dates) | VERIFIED_LIVE |
| E10| `GET` | `/api/novel/home` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Light novel rankings and popular discovery feed | VERIFIED_LIVE |
| E11| `GET` | `/api/novel/search` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Light novel catalogue search | VERIFIED_LIVE |
| E12| `GET` | `/api/novel/detail` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Light novel synopsis, author, cover, genres by slug | VERIFIED_LIVE |
| E13| `GET` | `/api/novel/chapters`| `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Full chapter list with total count and chapter slugs | VERIFIED_LIVE |
| E14| `GET` | `/api/novel/read` | `X-Zenkai-Embed: 1` or `x-zenkai-shield` | Chapter reader content (paragraphs and navigation bounds) | VERIFIED_LIVE |
| E15| `GET` | `/api/shield/challenge`| None | Issue Proof-of-Work / SVG captcha challenge | VERIFIED_LIVE |
| E16| `POST`| `/api/shield/verify` | None | Verify PoW nonce / captcha answer and issue 24-hour token | VERIFIED_LIVE |
| E17| `GET` | `https://aniversee.vercel.app/api/tmdb/trending/movie/week` | None | Weekly trending movies feed from TMDB | VERIFIED_LIVE |
| E18| `GET` | `https://aniversee.vercel.app/api/tmdb/movie/:id` | None | Canonical movie metadata detail (cast, overview, runtime, rating) | VERIFIED_LIVE |
| E19| `GET` | `https://aniversee.vercel.app/api/tmdb/tv/:id` | None | Canonical TV series metadata detail | VERIFIED_LIVE |

---

## 2. Endpoint Details & Schemas

### 2.1 `/api/stream`
- **Query Parameters:**
  - `id`: AniList anime ID (e.g. `21`)
  - `ep`: Episode number (e.g. `1`)
  - `server`: Server identifier (`megaplay` | `vidstream` | `flixcloud` | `acdn`)
  - `audio`: Audio track mode (`sub` | `dub` | `multi`)
  - `title`: Anime title string (optional)
  - `format`: Anime format string (optional)
- **Response Structure:**
  ```json
  {
    "success": true,
    "server": "MegaPlay",
    "audio": "sub",
    "multiAudio": false,
    "streamUrl": "https://fetch.nexabloom.top/anime/.../master.m3u8",
    "subtitles": [
      {
        "file": "https://de3bv.eclipseharbor.world/anime/.../subtitles/eng-2.vtt",
        "label": "English",
        "default": true
      }
    ],
    "intro": { "start": 31, "end": 111 },
    "outro": { "start": 1376, "end": 1447 }
  }
  ```

### 2.2 `/api/subtitles`
- **Query Parameters:**
  - `id`: AniList anime ID
  - `ep`: Episode number
- **Response Structure:**
  ```json
  {
    "success": true,
    "subtitles": [
      {
        "id": "13900236",
        "label": "Hindi",
        "language": "Hindi",
        "lang": "hin",
        "url": "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1962464563",
        "source": "OpenSubtitles"
      },
      {
        "id": "7087818",
        "label": "English",
        "language": "English",
        "lang": "eng",
        "url": "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1955668762",
        "source": "OpenSubtitles"
      }
    ]
  }
  ```

### 2.3 `/api/filler`
- **Query Parameters:**
  - `t`: Anime title string
- **Response Structure:**
  ```json
  {
    "success": true,
    "max": 1168,
    "filler": [54, 55, 56, 57, ...],
    "mixed": [45, 46, 47, ...]
  }
  ```

### 2.4 `/api/tmdb`
- **Query Parameters:**
  - `id`: AniList ID
  - `title`: Anime title
  - `format`: Format string (e.g. `TV` or `MOVIE`)
- **Response Structure:**
  ```json
  {
    "success": true,
    "mapping": {
      "anilist": 21,
      "mal": 21,
      "tmdb": { "id": 37854, "type": "tv", "season": null },
      "tvdb": 81797,
      "imdb": "tt0388629",
      "anidb": 69,
      "source": "arm"
    },
    "tmdb": {
      "id": 37854,
      "name": "One Piece",
      "type": "tv",
      "overview": "...",
      "rating": 8.8,
      "backdrop": "/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg",
      "poster": "/dB4EDhre2dsC2kxYDavyKWqLQwi.jpg"
    }
  }
  ```

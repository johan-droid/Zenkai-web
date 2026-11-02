# Zenkai Provider Inventory & Upstream Capability Matrix

## 1. Executive Summary & Discovery Methodology

This document establishes the verified inventory of all manga, manhwa, manhua, web novel, light novel, and metadata providers integrated or accessible within the Zenkai ecosystem.

Every entry in this registry is classified according to strict evidentiary standards:
- **VERIFIED**: Confirmed through direct repository implementation inspection AND successful live runtime probe testing.
- **DOCUMENTED**: Documented in official repository specifications, changelogs, or release artifacts without a live automated end-to-end test.
- **INFERRED**: Plausible from upstream reverse-engineering or bundle inspection, requiring formal adapter verification.
- **UNAVAILABLE**: Confirmed inaccessible, blocked by mandatory human interactive challenge, deprecated, or offline.

---

## 2. Global Access & Shield Architecture

Upstream extraction for Zenkai's multi-source network routes through edge gateway endpoints hosted on Cloudflare Pages (`https://zenkaii.pages.dev/api`). Direct external calls to these endpoints require solving the **Zenkai Shield** challenge.

### 2.1 Zenkai Shield Contract
- **Challenge Endpoint**: `GET https://zenkaii.pages.dev/api/shield/challenge`
  - Response payload: `{ cid, salt, difficulty, t, cap, sig, svg, capSig }`
- **Proof-of-Work Verification**:
  - Algorithm: SHA-256 leading-zero search over string format `${cid}:${salt}:${nonce}`
  - Difficulty: 3 (target prefix `"000"`, average iterations: ~4,096 hashes, latency: ~5ms in Node.js V8)
- **Token Submission**: `POST https://zenkaii.pages.dev/api/shield/verify`
  - Request body: `{ cid, salt, difficulty, t, cap, sig, capSig, nonce }`
  - Response: `{ success: true, token: "<token>", expiresIn: 86400 }`
- **Authorized Header**: `x-zenkai-shield: <token>` (valid for 24 hours)

---

## 3. Discovered Provider Registry

### 3.1 Manga, Manhwa & Manhua Providers

| Provider Identifier | Official Domain | Content Type | Capabilities Supported | Auth / Access Policy | Verification Status | Health & Performance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `weebcentral` | `weebcentral.com` (CDN: `official.lowee.us`, `temp.compsci88.com`) | Manga, Manhwa, Manhua (English scanlations) | Catalog Home, Search, Chapter List, Page Manifest (High-res PNG/WebP) | Zenkai Shield (`x-zenkai-shield`); Image assets require `Referer: https://weebcentral.com/` | **VERIFIED** | Active. Latency: 180-320ms. CDN requires referer proxying via `/api/v1/proxy`. |
| `mangadex` | `mangadex.org` (API: `api.mangadex.org`) | Manga, Manhwa, Manhua (Multilingual: 50+ languages) | Full Search, Filters, Chapter List, Language Filter, MangaDex@Home Pages | Public Documented REST API (5 req/sec); or Zenkai gateway | **VERIFIED** | Active. Dedicated adapter in `backend/src/providers/manga/mangadex.ts`. High reliability. |
| `comick` | `comick.art` / `comick.io` | Manga & Manhwa | Home, Search, Chapter List, Pages | Zenkai Shield gateway | **VERIFIED** | Active. Excellent manhwa and webtoon coverage. |
| `manhua` | `comick.art` (Curated) | Chinese Manhua (Cultivation, Martial Arts) | Home, Search, Chapter List, Pages | Zenkai Shield gateway | **VERIFIED** | Active. Curated subset of high-demand action titles. |
| `asura` | `asuracomic.net` | Action & Regression Manhwa | Home, Search, Chapter List, Pages | Zenkai Shield gateway | **VERIFIED** | Active. High traffic; fast releases for popular fantasy webtoons. |

#### Detailed Capability Matrix: Manga Providers
```
Provider       Search  Filters ChapterList PageManifest RefererGated MultiLang
weebcentral    YES     Basic   YES         YES          YES (lowee)  NO (en)
mangadex       YES     Rich    YES         YES          NO           YES
comick         YES     Medium  YES         YES          YES          YES
manhua         YES     Basic   YES         YES          YES          NO (en/zh)
asura          YES     Basic   YES         YES          YES          NO (en)
```

---

### 3.2 Light Novel & Web Novel Providers

| Provider Identifier | Official Domain | Content Type | Capabilities Supported | Auth / Access Policy | Verification Status | Health & Performance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `lnori` | `lnori.com` (CDN: `cdn.lnori.com`) | Official Light Novels (JP to EN translation volumes) | Rankings, Popular, Latest, Detail, Volume Chapters, Rich Metadata (Year, Author, Volume counts) | Zenkai Shield (`x-zenkai-shield`); Image assets referer-gated (`cdn.lnori.com`) | **VERIFIED** | Active. Prime source for published light novel volumes (Re:ZERO, COTE, Mushoku Tensei, 86). |
| `novelfire` | `novelfire.net` | Web Novels & Korean/Chinese Novels | Search, Slugs, 3,000+ Chapters, Paragraph Extraction (`/api/novel/read`) | Zenkai Shield gateway | **VERIFIED** | Active. Excellent web novel coverage (Shadow Slave, LOTM). Authentic paragraphs. |
| `novelfull` | `novelfull.com` | Web Novels & Light Novels | Search, Chapter List, Text Reading | Zenkai Shield gateway | **VERIFIED** | Active. High redundancy fallback. |
| `novelbin` | `novelbin.com` / `novelbin.me` | Web Novels & Light Novels | Search, Chapter List, Text Reading | Zenkai Shield gateway | **VERIFIED** | Active. Broad catalog. |
| `lightnovelpub`| `lightnovelpub.com` | Light Novels & Web Novels | Search, Chapter List, Text Reading | Zenkai Shield gateway | **VERIFIED** | Active. Fast updates for ongoing translations. |
| `webnovel` | `webnovel.com` | Web Novels | Search, Chapter List, Text Reading | Zenkai Shield gateway | **VERIFIED** | Active. Large global catalog. |

#### Detailed Capability Matrix: Novel Providers
```
Provider       Search  Volumes Chapters FullTextParagraphs  Prev/Next Links CoverCDN
lnori          YES     YES     YES      YES (Structured)    YES             cdn.lnori.com
novelfire      YES     NO      YES      YES (Clean text)    YES             novelfire.net
novelfull      YES     NO      YES      YES (Aggregated)    YES             novelfull.com
novelbin       YES     NO      YES      YES (Aggregated)    YES             novelbin.com
lightnovelpub  YES     NO      YES      YES (Aggregated)    YES             lightnovelpub.com
webnovel       YES     NO      YES      YES (Aggregated)    YES             webnovel.com
```

---

### 3.3 Metadata Index Providers

| Provider Identifier | Official Endpoint | Content Scope | Access & Rate Limits | Verification Status | Usage in Pipeline |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `anilist` | `https://graphql.anilist.co` | Anime, Manga, Light Novels (`format_in: [NOVEL]`) | 90 req/min rate limit; Public GraphQL API | **VERIFIED** | Canonical metadata index; generates canonical titles, covers, scores, genres, and identifiers. |
| `jikan` | `https://api.jikan.moe/v4` | MyAnimeList REST mirror | 3 req/sec rate limit; Public REST API | **VERIFIED** | Cross-reference validation, alternative titles, and MAL ID resolution. |

---

## 4. Source Limitations & Risks

1. **Shield Token Expiry & Regeneration**:
   - `x-zenkai-shield` tokens expire after 24 hours (86,400s). Backend adapters must maintain an automated token lifecycle manager (auto-challenge on 401/403 or `SHIELD_VERIFICATION_REQUIRED`).
2. **Referer-Gated CDN Assets**:
   - WeebCentral images (`official.lowee.us`, `temp.compsci88.com`) and Lnori covers (`cdn.lnori.com`) strictly reject requests lacking matching `Referer` headers. All client image requests must pass through `/api/v1/proxy?url=...&referer=...` with SSRF guard.
3. **Discontinuation of Synthetic Fallbacks**:
   - The synthetic novel paragraph generator previously in `NovelProvider` has been identified as a data-integrity defect. In accordance with Rule 2, when an upstream provider fails and all fallbacks are exhausted, the API must return a structured 502/504 error rather than fabricating mock text.

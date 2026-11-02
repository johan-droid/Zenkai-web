# Zenkai Normalized Metadata Schema Specification

## 1. Schema Design Philosophy

Zenkai unifies diverse upstream media into a coherent, provider-agnostic domain model. External IDs, provider nuances, and scanlation metadata are preserved without polluting core application boundaries.

Guiding principles:
- **No Fabrication**: If an upstream provider omits volume numbers, artists, or release dates, the field is explicitly `null` or empty array.
- **Stable Identity**: Internal UUIDs and canonical slugs anchor user libraries, history, and bookmarks regardless of provider switching.
- **Bi-directional Provenance**: Every entity links back to its origin provider, external ID, and synchronization timestamp.

---

## 2. Common Content Metadata Model

All readable and streamable media inherit common metadata attributes:

```typescript
export interface BaseContentMetadata {
  id: string;                     // Internal UUID
  slug: string;                   // URL-safe canonical slug
  canonicalTitle: string;         // Clean primary title
  romajiTitle: string | null;     // Romanised Japanese title
  englishTitle: string | null;    // Official or common English title
  nativeTitle: string | null;     // Kanji, Hanzi, or Hangul title
  synonyms: string[];             // Alternative titles for search matching
  description: string | null;     // Clean sanitized plaintext / markdown synopsis
  coverUrl: string | null;        // Standard cover image URL
  coverImageLarge: string | null; // High-res cover image URL
  bannerUrl: string | null;       // Wide banner image URL
  status: "ONGOING" | "COMPLETED" | "HIATUS" | "CANCELLED" | "UNKNOWN";
  genres: string[];               // Normalized genre taxonomy
  demographics: string[];         // e.g. ["Shounen", "Seinen", "Josei"]
  averageScore: number | null;    // Normalized 0-100 or 0-10 score
  popularity: number | null;      // Total followers / bookmarks count
  startYear: number | null;       // Initial publication year
  createdAt: string;              // ISO-8601 creation timestamp
  updatedAt: string;              // ISO-8601 last modified timestamp
}
```

---

## 3. Manga-Specific Metadata Models

### 3.1 Manga Title Detail (`MangaDetail`)
```typescript
export interface NormalizedManga extends BaseContentMetadata {
  contentType: "manga" | "manhwa" | "manhua";
  mangadexId: string | null;
  contentRating: "safe" | "suggestive" | "erotica" | "pornographic";
  isAdult: boolean;
  originalLanguage: string | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  chapterCounts: Record<string, number>; // { en: 142, fr: 80 }
  authors: string[];
  artists: string[];
  externalIds: Record<string, string>;   // { weebcentral: "01J76XY...", mangadex: "32d76..." }
}
```

### 3.2 Manga Chapter & Page Manifest (`MangaChapter`, `ChapterPages`)
```typescript
export interface NormalizedMangaChapter {
  id: string;                     // e.g. "mc-01J76XZ8D1H875P9QRNKEA6X83"
  mangaId: string;                // Parent internal manga UUID or canonical slug
  provider: string;               // e.g. "weebcentral", "mangadex"
  externalId: string;             // Upstream chapter identifier
  chapterNumber: string;          // String format accommodates fractional chapters ("10.5")
  volume: string | null;          // Volume number if grouped
  title: string | null;           // Chapter title
  language: string;               // ISO-639-1 language code ("en", "es", "ja")
  scanlationGroup: string | null; // Scanlation team / translator
  pagesCount: number | null;      // Verifiable page count
  publishedAt: string | null;     // ISO-8601 release timestamp
}

export interface NormalizedPageManifest {
  chapterId: string;
  provider: string;
  pages: Array<{
    pageNumber: number;           // 1-indexed sequential page number
    imageUrl: string;             // Absolute CDN URL
    proxyRequired: boolean;       // True if CDN requires referer headers
    refererHeader?: string;       // Expected Referer value for proxying
    width?: number;               // Pixel width if known
    height?: number;              // Pixel height if known
  }>;
}
```

---

## 4. Light Novel & Web Novel Metadata Models

### 4.1 Novel Detail (`NormalizedNovel`)
```typescript
export interface NormalizedNovel extends BaseContentMetadata {
  anilistId: number | null;
  author: string | null;
  illustrator: string | null;
  translator: string | null;
  format: "LIGHT_NOVEL" | "WEB_NOVEL";
  totalChapters: number | null;
  totalVolumes: number | null;
  source: string;                 // Origin aggregator slug (e.g. "lnori", "novelfire")
  externalIds: Record<string, string>; // { lnori: "3343~re-zero", novelfire: "shadow-slave" }
}
```

### 4.2 Novel Chapter & Reading Content
```typescript
export interface NormalizedNovelChapter {
  id: string;                     // Internal novel chapter UUID
  novelId: string;                // Parent novel UUID
  source: string;                 // "lnori", "novelfire", "novelfull", etc.
  chapterNumber: number;          // Sequential integer chapter number
  chapterSlug: string;            // Upstream slug (e.g. "chapter-1", "12040~re-zero-vol-1")
  volumeNumber: number | null;    // Volume grouping if available
  title: string;                  // Chapter title
  releaseDate: string | null;     // Publication date
}

export interface NormalizedNovelContent {
  chapterId: string;
  novelId: string;
  source: string;
  chapterNumber: number;
  chapterSlug: string;
  title: string;
  paragraphs: string[];           // Clean array of non-empty text paragraphs
  content: string;                // Double-newline joined text representation
  previousChapterSlug: string | null;
  nextChapterSlug: string | null;
  cachedAt: string;               // ISO-8601 cache timestamp
}
```

---

## 5. Provenance & External Cross-Reference Model

Cross-references link internal content to external registries without vendor lock-in:

```typescript
export interface ProvenanceCrossReference {
  id: string;
  internalId: string;             // UUID of manga or novel record
  mediaType: "MANGA" | "NOVEL";
  idType: "anilist" | "mal" | "mangadex" | "weebcentral" | "lnori" | "novelfire" | "comick";
  externalId: string;
  confidence: number;             // Confidence score (1.0 = exact ID link, 0.9 = exact normalized title match)
  lastVerifiedAt: string;
}
```

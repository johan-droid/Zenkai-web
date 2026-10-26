/**
 * Deterministic title and edition matching for streaming providers (P0 Identity Lock).
 *
 * Prevents sequel/spinoff/prequel collapse (e.g. Gintama 2006 vs Gintama 2011 / Gintama°,
 * K-ON! vs K-ON!!, Bleach vs Bleach TYBW).
 */

export interface TitleMatchingTarget {
  canonicalTitle?: string;
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
  synonyms?: string[];
}

export interface CandidateShow {
  id: string;
  title?: string;
}

/**
 * Extract distinguishing edition features from a title string.
 * Captures seasons, parts, cours, formats, roman numerals, release years,
 * distinguishing punctuation marks (', °, !), and distinct franchise subtitles.
 */
export function extractEditionFeatures(title: string): Set<string> {
  const t = title.toLowerCase();

  const seasonMatch = (
    t.match(
      /(?:season\s*\d+|\d+(?:st|nd|rd|th)\s*season|s\d+|part\s*\d+|cour\s*\d+|movie|film|ova|special|recap|final\s*season|the\s*final)/gi,
    ) || []
  ).map((s) => s.toLowerCase().replace(/\s+/g, ""));

  const romanMatch = (t.match(/\b(ii|iii|iv|v|vi|vii|viii|ix)\b/gi) || []).map(
    (r) => "roman_" + r.toLowerCase(),
  );

  const yearMatch = (t.match(/\b(19\d\d|20\d\d)\b/g) || []).map((y) => "year_" + y);

  const endNumMatch = (t.match(/\b([2-9]|1[0-6])\s*$/g) || []).map((n) => "endnum_" + n.trim());

  const subtitleMatch = (
    t.match(
      /\b(shippuden|enchousen|porori|shirogane|brotherhood|thousand[-\s]?year\s*blood\s*war|tybw|alicization|reloaded|revolution)\b/gi,
    ) || []
  ).map((s) => "sub_" + s.toLowerCase().replace(/[-\s]/g, ""));

  const primes = (title.match(/'/g) || []).length;
  const degrees = (title.match(/°/g) || []).length;
  const exclamations = (title.match(/!/g) || []).length;

  const tokens = new Set<string>([
    ...seasonMatch,
    ...romanMatch,
    ...yearMatch,
    ...endNumMatch,
    ...subtitleMatch,
  ]);

  if (primes > 0) tokens.add(`prime_${primes}`);
  if (degrees > 0) tokens.add(`degree_${degrees}`);
  if (exclamations > 0) tokens.add(`excl_${exclamations}`);

  return tokens;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function normalizeBase(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /(?:season\s*\d+|\d+(?:st|nd|rd|th)\s*season|s\d+|part\s*\d+|cour\s*\d+|movie|film|ova|special|recap|final\s*season|the\s*final)/gi,
      "",
    )
    .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix)\b/gi, "")
    .replace(/\b(19\d\d|20\d\d)\b/g, "")
    .replace(/\b([2-9]|1[0-6])\s*$/g, "")
    .replace(/\b(shippuden|enchousen|porori|shirogane|brotherhood|thousand[-\s]?year\s*blood\s*war|tybw|alicization|reloaded|revolution)\b/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface ShowCacheKeyResult {
  key: string;
  isAmbiguous: boolean;
  tier: "canonical_id" | "features" | "ambiguous";
}

export interface ShowCacheKeyInput {
  anilistId?: string | number | null;
  malId?: string | number | null;
  animeTitle?: string | null;
  externalIds?: Record<string, string | number | null | undefined>;
}

export interface ShowCacheKeyRecord {
  anilistId?: string | number | null;
  canonicalTitle?: string | null;
  titles?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[];
  } | null;
  year?: number | null;
  season?: string | null;
  format?: string | null;
}

function isValidId(val: unknown): val is string | number {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  if (!s || s === "undefined" || s === "null" || s === "[object Object]") return false;
  return true;
}

/**
 * Deterministically constructs an identity-safe cache key for provider show mapping.
 *
 * Tier 1: Stable Canonical ID (AniList or MAL ID). Guaranteed isolated across seasons, remakes, and movies.
 * Tier 2: Title with Edition Features. Distinguishes sequels, cours, roman numerals, primes, degrees, and years when ID is missing.
 * Tier 3: Ambiguous Bare Title. When neither ID nor distinguishing features exist, flagged as ambiguous
 *         so the provider can bypass cache writes to prevent cross-season contamination.
 */
export function buildShowCacheKey(
  providerSlug: string,
  request: ShowCacheKeyInput,
  record?: ShowCacheKeyRecord | null,
): ShowCacheKeyResult {
  const slug = (providerSlug || "unknown").trim().toLowerCase();

  // Tier 1A: Canonical AniList ID
  const rawAnilistId = [
    request.anilistId,
    record?.anilistId,
    request.externalIds?.anilist,
  ].find(isValidId);

  if (rawAnilistId !== undefined) {
    return {
      key: `${slug}:show:anilist:${String(rawAnilistId).trim()}`,
      isAmbiguous: false,
      tier: "canonical_id",
    };
  }

  // Tier 1B: Canonical MAL ID
  const rawMalId = [
    request.malId,
    request.externalIds?.mal,
  ].find(isValidId);

  if (rawMalId !== undefined) {
    return {
      key: `${slug}:show:mal:${String(rawMalId).trim()}`,
      isAmbiguous: false,
      tier: "canonical_id",
    };
  }

  // Tier 2: Feature-disambiguated title
  const titleCandidates: string[] = [];
  if (record?.canonicalTitle) titleCandidates.push(record.canonicalTitle);
  if (request.animeTitle) titleCandidates.push(request.animeTitle);
  if (record?.titles?.english) titleCandidates.push(record.titles.english);
  if (record?.titles?.romaji) titleCandidates.push(record.titles.romaji);

  const features = new Set<string>();
  for (const t of titleCandidates) {
    if (typeof t === "string" && t.trim().length > 0) {
      for (const f of extractEditionFeatures(t)) {
        features.add(f);
      }
    }
  }

  if (record?.year && Number.isFinite(record.year)) {
    features.add(`year_${record.year}`);
  }
  if (record?.format && typeof record.format === "string") {
    const fmt = record.format.trim().toLowerCase();
    if (["movie", "ova", "ona", "special"].includes(fmt)) {
      features.add(`format_${fmt}`);
    }
  }

  const primaryTitle = record?.canonicalTitle || request.animeTitle || "";
  const base = normalizeBase(primaryTitle);

  if (features.size > 0 && base.length > 0) {
    const sortedFeatures = Array.from(features).sort().join(":");
    return {
      key: `${slug}:show:features:${base}:${sortedFeatures}`,
      isAmbiguous: false,
      tier: "features",
    };
  }

  // Tier 3: Ambiguous bare title - no canonical ID and no distinguishing features
  return {
    key: `${slug}:show:ambiguous:${base || "unknown"}`,
    isAmbiguous: true,
    tier: "ambiguous",
  };
}

/**
 * Deterministically match a candidate show from provider search results against verified anime titles.
 * Returns candidate.id if a reliable match is found, otherwise null.
 * Never silently defaults or collapses seasons/sequels into parent shows.
 */
export function matchShowTitle(
  candidates: CandidateShow[],
  target: TitleMatchingTarget,
): string | null {
  const verifiedTitles: string[] = [];
  if (target.canonicalTitle) verifiedTitles.push(target.canonicalTitle);
  if (target.english) verifiedTitles.push(target.english);
  if (target.romaji) verifiedTitles.push(target.romaji);
  if (target.native) verifiedTitles.push(target.native);
  if (Array.isArray(target.synonyms)) {
    for (const syn of target.synonyms) {
      if (syn) verifiedTitles.push(syn);
    }
  }

  if (verifiedTitles.length === 0 || candidates.length === 0) return null;

  // 1. Exact string match (case-insensitive, preserving all symbols and punctuation)
  for (const c of candidates) {
    if (!c.title) continue;
    const cLower = c.title.trim().toLowerCase();
    for (const vt of verifiedTitles) {
      if (cLower === vt.trim().toLowerCase()) {
        return c.id;
      }
    }
  }

  // 2. Feature-aware matching (strict: same base + same features only)
  for (const c of candidates) {
    if (!c.title) continue;
    const cFeatures = extractEditionFeatures(c.title);
    const cBase = normalizeBase(c.title);

    for (const vt of verifiedTitles) {
      const vtFeatures = extractEditionFeatures(vt);
      const vtBase = normalizeBase(vt);

      // Distinguishing edition features must match exactly
      if (!setsEqual(cFeatures, vtFeatures)) continue;

      // BOTH the base name AND the edition features must match exactly;
      // no startsWith leniency and no "close enough" length diff.
      if (cBase === vtBase && cBase.length > 0) {
        return c.id;
      }
    }
  }

  return null;
}

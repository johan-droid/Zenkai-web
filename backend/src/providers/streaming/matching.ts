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

  const romanMatch = (t.match(/\b(ii|iii|iv|v|vi|vii|viii)\b/gi) || []).map(
    (r) => "roman_" + r.toLowerCase(),
  );

  const yearMatch = (t.match(/\b(19\d\d|20\d\d)\b/g) || []).map((y) => "year_" + y);

  const endNumMatch = (t.match(/\b(\d+)\s*$/g) || []).map((n) => "endnum_" + n.trim());

  const subtitleMatch = (
    t.match(
      /\b(shippuden|enchousen|porori|shirogane|brotherhood|thousand[-\s]?year\s*blood\s*war|tybw)\b/gi,
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

function normalizeBase(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /(?:season\s*\d+|\d+(?:st|nd|rd|th)\s*season|s\d+|part\s*\d+|cour\s*\d+|movie|film|ova|special|recap|final\s*season|the\s*final)/gi,
      "",
    )
    .replace(/\b(ii|iii|iv|v|vi|vii|viii)\b/gi, "")
    .replace(/\b(19\d\d|20\d\d)\b/g, "")
    .replace(/\b(\d+)\s*$/g, "")
    .replace(/\b(shippuden|enchousen|porori|shirogane|brotherhood|thousand[-\s]?year\s*blood\s*war|tybw)\b/gi, "")
    .replace(/[^a-z0-9]/g, "");
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

  // 2. Feature-aware matching
  for (const c of candidates) {
    if (!c.title) continue;
    const cFeatures = extractEditionFeatures(c.title);
    const cBase = normalizeBase(c.title);

    for (const vt of verifiedTitles) {
      const vtFeatures = extractEditionFeatures(vt);
      const vtBase = normalizeBase(vt);

      // Distinguishing edition features must match exactly
      if (!setsEqual(cFeatures, vtFeatures)) continue;

      if (cBase === vtBase && cBase.length > 0) {
        return c.id;
      }
      if (cBase.startsWith(vtBase) || vtBase.startsWith(cBase)) {
        const diff = Math.abs(cBase.length - vtBase.length);
        if (diff <= 3) return c.id;
      }
    }
  }

  return null;
}

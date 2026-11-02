/**
 * Content URL guard for manga pages and novel chapter text.
 *
 * Validates that provider content URLs (image CDNs, text endpoints) are on the
 * configured hostname allowlist and resolve to public addresses only. This
 * prevents Zenkai from being used as an open proxy or SSRF vector for
 * third-party content delivery.
 */

import { assertSafeUrl, type UrlGuardOptions } from "./url-guard.js";
import { config } from "../config/index.js";

/**
 * Validate a manga page image URL against the manga content allowlist.
 * Throws BlockedUrlError when the host is not permitted.
 */
export async function assertSafeMangaUrl(
  rawUrl: string,
): Promise<{ url: URL; address: string }> {
  return assertSafeUrl(rawUrl, {
    allowlist: config.mangaContentAllowlist,
  });
}

/**
 * Validate a novel chapter content URL against the novel content allowlist.
 * Throws BlockedUrlError when the host is not permitted.
 */
export async function assertSafeNovelUrl(
  rawUrl: string,
): Promise<{ url: URL; address: string }> {
  return assertSafeUrl(rawUrl, {
    allowlist: config.novelContentAllowlist,
  });
}

/**
 * Check whether a host is permitted for manga content without performing DNS.
 * Used for pre-validation before network calls.
 */
export function isMangaHostAllowed(host: string): boolean {
  const lower = host.toLowerCase();
  return config.mangaContentAllowlist.some(
    (entry) => lower === entry || lower.endsWith(`.${entry}`),
  );
}

/**
 * Check whether a host is permitted for novel content without performing DNS.
 */
export function isNovelHostAllowed(host: string): boolean {
  const lower = host.toLowerCase();
  return config.novelContentAllowlist.some(
    (entry) => lower === entry || lower.endsWith(`.${entry}`),
  );
}
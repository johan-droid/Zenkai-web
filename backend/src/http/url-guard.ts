/**
 * SSRF guard for the playback and image gateways.
 *
 * These endpoints fetch a URL the client supplies, which turns the service into
 * an open proxy for anything the server can reach: the cloud metadata service,
 * internal admin panels, other containers on the network. The checks below run
 * before every outbound fetch, and the DNS result is re-checked so a hostname
 * cannot resolve to a private address (a DNS-rebinding style bypass).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  { min: "0.0.0.0", max: "0.255.255.255" }, // "this" network
  { min: "10.0.0.0", max: "10.255.255.255" }, // RFC1918
  { min: "100.64.0.0", max: "100.127.255.255" }, // CGNAT
  { min: "127.0.0.0", max: "127.255.255.255" }, // loopback
  { min: "169.254.0.0", max: "169.254.255.255" }, // link-local + cloud metadata
  { min: "172.16.0.0", max: "172.31.255.255" }, // RFC1918
  { min: "192.0.0.0", max: "192.0.0.255" }, // IETF protocol assignments
  { min: "192.168.0.0", max: "192.168.255.255" }, // RFC1918
  { min: "198.18.0.0", max: "198.19.255.255" }, // benchmarking
  { min: "224.0.0.0", max: "239.255.255.255" }, // multicast
  { min: "240.0.0.0", max: "255.255.255.255" }, // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    const value = v4ToInt(ip);
    return PRIVATE_V4.some(
      (range) => value >= v4ToInt(range.min) && value <= v4ToInt(range.max),
    );
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // IPv4-mapped (::ffff:a.b.c.d) must be judged by the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  return false;
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export interface UrlGuardOptions {
  /** When present, only these hosts (exact or suffix) may be fetched. */
  allowlist?: string[];
}

function hostAllowed(host: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/**
 * Validate a URL and resolve it, returning the resolved address.
 *
 * Throws `BlockedUrlError` when the target is not safe to fetch. Callers pass
 * the returned IP to fetch as a pinned connect target so the socket cannot be
 * redirected after the check.
 */
export async function assertSafeUrl(
  rawUrl: string,
  options: UrlGuardOptions = {},
): Promise<{ url: URL; address: string }> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("malformed URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`unsupported protocol: ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new BlockedUrlError("credentials in URL are not allowed");
  }

  const host = url.hostname.toLowerCase();

  if (options.allowlist && options.allowlist.length > 0) {
    if (!hostAllowed(host, options.allowlist)) {
      throw new BlockedUrlError(`host not in allowlist: ${host}`);
    }
  }

  const literal = isIP(host);
  if (literal) {
    if (isPrivateAddress(host)) throw new BlockedUrlError(`private address blocked: ${host}`);
    return { url, address: host };
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`DNS resolution failed: ${host}`);
  }

  if (records.length === 0) throw new BlockedUrlError(`no DNS records for ${host}`);

  // Every answer must be safe, not just the first: a hostname resolving to one
  // public and one private address is a classic bypass.
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new BlockedUrlError(`host resolves to a private address: ${host}`);
    }
  }

  return { url, address: records[0].address };
}
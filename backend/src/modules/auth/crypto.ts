import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keyLen: 64,
};

/**
 * Hash a password using Node's standard scrypt implementation.
 * Encodes salt and hash in a standardized format: scrypt$N,r,p$saltHex$hashHex
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return `scrypt$${SCRYPT_PARAMS.N},${SCRYPT_PARAMS.r},${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Verify a candidate password against a stored scrypt hash using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt") {
      return false;
    }
    const [_, paramsStr, salt, hashHex] = parts;
    const [nStr, rStr, pStr] = paramsStr.split(",");
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);

    const expectedBuffer = Buffer.from(hashHex, "hex");
    const actualBuffer = scryptSync(password, salt, expectedBuffer.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure 256-bit session token.
 * Returns both the raw token (sent to client) and its SHA-256 hash (stored in DB).
 */
export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Compute the SHA-256 digest of a session token.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse a raw Cookie header into key-value pairs.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key) {
      cookies[key] = decodeURIComponent(value.join("="));
    }
  }
  return cookies;
}

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

let argon2: typeof import("argon2") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  argon2 = require("argon2");
} catch {
  argon2 = null;
}

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keyLen: 64,
};

function hashScrypt(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return `scrypt$${SCRYPT_PARAMS.N},${SCRYPT_PARAMS.r},${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString("hex")}`;
}

function verifyScrypt(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt") return false;
    const [, paramsStr, salt, hashHex] = parts;
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

    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/** Argon2id password hashing with default recommended parameters (falls back to scrypt if native addon is unavailable). */
export async function hashPassword(password: string): Promise<string> {
  if (argon2) {
    try {
      return await argon2.hash(password);
    } catch {
      // Fall through to scrypt if argon2 execution fails
    }
  }
  return hashScrypt(password);
}

/** Verify a candidate password against an Argon2id or scrypt hash. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!password || !storedHash) return false;
  try {
    if (storedHash.startsWith("$argon2")) {
      if (argon2) {
        return await argon2.verify(storedHash, password);
      }
      return false;
    }
    if (storedHash.startsWith("scrypt$")) {
      return verifyScrypt(password, storedHash);
    }
    return false;
  } catch {
    return false;
  }
}

/** Generate a cryptographically secure 256-bit session token. */
export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  return { rawToken, tokenHash };
}

/** Compute the SHA-256 digest of a session token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Parse a raw Cookie header into key-value pairs. */
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
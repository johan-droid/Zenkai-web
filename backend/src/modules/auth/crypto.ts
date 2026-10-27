import argon2 from "argon2";
import { randomBytes } from "node:crypto";

/** Argon2id password hashing with default recommended parameters. */
export async function hashPassword(password: string): Promise<string> {
  const hash = await argon2.hash(password);
  return hash;
}

/** Verify a candidate password against an Argon2id hash. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
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
  const createHash = require("node:crypto").createHash;
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
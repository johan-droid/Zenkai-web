/**
 * Zenkai Shield Token Manager
 *
 * Automatically solves upstream Proof-of-Work challenges from `zenkaii.pages.dev`,
 * acquires valid `x-zenkai-shield` authentication tokens (24-hour expiration),
 * coalesces concurrent challenge attempts, and injects required authorization headers.
 */

import { createHash } from "node:crypto";
import { fetchJson } from "../http/client.js";

interface ChallengeResponse {
  cid: string;
  salt: string;
  difficulty: number;
  t: number;
  cap?: number;
  sig?: string;
  svg?: string;
  capSig?: string;
  off?: boolean;
}

interface VerifyResponse {
  success: boolean;
  token?: string;
  expiresIn?: number;
  error?: string;
}

export class ZenkaiShieldManager {
  readonly #challengeEndpoint = "https://zenkaii.pages.dev/api/shield/challenge";
  readonly #verifyEndpoint = "https://zenkaii.pages.dev/api/shield/verify";

  #cachedToken: string | null = null;
  #tokenExpiresAt = 0;
  #inFlightAcquisition: Promise<string | null> | null = null;

  /**
   * Solves SHA-256 leading-zeros Proof-of-Work challenge.
   * Format: SHA256(`${cid}:${salt}:${nonce}`)
   */
  static solvePoW(cid: string, salt: string, difficulty: number): number {
    const targetPrefix = "0".repeat(difficulty);
    for (let nonce = 0; nonce < 500000; nonce++) {
      const hash = createHash("sha256")
        .update(`${cid}:${salt}:${nonce}`)
        .digest("hex");
      if (hash.startsWith(targetPrefix)) {
        return nonce;
      }
    }
    return -1;
  }

  /**
   * Solves the SVG-based character placement challenge when `cap: 1`.
   * Characters are extracted and ordered by their horizontal `x` position.
   */
  static solveCaptcha(svg?: string): string | undefined {
    if (!svg || typeof svg !== "string") return undefined;
    const matches = [...svg.matchAll(/<text[^>]*x="(\d+)"[^>]*>([^<]+)<\/text>/g)];
    if (matches.length === 0) return undefined;
    return matches
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2])
      .join("");
  }

  /**
   * Retrieves or refreshes a valid x-zenkai-shield header object.
   */
  async getShieldHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (token) {
      return { "x-zenkai-shield": token };
    }
    return {};
  }

  /**
   * Invalidates cached token to force re-acquisition on next call.
   */
  invalidate(): void {
    this.#cachedToken = null;
    this.#tokenExpiresAt = 0;
  }

  /**
   * Returns a valid shield token, reusing cache or acquiring a new one.
   */
  async getToken(): Promise<string | null> {
    const now = Date.now();
    // Cache valid with 30-minute buffer before expiration
    if (this.#cachedToken && this.#tokenExpiresAt > now + 30 * 60 * 1000) {
      return this.#cachedToken;
    }

    if (this.#inFlightAcquisition) {
      return this.#inFlightAcquisition;
    }

    this.#inFlightAcquisition = this.#acquireToken()
      .finally(() => {
        this.#inFlightAcquisition = null;
      });

    return this.#inFlightAcquisition;
  }

  async #acquireToken(): Promise<string | null> {
    try {
      const challenge = await fetchJson<ChallengeResponse>(this.#challengeEndpoint, {
        timeoutMs: 6000,
        retries: 1,
      });

      if (challenge.off) {
        return null;
      }

      if (!challenge.cid || !challenge.salt || typeof challenge.difficulty !== "number") {
        return null;
      }

      const nonce = ZenkaiShieldManager.solvePoW(
        challenge.cid,
        challenge.salt,
        challenge.difficulty,
      );

      if (nonce < 0) {
        return null;
      }

      let answer: string | undefined;
      if (challenge.cap === 1 && challenge.svg) {
        answer = ZenkaiShieldManager.solveCaptcha(challenge.svg);
      }

      const verifyBody: Record<string, any> = {
        cid: challenge.cid,
        salt: challenge.salt,
        difficulty: challenge.difficulty,
        t: challenge.t,
        cap: challenge.cap ?? 0,
        sig: challenge.sig,
        capSig: challenge.capSig,
        nonce,
        ...(answer ? { answer } : {}),
      };

      const verification = await fetchJson<VerifyResponse>(this.#verifyEndpoint, {
        method: "POST",
        body: verifyBody,
        timeoutMs: 6000,
        retries: 1,
      });

      if (verification?.success && verification.token) {
        this.#cachedToken = verification.token;
        const expiresInSec = verification.expiresIn ?? 86400;
        this.#tokenExpiresAt = Date.now() + expiresInSec * 1000;
        return this.#cachedToken;
      }

      return null;
    } catch {
      return null;
    }
  }
}

export const zenkaiShield = new ZenkaiShieldManager();

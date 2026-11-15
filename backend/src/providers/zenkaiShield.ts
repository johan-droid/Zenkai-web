/**
 * Zenkai Shield Token Manager
 *
 * Provides authorization headers for Zenkai upstream services.
 * In compliance with platform security policies and anti-circumvention standards,
 * automated CAPTCHA and Proof-of-Work bypass routines are deprecated and removed.
 * Legitimate access uses operator-configured tokens (ZENKAI_SHIELD_TOKEN) or
 * sanctioned public endpoints.
 */

export class ZenkaiShieldManager {
  readonly #staticToken = process.env.ZENKAI_SHIELD_TOKEN || null;

  /**
   * Invalidates cached token.
   */
  invalidate(): void {
    // No-op for static token
  }

  /**
   * Returns a configured shield token, or null if none is configured.
   */
  async getToken(): Promise<string | null> {
    return this.#staticToken;
  }

  /**
   * Returns headers to include with requests to protected endpoints.
   */
  async getShieldHeaders(): Promise<Record<string, string>> {
    if (this.#staticToken) {
      return { "x-zenkai-shield": this.#staticToken };
    }
    return {};
  }
}

export const zenkaiShield = new ZenkaiShieldManager();

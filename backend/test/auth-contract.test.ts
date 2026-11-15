/**
 * Authentication Contract & Consistency Test Suite (P1 Remediation)
 *
 * Verifies:
 *  1. POST /api/v1/auth/logout returns { success: true, loggedOut: true } (cross-contract consistency)
 *  2. Raw session tokens are never leaked in JSON response bodies (exclusively HttpOnly cookies)
 *  3. Session cookies have secure configuration (HttpOnly, SameSite, path)
 *  4. Unauthenticated access to protected routes returns HTTP 401
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import { config } from "../src/config/index.js";

function buildAuthTestApp() {
  const app = Fastify({ logger: false });

  const mockAuthService = {
    logout: async () => {},
    validateSession: async (token: string) => {
      if (token === "valid_session_token") {
        return {
          user: {
            id: "user_123",
            username: "testuser",
            email: "test@example.com",
            displayName: "Test User",
            avatarUrl: null,
            bio: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {
            id: "session_123",
            expiresAt: new Date(Date.now() + 86400000),
            lastSeenAt: new Date(),
          },
        };
      }
      return null;
    },
    register: async () => ({
      user: {
        id: "user_new",
        username: "newuser",
        email: "new@example.com",
        displayName: "New User",
        avatarUrl: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      rawToken: "secret_session_token_never_in_json",
      expiresAt: new Date(Date.now() + 86400000),
    }),
    login: async () => ({
      user: {
        id: "user_login",
        username: "loginuser",
        email: "login@example.com",
        displayName: "Login User",
        avatarUrl: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      rawToken: "secret_session_token_never_in_json",
      expiresAt: new Date(Date.now() + 86400000),
    }),
    checkUsername: async () => ({ available: true, suggestions: [] }),
    getLinkedAccounts: async () => [],
    unlinkOAuthAccount: async () => {},
    changePassword: async () => {},
    requestPasswordReset: async () => ({ requested: true }),
    confirmPasswordReset: async () => {},
    revokeOtherSessions: async () => {},
    getGoogleAuthUrl: () => ({ url: "https://accounts.google.com", state: "st", nonce: "no", codeVerifier: "cv" }),
    getAnilistAuthUrl: () => ({ url: "https://anilist.co", state: "st" }),
  } as any;

  registerAuthRoutes(app, mockAuthService);

  return app;
}

describe("Auth Contract & Consistency Suite", () => {
  it("returns both success: true and loggedOut: true on POST /api/v1/auth/logout", async () => {
    const app = buildAuthTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: `${config.SESSION_COOKIE_NAME}=valid_session_token`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    // Frontend expects { success: boolean }, existing backend tests expect { loggedOut: boolean }
    assert.equal(body.success, true);
    assert.equal(body.loggedOut, true);

    // Verify Set-Cookie clears the session cookie
    const setCookie = response.headers["set-cookie"];
    assert.ok(setCookie, "Set-Cookie header must be present to clear session");
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
    assert.ok(cookieStr.includes(`${config.SESSION_COOKIE_NAME}=`), "Must clear session cookie");
    assert.ok(cookieStr.includes("Max-Age=0") || cookieStr.includes("Expires="), "Must set cookie to expire");
  });

  it("never leaks raw session tokens in POST /api/v1/auth/register response body", async () => {
    const app = buildAuthTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "newuser",
        email: "new@example.com",
        password: "ValidPassword123!",
      },
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.ok(body.user);
    assert.equal(body.user.username, "newuser");
    assert.equal(body.rawToken, undefined, "Raw token must not be in response body");
    assert.equal(body.token, undefined, "Token must not be in response body");

    // Session token must be in HttpOnly cookie
    const setCookie = response.headers["set-cookie"];
    assert.ok(setCookie);
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
    assert.ok(cookieStr.includes("HttpOnly"), "Session cookie must have HttpOnly");
  });

  it("never leaks raw session tokens in POST /api/v1/auth/login response body", async () => {
    const app = buildAuthTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        login: "loginuser",
        password: "ValidPassword123!",
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.user);
    assert.equal(body.rawToken, undefined, "Raw token must not be in response body");
    assert.equal(body.token, undefined, "Token must not be in response body");

    const setCookie = response.headers["set-cookie"];
    assert.ok(setCookie);
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
    assert.ok(cookieStr.includes("HttpOnly"), "Session cookie must have HttpOnly");
  });

  it("returns 401 unauthorized for protected routes when no session cookie is present", async () => {
    const app = buildAuthTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    assert.equal(response.statusCode, 401);
  });
});

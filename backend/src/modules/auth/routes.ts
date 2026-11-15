import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./service.js";
import { parseCookies } from "./crypto.js";
import { AppError } from "../../http/errors.js";
import { config } from "../../config/index.js";
import type { UserRow, SessionRow } from "./repository.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: UserRow;
    session?: SessionRow;
    dbAuthError?: Error;
  }
}

export const SESSION_COOKIE_NAME = "zenkai_session";
export const OAUTH_STATE_COOKIE_NAME = "zenkai_oauth_state";

export interface OAuthStatePayload {
  state: string;
  nonce?: string;
  codeVerifier?: string;
  provider: "google" | "anilist";
  redirectPath?: string;
}

export function extractSessionToken(request: FastifyRequest): string | null {
  // 1. Try Cookie header
  const cookies = parseCookies(request.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }

  // 2. Try Authorization: Bearer <token>
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date): void {
  const isProd = config.NODE_ENV === "production";
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secureFlag = isProd ? "; Secure" : "";
  const cookieValue = `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
  reply.header("Set-Cookie", cookieValue);
}

export function clearSessionCookie(reply: FastifyReply): void {
  const isProd = config.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`,
  );
}

export function setOAuthStateCookie(reply: FastifyReply, data: OAuthStatePayload): void {
  const isProd = config.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  const serialized = Buffer.from(JSON.stringify(data)).toString("base64url");
  const cookieValue = `${OAUTH_STATE_COOKIE_NAME}=${serialized}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag}`;
  reply.header("Set-Cookie", cookieValue);
}

export function getOAuthStateCookie(request: FastifyRequest): OAuthStatePayload | null {
  const cookies = parseCookies(request.headers.cookie);
  const raw = cookies[OAUTH_STATE_COOKIE_NAME];
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export function clearOAuthStateCookie(reply: FastifyReply): void {
  const isProd = config.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`,
  );
}

/**
 * Enforce authenticated user, properly distinguishing database outages
 * from invalid sessions so transient outages do not wipe client logins.
 */
export function requireAuth(request: FastifyRequest): UserRow {
  if (request.dbAuthError) {
    throw new AppError(
      "service_unavailable",
      "Authentication service temporarily unavailable; database offline",
      503,
    );
  }
  if (!request.user) {
    throw AppError.unauthorized("Authentication required");
  }
  return request.user;
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  // Global onRequest hook to resolve session if token is provided
  app.addHook("onRequest", async (request) => {
    const token = extractSessionToken(request);
    if (!token) return;

    try {
      const auth = await authService.validateSession(token);
      if (auth) {
        request.user = auth.user;
        request.session = auth.session;
      }
    } catch (err: any) {
      // Capture infrastructure / database failures explicitly
      const msg = err?.message || "";
      if (
        msg.includes("Database offline") ||
        msg.includes("circuit breaker") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("connection timeout") ||
        msg.includes("Connection terminated")
      ) {
        request.dbAuthError = err;
      }
    }
  });

  /**
   * Register a new user account.
   * Hardened: returns user object only; raw session token is ONLY in HttpOnly cookie.
   */
  app.post(
    "/api/v1/auth/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000,
        },
      },
    },
    async (request, reply) => {
      const meta = {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      };

      const { user, rawToken, expiresAt } = await authService.register(request.body, meta);
      setSessionCookie(reply, rawToken, expiresAt);

      return reply.code(201).send({
        user,
      });
    },
  );

  /**
   * Log into an existing account.
   * Hardened: raw session token is strictly inside HttpOnly cookie.
   */
  app.post(
    "/api/v1/auth/login",
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: 60_000,
        },
      },
    },
    async (request, reply) => {
      const meta = {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      };

      const { user, rawToken, expiresAt } = await authService.login(request.body, meta);
      setSessionCookie(reply, rawToken, expiresAt);

      return reply.code(200).send({
        user,
      });
    },
  );

  /**
   * Log out of current session.
   */
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = extractSessionToken(request);
    if (token) {
      await authService.logout(token).catch(() => {});
    }
    clearSessionCookie(reply);
    return reply.code(200).send({ loggedOut: true });
  });

  /**
   * Retrieve current authenticated user profile and session.
   */
  app.get("/api/v1/auth/me", async (request, reply) => {
    const user = requireAuth(request);

    return reply.code(200).send({
      user,
      session: {
        id: request.session?.id,
        expiresAt: request.session?.expiresAt,
        lastSeenAt: request.session?.lastSeenAt,
      },
    });
  });

  /**
   * Real-time debounced username availability check.
   */
  const handleCheckUsername = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { username?: string };
    if (!query.username) {
      throw AppError.badRequest("username parameter is required");
    }

    const result = await authService.checkUsername(query.username.trim());
    return reply.code(200).send(result);
  };

  const checkUsernameOpts = {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: 60_000,
      },
    },
  };

  app.get("/api/v1/users/check-username", checkUsernameOpts, handleCheckUsername);
  app.get("/api/v1/auth/check-username", checkUsernameOpts, handleCheckUsername);

  /**
   * Update authenticated user profile.
   */
  const handleUpdateProfile = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request);
    const updated = await authService.updateProfile(user.id, request.body);
    return reply.code(200).send({ user: updated });
  };

  app.patch("/api/v1/users/profile", handleUpdateProfile);
  app.patch("/api/v1/auth/profile", handleUpdateProfile);

  /**
   * Public profile by username.
   */
  app.get("/api/v1/users/:username", async (request, reply) => {
    const { username } = request.params as { username: string };
    const user = await authService.getPublicProfile(username);
    return reply.code(200).send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        createdAt: user.createdAt,
      },
    });
  });

  /**
   * Synchronized user settings endpoints.
   */
  app.get("/api/v1/auth/settings", async (request, reply) => {
    const user = requireAuth(request);
    const settings = await authService.getUserSettings(user.id);
    return reply.code(200).send(settings);
  });

  app.patch("/api/v1/auth/settings", async (request, reply) => {
    const user = requireAuth(request);
    const updated = await authService.updateUserSettings(user.id, (request.body as any) ?? {});
    return reply.code(200).send(updated);
  });

  // --- Google OAuth 2.0 / OpenID Connect Routes ---

  /**
   * Initiate Google OAuth 2.0 / OIDC login or account linking.
   */
  app.get("/api/v1/auth/oauth/google", async (request, reply) => {
    const query = request.query as { redirect?: string };
    const redirectPath = query.redirect && query.redirect.startsWith("/") ? query.redirect : "/settings";

    const { url, state, nonce, codeVerifier } = authService.getGoogleAuthUrl();

    // Store state, nonce, and codeVerifier in a secure, short-lived HttpOnly cookie
    setOAuthStateCookie(reply, {
      state,
      nonce,
      codeVerifier,
      provider: "google",
      redirectPath,
    });

    // Check if client expects JSON (e.g. mobile app or AJAX caller)
    const accept = request.headers.accept || "";
    if (accept.includes("application/json")) {
      return reply.code(200).send({ url });
    }

    return reply.redirect(url, 302);
  });

  /**
   * Google OAuth 2.0 callback endpoint.
   */
  app.get("/api/v1/auth/oauth/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      clearOAuthStateCookie(reply);
      return reply.redirect(`${config.APP_URL}/settings?oauth_error=${encodeURIComponent(query.error)}`, 302);
    }

    if (!query.code || !query.state) {
      clearOAuthStateCookie(reply);
      return reply.code(400).send({ error: "bad_request", message: "Missing code or state from Google" });
    }

    const storedOAuth = getOAuthStateCookie(request);
    if (!storedOAuth || storedOAuth.provider !== "google") {
      clearOAuthStateCookie(reply);
      return reply.code(400).send({ error: "invalid_state", message: "Invalid or expired OAuth state session" });
    }

    try {
      const meta = {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      };

      const result = await authService.handleGoogleCallback({
        code: query.code,
        state: query.state,
        storedState: storedOAuth.state,
        storedNonce: storedOAuth.nonce,
        storedCodeVerifier: storedOAuth.codeVerifier,
        currentUser: request.user ?? null,
        meta,
      });

      setSessionCookie(reply, result.rawToken, result.expiresAt);
      clearOAuthStateCookie(reply);

      const target = storedOAuth.redirectPath || "/settings";
      const redirectUrl = `${config.APP_URL}${target.startsWith("/") ? target : `/${target}`}?oauth=google_success`;
      return reply.redirect(redirectUrl, 302);
    } catch (err: any) {
      clearOAuthStateCookie(reply);
      const code = err?.code || "oauth_failed";
      const message = err?.message || "Google authentication failed";
      return reply.redirect(`${config.APP_URL}/settings?oauth_error=${encodeURIComponent(message)}&code=${encodeURIComponent(code)}`, 302);
    }
  });

  // --- AniList OAuth Account Linking Routes ---

  /**
   * Initiate AniList OAuth account linking (requires active authenticated session).
   */
  app.get("/api/v1/auth/oauth/anilist", async (request, reply) => {
    requireAuth(request);
    const query = request.query as { redirect?: string };
    const redirectPath = query.redirect && query.redirect.startsWith("/") ? query.redirect : "/settings";

    const { url, state } = authService.getAnilistAuthUrl();

    setOAuthStateCookie(reply, {
      state,
      provider: "anilist",
      redirectPath,
    });

    const accept = request.headers.accept || "";
    if (accept.includes("application/json")) {
      return reply.code(200).send({ url });
    }

    return reply.redirect(url, 302);
  });

  /**
   * AniList OAuth callback.
   */
  app.get("/api/v1/auth/oauth/anilist/callback", async (request, reply) => {
    const user = requireAuth(request);
    const query = request.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      clearOAuthStateCookie(reply);
      return reply.redirect(`${config.APP_URL}/settings?oauth_error=${encodeURIComponent(query.error)}`, 302);
    }

    if (!query.code || !query.state) {
      clearOAuthStateCookie(reply);
      return reply.code(400).send({ error: "bad_request", message: "Missing code or state from AniList" });
    }

    const storedOAuth = getOAuthStateCookie(request);
    if (!storedOAuth || storedOAuth.provider !== "anilist") {
      clearOAuthStateCookie(reply);
      return reply.code(400).send({ error: "invalid_state", message: "Invalid or expired OAuth state session" });
    }

    try {
      await authService.handleAnilistCallback({
        code: query.code,
        state: query.state,
        storedState: storedOAuth.state,
        currentUser: user,
      });

      clearOAuthStateCookie(reply);
      const target = storedOAuth.redirectPath || "/settings";
      return reply.redirect(`${config.APP_URL}${target}?oauth=anilist_linked`, 302);
    } catch (err: any) {
      clearOAuthStateCookie(reply);
      const message = err?.message || "AniList linking failed";
      return reply.redirect(`${config.APP_URL}/settings?oauth_error=${encodeURIComponent(message)}`, 302);
    }
  });

  /**
   * Get all linked OAuth identities for current user.
   */
  app.get("/api/v1/auth/oauth/accounts", async (request, reply) => {
    const user = requireAuth(request);
    const accounts = await authService.getLinkedAccounts(user.id);
    return reply.code(200).send({ accounts });
  });

  app.get("/api/v1/auth/accounts", async (request, reply) => {
    const user = requireAuth(request);
    const accounts = await authService.getLinkedAccounts(user.id);
    return reply.code(200).send({ accounts });
  });

  /**
   * Unlink an external OAuth account (e.g. AniList or Google).
   */
  app.delete("/api/v1/auth/oauth/:provider", async (request, reply) => {
    const user = requireAuth(request);
    const { provider } = request.params as { provider: string };
    await authService.unlinkOAuthAccount(user.id, provider);
    return reply.code(200).send({ unlinked: true, provider });
  });

  app.delete("/api/v1/auth/accounts/:provider", async (request, reply) => {
    const user = requireAuth(request);
    const { provider } = request.params as { provider: string };
    await authService.unlinkOAuthAccount(user.id, provider);
    return reply.code(200).send({ unlinked: true, provider });
  });

  // --- Password Management & Account Lifecycle ---

  /**
   * Change password for authenticated user.
   */
  app.post("/api/v1/auth/password/change", async (request, reply) => {
    const user = requireAuth(request);
    await authService.changePassword(user.id, request.body);
    return reply.code(200).send({ success: true, message: "Password updated successfully" });
  });

  /**
   * Request password reset instructions.
   */
  app.post(
    "/api/v1/auth/password/reset-request",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000,
        },
      },
    },
    async (request, reply) => {
      const res = await authService.requestPasswordReset(request.body);
      return reply.code(200).send(res);
    },
  );

  /**
   * Confirm password reset using reset token.
   */
  app.post(
    "/api/v1/auth/password/reset-confirm",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000,
        },
      },
    },
    async (request, reply) => {
      const res = await authService.confirmPasswordReset(request.body);
      return reply.code(200).send(res);
    },
  );

  /**
   * Delete account and purge user data.
   */
  app.delete("/api/v1/auth/account", async (request, reply) => {
    const user = requireAuth(request);
    const body = (request.body as { password?: string }) || {};
    const res = await authService.deleteAccount(user.id, body.password);
    clearSessionCookie(reply);
    return reply.code(200).send(res);
  });

  // --- Session Management & Revocation ---

  /**
   * List active sessions for authenticated user.
   */
  app.get("/api/v1/auth/sessions", async (request, reply) => {
    const user = requireAuth(request);
    const sessions = await authService.listSessions(user.id, request.session?.id);
    return reply.code(200).send({ sessions });
  });

  /**
   * Revoke a specific active session.
   */
  app.delete("/api/v1/auth/sessions/:sessionId", async (request, reply) => {
    const user = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const revoked = await authService.revokeSession(user.id, sessionId);
    return reply.code(200).send({ revoked });
  });

  /**
   * Revoke all other active sessions (logout elsewhere).
   */
  app.delete("/api/v1/auth/sessions", async (request, reply) => {
    const user = requireAuth(request);
    if (request.session?.id) {
      await authService.revokeOtherSessions(user.id, request.session.id);
    }
    return reply.code(200).send({ revokedOtherSessions: true });
  });
}

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
  }
}

export const SESSION_COOKIE_NAME = "zenkai_session";

function extractSessionToken(request: FastifyRequest): string | null {
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

function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date): void {
  const isProd = config.NODE_ENV === "production";
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secureFlag = isProd ? "; Secure" : "";
  const cookieValue = `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
  reply.header("Set-Cookie", cookieValue);
}

function clearSessionCookie(reply: FastifyReply): void {
  const isProd = config.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`,
  );
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
    } catch {
      // Invalidation or DB errors silently leave request unauthenticated
    }
  });

  /**
   * Register a new user account.
   */
  app.post("/api/v1/auth/register", async (request, reply) => {
    const meta = {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    };

    const { user, rawToken, expiresAt } = await authService.register(request.body, meta);
    setSessionCookie(reply, rawToken, expiresAt);

    return reply.code(201).send({
      user,
      token: rawToken, // Returned for clients that do not support cookies
    });
  });

  /**
   * Log into an existing account.
   */
  app.post("/api/v1/auth/login", async (request, reply) => {
    const meta = {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    };

    const { user, rawToken, expiresAt } = await authService.login(request.body, meta);
    setSessionCookie(reply, rawToken, expiresAt);

    return reply.code(200).send({
      user,
      token: rawToken,
    });
  });

  /**
   * Log out of current session.
   */
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = extractSessionToken(request);
    if (token) {
      await authService.logout(token);
    }
    clearSessionCookie(reply);
    return reply.code(200).send({ loggedOut: true });
  });

  /**
   * Retrieve current authenticated user profile and session.
   */
  app.get("/api/v1/auth/me", async (request, reply) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    return reply.code(200).send({
      user: request.user,
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
  const handleCheckUsername = async (request: any, reply: any) => {
    const query = request.query as { username?: string };
    if (!query.username) {
      throw AppError.badRequest("username parameter is required");
    }

    const result = await authService.checkUsername(query.username.trim());
    return reply.code(200).send(result);
  };

  app.get("/api/v1/users/check-username", handleCheckUsername);
  app.get("/api/v1/auth/check-username", handleCheckUsername);

  /**
   * Update authenticated user profile.
   */
  const handleUpdateProfile = async (request: any, reply: any) => {
    if (!request.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const updated = await authService.updateProfile(request.user.id, request.body);
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
}

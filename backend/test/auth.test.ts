import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  parseCookies,
} from "../src/modules/auth/crypto.js";
import { AuthService } from "../src/modules/auth/service.js";
import { registerAuthRoutes, SESSION_COOKIE_NAME } from "../src/modules/auth/routes.js";
import type {
  AuthRepository,
  UserRow,
  UserWithPasswordRow,
  SessionRow,
} from "../src/modules/auth/repository.js";
import { AppError } from "../src/http/errors.js";

/**
 * In-memory test repository to test AuthService and Fastify auth routes
 * deterministically without requiring a live external PostgreSQL instance.
 */
class MockAuthRepository implements Partial<AuthRepository> {
  private users: Map<string, UserWithPasswordRow> = new Map();
  private sessions: Map<string, SessionRow> = new Map();

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<UserRow> {
    const id = `user-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();
    const row: UserWithPasswordRow = {
      id,
      username: input.username.toLowerCase(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? input.username,
      avatarUrl: null,
      bio: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, row);
    const { passwordHash: _, ...safeUser } = row;
    return safeUser;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const user = this.users.get(id);
    if (!user || !user.isActive) return null;
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async findUserByUsername(username: string): Promise<UserRow | null> {
    const normalized = username.toLowerCase();
    for (const u of this.users.values()) {
      if (u.username === normalized && u.isActive) {
        const { passwordHash: _, ...safeUser } = u;
        return safeUser;
      }
    }
    return null;
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const normalized = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === normalized && u.isActive) {
        const { passwordHash: _, ...safeUser } = u;
        return safeUser;
      }
    }
    return null;
  }

  async findUserForAuth(login: string): Promise<UserWithPasswordRow | null> {
    const normalized = login.toLowerCase();
    for (const u of this.users.values()) {
      if ((u.username === normalized || u.email === normalized) && u.isActive) {
        return { ...u };
      }
    }
    return null;
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const id = `sess-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();
    const session: SessionRow = {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastSeenAt: now,
    };
    this.sessions.set(data.tokenHash, session);
    return session;
  }

  async findSessionWithUser(
    tokenHash: string,
  ): Promise<{ session: SessionRow; user: UserRow } | null> {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    const user = this.users.get(session.userId);
    if (!user || !user.isActive) return null;

    const { passwordHash: _, ...safeUser } = user;
    return { session: { ...session }, user: safeUser };
  }

  async touchSession(sessionId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.id === sessionId) {
        s.lastSeenAt = new Date();
        break;
      }
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [hash, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        this.sessions.delete(hash);
      }
    }
  }

  async updateUserProfile(
    userId: string,
    updates: { displayName?: string; bio?: string; avatarUrl?: string },
  ): Promise<UserRow | null> {
    const user = this.users.get(userId);
    if (!user || !user.isActive) return null;

    if (updates.displayName !== undefined) user.displayName = updates.displayName;
    if (updates.bio !== undefined) user.bio = updates.bio;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    user.updatedAt = new Date();

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }
}

describe("Auth Cryptography", () => {
  it("hashes password with scrypt and verifies correctly", () => {
    const password = "SuperSecretPassword123!";
    const hash = hashPassword(password);

    assert.ok(hash.startsWith("scrypt$"), "Hash should start with scrypt identifier");
    assert.equal(verifyPassword(password, hash), true, "Correct password must verify as true");
    assert.equal(verifyPassword("WrongPassword123!", hash), false, "Wrong password must verify as false");
    assert.equal(verifyPassword("", hash), false, "Empty password must verify as false");
  });

  it("handles malformed hash string gracefully without crashing", () => {
    assert.equal(verifyPassword("password", "invalid_hash_string"), false);
    assert.equal(verifyPassword("password", "scrypt$invalid"), false);
  });

  it("generates 256-bit secure session token and computes SHA-256 hash", () => {
    const { rawToken, tokenHash } = generateSessionToken();
    assert.equal(rawToken.length, 64, "Raw token should be 64 hex characters (32 bytes)");
    assert.equal(tokenHash.length, 64, "Token hash should be 64 hex characters (32 bytes)");
    assert.equal(hashSessionToken(rawToken), tokenHash, "Hash of raw token must match tokenHash");
  });

  it("parses cookies from header string correctly", () => {
    const cookieHeader = "zenkai_session=abcdef12345; theme=dark; other=value%20space";
    const cookies = parseCookies(cookieHeader);
    assert.equal(cookies["zenkai_session"], "abcdef12345");
    assert.equal(cookies["theme"], "dark");
    assert.equal(cookies["other"], "value space");
    assert.deepEqual(parseCookies(undefined), {});
  });
});

describe("AuthService Domain Logic", () => {
  it("registers a new user successfully", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    const result = await service.register({
      username: "zenkai_user",
      email: "zenkai@example.com",
      password: "StrongPassword123!",
      displayName: "Zenkai User",
    });

    assert.ok(result.user.id);
    assert.equal(result.user.username, "zenkai_user");
    assert.equal(result.user.email, "zenkai@example.com");
    assert.equal(result.user.displayName, "Zenkai User");
    assert.equal((result.user as any).passwordHash, undefined, "passwordHash must not leak");
    assert.ok(result.rawToken);
    assert.ok(result.expiresAt.getTime() > Date.now());
  });

  it("rejects invalid registration inputs with 400 bad_request", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    // Invalid username (short)
    await assert.rejects(
      () =>
        service.register({
          username: "ab",
          email: "valid@example.com",
          password: "password123",
        }),
      (err: AppError) => err.statusCode === 400,
    );

    // Invalid email
    await assert.rejects(
      () =>
        service.register({
          username: "valid_name",
          email: "not-an-email",
          password: "password123",
        }),
      (err: AppError) => err.statusCode === 400,
    );

    // Short password (< 8 chars)
    await assert.rejects(
      () =>
        service.register({
          username: "valid_name",
          email: "valid@example.com",
          password: "short",
        }),
      (err: AppError) => err.statusCode === 400,
    );
  });

  it("rejects duplicate username with 409 conflict", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await service.register({
      username: "duplicate_user",
      email: "first@example.com",
      password: "password123",
    });

    await assert.rejects(
      () =>
        service.register({
          username: "DUPLICATE_USER", // case-insensitive check
          email: "second@example.com",
          password: "password123",
        }),
      (err: AppError) => err.statusCode === 409 && err.reason === "conflict",
    );
  });

  it("rejects duplicate email with 409 conflict", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await service.register({
      username: "user_one",
      email: "shared@example.com",
      password: "password123",
    });

    await assert.rejects(
      () =>
        service.register({
          username: "user_two",
          email: "SHARED@example.com",
          password: "password123",
        }),
      (err: AppError) => err.statusCode === 409 && err.reason === "conflict",
    );
  });

  it("authenticates valid login and rejects invalid credentials", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await service.register({
      username: "login_test",
      email: "login@example.com",
      password: "CorrectPassword123!",
    });

    // Valid login with username
    const auth1 = await service.login({
      login: "login_test",
      password: "CorrectPassword123!",
    });
    assert.equal(auth1.user.username, "login_test");

    // Valid login with email
    const auth2 = await service.login({
      login: "login@example.com",
      password: "CorrectPassword123!",
    });
    assert.equal(auth2.user.username, "login_test");

    // Invalid password
    await assert.rejects(
      () =>
        service.login({
          login: "login_test",
          password: "WrongPassword!",
        }),
      (err: AppError) => err.statusCode === 401 && err.reason === "unauthorized",
    );

    // Nonexistent user
    await assert.rejects(
      () =>
        service.login({
          login: "ghost_user",
          password: "Password123!",
        }),
      (err: AppError) => err.statusCode === 401 && err.reason === "unauthorized",
    );
  });

  it("validates session tokens and detects expired sessions", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    const { rawToken } = await service.register({
      username: "session_user",
      email: "session@example.com",
      password: "password123",
    });

    // Valid token
    const valid = await service.validateSession(rawToken);
    assert.ok(valid);
    assert.equal(valid.user.username, "session_user");

    // Invalid / tampered token
    const invalid = await service.validateSession("a".repeat(64));
    assert.equal(invalid, null);

    // Short / empty token
    assert.equal(await service.validateSession(""), null);
    assert.equal(await service.validateSession("short"), null);
  });

  it("checks username availability and offers suggestions", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await service.register({
      username: "taken_name",
      email: "taken@example.com",
      password: "password123",
    });

    const checkTaken = await service.checkUsername("taken_name");
    assert.equal(checkTaken.available, false);
    assert.ok(checkTaken.suggestions.length > 0);

    const checkAvailable = await service.checkUsername("brand_new_name");
    assert.equal(checkAvailable.available, true);
    assert.equal(checkAvailable.suggestions.length, 0);

    const checkInvalid = await service.checkUsername("bad name with spaces!");
    assert.equal(checkInvalid.available, false);
  });
});

describe("Fastify Auth Route Integration", () => {
  async function buildTestApp() {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);
    const app = Fastify({ logger: false });

    app.setErrorHandler((error: unknown, _req, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: error.reason,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }
      return reply.code(500).send({ error: "internal", message: "internal error" });
    });

    registerAuthRoutes(app, service);
    return { app, service, repo };
  }

  it("registers user via POST /api/v1/auth/register and sets HttpOnly cookie", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "route_user",
        email: "route@example.com",
        password: "Password123!",
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.user.username, "route_user");
    assert.ok(body.token);

    const setCookie = res.headers["set-cookie"] as string;
    assert.ok(setCookie, "Set-Cookie header must be present");
    assert.ok(setCookie.includes("zenkai_session="));
    assert.ok(setCookie.includes("HttpOnly"));
  });

  it("protects GET /api/v1/auth/me with 401 when unauthenticated", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "unauthorized");
  });

  it("allows access to GET /api/v1/auth/me using Cookie or Bearer header", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "cookie_user",
        email: "cookie@example.com",
        password: "Password123!",
      },
    });
    const { token } = JSON.parse(reg.body);

    // 1. Authenticate via Cookie
    const cookieRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: `zenkai_session=${token}`,
      },
    });
    assert.equal(cookieRes.statusCode, 200);
    assert.equal(JSON.parse(cookieRes.body).user.username, "cookie_user");

    // 2. Authenticate via Bearer header
    const bearerRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    assert.equal(bearerRes.statusCode, 200);
    assert.equal(JSON.parse(bearerRes.body).user.username, "cookie_user");
  });

  it("logs out and clears session on POST /api/v1/auth/logout", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "logout_user",
        email: "logout@example.com",
        password: "Password123!",
      },
    });
    const { token } = JSON.parse(reg.body);

    // Logout
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: `zenkai_session=${token}`,
      },
    });
    assert.equal(logoutRes.statusCode, 200);
    const setCookie = logoutRes.headers["set-cookie"] as string;
    assert.ok(setCookie.includes("Max-Age=0"), "Cookie should be cleared with Max-Age=0");

    // Access /me with the invalidated token
    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: `zenkai_session=${token}`,
      },
    });
    assert.equal(meRes.statusCode, 401, "Invalidated session must return 401");
  });

  it("enforces user isolation: User A cannot modify User B's profile", async () => {
    const { app } = await buildTestApp();

    // Register User A
    const regA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "user_alpha",
        email: "alpha@example.com",
        password: "Password123!",
      },
    });
    const { token: tokenA } = JSON.parse(regA.body);

    // Register User B
    const regB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "user_beta",
        email: "beta@example.com",
        password: "Password123!",
      },
    });
    const { token: tokenB } = JSON.parse(regB.body);

    // User A updates profile
    const updateRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/users/profile",
      headers: {
        cookie: `zenkai_session=${tokenA}`,
      },
      payload: {
        displayName: "Alpha Supreme",
        bio: "Bio for Alpha",
      },
    });
    assert.equal(updateRes.statusCode, 200);
    assert.equal(JSON.parse(updateRes.body).user.displayName, "Alpha Supreme");

    // Verify User B's profile was not affected
    const meB = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: `zenkai_session=${tokenB}`,
      },
    });
    assert.equal(JSON.parse(meB.body).user.displayName, "user_beta");
    assert.equal(JSON.parse(meB.body).user.bio, null);
  });

  it("retrieves public user profile by username and returns 404 for unknown user", async () => {
    const { app } = await buildTestApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "public_otaku",
        email: "otaku@zenkai.io",
        password: "Password123!",
        displayName: "Master Otaku",
      },
    });

    const publicRes = await app.inject({
      method: "GET",
      url: "/api/v1/users/public_otaku",
    });
    assert.equal(publicRes.statusCode, 200);
    const body = JSON.parse(publicRes.body);
    assert.equal(body.user.username, "public_otaku");
    assert.equal(body.user.displayName, "Master Otaku");
    assert.equal(body.user.passwordHash, undefined, "Password hash must NEVER be in public profile");
    assert.equal(body.user.email, undefined, "Email must not be leaked in public profile");

    const notFoundRes = await app.inject({
      method: "GET",
      url: "/api/v1/users/nonexistent_person",
    });
    assert.equal(notFoundRes.statusCode, 404);
  });
});

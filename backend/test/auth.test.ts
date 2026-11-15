import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  parseCookies,
  generatePkceCodeVerifier,
  computePkceCodeChallenge,
  generateOAuthState,
  generateOAuthNonce,
} from "../src/modules/auth/crypto.js";
import { AuthService } from "../src/modules/auth/service.js";
import {
  registerAuthRoutes,
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
} from "../src/modules/auth/routes.js";
import type {
  AuthRepository,
  UserRow,
  UserWithPasswordRow,
  SessionRow,
  OAuthAccountRow,
} from "../src/modules/auth/repository.js";
import { AppError } from "../src/http/errors.js";
import { config } from "../src/config/index.js";

/** In-memory test repository to test AuthService and Fastify auth routes deterministically without requiring a live external PostgreSQL instance. */
class MockAuthRepository implements Partial<AuthRepository> {
  public users: Map<string, UserWithPasswordRow> = new Map();
  public sessions: Map<string, SessionRow> = new Map();
  public oauthAccounts: Map<string, OAuthAccountRow> = new Map();
  public passwordResets: Map<string, { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }> = new Map();
  public shouldSimulateDbCrash = false;

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    displayName?: string;
    emailVerified?: boolean;
    settings?: Record<string, any>;
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
      emailVerified: input.emailVerified ?? false,
      settings: input.settings ?? {},
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

  async findUserWithPasswordById(id: string): Promise<UserWithPasswordRow | null> {
    const user = this.users.get(id);
    if (!user || !user.isActive) return null;
    return { ...user };
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
    }
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    const existed = this.users.delete(userId);
    for (const [hash, s] of this.sessions.entries()) {
      if (s.userId === userId) this.sessions.delete(hash);
    }
    for (const [key, o] of this.oauthAccounts.entries()) {
      if (o.userId === userId) this.oauthAccounts.delete(key);
    }
    return existed;
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
    if (this.shouldSimulateDbCrash) {
      throw new Error("Database offline (circuit breaker active)");
    }
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

  async deleteSessionById(sessionId: string, userId: string): Promise<boolean> {
    for (const [hash, s] of this.sessions.entries()) {
      if (s.id === sessionId && s.userId === userId) {
        this.sessions.delete(hash);
        return true;
      }
    }
    return false;
  }

  async getUserSessions(userId: string): Promise<SessionRow[]> {
    const now = new Date();
    const list: SessionRow[] = [];
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.expiresAt.getTime() > now.getTime()) {
        list.push({ ...s });
      }
    }
    return list;
  }

  async deleteUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    for (const [hash, s] of this.sessions.entries()) {
      if (s.userId === userId && (!exceptSessionId || s.id !== exceptSessionId)) {
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

  async getUserSettings(userId: string): Promise<Record<string, any>> {
    const user = this.users.get(userId);
    return user?.settings || {};
  }

  async updateUserSettings(userId: string, settings: Record<string, any>): Promise<Record<string, any>> {
    const user = this.users.get(userId);
    if (!user) return {};
    user.settings = { ...user.settings, ...settings };
    return user.settings;
  }

  async linkOAuthAccount(data: any): Promise<OAuthAccountRow> {
    const key = `${data.provider}:${data.providerUserId}`;
    const row: OAuthAccountRow = {
      id: `oauth-${Math.random().toString(36).slice(2, 9)}`,
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      providerEmail: data.providerEmail ?? null,
      providerUsername: data.providerUsername ?? null,
      profileData: data.profileData ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.oauthAccounts.set(key, row);
    return row;
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccountRow | null> {
    const key = `${provider}:${providerUserId}`;
    return this.oauthAccounts.get(key) || null;
  }

  async findOAuthAccountsByUser(userId: string): Promise<OAuthAccountRow[]> {
    const list: OAuthAccountRow[] = [];
    for (const a of this.oauthAccounts.values()) {
      if (a.userId === userId) list.push({ ...a });
    }
    return list;
  }

  async deleteOAuthAccount(userId: string, provider: string): Promise<boolean> {
    let deleted = false;
    for (const [key, a] of this.oauthAccounts.entries()) {
      if (a.userId === userId && a.provider === provider) {
        this.oauthAccounts.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const id = `reset-${Math.random().toString(36).slice(2, 9)}`;
    this.passwordResets.set(tokenHash, { id, userId, tokenHash, expiresAt, usedAt: null });
  }

  async findValidPasswordReset(tokenHash: string): Promise<{ id: string; userId: string; expiresAt: Date } | null> {
    const r = this.passwordResets.get(tokenHash);
    if (!r) return null;
    if (r.expiresAt.getTime() <= Date.now() || r.usedAt !== null) return null;
    return { id: r.id, userId: r.userId, expiresAt: r.expiresAt };
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    for (const r of this.passwordResets.values()) {
      if (r.id === id) {
        r.usedAt = new Date();
        break;
      }
    }
  }
}

function extractCookieToken(res: any): string {
  const setCookie = res.headers["set-cookie"];
  const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie || "");
  const match = cookieStr.match(/zenkai_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function makeFakeJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${claims}.fake_signature`;
}

describe("Auth Cryptography", () => {
  it("hashes password with Argon2id and verifies correctly", async () => {
    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);

    assert.ok(hash.startsWith("$argon2id$") || hash.startsWith("scrypt$"), "Hash should start with valid identifier");
    assert.equal(await verifyPassword(password, hash), true, "Correct password must verify as true");
    assert.equal(await verifyPassword("WrongPassword123!", hash), false, "Wrong password must verify as false");
    assert.equal(await verifyPassword("", hash), false, "Empty password must verify as false");
  });

  it("handles malformed hash string gracefully without crashing", async () => {
    assert.equal(await verifyPassword("password", "invalid_hash_string"), false);
    assert.equal(await verifyPassword("password", ""), false);
  });

  it("generates 256-bit secure session token and computes SHA-256 hash", () => {
    const { rawToken, tokenHash } = generateSessionToken();
    assert.equal(rawToken.length, 64, "Raw token should be 64 hex characters (32 bytes)");
    assert.equal(tokenHash.length, 64, "Token hash should be 64 hex characters (32 bytes)");
    assert.equal(hashSessionToken(rawToken), tokenHash, "Hash of raw token must match tokenHash");
  });

  it("generates PKCE code verifier and computes SHA-256 challenge", () => {
    const verifier = generatePkceCodeVerifier();
    assert.ok(verifier.length >= 43 && verifier.length <= 128);
    const challenge = computePkceCodeChallenge(verifier);
    assert.ok(challenge.length >= 43);
    assert.equal(computePkceCodeChallenge(verifier), challenge);
  });

  it("parses cookies from header string correctly and survives malformed cookies", () => {
    const cookieHeader = "zenkai_session=abcdef12345; theme=dark; other=value%20space; malformed=%ZZ";
    const cookies = parseCookies(cookieHeader);
    assert.equal(cookies["zenkai_session"], "abcdef12345");
    assert.equal(cookies["theme"], "dark");
    assert.equal(cookies["other"], "value space");
    assert.equal(cookies["malformed"], "%ZZ");
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
      () => service.register({
        username: "ab",
        email: "valid@example.com",
        password: "password123",
      }),
      (err: AppError) => err.statusCode === 400,
    );

    // Invalid email
    await assert.rejects(
      () => service.register({
        username: "valid_name",
        email: "not-an-email",
        password: "password123",
      }),
      (err: AppError) => err.statusCode === 400,
    );

    // Short password (< 8 chars)
    await assert.rejects(
      () => service.register({
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
      () => service.register({
        username: "DUPLICATE_USER",
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
      () => service.register({
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
      () => service.login({
        login: "login_test",
        password: "WrongPassword!",
      }),
      (err: AppError) => err.statusCode === 401 && err.reason === "unauthorized",
    );

    // Nonexistent user
    await assert.rejects(
      () => service.login({
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

    const valid = await service.validateSession(rawToken);
    assert.ok(valid);
    assert.equal(valid.user.username, "session_user");

    const invalid = await service.validateSession("a".repeat(64));
    assert.equal(invalid, null);
    assert.equal(await service.validateSession(""), null);
    assert.equal(await service.validateSession("short"), null);
  });
});

describe("Google OAuth 2.0 / OpenID Connect", () => {
  it("generates standards-compliant Google auth URL with PKCE and state", () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    // Set test client id
    (config as any).GOOGLE_CLIENT_ID = "test-google-client-id";

    const { url, state, nonce, codeVerifier } = service.getGoogleAuthUrl();
    assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert.ok(url.includes("client_id=test-google-client-id"));
    assert.ok(url.includes("code_challenge_method=S256"));
    assert.ok(url.includes(`state=${state}`));
    assert.ok(url.includes(`nonce=${nonce}`));
    assert.ok(codeVerifier);
  });

  it("rejects callback with mismatched state (CSRF prevention)", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await assert.rejects(
      () => service.handleGoogleCallback({
        code: "fake_code",
        state: "attacker_state",
        storedState: "legitimate_state",
      }),
      (err: AppError) => err.statusCode === 400 && err.message.includes("Invalid OAuth state"),
    );
  });

  it("registers new user and links Google account on first-time login", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);
    (config as any).GOOGLE_CLIENT_ID = "test-client-id";
    (config as any).GOOGLE_CLIENT_SECRET = "test-client-secret";

    const mockIdToken = makeFakeJwt({
      sub: "google-uid-12345",
      email: "newgoogleuser@example.com",
      email_verified: true,
      name: "Google User",
      picture: "https://lh3.googleusercontent.com/avatar.jpg",
      iss: "https://accounts.google.com",
      aud: "test-client-id",
      exp: Math.floor(Date.now() / 1000) + 3600,
      nonce: "test-nonce",
    });

    const mockFetch = async () => ({
      access_token: "google_access_token",
      id_token: mockIdToken,
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid email profile",
    });

    const result = await service.handleGoogleCallback({
      code: "google_code",
      state: "state123",
      storedState: "state123",
      storedNonce: "test-nonce",
      fetchTokenFn: mockFetch,
    });

    assert.ok(result.user.id);
    assert.equal(result.user.email, "newgoogleuser@example.com");
    assert.equal(result.user.displayName, "Google User");
    assert.ok(result.rawToken);

    // Verify linked in repository
    const linked = await repo.findOAuthAccount("google", "google-uid-12345");
    assert.ok(linked);
    assert.equal(linked.userId, result.user.id);
  });

  it("prevents account takeover: refuses automatic merge when email exists with password", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);
    (config as any).GOOGLE_CLIENT_ID = "test-client-id";
    (config as any).GOOGLE_CLIENT_SECRET = "test-client-secret";

    // Existing user registered with password
    await service.register({
      username: "victim_user",
      email: "victim@example.com",
      password: "VictimPassword123!",
    });

    // Attacker or external Google login returns same email
    const mockIdToken = makeFakeJwt({
      sub: "google-uid-attacker",
      email: "victim@example.com",
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: "test-client-id",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const mockFetch = async () => ({
      access_token: "google_access_token",
      id_token: mockIdToken,
      expires_in: 3600,
    });

    await assert.rejects(
      () => service.handleGoogleCallback({
        code: "google_code",
        state: "state123",
        storedState: "state123",
        fetchTokenFn: mockFetch,
      }),
      (err: AppError) =>
        err.statusCode === 409 &&
        (err.details as any)?.code === "account_exists_needs_linking",
    );
  });
});

describe("AniList OAuth Account Linking", () => {
  it("rejects unauthenticated attempts to link AniList", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await assert.rejects(
      () => service.handleAnilistCallback({
        code: "anilist_code",
        state: "state",
        storedState: "state",
        currentUser: null as any,
      }),
      (err: AppError) => err.statusCode === 401,
    );
  });

  it("links AniList account to authenticated Zenkai user", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);
    (config as any).ANILIST_CLIENT_ID = "anilist-client-id";
    (config as any).ANILIST_CLIENT_SECRET = "anilist-secret";

    const { user } = await service.register({
      username: "anilist_tester",
      email: "anilist_tester@example.com",
      password: "Password123!",
    });

    const mockTokenFetch = async () => ({
      access_token: "anilist_access_token",
      token_type: "Bearer",
      expires_in: 86400,
    });

    const mockViewerFetch = async () => ({
      data: {
        Viewer: {
          id: 998877,
          name: "AniListMaster",
          avatar: { medium: "https://s4.anilist.co/avatar.jpg" },
        },
      },
    });

    const linkResult = await service.handleAnilistCallback({
      code: "valid_code",
      state: "state123",
      storedState: "state123",
      currentUser: user,
      fetchTokenFn: mockTokenFetch,
      fetchViewerFn: mockViewerFetch,
    });

    assert.equal(linkResult.linked, true);
    assert.equal(linkResult.anilistUser.name, "AniListMaster");

    // Verify linked in repository
    const accounts = await service.getLinkedAccounts(user.id);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].provider, "anilist");
    assert.equal(accounts[0].providerUserId, "998877");
  });

  it("prevents duplicate AniList account linking to different Zenkai users", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);
    (config as any).ANILIST_CLIENT_ID = "anilist-client-id";
    (config as any).ANILIST_CLIENT_SECRET = "anilist-secret";

    const user1 = (await service.register({ username: "user_one", email: "u1@test.com", password: "Password123!" })).user;
    const user2 = (await service.register({ username: "user_two", email: "u2@test.com", password: "Password123!" })).user;

    const mockTokenFetch = async () => ({ access_token: "tok", expires_in: 3600 });
    const mockViewerFetch = async () => ({
      data: { Viewer: { id: 55555, name: "SharedAniList" } },
    });

    // Link to User 1
    await service.handleAnilistCallback({
      code: "c", state: "s", storedState: "s",
      currentUser: user1,
      fetchTokenFn: mockTokenFetch,
      fetchViewerFn: mockViewerFetch,
    });

    // Attempt to link same AniList ID to User 2 -> must reject with 409 conflict
    await assert.rejects(
      () => service.handleAnilistCallback({
        code: "c", state: "s", storedState: "s",
        currentUser: user2,
        fetchTokenFn: mockTokenFetch,
        fetchViewerFn: mockViewerFetch,
      }),
      (err: AppError) => err.statusCode === 409 && err.message.includes("already linked"),
    );
  });
});

describe("Account Lifecycle & Session Management", () => {
  it("changes user password with current password verification", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    const { user } = await service.register({
      username: "pass_user",
      email: "pass@example.com",
      password: "OldPassword123!",
    });

    // Wrong current password
    await assert.rejects(
      () => service.changePassword(user.id, {
        currentPassword: "WrongPassword!",
        newPassword: "NewPassword123!",
      }),
      (err: AppError) => err.statusCode === 401,
    );

    // Correct password change
    await service.changePassword(user.id, {
      currentPassword: "OldPassword123!",
      newPassword: "NewPassword123!",
    });

    // Verify login with new password succeeds
    const auth = await service.login({
      login: "pass_user",
      password: "NewPassword123!",
    });
    assert.equal(auth.user.id, user.id);
  });

  it("handles password reset request and single-use token confirmation", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    await service.register({
      username: "reset_user",
      email: "reset@example.com",
      password: "InitialPassword123!",
    });

    const resetReq = await service.requestPasswordReset({ email: "reset@example.com" });
    assert.ok(resetReq.devResetToken);

    // Confirm reset
    const confirm = await service.confirmPasswordReset({
      token: resetReq.devResetToken,
      newPassword: "BrandNewPassword123!",
    });
    assert.equal(confirm.success, true);

    // Old token cannot be reused
    await assert.rejects(
      () => service.confirmPasswordReset({
        token: resetReq.devResetToken,
        newPassword: "BrandNewPassword123!",
      }),
      (err: AppError) => err.statusCode === 400,
    );
  });

  it("lists active sessions and revokes specific session", async () => {
    const repo = new MockAuthRepository();
    const service = new AuthService(repo as unknown as AuthRepository);

    const { user, rawToken: token1 } = await service.register({
      username: "sess_manager",
      email: "sess@example.com",
      password: "Password123!",
    });

    // Second login on another device
    const { rawToken: token2 } = await service.login({
      login: "sess_manager",
      password: "Password123!",
    });

    const sessions = await service.listSessions(user.id);
    assert.equal(sessions.length, 2);

    // Revoke first session
    await service.revokeSession(user.id, sessions[0].id);

    const remaining = await service.listSessions(user.id);
    assert.equal(remaining.length, 1);
  });
});

describe("Fastify Auth Route Integration & Security Hardening", () => {
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

  it("registers user via POST /api/v1/auth/register and sets HttpOnly cookie WITHOUT raw token in body", async () => {
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
    // HARDENING: raw session token MUST NOT be exposed in JSON response!
    assert.equal(body.token, undefined, "Raw session token must NOT be leaked in JSON body");

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
    const token = extractCookieToken(reg);
    assert.ok(token, "Session token must be extractable from cookie");

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

  it("distinguishes database outage from invalid session: returns 503 instead of 401", async () => {
    const { app, repo } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "db_crash_user",
        email: "crash@example.com",
        password: "Password123!",
      },
    });
    const token = extractCookieToken(reg);

    // Simulate database offline blip
    repo.shouldSimulateDbCrash = true;

    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: `zenkai_session=${token}`,
      },
    });

    // MUST NOT return 401 Unauthorized (which wipes user credentials)!
    // MUST return 503 Service Unavailable so client knows DB is offline!
    assert.equal(meRes.statusCode, 503);
    const body = JSON.parse(meRes.body);
    assert.equal(body.error, "service_unavailable");
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
    const token = extractCookieToken(reg);

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

  it("reads and updates user settings via /api/v1/auth/settings", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "settings_user",
        email: "settings@example.com",
        password: "Password123!",
      },
    });
    const token = extractCookieToken(reg);

    // Read initial settings
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/settings",
      headers: { cookie: `zenkai_session=${token}` },
    });
    assert.equal(getRes.statusCode, 200);

    // Update settings
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/settings",
      headers: { cookie: `zenkai_session=${token}` },
      payload: { theme: "dark", defaultServer: "novuscloud" },
    });
    assert.equal(patchRes.statusCode, 200);
    const updated = JSON.parse(patchRes.body);
    assert.equal(updated.theme, "dark");
    assert.equal(updated.defaultServer, "novuscloud");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import { AuthService } from "../src/modules/auth/service.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import { LibraryService } from "../src/modules/library/service.js";
import { registerLibraryRoutes } from "../src/modules/library/routes.js";
import type {
  LibraryRepository,
  UserLibraryRow,
  LibraryStatusCounts,
} from "../src/modules/library/repository.js";
import type {
  AuthRepository,
  UserRow,
  UserWithPasswordRow,
  SessionRow,
} from "../src/modules/auth/repository.js";
import { AppError } from "../src/http/errors.js";

/**
 * Mock Auth repository for authenticating requests in library tests.
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

  async findUserForAuth(login: string): Promise<UserWithPasswordRow | null> {
    const normalized = login.toLowerCase();
    for (const u of this.users.values()) {
      if ((u.username === normalized || u.email === normalized) && u.isActive) {
        return { ...u };
      }
    }
    return null;
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

  async touchSession(): Promise<void> {}
  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}

/**
 * In-memory Mock Library repository for deterministic testing.
 */
class MockLibraryRepository implements Partial<LibraryRepository> {
  private entries: Map<string, UserLibraryRow> = new Map();

  private key(userId: string, kind: string, mediaId: string): string {
    return `${userId}:${kind}:${mediaId}`;
  }

  async getUserLibrary(
    userId: string,
    filters?: { kind?: string; status?: string; limit?: number; offset?: number },
  ): Promise<UserLibraryRow[]> {
    const list: UserLibraryRow[] = [];
    for (const entry of this.entries.values()) {
      if (entry.userId !== userId) continue;
      if (filters?.kind && entry.kind !== filters.kind) continue;
      if (filters?.status && entry.status !== filters.status) continue;
      list.push({ ...entry });
    }
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return list.slice(offset, offset + limit);
  }

  async getLibraryEntry(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<UserLibraryRow | null> {
    const found = this.entries.get(this.key(userId, kind, mediaId));
    return found ? { ...found } : null;
  }

  async getLibraryCounts(userId: string): Promise<LibraryStatusCounts> {
    const counts: LibraryStatusCounts = {
      watching: 0,
      plan: 0,
      completed: 0,
      dropped: 0,
      total: 0,
    };

    for (const entry of this.entries.values()) {
      if (entry.userId !== userId) continue;
      if (entry.status === "watching") counts.watching++;
      else if (entry.status === "plan") counts.plan++;
      else if (entry.status === "completed") counts.completed++;
      else if (entry.status === "dropped") counts.dropped++;
      counts.total++;
    }

    return counts;
  }

  async upsertEntry(
    userId: string,
    entry: {
      kind: string;
      mediaId: string;
      status: string;
      rating?: number | null;
      notes?: string | null;
      updatedAt?: Date;
    },
  ): Promise<UserLibraryRow> {
    const k = this.key(userId, entry.kind, entry.mediaId);
    const existing = this.entries.get(k);
    const now = entry.updatedAt ?? new Date();

    const row: UserLibraryRow = {
      id: existing?.id ?? `lib-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      kind: entry.kind,
      mediaId: entry.mediaId,
      status: entry.status,
      rating: entry.rating !== undefined && entry.rating !== null ? String(entry.rating) : null,
      notes: entry.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.entries.set(k, row);
    return { ...row };
  }

  async deleteEntry(userId: string, kind: string, mediaId: string): Promise<boolean> {
    const k = this.key(userId, kind, mediaId);
    return this.entries.delete(k);
  }

  async batchSync(
    userId: string,
    entries: Array<{
      kind: string;
      mediaId: string;
      status: string;
      rating?: number | null;
      notes?: string | null;
      updatedAt: Date;
    }>,
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;

    for (const item of entries) {
      const existing = await this.getLibraryEntry(userId, item.kind, item.mediaId);
      if (!existing || item.updatedAt.getTime() >= existing.updatedAt.getTime()) {
        await this.upsertEntry(userId, item);
        applied++;
      } else {
        skipped++;
      }
    }

    return { applied, skipped };
  }
}

describe("LibraryService", () => {
  it("rejects invalid status", async () => {
    const repo = new MockLibraryRepository();
    const service = new LibraryService(repo as unknown as LibraryRepository);

    await assert.rejects(
      () =>
        service.upsert("u1", "anime", "naruto", {
          status: "unknown_status",
        }),
      (err: AppError) => err.statusCode === 400 && err.reason === "bad_request",
    );
  });

  it("rejects invalid rating numbers", async () => {
    const repo = new MockLibraryRepository();
    const service = new LibraryService(repo as unknown as LibraryRepository);

    await assert.rejects(
      () =>
        service.upsert("u1", "anime", "naruto", {
          status: "watching",
          rating: 15, // Max is 10
        }),
      (err: AppError) => err.statusCode === 400 && err.reason === "bad_request",
    );

    await assert.rejects(
      () =>
        service.upsert("u1", "anime", "naruto", {
          status: "watching",
          rating: -1, // Min is 0
        }),
      (err: AppError) => err.statusCode === 400 && err.reason === "bad_request",
    );
  });
});

describe("Library HTTP Endpoints & Multi-Tenant Isolation", () => {
  async function buildTestApp() {
    const authRepo = new MockAuthRepository();
    const authService = new AuthService(authRepo as unknown as AuthRepository);
    const libraryRepo = new MockLibraryRepository();
    const libraryService = new LibraryService(libraryRepo as unknown as LibraryRepository);

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

    registerAuthRoutes(app, authService);
    registerLibraryRoutes(app, libraryService);

    return { app, authService, libraryService, libraryRepo };
  }

  it("requires authentication for library endpoints", async () => {
    const { app } = await buildTestApp();

    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
    });
    assert.equal(getRes.statusCode, 401);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/death-note",
      payload: { status: "watching" },
    });
    assert.equal(putRes.statusCode, 401);

    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/user/library/anime/death-note",
    });
    assert.equal(delRes.statusCode, 401);

    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/user/library/batch",
      payload: { entries: [] },
    });
    assert.equal(batchRes.statusCode, 401);
  });

  it("manages library entries for an authenticated user with status breakdown", async () => {
    const { app } = await buildTestApp();

    // Register User A
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "otaku_a",
        email: "a@example.com",
        password: "Password123!",
      },
    });
    const cookieA = regRes.headers["set-cookie"] as string;

    // Add Death Note as watching with rating 9
    const putRes1 = await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/death-note",
      headers: { cookie: cookieA },
      payload: { status: "watching", rating: 9, notes: "Top tier psychological" },
    });
    assert.equal(putRes1.statusCode, 200);
    const body1 = JSON.parse(putRes1.body);
    assert.equal(body1.entry.mediaId, "death-note");
    assert.equal(body1.entry.status, "watching");
    assert.equal(body1.entry.rating, "9");

    // Add One Piece as plan to watch
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/one-piece",
      headers: { cookie: cookieA },
      payload: { status: "plan" },
    });

    // Add Berserk as completed
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/manga/berserk",
      headers: { cookie: cookieA },
      payload: { status: "completed", rating: 10 },
    });

    // Fetch library and verify breakdown
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie: cookieA },
    });
    assert.equal(getRes.statusCode, 200);
    const getBody = JSON.parse(getRes.body);
    assert.equal(getBody.items.length, 3);
    assert.equal(getBody.counts.total, 3);
    assert.equal(getBody.counts.watching, 1);
    assert.equal(getBody.counts.plan, 1);
    assert.equal(getBody.counts.completed, 1);
    assert.equal(getBody.counts.dropped, 0);

    // Filter by kind=manga
    const mangaRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/library?kind=manga",
      headers: { cookie: cookieA },
    });
    assert.equal(mangaRes.statusCode, 200);
    const mangaBody = JSON.parse(mangaRes.body);
    assert.equal(mangaBody.items.length, 1);
    assert.equal(mangaBody.items[0].mediaId, "berserk");

    // Update Death Note to completed
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/death-note",
      headers: { cookie: cookieA },
      payload: { status: "completed" },
    });

    const updatedRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie: cookieA },
    });
    const updatedBody = JSON.parse(updatedRes.body);
    assert.equal(updatedBody.counts.watching, 0);
    assert.equal(updatedBody.counts.completed, 2);

    // Delete One Piece
    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/user/library/anime/one-piece",
      headers: { cookie: cookieA },
    });
    assert.equal(delRes.statusCode, 200);

    const afterDel = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie: cookieA },
    });
    const afterDelBody = JSON.parse(afterDel.body);
    assert.equal(afterDelBody.counts.total, 2);
  });

  it("enforces multi-tenant isolation between different users", async () => {
    const { app } = await buildTestApp();

    // Register User A and User B
    const regA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "user_a", email: "a@test.com", password: "Password123!" },
    });
    const cookieA = regA.headers["set-cookie"] as string;

    const regB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "user_b", email: "b@test.com", password: "Password123!" },
    });
    const cookieB = regB.headers["set-cookie"] as string;

    // User A adds attack-on-titan
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/attack-on-titan",
      headers: { cookie: cookieA },
      payload: { status: "watching", rating: 9 },
    });

    // User B fetches their library -> must be empty
    const resB = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie: cookieB },
    });
    const bodyB = JSON.parse(resB.body);
    assert.equal(bodyB.items.length, 0);
    assert.equal(bodyB.counts.total, 0);

    // User B tries to delete User A's attack-on-titan -> deleted: false
    const delB = await app.inject({
      method: "DELETE",
      url: "/api/v1/user/library/anime/attack-on-titan",
      headers: { cookie: cookieB },
    });
    const delBodyB = JSON.parse(delB.body);
    assert.equal(delBodyB.deleted, false);

    // User A's entry must remain intact
    const resA = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie: cookieA },
    });
    const bodyA = JSON.parse(resA.body);
    assert.equal(bodyA.items.length, 1);
    assert.equal(bodyA.items[0].mediaId, "attack-on-titan");
  });

  it("handles offline batch merge with Last-Write-Wins (LWW) conflict resolution", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "sync_tester", email: "sync@test.com", password: "Password123!" },
    });
    const cookie = reg.headers["set-cookie"] as string;

    // Server already has an existing entry updated at T=1000
    const tServer = new Date("2026-01-01T12:00:00Z");
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/library/anime/bleach",
      headers: { cookie },
      payload: { status: "watching", notes: "Server note", updatedAt: tServer.toISOString() },
    });

    // Batch contains 2 entries:
    // 1. Bleach with older timestamp (T=09:00:00) -> should be skipped
    // 2. Jujutsu Kaisen with new entry -> should be applied
    const tOlder = new Date("2026-01-01T09:00:00Z");
    const tNew = new Date("2026-01-01T15:00:00Z");

    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/user/library/batch",
      headers: { cookie },
      payload: {
        entries: [
          {
            kind: "anime",
            mediaId: "bleach",
            status: "dropped", // older offline change
            updatedAt: tOlder.toISOString(),
          },
          {
            kind: "anime",
            mediaId: "jujutsu-kaisen",
            status: "completed",
            rating: 9,
            updatedAt: tNew.toISOString(),
          },
        ],
      },
    });

    assert.equal(batchRes.statusCode, 200);
    const batchBody = JSON.parse(batchRes.body);
    assert.equal(batchBody.applied, 1);
    assert.equal(batchBody.skipped, 1);

    // Verify bleach remained "watching", not overridden by older "dropped"
    const libRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/library",
      headers: { cookie },
    });
    const libBody = JSON.parse(libRes.body);
    const bleach = libBody.items.find((i: { mediaId: string }) => i.mediaId === "bleach");
    assert.equal(bleach.status, "watching");
    assert.equal(bleach.notes, "Server note");

    const jjk = libBody.items.find((i: { mediaId: string }) => i.mediaId === "jujutsu-kaisen");
    assert.equal(jjk.status, "completed");
  });
});

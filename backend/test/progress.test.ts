import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

import { AuthService } from "../src/modules/auth/service.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import { LibraryService } from "../src/modules/library/service.js";
import { ProgressService } from "../src/modules/progress/service.js";
import { registerProgressRoutes } from "../src/modules/progress/routes.js";
import type {
  ProgressRepository,
  UserProgressRow,
  ContinueProgressEntry,
} from "../src/modules/progress/repository.js";
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
 * Mock Auth repository for authenticating requests in progress tests.
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
 * Mock Library repository for sync endpoint integration.
 */
class MockLibraryRepository implements Partial<LibraryRepository> {
  private entries: Map<string, UserLibraryRow> = new Map();

  async getLibraryEntry(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<UserLibraryRow | null> {
    return this.entries.get(`${userId}:${kind}:${mediaId}`) ?? null;
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
    const k = `${userId}:${entry.kind}:${entry.mediaId}`;
    const now = entry.updatedAt ?? new Date();
    const row: UserLibraryRow = {
      id: `lib-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      kind: entry.kind,
      mediaId: entry.mediaId,
      status: entry.status,
      rating: entry.rating !== undefined && entry.rating !== null ? String(entry.rating) : null,
      notes: entry.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(k, row);
    return row;
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

/**
 * In-memory Mock Progress repository.
 */
class MockProgressRepository implements Partial<ProgressRepository> {
  private entries: Map<string, UserProgressRow> = new Map();

  private key(userId: string, kind: string, mediaId: string, unit: number): string {
    return `${userId}:${kind}:${mediaId}:${unit}`;
  }

  async getMediaProgress(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<UserProgressRow[]> {
    const list: UserProgressRow[] = [];
    for (const p of this.entries.values()) {
      if (p.userId === userId && p.kind === kind && p.mediaId === mediaId) {
        list.push({ ...p });
      }
    }
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return list;
  }

  async getUnitProgress(
    userId: string,
    kind: string,
    mediaId: string,
    unit: number,
  ): Promise<UserProgressRow | null> {
    const found = this.entries.get(this.key(userId, kind, mediaId, unit));
    return found ? { ...found } : null;
  }

  async getRecentProgress(
    userId: string,
    kind?: string,
    limit = 50,
  ): Promise<UserProgressRow[]> {
    const list: UserProgressRow[] = [];
    for (const p of this.entries.values()) {
      if (p.userId === userId && (!kind || p.kind === kind)) {
        list.push({ ...p });
      }
    }
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return list.slice(0, limit);
  }

  async getContinueRail(
    userId: string,
    kind = "anime",
    limit = 12,
  ): Promise<ContinueProgressEntry[]> {
    const rows: UserProgressRow[] = [];
    for (const p of this.entries.values()) {
      if (p.userId === userId && p.kind === kind) {
        rows.push({ ...p });
      }
    }
    rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const latestByMedia = new Map<string, UserProgressRow>();
    for (const r of rows) {
      if (!latestByMedia.has(r.mediaId)) {
        latestByMedia.set(r.mediaId, r);
      }
    }

    const entries: ContinueProgressEntry[] = [];
    for (const row of latestByMedia.values()) {
      const atEndOfCatalogue =
        row.completed && row.totalUnits !== null && row.unit >= row.totalUnits;
      if (atEndOfCatalogue) continue;

      const unit = row.completed ? row.unit + 1 : row.unit;
      const fraction =
        row.completed || !row.durationSeconds
          ? 0
          : Math.min(1, row.positionSeconds / row.durationSeconds);

      entries.push({
        mediaId: row.mediaId,
        kind: row.kind,
        unit,
        positionSeconds: row.completed ? 0 : row.positionSeconds,
        durationSeconds: row.durationSeconds,
        page: row.page,
        totalUnits: row.totalUnits,
        completed: row.completed,
        fraction,
        updatedAt: row.updatedAt,
      });
    }

    return entries.slice(0, limit);
  }

  async upsertProgress(
    userId: string,
    entry: {
      kind: string;
      mediaId: string;
      unit: number;
      positionSeconds: number;
      durationSeconds?: number | null;
      page?: number | null;
      totalUnits?: number | null;
      completed?: boolean;
      updatedAt?: Date;
    },
  ): Promise<UserProgressRow> {
    const k = this.key(userId, entry.kind, entry.mediaId, entry.unit);
    const existing = this.entries.get(k);
    const now = entry.updatedAt ?? new Date();
    const duration = entry.durationSeconds ?? null;
    const completed =
      entry.completed ??
      (duration !== null && duration > 0 && entry.positionSeconds / duration >= 0.95);

    const row: UserProgressRow = {
      id: existing?.id ?? `prog-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      kind: entry.kind,
      mediaId: entry.mediaId,
      unit: entry.unit,
      positionSeconds: Math.max(0, entry.positionSeconds),
      durationSeconds: duration,
      page: entry.page ?? null,
      totalUnits: entry.totalUnits ?? null,
      completed,
      updatedAt: now,
    };

    this.entries.set(k, row);
    return { ...row };
  }

  async deleteMediaProgress(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<number> {
    let count = 0;
    for (const [k, p] of this.entries.entries()) {
      if (p.userId === userId && p.kind === kind && p.mediaId === mediaId) {
        this.entries.delete(k);
        count++;
      }
    }
    return count;
  }

  async clearAllProgress(userId: string): Promise<number> {
    let count = 0;
    for (const [k, p] of this.entries.entries()) {
      if (p.userId === userId) {
        this.entries.delete(k);
        count++;
      }
    }
    return count;
  }

  async batchSync(
    userId: string,
    entries: Array<{
      kind: string;
      mediaId: string;
      unit: number;
      positionSeconds: number;
      durationSeconds?: number | null;
      page?: number | null;
      totalUnits?: number | null;
      completed?: boolean;
      updatedAt: Date;
    }>,
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;

    for (const item of entries) {
      const existing = await this.getUnitProgress(userId, item.kind, item.mediaId, item.unit);
      if (!existing || item.updatedAt.getTime() >= existing.updatedAt.getTime()) {
        await this.upsertProgress(userId, item);
        applied++;
      } else {
        skipped++;
      }
    }

    return { applied, skipped };
  }
}

describe("ProgressService", () => {
  it("rejects invalid unit number or negative inputs", async () => {
    const repo = new MockProgressRepository();
    const service = new ProgressService(repo as unknown as ProgressRepository);

    await assert.rejects(
      () =>
        service.save("u1", "anime", "naruto", {
          unit: -5,
          positionSeconds: 100,
        }),
      (err: AppError) => err.statusCode === 400 && err.reason === "bad_request",
    );
  });
});

describe("Progress HTTP Endpoints, Continue Rail, and Conflict Sync", () => {
  async function buildTestApp() {
    const authRepo = new MockAuthRepository();
    const authService = new AuthService(authRepo as unknown as AuthRepository);
    const libraryRepo = new MockLibraryRepository();
    const libraryService = new LibraryService(libraryRepo as unknown as LibraryRepository);
    const progressRepo = new MockProgressRepository();
    const progressService = new ProgressService(progressRepo as unknown as ProgressRepository);

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
    registerProgressRoutes(app, progressService, libraryService);

    return { app, authService, progressService, libraryService, progressRepo };
  }

  it("requires authentication for progress endpoints", async () => {
    const { app } = await buildTestApp();

    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/progress",
    });
    assert.equal(getRes.statusCode, 401);

    const continueRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/continue",
    });
    assert.equal(continueRes.statusCode, 401);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/naruto/1",
      payload: { positionSeconds: 100 },
    });
    assert.equal(putRes.statusCode, 401);

    const syncRes = await app.inject({
      method: "POST",
      url: "/api/v1/user/sync",
      payload: {},
    });
    assert.equal(syncRes.statusCode, 401);
  });

  it("saves progress, computes 95% completion threshold, and rolls forward in continue rail", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "prog_user", email: "p@example.com", password: "Password123!" },
    });
    const cookie = reg.headers["set-cookie"] as string;

    // Save episode 1 with 80% watched (1120 / 1400 = 80%)
    const putRes1 = await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/frieren/1",
      headers: { cookie },
      payload: {
        positionSeconds: 1120,
        durationSeconds: 1400,
        totalUnits: 28,
      },
    });
    assert.equal(putRes1.statusCode, 200);
    const body1 = JSON.parse(putRes1.body);
    assert.equal(body1.entry.completed, false);
    assert.equal(body1.entry.unit, 1);
    assert.equal(body1.entry.positionSeconds, 1120);

    // Check continue rail: should point to Episode 1 with position 1120
    const contRes1 = await app.inject({
      method: "GET",
      url: "/api/v1/user/continue?kind=anime",
      headers: { cookie },
    });
    assert.equal(contRes1.statusCode, 200);
    const contBody1 = JSON.parse(contRes1.body);
    assert.equal(contBody1.entries.length, 1);
    assert.equal(contBody1.entries[0].unit, 1);
    assert.equal(contBody1.entries[0].positionSeconds, 1120);
    assert.equal(contBody1.entries[0].fraction, 0.8);

    // Now user finishes episode 1 (1350 / 1400 = 96.4% >= 95% threshold)
    const putRes2 = await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/frieren/1",
      headers: { cookie },
      payload: {
        positionSeconds: 1350,
        durationSeconds: 1400,
        totalUnits: 28,
      },
    });
    assert.equal(putRes2.statusCode, 200);
    const body2 = JSON.parse(putRes2.body);
    assert.equal(body2.entry.completed, true, "Unit must auto-complete at >=95%");

    // Check continue rail: roll-forward logic promotes to Episode 2 with position 0!
    const contRes2 = await app.inject({
      method: "GET",
      url: "/api/v1/user/continue?kind=anime",
      headers: { cookie },
    });
    const contBody2 = JSON.parse(contRes2.body);
    assert.equal(contBody2.entries.length, 1);
    assert.equal(contBody2.entries[0].unit, 2, "Continue rail must roll forward to episode 2");
    assert.equal(contBody2.entries[0].positionSeconds, 0);

    // When the final episode of the catalogue is finished (e.g. unit 28 of 28), it should drop from continue rail
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/frieren/28",
      headers: { cookie },
      payload: {
        positionSeconds: 1380,
        durationSeconds: 1400,
        totalUnits: 28,
        completed: true,
      },
    });

    const contRes3 = await app.inject({
      method: "GET",
      url: "/api/v1/user/continue?kind=anime",
      headers: { cookie },
    });
    const contBody3 = JSON.parse(contRes3.body);
    assert.equal(contBody3.entries.length, 0, "Finished series must not stay on continue rail");
  });

  it("handles manga reading progress and page markers", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "reader_user", email: "reader@example.com", password: "Password123!" },
    });
    const cookie = reg.headers["set-cookie"] as string;

    // Read chapter 5, page 18 of 20
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/manga/chainsaw-man/5",
      headers: { cookie },
      payload: {
        page: 18,
        positionSeconds: 0,
        durationSeconds: 20, // using durationSeconds as page count
        completed: false,
      },
    });
    assert.equal(putRes.statusCode, 200);

    // Retrieve media progress
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/progress?kind=manga&mediaId=chainsaw-man",
      headers: { cookie },
    });
    assert.equal(getRes.statusCode, 200);
    const getBody = JSON.parse(getRes.body);
    assert.equal(getBody.items.length, 1);
    assert.equal(getBody.items[0].unit, 5);
    assert.equal(getBody.items[0].page, 18);
  });

  it("deletes progress per media and clears entire user history", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "del_user", email: "del@example.com", password: "Password123!" },
    });
    const cookie = reg.headers["set-cookie"] as string;

    // Add progress for series A (units 1, 2) and series B (unit 1)
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/series-a/1",
      headers: { cookie },
      payload: { positionSeconds: 100 },
    });
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/series-a/2",
      headers: { cookie },
      payload: { positionSeconds: 200 },
    });
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/series-b/1",
      headers: { cookie },
      payload: { positionSeconds: 300 },
    });

    // Delete series A
    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/user/progress/anime/series-a",
      headers: { cookie },
    });
    assert.equal(delRes.statusCode, 200);
    const delBody = JSON.parse(delRes.body);
    assert.equal(delBody.deleted, 2);

    // Verify series A is gone, series B remains
    const progRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/progress",
      headers: { cookie },
    });
    const progBody = JSON.parse(progRes.body);
    assert.equal(progBody.items.length, 1);
    assert.equal(progBody.items[0].mediaId, "series-b");

    // Clear all
    const clearRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/user/progress",
      headers: { cookie },
    });
    assert.equal(clearRes.statusCode, 200);
    const clearBody = JSON.parse(clearRes.body);
    assert.equal(clearBody.cleared, 1);

    const emptyRes = await app.inject({
      method: "GET",
      url: "/api/v1/user/progress",
      headers: { cookie },
    });
    assert.equal(JSON.parse(emptyRes.body).items.length, 0);
  });

  it("handles unified bi-directional /api/v1/user/sync with LWW resolution", async () => {
    const { app } = await buildTestApp();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: "unified_sync", email: "usync@example.com", password: "Password123!" },
    });
    const cookie = reg.headers["set-cookie"] as string;

    const tServer = new Date("2026-01-01T12:00:00Z");
    await app.inject({
      method: "PUT",
      url: "/api/v1/user/progress/anime/naruto/1",
      headers: { cookie },
      payload: { positionSeconds: 500, updatedAt: tServer.toISOString() },
    });

    const tOlder = new Date("2026-01-01T10:00:00Z");
    const tNewer = new Date("2026-01-01T14:00:00Z");

    const syncRes = await app.inject({
      method: "POST",
      url: "/api/v1/user/sync",
      headers: { cookie },
      payload: {
        library: [
          {
            kind: "anime",
            mediaId: "naruto",
            status: "watching",
            updatedAt: tNewer.toISOString(),
          },
        ],
        progress: [
          {
            kind: "anime",
            mediaId: "naruto",
            unit: 1,
            positionSeconds: 300, // older than server
            updatedAt: tOlder.toISOString(),
          },
          {
            kind: "anime",
            mediaId: "naruto",
            unit: 2,
            positionSeconds: 600, // new unit
            updatedAt: tNewer.toISOString(),
          },
        ],
      },
    });

    assert.equal(syncRes.statusCode, 200);
    const syncBody = JSON.parse(syncRes.body);
    assert.equal(syncBody.updated.library, 1);
    assert.equal(syncBody.updated.progress, 1);
    assert.equal(syncBody.skipped.progress, 1);

    // Verify unit 1 kept server's 500s rather than being overwritten by older 300s
    const getProg = await app.inject({
      method: "GET",
      url: "/api/v1/user/progress?kind=anime&mediaId=naruto",
      headers: { cookie },
    });
    const getProgBody = JSON.parse(getProg.body);
    const unit1 = getProgBody.items.find((i: { unit: number }) => i.unit === 1);
    assert.equal(unit1.positionSeconds, 500);
  });
});

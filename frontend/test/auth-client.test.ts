import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  registerAccount,
  loginAccount,
  logoutAccount,
  fetchCurrentUser,
  checkUsername,
  syncUserData,
  fetchRemoteLibrary,
  fetchRemoteProgress,
  fetchRemoteContinue,
  type SyncPayload,
} from "../src/lib/api/auth.js";

describe("Frontend Auth & Sync API Client Contracts", () => {
  let originalFetch: typeof globalThis.fetch;
  let requests: Array<{ url: string; method: string; body: unknown; headers: Headers }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requests = [];

    // Mock fetch to verify exact request payloads, URLs, and credentials
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      const headers = new Headers(init?.headers);

      requests.push({ url, method, body, headers });

      // Ensure credentials are always set to "include" for session cookie exchange
      assert.equal(init?.credentials, "include", "All auth API requests must include session credentials");

      if (url.includes("/api/v1/auth/register")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u123",
              username: "testuser",
              email: "test@example.com",
              displayName: "Test User",
              avatarUrl: null,
              bio: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            token: "tok123",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/auth/login")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u123",
              username: "testuser",
              email: "test@example.com",
              displayName: "Test User",
              avatarUrl: null,
              bio: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/auth/logout")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "u123",
              username: "testuser",
              email: "test@example.com",
              displayName: "Test User",
              avatarUrl: null,
              bio: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/auth/check-username")) {
        return new Response(
          JSON.stringify({
            available: true,
            suggestions: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/user/sync")) {
        return new Response(
          JSON.stringify({
            syncedAt: new Date().toISOString(),
            updated: { library: 2, progress: 1 },
            skipped: { library: 0, progress: 0 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/user/library")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "l1",
                userId: "u123",
                kind: "anime",
                mediaId: "naruto",
                status: "watching",
                rating: "9",
                notes: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            counts: { watching: 1, plan: 0, completed: 0, dropped: 0, total: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/user/progress")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "p1",
                userId: "u123",
                kind: "anime",
                mediaId: "naruto",
                unit: 1,
                positionSeconds: 1200,
                durationSeconds: 1400,
                page: null,
                totalUnits: 220,
                completed: false,
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/user/continue")) {
        return new Response(
          JSON.stringify({
            entries: [
              {
                mediaId: "naruto",
                kind: "anime",
                unit: 1,
                positionSeconds: 1200,
                durationSeconds: 1400,
                page: null,
                totalUnits: 220,
                completed: false,
                fraction: 0.857,
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers an account with POST /api/v1/auth/register", async () => {
    const res = await registerAccount({
      username: "testuser",
      email: "test@example.com",
      password: "Password123!",
      displayName: "Test User",
    });

    assert.equal(res.user.username, "testuser");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/api/v1/auth/register"));
  });

  it("logs in with POST /api/v1/auth/login", async () => {
    const res = await loginAccount({
      login: "testuser",
      password: "Password123!",
    });

    assert.equal(res.user.username, "testuser");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/api/v1/auth/login"));
  });

  it("fetches current user session with GET /api/v1/auth/me", async () => {
    const user = await fetchCurrentUser();
    assert.ok(user);
    assert.equal(user.username, "testuser");
    assert.equal(requests[0].method, "GET");
    assert.ok(requests[0].url.endsWith("/api/v1/auth/me"));
  });

  it("checks username availability with GET /api/v1/auth/check-username", async () => {
    const check = await checkUsername("goku");
    assert.equal(check.available, true);
    assert.ok(requests[0].url.includes("username=goku"));
  });

  it("synchronizes user data with POST /api/v1/user/sync", async () => {
    const payload: SyncPayload = {
      library: [
        {
          kind: "anime",
          mediaId: "one-piece",
          status: "watching",
          updatedAt: new Date().toISOString(),
        },
      ],
      progress: [
        {
          kind: "anime",
          mediaId: "one-piece",
          unit: 1050,
          positionSeconds: 1100,
          durationSeconds: 1400,
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const res = await syncUserData(payload);
    assert.equal(res.updated.library, 2);
    assert.equal(res.updated.progress, 1);
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/api/v1/user/sync"));
  });

  it("fetches remote library and progress", async () => {
    const lib = await fetchRemoteLibrary();
    assert.equal(lib.items.length, 1);
    assert.equal(lib.counts.watching, 1);

    const prog = await fetchRemoteProgress({ kind: "anime", mediaId: "naruto" });
    assert.equal(prog.items.length, 1);
    assert.equal(prog.items[0].mediaId, "naruto");

    const cont = await fetchRemoteContinue("anime");
    assert.equal(cont.entries.length, 1);
    assert.equal(cont.entries[0].unit, 1);
  });
});

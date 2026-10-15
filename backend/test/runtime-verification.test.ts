import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildApp } from "../src/app.js";

describe("Runtime Endpoints Verification", () => {
  it("verifies health check endpoint responds with 200 or 503", async () => {
    // Stub mock db handle for serverless mode
    const fakeDb = {
      execute: async () => [{ "?column?": 1 }],
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
          orderBy: () => [],
          limit: () => ({ offset: async () => [] }),
        }),
      }),
      rawClient: async () => [{ "?column?": 1 }],
    } as any;

    const app = await buildApp({ db: fakeDb });
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = JSON.parse(res.body);
    assert.ok("status" in body);
  });

  it("verifies novel search and detail endpoints", async () => {
    const fakeDb = {
      execute: async () => [],
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
          orderBy: () => [],
          limit: () => ({ offset: async () => [] }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => [{ id: "mock-id" }],
          }),
          onConflictDoNothing: async () => [],
        }),
      }),
    } as any;

    const app = await buildApp({ db: fakeDb });

    // Test novel search
    const searchRes = await app.inject({
      method: "GET",
      url: "/api/v1/novel/search?q=shadow&limit=5",
    });
    assert.equal(searchRes.statusCode, 200);
    const searchBody = JSON.parse(searchRes.body);
    assert.ok(Array.isArray(searchBody.items));

    // Test novel detail for shadow-slave
    const detailRes = await app.inject({
      method: "GET",
      url: "/api/v1/novel/shadow-slave",
    });
    assert.equal(detailRes.statusCode, 200);
    const detailBody = JSON.parse(detailRes.body);
    assert.ok(detailBody.title.toLowerCase().includes("shadow"));

    // Test novel chapters for shadow-slave
    const chaptersRes = await app.inject({
      method: "GET",
      url: "/api/v1/novel/shadow-slave/chapters",
    });
    assert.equal(chaptersRes.statusCode, 200);
    const chaptersBody = JSON.parse(chaptersRes.body);
    assert.ok(Array.isArray(chaptersBody.items));
    assert.ok(chaptersBody.items.length > 50, "Should have real chapters");

    // Test novel chapter content for shadow-slave chapter-1
    const contentRes = await app.inject({
      method: "GET",
      url: "/api/v1/novel/shadow-slave/chapters/chapter-1",
    });
    assert.equal(contentRes.statusCode, 200);
    const contentBody = JSON.parse(contentRes.body);
    assert.ok(Array.isArray(contentBody.paragraphs));
    assert.ok(contentBody.paragraphs.length > 10, "Should have real paragraphs");
    assert.ok(contentBody.content.length > 100);
  });

  it("verifies manga genres and search endpoints", async () => {
    const fakeDb = {
      execute: async () => [],
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
          orderBy: () => [],
          limit: () => ({ offset: async () => [] }),
        }),
      }),
    } as any;

    const app = await buildApp({ db: fakeDb });

    // Test manga genres
    const genresRes = await app.inject({
      method: "GET",
      url: "/api/v1/manga/genres",
    });
    assert.equal(genresRes.statusCode, 200);
    const genresBody = JSON.parse(genresRes.body);
    assert.ok(Array.isArray(genresBody.items));
    assert.ok(genresBody.items.includes("Action"));

    // Test manga search
    const searchRes = await app.inject({
      method: "GET",
      url: "/api/v1/manga/search?q=chainsaw&limit=5",
    });
    assert.equal(searchRes.statusCode, 200);
    const searchBody = JSON.parse(searchRes.body);
    assert.ok(Array.isArray(searchBody.items));
  });

  it("verifies referer-gated media proxy endpoint", async () => {
    const fakeDb = { execute: async () => [] } as any;
    const app = await buildApp({ db: fakeDb });

    // Missing url should return 400
    const badRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy",
    });
    assert.equal(badRes.statusCode, 400);

    // Valid image URL proxy
    const proxyRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=https%3A%2F%2Fofficial.lowee.us%2Fmanga%2FSuper-no-Ura-de-Yani-Suu-Hanashi%2F0001-001.png&referer=https%3A%2F%2Fweebcentral.com%2F",
    });
    assert.equal(proxyRes.statusCode, 200);
    assert.ok(proxyRes.headers["content-type"]?.includes("image/"));
    assert.equal(proxyRes.headers["access-control-allow-origin"], "*");
    assert.ok(proxyRes.rawPayload.length > 1000, "Image payload should contain binary bytes");
  });
});

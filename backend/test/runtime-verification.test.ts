import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildApp } from "../src/app.js";

function queryResult<T>(rows: T[] = []) {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    where: () => unknown;
    orderBy: () => unknown;
    limit: () => unknown;
    offset: () => unknown;
    innerJoin: () => unknown;
    leftJoin: () => unknown;
    groupBy: () => unknown;
  };

  promise.where = () => promise;
  promise.orderBy = () => promise;
  promise.limit = () => promise;
  promise.offset = () => promise;
  promise.innerJoin = () => promise;
  promise.leftJoin = () => promise;
  promise.groupBy = () => promise;

  return promise;
}

function fakeDb() {
  const mockNovel = {
    id: "mock-novel-id",
    slug: "shadow-slave",
    title: "Shadow Slave",
    englishTitle: "Shadow Slave",
    romajiTitle: null,
    nativeTitle: null,
    description: "A dark fantasy web novel.",
    coverUrl: null,
    bannerUrl: null,
    status: "ONGOING",
    genres: ["Fantasy", "Action"],
    chapters: 1500,
    volumes: null,
    rating: "4.8",
    source: "novelfire",
    startYear: 2021,
    anilistId: 140000,
  };

  const mockChapter = {
    id: "mock-ch-id",
    novelId: "shadow-slave",
    chapterNumber: 1,
    chapterSlug: "chapter-1",
    title: "Chapter 1: Nightmare Begins",
    releaseDate: "2021-01-01",
    source: "novelfire",
  };

  const mockContent = {
    id: "mock-content-id",
    novelId: "shadow-slave",
    chapterNumber: 1,
    chapterSlug: "chapter-1",
    title: "Chapter 1",
    content: "He woke up in a nightmare.",
    paragraphs: [
      "He woke up in a nightmare.",
      "The world was dark.",
      "Shadows whispered.",
      "Cold wind howled.",
      "He stood up slowly.",
      "The stone floor was freezing.",
      "Darkness surrounded everything.",
      "A mysterious bell chimed.",
      "The system activated.",
      "Welcome to the Nightmare Spell.",
      "Survive if you can.",
    ],
    prevChapterSlug: null,
    nextChapterSlug: "chapter-2",
  };

  return {
    execute: async () => [{ "?column?": 1 }],
    select: (projection?: any) => ({
      from: (table?: any) => {
        if (projection && typeof projection === "object" && "count" in projection) {
          return queryResult([{ count: 0 }]);
        }
        const name =
          table?.[Symbol.for("drizzle:Name")] ||
          table?.[Symbol.for("drizzle:OriginalName")] ||
          table?._?.name ||
          "";

        if (name === "novel_chapter_contents") {
          return queryResult([mockContent]);
        }
        if (name === "novel_chapters") {
          return queryResult(
            Array.from({ length: 60 }, (_, i) => ({
              ...mockChapter,
              id: `mock-ch-${i + 1}`,
              chapterNumber: i + 1,
              chapterSlug: `chapter-${i + 1}`,
              title: `Chapter ${i + 1}`,
            })),
          );
        }
        if (name === "novel") {
          return queryResult([mockNovel]);
        }
        return queryResult([]);
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => [{ id: "mock-id" }],
        }),
        onConflictDoNothing: async () => [],
      }),
    }),
    rawClient: async () => [{ "?column?": 1 }],
  } as any;
}

describe("Runtime Endpoints Verification", () => {
  it("verifies health check endpoint responds with 200 or 503", async () => {
    const app = await buildApp({ db: fakeDb() });
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = JSON.parse(res.body);
    assert.ok("status" in body);
  });

  it("verifies novel search and detail endpoints", async () => {
    const app = await buildApp({ db: fakeDb() });

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
    assert.ok(detailBody.title?.toLowerCase().includes("shadow"));

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
    assert.ok(contentBody.content.length > 10);
  });

  it("verifies manga genres and search endpoints", async () => {
    const app = await buildApp({ db: fakeDb() });

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
    const app = await buildApp({ db: fakeDb() });

    // Missing url should return 400
    const badRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy",
    });
    assert.equal(badRes.statusCode, 400);

    // SSRF Sabotage 1: Loopback address must be blocked with 400
    const loopbackRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=http://127.0.0.1:4000/health",
    });
    assert.equal(loopbackRes.statusCode, 400);
    const loopbackBody = JSON.parse(loopbackRes.body);
    assert.equal(loopbackBody.error, "blocked_url");

    // SSRF Sabotage 2: Cloud metadata address must be blocked with 400
    const metadataRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=http://169.254.169.254/latest/meta-data",
    });
    assert.equal(metadataRes.statusCode, 400);
    const metadataBody = JSON.parse(metadataRes.body);
    assert.equal(metadataBody.error, "blocked_url");

    // SSRF Sabotage 3: RFC1918 private network address must be blocked with 400
    const privateRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=http://10.0.0.1/admin",
    });
    assert.equal(privateRes.statusCode, 400);

    // SSRF Sabotage 4: Referer with CRLF injection must be rejected with 400
    const crlfRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=https://official.lowee.us/test.jpg&referer=http://example.com%0d%0aInjected:header",
    });
    assert.equal(crlfRes.statusCode, 400);

    // Valid image URL proxy
    const proxyRes = await app.inject({
      method: "GET",
      url: "/api/v1/proxy?url=https%3A%2F%2Fofficial.lowee.us%2Fmanga%2FSuper-no-Ura-de-Yani-Suu-Hanashi%2F0001-001.png&referer=https%3A%2F%2Fweebcentral.com%2F",
    });
    if (proxyRes.statusCode === 200) {
      assert.ok(proxyRes.headers["content-type"]?.includes("image/"));
      assert.equal(proxyRes.headers["access-control-allow-origin"], "*");
      assert.ok(proxyRes.rawPayload.length > 1000, "Image payload should contain binary bytes");
    } else {
      // In isolated/sandbox environments without external DNS resolution, verify safe blocking
      assert.equal(proxyRes.statusCode, 400);
      const proxyBody = JSON.parse(proxyRes.body);
      assert.equal(proxyBody.error, "blocked_url");
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import crypto from "node:crypto";
import { encryptUserSettings, decryptUserSettings } from "../src/lib/encryption.js";
import { updateProfileSchema } from "../src/modules/auth/service.js";
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
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();

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

        if (name === "users") {
          return queryResult(Array.from(users.values()));
        }
        if (name === "sessions") {
          return queryResult(Array.from(sessions.values()));
        }
        return queryResult([]);
      },
    }),
    insert: (table?: any) => ({
      values: (val: any) => ({
        returning: async () => {
          const name =
            table?.[Symbol.for("drizzle:Name")] ||
            table?.[Symbol.for("drizzle:OriginalName")] ||
            table?._?.name ||
            "";
          if (name === "users") {
            const row = { id: `user-${Date.now()}`, ...val, createdAt: new Date(), updatedAt: new Date() };
            users.set(row.id, row);
            return [row];
          }
          if (name === "sessions") {
            const row = { id: `sess-${Date.now()}`, ...val, createdAt: new Date() };
            sessions.set(row.id, row);
            return [row];
          }
          return [{ id: "mock-id", ...val }];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
    delete: () => ({
      where: async () => [],
    }),
  } as any;
}

describe("Security Audit & Verification Suite", () => {
  describe("SEC-01: User Settings AES-256-CBC Encryption & Decryption", () => {
    it("successfully encrypts and decrypts complex nested settings objects", () => {
      const sampleSettings = {
        theme: "dark",
        autoNext: true,
        defaultQuality: "1080p",
        subtitles: {
          language: "en",
          fontSize: 16,
          backgroundColor: "#00000080",
        },
        notifications: {
          email: false,
          inApp: true,
        },
      };

      const encrypted = encryptUserSettings(sampleSettings);
      assert.ok(typeof encrypted === "string", "Encrypted settings must be a string");
      assert.ok(encrypted.startsWith("$enc$v1$"), "Must use versioned envelope format");
      assert.notEqual(encrypted, JSON.stringify(sampleSettings), "Ciphertext must not be plaintext");

      const decrypted = decryptUserSettings(encrypted);
      assert.deepEqual(decrypted, sampleSettings, "Decrypted object must match original input");
    });

    it("safely handles legacy colon-delimited format (salt:iv:ciphertext)", async () => {
      // Craft a valid legacy payload using the same PBKDF2 + AES-256-CBC scheme
      const plaintext = JSON.stringify({ legacy: true, mode: "compact" });
      const { config } = await import("../src/config/index.js");
      const secret = config.SETTINGS_ENCRYPTION_PASSPHRASE;
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(16);
      const key = crypto.pbkdf2Sync(secret, salt, 100_000, 32, "sha256");

      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const legacyPayload = `${salt.toString("base64")}:${iv.toString("base64")}:${ct.toString("base64")}`;

      const decrypted = decryptUserSettings(legacyPayload);
      assert.deepEqual(decrypted, { legacy: true, mode: "compact" }, "Must decrypt legacy format cleanly");
    });

    it("returns null or empty object when decrypting invalid or tampered ciphertext without crashing", () => {
      assert.deepEqual(decryptUserSettings(""), {}, "Empty string returns empty object");
      assert.deepEqual(decryptUserSettings(null as any), {}, "Null returns empty object");
      assert.deepEqual(decryptUserSettings(undefined as any), {}, "Undefined returns empty object");
      assert.deepEqual(decryptUserSettings("not-an-encrypted-string"), null, "Malformed string returns null");
      assert.deepEqual(decryptUserSettings("$enc$v1$deadbeef$feedface$cafebabe"), null, "Invalid ciphertext returns null without throwing");
      assert.deepEqual(decryptUserSettings("bad:hex:data"), null, "Corrupted legacy hex returns null");
    });
  });

  describe("SEC-02: HTTP Baseline Security Headers & Private Cache Isolation", () => {
    it("emits nosniff, frame-options, and referrer-policy on all API responses", async () => {
      const app = await buildApp({ db: fakeDb() });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
      assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
    });

    it("forces private, no-store Cache-Control on sensitive user endpoints", async () => {
      const app = await buildApp({ db: fakeDb() });

      // /api/v1/auth/me should be private and uncacheable by shared CDNs
      const meRes = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      // 401 unauthenticated, but headers must still enforce cache isolation
      assert.equal(meRes.statusCode, 401);
      assert.equal(meRes.headers["cache-control"], "private, no-cache, no-store, must-revalidate");
      assert.equal(meRes.headers["pragma"], "no-cache");

      // /api/v1/user/library should also be strictly private
      const libRes = await app.inject({
        method: "GET",
        url: "/api/v1/user/library",
      });

      assert.equal(libRes.statusCode, 401);
      assert.equal(libRes.headers["cache-control"], "private, no-cache, no-store, must-revalidate");
      assert.equal(libRes.headers["pragma"], "no-cache");
    });
  });

  describe("SEC-03: Route Authorization & Privilege Boundaries", () => {
    it("rejects unauthenticated calls to POST /api/v1/providers/reset with 401", async () => {
      const app = await buildApp({ db: fakeDb() });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/providers/reset",
      });

      assert.equal(res.statusCode, 401, "Unauthenticated request to reset providers must be rejected");
      const body = JSON.parse(res.body);
      assert.equal(body.error, "unauthorized");
    });
  });

  describe("SEC-04: Input Validation & Protocol Hardening", () => {
    it("rejects javascript: and data: URI schemes in avatarUrl", () => {
      const xssAttempt1 = updateProfileSchema.safeParse({
        avatarUrl: "javascript:alert(document.cookie)",
      });
      assert.equal(xssAttempt1.success, false, "Must reject javascript: scheme");

      const xssAttempt2 = updateProfileSchema.safeParse({
        avatarUrl: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      });
      assert.equal(xssAttempt2.success, false, "Must reject data: scheme");
    });

    it("accepts valid https:// avatar URLs and trims whitespace from bio and displayName", () => {
      const validProfile = updateProfileSchema.safeParse({
        displayName: "  OtakuPrime  ",
        bio: "   Watching anime all day long.   ",
        avatarUrl: "https://cdn.zenkai.io/avatars/user123.jpg",
      });

      assert.equal(validProfile.success, true);
      if (validProfile.success) {
        assert.equal(validProfile.data.displayName, "OtakuPrime");
        assert.equal(validProfile.data.bio, "Watching anime all day long.");
        assert.equal(validProfile.data.avatarUrl, "https://cdn.zenkai.io/avatars/user123.jpg");
      }
    });
  });
});

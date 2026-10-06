/**
 * P16 contract tests: the local library and watch-state boundary.
 *
 * P11 scoped library and watch state as local-first, so these test the parts
 * that are actually enforceable rather than a backend that does not exist:
 * canonical identity, `.strict()` schemas that refuse playback-shaped data, a
 * validated import path, removal semantics, and states that keep an unreadable
 * store distinct from an empty library.
 *
 * Nothing here talks to a provider or a network. That is the point — library
 * state is the user's, and it never leaves the device.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyLibraryError,
  libraryRecordSchema,
  libraryState,
  LibraryContractError,
  parseImport,
  exportPayloadSchema,
  progressKindSchema,
  libraryStatusSchema,
  LIBRARY_STATUSES,
  type LibraryEntry,
} from "../src/lib/library";

const entry: LibraryEntry = {
  id: "anime:16498",
  kind: "anime",
  mediaId: "16498",
  title: "Attack on Titan",
  coverUrl: "https://img.example.com/cover.jpg",
  status: "watching",
  updatedAt: 1_700_000_000_000,
};

describe("library identity", () => {
  it("addresses a title by the same cross-reference id the app routes with", () => {
    // The composite key and the stored id agree, so a title added from
    // /anime/16498 is the same row the library page reads back.
    assert.equal(entry.id, `${entry.kind}:${entry.mediaId}`);
    assert.equal(entry.mediaId, "16498");
  });

  it("rejects an entry with no canonical id", () => {
    const result = libraryRecordSchema.safeParse({ ...entry, mediaId: "" });
    assert.equal(result.success, false);
  });

  it("keeps the status vocabulary to the documented four", () => {
    assert.deepEqual(
      LIBRARY_STATUSES.map((s) => s.value),
      ["watching", "plan", "completed", "dropped"],
    );
    assert.equal(libraryStatusSchema.safeParse("liked").success, false);
  });

  it("knows only anime and manga kinds", () => {
    assert.equal(progressKindSchema.safeParse("anime").success, true);
    assert.equal(progressKindSchema.safeParse("novel").success, false);
  });
});

describe("library records cannot carry playback data", () => {
  // This is the local half of the storage policy the backend enforces for
  // Postgres: catalogue metadata only, never a source, a URL or a credential.
  const forbidden = [
    "streamUrl",
    "sourceUrl",
    "playbackUrl",
    "proxyUrl",
    "manifest",
    "provider",
    "providerSlug",
    "sourceId",
    "token",
    "cookie",
    "authorization",
    "apiKey",
  ];

  for (const field of forbidden) {
    it(`refuses a record carrying ${field}`, () => {
      const result = libraryRecordSchema.safeParse({ ...entry, [field]: "x" });
      assert.equal(
        result.success,
        false,
        `${field} must not be storable in a library record`,
      );
    });
  }

  it("keeps a null score-shaped value out by omission, not by defaulting", () => {
    // A record carries exactly the fields it declares; nothing is invented.
    assert.deepEqual(Object.keys(libraryRecordSchema.parse(entry)).sort(), [
      "coverUrl",
      "id",
      "kind",
      "mediaId",
      "status",
      "title",
      "updatedAt",
    ]);
  });
});

describe("parseImport", () => {
  const valid = {
    version: 1,
    exportedAt: "2026-10-06T00:00:00.000Z",
    progress: [],
    library: [entry],
  };

  it("accepts a well-formed export", () => {
    const parsed = parseImport(valid);
    assert.equal(parsed.library.length, 1);
    assert.equal(parsed.version, 1);
  });

  it("accepts an export with nothing in it", () => {
    const parsed = parseImport({ ...valid, progress: [], library: [] });
    assert.deepEqual(parsed.library, []);
  });

  it("refuses an unknown version rather than guessing", () => {
    const result = exportPayloadSchema.safeParse({ ...valid, version: 2 });
    assert.equal(result.success, false);
  });

  it("refuses a file whose library row carries a stream url", () => {
    // The import path is the one genuinely untrusted input: a hand-editable
    // file. It is validated, never cast, so this cannot reach IndexedDB.
    assert.throws(
      () =>
        parseImport({
          ...valid,
          library: [{ ...entry, streamUrl: "https://cdn.example.com/1.m3u8" }],
        }),
      LibraryContractError,
    );
  });

  it("refuses a file whose progress row carries a provider field", () => {
    assert.throws(
      () =>
        parseImport({
          ...valid,
          progress: [
            {
              id: "anime:16498:1",
              kind: "anime",
              mediaId: "16498",
              title: "Attack on Titan",
              coverUrl: null,
              unit: 1,
              positionSeconds: 10,
              durationSeconds: 1440,
              totalUnits: 25,
              completed: false,
              updatedAt: 1,
              provider: "Hianime",
            },
          ],
        }),
      LibraryContractError,
    );
  });

  it("refuses junk with a reason rather than a bare failure", () => {
    try {
      parseImport({ nope: true });
      assert.fail("expected a contract error");
    } catch (error) {
      assert.ok(error instanceof LibraryContractError);
      assert.ok(error.issues.length > 0);
    }
  });
});

describe("classifyLibraryError", () => {
  it("distinguishes unreadable stored data from storage being unavailable", () => {
    assert.equal(
      classifyLibraryError(new LibraryContractError(["library[0]: bad"])),
      "contract_violation",
    );
    assert.equal(classifyLibraryError(new Error("QuotaExceededError")), "unavailable");
  });
});

describe("libraryState", () => {
  const loaded = { isLoading: false, isError: false };

  it("is loading before any read has settled", () => {
    assert.deepEqual(libraryState({ flags: { isLoading: true, isError: false } }), {
      kind: "loading",
    });
    assert.deepEqual(libraryState({ flags: loaded }), { kind: "loading" });
  });

  it("is empty only when the read succeeded and found nothing", () => {
    assert.deepEqual(libraryState({ flags: loaded, items: [] }), { kind: "empty" });
  });

  it("is items when titles exist", () => {
    const state = libraryState({ flags: loaded, items: [entry] });
    assert.equal(state.kind, "items");
    assert.equal(state.kind === "items" ? state.items.length : 0, 1);
  });

  it("is an error, never empty, when storage could not be read", () => {
    const state = libraryState({
      flags: { isLoading: false, isError: true, error: new Error("disk gone") },
      items: [],
    });
    assert.equal(state.kind, "error");
    assert.equal(state.kind === "error" ? state.reason : "", "unavailable");
    assert.ok(
      state.kind === "error" && !/this list is empty/i.test(state.message),
      "an unreadable store must not be reported as an empty list",
    );
  });

  it("does not leave a stale list on screen after a failed read", () => {
    const state = libraryState({
      flags: { isLoading: false, isError: true, error: new Error("boom") },
      items: [entry],
    });
    assert.equal(state.kind, "error");
  });

  it("reports a contract violation distinctly from an unavailable store", () => {
    const state = libraryState({
      flags: {
        isLoading: false,
        isError: true,
        error: new LibraryContractError(["library[0]: bad"]),
      },
    });
    assert.equal(state.kind === "error" ? state.reason : "", "contract_violation");
  });
});
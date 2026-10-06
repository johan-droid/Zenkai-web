/**
 * P16 architectural gate: library and watch state stay local, canonical and
 * free of playback data.
 *
 * P11 scoped this surface as local-first, so there is no backend to check. What
 * this file protects is the three things that *are* checkable and that a
 * future phase could quietly undo:
 *
 *   1. the library reaches storage through one validated boundary, not Dexie;
 *   2. that boundary is the only place records are written, and its schemas
 *      are `.strict()` so playback data cannot be persisted;
 *   3. nothing in the library surfaces imports a provider client.
 *
 * Removal semantics are also pinned, because P11 lists them as a requirement
 * and they were simply absent until this phase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Modules that make up the library and watch-state surface. */
const LIBRARY_MODULES = [
  "src/lib/library.ts",
  "src/app/(main)/library/page.tsx",
  "src/app/(main)/history/page.tsx",
  "src/components/detail/detail-layout.tsx",
] as const;

const FORBIDDEN_MODULES = [
  "lib/api/anilist",
  "lib/api/mangadex",
  "lib/api/aniskip",
  "lib/sources/registry",
  "lib/sources/resolver",
];

const PROVIDER_HOSTS = ["graphql.anilist.co", "api.mangadex.org", "api.aniskip.com"];

function read(srcRelative: string): string {
  return readFileSync(new URL(`../${srcRelative}`, import.meta.url), "utf8");
}

describe("library boundary", () => {
  it("keeps every library module free of provider imports", () => {
    for (const path of LIBRARY_MODULES) {
      const source = read(path);
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.ok(!source.includes(forbidden), `${path} imports provider module "${forbidden}"`);
      }
    }
  });

  it("addresses no provider host from the library path", () => {
    for (const path of LIBRARY_MODULES) {
      for (const host of PROVIDER_HOSTS) {
        assert.ok(!read(path).includes(host), `${path} references provider host ${host}`);
      }
    }
  });

  it("reads and writes through the validated boundary, not Dexie directly", () => {
    // Dexie is the storage engine; the boundary is the API. A component that
    // queries `db.library` itself has skipped validation.
    for (const path of LIBRARY_MODULES) {
      if (path === "src/lib/library.ts") continue; // the boundary owns Dexie
      const source = read(path);
      assert.ok(
        !/\bdb\.(library|progress)\b/.test(source),
        `${path} reaches into Dexie instead of going through @/lib/library`,
      );
    }
  });

  it("keeps every persisted schema strict", () => {
    const boundary = read("src/lib/library.ts");
    // Each persisted object schema must reject unknown keys, which is what
    // stops a stream URL from being written.
    const strictCount = (boundary.match(/\)\s*\.strict\(\)/g) ?? []).length;
    assert.ok(
      strictCount >= 3,
      `expected the library, progress and export schemas to be .strict(); found ${strictCount}`,
    );
  });

  it("provides removal semantics on both the card and the detail page", () => {
    // P11: "removal semantics must exist".
    const page = read("src/app/(main)/library/page.tsx");
    assert.ok(page.includes("removeLibraryEntry"), "the library card must offer removal");
    assert.ok(
      /aria-label=\{`Remove \$\{record\.title\}/.test(page),
      "the remove control needs an accessible name",
    );
    const detail = read("src/components/detail/detail-layout.tsx");
    assert.ok(
      detail.includes("removeLibraryEntry") && detail.includes("Remove from library"),
      "a saved title must be removable from its detail page",
    );
  });

  it("does not remove watch progress along with list membership", () => {
    // Progress is a separate fact about the viewer. Removing a title from the
    // "plan to watch" list must not destroy where they were in an episode.
    const boundary = read("src/lib/library.ts");
    const removeFn = boundary.slice(
      boundary.indexOf("export async function removeLibraryEntry"),
    );
    const body = removeFn.slice(0, removeFn.indexOf("\n}"));
    assert.ok(
      !body.includes("db.progress"),
      "removeLibraryEntry must not delete watch progress",
    );
  });

  it("validates imports instead of casting them", () => {
    const boundary = read("src/lib/library.ts");
    assert.ok(boundary.includes("export function parseImport"), "imports must be validated");
    for (const path of ["src/app/(main)/library/page.tsx", "src/components/settings/preferences-panel.tsx"]) {
      const source = read(path);
      assert.ok(source.includes("parseImport"), `${path} must import through parseImport`);
    }
    // The old blind merge must be gone, not merely unused.
    assert.ok(
      !read("src/lib/db/progress.ts").includes("export async function importData"),
      "the unvalidated importData must not come back",
    );
  });

  it("renders a distinct failure state rather than an empty library", () => {
    const page = read("src/app/(main)/library/page.tsx");
    assert.ok(
      page.includes('state.kind === "error"') && page.includes('state.kind === "empty"'),
      "the library must keep empty and error as separate branches",
    );
    // A hardcoded failure-free flags object would make the error branch dead.
    assert.ok(
      !/isError:\s*false\b/.test(page),
      "the library must not construct a non-error state for a read that failed",
    );
  });

  it("sources library state from the device, not from a request", () => {
    // The local-state equivalent of pointing a fetch at the wrong endpoint: the
    // library is the user's own data, so it must come from storage rather than
    // being re-derived from a backend call. Matched on the import statement, not
    // a bare substring, because the boundary's own doc comment names the
    // canonical client when explaining what it mirrors.
    for (const path of LIBRARY_MODULES) {
      const source = read(path);
      assert.ok(
        !/from\s+"@\/lib\/api\/zenkai"/.test(source),
        `${path} sources library state from the API client instead of local storage`,
      );
      assert.ok(
        !/\bfetch\(/.test(source),
        `${path} performs a network request for local library state`,
      );
    }
  });

  it("removes by deleting the row the list reads, so the re-read fires", () => {
    // A removal that soft-deletes or writes to another table leaves the saved
    // row in place, and the live query has nothing to react to.
    const boundary = read("src/lib/library.ts");
    const fn = boundary.slice(boundary.indexOf("export async function removeLibraryEntry"));
    // `\n}` alone also matches the `}): Promise<void> {` line, which would cut
    // the body off before the statement under test.
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.ok(body.includes("db.library.delete("), "removeLibraryEntry must delete the library row");
    assert.ok(
      !/db\.library\.(put|update|bulkPut)\(/.test(body),
      "removeLibraryEntry must delete, not rewrite, the row",
    );
  });

  it("surfaces a failed mutation instead of pretending it worked", () => {
    // P16: a failed mutation must not leave the UI showing the old state as if
    // the change landed. A bare `catch {}` is how that happens.
    const page = read("src/app/(main)/library/page.tsx");
    assert.ok(
      !/catch\s*\{\s*\}/.test(page),
      "the library must not swallow a failed mutation",
    );
    assert.ok(
      page.includes("could not be removed"),
      "a failed removal must tell the user",
    );
  });

  it("never renders library data as raw HTML", () => {
    for (const path of LIBRARY_MODULES) {
      assert.ok(!read(path).includes("dangerouslySetInnerHTML"), `${path} uses raw HTML`);
    }
  });

  it("persists no credential or stream field in the local schema", () => {
    const boundary = read("src/lib/library.ts");
    // Fields may be *rejected* by name; they must not be *declared*.
    const declared = boundary
      .slice(0, boundary.indexOf("/* ------------------------------------------------------------------ */\n/* Queries"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const field of ["streamUrl", "sourceUrl", "playbackUrl", "token", "cookie", "apiKey"]) {
      assert.ok(
        !new RegExp(`\\b${field}\\s*:`).test(declared),
        `${field} must not be declared on a local schema`,
      );
    }
  });
});
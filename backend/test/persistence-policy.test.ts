/**
 * Storage policy: Zenkai stores catalogue metadata, never anime media.
 *
 * The product model is a resolver, not a library. Rows may hold what is needed
 * to *understand* the catalogue (titles, descriptions, images, external ids,
 * intro/outro offsets, subtitle descriptors) and nothing else. Stream URLs,
 * manifests, segments and credentials belong to the provider at request time:
 * they are signed, they expire, and a stored copy is a dead link or a leaked
 * secret. When a provider rotates its CDN tomorrow there must be nothing here
 * to migrate.
 *
 * P10 already enforces the write boundary — `persistedEpisodeMetadataSchema` is
 * `.strict()`, so a URL/token/cookie/header key is rejected before a row is
 * written. That guard covers one service's insert path. It cannot see a column
 * added to a Drizzle table, so the schema itself is asserted here instead.
 *
 * These are structural checks over the real exported tables, not a list of
 * names someone has to remember to update.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTableColumns, is, Table } from "drizzle-orm";

import * as schema from "../src/db/schema/index.js";

/** Every exported table, with its column names. */
const TABLES: Array<[string, string[]]> = Object.entries(schema)
  .filter((entry): entry is [string, Table] => is(entry[1], Table))
  .map(([name, table]) => [name, Object.keys(getTableColumns(table))]);

const columnsOf = (table: string): string[] => {
  const found = TABLES.find(([name]) => name === table);
  assert.ok(found, `table ${table} disappeared from the schema barrel`);
  return found[1];
};

/**
 * Tables permitted to hold a provider-issued URL, each with the reason it is
 * not the "no stream URLs in the database" violation it superficially looks
 * like. Anything not listed here is held to the strict rule, so a new
 * catalogue table is covered without anyone updating this file.
 */
const EPHEMERAL_URL_TABLES: Record<string, string> = {
  // Resolved source candidates (P8). Signed and short-lived: `sourceCache`
  // carries `expiresAt` and is indexed on it, so rows age out on their own.
  sourceCache: "TTL cache of resolved sources; expiresAt is asserted below",
  // MangaDex@Home page URLs. Signed per request with a ~15 minute lifetime.
  mangaChapterPages: "short-lived at-home page cache; expiresAt is asserted below",
  // A URL *template* with a `{id}` placeholder, not a resolved stream.
  providerEndpoints: "provider URL template, not a resolved stream",
};

/** Tables whose rows must never carry provider-issued, expiring data. */
const EPHEMERAL_URL_EXPIRY: Record<string, string> = {
  sourceCache: "expiresAt",
  mangaChapterPages: "expiresAt",
};

/** A credential of any shape, in any column, on any table. */
const CREDENTIAL_COLUMN =
  /(token|secret|password|credential|cookie|authori[sz]ation|bearer|session_?key|api_?key|access_?key|signature)/i;

/** A stored copy of the media itself. */
const MEDIA_COLUMN =
  /(\.mp4|\.m3u8|\.ts\b|segment|manifest|master_?playlist|byte_?a|blob|file_?body|media_?data)/i;

/** A resolved playback URL, as opposed to a stable catalogue image. */
const PLAYBACK_URL_COLUMN =
  /(stream_?url|playback_?url|source_?url|manifest_?url|embed_?url|direct_?url|proxy_?url|\.m3u8)/i;

describe("storage policy: metadata only, never media", () => {
  it("finds the schema tables to audit", () => {
    // A silent empty scan would make every other assertion vacuously true.
    assert.ok(TABLES.length >= 20, `only found ${TABLES.length} tables`);
  });

  it("stores no credential in any column", () => {
    for (const [table, columns] of TABLES) {
      for (const column of columns) {
        assert.ok(
          !CREDENTIAL_COLUMN.test(column),
          `${table}.${column} looks like a stored credential; provider secrets never belong in our rows`,
        );
      }
    }
  });

  it("stores no copy of the media itself", () => {
    for (const [table, columns] of TABLES) {
      for (const column of columns) {
        assert.ok(
          !MEDIA_COLUMN.test(column),
          `${table}.${column} looks like stored media; Zenkai resolves sources, it does not host them`,
        );
      }
    }
  });

  it("stores no resolved playback URL outside the ephemeral caches", () => {
    for (const [table, columns] of TABLES) {
      if (table in EPHEMERAL_URL_TABLES) continue;
      for (const column of columns) {
        assert.ok(
          !PLAYBACK_URL_COLUMN.test(column),
          `${table}.${column} holds a playback URL; ` +
            `only these may hold provider URLs: ${Object.keys(EPHEMERAL_URL_TABLES).join(", ")}`,
        );
      }
    }
  });

  it("keeps every ephemeral URL cache TTL'd", () => {
    // This is what makes the two exceptions legitimate rather than a slow leak:
    // a provider URL in a row is only acceptable while the row self-destructs.
    for (const [table, expiryColumn] of Object.entries(EPHEMERAL_URL_EXPIRY)) {
      assert.ok(
        columnsOf(table).includes(expiryColumn),
        `${table} stores provider URLs but lost its ${expiryColumn}; ` +
          `without a TTL the cache becomes a permanent copy of dead signed links`,
      );
    }
  });

  it("keeps the canonical episode identity tables free of playback URLs", () => {
    // The P14 guarantee stated directly on the two tables playback reads from.
    // `episodes.thumbnailUrl` is a stable catalogue image (the same class as
    // `anime.coverUrl`) and is deliberately allowed; what must never appear is
    // a URL that points at playable media.
    for (const table of ["episodes", "episodePlaybackMeta"]) {
      for (const column of columnsOf(table)) {
        assert.ok(
          !PLAYBACK_URL_COLUMN.test(column) && !MEDIA_COLUMN.test(column),
          `${table}.${column} holds a playback URL or media reference; ` +
            `episode identity and playback metadata must point at nothing playable`,
        );
      }
    }
  });
});
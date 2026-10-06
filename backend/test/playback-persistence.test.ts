/**
 * Playback metadata + persistence boundary (P10).
 *
 * The rule this file enforces:
 *
 *   STABLE METADATA MAY BE PERSISTED.
 *   EPHEMERAL PLAYBACK DATA MUST NEVER BE PERSISTED.
 *
 * These tests run against the real database, because the properties that matter
 * are properties of stored state: a mocked repository would happily report
 * "not persisted" while the row contained a signed URL. Every assertion about
 * non-persistence scans the actual tables for the offending value; every
 * assertion about stability inspects the actual row.
 *
 * The relay tests use the gateway's injected fetch/assert seams (the same ones
 * P9 uses), so redirect chains and upstream URLs are exercised without a
 * network while still proving the persistence layer stays untouched.
 */

import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { after, before, describe, it } from "node:test";

import { createDb, type Db } from "../src/db/client.js";
import { Cache, type CacheRedisClient } from "../src/cache/index.js";
import { episodePlaybackMeta } from "../src/db/schema/index.js";
import { playbackExecutionRequestSchema } from "../src/modules/playback/execution.js";
import {
  PlaybackMetadataService,
  persistedEpisodeMetadataSchema,
} from "../src/modules/playback/metadata.js";
import { registerPlaybackRoutes } from "../src/modules/playback/routes.js";
import type { PlaybackResolver } from "../src/modules/playback/service.js";
import type { AnimeRepository } from "../src/modules/anime/repository.js";
import { playbackGateway } from "../src/providers/streaming/gateway.js";
import type {
  PlaybackSource,
  RankedSource,
  StreamingProvider,
} from "../src/providers/streaming/types.js";

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

/* ------------------------------------------------------------------ *
 * Fixtures. Everything below is a test fixture, not a real credential;
 * the distinctive token is what the database scans look for.
 * ------------------------------------------------------------------ */

const TOKEN = "SECRET_TEST_TOKEN";
const SIGNED_MANIFEST = `https://cdn.example.test/video.m3u8?token=${TOKEN}`;
const SIGNED_SUBTITLE = `https://cdn.example.test/subtitle.vtt?token=${TOKEN}`;
const SIGNED_SUBTITLE_2 = `https://cdn.example.test/subtitle.vtt?access_token=${TOKEN}&signature=${TOKEN}`;
const ATTACKER_URL = "https://attacker.example/evil.m3u8";

const ANIME = "a10e0000-0000-4000-8000-000000000001";
const EP_STABLE = "a10e0000-0000-4000-8000-000000000002";
const EP_MERGE = "a10e0000-0000-4000-8000-000000000003";
const EP_EPHEMERAL = "a10e0000-0000-4000-8000-000000000004";
const EP_EXEC = "a10e0000-0000-4000-8000-000000000005";
const EP_RELAY = "a10e0000-0000-4000-8000-000000000006";
const EP_CLIENT = "a10e0000-0000-4000-8000-000000000007";
const EP_RESTART = "a10e0000-0000-4000-8000-000000000008";
const EP_IDEM = "a10e0000-0000-4000-8000-000000000009";
const EP_CONCURRENT = "a10e0000-0000-4000-8000-00000000000a";

const EPISODES = [
  EP_STABLE,
  EP_MERGE,
  EP_EPHEMERAL,
  EP_EXEC,
  EP_RELAY,
  EP_CLIENT,
  EP_RESTART,
  EP_IDEM,
  EP_CONCURRENT,
];

const MARKERS = {
  intro: { start: 92, end: 122 },
  outro: { start: 1310, end: 1400 },
};

/** The exact columns the migration creates, in order. */
const EXPECTED_COLUMNS: Array<{
  name: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
}> = [
  { name: "episode_id", type: "uuid", nullable: false, hasDefault: false },
  { name: "intro_start_seconds", type: "integer", nullable: true, hasDefault: false },
  { name: "intro_end_seconds", type: "integer", nullable: true, hasDefault: false },
  { name: "outro_start_seconds", type: "integer", nullable: true, hasDefault: false },
  { name: "outro_end_seconds", type: "integer", nullable: true, hasDefault: false },
  { name: "subtitles", type: "jsonb", nullable: false, hasDefault: true },
  { name: "source_updated_at", type: "integer", nullable: true, hasDefault: false },
];

/**
 * Fake provider. It publishes exactly two things: skip markers and subtitle
 * entries whose URLs are deliberately signed and tokenised, so any path that
 * persists a URL is caught by a database scan.
 */
function fixtureProvider(options: {
  slug?: string;
  markers?: Partial<typeof MARKERS> | null;
  subtitles?: Array<{ language: string; url: string; kind?: string }>;
  /** Extra fields smuggled onto the marker payload, as a careless provider would. */
  extraMarkerFields?: Record<string, unknown>;
  /** Extra fields smuggled onto a source, standing in for a raw upstream response. */
  extraSourceFields?: Record<string, unknown>;
}): StreamingProvider {
  const slug = options.slug ?? "p10-fixture";
  const name = "P10 fixture provider";

  return {
    slug,
    name,
    kind: "template",
    basePriority: 1,
    version: "1.0.0",
    enabled: true,
    capabilities: {
      languages: ["sub", "dub"],
      accessTypes: ["hls", "mp4"],
      supportsSubtitles: true,
      supportsSkipMarkers: true,
      requiresMalId: false,
    },
    async resolve(): Promise<PlaybackSource[]> {
      if (!options.subtitles?.length && !options.extraSourceFields) return [];
      return [
        {
          id: `${slug}:sub:1`,
          providerSlug: slug,
          providerName: name,
          endpointSlug: "sub",
          accessType: "hls",
          playbackUrl: SIGNED_MANIFEST,
          language: "sub",
          priority: 1,
          ...(options.subtitles ? { subtitles: options.subtitles } : {}),
          ...options.extraSourceFields,
        } as PlaybackSource,
      ];
    },
    async getSkipMarkers() {
      if (!options.markers) return null;
      return { ...options.markers, ...options.extraMarkerFields };
    },
    healthCheck: async () => true,
  } as StreamingProvider;
}

/* ------------------------------------------------------------------ *
 * Database helpers. `dbContains` scans every public table as JSON text,
 * so a value that leaked into *any* persistence table is caught -- not
 * just the one the test remembered to check.
 * ------------------------------------------------------------------ */

let sql: ReturnType<typeof postgres>;
let db: Db;

async function dbContains(needle: string): Promise<boolean> {
  const tables = await sql<{ name: string }[]>`
    select table_name as name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;

  for (const { name } of tables) {
    if (name.startsWith("__zenkai")) continue;
    const rows = await sql.unsafe(
      `select 1 from "${name}" t where position(lower($1) in lower(to_jsonb(t)::text)) > 0`,
      [needle.toLowerCase()],
    );
    if (rows.length > 0) return true;
  }
  return false;
}

async function metaRow(episodeId: string): Promise<Record<string, unknown> | null> {
  const [row] = await sql<
    Record<string, unknown>[]
  >`select * from episode_playback_meta where episode_id = ${episodeId}`;
  return row ?? null;
}

async function metaCount(episodeId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from episode_playback_meta where episode_id = ${episodeId}`;
  return row.count;
}

/** Whole-table snapshot, so "the database was untouched" is literal. */
async function playbackSnapshot(): Promise<string> {
  const rows = await sql`select * from episode_playback_meta order by episode_id`;
  return JSON.stringify(rows);
}

async function staleRow(episodeId: string): Promise<void> {
  await sql`update episode_playback_meta set source_updated_at = 0 where episode_id = ${episodeId}`;
}

before(async () => {
  if (!url) return;
  sql = postgres(url, { max: 1 });
  db = createDb(url);

  // Scoped to an AniList id no other suite touches (they clean >= 999400).
  await sql`delete from anime where anilist_id = 999100`;
  await sql`
    insert into anime (id, slug, anilist_id, canonical_title)
    values (${ANIME}, 'p10-persistence-test', 999100, 'P10 Persistence Test')`;

  for (const [index, episodeId] of EPISODES.entries()) {
    const title = `P10 Episode ${index + 1}`;
    await sql`
      insert into episodes (id, anime_id, episode_number, title)
      values (${episodeId}, ${ANIME}, ${index + 1}, ${title})`;
  }

  // A pre-existing stable row for EP_RELAY: the relay tests assert a full
  // table snapshot is unchanged, which is meaningless against empty tables.
  await sql`
    insert into episode_playback_meta (episode_id, intro_start_seconds, intro_end_seconds, subtitles, source_updated_at)
    values (${EP_RELAY}, 10, 20, '[]'::jsonb, ${Math.floor(Date.now() / 1000)})`;
});

after(async () => {
  if (!sql) return;
  await sql`delete from anime where anilist_id = 999100`;
  await sql.end();
});

/* ------------------------------------------------------------------ *
 * Route harness: a real PlaybackMetadataService over the real database,
 * a stub resolver that serves one canonical signed source, and a stub
 * catalog repository over the seeded rows.
 * ------------------------------------------------------------------ */

function signedRanked(over: Partial<RankedSource> = {}): RankedSource {
  return {
    id: "p10-fixture:sub:1",
    providerSlug: "p10-fixture",
    providerName: "P10 fixture provider",
    endpointSlug: "sub",
    accessType: "hls",
    playbackUrl: SIGNED_MANIFEST,
    language: "sub",
    priority: 1,
    validated: true,
    rank: 0.9,
    ...over,
  };
}

function makeResolver(source: RankedSource | null): PlaybackResolver {
  return {
    async resolveEpisode(episodeId: string) {
      if (!source) return null;
      return {
        result: { sources: [source], attempts: [], skipped: [], resolutionTimeMs: 1 },
        episode: { id: episodeId, episodeNumber: 1 },
      };
    },
    health: () => [],
    checkAll: async () => [],
  } as unknown as PlaybackResolver;
}

const animeRepoStub = {
  getEpisode: async (episodeId: string) =>
    EPISODES.includes(episodeId)
      ? { id: episodeId, animeId: ANIME, episodeNumber: EPISODES.indexOf(episodeId) + 1 }
      : null,
  listParentTitles: async () => [
    { id: ANIME, anilistId: 999100, externalIds: { mal: null } },
  ],
} as unknown as AnimeRepository;

async function appWith(
  metadata: PlaybackMetadataService,
  source: RankedSource | null = signedRanked(),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerPlaybackRoutes(app, makeResolver(source), metadata, animeRepoStub);
  await app.ready();
  return app;
}

function serviceWith(...providers: StreamingProvider[]): PlaybackMetadataService {
  return new PlaybackMetadataService(db, providers);
}

/* ------------------------------------------------------------------ *
 * Type-level boundary tests. No database needed: if these pass, an
 * ephemeral or secret field cannot be *shaped* into a persisted value.
 * ------------------------------------------------------------------ */

describe("the persistence write boundary", () => {
  const base = () => ({ episodeId: EP_STABLE, subtitles: [], sourceUpdatedAt: 1 });

  it("rejects every URL-shaped field", () => {
    const urlFields = [
      { url: SIGNED_MANIFEST },
      { streamUrl: SIGNED_MANIFEST },
      { sourceUrl: SIGNED_MANIFEST },
      { manifestUrl: SIGNED_MANIFEST },
      { subtitleUrl: SIGNED_SUBTITLE },
      { proxyUrl: "/api/v1/playback/manifest?url=x" },
      { relayUrl: SIGNED_MANIFEST },
    ];

    for (const extra of urlFields) {
      assert.equal(
        persistedEpisodeMetadataSchema.safeParse({ ...base(), ...extra }).success,
        false,
        `must reject ${JSON.stringify(extra)}`,
      );
    }
  });

  it("rejects credentials, headers and cookies", () => {
    const secrets = [
      { headers: { authorization: "Bearer SECRET" } },
      { authorization: "Bearer SECRET" },
      { cookie: "session=SECRET" },
      { apiKey: "SECRET" },
      { token: "SECRET" },
      { accessToken: "SECRET" },
      { signature: "SECRET" },
      { providerSessionId: "SECRET" },
    ];

    for (const extra of secrets) {
      assert.equal(
        persistedEpisodeMetadataSchema.safeParse({ ...base(), ...extra }).success,
        false,
        `must reject ${JSON.stringify(extra)}`,
      );
    }
  });

  it("rejects a subtitle descriptor that carries a URL", () => {
    assert.equal(
      persistedEpisodeMetadataSchema.safeParse({
        ...base(),
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE }],
      }).success,
      false,
    );
  });

  it("rejects unknown metadata at every level", () => {
    assert.equal(
      persistedEpisodeMetadataSchema.safeParse({ ...base(), sourceId: "p10-fixture:sub:1" })
        .success,
      false,
      "unknown top-level field",
    );
    assert.equal(
      persistedEpisodeMetadataSchema.safeParse({
        ...base(),
        subtitles: [{ language: "en", providerRaw: { body: "..." } }],
      }).success,
      false,
      "unknown descriptor field",
    );
    assert.equal(
      persistedEpisodeMetadataSchema.safeParse({
        ...base(),
        intro: { start: 1, end: 2, url: SIGNED_MANIFEST },
      }).success,
      false,
      "unknown marker field",
    );
  });
});

describe("the client execution boundary", () => {
  it("rejects URL-bearing execution bodies before anything is resolved", () => {
    const injections = [
      { url: ATTACKER_URL },
      { sourceUrl: ATTACKER_URL },
      { streamUrl: ATTACKER_URL },
      { providerUrl: ATTACKER_URL },
      { manifestUrl: ATTACKER_URL },
      { headers: { authorization: "Bearer SECRET" } },
      { cookies: { session: "SECRET" } },
      { token: "SECRET" },
    ];

    for (const extra of injections) {
      assert.equal(
        playbackExecutionRequestSchema.safeParse({
          episodeId: EP_EXEC,
          sourceId: "p10-fixture:sub:1",
          ...extra,
        }).success,
        false,
        `must reject ${JSON.stringify(extra)}`,
      );
    }
  });
});

describe("cache promotion never extends an entry past redis expiry", () => {
  function fakeRedis(store: Map<string, { value: string; ttl: number }>): CacheRedisClient {
    return {
      get: async (key: string) => store.get(key)?.value ?? null,
      set: async (key: string, value: string, _mode: "EX", ttl: number) => {
        store.set(key, { value, ttl });
      },
      del: async (key: string) => {
        store.delete(key);
      },
      ttl: async (key: string) => store.get(key)?.ttl ?? -2,
      on: () => undefined,
    };
  }

  it("fails cache failures over to a miss rather than an error", async () => {
    const cache = new Cache(); // no redis attached
    assert.equal(await cache.get("missing"), undefined);
  });

  it("a redis entry expiring in one second is not promoted longer", async () => {
    // Redis holds the entry with a 1s deadline (the state a signed URL is in
    // just before it dies). The memory tier must inherit that deadline, not
    // its own 1800s discovery default.
    const store = new Map<string, { value: string; ttl: number }>();
    store.set("sources:42:1:sub", { value: JSON.stringify({ sources: ["x"] }), ttl: 1 });

    const cache = new Cache();
    cache.attachRedis(fakeRedis(store));

    assert.ok(await cache.get("sources:42:1:sub"), "first read comes from redis");

    // One second later the shared-tier deadline has passed; the entry must
    // be gone from memory too, not resurrected for another 29 minutes.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    store.delete("sources:42:1:sub");
    assert.equal(await cache.get("sources:42:1:sub"), undefined, "expired means expired");
  });
});

/* ------------------------------------------------------------------ *
 * 1. Schema integrity: migration, Drizzle model and constraints agree.
 * ------------------------------------------------------------------ */

describeDb("schema integrity", () => {
  it("the migrated columns match the documented stable-metadata shape exactly", async () => {
    const columns = await sql<
      { column_name: string; data_type: string; is_nullable: string; has_default: boolean }[]
    >`
      select column_name, data_type, is_nullable,
             (column_default is not null) as has_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'episode_playback_meta'
      order by ordinal_position`;

    assert.deepEqual(
      columns.map((column) => ({
        name: column.column_name,
        type: column.data_type,
        nullable: column.is_nullable === "YES",
        hasDefault: column.has_default,
      })),
      EXPECTED_COLUMNS,
    );
  });

  it("the primary key and cascade foreign key match the Drizzle model", async () => {
    const [pk] = await sql<{ column_name: string }[]>`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'episode_playback_meta'
        and tc.constraint_type = 'PRIMARY KEY'`;
    assert.equal(pk?.column_name, "episode_id");

    const [fk] = await sql<{ delete_rule: string }[]>`
      select delete_rule
      from information_schema.referential_constraints
      where constraint_name = 'episode_playback_meta_episode_id_episodes_id_fk'`;
    assert.equal(fk?.delete_rule, "CASCADE");

    const drizzleColumns = Object.values(getTableColumns(episodePlaybackMeta))
      .map((column) => column.name)
      .sort();
    const migratedColumns = EXPECTED_COLUMNS.map((column) => column.name).sort();
    assert.deepEqual(drizzleColumns, migratedColumns, "model and migration agree");
  });

  it("has no column capable of holding a url, credential or header", async () => {
    const forbidden =
      /url|token|cookie|header|secret|credential|signature|manifest|proxy|stream|referer/i;
    for (const column of EXPECTED_COLUMNS) {
      assert.equal(
        forbidden.test(column.name),
        false,
        `column ${column.name} looks like an ephemeral/secret carrier`,
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2-3. Stable metadata persists; sparse updates never erase it.
 * ------------------------------------------------------------------ */

describeDb("stable metadata persistence", () => {
  it("persists skip markers and subtitle descriptors, never their urls", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );

    const response = await service.get(EP_STABLE, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 1,
      language: "sub",
    });

    const row = await metaRow(EP_STABLE);
    assert.ok(row, "stable metadata is persisted");
    assert.equal(row.intro_start_seconds, 92);
    assert.equal(row.intro_end_seconds, 122);
    assert.equal(row.outro_start_seconds, 1310);
    assert.equal(row.outro_end_seconds, 1400);
    assert.equal(typeof row.source_updated_at, "number");
    assert.deepEqual(row.subtitles, [{ language: "en", kind: "subtitle" }]);

    // The response keeps the ephemeral URL -- that is the two-speed contract.
    assert.equal(response.subtitles[0]?.url, SIGNED_SUBTITLE);
    assert.deepEqual(response.intro, MARKERS.intro);
  });

  it("stored descriptors carry only language and kind", async () => {
    const row = await metaRow(EP_STABLE);
    assert.ok(row);
    for (const descriptor of row.subtitles as Array<Record<string, unknown>>) {
      assert.deepEqual(
        Object.keys(descriptor).sort(),
        ["kind", "language"],
        "no url or unknown key survives into the row",
      );
    }
  });

  it("a sparse re-derivation keeps known markers instead of nulling them", async () => {
    const seed = serviceWith(fixtureProvider({ markers: MARKERS }));
    await seed.get(EP_MERGE, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 2,
      language: "sub",
    });
    await staleRow(EP_MERGE);

    // The provider now answers "no markers": unknown stays unknown, stored stays.
    const empty = serviceWith(fixtureProvider({ markers: null }));
    await empty.get(EP_MERGE, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 2,
      language: "sub",
    });

    const row = await metaRow(EP_MERGE);
    assert.ok(row);
    assert.equal(row.intro_start_seconds, 92, "a missing derivation does not erase a marker");
    assert.equal(row.outro_start_seconds, 1310);
    assert.ok(Number(row.source_updated_at) > 0, "the freshness clock still advances");
  });

  it("a provider that stops listing a language does not erase its descriptor", async () => {
    // Start from a row that is known to hold the `en` descriptor.
    await sql`delete from episode_playback_meta where episode_id = ${EP_MERGE}`;
    const seed = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    await seed.get(EP_MERGE, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 2,
      language: "sub",
    });
    await staleRow(EP_MERGE);

    const shifted = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "ja", url: SIGNED_SUBTITLE_2, kind: "subtitle" }],
      }),
    );
    await shifted.get(EP_MERGE, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 2,
      language: "sub",
    });

    const row = await metaRow(EP_MERGE);
    assert.ok(row);
    const languages = (row.subtitles as Array<{ language: string }>)
      .map((descriptor) => descriptor.language)
      .sort();
    assert.deepEqual(languages, ["en", "ja"], "sparse output merges, never overwrites");
    assert.equal(await dbContains(TOKEN), false, "the shifted descriptor's url was not stored");
  });
});

/* ------------------------------------------------------------------ *
 * 4-5. Ephemeral playback data and secrets never persist.
 * ------------------------------------------------------------------ */

describeDb("ephemeral playback data never persists", () => {
  it("signed subtitle urls are returned to the caller but never stored", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );

    const response = await service.get(EP_EPHEMERAL, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 3,
      language: "sub",
    });

    assert.equal(response.subtitles[0]?.url, SIGNED_SUBTITLE, "the client still gets the url");
    assert.equal(await dbContains(TOKEN), false, "SECRET_TEST_TOKEN is in no table");
    assert.equal(await dbContains("m3u8"), false, "no manifest url is in any table");

    const row = await metaRow(EP_EPHEMERAL);
    assert.ok(row, "the stable part was still persisted");
    assert.equal(row.intro_start_seconds, 92);
  });

  it("a provider's signed stream url never reaches any table", async () => {
    // The fixture's resolve() publishes SIGNED_MANIFEST as playbackUrl. The
    // metadata path consumes subtitles from the same response; the stream URL
    // rides along and must still land nowhere.
    await staleRow(EP_EPHEMERAL);
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    await service.get(EP_EPHEMERAL, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 3,
      language: "sub",
    });

    assert.equal(await dbContains(SIGNED_MANIFEST), false, "the stream url is in no table");
    assert.equal(await dbContains(TOKEN), false);
  });

  it("a raw provider response smuggled onto markers is not persisted", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        extraMarkerFields: {
          rawResponse: { body: `{"token":"${TOKEN}"}`, status: 200 },
        },
      }),
    );
    await staleRow(EP_EPHEMERAL);
    await service.get(EP_EPHEMERAL, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 3,
      language: "sub",
    });

    const row = await metaRow(EP_EPHEMERAL);
    assert.ok(row);
    assert.equal(
      JSON.stringify(row).includes("rawResponse"),
      false,
      "unknown provider fields are dropped before the write",
    );
    assert.equal(await dbContains(TOKEN), false);
  });
});

describeDb("secrets never persist", () => {
  it("access_token and signature query material stays out of the database", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE_2, kind: "subtitle" }],
      }),
    );

    const response = await service.get(EP_EPHEMERAL, {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 3,
      language: "sub",
    });

    assert.ok(
      response.subtitles.some((subtitle) => subtitle.url.includes("access_token=")),
      "the client still receives the signed sidecar",
    );
    assert.equal(await dbContains("access_token="), false, "no credential query is stored");
    assert.equal(await dbContains("signature="), false);
    assert.equal(await dbContains(TOKEN), false);
  });

  it("client-supplied request secrets never reach a persisted row", async () => {
    const metadata = serviceWith(fixtureProvider({ markers: MARKERS }));
    const app = await appWith(metadata);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/episodes/${EP_CLIENT}/metadata?access_token=SECRET&url=${encodeURIComponent(ATTACKER_URL)}`,
      headers: {
        authorization: "Bearer SECRET",
        cookie: "session=SECRET",
        "x-api-key": "SECRET",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(await dbContains("Bearer SECRET"), false, "no request header is stored");
    assert.equal(await dbContains("session=SECRET"), false, "no cookie is stored");
    assert.equal(await dbContains(ATTACKER_URL), false, "no client url is stored");

    const row = await metaRow(EP_CLIENT);
    assert.ok(row, "the server still derived its own stable metadata");
    assert.equal(row.intro_start_seconds, 92, "from canonical server-side derivation only");
    await app.close();
  });
});

/* ------------------------------------------------------------------ *
 * 6-9. Execution and relay: the two runtime paths that touch ephemeral
 * URLs write nothing to PostgreSQL.
 * ------------------------------------------------------------------ */

describeDb("execution persists nothing", () => {
  it("executing a signed source leaves the whole persistence layer untouched", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));
    const before = await playbackSnapshot();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/playback/execute",
      payload: { episodeId: EP_EXEC, sourceId: "p10-fixture:sub:1" },
      headers: { authorization: "Bearer SECRET" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json().execution.url,
      SIGNED_MANIFEST,
      "P8 still delivers the url to the client",
    );

    assert.equal(await playbackSnapshot(), before, "no row was created or updated");
    assert.equal(await dbContains(TOKEN), false, "the signed url is in no table");
    assert.equal(await metaCount(EP_EXEC), 0, "execution created no metadata row");
    assert.equal(await dbContains("Bearer SECRET"), false, "no request header persisted");
    await app.close();
  });

  it("a client-supplied url is rejected and never persisted", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));
    const before = await playbackSnapshot();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/playback/execute",
      payload: {
        episodeId: EP_EXEC,
        sourceId: "p10-fixture:sub:1",
        url: ATTACKER_URL,
      },
    });

    assert.equal(response.statusCode, 400, "strict request schema refuses the url field");
    assert.equal(await playbackSnapshot(), before);
    assert.equal(await dbContains(ATTACKER_URL), false, "no client url persisted");
    await app.close();
  });

  it("a caller query parameter never steers the sources route or persistence", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));
    const before = await playbackSnapshot();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/episodes/${EP_EXEC}/sources?url=${encodeURIComponent(ATTACKER_URL)}&provider=attacker`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().plans[0].url, SIGNED_MANIFEST, "the plan url is server-owned");
    assert.equal(await playbackSnapshot(), before);
    assert.equal(await dbContains(ATTACKER_URL), false);
    await app.close();
  });
});

describeDb("relay persists nothing", () => {
  const passthroughAssert = async (rawUrl: string) => ({
    url: new URL(rawUrl),
    address: "93.184.216.34",
  });

  it("relaying a signed manifest does not persist the upstream url", async () => {
    const before = await playbackSnapshot();

    const result = await playbackGateway.fetchManifest(SIGNED_MANIFEST, {
      enabled: true,
      allowlist: ["example.test"],
      fetchImpl: (async () =>
        new Response("#EXTM3U\n#EXT-X-VERSION:3", {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        })) as typeof fetch,
      assertImpl: passthroughAssert as never,
    });

    assert.ok(result.body.startsWith("#EXTM3U"));
    assert.equal(await playbackSnapshot(), before, "the relay wrote nothing");
    assert.equal(await dbContains(TOKEN), false, "the upstream url is in no table");
  });

  it("a temporary redirect target is not persisted", async () => {
    const redirectTarget = `https://cdn.example.test/segment.ts?token=${TOKEN}`;
    const before = await playbackSnapshot();

    let hop = 0;
    const fetchImpl = (async () => {
      hop += 1;
      if (hop === 1) {
        return new Response(null, { status: 302, headers: { location: redirectTarget } });
      }
      return new Response("#EXTM3U", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    }) as typeof fetch;

    const result = await playbackGateway.fetchManifest(SIGNED_MANIFEST, {
      enabled: true,
      allowlist: ["example.test"],
      fetchImpl,
      assertImpl: passthroughAssert as never,
    });

    assert.ok(result.body.startsWith("#EXTM3U"), "the redirect chain was followed");
    assert.equal(hop, 2, "the second hop really happened");
    assert.equal(await playbackSnapshot(), before, "the relay wrote nothing");
    assert.equal(await dbContains(redirectTarget), false, "the redirect target is in no table");
    assert.equal(await dbContains(TOKEN), false);
  });

  it("the disabled relay route persists nothing", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));
    const before = await playbackSnapshot();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/playback/manifest?url=${encodeURIComponent(SIGNED_MANIFEST)}`,
    });

    assert.equal(response.statusCode, 400, "the relay is disabled by default");
    assert.equal(await playbackSnapshot(), before);
    assert.equal(await dbContains(TOKEN), false);
    await app.close();
  });
});

/* ------------------------------------------------------------------ *
 * 12-14. Restart, idempotency and concurrency.
 * ------------------------------------------------------------------ */

describeDb("restart and durability boundaries", () => {
  const request = {
    animeId: ANIME,
    anilistId: "999100",
    episodeNumber: 7,
    language: "sub" as const,
  };

  it("a restarted service re-derives only stable metadata", async () => {
    const first = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    const firstResponse = await first.get(EP_RESTART, request);
    assert.equal(firstResponse.subtitles[0]?.url, SIGNED_SUBTITLE);

    // A process restart is a brand-new service instance over the same
    // database. The ephemeral URL must rotate; the stable row must not grow.
    await staleRow(EP_RESTART);
    const second = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE_2, kind: "subtitle" }],
      }),
    );
    const secondResponse = await second.get(EP_RESTART, request);

    assert.notEqual(
      firstResponse.subtitles[0]?.url,
      secondResponse.subtitles[0]?.url,
      "ephemeral urls are re-derived per request, never remembered",
    );
    assert.equal(await dbContains(TOKEN), false, "restart did not durablise ephemeral data");

    const row = await metaRow(EP_RESTART);
    assert.ok(row);
    assert.equal(row.intro_start_seconds, 92, "stable metadata survived the restart");
    assert.deepEqual(row.subtitles, [{ language: "en", kind: "subtitle" }]);
  });

  it("an empty table yields stable-only state, not stale urls", async () => {
    await sql`delete from episode_playback_meta where episode_id = ${EP_RESTART}`;

    const fresh = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    await fresh.get(EP_RESTART, request);

    const row = await metaRow(EP_RESTART);
    assert.ok(row, "re-derivation works from a fresh database");
    assert.equal(row.intro_start_seconds, 92);
    assert.equal(await dbContains(TOKEN), false, "no previous ephemeral url reappeared");
  });
});

describeDb("idempotent and concurrent updates", () => {
  it("a second read inside the TTL does not rewrite the row", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    const request = {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 8,
      language: "sub" as const,
    };

    await service.get(EP_IDEM, request);
    const first = await metaRow(EP_IDEM);
    await service.get(EP_IDEM, request);
    const second = await metaRow(EP_IDEM);

    assert.deepEqual(second, first, "a fresh row is never rewritten");
    assert.equal(await metaCount(EP_IDEM), 1);
  });

  it("concurrent reads collapse into exactly one valid row", async () => {
    const service = serviceWith(
      fixtureProvider({
        markers: MARKERS,
        subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
      }),
    );
    const request = {
      animeId: ANIME,
      anilistId: "999100",
      episodeNumber: 9,
      language: "sub" as const,
    };

    await Promise.all([
      service.get(EP_CONCURRENT, request),
      service.get(EP_CONCURRENT, request),
      service.get(EP_CONCURRENT, request),
    ]);

    assert.equal(await metaCount(EP_CONCURRENT), 1, "upsert collapses the race");
    const row = await metaRow(EP_CONCURRENT);
    assert.ok(row);
    assert.equal(row.intro_start_seconds, 92);
    assert.deepEqual(row.subtitles, [{ language: "en", kind: "subtitle" }]);
    assert.equal(await dbContains(TOKEN), false);
  });
});

/* ------------------------------------------------------------------ *
 * 15. Nothing internal leaks through the public playback contract.
 * ------------------------------------------------------------------ */

describeDb("public API exposure", () => {
  it("the metadata route exposes exactly its documented fields", async () => {
    const app = await appWith(
      serviceWith(
        fixtureProvider({
          markers: MARKERS,
          subtitles: [{ language: "en", url: SIGNED_SUBTITLE, kind: "subtitle" }],
        }),
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/episodes/${EP_STABLE}/metadata`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      Object.keys(response.json()).sort(),
      ["episodeId", "intro", "outro", "sourceUpdatedAt", "subtitles"],
    );
    assert.equal(response.body.includes("introStartSeconds"), false, "no column names exposed");
    assert.equal(response.body.includes("episode_playback_meta"), false, "no table names exposed");
    await app.close();
  });

  it("the sources response carries no persistence internals", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/episodes/${EP_STABLE}/sources`,
    });

    assert.equal(response.statusCode, 200);
    for (const forbidden of [
      "introStartSeconds",
      "outroEndSeconds",
      "episode_playback_meta",
      "sourceUpdatedAt",
      "persisted",
    ]) {
      assert.equal(response.body.includes(forbidden), false, `leaked: ${forbidden}`);
    }
    await app.close();
  });

  it("the execute response exposes exactly the canonical execution", async () => {
    const app = await appWith(serviceWith(fixtureProvider({ markers: MARKERS })));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/playback/execute",
      payload: { episodeId: EP_EXEC, sourceId: "p10-fixture:sub:1" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(response.json()), ["execution"]);
    for (const forbidden of ["introStartSeconds", "episode_playback_meta", "sourceUpdatedAt"]) {
      assert.equal(response.body.includes(forbidden), false, `leaked: ${forbidden}`);
    }
    await app.close();
  });
});



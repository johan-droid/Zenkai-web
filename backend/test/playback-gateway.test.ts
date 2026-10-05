/**
 * Playback gateway (P6).
 *
 * `PlaybackGateway.plan()` is the whole of the P6 contract, so these tests pin the
 * properties that make it trustworthy rather than its return values alone:
 *
 *  - every access mode maps to the mechanism a client can actually use, and
 *    `embed` never becomes media;
 *  - the same source produces the same plan every time;
 *  - an unvalidated source can never be presented as playable;
 *  - the URL comes from the canonical source and nowhere else;
 *  - capabilities and subtitles are reported as unknown/absent, not invented;
 *  - and, measured rather than asserted, that planning performs zero network
 *    requests and zero provider calls.
 *
 * Every URL here is either loopback or under the RFC 2606 `.invalid` TLD. There
 * are no external streaming hosts in this suite: a test that reaches the internet
 * is slow, flaky, and quietly wrong.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";

import { PlaybackGateway, redactPlaybackUrl } from "../src/providers/streaming/gateway.js";
import { AppError } from "../src/http/errors.js";
import { cache } from "../src/cache/index.js";
import { PlaybackResolver } from "../src/modules/playback/service.js";
import type {
  AccessType,
  RankedSource,
  StreamingProvider,
} from "../src/providers/streaming/types.js";

const gateway = new PlaybackGateway();

function ranked(over: Partial<RankedSource> = {}): RankedSource {
  return {
    id: "self-hosted:sub:1",
    providerSlug: "self-hosted",
    providerName: "Self-hosted library",
    endpointSlug: "sub",
    accessType: "hls",
    playbackUrl: "https://media.invalid/ep/1.m3u8",
    language: "sub",
    priority: 1,
    validated: true,
    rank: 0.9,
    ...over,
  };
}

/** A source whose URL is `.invalid`, so nothing here opens a real connection. */
function source(access: AccessType, url: string, over: Partial<RankedSource> = {}): RankedSource {
  return ranked({ accessType: access, playbackUrl: url, ...over });
}

describe("playback plan mapping", () => {
  it("maps hls to an HLS plan without touching the manifest", () => {
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8"));

    assert.equal(plan.access, "hls", "the provider's access mode is preserved");
    assert.equal(plan.mechanism, "hls", "a manifest is played by an HLS pipeline");
    assert.equal(plan.mediaType, "application/vnd.apple.mpegurl");
    assert.equal(plan.url, "https://media.invalid/ep/1.m3u8", "the source URL is handed through");
  });

  it("maps mp4 to a progressive plan", () => {
    const plan = gateway.plan(source("mp4", "https://media.invalid/ep/1.mp4"));

    assert.equal(plan.access, "mp4");
    assert.equal(plan.mechanism, "progressive");
    assert.equal(plan.mediaType, "video/mp4");
  });

  it("maps direct to a progressive plan and keeps it distinct from embed", () => {
    const plan = gateway.plan(source("direct", "https://media.invalid/ep/1.webm"));

    assert.equal(plan.access, "direct", "direct is never reinterpreted as an embed");
    assert.equal(plan.mechanism, "progressive", "a direct file plays in a video element");
    assert.equal(plan.mediaType, "video/webm");
  });

  it("maps embed to an iframe plan, never to media", () => {
    const plan = gateway.plan(source("embed", "https://embed.invalid/watch/ep-1"));

    assert.equal(plan.access, "embed");
    assert.equal(plan.mechanism, "iframe", "an embed is a page, and must stay one");
    assert.equal(plan.mediaType, "text/html");
    assert.notEqual(plan.mechanism, "progressive", "an embed must never be offered as media");
  });

  it("keeps provider identity on the plan so a client can offer server selection", () => {
    const plan = gateway.plan(
      source("hls", "https://media.invalid/1.m3u8", {
        id: "consumet:vidstreaming:abc",
        providerSlug: "consumet",
        providerName: "Consumet",
        endpointSlug: "vidstreaming",
        quality: "1080p",
        resolution: 1080,
        language: "multi",
      }),
    );

    assert.equal(plan.sourceId, "consumet:vidstreaming:abc");
    assert.equal(plan.providerSlug, "consumet");
    assert.equal(plan.providerName, "Consumet");
    assert.equal(plan.endpointSlug, "vidstreaming", "the server choice is preserved");
    assert.equal(plan.language, "multi");
    assert.equal(plan.quality, "1080p");
    assert.equal(plan.resolution, 1080);
  });

  it("reports an unknown media type as unknown rather than guessing", () => {
    // `direct` is the one mode that does not declare what its bytes are, and an
    // unrecognised extension is not evidence of anything.
    const plan = gateway.plan(source("direct", "https://media.invalid/ep/1.bin"));
    assert.equal(plan.mediaType, null, "unknown is honest; video/mp4 would be a guess");
  });

  it("trusts the access mode over the file extension", () => {
    // A provider that says `hls` means a manifest even if the URL ends in `.mp4`.
    // Trusting the extension here is how a manifest becomes a file that never
    // plays, which is the exact failure P6 exists to prevent.
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.mp4"));

    assert.equal(plan.access, "hls");
    assert.equal(plan.mechanism, "hls");
    assert.equal(plan.mediaType, "application/vnd.apple.mpegurl");
  });

  it("refuses an access mode it cannot map rather than rounding it to direct", () => {
    for (const access of ["torrent", "rtmp", "", undefined, null]) {
      assert.throws(
        () => gateway.plan(source("hls", "https://media.invalid/1.m3u8", { accessType: access } as never)),
        AppError,
        `access mode ${String(access)} must not be mapped`,
      );
    }
  });
});

describe("plan determinism", () => {
  it("produces an identical plan for the same source every time", () => {
    const original = source("hls", "https://media.invalid/ep/1.m3u8");
    const plans = Array.from({ length: 25 }, () => gateway.plan(original));

    for (const plan of plans) {
      assert.deepEqual(plan, plans[0], "the same source must always produce the same plan");
    }
  });

  it("does not depend on the order a ranked list is supplied in", () => {
    const a = source("hls", "https://media.invalid/a.m3u8", { id: "a", rank: 0.9 });
    const b = source("mp4", "https://media.invalid/b.mp4", { id: "b", rank: 0.5 });

    const forward = gateway.planAll([a, b]).plans;
    const reversed = gateway.planAll([b, a]).plans;

    assert.deepEqual(forward[0], reversed[1], "input order must not change the mapping");
    assert.deepEqual(forward[1], reversed[0]);
  });

  it("carries no clock, so a plan has no field that could drift between calls", () => {
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8"));

    assert.equal(
      /generatedAt|createdAt|expiresAt|timestamp/i.test(JSON.stringify(plan)),
      false,
      "a timestamp would make the same source produce a different plan a second later",
    );
  });
});

describe("validation semantics", () => {
  it("carries a validated source through as playable", () => {
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8", { validated: true }));

    assert.equal(plan.validated, true);
    assert.equal(plan.playable, true);
  });

  it("never presents an unvalidated source as playable", () => {
    // P5 marks a source unvalidated when its probe failed. The gateway holds no
    // evidence of its own, so it must not upgrade that verdict because the URL
    // happens to parse: a syntactically valid URL is not a working stream.
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8", { validated: false }));

    assert.equal(plan.validated, false);
    assert.equal(plan.playable, false, "an unproven source must not be offered as playable");
  });

  it("treats an absent validation flag as unproven, not as playable", () => {
    // `validated` is optional on a source, so "not stated" must not read as "ok".
    const plan = gateway.plan(ranked({ validated: undefined }));

    assert.equal(plan.validated, false);
    assert.equal(plan.playable, false);
  });
});

describe("plan immutability", () => {
  it("does not mutate the canonical source", () => {
    const original = ranked({ subtitles: [{ language: "en", url: "https://media.invalid/en.vtt" }] });
    const snapshot = structuredClone(original);

    gateway.plan(original);

    assert.deepEqual(original, snapshot, "P5's ranked list must survive planning unchanged");
  });

  it("returns a new object rather than handing the source back", () => {
    const original = ranked();
    const plan = gateway.plan(original);

    assert.notEqual(plan as unknown as object, original as unknown as object);
    assert.equal((plan as unknown as { playbackUrl?: string }).playbackUrl, undefined);
  });

  it("copies subtitle tracks instead of sharing the array", () => {
    const original = ranked({ subtitles: [{ language: "en", url: "https://media.invalid/en.vtt" }] });
    const plan = gateway.plan(original);

    plan.subtitles?.push({ language: "fr", url: "https://media.invalid/fr.vtt" });

    assert.equal(original.subtitles?.length, 1, "a client must not mutate the source via a plan");
  });

  it("plans a frozen source without complaint", () => {
    assert.doesNotThrow(() => gateway.plan(Object.freeze(ranked())));
  });
});

describe("nothing is fabricated", () => {
  it("reports capabilities as unknown rather than true", () => {
    const plan = gateway.plan(source("mp4", "https://media.invalid/ep/1.mp4"));

    assert.equal(plan.capabilities.seekable, null, "no provider declares seeking support");
    assert.equal(plan.capabilities.ranged, null, "a file extension is not range evidence");
  });

  it("omits subtitles entirely when the provider published none", () => {
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8"));
    assert.equal(plan.subtitles, undefined, "absent, not an invented empty track list");
  });

  it("transports only the subtitles the provider attached to that source", () => {
    const plan = gateway.plan(
      source("hls", "https://media.invalid/ep/1.m3u8", {
        subtitles: [{ language: "en", url: "https://media.invalid/en.vtt", kind: "captions" }],
      }),
    );

    assert.deepEqual(plan.subtitles, [
      { language: "en", url: "https://media.invalid/en.vtt", kind: "captions" },
    ]);
  });

  it("preserves multi-audio as a language, not as an invented track list", () => {
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8", { language: "multi" }));

    assert.equal(plan.language, "multi");
    assert.equal((plan as unknown as { audioTracks?: unknown }).audioTracks, undefined);
  });
});

describe("url and header security", () => {
  it("takes its URL from the source and offers no way to override it", () => {
    // There is no parameter on `plan()` a caller could use to substitute a URL,
    // which is the structural reason a request-supplied `?url=` cannot become a
    // playback URL here. This pins it: the plan's URL is the source's URL.
    const plan = gateway.plan(source("hls", "https://media.invalid/ep/1.m3u8"));

    assert.equal(plan.url, "https://media.invalid/ep/1.m3u8");
    assert.notEqual(plan.url, "https://attacker.example/evil.m3u8");
  });

  it("refuses a playback url that is not http(s)", () => {
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://media.invalid/1.m3u8",
    ]) {
      assert.throws(() => gateway.plan(source("hls", url)), AppError, `${url} must be refused`);
    }
  });

  it("refuses credentials embedded in a playback url", () => {
    // A credential in the URL would be handed to a browser inside the plan.
    assert.throws(() => gateway.plan(source("hls", "https://user:pass@media.invalid/1.m3u8")), AppError);
  });

  it("refuses an unparseable playback url", () => {
    assert.throws(() => gateway.plan(source("hls", "not a url")), AppError);
  });

  it("refuses an embed with no page to frame", () => {
    assert.throws(() => gateway.plan(source("embed", "https://embed.invalid")), AppError);
  });

  it("never forwards provider credentials or arbitrary headers to the browser", () => {
    // A provider is untrusted input. Even if one attaches a header bag full of
    // credentials, the plan must carry none of it: a browser cannot use an
    // `Authorization` we handed it, and we must not offer it anyway.
    const withHeaders = source("hls", "https://media.invalid/ep/1.m3u8", {
      headers: {
        Authorization: "Bearer provider-api-key",
        Cookie: "session=secret",
        "X-Api-Key": "key-123",
        Referer: "https://embed.invalid/",
      },
    } as Partial<RankedSource>);

    const plan = gateway.plan(withHeaders);
    const serialised = JSON.stringify(plan);

    assert.equal(serialised.includes("Authorization"), false);
    assert.equal(serialised.includes("Bearer"), false);
    assert.equal(serialised.includes("Cookie"), false);
    assert.equal(serialised.includes("session=secret"), false);
    assert.equal(serialised.includes("X-Api-Key"), false);
    assert.equal("headers" in plan, false, "no header bag is exposed at all");
  });

  it("redacts signed query parameters before a url reaches a log", () => {
    const signed =
      "https://media.invalid/ep/1.m3u8?token=eyJhbGciOi.SECRET.SIG&expires=1893456000&cdn=fastly";
    const redacted = redactPlaybackUrl(signed);

    assert.equal(redacted.includes("SECRET"), false, "a signed token must never be logged");
    assert.equal(redacted.includes("1893456000"), false, "expiry is part of the signature");
    assert.ok(redacted.includes("media.invalid"), "host and path stay, so the log is still useful");
  });

  it("redacts a parameter whose name nobody has seen before", () => {
    // A signature under an unknown name is still a signature, so every value goes.
    assert.equal(redactPlaybackUrl("https://media.invalid/1.m3u8?weirdparam=leaked").includes("leaked"), false);
  });

  it("leaves a url with no query string alone", () => {
    assert.equal(
      redactPlaybackUrl("https://media.invalid/ep/1.m3u8"),
      "https://media.invalid/ep/1.m3u8",
    );
  });
});

describe("planning performs no network work", () => {
  /**
   * A loopback server counting its own hits, so "the gateway did not probe" is a
   * measurement rather than a claim. Planning is a pure mapping and must leave the
   * request counter exactly where P5's validation left it.
   */
  let server: Server;
  let url: string;
  let hits = 0;

  before(async () => {
    server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
      res.end("#EXTM3U\n");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    url = `http://127.0.0.1:${port}/stream.m3u8`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    hits = 0;
  });

  it("issues zero requests while planning a validated source", () => {
    const original = source("hls", url, { validated: true });
    assert.equal(hits, 0, "the fixture has not been contacted yet");

    const plan = gateway.plan(original);

    assert.equal(hits, 0, "planning must not re-probe the URL P5 already probed");
    assert.equal(plan.playable, true, "and it still reflects P5's validation verdict");
  });

  it("issues zero requests for a whole ranked list", () => {
    const list = [
      source("hls", url, { id: "a", validated: true }),
      source("mp4", `${url}?v=mp4`, { id: "b", validated: false }),
      source("embed", "https://embed.invalid/watch/1", { id: "c", validated: false }),
    ];

    const { plans } = gateway.planAll(list);

    assert.equal(plans.length, 3);
    assert.equal(hits, 0, "planning N sources must cost N * zero requests");
  });

  it("costs nothing measurable next to the resolution that produced the source", () => {
    // The point of the phase: mapping is orders of magnitude cheaper than the
    // discovery it follows. A gateway that re-probed would not be.
    const list = Array.from({ length: 50 }, (_, index) =>
      source("hls", `${url}?n=${index}`, { id: `s${index}`, validated: true }),
    );

    const started = process.hrtime.bigint();
    gateway.planAll(list);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(hits, 0, "still zero network work");
    assert.ok(elapsedMs < 50, `mapping 50 sources took ${elapsedMs.toFixed(2)}ms`);
  });
});

describe("the gateway is not a resolver", () => {
  const CAPS = {
    languages: ["sub" as const],
    accessTypes: ["hls" as const],
    supportsSubtitles: false,
    supportsSkipMarkers: false,
    requiresMalId: false,
  };

  /**
   * A provider that counts every call it receives.
   *
   * P0's finding was that the gateway re-ran the resolver's job. The measurement
   * is the honest one: drive a real resolution, freeze the provider call counts,
   * then plan the results and require those counts not to move.
   */
  function countingProvider(calls: { resolve: number; healthCheck: number }): StreamingProvider {
    return {
      slug: "counting",
      name: "Counting",
      kind: "api",
      basePriority: 10,
      version: "1.0.0",
      enabled: true,
      capabilities: CAPS,
      async resolve() {
        calls.resolve += 1;
        return [source("hls", "https://counting.invalid/1.m3u8")];
      },
      async healthCheck() {
        calls.healthCheck += 1;
        return true;
      },
    };
  }

  beforeEach(() => {
    cache.clear();
  });

  it("makes zero provider-resolution calls while planning", async () => {
    const calls = { resolve: 0, healthCheck: 0 };
    const resolver = new PlaybackResolver([countingProvider(calls)]);

    const result = await resolver.resolve({
      animeId: "local-1",
      anilistId: "iso-1",
      episodeNumber: 1,
      language: "sub",
    });

    assert.equal(result.sources.length, 1, "the fixture produced one source to plan");
    const afterResolution = { ...calls };
    assert.ok(afterResolution.resolve > 0, "the resolver did call the provider once");

    const { plans } = gateway.planAll(result.sources);

    assert.equal(plans.length, 1);
    assert.deepEqual(
      calls,
      afterResolution,
      "planning must not call a provider, re-resolve, or re-probe",
    );
  });

  it("plans a source handed to it directly, with no resolver in the call path", () => {
    // The gateway's only input is a source. It never reaches for a provider list,
    // so a provider can be added, removed or swapped without touching it.
    const plan = gateway.plan(source("hls", "https://media.invalid/1.m3u8"));
    assert.equal(plan.mechanism, "hls");
    assert.equal(plan.providerSlug, "self-hosted");
  });
});

describe("planAll", () => {
  it("keeps P5's ranking order rather than re-ranking", () => {
    // Ranking is P5's job and its weights were tuned there. A gateway that
    // reordered sources would silently change which server a viewer gets.
    const embedFirst = source("embed", "https://embed.invalid/watch/1", { id: "e", rank: 0.9 });
    const hlsSecond = source("hls", "https://media.invalid/1.m3u8", { id: "h", rank: 0.4 });

    const { plans } = gateway.planAll([embedFirst, hlsSecond]);

    assert.equal(plans[0]?.sourceId, "e", "the caller's order is the order");
    assert.equal(plans[1]?.sourceId, "h");
  });

  it("drops an unmappable source instead of faking a plan for it", () => {
    const good = source("hls", "https://media.invalid/1.m3u8", { id: "good" });
    const broken = source("hls", "not-a-url", { id: "broken" });

    const { plans, unmapped } = gateway.planAll([broken, good]);

    assert.equal(unmapped, 1);
    assert.equal(plans.length, 1, "one bad provider must not invalidate a good source");
    assert.equal(plans[0]?.sourceId, "good");
  });

  it("plans an empty list to an empty list", () => {
    assert.deepEqual(gateway.planAll([]), { plans: [], unmapped: 0 });
  });
});

describe("gateway counters", () => {
  it("counts plans and refusals on the existing observability surface", () => {
    const fresh = new PlaybackGateway();
    assert.deepEqual(fresh.stats(), { planned: 0, unmapped: 0 });

    fresh.plan(source("hls", "https://media.invalid/1.m3u8"));
    fresh.planAll([source("hls", "nope", { id: "b" })]);

    assert.deepEqual(fresh.stats(), { planned: 1, unmapped: 1 });
  });
});

describe("provider isolation is structural", () => {
  /**
   * Reads the gateway source rather than its behaviour.
   *
   * A behavioural test can only catch the gateway calling the providers it knows
   * about, and the gateway is not supposed to know about any. The import graph is
   * therefore the one place where "the gateway is not a resolver" can be stated
   * completely: if it imports the registry, the resolver, or an adapter, it can
   * re-resolve no matter what it currently does with them.
   */
  it("imports no resolver, registry or provider adapter", async () => {
    const source = await readFile(new URL("../src/providers/streaming/gateway.ts", import.meta.url), "utf8");

    const forbidden = [
      "registry.js",
      "../modules/playback/service",
      "./template.provider",
      "./consumet.provider",
      "./inprocess.provider",
      "./health.js",
      "./ranking.js",
      "../../http/client.js",
    ];

    for (const specifier of forbidden) {
      assert.equal(
        source.includes(specifier),
        false,
        `gateway must not import ${specifier}: planning is not resolution`,
      );
    }
  });

  it("issues no probe, so it cannot import the probing client", () => {
    // `probeUrl` is the resolver's instrument. Its absence here is the P6 boundary
    // in one line: validation happens once, in P5, and the gateway trusts it.
    return readFile(new URL("../src/providers/streaming/gateway.ts", import.meta.url), "utf8").then(
      (source) => {
        assert.equal(source.includes("probeUrl"), false);
        assert.equal(source.includes("fetchJson"), false);
      },
    );
  });
});

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  reportPlaybackIssue,
  playbackSourcesResponseSchema,
  audioTrackDetailSchema,
  type PlaybackIssueInput,
} from "../src/lib/api/zenkai.js";

describe("Frontend Playback Issues & Audio Tracks Contract Suite", () => {
  let originalFetch: typeof globalThis.fetch;
  let requests: Array<{ url: string; method: string; body: unknown }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requests = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;

      requests.push({ url, method, body });

      if (url.includes("/api/v1/playback/issues")) {
        return new Response(
          JSON.stringify({
            success: true,
            reportId: "report-uuid-1234",
            message: "Playback issue report submitted successfully.",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits playback issue report with verified payload", async () => {
    const input: PlaybackIssueInput = {
      episodeId: "ep-21-1",
      animeId: "21",
      providerSlug: "zenkai-api",
      issueCategory: "audio_desync",
      playbackTimestampSeconds: 120,
      audioLanguage: "sub",
      userDescription: "Audio lags behind video by 2 seconds",
    };

    const res = await reportPlaybackIssue(input);
    assert.equal(res.success, true);
    assert.equal(res.reportId, "report-uuid-1234");

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "POST");
    assert.deepEqual(requests[0]?.body, input);
  });

  it("validates audioTrackDetailSchema with BCP-47 identifiers", () => {
    const parsed = audioTrackDetailSchema.parse({
      code: "ja",
      name: "Japanese",
      type: "sub",
      isDefault: true,
    });

    assert.equal(parsed.code, "ja");
    assert.equal(parsed.name, "Japanese");
    assert.equal(parsed.type, "sub");
    assert.equal(parsed.isDefault, true);
  });

  it("validates availableAudioLanguages in playbackSourcesResponseSchema", () => {
    const mockPayload = {
      episode: {
        id: "ep-1",
        episodeNumber: 1,
        title: "I'm Luffy!",
      },
      sources: [
        {
          id: "src-1",
          providerSlug: "zenkai-api",
          providerName: "Zenkai MegaPlay",
          endpointSlug: "megaplay-sub",
          accessType: "hls",
          playbackUrl: "https://fetch.nexabloom.top/anime/master.m3u8",
          language: "sub",
          audioTracks: [
            { code: "ja", name: "Japanese", type: "sub", isDefault: true },
          ],
          priority: 12,
          rank: 0.95,
        },
      ],
      sourceCount: 1,
      plans: [
        {
          sourceId: "src-1",
          providerSlug: "zenkai-api",
          providerName: "Zenkai MegaPlay",
          endpointSlug: "megaplay-sub",
          access: "hls",
          mechanism: "hls",
          mediaType: "application/vnd.apple.mpegurl",
          url: "https://fetch.nexabloom.top/anime/master.m3u8",
          delivery: "client",
          language: "sub",
          audioTracks: [
            { code: "ja", name: "Japanese", type: "sub", isDefault: true },
          ],
          validated: true,
          playable: true,
          capabilities: { seekable: null, ranged: null },
        },
      ],
      planCount: 1,
      availableAudioLanguages: [
        { code: "ja", name: "Japanese", type: "sub", isDefault: true },
        { code: "en", name: "English", type: "dub", isDefault: false },
      ],
      attempts: [],
      skipped: [],
      resolutionTimeMs: 45,
    };

    const parsed = playbackSourcesResponseSchema.parse(mockPayload);
    assert.equal(parsed.availableAudioLanguages?.length, 2);
    assert.equal(parsed.availableAudioLanguages?.[0]?.code, "ja");
    assert.equal(parsed.availableAudioLanguages?.[1]?.code, "en");
  });
});

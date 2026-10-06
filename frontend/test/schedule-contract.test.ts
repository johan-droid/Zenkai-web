/**
 * Stage 4 Schedule Migration & Contract test.
 *
 * Verifies that schedule response schemas accept ISO date strings from JSON
 * and convert them to Date objects, ensuring fetchScheduleWeek() succeeds
 * against canonical JSON payloads.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scheduleEntrySchema, scheduleWeekSchema } from "../src/lib/api/zenkai.js";

describe("Stage 4 — Schedule Contract", () => {
  it("parses JSON schedule entry with string dates correctly", () => {
    const jsonPayload = {
      scheduleId: "sched-1",
      episodeNumber: 12,
      airingAt: "2026-10-06T15:00:00.000Z",
      airingState: "upcoming",
      providerStatus: "RELEASING",
      source: "anilist",
      secondsUntil: 3600,
      animeId: "anime-123",
      anilistId: "1001",
      title: "Jujutsu Kaisen",
      coverUrl: "https://s4.anilist.co/cover.jpg",
      totalEpisodes: 24,
      slug: "jujutsu-kaisen-1001",
    };

    const parsed = scheduleEntrySchema.parse(jsonPayload);
    assert.ok(parsed.airingAt instanceof Date);
    assert.equal(parsed.airingAt.toISOString(), "2026-10-06T15:00:00.000Z");
  });

  it("parses schedule week payload from JSON", () => {
    const weekPayload = {
      from: "2026-10-05T00:00:00.000Z",
      to: "2026-10-12T00:00:00.000Z",
      timeZone: "UTC",
      days: [
        {
          date: "2026-10-06",
          dayOfWeek: "Tuesday",
          entries: [
            {
              scheduleId: "sched-1",
              episodeNumber: 1,
              airingAt: "2026-10-06T18:00:00.000Z",
              airingState: "aired",
              providerStatus: "FINISHED",
              source: "anilist",
              secondsUntil: -3600,
              animeId: "anime-1",
              anilistId: "2002",
              title: "Chainsaw Man",
              coverUrl: null,
              totalEpisodes: 12,
              slug: "chainsaw-man-2002",
            },
          ],
        },
      ],
    };

    const parsed = scheduleWeekSchema.parse(weekPayload);
    assert.equal(parsed.days.length, 1);
    assert.ok(parsed.days[0].entries[0].airingAt instanceof Date);
  });
});

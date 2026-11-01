/**
 * Stage 4 Schedule Migration & Contract test.
 *
 * Verifies that schedule response schemas accept ISO date strings from JSON
 * and convert them to Date objects, ensuring fetchScheduleWeek() succeeds
 * against canonical JSON payloads.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scheduleEntrySchema,
  scheduleWeekSchema,
  scheduleSeasonSchema,
  scheduleNextSchema,
  scheduleTodaySchema,
} from "../src/lib/api/zenkai.js";
import {
  formatCountdown,
  getRelativeTimeDescription,
  getUIAiringState,
  seasonWindow,
  localDateKey,
} from "../src/hooks/use-schedule.js";

describe("Stage 4 — Schedule Contract", () => {
  const sampleEntry = {
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

  it("parses JSON schedule entry with string dates correctly", () => {
    const parsed = scheduleEntrySchema.parse(sampleEntry);
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
          entries: [sampleEntry],
        },
      ],
    };

    const parsed = scheduleWeekSchema.parse(weekPayload);
    assert.equal(parsed.days.length, 1);
    assert.ok(parsed.days[0].entries[0].airingAt instanceof Date);
  });

  it("parses schedule season payload from JSON with season and year", () => {
    const seasonPayload = {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-12-01T00:00:00.000Z",
      timeZone: "UTC",
      season: "Fall",
      year: 2026,
      days: [
        {
          date: "2026-10-06",
          dayOfWeek: "Tuesday",
          entries: [sampleEntry],
        },
      ],
    };

    const parsed = scheduleSeasonSchema.parse(seasonPayload);
    assert.equal(parsed.season, "Fall");
    assert.equal(parsed.year, 2026);
    assert.equal(parsed.days.length, 1);
  });

  it("parses schedule next payload from JSON", () => {
    const nextPayload = {
      item: sampleEntry,
      timeZone: "Asia/Tokyo",
    };

    const parsed = scheduleNextSchema.parse(nextPayload);
    assert.ok(parsed.item);
    assert.equal(parsed.item.title, "Jujutsu Kaisen");
    assert.equal(parsed.timeZone, "Asia/Tokyo");

    // Null item when no upcoming episodes exist
    const emptyNext = scheduleNextSchema.parse({ item: null, timeZone: "UTC" });
    assert.equal(emptyNext.item, null);
  });

  it("parses schedule today payload from JSON", () => {
    const todayPayload = {
      date: "2026-10-06",
      timeZone: "UTC",
      items: [sampleEntry],
    };

    const parsed = scheduleTodaySchema.parse(todayPayload);
    assert.equal(parsed.date, "2026-10-06");
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].episodeNumber, 12);
  });
});

describe("Schedule Helpers & Timezone Arithmetic", () => {
  it("formats countdowns correctly", () => {
    assert.equal(formatCountdown(-10), null);
    assert.equal(formatCountdown(30), "30s");
    assert.equal(formatCountdown(150), "2m 30s");
    assert.equal(formatCountdown(3665), "1h 1m");
    assert.equal(formatCountdown(86400), "Tomorrow");
    assert.equal(formatCountdown(86400 * 3), "In 3 days");
  });

  it("computes UI airing states accurately", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    assert.equal(getUIAiringState(new Date("2026-10-06T11:00:00Z"), now), "aired");
    assert.equal(getUIAiringState(new Date("2026-10-06T12:20:00Z"), now), "airing-soon");
    assert.equal(getUIAiringState(new Date("2026-10-06T18:00:00Z"), now), "today");
    assert.equal(getUIAiringState(new Date("2026-10-07T14:00:00Z"), now), "tomorrow");
    assert.equal(getUIAiringState(new Date("2026-10-15T12:00:00Z"), now), "upcoming");
  });

  it("calculates Winter season boundary spanning years", () => {
    const win = seasonWindow(new Date("2026-12-15T12:00:00Z"), "UTC");
    assert.equal(win.season, "Winter");
    assert.equal(win.year, 2027);
    assert.equal(win.from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(win.to.toISOString(), "2027-03-01T00:00:00.000Z");

    const jan = seasonWindow(new Date("2027-01-10T12:00:00Z"), "UTC");
    assert.equal(jan.season, "Winter");
    assert.equal(jan.year, 2027);
    assert.equal(jan.from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(jan.to.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("formats localDateKey consistently in given timeZone", () => {
    const instant = new Date("2026-10-05T23:30:00Z");
    assert.equal(localDateKey(instant, "UTC"), "2026-10-05");
    assert.equal(localDateKey(instant, "Asia/Tokyo"), "2026-10-06");
  });
});

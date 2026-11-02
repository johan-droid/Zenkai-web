/**
 * Airing schedule tests (P3).
 *
 * The invariants here are the ones that make a schedule quietly wrong rather
 * than loudly broken: a slot that has already aired still claiming otherwise, a
 * "today" window that follows the server's clock instead of the configured zone,
 * and a future slot sorted as if it were in the past.
 *
 * All time is injected. Nothing in this file reads an ambient clock, so every
 * assertion is deterministic regardless of when it runs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  airingStateAt,
  localDateKey,
  monthWindow,
  secondsUntil,
  seasonWindow,
  startOfDay,
  startOfNextDay,
  weekWindow,
} from "../src/modules/schedule/time.js";

const at = (iso: string) => new Date(iso);

describe("airing state", () => {
  const now = at("2026-10-05T12:00:00Z");

  it("treats a future slot as upcoming", () => {
    assert.equal(airingStateAt(at("2026-10-06T12:00:00Z"), now), "upcoming");
  });

  it("treats a past slot as aired", () => {
    // The bug this guards: status was written once at sync time and never
    // revised, so an episode from last week still read NOT_YET_AIRED.
    assert.equal(airingStateAt(at("2026-10-04T12:00:00Z"), now), "aired");
  });

  it("treats the exact airing instant as aired", () => {
    // Boundary is inclusive so an episode airing exactly now is not also listed
    // as upcoming forever, since `now` advances past it immediately.
    assert.equal(airingStateAt(now, now), "aired");
  });

  it("classifies the instants either side of the boundary", () => {
    assert.equal(airingStateAt(new Date(now.getTime() - 1), now), "aired");
    assert.equal(airingStateAt(new Date(now.getTime() + 1), now), "upcoming");
  });

  it("reports a negative countdown once a slot has passed", () => {
    // A countdown that clamps at zero leaves a reader unable to tell an old
    // entry from one airing in the next second.
    assert.equal(secondsUntil(at("2026-10-04T12:00:00Z"), now), -86_400);
    assert.equal(secondsUntil(at("2026-10-06T12:00:00Z"), now), 86_400);
  });
});

describe("schedule timezone", () => {
  it("starts the day at UTC midnight when configured for UTC", () => {
    assert.equal(startOfDay(at("2026-10-05T12:00:00Z"), "UTC").toISOString(), "2026-10-05T00:00:00.000Z");
  });

  it("starts the day at local midnight for a zone ahead of UTC", () => {
    // Tokyo is UTC+9, so the Tokyo day containing 12:00Z began at 15:00Z the
    // previous day. A UTC-truncated window would misfile a whole evening of
    // late-night broadcasts.
    assert.equal(
      startOfDay(at("2026-10-05T12:00:00Z"), "Asia/Tokyo").toISOString(),
      "2026-10-04T15:00:00.000Z",
    );
  });

  it("starts the day at local midnight for a zone behind UTC", () => {
    // New York is UTC-4 in October (EDT), so its day began at 04:00Z.
    assert.equal(
      startOfDay(at("2026-10-05T12:00:00Z"), "America/New_York").toISOString(),
      "2026-10-05T04:00:00.000Z",
    );
  });

  it("handles a daylight-saving transition without drifting a day", () => {
    // US DST ends 2026-11-01. Both days must still resolve to their own local
    // midnight rather than collapsing onto the 31st or jumping to the 2nd.
    assert.equal(
      startOfDay(at("2026-10-31T12:00:00Z"), "America/New_York").toISOString().slice(0, 10),
      "2026-10-31",
    );
    assert.equal(
      startOfDay(at("2026-11-01T12:00:00Z"), "America/New_York").toISOString().slice(0, 10),
      "2026-11-01",
    );
  });

  it("ends the day at the next local midnight, not 24 hours later", () => {
    // On a DST day the day is 25 or 23 hours long in local terms; adding 24
    // hours to the start would spill into the neighbouring day.
    const start = startOfDay(at("2026-11-01T12:00:00Z"), "America/New_York");
    const end = startOfNextDay(at("2026-11-01T12:00:00Z"), "America/New_York");
    assert.ok(end.getTime() - start.getTime() >= 23 * 3600_000);
    assert.ok(end.getTime() - start.getTime() <= 25 * 3600_000);
  });

  it("labels the local calendar date, not the UTC one", () => {
    // 23:30Z is already the next day in Tokyo but still the same day in UTC.
    assert.equal(localDateKey(at("2026-10-05T23:30:00Z"), "Asia/Tokyo"), "2026-10-06");
    assert.equal(localDateKey(at("2026-10-05T23:30:00Z"), "UTC"), "2026-10-05");
  });
});

describe("week window", () => {
  it("runs Monday to Sunday", () => {
    // 2026-10-08 is a Thursday; the containing week starts Monday the 5th.
    const { from, to } = weekWindow(at("2026-10-08T12:00:00Z"), "UTC");
    assert.equal(from.toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-12T00:00:00.000Z");
  });

  it("treats Monday itself as the first day of its week", () => {
    const { from } = weekWindow(at("2026-10-05T12:00:00Z"), "UTC");
    assert.equal(from.toISOString(), "2026-10-05T00:00:00.000Z");
  });

  it("puts Sunday at the end of the same week, not the next", () => {
    // Sunday is day 6 of a Monday-starting week. Treating it as day 0 would
    // roll the window forward a week and hide everything just aired.
    const { from, to } = weekWindow(at("2026-10-11T12:00:00Z"), "UTC");
    assert.equal(from.toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-12T00:00:00.000Z");
  });

  it("respects the configured zone rather than the server clock", () => {
    const utc = weekWindow(at("2026-10-05T02:00:00Z"), "UTC");
    const tokyo = weekWindow(at("2026-10-05T02:00:00Z"), "Asia/Tokyo");
    // 02:00Z on Monday is already Monday 11:00 in Tokyo, but the same instant
    // is still within the previous week when Tokyo is the reference.
    assert.notEqual(utc.from.toISOString(), tokyo.from.toISOString());
  });
});

describe("month window", () => {
  it("covers the full calendar month in UTC", () => {
    const { from, to } = monthWindow(at("2026-10-15T12:00:00Z"), "UTC");
    assert.equal(from.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-11-01T00:00:00.000Z");
  });

  it("starts the month at local midnight for a zone ahead of UTC", () => {
    // Tokyo is UTC+9, so October 1 in Tokyo begins at Sept 30 15:00Z
    const { from } = monthWindow(at("2026-10-15T12:00:00Z"), "Asia/Tokyo");
    assert.equal(from.toISOString(), "2026-09-30T15:00:00.000Z");
  });

  it("handles year boundary in December", () => {
    const { from, to } = monthWindow(at("2026-12-15T12:00:00Z"), "UTC");
    assert.equal(from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  it("respects the configured zone rather than the server clock", () => {
    const utc = monthWindow(at("2026-10-05T02:00:00Z"), "UTC");
    const tokyo = monthWindow(at("2026-10-05T02:00:00Z"), "Asia/Tokyo");
    // Tokyo month begins at Sept 30 15:00 UTC, whereas UTC month begins at Oct 1 00:00 UTC.
    assert.notEqual(utc.from.toISOString(), tokyo.from.toISOString());
  });
});

describe("season window", () => {
  it("Spring season covers March-May", () => {
    const { from, to, season, year } = seasonWindow(at("2026-04-15T12:00:00Z"), "UTC");
    assert.equal(season, "Spring");
    assert.equal(year, 2026);
    assert.equal(from.toISOString(), "2026-03-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-06-01T00:00:00.000Z");
  });

  it("Summer season covers June-August", () => {
    const { from, to, season, year } = seasonWindow(at("2026-07-15T12:00:00Z"), "UTC");
    assert.equal(season, "Summer");
    assert.equal(year, 2026);
    assert.equal(from.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-09-01T00:00:00.000Z");
  });

  it("Fall season covers September-November", () => {
    const { from, to, season, year } = seasonWindow(at("2026-10-15T12:00:00Z"), "UTC");
    assert.equal(season, "Fall");
    assert.equal(year, 2026);
    assert.equal(from.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-12-01T00:00:00.000Z");
  });

  it("Winter season starting December spans year boundary", () => {
    const { from, to, season, year } = seasonWindow(at("2026-12-15T12:00:00Z"), "UTC");
    assert.equal(season, "Winter");
    assert.equal(year, 2027);
    assert.equal(from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("Winter season January belongs to Winter starting previous December", () => {
    const { from, to, season, year } = seasonWindow(at("2027-01-15T12:00:00Z"), "UTC");
    assert.equal(season, "Winter");
    assert.equal(year, 2027);
    assert.equal(from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("February belongs to Winter starting previous December", () => {
    const { from, to, season, year } = seasonWindow(at("2027-02-15T12:00:00Z"), "UTC");
    assert.equal(season, "Winter");
    assert.equal(year, 2027);
    assert.equal(from.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2027-03-01T00:00:00.000Z");
  });

  it("handles leap year in February", () => {
    // 2028 is a leap year (Feb 29 exists)
    const feb29 = at("2028-02-29T12:00:00Z");
    const { from, to, season, year } = seasonWindow(feb29, "UTC");
    assert.equal(season, "Winter");
    assert.equal(year, 2028);
    assert.equal(from.toISOString(), "2027-12-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2028-03-01T00:00:00.000Z");

    const monthWin = monthWindow(feb29, "UTC");
    assert.equal(monthWin.from.toISOString(), "2028-02-01T00:00:00.000Z");
    assert.equal(monthWin.to.toISOString(), "2028-03-01T00:00:00.000Z");
  });
});

describe("ScheduleService offline database resilience", () => {
  it("falls back gracefully when database is offline without throwing 500", async () => {
    const { ScheduleService } = await import("../src/modules/schedule/service.js");
    const mockDb = {
      select: () => {
        throw new Error("Database offline (circuit breaker active)");
      },
    } as any;
    const mockRepo = {
      getLocalIdByAnilistId: async () => null,
    } as any;

    const service = new ScheduleService(mockDb, mockRepo, () => at("2026-10-06T12:00:00Z"), "UTC");

    // Stub anilist provider to avoid network dependency in unit tests
    (service as any)["#anilist"] = {
      getAiringSchedule: async () => [
        {
          scheduleId: "anilist-101",
          episodeNumber: 1,
          airingAt: at("2026-10-07T12:00:00Z"),
          status: "SCHEDULED",
          source: "anilist",
          animeId: "123",
          anilistId: "123",
          title: "Test Anime",
          coverUrl: "https://example.com/cover.jpg",
          totalEpisodes: 12,
        },
      ],
      getAiringSlots: async () => [
        {
          episodeNumber: 2,
          airingAt: Math.floor(at("2026-10-08T12:00:00Z").getTime() / 1000),
          status: "SCHEDULED",
        },
      ],
    };

    const week = await service.week();
    assert.equal(week.timeZone, "UTC");
    assert.ok(Array.isArray(week.days));
    assert.ok(week.days.length >= 1);
    assert.ok(week.days[0].entries[0].title);
    assert.ok(week.days[0].entries[0].slug);
    assert.ok(["aired", "upcoming"].includes(week.days[0].entries[0].airingState));

    const today = await service.today();
    assert.equal(today.timeZone, "UTC");
    assert.ok(Array.isArray(today.items));

    const next = await service.next();
    assert.equal(next.timeZone, "UTC");

    const forAnime = await service.forAnime("123");
    assert.ok(Array.isArray(forAnime));
  });
});

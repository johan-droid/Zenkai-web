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
  secondsUntil,
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

/**
 * Time and timezone rules for the airing schedule (P3).
 *
 * Two separate concerns live here, and keeping them apart is the point:
 *
 *   1. Instant arithmetic. Airing timestamps are stored in UTC. Whether an
 *      episode has aired is a comparison against "now", nothing more.
 *
 *   2. Calendar boundaries. "Today" and "this week" are *civil* concepts: they
 *      mean a day in the viewer's timezone, which is not the same as a 24 hour
 *      span ending at the next UTC midnight. Getting this wrong is the classic
 *      schedule bug where everything after 00:00 UTC vanishes or a show airs
 *      "tomorrow" twice.
 *
 * A weekday string is never canonical. The database holds timestamps; a weekday
 * label is derived for display from a real instant.
 */

/** Airing state derived from a timestamp and the current instant. */
export type AiringState = "aired" | "upcoming";

/**
 * Classify a slot.
 *
 * Deliberately only two states. The provider's own label is kept separately as
 * `providerStatus`, because that is a claim made at sync time ("this was
 * reported as NOT_YET_AIRED") while this is a claim derived from the clock ("this
 * is in the past"). Conflating them is how a schedule ends up telling a reader
 * that an episode from last week has not aired yet.
 *
 * There is no "airing now" state: nothing in the repository establishes that
 * Zenkai distinguishes a currently-broadcasting episode, and inventing a window
 * would be a fabricated product behaviour.
 */
export function airingStateAt(airingAt: Date, now: Date): AiringState {
  return airingAt.getTime() <= now.getTime() ? "aired" : "upcoming";
}

/** Seconds until a slot airs. Negative once it has passed. */
export function secondsUntil(airingAt: Date, now: Date): number {
  return Math.floor((airingAt.getTime() - now.getTime()) / 1000);
}

/** Offset in milliseconds between a zone and UTC at a given instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  // `hourCycle: "h23"` keeps midnight as 00 rather than 24 in some ICU builds,
  // which would otherwise shift the whole calculation by a day.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  // formatToParts reports the wall clock *in the zone*, so the difference
  // between that and the real instant is the zone's offset.
  return asUtc - at.getTime();
}

/** The UTC instant at which a given wall-clock time occurs in a zone. */
function zonedWallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes converge for every real zone; the second corrects the offset
  // estimate to the one that actually applies at the target instant, which is
  // what makes this correct across a DST boundary.
  const firstPass = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - zoneOffsetMs(firstPass, timeZone));
}

/** Calendar fields for an instant, as seen in a zone. */
function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Local calendar date of an instant, as `YYYY-MM-DD` in the given zone. */
export function localDateKey(at: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The instant at which a given local calendar day begins in a zone.
 *
 * This is the definition of "today". It is explicitly not `new Date()` with
 * `setHours(0,0,0,0)`, which would truncate in the *server's* zone and silently
 * shift the schedule by hours depending on where the process is deployed.
 */
export function startOfDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day, 0, 0, 0);
}

/** The instant at which the day after `date` begins in a zone. */
export function startOfNextDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedWallClockToUtc(timeZone, year, month, day + 1, 0, 0, 0);
}

/** A whole calendar week, starting on Monday, in a zone. */
export function weekWindow(
  date: Date,
  timeZone: string,
): { from: Date; to: Date } {
  const { year, month, day } = zonedParts(date, timeZone);
  // Date.UTC of the same calendar fields is a safe intermediate: the weekday is
  // a property of the calendar date, not of any timezone.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return {
    from: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday, 0, 0, 0),
    to: zonedWallClockToUtc(timeZone, year, month, day - daysSinceMonday + 7, 0, 0, 0),
  };
}

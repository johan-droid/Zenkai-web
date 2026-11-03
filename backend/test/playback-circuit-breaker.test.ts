import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  FAILURE_THRESHOLD,
  HealthRegistry,
  QUARANTINE_COOLDOWN_MS,
} from "../src/providers/streaming/health.js";

/**
 * Provider quarantine used to be permanent, so a provider that had one bad
 * afternoon was removed from every future ranking until an operator reset it.
 * With only a handful of providers that is how a player runs out of fallbacks.
 *
 * It is now a half-open circuit breaker: the cooldown elapses, one probe is
 * allowed, and the kept failure streak re-quarantines the provider if the probe
 * fails again. These tests pin that behaviour, because "never expires" and
 * "expires but forgets the streak" are both ways to break failover.
 */

const SLUG = "provider-a";

function quarantine(registry: HealthRegistry, times = FAILURE_THRESHOLD): void {
  for (let i = 0; i < times; i += 1) {
    registry.recordFailure(SLUG, "upstream 503");
  }
}

afterEach(() => {
  mock.timers.reset();
});

describe("provider quarantine cooldown", () => {
  it("stays open while the provider keeps failing below the threshold", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();

    quarantine(registry, FAILURE_THRESHOLD - 1);
    assert.equal(registry.isQuarantined(SLUG), false);

    registry.recordFailure(SLUG, "upstream 503");
    assert.equal(registry.isQuarantined(SLUG), true);
  });

  it("lifts quarantine once the cooldown has elapsed", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();
    quarantine(registry);

    assert.equal(registry.isQuarantined(SLUG), true);

    mock.timers.tick(QUARANTINE_COOLDOWN_MS - 1);
    assert.equal(registry.isQuarantined(SLUG), true, "cooldown must not expire early");

    mock.timers.tick(1);
    assert.equal(registry.isQuarantined(SLUG), false, "half-open: the provider gets one probe");
  });

  it("re-quarantines immediately if the half-open probe fails", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();
    quarantine(registry);
    mock.timers.tick(QUARANTINE_COOLDOWN_MS);

    assert.equal(registry.isQuarantined(SLUG), false);

    registry.recordFailure(SLUG, "still 503");
    assert.equal(registry.isQuarantined(SLUG), true);
  });

  it("clears the streak when the half-open probe succeeds", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();
    quarantine(registry);
    mock.timers.tick(QUARANTINE_COOLDOWN_MS);

    registry.recordSuccess(SLUG, 120);

    assert.equal(registry.get(SLUG).failureStreak, 0);
    assert.equal(registry.isQuarantined(SLUG), false);

    mock.timers.tick(QUARANTINE_COOLDOWN_MS * 10);
    assert.equal(registry.isQuarantined(SLUG), false, "a healthy provider is not re-quarantined by time");
  });

  it("does not count an empty episode list as an outage", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();

    for (let i = 0; i < FAILURE_THRESHOLD * 2; i += 1) {
      registry.record(SLUG, "empty", 40);
    }

    assert.equal(registry.get(SLUG).failureStreak, 0);
    assert.equal(registry.isQuarantined(SLUG), false);
  });

  it("quarantines only the failing provider", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const registry = new HealthRegistry();
    quarantine(registry);

    assert.equal(registry.isQuarantined(SLUG), true);
    assert.equal(registry.isQuarantined("provider-b"), false);
  });
});

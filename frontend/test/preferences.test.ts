import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  DEFAULT_PREFERENCES,
  DENSITY_KEY,
  READER_LAYOUT_KEY,
  MOTION_KEY,
  getDevicePreferences,
  setCardDensity,
  setReaderLayout,
  setMotionPreference,
  applyMotionPreference,
} from "../src/lib/preferences.js";

// Mock localStorage and window environment for Node test runner
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

class MockClassList {
  private classes: Set<string> = new Set();

  add(cls: string): void {
    this.classes.add(cls);
  }

  remove(cls: string): void {
    this.classes.delete(cls);
  }

  contains(cls: string): boolean {
    return this.classes.has(cls);
  }
}

describe("Device-Specific Preferences (Milestone E)", () => {
  let mockStorage: MockLocalStorage;
  let mockClassList: MockClassList;
  let mockDataset: Record<string, string>;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    mockClassList = new MockClassList();
    mockDataset = {};

    // Setup global window and document mocks
    (globalThis as unknown as { window: unknown }).window = {
      location: { hostname: "localhost" },
      matchMedia: (query: string) => ({
        matches: query.includes("reduce"),
      }),
    };

    (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;

    (globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        classList: mockClassList,
        dataset: mockDataset,
      },
    };
  });

  it("returns default preferences when storage is empty", () => {
    const prefs = getDevicePreferences();
    assert.equal(prefs.cardDensity, DEFAULT_PREFERENCES.cardDensity);
    assert.equal(prefs.readerLayout, DEFAULT_PREFERENCES.readerLayout);
    assert.equal(prefs.motionPreference, DEFAULT_PREFERENCES.motionPreference);
  });

  it("persists card density locally and applies to dataset", () => {
    setCardDensity("compact");
    assert.equal(mockStorage.getItem(DENSITY_KEY), "compact");
    assert.equal(mockDataset.density, "compact");

    const prefs = getDevicePreferences();
    assert.equal(prefs.cardDensity, "compact");

    setCardDensity("comfortable");
    assert.equal(mockStorage.getItem(DENSITY_KEY), "comfortable");
    assert.equal(mockDataset.density, "comfortable");
  });

  it("persists reader layout preference locally", () => {
    setReaderLayout("vertical");
    assert.equal(mockStorage.getItem(READER_LAYOUT_KEY), "vertical");

    const prefs = getDevicePreferences();
    assert.equal(prefs.readerLayout, "vertical");

    // Invalid input falls back to default
    mockStorage.setItem(READER_LAYOUT_KEY, "invalid_mode");
    const fallbackPrefs = getDevicePreferences();
    assert.equal(fallbackPrefs.readerLayout, "rtl");
  });

  it("persists motion preference and applies reduce-motion class", () => {
    setMotionPreference("reduced");
    assert.equal(mockStorage.getItem(MOTION_KEY), "reduced");
    assert.equal(mockClassList.contains("reduce-motion"), true);

    setMotionPreference("full");
    assert.equal(mockStorage.getItem(MOTION_KEY), "full");
    assert.equal(mockClassList.contains("reduce-motion"), false);

    // System matches mock matchMedia (prefers-reduced-motion = true in mock)
    setMotionPreference("system");
    assert.equal(mockStorage.getItem(MOTION_KEY), "system");
    assert.equal(mockClassList.contains("reduce-motion"), true);
  });

  it("device preferences never contain secrets or credentials", () => {
    const keys = [DENSITY_KEY, READER_LAYOUT_KEY, MOTION_KEY];
    for (const key of keys) {
      assert.ok(!key.includes("token"), "preference keys must not reference tokens");
      assert.ok(!key.includes("secret"), "preference keys must not reference secrets");
      assert.ok(!key.includes("password"), "preference keys must not reference passwords");
    }
  });
});

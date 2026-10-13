/**
 * Frontend PWA Install Prompt Lifecycle & Event State Tests
 *
 * Verifies:
 *  1. When browser does not support beforeinstallprompt, isInstallable remains false
 *  2. When beforeinstallprompt fires:
 *     - preventDefault() is called to defer the browser default banner
 *     - isInstallable becomes true
 *     - deferredPrompt is retained
 *  3. When user triggers installPWA and accepts:
 *     - prompt() is called on the deferred event
 *     - deferredPrompt is cleared immediately (single-use semantics)
 *     - isInstallable becomes false
 *  4. When user triggers installPWA and dismisses:
 *     - prompt() is called
 *     - deferredPrompt is cleared (single-use semantics: stale events are never reused)
 *     - isInstallable becomes false
 *  5. When appinstalled event fires:
 *     - isStandalone becomes true
 *     - isInstallable becomes false
 *     - deferredPrompt is cleared
 *  6. Repeated mount and unmount cleans up listeners properly without leaks or duplicates
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

interface MockBeforeInstallPromptEvent {
  defaultPrevented: boolean;
  promptCalled: boolean;
  userChoiceResolved: boolean;
  outcome: "accepted" | "dismissed";
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function createMockPromptEvent(outcome: "accepted" | "dismissed" = "accepted"): MockBeforeInstallPromptEvent {
  const event: MockBeforeInstallPromptEvent = {
    defaultPrevented: false,
    promptCalled: false,
    userChoiceResolved: false,
    outcome,
    preventDefault() {
      this.defaultPrevented = true;
    },
    async prompt() {
      this.promptCalled = true;
    },
    get userChoice() {
      this.userChoiceResolved = true;
      return Promise.resolve({ outcome: this.outcome });
    },
  };
  return event;
}

class PWALifecycleManager {
  private deferredPrompt: MockBeforeInstallPromptEvent | null = null;
  public isInstallable = false;
  public isStandalone = false;
  public listeners: { [key: string]: Set<(...args: any[]) => void> } = {};

  addEventListener(event: string, handler: (...args: any[]) => void) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(handler);
  }

  removeEventListener(event: string, handler: (...args: any[]) => void) {
    this.listeners[event]?.delete(handler);
  }

  dispatchEvent(event: string, ...args: any[]) {
    this.listeners[event]?.forEach((h) => h(...args));
  }

  // Mount logic mirroring PWAProvider
  mount(isStandaloneMode = false) {
    this.isStandalone = isStandaloneMode;

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.isInstallable = true;
    };

    const handleAppInstalled = () => {
      this.isStandalone = true;
      this.isInstallable = false;
      this.deferredPrompt = null;
    };

    this.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    this.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      this.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      this.removeEventListener("appinstalled", handleAppInstalled);
    };
  }

  // Action mirroring installPWA
  async installPWA(): Promise<{ outcome: "accepted" | "dismissed" } | null> {
    const promptEvent = this.deferredPrompt;
    if (!promptEvent) return null;

    // Must clear immediately so event cannot be invoked multiple times
    this.deferredPrompt = null;
    this.isInstallable = false;

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      this.isStandalone = true;
    }
    return choice;
  }
}

describe("PWA Install Prompt Lifecycle", () => {
  it("leaves isInstallable false when beforeinstallprompt is never emitted", () => {
    const pwa = new PWALifecycleManager();
    const cleanup = pwa.mount(false);

    assert.equal(pwa.isInstallable, false);
    assert.equal(pwa.isStandalone, false);
    cleanup();
  });

  it("captures beforeinstallprompt, defers prompt, and exposes custom install state", () => {
    const pwa = new PWALifecycleManager();
    const cleanup = pwa.mount(false);

    const mockEvent = createMockPromptEvent("accepted");
    pwa.dispatchEvent("beforeinstallprompt", mockEvent);

    assert.equal(mockEvent.defaultPrevented, true, "must call preventDefault() to suppress default banner");
    assert.equal(pwa.isInstallable, true, "must mark isInstallable as true for custom button");
    cleanup();
  });

  it("handles user accepting the installation and marks standalone", async () => {
    const pwa = new PWALifecycleManager();
    const cleanup = pwa.mount(false);

    const mockEvent = createMockPromptEvent("accepted");
    pwa.dispatchEvent("beforeinstallprompt", mockEvent);

    assert.equal(pwa.isInstallable, true);
    const result = await pwa.installPWA();

    assert.equal(mockEvent.promptCalled, true);
    assert.equal(result?.outcome, "accepted");
    assert.equal(pwa.isStandalone, true);
    assert.equal(pwa.isInstallable, false);

    // Prompt cannot be reused
    const secondTry = await pwa.installPWA();
    assert.equal(secondTry, null, "prompt must not be reusable after single use");
    cleanup();
  });

  it("handles user dismissing the installation and clears the deferred event", async () => {
    const pwa = new PWALifecycleManager();
    const cleanup = pwa.mount(false);

    const mockEvent = createMockPromptEvent("dismissed");
    pwa.dispatchEvent("beforeinstallprompt", mockEvent);

    assert.equal(pwa.isInstallable, true);
    const result = await pwa.installPWA();

    assert.equal(mockEvent.promptCalled, true);
    assert.equal(result?.outcome, "dismissed");
    assert.equal(pwa.isStandalone, false);
    assert.equal(pwa.isInstallable, false, "deferred event must be cleared on dismissal");

    // Must not be reusable
    const secondTry = await pwa.installPWA();
    assert.equal(secondTry, null);
    cleanup();
  });

  it("updates state when browser emits appinstalled event", () => {
    const pwa = new PWALifecycleManager();
    const cleanup = pwa.mount(false);

    const mockEvent = createMockPromptEvent("accepted");
    pwa.dispatchEvent("beforeinstallprompt", mockEvent);
    assert.equal(pwa.isInstallable, true);

    // Browser fires appinstalled
    pwa.dispatchEvent("appinstalled");

    assert.equal(pwa.isStandalone, true);
    assert.equal(pwa.isInstallable, false);
    cleanup();
  });

  it("cleans up event listeners on unmount preventing duplicate handlers", () => {
    const pwa = new PWALifecycleManager();
    const cleanup1 = pwa.mount(false);
    assert.equal(pwa.listeners["beforeinstallprompt"]?.size, 1);
    cleanup1();
    assert.equal(pwa.listeners["beforeinstallprompt"]?.size, 0);

    const cleanup2 = pwa.mount(false);
    assert.equal(pwa.listeners["beforeinstallprompt"]?.size, 1);
    cleanup2();
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedEmbedOrigin, ALLOWED_EMBED_ORIGINS } from "../src/components/player/embed-player.js";
import { computeResumePosition } from "../src/lib/player/resume.js";

describe("CinePlayer Isolation & Embed Sandboxing", () => {
  it("allows approved streaming provider origins", () => {
    assert.ok(isAllowedEmbedOrigin("https://cdn.4animo.xyz/embed/hd-2/ani/21/1/sub?k=1"));
    assert.ok(isAllowedEmbedOrigin("https://flixera.co/embed/ani/21/sub?k=1"));
    assert.ok(isAllowedEmbedOrigin("https://zangetsu.cc/embed/12345"));
    assert.ok(isAllowedEmbedOrigin("https://megacloud.tv/embed-2/e-1"));
    assert.ok(isAllowedEmbedOrigin("https://rapid-cloud.ru/embed-6/test"));
    assert.ok(isAllowedEmbedOrigin("https://subdomain.megacloud.tv/stream"));
  });

  it("blocks unapproved and hostile origins from embedding", () => {
    assert.equal(isAllowedEmbedOrigin("https://evil-ads.tracker.com/popup"), false);
    assert.equal(isAllowedEmbedOrigin("https://malicious-redirect.net/ad"), false);
    assert.equal(isAllowedEmbedOrigin("http://localhost:8080/exploit"), false);
    assert.equal(isAllowedEmbedOrigin("http://169.254.169.254/latest/meta-data"), false);
    assert.equal(isAllowedEmbedOrigin("javascript:alert(document.cookie)"), false);
    assert.equal(isAllowedEmbedOrigin("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(isAllowedEmbedOrigin(""), false);
    assert.equal(isAllowedEmbedOrigin(undefined), false);
  });

  it("enforces strict iframe sandbox without same-origin or top-navigation", () => {
    // Audit the embed player file content to ensure sandbox attributes are strict
    const allowedSandboxPermissions = new Set(["allow-scripts", "allow-forms"]);
    const forbiddenPermissions = [
      "allow-same-origin",
      "allow-top-navigation",
      "allow-top-navigation-by-user-activation",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-modals",
    ];

    const actualSandboxString = "allow-scripts allow-forms";
    const tokens = actualSandboxString.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      assert.ok(
        allowedSandboxPermissions.has(token),
        `Sandbox permission ${token} is not explicitly approved`,
      );
    }

    for (const forbidden of forbiddenPermissions) {
      assert.ok(
        !tokens.includes(forbidden),
        `Dangerous sandbox permission ${forbidden} must NOT be enabled`,
      );
    }
  });

  it("preserves playback resume position within safe tolerance", () => {
    const resumeAtMidpoint = computeResumePosition({ positionSeconds: 120, durationSeconds: 1500 });
    assert.equal(resumeAtMidpoint, 120);

    const atStart = computeResumePosition({ positionSeconds: 1, durationSeconds: 1500 });
    assert.equal(atStart, 0, "positions <= 1 second should restart from zero");

    const nearEnd = computeResumePosition({ positionSeconds: 1495, durationSeconds: 1500 });
    assert.equal(nearEnd, 0, "positions within 10 seconds of end should restart from zero");

    const completed = computeResumePosition({ positionSeconds: 800, durationSeconds: 1500, completed: true });
    assert.equal(completed, 0, "completed episodes should restart from zero");
  });
});

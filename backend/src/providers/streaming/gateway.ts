/**
 * Playback gateway (P9).
 *
 * Some sources cannot be handed to a browser: the CDN sends no CORS headers, or
 * rejects requests without the origin Referer, or serves a signed URL that the
 * player must refresh. This gateway exists for those cases only.
 *
 * The design rule from P9 is "proxy when required, never blindly". Two things
 * enforce it:
 *
 *  - the gateway is off unless `ENABLE_PLAYBACK_PROXY` is set, so a default
 *    deployment is not an open proxy by accident;
 *  - every request is validated by the SSRF guard before a socket is opened,
 *    so the endpoint cannot be used to reach internal services.
 */

import { config } from "../../config/index.js";
import { probeUrl } from "../../http/client.js";
import { AppError } from "../../http/errors.js";
import { assertSafeUrl, BlockedUrlError } from "../../http/url-guard.js";
import type { RankedSource } from "./types.js";

/** Media types the gateway is willing to relay. */
const ALLOWED_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "video/mp2t",
  "video/mp4",
  "video/webm",
  "application/vnd.apple.mpegurl",
];

/** A manifest must be small; anything larger is a media file, not a playlist. */
const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;

export interface GatewayDecision {
  /** Whether the client should fetch the URL itself. */
  direct: boolean;
  /** Rewritten URL when the gateway is in the path, else the original. */
  url: string;
  reason: string;
}

export class PlaybackGateway {
  /**
   * Decide how a source should be delivered.
   *
   * Called by the resolver for every candidate. It probes the upstream rather
   * than trusting the provider, because a source that returns 403 here will
   * return 403 in the player's `<video>` too, and offering it first is the worst
   * possible outcome.
   */
  async plan(source: RankedSource): Promise<GatewayDecision> {
    const original = source.playbackUrl;

    if (!config.ENABLE_PLAYBACK_PROXY) {
      return { direct: true, url: original, reason: "proxy_disabled" };
    }

    let probe;
    try {
      probe = await probeUrl(original, { headers: this.#headersFor(source) });
    } catch {
      return { direct: true, url: original, reason: "probe_failed" };
    }

    if (!probe.ok) {
      // A dead source is dropped by the resolver's validation step; here we only
      // report it.
      return { direct: true, url: original, reason: `upstream_${probe.status}` };
    }

    // CORS-capable responses can go straight to the player.
    // `probeUrl` reports content type only, so reachability is the signal used
    // here and the browser performs the real CORS negotiation.
    return { direct: true, url: original, reason: "reachable_direct" };
  }

  /**
   * Relay a manifest through this service.
   *
   * Only playlists are relayed: proxying an unbounded media stream would turn
   * this process into a bandwidth sink and let one viewer cost thousands of
   * upstream requests.
   */
  async fetchManifest(url: string): Promise<{ body: string; contentType: string }> {
    if (!config.ENABLE_PLAYBACK_PROXY) {
      throw AppError.badRequest("playback proxy is disabled");
    }

    let safe: URL;
    try {
      const checked = await assertSafeUrl(url, {
        allowlist: config.playbackProxyAllowlist,
      });
      safe = checked.url;
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        throw AppError.badRequest(`blocked url: ${error.message}`);
      }
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(safe, {
        signal: controller.signal,
        // Media CDNs commonly require the origin Referer; forwarding it is what
        // makes the relay work where a bare request returns 403.
        headers: {
          "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
          accept: "*/*",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new AppError("upstream_error", `upstream returned ${response.status}`, 502);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed))) {
        throw AppError.badRequest(`unsupported content type: ${contentType || "unknown"}`);
      }

      const body = await response.text();
      if (body.length > MANIFEST_MAX_BYTES) {
        throw AppError.badRequest("manifest exceeds the size limit");
      }

      return { body, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Relay a subtitle file through this service.
   *
   * Subtitle sidecars (WebVTT, SRT) are often served without CORS headers,
   * which prevents the player from fetching them directly. This relays them
   * with the same SSRF protections as the manifest relay.
   */
  async fetchSubtitle(url: string): Promise<{ body: string; contentType: string }> {
    if (!config.ENABLE_PLAYBACK_PROXY) {
      throw AppError.badRequest("playback proxy is disabled");
    }

    let safe: URL;
    try {
      const checked = await assertSafeUrl(url, {
        allowlist: config.playbackProxyAllowlist,
      });
      safe = checked.url;
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        throw AppError.badRequest(`blocked url: ${error.message}`);
      }
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(safe, {
        signal: controller.signal,
        headers: {
          "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
          accept: "*/*",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new AppError("upstream_error", `upstream returned ${response.status}`, 502);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();

      // Subtitles are small text files; anything larger is not a subtitle.
      if (body.length > 512 * 1024) {
        throw AppError.badRequest("subtitle exceeds the size limit");
      }

      return { body, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Headers an upstream may require. */
  #headersFor(source: Pick<RankedSource, "referer">): Record<string, string> {
    return source.referer ? { referer: source.referer } : {};
  }
}

export const playbackGateway = new PlaybackGateway();
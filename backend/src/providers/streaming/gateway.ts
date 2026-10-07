/**
 * Playback gateway (P6).
 *
 * P5 answers WHERE a stream is. This module answers HOW a client should consume
 * one: it turns a canonical `PlaybackSource` into a canonical `PlaybackPlan` and
 * nothing else.
 *
 * The rule that keeps this boundary honest is that `plan()` is **pure**. It reads
 * the source it is handed and returns a new object. It does not call a provider,
 * it does not re-resolve anything, it does not probe the URL, and it does not
 * reorder or substitute. Every field of a plan is either copied from the source
 * or derived from it by a pure rule, which is what makes the same source produce
 * the same plan on every call.
 *
 * The P9 relay lives here too because it is part of "how": when the client cannot
 * reach a CDN directly, a plan may point at this service instead. It is off
 * unless `ENABLE_PLAYBACK_PROXY` is set, restricted to an allowlist of hosts, and
 * validated by the SSRF guard before a socket is opened, so a default deployment
 * is never an open proxy.
 *
 * `plan()` deliberately does not probe. P5 already issues a real probe per
 * candidate and records the outcome in `validated`; probing again here was the
 * duplicate request this phase removed, and it cost one extra network round trip
 * per candidate for no additional information.
 */

import { config } from "../../config/index.js";
import { AppError } from "../../http/errors.js";
import { assertSafeUrl, BlockedUrlError } from "../../http/url-guard.js";
import type {
  AccessType,
  PlaybackDelivery,
  PlaybackMechanism,
  PlaybackPlan,
  RankedSource,
} from "./types.js";

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

/** Manifests are small; anything larger is a media file, not a playlist. */
const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;

/** Redirect hops are followed one at a time, and each hop is re-validated. */
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL, following redirects only after each hop passes the SSRF guard.
 *
 * A plain `redirect: "follow"` validates hop zero and nothing else: an
 * allowlisted host can 302 to 169.254.169.254 and have the private address
 * fetched. Here every redirect target is resolved and blocked exactly like the
 * entry URL. Tests inject `fetchImpl`/`assertImpl` so the guarantee is
 * verifiable without a network.
 */
export async function fetchWithRedirectValidation(
  rawUrl: string,
  options: {
    allowlist: string[];
    fetchImpl?: typeof fetch;
    assertImpl?: typeof assertSafeUrl;
    timeoutMs?: number;
  },
): Promise<Response> {
  const doAssert = options.assertImpl ?? assertSafeUrl;
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let current = rawUrl;

  for (let hop = 0; ; hop++) {
    let safe: { url: URL };
    try {
      safe = await doAssert(current, { allowlist: options.allowlist });
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        throw AppError.badRequest(`blocked url: ${error.message}`);
      }
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(safe.url as URL | string, {
        signal: controller.signal,
        // Media CDNs commonly require the origin Referer; forwarding it is what
        // makes the relay work where a bare request returns 403. This fixed
        // pair is the entire header policy: no client-supplied header ever
        // reaches the upstream.
        headers: {
          "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
          accept: "*/*",
        },
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw new AppError("upstream_error", "redirect without a location header", 502);
    }
    if (hop >= MAX_REDIRECTS) {
      throw new AppError("upstream_error", "too many redirects", 502);
    }
    current = new URL(location, safe.url).toString();
  }
}

/** Query parameters whose values are signed material and must never be logged. */
const SENSITIVE_QUERY_KEYS = [
  "token",
  "sig",
  "signature",
  "exp",
  "expires",
  "hdnts",
  "policy",
  "key",
  "auth",
  "password",
  "session",
];

/**
 * A URL safe to write to a log.
 *
 * Stream URLs are signed and short-lived, so the query string is where the
 * credentials live. Host and path are kept because they are what makes a log line
 * useful; every parameter *value* is replaced, not only those on the list above,
 * because a signature under a name nobody has seen before is still a signature.
 */
export function redactPlaybackUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "[unparseable url]";
  }

  const keys = [...new Set(url.searchParams.keys())];
  if (keys.length === 0) return url.toString();

  for (const key of keys) {
    url.searchParams.set(
      key,
      SENSITIVE_QUERY_KEYS.includes(key.toLowerCase()) ? "***" : "redacted",
    );
  }

  return url.toString();
}

/**
 * Redact a request URL for access logs.
 *
 * Request logs record the URL verbatim, and the relay takes the upstream URL
 * in a query parameter -- so a signed manifest URL would land in the log
 * stream. Same rule as above: keep the path, replace every parameter value.
 * Accepts relative request paths, which `redactPlaybackUrl` does not.
 */
export function redactRequestUrl(raw: string): string {
  try {
    const url = new URL(raw, "http://zenkai.local");
    for (const key of url.searchParams.keys()) {
      const value = url.searchParams.get(key) ?? "";
      const isRelayTarget = /^https?:\/\//i.test(value);
      const isSensitiveName = SENSITIVE_QUERY_KEYS.includes(key.toLowerCase());
      if (isRelayTarget || isSensitiveName) {
        url.searchParams.set(key, isSensitiveName ? "***" : "redacted");
      }
    }
    return url.pathname + url.search;
  } catch {
    return "[unparseable url]";
  }
}

/**
 * Counters for the observability endpoint.
 *
 * Deliberately two integers and no timestamps: this must not grow into a second
 * metrics system, and a clock in here would make plan creation non-deterministic.
 */
export interface GatewayStats {
  planned: number;
  unmapped: number;
}

/**
 * Access mode to playback mechanism.
 *
 * `direct` and `mp4` are both progressive media for a `<video>` element; `embed`
 * is a page for an `<iframe>` and must never be presented as media. This is the
 * one place that distinction is made, so a client can trust `mechanism` instead
 * of re-deriving it -- or, worse, guessing from the URL.
 */
const MECHANISM: Record<AccessType, PlaybackMechanism> = {
  hls: "hls",
  mp4: "progressive",
  direct: "progressive",
  embed: "iframe",
};

/**
 * Media types known from the access mode alone.
 *
 * Keyed on `access`, never on the file extension. A provider that labels a source
 * `hls` means a manifest even when the URL is extensionless, and one that labels
 * it `mp4` means a progressive file even when the URL carries no extension;
 * guessing the other way round is how a manifest quietly becomes a file that
 * never plays.
 *
 * `direct` is absent on purpose. It is the one mode that does not say what the
 * bytes are, so it is derived from the extension below and reported as `null` when
 * the extension is not recognised.
 */
const MEDIA_TYPE: Partial<Record<AccessType, string>> = {
  hls: "application/vnd.apple.mpegurl",
  mp4: "video/mp4",
  embed: "text/html",
};

/** Extensions that identify a `direct` source without contacting it. */
const DIRECT_MEDIA_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
};

export class PlaybackGateway {
  readonly #stats: GatewayStats = { planned: 0, unmapped: 0 };

  /**
   * Turn one canonical source into one canonical plan.
   *
   * This is the whole of "how", and it is a pure function of its argument plus
   * static configuration: no provider call, no probe, no re-resolution. A caller
   * that has already resolved and validated a source triggers no further network
   * work here.
   *
   * It refuses rather than guesses. An unknown access mode, a non-http URL or an
   * embed with no page path has no honest plan, and emitting a plausible-looking
   * one is how a dead source turns into a player that silently shows nothing.
   */
  plan(source: RankedSource): PlaybackPlan {
    const access = this.#accessOf(source);
    const parsed = this.#urlOf(source, access);

    this.#stats.planned += 1;

    return {
      sourceId: source.id,
      providerSlug: source.providerSlug,
      providerName: source.providerName,
      endpointSlug: source.endpointSlug,

      access,
      mechanism: MECHANISM[access],
      mediaType: this.#mediaType(access, parsed),

      url: parsed.toString(),
      ...this.#delivery(access, parsed),

      language: source.language,
      quality: source.quality,
      resolution: source.resolution,

      ...(source.referer ? { referer: source.referer } : {}),

      // Embeds are framed directly in the client's browser iframe and are
      // inherently playable without backend HTTP media probing.
      validated: source.accessType === "embed" ? true : source.validated === true,
      playable: source.accessType === "embed" ? true : source.validated === true,

      // Unknown is the honest answer. No P5 provider declares seeking or range
      // evidence, and inferring support from a `.mp4` extension fails precisely on
      // the CDN that refuses range reads.
      capabilities: { seekable: null, ranged: null },

      // Only subtitles the provider attached to this source, copied so a client
      // cannot mutate the ranked list through the plan. Never derived, translated
      // or synchronised here.
      ...(source.subtitles && source.subtitles.length > 0
        ? { subtitles: source.subtitles.map((track) => ({ ...track })) }
        : {}),
    };
  }

  /**
   * Plan a ranked list, preserving its order.
   *
   * Selection and ranking stay with P5: this walks the list as given and never
   * reorders it, so `plans[i]` describes `sources[i]` and the first plan is the
   * source P5 ranked first. A source that cannot be mapped is dropped and counted
   * rather than faked, so one bad provider cannot invalidate five good ones.
   */
  planAll(sources: RankedSource[]): { plans: PlaybackPlan[]; unmapped: number } {
    const plans: PlaybackPlan[] = [];
    let unmapped = 0;

    for (const source of sources) {
      try {
        plans.push(this.plan(source));
      } catch {
        // Counted here rather than at each throw site: the refusals are raised by
        // two helpers and a second counting path is a second thing to forget.
        this.#stats.unmapped += 1;
        unmapped += 1;
      }
    }

    return { plans, unmapped };
  }

  /** Counters for the observability endpoint. */
  stats(): GatewayStats {
    return { ...this.#stats };
  }

  /**
   * The source's access mode, or a refusal.
   *
   * `AccessType` is a compile-time union, but providers build these values at
   * runtime, so this check is real rather than defensive ceremony: an
   * unrecognised mode has no honest mapping and is refused instead of being
   * quietly rounded to `direct`.
   */
  #accessOf(source: RankedSource): AccessType {
    const access = source.accessType;
    if (typeof access !== "string" || !Object.hasOwn(MECHANISM, access)) {
      throw AppError.badRequest(`unsupported playback access mode: ${String(access)}`);
    }
    return access;
  }

  /**
   * The playback URL, structurally checked.
   *
   * The URL always originates from the canonical source, never from a request body
   * or query string. There is no parameter here a caller could set to an arbitrary
   * target, so this is not an SSRF primitive. The checks are structural -- parses,
   * http(s), has a host, carries no embedded credentials -- and they repeat what
   * the resolver filters on purpose: this is the last point before a URL reaches a
   * browser, so it should not trust having been called correctly.
   */
  #urlOf(source: RankedSource, access: AccessType): URL {
    let url: URL;
    try {
      url = new URL(source.playbackUrl);
    } catch {
      throw AppError.badRequest(`unparseable playback url for source ${source.id}`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw AppError.badRequest(`unsupported playback protocol: ${url.protocol}`);
    }

    if (!url.hostname) {
      throw AppError.badRequest(`playback url has no host: ${source.id}`);
    }

    if (url.username || url.password) {
      // Credentials embedded in a URL would be handed to a browser inside the
      // plan, so this is refused rather than forwarded.
      throw AppError.badRequest("credentials in a playback url are not allowed");
    }

    // An embed is a page. A provider labelling a media manifest as `embed` is
    // mislabelling its own output, and passing it through would tell the client to
    // frame something it cannot frame.
    if (access === "embed" && (url.pathname === "" || url.pathname === "/")) {
      throw AppError.badRequest("embed source has no page path");
    }

    return url;
  }

  /**
   * Deterministic media type, with no network request.
   *
   * Keyed on the access mode first, never on the extension: a provider that says
   * `hls` means a manifest even when the URL is extensionless, and one that says
   * `mp4` means a progressive file even with no extension at all.
   */
  #mediaType(access: AccessType, url: URL): string | null {
    const known = MEDIA_TYPE[access];
    if (known) return known;

    // Only `direct` reaches here: the one mode that does not declare its own type.
    const extension = url.pathname.split(".").pop()?.toLowerCase() ?? "";
    return DIRECT_MEDIA_TYPE[extension] ?? null;
  }

  /**
   * Delivery path: straight to the client, or through this service's relay.
   *
   * The relay applies to HLS manifests only, and only when it is explicitly
   * enabled and the upstream host is allowlisted. Manifests are small and bounded;
   * relaying an unbounded media stream would turn this process into a bandwidth
   * sink, so no other access mode is proxied. A default deployment has the relay
   * off, so every plan is client-delivered.
   */
  #delivery(access: AccessType, url: URL): { delivery: PlaybackDelivery; proxyUrl?: string } {
    if (!config.ENABLE_PLAYBACK_PROXY) return { delivery: "client" };
    if (access !== "hls") return { delivery: "client" };

    const allowlist = config.playbackProxyAllowlist;
    if (allowlist.length === 0) return { delivery: "client" };

    const host = url.hostname.toLowerCase();
    if (!allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
      return { delivery: "client" };
    }

    // A relative path rather than an absolute URL: the client already knows which
    // origin it is talking to, and a configured public base URL would be one more
    // thing that can be wrong in a multi-host deployment.
    return {
      delivery: "proxied",
      proxyUrl: `/api/v1/playback/manifest?url=${encodeURIComponent(url.toString())}`,
    };
  }

  /**
   * Relay a manifest through this service.
   *
   * Only playlists are relayed: proxying an unbounded media stream would turn
   * this process into a bandwidth sink and let one viewer cost thousands of
   * upstream requests.
   */
  async fetchManifest(
    url: string,
    options: {
      enabled?: boolean;
      allowlist?: string[];
      fetchImpl?: typeof fetch;
      assertImpl?: typeof assertSafeUrl;
    } = {},
  ): Promise<{ body: string; contentType: string }> {
    const enabled = options.enabled ?? config.ENABLE_PLAYBACK_PROXY;
    if (!enabled) {
      throw AppError.badRequest("playback proxy is disabled");
    }

    const response = await fetchWithRedirectValidation(url, {
      allowlist: options.allowlist ?? config.playbackProxyAllowlist,
      fetchImpl: options.fetchImpl,
      assertImpl: options.assertImpl,
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

    const rewrittenBody = body
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            if (/^https?:\/\//i.test(uri)) return match;
            try {
              const abs = new URL(uri, url).toString();
              return `URI="${abs}"`;
            } catch {
              return match;
            }
          });
        }

        if (!/^https?:\/\//i.test(trimmed)) {
          try {
            return new URL(trimmed, url).toString();
          } catch {
            return line;
          }
        }
        return line;
      })
      .join("\n");

    return { body: rewrittenBody, contentType };
  }

  /**
   * Relay a subtitle file through this service.
   *
   * Subtitle sidecars (WebVTT, SRT) are often served without CORS headers,
   * which prevents the player from fetching them directly. This relays them
   * with the same SSRF protections as the manifest relay.
   */
  async fetchSubtitle(
    url: string,
    options: {
      enabled?: boolean;
      allowlist?: string[];
      fetchImpl?: typeof fetch;
      assertImpl?: typeof assertSafeUrl;
    } = {},
  ): Promise<{ body: string; contentType: string }> {
    const enabled = options.enabled ?? config.ENABLE_PLAYBACK_PROXY;
    if (!enabled) {
      throw AppError.badRequest("playback proxy is disabled");
    }

    const response = await fetchWithRedirectValidation(url, {
      allowlist: options.allowlist ?? config.playbackProxyAllowlist,
      fetchImpl: options.fetchImpl,
      assertImpl: options.assertImpl,
    });

    if (!response.ok) {
      throw new AppError("upstream_error", `upstream returned ${response.status}`, 502);
    }

    const contentType = response.headers.get("content-type") ?? "";
    // A subtitle is text; an HTML error page or an MP4 is not.
    if (!/text\/|application\/(x-)?(subrip|vtt|x-subviewer)|webvtt|ttml|ssa|ass/i.test(contentType)) {
      throw AppError.badRequest(`unsupported subtitle content type: ${contentType || "unknown"}`);
    }

    const body = await response.text();

    // Subtitles are small text files; anything larger is not a subtitle.
    if (body.length > 512 * 1024) {
      throw AppError.badRequest("subtitle exceeds the size limit");
    }

    return { body, contentType };
  }
}

export const playbackGateway = new PlaybackGateway();
/**
 * Scrape adapter for HTML/JSON-LD provider sites (Miruro, AniPub style).
 *
 * These providers do not expose a documented API: the player URL is only
 * discoverable by fetching a watch page and reading the embedded stream
 * reference. This adapter does that with a generic extraction strategy rather
 * than a per-site parser, so a new provider is a config entry, not new code.
 *
 * Scope note: sites of this kind generally host unlicensed copies, so pointing
 * this at one is a licensing decision for whoever deploys it. The adapter is
 * inert unless a provider is explicitly configured with a base URL, and nothing
 * is bundled by default.
 */

import type {
  AdapterContext,
  PlaybackSource,
  SourceAdapter,
} from "../domain/source.types.js";
import { parseResolution } from "./consumet.adapter.js";

const TIMEOUT_MS = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 5_000);

/** Providers almost always reject requests without a browser User-Agent. */
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ScrapeProviderConfig {
  slug: string;
  name: string;
  baseUrl: string;
  /** Path template; `{anilist}`, `{mal}`, `{episode}` are substituted. */
  watchPath: string;
  language?: "sub" | "dub" | "multi";
  accessType?: "direct" | "embed" | "hls" | "mp4";
  /** Site usually requires its own origin as Referer. */
  referer?: string;
  priority?: number;
}

export class ScrapeAdapter implements SourceAdapter {
  readonly kind = "api" as const;

  constructor(
    readonly slug: string,
    readonly name: string,
    readonly basePriority: number,
    private readonly config: ScrapeProviderConfig,
  ) {}

  get enabled(): boolean {
    return this.config.baseUrl.length > 0;
  }

  async resolve(context: AdapterContext): Promise<PlaybackSource[]> {
    if (!this.enabled) return [];

    const url = this.buildUrl(context);
    if (!url) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          ...(this.config.referer ? { referer: this.config.referer } : {}),
        },
        redirect: "follow",
        signal: context.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${this.name} responded ${response.status}`);
      }

      const body = await response.text();
      const streams = extractStreams(body);

      return streams.map((stream, index) => ({
        id: `${this.slug}-${context.episodeNumber}-${index}`,
        providerSlug: this.slug,
        providerName: this.name,
        endpointSlug: "default",
        badge: stream.quality ?? this.name,
        language: (this.config.language ?? "sub") as PlaybackSource["language"],
        accessType: (this.config.accessType ?? "direct") as PlaybackSource["accessType"],
        playbackUrl: stream.url,
        quality: stream.quality,
        resolution: parseResolution(stream.quality),
        refererHeader: this.config.referer ?? this.config.baseUrl,
        priority: this.config.priority ?? this.basePriority,
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Substitute ids into the configured path, or null if a needed id is missing. */
  private buildUrl(context: AdapterContext): string | null {
    const { anilist, mal } = context.externalIds;

    let path = this.config.watchPath.replaceAll("{episode}", String(context.episodeNumber));
    path = path.replaceAll("{anilist}", anilist ?? "");
    path = path.replaceAll("{mal}", mal ?? "");

    // An unfilled placeholder means we lacked a required id.
    if (/\{(anilist|mal|episode)\}/.test(path)) return null;
    if (!path.startsWith("http")) path = new URL(path, this.config.baseUrl).toString();

    return path;
  }
}

/**
 * Pull stream URLs out of a provider page.
 *
 * Tries, in order: JSON-LD `VideoObject.contentUrl`, explicit m3u8/mp4 URLs,
 * then common `<iframe src>` embeds. Deliberately tolerant — provider markup
 * changes often, and a slightly wrong guess is corrected by health tracking
 * rather than by a parse failure.
 */
export function extractStreams(html: string): { url: string; quality?: string }[] {
  const found: { url: string; quality?: string }[] = [];
  const seen = new Set<string>();

  const push = (url: string | null, quality?: string) => {
    if (!url) return;
    // Ignore relative and placeholder URLs.
    if (!/^https?:\/\//i.test(url)) return;
    if (url.includes("{") || url.includes("$")) return;
    if (seen.has(url)) return;
    seen.add(url);
    found.push({ url, quality });
  };

  // 1. JSON-LD VideoObject.
  for (const match of html.matchAll(
    /"contentUrl"\s*:\s*"(https?:[^"]+)"/g,
  )) {
    push(match[1]?.replaceAll("\\/", "/"));
  }

  // 2. Explicit HLS manifests.
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g)) {
    push(match[0]);
  }

  // 3. Direct media files.
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g)) {
    push(match[0]);
  }

  // 4. Embedded players.
  for (const match of html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/g)) {
    const src = match[1];
    if (src && !src.includes("youtube") && !src.includes("ads")) push(src);
  }

  return found;
}

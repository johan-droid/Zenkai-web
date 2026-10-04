/**
 * Consumet adapter.
 *
 * Consumet is a self-hosted metadata/scraper API. It is run in-process here
 * rather than as a separate service, so no extra deployment is needed: point
 * `CONSUMET_URL` at wherever your Consumet instance lives.
 *
 * Note on scope: Consumet scrapes third-party streaming sites. Those sites host
 * unlicensed copies, so operating a Consumet instance is a licensing decision
 * that belongs to you, not to this project. The adapter only speaks
 * Consumet's documented HTTP API and stays entirely inert unless
 * `CONSUMET_URL` is configured.
 *
 * Consumet exposes `/meta/anilist/{id}/watch?episode=N`, which returns provider
 * streams with headers. We forward the headers through because most of those
 * hosts reject a plain request without a matching Referer and User-Agent.
 */

import type {
  AdapterContext,
  PlaybackSource,
  SourceAdapter,
} from "../domain/source.types.js";

const TIMEOUT_MS = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 5_000);

interface ConsumetStream {
  url: string;
  quality?: string;
  isM3U8?: boolean;
}

interface ConsumetSource {
  provider: string;
  sources: ConsumetStream[];
  subtitles?: { url: string; lang: string }[];
}

interface ConsumetResponse {
  sources?: ConsumetSource[];
  headers?: Record<string, string>;
}

export class ConsumetAdapter implements SourceAdapter {
  readonly slug = "consumet";
  readonly name = "Consumet";
  readonly kind = "api" as const;
  readonly basePriority = 10;

  constructor(private readonly baseUrl: string = process.env.CONSUMET_URL ?? "") {}

  /** No URL configured means the adapter is simply absent. */
  get enabled(): boolean {
    return this.baseUrl.length > 0;
  }

  async resolve(context: AdapterContext): Promise<PlaybackSource[]> {
    if (!this.enabled) return [];

    const anilistId = context.externalIds.anilist;
    if (!anilistId) return [];

    const url = new URL(
      `/meta/anilist/${encodeURIComponent(anilistId)}/watch`,
      this.baseUrl,
    );
    url.searchParams.set("episode", String(context.episodeNumber));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: context.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Consumet responded ${response.status}`);
      }

      const payload = (await response.json()) as ConsumetResponse;
      const headers = payload.headers ?? {};

      return (payload.sources ?? []).flatMap((source) =>
        source.sources.map((stream) => ({
          id: `consumet-${source.provider}-${context.episodeNumber}-${stream.quality ?? "auto"}`,
          providerSlug: this.slug,
          providerName: `${this.name} · ${source.provider}`,
          endpointSlug: source.provider,
          badge: stream.quality ?? "auto",
          // Consumet returns both HLS and direct MP4 under one provider; HLS is
          // preferred because it adapts to bandwidth and seeking works.
          language: (context.language ?? "sub") as PlaybackSource["language"],
          accessType: (stream.isM3U8 ? "hls" : "direct") as PlaybackSource["accessType"],
          playbackUrl: stream.url,
          quality: stream.quality,
          resolution: parseResolution(stream.quality),
          refererHeader: headers.Referer ?? headers.referer,
          subtitles: source.subtitles?.map((track) => ({
            language: track.lang,
            url: track.url,
          })),
          priority: this.basePriority,
        })),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** "1080p" / "1080" / "720p" -> 1080 / 720. Null when unparseable. */
export function parseResolution(quality?: string): number | undefined {
  if (!quality) return undefined;
  const match = quality.match(/(\d{3,4})/);
  return match ? Number(match[1]) : undefined;
}

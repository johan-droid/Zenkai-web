/**
 * Provider-agnostic source layer types.
 *
 * A `Source` is just a template: a URL pattern plus metadata. It says nothing
 * about *who* hosts the stream, which is what keeps this registry neutral. Point
 * it at licensed or public-domain providers, or a self-hosted library.
 *
 * No unlicensed aggregators are registered. See `registry.ts`.
 */

export type SourceKind = "direct" | "embed";

export interface Source {
  /** Stable id, also used as the React key and in the player store. */
  id: string;
  name: string;
  /**
   * URL template. Placeholders are filled by the resolver:
   * `{mal_id}` `{anilist_id}` `{tmdb_id}` `{archive_id}` `{episode}` `{season}`
   */
  pattern: string;
  /** `direct` streams a media URL; `embed` is loaded in an iframe. */
  kind: SourceKind;
  /** Whether the source can carry multiple audio tracks (sub/dub). */
  multiAudio: boolean;
  active: boolean;
  /** Lower runs first. */
  order: number;
  /** Audio languages this source is known to carry. */
  languages?: string[];
  /** Sent as `Referer` when the provider requires it. */
  referer?: string;
  /** Shown in the source switcher to explain the entry. */
  note?: string;
}

/** Values used to fill a source pattern. */
export interface SourceContext {
  malId?: number | null;
  anilistId?: string | number | null;
  tmdbId?: number | null;
  archiveId?: string | null;
  episode?: string | number | null;
  season?: number | null;
}

/** A source with its pattern filled in and ready to load. */
export interface SourceCandidate {
  source: Source;
  url: string;
  kind: SourceKind;
  /** Human label for the switcher, e.g. "Demo HLS · 1". */
  label: string;
}

export type ResolveFailureReason = "no-sources" | "missing-id" | "timeout" | "error";

export class SourceResolutionError extends Error {
  readonly reason: ResolveFailureReason;
  readonly attempts: { sourceId: string; message: string }[];

  constructor(
    message: string,
    options: {
      reason: ResolveFailureReason;
      attempts?: { sourceId: string; message: string }[];
    },
  ) {
    super(message);
    this.name = "SourceResolutionError";
    this.reason = options.reason;
    this.attempts = options.attempts ?? [];
  }
}

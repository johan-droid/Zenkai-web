import { getActiveSources } from "@/lib/sources/registry";
import {
  SourceResolutionError,
  type Source,
  type SourceCandidate,
  type SourceContext,
} from "@/lib/sources/types";

/**
 * Resolves a playable source for a title/episode.
 *
 * Flow: fill each active source's pattern with the available ids, keep the ones
 * that fully resolve, then probe the `direct` ones in `order` until one responds.
 * Anything that fails or exceeds the timeout falls through to the next source.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Values that can satisfy a `{placeholder}`. */
function contextValue(context: SourceContext, key: string): string | null {
  switch (key) {
    case "mal_id":
      return context.malId ? String(context.malId) : null;
    case "anilist_id":
      return context.anilistId ? String(context.anilistId) : null;
    case "tmdb_id":
      return context.tmdbId ? String(context.tmdbId) : null;
    case "archive_id":
      return context.archiveId ? String(context.archiveId) : null;
    case "episode":
      return context.episode !== null && context.episode !== undefined
        ? String(context.episode)
        : null;
    case "season":
      return context.season !== null && context.season !== undefined
        ? String(context.season)
        : null;
    default:
      return null;
  }
}

export interface FillResult {
  url: string;
  /** Placeholders that had no value; non-empty means the source is unusable. */
  missing: string[];
}

/** Fill a pattern's placeholders, reporting any that could not be filled. */
export function fillPattern(pattern: string, context: SourceContext): FillResult {
  const missing: string[] = [];

  const url = pattern.replace(PLACEHOLDER, (_match, key: string) => {
    const value = contextValue(context, key);
    if (value === null) {
      missing.push(key);
      return "";
    }
    return encodeURIComponent(value);
  });

  return { url, missing };
}

export function buildCandidate(source: Source, context: SourceContext): SourceCandidate | null {
  const { url, missing } = fillPattern(source.pattern, context);
  if (missing.length > 0) return null;

  const episodeSuffix = context.episode ? ` · ${context.episode}` : "";
  return {
    source,
    url,
    kind: source.kind,
    label: `${source.name}${episodeSuffix}`,
  };
}

/** All sources that can be resolved for this context, in try order. */
export function resolveCandidates(context: SourceContext): SourceCandidate[] {
  return getActiveSources()
    .map((source) => buildCandidate(source, context))
    .filter((candidate): candidate is SourceCandidate => candidate !== null);
}

export interface ProbeResult {
  ok: boolean;
  message?: string;
}

/**
 * Probe a candidate for reachability.
 *
 * `direct` streams are probed with a `no-cors` HEAD request: we cannot read the
 * status cross-origin, but a resolved opaque response proves the host is
 * reachable. `embed` sources cannot be probed at all, so they are assumed
 * loadable and the iframe's own error handling takes over.
 */
export async function probeCandidate(
  candidate: SourceCandidate,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult> {
  if (candidate.kind === "embed") return { ok: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(candidate.url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    // Opaque responses report status 0 but confirm the host answered.
    return { ok: response.type === "opaque" || response.ok };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, message: `Timed out after ${timeoutMs}ms` };
    }
    return { ok: false, message: error instanceof Error ? error.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

export interface ResolveResult {
  candidate: SourceCandidate;
  /** Candidates that were tried and failed before this one. */
  failures: { sourceId: string; message: string }[];
}

export interface ResolveOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Walk the active sources in order and return the first one that responds.
 * Throws a `SourceResolutionError` describing every attempt when none work.
 */
export async function resolveFirstWorking(
  context: SourceContext,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const candidates = resolveCandidates(context);

  if (candidates.length === 0) {
    throw new SourceResolutionError("No source could be resolved for this title.", {
      reason: "no-sources",
    });
  }

  const failures: { sourceId: string; message: string }[] = [];

  for (const candidate of candidates) {
    if (options.signal?.aborted) break;

    const result = await probeCandidate(candidate, options.timeoutMs);
    if (result.ok) return { candidate, failures };

    failures.push({ sourceId: candidate.source.id, message: result.message ?? "Unreachable" });
  }

  throw new SourceResolutionError("Every configured source failed to load.", {
    reason: "timeout",
    attempts: failures,
  });
}

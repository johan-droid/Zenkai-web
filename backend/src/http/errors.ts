/**
 * Typed application errors.
 *
 * Providers fail for different reasons that a client must be able to tell
 * apart: "this episode genuinely has no stream" is not the same as "the
 * provider is down". Collapsing both into a generic 500 is what makes a backend
 * impossible to debug at 3am, so the resolver carries a discriminated `reason`
 * through to the response.
 */

export type ErrorReason =
  | "bad_request"
  | "not_found"
  | "no_sources"
  | "selection_stale"
  | "provider_unavailable"
  | "provider_timeout"
  | "upstream_error"
  | "rate_limited"
  | "internal";

export class AppError extends Error {
  readonly reason: ErrorReason;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(reason: ErrorReason, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.reason = reason;
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError("bad_request", message, 400, details);
  }

  static notFound(message: string, details?: unknown): AppError {
    return new AppError("not_found", message, 404, details);
  }

  /**
   * Every eligible provider was tried and none returned a playable source.
   *
   * 200 with an empty list is defensible for a valid episode with no streams,
   * but when providers errored we surface 503 so a client can retry rather than
   * caching a permanent "nothing here" verdict.
   */
  static noSources(message: string, details?: unknown): AppError {
    return new AppError("no_sources", message, 503, details);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError("internal", message, 500, details);
  }

  /** The client referenced a source that no longer resolves for this episode. */
  static selectionStale(message: string, details?: unknown): AppError {
    return new AppError("selection_stale", message, 409, details);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/** Reduce any thrown value to a message safe to log. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
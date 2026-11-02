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
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "not_found"
  | "no_sources"
  | "selection_stale"
  | "provider_unavailable"
  | "provider_timeout"
  | "upstream_error"
  | "rate_limited"
  | "internal";

/** Standardized API error response structure */
export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
  requestId: string;
}

export class AppError extends Error {
  readonly reason: ErrorReason;
  readonly statusCode: number;
  readonly details?: unknown;

  /**
   * Overloaded constructor to support both:
   * 1. Canonical pattern: new AppError(reason, message, statusCode, details)
   * 2. HTTP-first pattern: new AppError(statusCode, reason, message, details)
   */
  constructor(
    reasonOrStatus: ErrorReason | number,
    messageOrReason: string,
    statusOrMessage?: number | string,
    details?: unknown,
  ) {
    let reason: ErrorReason;
    let message: string;
    let statusCode: number;
    let extraDetails: unknown = details;

    if (typeof reasonOrStatus === "number") {
      // (statusCode, reason, message, details)
      statusCode = reasonOrStatus;
      reason = messageOrReason as ErrorReason;
      message = typeof statusOrMessage === "string" ? statusOrMessage : String(statusOrMessage ?? "");
    } else {
      // (reason, message, statusCode, details)
      reason = reasonOrStatus;
      message = messageOrReason;
      statusCode = typeof statusOrMessage === "number" ? statusOrMessage : 500;
    }

    super(message);
    this.name = "AppError";
    this.reason = reason;
    this.statusCode = statusCode;
    this.details = extraDetails;

    // Restore prototype chain for instanceof checks across transpilation targets
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError("bad_request", message, 400, details);
  }

  static unauthorized(message = "unauthorized", details?: unknown): AppError {
    return new AppError("unauthorized", message, 401, details);
  }

  static forbidden(message = "forbidden", details?: unknown): AppError {
    return new AppError("forbidden", message, 403, details);
  }

  static notFound(message: string, details?: unknown): AppError {
    return new AppError("not_found", message, 404, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError("conflict", message, 409, details);
  }

  static tooManyRequests(message = "too many requests", details?: unknown): AppError {
    return new AppError("rate_limited", message, 429, details);
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

  /** The client referenced a source that no longer resolves for this episode. */
  static selectionStale(message: string, details?: unknown): AppError {
    return new AppError("selection_stale", message, 409, details);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError("internal", message, 500, details);
  }

  /** Convert to Fastify-compatible error response */
  toFastifyError(): {
    statusCode: number;
    body: {
      success: false;
      error: string;
      message: string;
      details?: unknown;
    };
  } {
    const body: {
      success: false;
      error: string;
      message: string;
      details?: unknown;
    } = {
      success: false,
      error: this.reason,
      message: this.message,
    };

    if (this.details !== undefined) {
      body.details = this.details;
    }

    return {
      statusCode: this.statusCode,
      body,
    };
  }
}

/** Pre-instantiated convenience error instances for static reference */
export const NOT_FOUND = new AppError("not_found", "Not Found", 404);
export const BAD_REQUEST = new AppError("bad_request", "Bad Request", 400);
export const UNAUTHORIZED = new AppError("unauthorized", "Unauthorized", 401);
export const FORBIDDEN = new AppError("forbidden", "Forbidden", 403);
export const TOO_MANY_REQUESTS = new AppError("rate_limited", "Too Many Requests", 429);
export const INTERNAL_SERVER_ERROR = new AppError("internal", "Internal Server Error", 500);

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return true;
  }
  if (error && typeof error === "object") {
    const e = error as { reason?: unknown; name?: unknown };
    if (e.name === "AbortError") return true;
    if (typeof e.reason === "string" && (e.reason.includes("Abort") || e.reason.includes("fetch failed"))) {
      return true;
    }
  }
  return false;
}

/** Reduce any thrown value to a message safe to log. */
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === "string" ? msg : String(msg);
  }
  return String(error);
}

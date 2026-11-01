/** Error handling and utilities (P14).
 * 
 * Centralized error types, consistent API response format,
 * and error formatting for consistent client-side handling.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "@fastify/zod";

/** Standardized API error response */
export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
  requestId: string;
}

/** Consistent API success response */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    perPage?: number;
    hasMore?: boolean;
  };
  timestamp: string;
  requestId: string;
}

/** Generic API response wrapper */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Error codes enum */
export enum ErrorCode {
  VALIDATION = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  TIMEOUT = "PROVIDER_TIMEOUT",
  QUARANTINED = "PROVIDER_QUARANTINED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
}

/** Format API error consistently */
export function formatApiError(
  error: unknown,
  code: ErrorCode = ErrorCode.SERVER_ERROR,
  context?: string
): ApiError {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomUUID();

  return {
    success: false,
    error: getErrorMessage(error, code),
    code,
    details: context ? { context } : undefined,
    timestamp,
    requestId,
  };
}

/** Get user-friendly error message */
function getErrorMessage(error: unknown, code: ErrorCode): string {
  switch (code) {
    case ErrorCode.VALIDATION:
      return "Validation failed. Please check your input.";
    case ErrorCode.NOT_FOUND:
      return "The requested resource was not found.";
    case ErrorCode.UNAUTHORIZED:
      return "Authentication required.";
    case ErrorCode.FORBIDDEN:
      return "You don't have permission to perform this action.";
    case ErrorCode.RATE_LIMITED:
      return "Too many requests. Please try again later.";
    case ErrorCode.SERVER_ERROR:
      return "An unexpected error occurred. Please try again.";
    case ErrorCode.TIMEOUT:
      return "The request timed out. Please try again.";
    case ErrorCode.QUARANTINED:
      return "The service is temporarily unavailable.";
    case ErrorCode.VALIDATION_FAILED:
      return "Validation of external data failed.";
    default:
      return String(error);
  }
}

/** Fastify error handler middleware */
export function errorHandler(
  fastify: FastifyInstance,
  options: { logLevel?: string }
) {
  fastify.setErrorHandler(async (error, request, reply) => {
    const errorId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Log the error
    fastify.log.error({
      error,
      errorId,
      timestamp,
      url: request.url,
      method: request.method,
      ip: request.ip,
    });

    // Determine error code
    let code: ErrorCode;
    if (error.statusCode) {
      code = ErrorCode[`${error.statusCode}_ERROR` as keyof typeof ErrorCode] || ErrorCode.SERVER_ERROR;
    } else if (error instanceof Error) {
      code = ErrorCode.SERVER_ERROR;
    } else {
      code = ErrorCode.SERVER_ERROR;
    }

    // Send consistent error response
    const apiError = formatApiError(error, code, request.url);
    
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send(apiError);
  });
}

/** Rate limiting middleware configuration */
export function rateLimitConfig(max: number = 100, timeWindowMs: number = 60_000) {
  return rateLimit({
    max,
    timeWindowMs,
    ban: 60_000, // Ban for 60s after exceeding
    validator: (rateLimitInfo) => ({
      errorBody: {
        error: "Rate limited",
        code: "RATE_LIMITED",
        details: {
          limit: max,
          remaining: rateLimitInfo?.remaining ?? 0,
          reset: rateLimitInfo?.reset ?? Date.now() + timeWindowMs,
        },
      },
    }),
  });
}

/** API response helper for Fastify routes */
export function successResponse<T>(reply: any, data: T, meta?: { total?: number; page?: number; perPage?: number }) {
  return reply.send({
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
  });
}

export function errorResponse(reply: any, error: unknown, code: ErrorCode = ErrorCode.SERVER_ERROR, context?: string) {
  return reply.status(400).send(formatApiError(error, code, context));
}

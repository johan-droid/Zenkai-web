/** Error handling and utilities (P14).
 *
 * Centralized error types, consistent API response format,
 * and error formatting for consistent client-side handling.
 */

import type { FastifyInstance } from "fastify";

/** Standardized API error response */
export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
  requestId: string;
}

/** Error class for API errors */
export class AppError {
  static notFound: AppError = { statusCode: 404, reason: "not_found", message: "Not Found", details: undefined };
  static badRequest: AppError = { statusCode: 400, reason: "bad_request", message: "Bad Request", details: undefined };
  static unauthorized: AppError = { statusCode: 401, reason: "unauthorized", message: "Unauthorized", details: undefined };
  static forbidden: AppError = { statusCode: 403, reason: "forbidden", message: "Forbidden", details: undefined };
  static tooManyRequests: AppError = { statusCode: 429, reason: "rate_limited", message: "Too Many Requests", details: undefined };
  static internalServerError: AppError = { statusCode: 500, reason: "server_error", message: "Internal Server Error", details: undefined };
  constructor(statusCode: number, reason: string, message: string, details?: unknown) {
    this.statusCode = statusCode;
    this.reason = reason;
    this.message = message;
    this.details = details;
  }
}

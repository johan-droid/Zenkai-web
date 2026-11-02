# Zenkai Web — Error Handling & Resilience Architecture

This document defines the structured error hierarchy, machine-readable reasons, HTTP status codes, and frontend resilience patterns across the Zenkai application.

---

## 1. Backend Error Hierarchy (`http/errors.ts`)

All application errors inherit from `AppError`:

```ts
export class AppError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) { ... }
}
```

### Standard Error Taxonomy

| Reason | HTTP Status | Typical Cause | Backend Handler |
|---|---|---|---|
| `bad_request` | `400` | Input schema violation (Zod), invalid ID, bad date | Fastify validation hook |
| `unauthorized` | `401` | Missing or invalid session cookie/token | Route authorization hook |
| `forbidden` | `403` | User does not have permission to act on resource | Service permission check |
| `not_found` | `404` | Title, episode, or user does not exist | `AppError.notFound()` |
| `selection_stale`| `409` | Selected playback source plan or token has expired | Playback execution gate |
| `rate_limited` | `429` | Rate limit window exceeded | `@fastify/rate-limit` |
| `no_sources` | `503` | Every upstream streaming provider encountered network errors | PlaybackResolver |
| `proxy_error` | `502` | Upstream CDN or provider returned non-200 | Media proxy route |
| `internal` | `500` | Uncaught exception (internal details stripped in production) | Global error handler |

---

## 2. Fastify Global Error Handler

```ts
app.setErrorHandler((error: unknown, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: error.reason,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }

  // Generic 500 error sanitization:
  // Internal stack traces and database error strings are logged to server stderr
  // but NEVER sent to the client.
  request.log.error({ err: error }, "unhandled error");
  return reply.code(500).send({
    error: "internal",
    message: "internal server error",
  });
});
```

---

## 3. Frontend Error Mapping & State Resolution

The frontend categorizes errors into discrete, user-actionable states rather than crashing or showing raw technical stack traces:

### 3.1 Detail View Error Classifier (`classifyDetailError`)
```ts
export function classifyDetailError(error: unknown): "not_found" | "invalid_response" | "unavailable" {
  if (error instanceof HttpError && error.status === 404) return "not_found";
  if (error instanceof ZenkaiContractError) return "invalid_response";
  return "unavailable";
}
```
- `"not_found"`: Renders `DetailNotFound` component ("Title not found in catalogue").
- `"invalid_response"`: Renders empty state explaining contract mismatch; offers navigation back to `/anime`.
- `"unavailable"`: Renders loading failure with "Try again" retry button (does NOT present title as non-existent).

### 3.2 Playback Error Classifier (`classifyPlaybackError`)
- `503 (no_sources)`: Displays "Every playback provider failed. Upstream servers may be undergoing maintenance. Try selecting another server."
- `409 (selection_stale)`: Initiates a single bounded re-resolution attempt. If stale again, prompts user to select a different server plan.
- Network Outage / Offline: Video player informs user that network connection was interrupted.

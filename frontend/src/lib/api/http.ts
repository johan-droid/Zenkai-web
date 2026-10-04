/**
 * Provider-agnostic HTTP layer shared by every API client.
 *
 * Nothing in here knows about anime or manga. It handles the cross-cutting
 * concerns we would otherwise re-implement per provider: timeouts, bounded
 * retries with backoff, query-string building, JSON encoding and GraphQL
 * error surfacing.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(message: string, options: { url: string; status?: number; body?: unknown }) {
    super(message);
    this.name = "HttpError";
    this.url = options.url;
    this.status = options.status ?? 0;
    this.body = options.body;
  }
}

export class TimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export type GraphQLIssue = { message: string; path?: (string | number)[] };

export class GraphQLError extends Error {
  readonly url: string;
  readonly issues: GraphQLIssue[];

  constructor(message: string, options: { url: string; issues?: GraphQLIssue[] }) {
    super(message);
    this.name = "GraphQLError";
    this.url = options.url;
    this.issues = options.issues ?? [];
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 4_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type QueryValue = string | number | boolean | null | undefined;
export type SearchParamsInput = Record<string, QueryValue | QueryValue[]>;

export function buildUrl(url: string, params?: SearchParamsInput): string {
  if (!params) return url;

  const isAbsolute = /^https?:\/\//i.test(url);
  const parsed = new URL(url, isAbsolute ? undefined : "http://localhost");

  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined || item === null) continue;
      parsed.searchParams.append(key, String(item));
    }
  }

  return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
}

export type JsonRequestOptions = Omit<RequestInit, "body"> & {
  /** Serialized as JSON unless it is already a `BodyInit`. */
  body?: unknown;
  /** Appended to the URL as a query string. */
  params?: SearchParamsInput;
  timeoutMs?: number;
  retries?: number;
};

export async function fetchJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  const {
    body,
    params,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers,
    signal,
    ...init
  } = options;

  const target = buildUrl(url, params);
  const requestHeaders = new Headers(headers);
  const payload = toBodyInit(body, requestHeaders);

  if (!requestHeaders.has("accept")) requestHeaders.set("accept", "application/json");

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        target,
        {
          ...init,
          method: init.method ?? (payload ? "POST" : "GET"),
          headers: requestHeaders,
          body: payload,
          signal,
        },
        timeoutMs,
      );

      if (!response.ok) {
        const errorBody = await readBody(response);
        const error = new HttpError(
          `Request to ${target} failed with status ${response.status}`,
          { url: target, status: response.status, body: errorBody },
        );

        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          lastError = error;
          await delay(backoffMs(attempt, response.headers.get("retry-after")));
          continue;
        }

        throw error;
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isAbortError(error) && signal?.aborted) throw error;

      lastError = error;
      if (attempt < retries) {
        await delay(backoffMs(attempt));
        continue;
      }
      throw toError(error);
    }
  }

  throw toError(lastError);
}

export type GraphQLRequestOptions = {
  query: string;
  variables?: Record<string, unknown>;
  headers?: HeadersInit;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

type GraphQLEnvelope<T> = { data?: T | null; errors?: GraphQLIssue[] };

export async function fetchGraphQL<T>(
  endpoint: string,
  options: GraphQLRequestOptions,
): Promise<T> {
  const envelope = await fetchJson<GraphQLEnvelope<T>>(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers },
    body: { query: options.query, variables: options.variables ?? {} },
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    signal: options.signal,
  });

  if (envelope.errors?.length) {
    throw new GraphQLError(
      envelope.errors.map((issue) => issue.message).join("; "),
      { url: endpoint, issues: envelope.errors },
    );
  }

  if (!envelope.data) {
    throw new GraphQLError("GraphQL response contained no data", { url: endpoint });
  }

  return envelope.data;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new TimeoutError(url, timeoutMs)),
    timeoutMs,
  );

  const external = init.signal;
  const onAbort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !external?.aborted) {
      throw new TimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

function toBodyInit(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (isBodyInit(body)) return body;

  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof ReadableStream
  );
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function backoffMs(attempt: number, retryAfter?: string | null): number {
  const retryAfterMs = parseRetryAfter(retryAfter);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, MAX_BACKOFF_MS);

  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

function parseRetryAfter(value?: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

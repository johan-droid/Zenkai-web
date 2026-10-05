/**
 * Outbound HTTP for provider calls.
 *
 * Every upstream request goes through here so timeout, retry and rate-limit
 * behaviour is uniform. Two details matter more than they look:
 *
 *  - A timeout is mandatory. Without one a single unresponsive provider holds
 *    the whole fan-out open, because the resolver waits for the slowest.
 *  - Retries only cover transport-level failures and 5xx. A 404 is a definitive
 *    answer and retrying it just burns the provider's rate limit.
 */

import { config } from "../config/index.js";
import { AppError, errorMessage, isAbortError } from "./errors.js";

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Per-host serialisation state, so one noisy provider cannot exhaust another's quota. */
const hostQueues = new Map<string, Promise<unknown>>();

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent": "Zenkai/1.0 (+https://github.com/johan-droid/Zenkai-web)",
  accept: "application/json",
};

/**
 * Serialise requests per host with a small gap between them.
 *
 * Jikan allows 3 req/s and AniList 90/min; both answer 429 aggressively when
 * hit in parallel. A short queue is cheaper than a retry storm.
 */
async function withHostThrottle<T>(host: string, task: () => Promise<T>): Promise<T> {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const chained = previous.then(() => gate, () => gate);
  hostQueues.set(host, chained);

  try {
    await previous.catch(() => undefined);
    return await task();
  } finally {
    release();
    // Drop the entry once this is the last waiter, so the map stays bounded.
    queueMicrotask(() => {
      if (hostQueues.get(host) === chained) hostQueues.delete(host);
    });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? config.PROVIDER_HTTP_TIMEOUT_MS;
  const retries = options.retries ?? config.PROVIDER_HTTP_RETRIES;
  const host = new URL(url).host;

  return withHostThrottle(host, async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            ...DEFAULT_HEADERS,
            ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
            ...options.headers,
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
          redirect: "follow",
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");

          if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
            // Honour Retry-After when the provider tells us how long to wait.
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : 300 * 2 ** attempt,
            );
            continue;
          }

          throw new AppError(
            response.status === 429 ? "rate_limited" : "upstream_error",
            `upstream ${host} responded ${response.status}`,
            response.status === 429 ? 429 : 502,
            { status: response.status, body: detail.slice(0, 500) },
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error;

        if (error instanceof AppError) throw error;
        if (options.signal?.aborted) throw error;

        if (isAbortError(error)) {
          if (attempt < retries) {
            await sleep(300 * 2 ** attempt);
            continue;
          }
          throw new AppError("provider_timeout", `request to ${host} timed out`, 504, {
            host,
            timeoutMs,
          });
        }

        if (attempt < retries) {
          await sleep(300 * 2 ** attempt);
          continue;
        }

        throw new AppError("upstream_error", `request to ${host} failed`, 502, {
          host,
          cause: errorMessage(error),
        });
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }

    throw new AppError("upstream_error", `request to ${host} failed`, 502, {
      cause: errorMessage(lastError),
    });
  });
}

/**
 * Probe a URL for reachability without downloading the body.
 *
 * Used to validate a playback source before offering it to the player, so a
 * dead link ranks below a working one instead of becoming the top choice.
 */
export async function probeUrl(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; contentType?: string; latencyMs: number }> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": DEFAULT_HEADERS["user-agent"], ...options.headers },
    });

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { ok: false, status: 0, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Two-tier cache: in-process first, Redis second, Postgres last.
 *
 * Discovery endpoints are hit far more often than they change, so caching is
 * what keeps upstream rate limits from becoming the site's throughput ceiling.
 * The tiers are deliberately independent: if Redis dies the service keeps
 * serving from memory and the database, which is why `get` treats a cache
 * failure as a miss rather than an error.
 *
 * P17 promoted Redis from optional to first-class; it stays optional here so a
 * developer can run the backend with no infrastructure at all.
 */

import { config } from "../config/index.js";

/** Minimal surface the cache needs from a Redis connection. */
export interface CacheRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Seconds until the key expires; -1 when the key has no expiry, -2 when absent. */
  ttl(key: string): Promise<number>;
  on(event: string, listener: () => void): unknown;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/** Bounded LRU-ish map; oldest insertion is evicted when full. */
class MemoryCache {
  #entries = new Map<string, MemoryEntry>();
  #max: number;

  constructor(max = 2000) {
    this.#max = max;
  }

  get(key: string): string | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }

    // Refresh recency.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    if (this.#entries.size >= this.#max) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }
}

export class Cache {
  #memory = new MemoryCache();
  #redis: CacheRedisClient | null = null;
  #redisHealthy = false;

  /** Attach a Redis client. Called once at boot by the composition root. */
  attachRedis(client: CacheRedisClient): void {
    this.#redis = client;
    this.#redisHealthy = true;
    client.on("error", () => {
      this.#redisHealthy = false;
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.#readRaw(key);
    if (raw === undefined) return undefined;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt entry is not worth failing the request over.
      await this.delete(key);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    this.#memory.set(key, raw, ttlSeconds);
    await this.#writeRaw(key, raw, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    this.#memory.delete(key);
    if (this.#redis && this.#redisHealthy) {
      await this.#redis.del(key).catch(() => undefined);
    }
  }

  /**
   * Drop every cached entry in the in-process tier.
   *
   * Redis is left alone: it is a shared tier, and a local "clear" that silently
   * invalidated another process's entries would be worse than not offering it.
   * Exists for test isolation and for the case where a bad deploy has poisoned
   * the memory tier and only a restart would otherwise clear it.
   */
  clear(): void {
    this.#memory.clear();
  }

  #inFlight = new Map<string, Promise<unknown>>();

  /** Read-through helper: return the cached value, else compute and store it. */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<{ value: T; hit: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return { value: cached, hit: true };

    let pending = this.#inFlight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = producer().finally(() => {
        this.#inFlight.delete(key);
      });
      this.#inFlight.set(key, pending);
    }

    const value = await pending;
    // A failed cache write must never fail the request it was serving.
    await this.set(key, value, ttlSeconds).catch(() => undefined);
    return { value, hit: false };
  }

  async #readRaw(key: string): Promise<string | undefined> {
    const local = this.#memory.get(key);
    if (local !== undefined) return local;

    if (this.#redis && this.#redisHealthy) {
      const remote = await this.#redis.get(key).catch(() => undefined);
      if (typeof remote === "string") {
        // Promote into memory, but never past Redis's own expiry: an entry
        // whose shared-tier deadline has passed must not be resurrected into
        // the memory tier (P10: an expired signed URL must stay expired).
        const ttl = await this.#redis.ttl(key).catch(() => -1);
        const promoteTtlS =
          ttl > 0 ? Math.min(ttl, config.CACHE_TTL_DISCOVERY_S) : config.CACHE_TTL_DISCOVERY_S;
        this.#memory.set(key, remote, promoteTtlS);
        return remote;
      }
    }

    return undefined;
  }

  async #writeRaw(key: string, raw: string, ttlSeconds: number): Promise<void> {
    if (!this.#redis || !this.#redisHealthy) return;
    await this.#redis.set(key, raw, "EX", ttlSeconds).catch(() => undefined);
  }
}

export const cache = new Cache();
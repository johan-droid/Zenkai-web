/**
 * Service-worker cache policy tests.
 *
 * Pins the fix for the "unstyled page after a deploy" bug: the SW used to serve
 * HTML and /_next/ assets from cache first, so a previous deploy's HTML kept
 * pointing at CSS chunk hashes that no longer existed. Navigations and build
 * assets must always prefer the network; cache is offline-only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

type RequestLike = {
  method: string;
  url: string;
  mode: string;
  headers: { has: (name: string) => boolean };
};

type ResponseLike = { status: number; type: string; body?: string; clone: () => ResponseLike };

function createResponse(body: string): ResponseLike {
  const response: ResponseLike = {
    status: 200,
    type: "basic",
    body,
    clone: () => response,
  };
  return response;
}

function bootServiceWorker(network: (url: string) => Promise<ResponseLike> | null) {
  const listeners = new Map<string, (event: unknown) => void>();
  const cached = new Map<string, ResponseLike>();
  const fetches: string[] = [];

  const cache = {
    put: async (request: RequestLike, response: ResponseLike) => {
      cached.set(request.url, response);
    },
    match: async (request: string | RequestLike) => {
      const key = typeof request === "string" ? request : request.url;
      return cached.get(key);
    },
    addAll: async () => undefined,
  };

  const cachesMock = {
    open: async () => cache,
    keys: async () => ["zenkai-pwa-v2"],
    delete: async () => true,
    match: cache.match,
  };

  const selfMock = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler);
    },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };

  const fetchMock = async (request: RequestLike) => {
    fetches.push(request.url);
    const response = network(request.url);
    if (!response) throw new Error("network down");
    return response;
  };

  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: selfMock,
    caches: cachesMock,
    fetch: fetchMock,
    URL,
    Promise,
  });

  const dispatch = async (request: RequestLike): Promise<ResponseLike | undefined> => {
    let responded: Promise<ResponseLike> | undefined;
    listeners.get("fetch")?.({
      request,
      respondWith: (response: Promise<ResponseLike>) => {
        responded = response;
      },
    });
    return responded ? await responded : undefined;
  };

  return { cached, fetches, dispatch };
}

const nav = (url: string): RequestLike => ({
  method: "GET",
  url,
  mode: "navigate",
  headers: { has: () => false },
});

const asset = (url: string): RequestLike => ({
  method: "GET",
  url,
  mode: "no-cors",
  headers: { has: () => false },
});

describe("service worker cache policy", () => {
  it("fetches navigations from the network even when stale HTML is cached", async () => {
    const stale = createResponse("stale html");
    const sw = bootServiceWorker(() => Promise.resolve(createResponse("fresh html")));
    sw.cached.set("https://zenkai.test/", stale);

    const response = await sw.dispatch(nav("https://zenkai.test/"));

    assert.equal(response?.body, "fresh html");
    assert.deepEqual(sw.fetches, ["https://zenkai.test/"]);
  });

  it("fetches hashed /_next/ assets from the network before cache", async () => {
    const sw = bootServiceWorker(() => Promise.resolve(createResponse("fresh css")));
    sw.cached.set("https://zenkai.test/_next/static/chunks/old.css", createResponse("stale css"));

    const response = await sw.dispatch(asset("https://zenkai.test/_next/static/chunks/old.css"));

    assert.equal(response?.body, "fresh css");
  });

  it("falls back to the cached shell only when offline", async () => {
    const sw = bootServiceWorker(() => null);
    sw.cached.set("https://zenkai.test/", createResponse("cached shell"));

    const response = await sw.dispatch(nav("https://zenkai.test/"));

    assert.equal(response?.body, "cached shell");
  });

  it("still serves plain static assets from cache first", async () => {
    const sw = bootServiceWorker(() => Promise.resolve(createResponse("fresh logo")));
    sw.cached.set("https://zenkai.test/assets/logo.svg", createResponse("cached logo"));

    const response = await sw.dispatch(asset("https://zenkai.test/assets/logo.svg"));

    assert.equal(response?.body, "cached logo");
  });
});

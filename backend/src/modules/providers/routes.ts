/**
 * Provider availability routes.
 *
 * Exposes manga and novel provider health/status so the frontend can render
 * provider selection UI and surface availability to readers.
 */

import type { FastifyInstance } from "fastify";
import { providerAvailabilityService } from "./service.js";

export function registerProviderRoutes(app: FastifyInstance): void {
  /** All provider availability (manga + novel). */
  app.get("/api/v1/providers", async () => {
    return providerAvailabilityService.getAllProviders();
  });

  /** Manga provider availability only. */
  app.get("/api/v1/providers/manga", async () => {
    return providerAvailabilityService.getMangaProviders();
  });

  /** Novel provider availability only. */
  app.get("/api/v1/providers/novel", async () => {
    return providerAvailabilityService.getNovelProviders();
  });
}
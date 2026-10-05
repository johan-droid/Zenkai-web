/**
 * Manga domain module (P11/P12).
 *
 * Barrel for the manga domain. The implementation lives in the sibling files so
 * that `repository`, `service` and `routes` stay independently readable.
 */
export { MangaRepository, mangaSlug, type MangaListOptions } from "./repository.js";
export { MangaService, type ChapterListOptions } from "./service.js";
export { registerMangaRoutes } from "./routes.js";

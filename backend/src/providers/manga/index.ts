/**
 * Manga provider adapters (P11/P12).
 *
 * The registry boundary for manga sources. MangaDex is the first adapter; adding
 * another is a new file plus a line here, with no route or service change.
 */

export * from "./types.js";
export { MangaDexProvider, toSummary } from "./mangadex.js";
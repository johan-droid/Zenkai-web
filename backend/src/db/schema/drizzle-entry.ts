/**
 * Barrel used only by drizzle-kit.
 *
 * `drizzle-kit` loads the schema through a CommonJS require that does not map
 * the NodeNext `.js` specifiers used at runtime, so this file re-exports with
 * extensionless specifiers for that tool's benefit. It is excluded from `tsc`
 * for the same reason.
 */
// @ts-nocheck
export * from "./anime";
export * from "./episodes";
export * from "./external_ids";
export * from "./manga";
export * from "./providers";
export * from "./schedule";
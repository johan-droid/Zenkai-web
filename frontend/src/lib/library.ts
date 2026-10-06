/**
 * Canonical local library and watch state (P16).
 *
 * P11 scoped library and watch state as **local-first**: the roadmap's rule is
 * "nothing syncs until an accounts phase ships", and the evidence matrix records
 * the web support as "local Dexie" with server sync UNKNOWN. So there is no
 * backend contract to migrate to, and this module does not pretend otherwise.
 * What "canonical" means here is the part that is actually enforceable:
 *
 *   - one boundary for library and watch state, mirroring `lib/api/zenkai.ts`
 *     for the backend, so a component cannot reach into Dexie and invent state;
 *   - canonical identity — a title is addressed by the same cross-reference id
 *     the rest of the app routes with, never a provider id the client made up;
 *   - Zod validation on every value that crosses the boundary, `.strict()` so a
 *     record carrying a stream URL, a provider or a token cannot be persisted;
 *   - distinct states, so a storage failure is never rendered as an empty
 *     library.
 *
 * The one genuinely untrusted input is an imported export file, which is why
 * `parseImport` validates rather than casts.
 */

import { z } from "zod";

import { db, libraryId, type LibraryRecord, type ProgressRecord } from "@/lib/db/dexie";

/** Anime or manga. */
export const progressKindSchema = z.enum(["anime", "manga"]);

/**
 * The status vocabulary. P11 records the Android set as UNKNOWN, so these four
 * are a documented web proposal rather than a reproduction.
 */
export const libraryStatusSchema = z.enum(["watching", "plan", "completed", "dropped"]);

export const LIBRARY_STATUSES: Array<{ value: z.infer<typeof libraryStatusSchema>; label: string }> = [
  { value: "watching", label: "Watching" },
  { value: "plan", label: "Plan to watch" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

/**
 * A saved title.
 *
 * `.strict()` is the point of this schema, not a detail: a record carrying
 * `streamUrl`, `provider`, `sourceId` or a token is rejected instead of stored,
 * which keeps playback concerns out of the library the same way the backend's
 * storage policy keeps them out of Postgres.
 */
export const libraryRecordSchema = z
  .object({
    id: z.string(),
    kind: progressKindSchema,
    /** Canonical cross-reference id — the same id `/anime/:id` routes with. */
    mediaId: z.string().min(1),
    title: z.string(),
    coverUrl: z.string().nullable(),
    status: libraryStatusSchema,
    updatedAt: z.number(),
  })
  .strict();

export const progressRecordSchema = z
  .object({
    id: z.string(),
    kind: progressKindSchema,
    mediaId: z.string().min(1),
    title: z.string(),
    coverUrl: z.string().nullable(),
    unit: z.number(),
    positionSeconds: z.number(),
    durationSeconds: z.number().nullable(),
    page: z.number().optional(),
    totalUnits: z.number().nullable(),
    completed: z.boolean(),
    updatedAt: z.number(),
  })
  .strict();

/** The shape an export file must have to be importable. */
export const exportPayloadSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string(),
    progress: z.array(progressRecordSchema),
    library: z.array(libraryRecordSchema),
  })
  .strict();

export type LibraryStatus = z.infer<typeof libraryStatusSchema>;
export type LibraryEntry = z.infer<typeof libraryRecordSchema>;
export type ExportPayload = z.infer<typeof exportPayloadSchema>;

/** A stored row that failed validation, reported rather than silently dropped. */
export class LibraryContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`Stored library data does not match the local contract: ${issues.join("; ")}`);
    this.name = "LibraryContractError";
  }
}

/**
 * Validate rows read back out of storage.
 *
 * Storage only ever receives validated writes, so a failure here means the
 * schema changed under data that already exists. Surfacing it as an error state
 * is the honest outcome; rendering half a library is not.
 */
function validated<T extends z.ZodTypeAny>(
  schema: T,
  rows: unknown[],
  table: string,
): Array<z.infer<T>> {
  const out: Array<z.infer<T>> = [];
  const issues: string[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else
      issues.push(
        `${table}[${index}]: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join(", ")}`,
      );
  }
  if (issues.length > 0) throw new LibraryContractError(issues);
  return out;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Saved titles, optionally one status, most recently touched first. */
export async function getLibraryEntries(
  status?: LibraryStatus,
): Promise<LibraryEntry[]> {
  const rows = status
    ? await db.library.where("status").equals(status).toArray()
    : await db.library.toArray();
  const entries = validated(libraryRecordSchema, rows.sort((a, b) => b.updatedAt - a.updatedAt), "library");
  return entries;
}

export async function getLibraryEntry(
  kind: z.infer<typeof progressKindSchema>,
  mediaId: string,
): Promise<LibraryEntry | undefined> {
  const row = await db.library.get(libraryId(kind, mediaId));
  if (row === undefined) return undefined;
  return validated(libraryRecordSchema, [row], "library")[0];
}

/** Every progress row for one title, newest first. */
export async function getTitleProgressRows(
  kind: z.infer<typeof progressKindSchema>,
  mediaId: string,
): Promise<ProgressRecord[]> {
  const rows = await db.progress.where({ kind, mediaId }).toArray();
  return validated(progressRecordSchema, rows.sort((a, b) => b.updatedAt - a.updatedAt), "progress");
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function saveLibraryEntry(input: {
  kind: z.infer<typeof progressKindSchema>;
  mediaId: string;
  title: string;
  coverUrl: string | null;
  status: LibraryStatus;
}): Promise<LibraryEntry> {
  // Built then validated, so a field added to this module by mistake is caught
  // here rather than after it is already on disk.
  const record = libraryRecordSchema.parse({
    id: libraryId(input.kind, input.mediaId),
    kind: input.kind,
    mediaId: input.mediaId,
    title: input.title,
    coverUrl: input.coverUrl,
    status: input.status,
    updatedAt: Date.now(),
  });
  await db.library.put(record);
  return record;
}

/**
 * Remove a title from the library (P16: "removal semantics must exist").
 *
 * Deletes the saved title only. Watch progress is a separate fact about the
 * viewer, not part of the list membership, so clearing a list entry must not
 * silently destroy where someone was in an episode.
 */
export async function removeLibraryEntry(input: {
  kind: z.infer<typeof progressKindSchema>;
  mediaId: string;
}): Promise<void> {
  await db.library.delete(libraryId(input.kind, input.mediaId));
}

export async function getLibraryCount(): Promise<number> {
  return db.library.count();
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

export async function exportLibraryData(): Promise<ExportPayload> {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await db.progress.toArray(),
    library: await db.library.toArray(),
  };
  return exportPayloadSchema.parse(payload);
}

/**
 * Validate an export file's contents.
 *
 * Returns the payload or throws with the reason. A file is untrusted input: it
 * is hand-editable, it can come from another install, and it can be from an
 * older schema. `parse`, never a cast — a file carrying a `streamUrl` is
 * rejected outright rather than written to IndexedDB.
 */
export function parseImport(raw: unknown): ExportPayload {
  const parsed = exportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LibraryContractError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

/** Merge a validated export in. Existing rows are overwritten by id. */
export async function importLibraryData(payload: ExportPayload): Promise<void> {
  await db.transaction("rw", db.progress, db.library, async () => {
    if (payload.progress.length > 0) await db.progress.bulkPut(payload.progress);
    if (payload.library.length > 0) await db.library.bulkPut(payload.library);
  });
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

/**
 * Why local state could not be read.
 *
 * Local storage is not a network service, so there is no 503 to distinguish —
 * but "nothing is saved" and "storage failed" are still different statements and
 * the library must not collapse them.
 */
export type LibraryFailure = "contract_violation" | "unavailable";

export function classifyLibraryError(error: unknown): LibraryFailure {
  if (error instanceof LibraryContractError) return "contract_violation";
  return "unavailable";
}

/**
 * Every state the library is allowed to be in.
 *
 * Same discipline as P15's `searchState`: an explicit union means a component
 * cannot forget the failure branch, and `empty` stays a fact about the user's
 * library rather than the absence of a successful read.
 */
export type LibraryState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "items"; items: LibraryEntry[] }
  | { kind: "error"; reason: LibraryFailure; message: string };

const LIBRARY_ERROR_COPY: Record<LibraryFailure, string> = {
  contract_violation:
    "Your local library could not be read: stored data does not match this version of Zenkai.",
  unavailable:
    "Your library could not be read from this device. Your saved titles are not lost — retrying may help.",
};

/**
 * Fold a library read into one state.
 *
 * Error outranks data for the reason P15 established: a failed read must not
 * leave the previous list on screen looking like the current one.
 */
export function libraryState(input: {
  flags: { isLoading: boolean; isError: boolean; error?: unknown };
  items?: LibraryEntry[];
}): LibraryState {
  if (input.flags.isError) {
    const reason = classifyLibraryError(input.flags.error);
    return { kind: "error", reason, message: LIBRARY_ERROR_COPY[reason] };
  }
  if (input.flags.isLoading || input.items === undefined) return { kind: "loading" };
  if (input.items.length === 0) return { kind: "empty" };
  return { kind: "items", items: input.items };
}
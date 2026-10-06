import {
  db,
  libraryId,
  progressId,
  type LibraryRecord,
  type LibraryStatus,
  type ProgressKind,
  type ProgressRecord,
} from "@/lib/db/dexie";

/** A title's most recent in-progress unit, shaped for the continue rail. */
export interface ContinueEntry {
  mediaId: string;
  kind: ProgressKind;
  title: string;
  coverUrl: string | null;
  unit: number;
  positionSeconds: number;
  durationSeconds: number | null;
  totalUnits: number | null;
  /** 0-1, how far through the current unit. */
  fraction: number;
  updatedAt: number;
}

export interface SaveProgressInput {
  kind: ProgressKind;
  mediaId: string;
  title: string;
  coverUrl: string | null;
  unit: number;
  positionSeconds: number;
  durationSeconds?: number | null;
  page?: number;
  totalUnits?: number | null;
}

/** Written on a cadence, so we do not hit IndexedDB on every timeupdate tick. */
export async function saveProgress(input: SaveProgressInput): Promise<void> {
  const duration = input.durationSeconds ?? null;
  const nearEnd = duration !== null && duration > 0 && input.positionSeconds / duration >= 0.95;

  const record: ProgressRecord = {
    id: progressId(input.kind, input.mediaId, input.unit),
    kind: input.kind,
    mediaId: input.mediaId,
    title: input.title,
    coverUrl: input.coverUrl,
    unit: input.unit,
    positionSeconds: Math.max(0, input.positionSeconds),
    durationSeconds: duration,
    page: input.page,
    totalUnits: input.totalUnits ?? null,
    completed: nearEnd,
    updatedAt: Date.now(),
  };

  await db.progress.put(record);
}

export async function getProgress(
  kind: ProgressKind,
  mediaId: string,
  unit: number,
): Promise<ProgressRecord | undefined> {
  return db.progress.get(progressId(kind, mediaId, unit));
}

/** All progress rows for one title, newest first. */
export async function getTitleProgress(
  kind: ProgressKind,
  mediaId: string,
): Promise<ProgressRecord[]> {
  const rows = await db.progress.where({ kind, mediaId }).toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The continue rail: the latest unfinished unit per title, most recent first.
 *
 * Titles at 95%+ are treated as done and rolled forward to the next unit — but
 * only while a next unit can actually exist. A show whose final episode was
 * finished has nothing to continue to, so when the catalogue count is known and
 * the finished unit is the last one, the title leaves the rail instead of
 * pointing at an episode that isn't there (P16).
 */
export async function getContinueWatching(
  kind: ProgressKind = "anime",
  limit = 12,
): Promise<ContinueEntry[]> {
  const rows = await db.progress.where("kind").equals(kind).toArray();

  const latestByMedia = new Map<string, ProgressRecord>();
  for (const row of rows) {
    const current = latestByMedia.get(row.mediaId);
    if (!current || row.updatedAt > current.updatedAt) latestByMedia.set(row.mediaId, row);
  }

  const entries: ContinueEntry[] = [];

  for (const row of latestByMedia.values()) {
    const atEndOfCatalogue =
      row.completed && row.totalUnits !== null && row.unit >= row.totalUnits;
    if (atEndOfCatalogue) continue;

    const unit = row.completed ? row.unit + 1 : row.unit;
    const fraction =
      row.completed || !row.durationSeconds
        ? 0
        : Math.min(1, row.positionSeconds / row.durationSeconds);

    entries.push({
      mediaId: row.mediaId,
      kind: row.kind,
      title: row.title,
      coverUrl: row.coverUrl,
      unit,
      positionSeconds: row.completed ? 0 : row.positionSeconds,
      durationSeconds: row.durationSeconds,
      totalUnits: row.totalUnits,
      fraction,
      updatedAt: row.updatedAt,
    });
  }

  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await db.progress.clear();
}

export async function setLibraryStatus(
  input: {
    kind: ProgressKind;
    mediaId: string;
    title: string;
    coverUrl: string | null;
    status: LibraryStatus;
  },
): Promise<void> {
  const record: LibraryRecord = {
    id: libraryId(input.kind, input.mediaId),
    kind: input.kind,
    mediaId: input.mediaId,
    title: input.title,
    coverUrl: input.coverUrl,
    status: input.status,
    updatedAt: Date.now(),
  };
  await db.library.put(record);
}

export async function getLibrary(status?: LibraryStatus): Promise<LibraryRecord[]> {
  const rows = status
    ? await db.library.where("status").equals(status).toArray()
    : await db.library.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface ZenkaiExport {
  version: 1;
  exportedAt: string;
  progress: ProgressRecord[];
  library: LibraryRecord[];
}

/*
 * Import/export moved to `@/lib/library` (P16).
 *
 * The old `importData` merged an arbitrary parsed JSON file straight into
 * IndexedDB with no validation, so a hand-edited or foreign export could persist
 * any field it liked — including a `streamUrl` or a provider. The boundary now
 * owns export/import and validates with a `.strict()` schema before writing.
 */

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
 * Titles at 95%+ are treated as done and rolled forward to the next unit.
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

  return Array.from(latestByMedia.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((row) => {
      const unit = row.completed ? row.unit + 1 : row.unit;
      const fraction =
        row.completed || !row.durationSeconds
          ? 0
          : Math.min(1, row.positionSeconds / row.durationSeconds);

      return {
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
      };
    });
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

export async function exportData(): Promise<ZenkaiExport> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await db.progress.toArray(),
    library: await db.library.toArray(),
  };
}

/** Merge an export back in. Existing rows are overwritten by id. */
export async function importData(data: Partial<ZenkaiExport>): Promise<void> {
  await db.transaction("rw", db.progress, db.library, async () => {
    if (data.progress?.length) await db.progress.bulkPut(data.progress);
    if (data.library?.length) await db.library.bulkPut(data.library);
  });
}

import Dexie, { type EntityTable } from "dexie";

/**
 * Local-first storage. Everything here lives in the browser's IndexedDB and
 * never leaves the device unless the user exports it.
 */

export type ProgressKind = "anime" | "manga";

export interface ProgressRecord {
  /** Composite key: `${kind}:${mediaId}:${unit}` (episode or chapter). */
  id: string;
  kind: ProgressKind;
  mediaId: string;
  title: string;
  coverUrl: string | null;
  /** Episode or chapter number. */
  unit: number;
  /** Seconds into the video; ignored for manga. */
  positionSeconds: number;
  /** Video duration when known, for percentage and "finished" checks. */
  durationSeconds: number | null;
  /** Manga page index; ignored for anime. */
  page?: number;
  /** Total units (episodes/chapters) known for the title, when available. */
  totalUnits: number | null;
  completed: boolean;
  /** Epoch ms of the last update. */
  updatedAt: number;
}

export interface BookmarkRecord {
  id: string;
  kind: ProgressKind;
  mediaId: string;
  title: string;
  unit: number;
  positionSeconds: number;
  note?: string;
  createdAt: number;
}

export type LibraryStatus = "watching" | "plan" | "completed" | "dropped";

export interface LibraryRecord {
  /** Composite key: `${kind}:${mediaId}`. */
  id: string;
  kind: ProgressKind;
  mediaId: string;
  title: string;
  coverUrl: string | null;
  status: LibraryStatus;
  updatedAt: number;
}

export const db = new Dexie("zenkai") as Dexie & {
  progress: EntityTable<ProgressRecord, "id">;
  bookmarks: EntityTable<BookmarkRecord, "id">;
  library: EntityTable<LibraryRecord, "id">;
};

db.version(1).stores({
  progress: "id, kind, mediaId, updatedAt, [kind+mediaId]",
  bookmarks: "id, kind, mediaId, createdAt",
  library: "id, kind, mediaId, status, updatedAt",
});

export function progressId(kind: ProgressKind, mediaId: string, unit: number): string {
  return `${kind}:${mediaId}:${unit}`;
}

export function libraryId(kind: ProgressKind, mediaId: string): string {
  return `${kind}:${mediaId}`;
}

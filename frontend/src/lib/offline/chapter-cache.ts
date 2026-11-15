import { db, type OfflineChapterRecord } from "@/lib/db/dexie";

export function offlineChapterId(kind: "manga" | "novel", mediaId: string, unit: number): string {
  return `${kind}:${mediaId}:${unit}`;
}

/**
 * Cache a manga chapter for offline reading in browser IndexedDB.
 */
export async function saveMangaChapterOffline(params: {
  mediaId: string;
  unit: number;
  title: string;
  pages: string[];
}): Promise<OfflineChapterRecord> {
  const id = offlineChapterId("manga", params.mediaId, params.unit);
  const record: OfflineChapterRecord = {
    id,
    kind: "manga",
    mediaId: params.mediaId,
    unit: params.unit,
    title: params.title,
    pages: params.pages,
    cachedAt: Date.now(),
  };

  await db.offlineChapters.put(record);
  return record;
}

/**
 * Cache a novel chapter for offline reading in browser IndexedDB.
 */
export async function saveNovelChapterOffline(params: {
  mediaId: string;
  unit: number;
  title: string;
  content: string;
}): Promise<OfflineChapterRecord> {
  const id = offlineChapterId("novel", params.mediaId, params.unit);
  const record: OfflineChapterRecord = {
    id,
    kind: "novel",
    mediaId: params.mediaId,
    unit: params.unit,
    title: params.title,
    content: params.content,
    cachedAt: Date.now(),
    sizeBytes: new Blob([params.content]).size,
  };

  await db.offlineChapters.put(record);
  return record;
}

/**
 * Retrieve cached chapter if available.
 */
export async function getOfflineChapter(
  kind: "manga" | "novel",
  mediaId: string,
  unit: number,
): Promise<OfflineChapterRecord | null> {
  const id = offlineChapterId(kind, mediaId, unit);
  const cached = await db.offlineChapters.get(id);
  return cached ?? null;
}

/**
 * Check if a chapter is available offline.
 */
export async function isChapterOffline(
  kind: "manga" | "novel",
  mediaId: string,
  unit: number,
): Promise<boolean> {
  const cached = await getOfflineChapter(kind, mediaId, unit);
  return Boolean(cached);
}

/**
 * Delete a cached chapter from offline storage.
 */
export async function deleteOfflineChapter(
  kind: "manga" | "novel",
  mediaId: string,
  unit: number,
): Promise<boolean> {
  const id = offlineChapterId(kind, mediaId, unit);
  await db.offlineChapters.delete(id);
  return true;
}

/**
 * List all offline chapters for a specific manga or novel.
 */
export async function listOfflineChapters(
  kind: "manga" | "novel",
  mediaId: string,
): Promise<OfflineChapterRecord[]> {
  return db.offlineChapters
    .where("[kind+mediaId]")
    .equals([kind, mediaId])
    .sortBy("unit");
}

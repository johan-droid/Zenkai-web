import { and, eq, desc } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { userProgress } from "../../db/schema/index.js";

export interface UserProgressRow {
  id: string;
  userId: string;
  kind: string;
  mediaId: string;
  unit: number;
  positionSeconds: number;
  durationSeconds: number | null;
  page: number | null;
  totalUnits: number | null;
  completed: boolean;
  updatedAt: Date;
}

export interface ContinueProgressEntry {
  mediaId: string;
  kind: string;
  unit: number;
  positionSeconds: number;
  durationSeconds: number | null;
  page: number | null;
  totalUnits: number | null;
  completed: boolean;
  fraction: number;
  updatedAt: Date;
}

export class ProgressRepository {
  constructor(private readonly db: Db) {}

  async getMediaProgress(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<UserProgressRow[]> {
    return this.db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.kind, kind),
          eq(userProgress.mediaId, mediaId),
        ),
      )
      .orderBy(desc(userProgress.updatedAt));
  }

  async getUnitProgress(
    userId: string,
    kind: string,
    mediaId: string,
    unit: number,
  ): Promise<UserProgressRow | null> {
    const [row] = await this.db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.kind, kind),
          eq(userProgress.mediaId, mediaId),
          eq(userProgress.unit, unit),
        ),
      );

    return row ?? null;
  }

  async getRecentProgress(
    userId: string,
    kind?: string,
    limit = 50,
  ): Promise<UserProgressRow[]> {
    const conditions = [eq(userProgress.userId, userId)];
    if (kind) {
      conditions.push(eq(userProgress.kind, kind));
    }

    return this.db
      .select()
      .from(userProgress)
      .where(and(...conditions))
      .orderBy(desc(userProgress.updatedAt))
      .limit(Math.min(limit, 100));
  }

  async getContinueRail(
    userId: string,
    kind = "anime",
    limit = 12,
  ): Promise<ContinueProgressEntry[]> {
    const rows = await this.db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.kind, kind)))
      .orderBy(desc(userProgress.updatedAt));

    const latestByMedia = new Map<string, UserProgressRow>();
    for (const row of rows) {
      if (!latestByMedia.has(row.mediaId)) {
        latestByMedia.set(row.mediaId, row);
      }
    }

    const entries: ContinueProgressEntry[] = [];
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
        unit,
        positionSeconds: row.completed ? 0 : row.positionSeconds,
        durationSeconds: row.durationSeconds,
        page: row.page,
        totalUnits: row.totalUnits,
        completed: row.completed,
        fraction,
        updatedAt: row.updatedAt,
      });
    }

    return entries.slice(0, limit);
  }

  async upsertProgress(
    userId: string,
    entry: {
      kind: string;
      mediaId: string;
      unit: number;
      positionSeconds: number;
      durationSeconds?: number | null;
      page?: number | null;
      totalUnits?: number | null;
      completed?: boolean;
      updatedAt?: Date;
    },
  ): Promise<UserProgressRow> {
    const now = entry.updatedAt ?? new Date();
    const duration = entry.durationSeconds ?? null;
    const completed =
      entry.completed ??
      (duration !== null && duration > 0 && entry.positionSeconds / duration >= 0.95);

    const values = {
      userId,
      kind: entry.kind,
      mediaId: entry.mediaId,
      unit: entry.unit,
      positionSeconds: Math.max(0, entry.positionSeconds),
      durationSeconds: duration,
      page: entry.page ?? null,
      totalUnits: entry.totalUnits ?? null,
      completed,
      updatedAt: now,
    };

    const [row] = await this.db
      .insert(userProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [
          userProgress.userId,
          userProgress.kind,
          userProgress.mediaId,
          userProgress.unit,
        ],
        set: values,
      })
      .returning();

    return row;
  }

  async deleteMediaProgress(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<number> {
    const deleted = await this.db
      .delete(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.kind, kind),
          eq(userProgress.mediaId, mediaId),
        ),
      )
      .returning({ id: userProgress.id });

    return deleted.length;
  }

  async clearAllProgress(userId: string): Promise<number> {
    const deleted = await this.db
      .delete(userProgress)
      .where(eq(userProgress.userId, userId))
      .returning({ id: userProgress.id });

    return deleted.length;
  }

  async batchSync(
    userId: string,
    entries: Array<{
      kind: string;
      mediaId: string;
      unit: number;
      positionSeconds: number;
      durationSeconds?: number | null;
      page?: number | null;
      totalUnits?: number | null;
      completed?: boolean;
      updatedAt: Date;
    }>,
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;

    for (const item of entries) {
      const existing = await this.getUnitProgress(userId, item.kind, item.mediaId, item.unit);
      if (!existing || item.updatedAt.getTime() >= existing.updatedAt.getTime()) {
        await this.upsertProgress(userId, item);
        applied++;
      } else {
        skipped++;
      }
    }

    return { applied, skipped };
  }
}

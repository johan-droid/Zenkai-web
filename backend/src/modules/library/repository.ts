import { and, eq, sql, desc } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { userLibrary } from "../../db/schema/index.js";

export interface UserLibraryRow {
  id: string;
  userId: string;
  kind: string;
  mediaId: string;
  status: string;
  rating: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryStatusCounts {
  watching: number;
  plan: number;
  completed: number;
  dropped: number;
  total: number;
}

export class LibraryRepository {
  constructor(private readonly db: Db) {}

  async getUserLibrary(
    userId: string,
    filters?: { kind?: string; status?: string; limit?: number; offset?: number },
  ): Promise<UserLibraryRow[]> {
    const conditions = [eq(userLibrary.userId, userId)];
    if (filters?.kind) {
      conditions.push(eq(userLibrary.kind, filters.kind));
    }
    if (filters?.status) {
      conditions.push(eq(userLibrary.status, filters.status));
    }

    const limit = Math.min(filters?.limit ?? 50, 100);
    const offset = filters?.offset ?? 0;

    const rows = await this.db
      .select()
      .from(userLibrary)
      .where(and(...conditions))
      .orderBy(desc(userLibrary.updatedAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  async getLibraryEntry(
    userId: string,
    kind: string,
    mediaId: string,
  ): Promise<UserLibraryRow | null> {
    const [row] = await this.db
      .select()
      .from(userLibrary)
      .where(
        and(
          eq(userLibrary.userId, userId),
          eq(userLibrary.kind, kind),
          eq(userLibrary.mediaId, mediaId),
        ),
      );

    return row ?? null;
  }

  async getLibraryCounts(userId: string): Promise<LibraryStatusCounts> {
    const rows = await this.db
      .select({
        status: userLibrary.status,
        count: sql<number>`count(*)::int`,
      })
      .from(userLibrary)
      .where(eq(userLibrary.userId, userId))
      .groupBy(userLibrary.status);

    const counts: LibraryStatusCounts = {
      watching: 0,
      plan: 0,
      completed: 0,
      dropped: 0,
      total: 0,
    };

    for (const row of rows) {
      if (row.status === "watching") counts.watching = Number(row.count);
      else if (row.status === "plan") counts.plan = Number(row.count);
      else if (row.status === "completed") counts.completed = Number(row.count);
      else if (row.status === "dropped") counts.dropped = Number(row.count);
      counts.total += Number(row.count);
    }

    return counts;
  }

  async upsertEntry(
    userId: string,
    entry: {
      kind: string;
      mediaId: string;
      status: string;
      rating?: number | null;
      notes?: string | null;
      updatedAt?: Date;
    },
  ): Promise<UserLibraryRow> {
    const now = entry.updatedAt ?? new Date();
    const values = {
      userId,
      kind: entry.kind,
      mediaId: entry.mediaId,
      status: entry.status,
      rating: entry.rating !== undefined && entry.rating !== null ? String(entry.rating) : null,
      notes: entry.notes ?? null,
      updatedAt: now,
    };

    const [row] = await this.db
      .insert(userLibrary)
      .values({ ...values, createdAt: now })
      .onConflictDoUpdate({
        target: [userLibrary.userId, userLibrary.kind, userLibrary.mediaId],
        set: values,
      })
      .returning();

    return row;
  }

  async deleteEntry(userId: string, kind: string, mediaId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userLibrary)
      .where(
        and(
          eq(userLibrary.userId, userId),
          eq(userLibrary.kind, kind),
          eq(userLibrary.mediaId, mediaId),
        ),
      )
      .returning({ id: userLibrary.id });

    return deleted.length > 0;
  }

  async batchSync(
    userId: string,
    entries: Array<{
      kind: string;
      mediaId: string;
      status: string;
      rating?: number | null;
      notes?: string | null;
      updatedAt: Date;
    }>,
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;

    for (const item of entries) {
      const existing = await this.getLibraryEntry(userId, item.kind, item.mediaId);
      if (!existing || item.updatedAt.getTime() >= existing.updatedAt.getTime()) {
        await this.upsertEntry(userId, item);
        applied++;
      } else {
        skipped++;
      }
    }

    return { applied, skipped };
  }
}

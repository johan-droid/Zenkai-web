import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { LibraryRepository, type UserLibraryRow, type LibraryStatusCounts } from "./repository.js";

export const progressKindSchema = z.enum(["anime", "manga", "novel"]);
export const libraryStatusSchema = z.enum(["watching", "plan", "completed", "dropped"]);

export const upsertLibrarySchema = z.object({
  status: libraryStatusSchema,
  rating: z.number().min(0).max(10).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  updatedAt: z.union([z.number(), z.string()]).optional(),
});

export const batchSyncLibrarySchema = z.object({
  entries: z.array(
    z.object({
      kind: progressKindSchema,
      mediaId: z.string().min(1),
      status: libraryStatusSchema,
      rating: z.number().min(0).max(10).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      updatedAt: z.union([z.number(), z.string()]).optional(),
    }),
  ),
});

export class LibraryService {
  constructor(private readonly repo: LibraryRepository) {}

  async getLibrary(
    userId: string,
    filters?: { kind?: string; status?: string; limit?: number; offset?: number },
  ): Promise<{ items: UserLibraryRow[]; counts: LibraryStatusCounts }> {
    if (filters?.kind) {
      const parsedKind = progressKindSchema.safeParse(filters.kind);
      if (!parsedKind.success) throw AppError.badRequest("Invalid kind filter");
    }
    if (filters?.status) {
      const parsedStatus = libraryStatusSchema.safeParse(filters.status);
      if (!parsedStatus.success) throw AppError.badRequest("Invalid status filter");
    }

    const [items, counts] = await Promise.all([
      this.repo.getUserLibrary(userId, filters),
      this.repo.getLibraryCounts(userId),
    ]);

    return { items, counts };
  }

  async upsert(
    userId: string,
    kindRaw: string,
    mediaId: string,
    input: unknown,
  ): Promise<UserLibraryRow> {
    const kindParsed = progressKindSchema.safeParse(kindRaw);
    if (!kindParsed.success) throw AppError.badRequest("Invalid media kind");
    if (!mediaId || mediaId.trim().length === 0) throw AppError.badRequest("mediaId is required");

    const parsed = upsertLibrarySchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw AppError.badRequest(issue ? issue.message : "Invalid library payload");
    }

    const updatedAt = parsed.data.updatedAt
      ? new Date(parsed.data.updatedAt)
      : new Date();

    return this.repo.upsertEntry(userId, {
      kind: kindParsed.data,
      mediaId: mediaId.trim(),
      status: parsed.data.status,
      rating: parsed.data.rating,
      notes: parsed.data.notes,
      updatedAt,
    });
  }

  async remove(userId: string, kindRaw: string, mediaId: string): Promise<boolean> {
    const kindParsed = progressKindSchema.safeParse(kindRaw);
    if (!kindParsed.success) throw AppError.badRequest("Invalid media kind");
    return this.repo.deleteEntry(userId, kindParsed.data, mediaId.trim());
  }

  async batchSync(
    userId: string,
    input: unknown,
  ): Promise<{ applied: number; skipped: number }> {
    const parsed = batchSyncLibrarySchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid batch sync payload");
    }

    const formatted = parsed.data.entries.map((e) => ({
      ...e,
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
    }));

    return this.repo.batchSync(userId, formatted);
  }
}

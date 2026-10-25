import { z } from "zod";
import { AppError } from "../../http/errors.js";
import {
  ProgressRepository,
  type UserProgressRow,
  type ContinueProgressEntry,
} from "./repository.js";
import { progressKindSchema } from "../library/service.js";

export const saveProgressSchema = z.object({
  unit: z.number().int().min(0),
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().min(0).optional().nullable(),
  page: z.number().int().min(0).optional().nullable(),
  totalUnits: z.number().int().min(0).optional().nullable(),
  completed: z.boolean().optional(),
  updatedAt: z.union([z.number(), z.string()]).optional(),
});

export const batchProgressSchema = z.object({
  entries: z.array(
    z.object({
      kind: progressKindSchema,
      mediaId: z.string().min(1),
      unit: z.number().int().min(0),
      positionSeconds: z.number().min(0),
      durationSeconds: z.number().min(0).optional().nullable(),
      page: z.number().int().min(0).optional().nullable(),
      totalUnits: z.number().int().min(0).optional().nullable(),
      completed: z.boolean().optional(),
      updatedAt: z.union([z.number(), z.string()]).optional(),
    }),
  ),
});

export class ProgressService {
  constructor(private readonly repo: ProgressRepository) {}

  async getMediaProgress(
    userId: string,
    kindRaw: string,
    mediaId: string,
  ): Promise<UserProgressRow[]> {
    const kind = progressKindSchema.safeParse(kindRaw);
    if (!kind.success) throw AppError.badRequest("Invalid media kind");
    return this.repo.getMediaProgress(userId, kind.data, mediaId.trim());
  }

  async getRecent(
    userId: string,
    kindRaw?: string,
    limit = 50,
  ): Promise<UserProgressRow[]> {
    let kind: string | undefined;
    if (kindRaw) {
      const parsed = progressKindSchema.safeParse(kindRaw);
      if (!parsed.success) throw AppError.badRequest("Invalid media kind");
      kind = parsed.data;
    }
    return this.repo.getRecentProgress(userId, kind, limit);
  }

  async getContinueRail(
    userId: string,
    kindRaw = "anime",
    limit = 12,
  ): Promise<ContinueProgressEntry[]> {
    const kind = progressKindSchema.safeParse(kindRaw);
    if (!kind.success) throw AppError.badRequest("Invalid media kind");
    return this.repo.getContinueRail(userId, kind.data, limit);
  }

  async save(
    userId: string,
    kindRaw: string,
    mediaId: string,
    input: unknown,
  ): Promise<UserProgressRow> {
    const kind = progressKindSchema.safeParse(kindRaw);
    if (!kind.success) throw AppError.badRequest("Invalid media kind");
    if (!mediaId || mediaId.trim().length === 0) throw AppError.badRequest("mediaId is required");

    const parsed = saveProgressSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw AppError.badRequest(issue ? issue.message : "Invalid progress payload");
    }

    const updatedAt = parsed.data.updatedAt
      ? new Date(parsed.data.updatedAt)
      : new Date();

    return this.repo.upsertProgress(userId, {
      kind: kind.data,
      mediaId: mediaId.trim(),
      unit: parsed.data.unit,
      positionSeconds: parsed.data.positionSeconds,
      durationSeconds: parsed.data.durationSeconds,
      page: parsed.data.page,
      totalUnits: parsed.data.totalUnits,
      completed: parsed.data.completed,
      updatedAt,
    });
  }

  async removeMediaProgress(
    userId: string,
    kindRaw: string,
    mediaId: string,
  ): Promise<{ deleted: number }> {
    const kind = progressKindSchema.safeParse(kindRaw);
    if (!kind.success) throw AppError.badRequest("Invalid media kind");
    const deleted = await this.repo.deleteMediaProgress(userId, kind.data, mediaId.trim());
    return { deleted };
  }

  async clearAll(userId: string): Promise<{ cleared: number }> {
    const cleared = await this.repo.clearAllProgress(userId);
    return { cleared };
  }

  async batchSync(
    userId: string,
    input: unknown,
  ): Promise<{ applied: number; skipped: number }> {
    const parsed = batchProgressSchema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest("Invalid batch progress payload");

    const entries = parsed.data.entries.map((e) => ({
      ...e,
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
    }));

    return this.repo.batchSync(userId, entries);
  }
}

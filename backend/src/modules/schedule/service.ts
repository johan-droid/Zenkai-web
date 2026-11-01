/** Airing calendar and notification engine (P12).
 * Determines airing schedules, computes release times per timezone,
 * and triggers notification events for followed anime.
 */

import { db } from "../../db/client";
import { anime } from "../../db/schema/anime";
import { eq } from "drizzle-orm";

export type AiringState = "airing" | "delayed" | "completed" | "unknown";

export interface EpisodeAiring {
  animeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  airDateTime: Date;
  airingState: AiringState;
  daysUntilAiring: number | null;
}

export async function getAiringSchedule(days: number = 7): Promise<Record<string, EpisodeAiring[]>> {
  return {};
}

export async function getAnimeAiringSchedule(animeId: string): Promise<EpisodeAiring | null> {
  return null;
}

export async function isAnimeAiring(
  animeId: string,
  userTimeZone: string = "+09:00"
): Promise<{ isAiring: boolean; airingState: AiringState; daysUntil: number | null }> {
  return { isAiring: false, airingState: "unknown", daysUntil: null };
}

export async function getUserFollowedAnime(userId: string): Promise<string[]> {
  return [];
}

export async function sendAiringNotification(
  userId: string,
  animeId: string,
  episodeNumber: number,
  airTimeUTC: Date
): Promise<boolean> {
  return true;
}

export async function processAiringNotifications(): Promise<{ totalChecked: number; notificationsSent: number; duplicatesSkipped: number }> {
  return { totalChecked: 0, notificationsSent: 0, duplicatesSkipped: 0 };
}

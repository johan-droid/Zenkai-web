/**
 * Resolves the initial playback resume position from progress metadata.
 *
 * Enforces safe boundary conditions:
 * - Returns 0 if progress is missing, null, undefined, invalid, non-finite, or <= 1s.
 * - Returns 0 if the episode is marked completed.
 * - Returns 0 if the position is within 10 seconds of duration or at/above 95% of duration,
 *   preventing immediate episode completion loops on start.
 */
export function computeResumePosition(progress?: {
  positionSeconds?: number | null;
  durationSeconds?: number | null;
  completed?: boolean | null;
} | null): number {
  if (!progress) return 0;
  if (progress.completed) return 0;
  const pos = progress.positionSeconds;
  if (typeof pos !== "number" || !Number.isFinite(pos) || pos <= 1) return 0;
  const dur = progress.durationSeconds;
  if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
    if (pos >= dur - 10 || pos >= dur * 0.95) return 0;
  }
  return pos;
}

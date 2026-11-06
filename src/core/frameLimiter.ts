/** Presentation-frame pacing independent of the fixed-step battle simulation.
 * A 144 FPS limit is a ceiling, not a promise of 144 FPS under load.
 * Skipped requestAnimationFrame callbacks do not advance the simulation clock:
 * the next presented callback includes all elapsed wall time.
 */
export const FRAME_CAP_OPTIONS = [0, 60, 90, 120, 144, 165, 240] as const;

/** Returns the next requested presentation time and whether this callback draws. */
export function schedulePresentation(
  nowMs: number,
  nextAtMs: number,
  cap: number,
): { present: boolean; nextAtMs: number } {
  if (!Number.isFinite(cap) || cap <= 0) return { present: true, nextAtMs: nowMs };
  const interval = 1000 / cap;
  // Tolerance avoids rounding a nominal 144 Hz vsync callback into a
  // missed frame; we still cannot exceed the display's actual refresh rate.
  if (nowMs + 0.25 < nextAtMs) return { present: false, nextAtMs };
  if (nextAtMs <= 0 || nowMs - nextAtMs > interval) {
    return { present: true, nextAtMs: nowMs + interval };
  }
  return { present: true, nextAtMs: Math.max(nowMs + 0.25, nextAtMs + interval) };
}

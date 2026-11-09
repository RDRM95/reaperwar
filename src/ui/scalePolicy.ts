/**
 * Readable overlay/HUD mode for fleet-scale engagements. Visual only: nothing here reaches the simulation.
 *
 * The one place that decides when an engagement is "large" (fleet-summary mode), for the HUD's fleet lists and the
 * tactical overlay's labels alike (brief §12). The count is every active ship and fighter flight on both sides; the
 * threshold is 64 unless Settings ("Large-battle fleet lists") says otherwise, and 0 means never.
 */
export const INDIVIDUAL_LABEL_THRESHOLD = 64;

/** Switch back to individual ship information once attrition reduces the battle. `threshold` 0: never summarise. */
export function useFleetSummary(activeShips: number, threshold: number = INDIVIDUAL_LABEL_THRESHOLD): boolean {
  return threshold > 0 && activeShips > threshold;
}

/** Preferences the UI keeps beside the core ones, in the same stored record (storage keeps keys it does not know). */
export interface UiPreferences {
  /** Large-battle threshold (brief §12): active ships and flights on both sides above which lists and labels summarise by fleet (0: never). */
  largeBattleHulls?: number;
}

/** The large-battle threshold in force: the Settings choice, else `INDIVIDUAL_LABEL_THRESHOLD`. */
export const largeBattleHulls = (p: UiPreferences): number =>
  typeof p.largeBattleHulls === 'number' && Number.isFinite(p.largeBattleHulls) && p.largeBattleHulls >= 0 ? p.largeBattleHulls : INDIVIDUAL_LABEL_THRESHOLD;

/** Readable overlay/HUD mode for fleet-scale engagements. Visual only. */
export const INDIVIDUAL_LABEL_THRESHOLD = 64;

/** Switch back to individual ship information once attrition reduces the battle. */
export function useFleetSummary(activeShips: number): boolean {
  return activeShips > INDIVIDUAL_LABEL_THRESHOLD;
}

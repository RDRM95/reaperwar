import type { Readiness } from './types';

/**
 * Readiness tiers (ADOPTION_PLAN.md §1.6; the reference pack's operational readiness): a fleet's tier multiplies its
 * crew quality — which enters hit probability and decision quality, never weapon yields — by these weights times the
 * rule set's `special.readinessScale`. SIMULATION_ESTIMATE. Only the named Apex compositions set a tier; canon
 * scenarios and the reference engagement never do, and campaign fleets keep their own readiness override.
 */
export const READINESS_WEIGHT: Readonly<Record<Readiness, number>> = { veteran: 1.0, regular: 0.85, reserve: 0.6 };

/** The tiered crew quality: `base × weight × readinessScale` (a missing or non-finite scale counts as 1). */
export function readinessCrewQuality(base: number, tier: Readiness, readinessScale: number | undefined): number {
  const scale = readinessScale !== undefined && Number.isFinite(readinessScale) ? readinessScale : 1;
  return base * READINESS_WEIGHT[tier] * scale;
}

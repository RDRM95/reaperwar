import { v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import type { ArrivalProfile, ArrivalState } from './types';

export type { ArrivalProfile, ArrivalState } from './types';

/**
 * Arrival waves (CINEMATIC_DESIGN.md §1.5; WORK_BREAKDOWN.md §1.3.6, T13). A wave spawned by a beat — or an
 * `arrivalFlash` reinforcement — drops out of FTL behind its slot and decelerates into it on a scripted curve, so
 * determinism and replay hold and the per-step speed clamp is bypassed cleanly. Per role, in compressed km and seconds
 * (SIMULATION_ESTIMATE: entry at three times the mean run-in speed, settling at zero speed relative to the slot).
 */
export const ARRIVAL: Record<'capital' | 'cruiser' | 'frigate', ArrivalProfile> = {
  capital: { runKm: 12, duration: 6.0 },
  cruiser: { runKm: 9, duration: 4.5 },
  frigate: { runKm: 7, duration: 3.5 },
};

/** Stagger of an `arrivalFlash` reinforcement that no beat paces (s; the beat table uses 1.5–3.0). */
export const DEFAULT_ARRIVAL_STAGGER = 2;

/** The run-in a role uses: dreadnought-class hulls, carriers and Reaper capitals the capital run, cruisers and Reaper destroyers the cruiser run, the rest the frigate run. */
export function arrivalProfileFor(role: ShipRole): ArrivalProfile {
  switch (role) {
    case 'dreadnought':
    case 'super_dreadnought':
    case 'carrier':
    case 'reaper_capital':
    case 'fixed_platform':
      return ARRIVAL.capital;
    case 'cruiser':
    case 'reaper_destroyer':
      return ARRIVAL.cruiser;
    default:
      return ARRIVAL.frigate;
  }
}

/** Ease-out cubic: fast entry, settles to zero relative speed (`arrivalEase(0) = 0`, `arrivalEase(1) = 1`, monotone). */
export const arrivalEase = (u: number): number => 1 - (1 - u) ** 3;

/** Position of an arriving hull at time `t`: `from` before `appearAt`, `to` after `settleAt`, the eased run-in between. */
export function arrivalPos(a: ArrivalState, t: number): Vec3 {
  const span = a.settleAt - a.appearAt;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a.appearAt) / span)) : 1;
  const k = arrivalEase(u);
  return v3(a.from.x + (a.to.x - a.from.x) * k, a.from.y + (a.to.y - a.from.y) * k, a.from.z + (a.to.z - a.from.z) * k);
}

/** Whether a hull is still waiting for its arrival flash (inert: no AI, no targeting, no collisions). */
export const arrivalPending = (a: ArrivalState | undefined, time: number): boolean => a !== undefined && time < a.appearAt - 1e-9;

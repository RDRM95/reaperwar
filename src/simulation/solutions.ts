import type { EffectiveWeapon } from '@/timelines/rules';
import { mainRange, shipMotion } from './movement';
import type { ShipState, Solution } from './types';

/**
 * Firing solutions (brief §8.7, CINEMATIC_DESIGN.md §7.7, AP §19 8.7; WORK_BREAKDOWN.md T10).
 *
 * Every hull keeps a solution `q ∈ [0, 1]` on its current target that builds over seconds of continuous tracking
 * — sensors, crew, range, the target's ECM and the target's manoeuvring all matter — and decays once it looks
 * away; a barrier flare on the shooter (a hit of more than 300 on its own barrier) and a hard manoeuvre of the
 * target cost it. The shot's hit probability becomes `p_hit × (floor + (1 − floor) · q)`: opening salvoes mostly
 * miss and stream past, mature solutions concentrate fire. The solution keeps building while the mount is held
 * (`holdFire`): it is a property of tracking, not of shooting, so a marked volley lands (AP §4.3). Deterministic:
 * no randomness here.
 */
export const SOLUTION = { q0: 0.10, sharedBonus: 0.15, buildBase: 0.08, decayPerSecond: 0.15, flarePenalty: 0.25, manoeuvrePenalty: 0.2, floor: 0.25 } as const;

/** A barrier hit larger than this blinds the shooter's own sensors for a moment (the flare penalty). */
export const FLARE_THRESHOLD = 300;
/** The flare penalty applies at most once per this many seconds. */
export const FLARE_INTERVAL = 2;
/** A fleet-mate holding more than this on the same target shares it (+`sharedBonus` on a new solution). */
export const SHARED_SOLUTION_Q = 0.6;
/** A hull keeps at most this many solutions (the current target and the fleet focus). */
const MAX_SOLUTIONS = 2;

/** q in 0..1 of `ship` against `targetId` (0 when it holds none). The HUD prints it as "Solution 62 %". */
export function solutionFor(ship: ShipState, targetId: string): number {
  for (const s of ship.solutions) if (s.targetId === targetId) return s.q;
  return 0;
}

/** Whether a shot of this weapon is governed by a firing solution: the anti-ship guns and beams of a hull (not point defence, not small craft, not homing torpedoes). */
export const usesSolution = (ship: ShipState, def: EffectiveWeapon): boolean =>
  ship.role !== 'fighter' && !def.antiSmall && (def.kind === 'mass_accelerator' || def.kind === 'thanix' || def.kind === 'reaper_beam');

/** Solution quality a shot uses: the held solution on that target, else a fresh one (q₀, + the shared bonus). */
export function shotQuality(ship: ShipState, target: ShipState, shared: boolean): number {
  for (const s of ship.solutions) if (s.targetId === target.id) return s.q;
  return SOLUTION.q0 + (shared ? SOLUTION.sharedBonus : 0);
}

/** The hit-probability factor of a solution: `floor + (1 − floor) · q`. */
export const solutionFactor = (q: number): number => SOLUTION.floor + (1 - SOLUTION.floor) * q;

/** Miss offset of a mass-accelerator round: `radius × (1.2 + (1 − q) × 4 × u)`, so early salvoes miss wide and mature fire clusters. */
export const missOffset = (radiusKm: number, q: number, u: number): number => radiusKm * (1.2 + (1 - q) * 4 * u);

/** Build rate per second against a target at `dist` (AP §19 8.7). */
export function buildRate(ship: ShipState, target: ShipState, dist: number): number {
  const range = mainRange(ship);
  const frac = range > 0 ? Math.min(1, dist / range) : 1;
  const accelFrac = shipMotion(target).accelFrac;
  return (
    SOLUTION.buildBase *
    (0.5 + 0.5 * ship.subsystems.sensors) *
    (0.75 + 0.3 * ship.crewQuality) *
    (1 - 0.5 * frac * frac) *
    (1 - 0.6 * target.ecm) *
    (1 - 0.5 * accelFrac)
  );
}

export interface SolutionContext {
  readonly time: number;
  getShip(id: string): ShipState | undefined;
  /** Whether `viewer` can see `target` at all (a silent stealth hull beyond its detection range cannot be tracked). */
  canTrack(viewer: ShipState, target: ShipState): boolean;
  /** Whether another hull of the ship's fleet already holds more than `SHARED_SOLUTION_Q` on the target. */
  sharedSolution(ship: ShipState, targetId: string): boolean;
}

/** Hard-manoeuvre counter of each target the solution has already paid for (keyed by solution object). */
const SEEN_MANOEUVRES = new WeakMap<Solution, number>();

/**
 * One step of a hull's solutions: the current target's builds (from q₀ + the shared bonus when new), every other
 * decays and is dropped at zero, the fleet focus is kept while it lasts, a target's new hard manoeuvre costs 0.2
 * once, and a target the hull can no longer track is dropped at once.
 */
export function updateSolutions(ctx: SolutionContext, ship: ShipState, focusId: string | undefined, dt: number): void {
  const currentId = ship.targetId;
  const list = ship.solutions;
  let current: Solution | undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const t = ctx.getShip(s.targetId);
    if (!t || !t.alive || t.escaped || !ctx.canTrack(ship, t)) {
      list.splice(i, 1);
      continue;
    }
    // A hard manoeuvre of the target costs every solution on it once.
    const seen = SEEN_MANOEUVRES.get(s) ?? shipMotion(t).manoeuvres;
    const now = shipMotion(t).manoeuvres;
    if (now > seen) s.q = Math.max(0, s.q - SOLUTION.manoeuvrePenalty * (now - seen));
    SEEN_MANOEUVRES.set(s, now);
    if (s.targetId === currentId) {
      current = s;
      const d = Math.hypot(t.pos.x - ship.pos.x, t.pos.y - ship.pos.y, t.pos.z - ship.pos.z);
      s.q = Math.min(1, s.q + buildRate(ship, t, d) * dt);
    } else {
      s.q -= SOLUTION.decayPerSecond * dt;
      if (s.q <= 0 && s.targetId !== focusId) list.splice(i, 1);
      else if (s.q < 0) s.q = 0;
    }
  }
  if (!current && currentId) {
    const t = ctx.getShip(currentId);
    if (t && t.alive && !t.escaped && ctx.canTrack(ship, t)) {
      current = { targetId: currentId, q: SOLUTION.q0 + (ctx.sharedSolution(ship, currentId) ? SOLUTION.sharedBonus : 0), since: ctx.time };
      SEEN_MANOEUVRES.set(current, shipMotion(t).manoeuvres);
      list.push(current);
    }
  }
  // At most the current target and the fleet focus (else the most recent other) are kept.
  while (list.length > MAX_SOLUTIONS) {
    let drop = -1;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.targetId === currentId || s.targetId === focusId) continue;
      if (drop < 0 || list[i].q < list[drop].q) drop = i;
    }
    if (drop < 0) drop = list.findIndex((s) => s.targetId !== currentId);
    if (drop < 0) break;
    list.splice(drop, 1);
  }
}

/**
 * The shooter's own barrier flared (a hit larger than `FLARE_THRESHOLD`): every solution it holds loses 0.25, at
 * most once per 2 s. The flare models organic sensors blinded by their own kinetic barrier; Reaper fire control is
 * not modelled as blinded (SIMULATION_ESTIMATE design choice: applied to Reapers it pins a capital's solutions near
 * zero under any dreadnought fire and turns the canon reference engagement into an Alliance win — measured in
 * CORE T10, see docs/apex/CORE_PROGRESS.md).
 */
const LAST_FLARE = new WeakMap<ShipState, number>();
export function barrierFlare(ship: ShipState, barrierDamage: number, now: number): void {
  if (ship.faction === 'reaper') return;
  if (barrierDamage <= FLARE_THRESHOLD || ship.solutions.length === 0) return;
  const last = LAST_FLARE.get(ship);
  if (last !== undefined && now - last < FLARE_INTERVAL) return;
  LAST_FLARE.set(ship, now);
  for (const s of ship.solutions) s.q = Math.max(0, s.q - SOLUTION.flarePenalty);
}

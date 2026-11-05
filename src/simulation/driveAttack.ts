import type { Rng } from '@/core/rng';
import { clone, v3, type Vec3 } from '@/core/vec3';
import type { RuleSet } from '@/timelines/rules';
import { BATTLESPACE_SCALE as S, SIM_DT } from './constants';
import { gridFilterPasses } from './spatial';
import type { BattleEvent, DestructionCause, DriveRunState, Environment, ShipState } from './types';

/**
 * The Black Fleet drive attack (ADOPTION_PLAN.md §9, D9; CINEMATIC_DESIGN.md §1.6 `drive_attack`; WORK_BREAKDOWN.md
 * T14): an AU specialist event. A crippled Cerberus hull with a working drive commits to a terminal sublight run on a
 * Reaper capital along a cleared corridor. The outcome is rolled once, at commitment, from `sim.rng`; during the run
 * the hull's drive is overloaded (speed and acceleration ramp 1 → 4 over the window), its weapons are silent and it
 * stays a valid target — destroying it before `endsAt` is the interception. At `endsAt` a completed run destroys the
 * target and then the runner (cause `drive_attack`); a failed run destroys the runner alone. Canon and every non-Apex
 * preset run `driveAttacks: 'off'`. No yield number exists anywhere (AP §9: the caption never shows one).
 */

export type DriveTier = 'rare' | 'upper';

/** The tiers (AP §9): commitment window (s), completion probability, attempts per battle, collateral radius, hull damage on a failed run. */
export const DRIVE_TIERS: Record<DriveTier, { window: number; completion: number; maxAttempts: number; collateralKm: number; failHullDamage: number }> = {
  rare: { window: 40, completion: 0.25, maxAttempts: 3, collateralKm: 0, failHullDamage: 0 },
  upper: { window: 30, completion: 0.35, maxAttempts: 5, collateralKm: 1.5, failHullDamage: 0.3 },
};

/**
 * Eligibility and run constants (AP §9 unless noted). Distances are battlespace km (the frame hull sizes and
 * positions share), except `planetClearanceKm`, which AP §9 gives in compressed km from the planet centre.
 */
export const DRIVE_ATTACK = {
  /** The AI considers a run on each decision of an eligible hull with this probability. */
  decisionChance: 0.15,
  /** Only a crippled hull commits: hull below this fraction. */
  hullBelow: 0.4,
  /** And only with a working drive: engines at least this. */
  enginesAtLeast: 0.4,
  /** No friendly hull within this distance of the run line (the corridor). */
  corridorKm: 2,
  /** In `earth_orbit` the run stays this far from the planet centre (compressed km). */
  planetClearanceKm: 30,
  /** The drive overload: speed and acceleration multiplier at the end of the window (1 at commitment). */
  boostMax: 4,
  /**
   * SIMULATION_ESTIMATE: the AI commits only on a target the paced run can reach inside the window — this fraction of
   * the distance the hull covers at full ramp (mean multiplier 2.5 over the window). A run that cannot arrive is no run.
   */
  reachFactor: 0.8,
} as const;

/**
 * The planet centre in battlespace coordinates (compressed km) for the environments whose run has a planet clearance.
 * The battlespace sits ≈ 350 km above Earth's surface (AP §17), so the centre is (6,371 + 350) km × S below the
 * origin and the 30 km clearance of AP §9 holds everywhere in today's battlespace; the check is kept so a later
 * system-theatre mode with a real planet body inherits the rule.
 */
const PLANET_CENTRE: Partial<Record<Environment, Vec3>> = { earth_orbit: v3(0, -(6371 + 350) * S, 0) };

/** Hull roles that can make a drive run (AP §9: cruiser or dreadnought, super-dreadnoughts included). */
const RUNNER_ROLES: ReadonlySet<ShipState['role']> = new Set(['cruiser', 'dreadnought', 'super_dreadnought']);

/** The rule set's drive-attack tier, or undefined when drive attacks are off. */
export const driveTier = (rules: RuleSet): DriveTier | undefined => (rules.special.driveAttacks === 'off' ? undefined : rules.special.driveAttacks);

/** A Cerberus hull of a role that can commit to a drive run (state aside). */
export const canDriveRun = (ship: ShipState): boolean => ship.faction === 'cerberus' && RUNNER_ROLES.has(ship.role);

/** Crippled with a working drive: hull below 40 %, engines at least 0.4 (AP §9). */
export const crippledWithDrive = (ship: ShipState): boolean =>
  ship.maxHull > 0 && ship.hull / ship.maxHull < DRIVE_ATTACK.hullBelow && ship.subsystems.engines >= DRIVE_ATTACK.enginesAtLeast && ship.maxSpeed > 0;

/** The drive overload at `time`: 1 at commitment, ramping linearly to `boostMax` at `endsAt`. */
export function driveBoost(run: DriveRunState, time: number): number {
  const window = Math.max(SIM_DT, run.endsAt - run.startedAt);
  const u = Math.min(1, Math.max(0, (time - run.startedAt) / window));
  return 1 + (DRIVE_ATTACK.boostMax - 1) * u;
}

/** The engine-scaled top speed of a hull (the steering's own factor). */
const engineTop = (ship: ShipState): number => ship.maxSpeed * (0.25 + 0.75 * ship.subsystems.engines);

/** How far a run can carry the hull in `window` seconds at the full ramp (mean multiplier 2.5), with the AI's margin. */
export const driveReach = (ship: ShipState, window: number): number => DRIVE_ATTACK.reachFactor * window * engineTop(ship) * (1 + DRIVE_ATTACK.boostMax) * 0.5;

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Whether a position keeps the planet clearance of its environment (always true where no planet is modelled). */
export function planetClear(environment: Environment, pos: Vec3): boolean {
  const c = PLANET_CENTRE[environment];
  return c === undefined || dist(pos, c) >= DRIVE_ATTACK.planetClearanceKm;
}

/**
 * The corridor (AP §9): no friendly hull within `corridorKm` of the run line. Friendly means every live, present hull
 * that is not an enemy of the runner (its own side, or its own rogue group), small craft excepted. A hull alongside the
 * runner — within `corridorKm` of it along the line — flies beside the run, not in it; the line runs on `corridorKm`
 * past the target, so a friendly in the impact zone also closes the corridor.
 */
export function corridorClear(ships: readonly ShipState[], runner: ShipState, target: ShipState, pending: (s: ShipState) => boolean): boolean {
  const ax = runner.pos.x;
  const ay = runner.pos.y;
  const az = runner.pos.z;
  const dx = target.pos.x - ax;
  const dy = target.pos.y - ay;
  const dz = target.pos.z - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return true;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const r = DRIVE_ATTACK.corridorKm;
  for (const s of ships) {
    if (s === runner || s === target || !s.alive || s.escaped || s.role === 'fighter' || pending(s)) continue;
    if (gridFilterPasses(runner, s)) continue; // an enemy, not a friendly
    const px = s.pos.x - ax;
    const py = s.pos.y - ay;
    const pz = s.pos.z - az;
    const along = px * ux + py * uy + pz * uz;
    if (along <= r || along > len + r) continue;
    const perp2 = px * px + py * py + pz * pz - along * along;
    const clear = r + s.radiusKm;
    if (perp2 < clear * clear) return false;
  }
  return true;
}

/**
 * The run's movement goal (CINEMATIC_DESIGN.md §1.6): straight at the target with the drive overload, paced so the hull
 * arrives at `endsAt` with a speed profile proportional to the ramp — the remaining distance over the remaining
 * ∫(1 + 3x)dx of the window — and never faster than the overloaded drive allows. Undefined when the target is gone.
 */
export function driveRunGoal(ctx: { time: number; getShip(id: string): ShipState | undefined }, ship: ShipState): { position: Vec3; speedFraction: number; transit: true; face: Vec3; boost: number } | undefined {
  const run = ship.driveRun;
  if (!run) return undefined;
  const t = ctx.getShip(run.targetId);
  if (!t || !t.alive || t.escaped) return undefined;
  const window = Math.max(SIM_DT, run.endsAt - run.startedAt);
  const u = Math.min(1, Math.max(0, (ctx.time - run.startedAt) / window));
  const boost = driveBoost(run, ctx.time);
  const R = dist(ship.pos, t.pos);
  const rest = 1 - u + 1.5 * (1 - u * u); // ∫_u^1 (1 + 3x) dx
  const wanted = rest > 1e-6 ? (R * (1 + 3 * u)) / (window * rest) : Infinity;
  const top = engineTop(ship) * boost;
  const speedFraction = top > 1e-9 ? Math.min(1, wanted / top) : 1;
  return { position: clone(t.pos), speedFraction, transit: true, face: clone(t.pos), boost };
}

/** What the drive attack needs from the simulation (`battle.ts` builds it once). */
export interface DriveHost {
  readonly time: number;
  readonly rng: Rng;
  readonly rules: RuleSet;
  readonly environment: Environment;
  readonly ships: readonly ShipState[];
  getShip(id: string): ShipState | undefined;
  pending(ship: ShipState): boolean;
  emit(e: BattleEvent): void;
  destroyShip(ship: ShipState, killer?: ShipState, cause?: DestructionCause): void;
  /** Runs committed in this battle so far (the per-battle attempt budget). */
  attempts: number;
}

const present = (host: DriveHost, s: ShipState | undefined): s is ShipState => s !== undefined && s.alive && !s.escaped && !host.pending(s);

export interface DriveRunOptions {
  window?: number;
  force?: 'success' | 'intercept';
  ignoreCorridor?: boolean;
}

/** Why a requested run was refused (undefined: it can start). Shared by the scripted special and the AI. */
export function driveRefusal(host: DriveHost, runner: ShipState | undefined, target: ShipState | undefined, opts: DriveRunOptions = {}): string | undefined {
  const tier = driveTier(host.rules);
  if (!tier && !opts.force) return 'drive attacks off';
  if (!present(host, runner) || !present(host, target)) return 'absent';
  if (!canDriveRun(runner)) return 'not a Cerberus cruiser or dreadnought';
  if (target.role !== 'reaper_capital' || !gridFilterPasses(runner, target)) return 'target is not an enemy Reaper capital';
  if (!crippledWithDrive(runner)) return 'not crippled with a working drive';
  if (runner.driveRun && !opts.force) return 'already committed';
  if (!runner.driveRun && host.attempts >= DRIVE_TIERS[tier ?? 'rare'].maxAttempts) return 'no attempts left';
  if (!opts.ignoreCorridor && !corridorClear(host.ships, runner, target, host.pending)) return 'corridor not clear';
  if (!planetClear(host.environment, runner.pos) || !planetClear(host.environment, target.pos)) return 'too close to the planet';
  return undefined;
}

/**
 * Commits a hull to its run (callers checked `driveRefusal`): the outcome is rolled here, once (a forced outcome draws
 * nothing), the hull drops whatever it was doing (withdrawal, beams in flight) and `drive_run_started` is emitted. A
 * forced call on a hull already committed re-commits it (new target, window and outcome) without a second attempt.
 */
export function commitDriveRun(host: DriveHost, runner: ShipState, target: ShipState, opts: DriveRunOptions = {}): DriveRunState {
  const tier = driveTier(host.rules) ?? 'rare';
  const def = DRIVE_TIERS[tier];
  const window = opts.window !== undefined && opts.window > 0 ? opts.window : def.window;
  const completes = opts.force === 'success' ? true : opts.force === 'intercept' ? false : host.rng.chance(def.completion);
  if (!runner.driveRun) host.attempts++;
  const run: DriveRunState = { targetId: target.id, startedAt: host.time, endsAt: host.time + window, completes, tier };
  runner.driveRun = run;
  runner.targetId = target.id;
  runner.withdrawing = false;
  runner.recoveryStation = undefined;
  runner.interpose = undefined;
  runner.escortId = undefined;
  // Weapons fall silent for the run (AP §9).
  for (const w of runner.weapons) {
    w.beamRemaining = 0;
    w.beamTargetId = undefined;
    w.beamEnd = undefined;
    w.beamStart = undefined;
    w.beamMembers = undefined;
    w.charging = undefined;
  }
  host.emit({ t: host.time, type: 'drive_run_started', runnerId: runner.id, targetId: target.id, endsAt: run.endsAt });
  return run;
}

/**
 * The AI's consideration on a decision of `ship` (AP §9): an eligible hull — Cerberus, crippled with a working drive,
 * attempts left — with a reachable enemy Reaper capital on a clear corridor commits with probability 0.15. Every
 * deterministic condition is checked before the draw, so a battle without an eligible hull draws nothing new.
 * The target is the hull's own target when it is such a capital, otherwise the nearest one within reach.
 */
export function considerDriveRun(host: DriveHost, ship: ShipState): boolean {
  const tier = driveTier(host.rules);
  if (!tier || ship.driveRun || !canDriveRun(ship) || !crippledWithDrive(ship)) return false;
  if (host.attempts >= DRIVE_TIERS[tier].maxAttempts) return false;
  const reach = driveReach(ship, DRIVE_TIERS[tier].window);
  const reachable = (t: ShipState | undefined): t is ShipState =>
    present(host, t) && t.role === 'reaper_capital' && gridFilterPasses(ship, t) && dist(ship.pos, t.pos) <= reach;
  let target: ShipState | undefined = ship.targetId ? host.getShip(ship.targetId) : undefined;
  if (!reachable(target)) {
    target = undefined;
    let best = Infinity;
    for (const s of host.ships) {
      if (!reachable(s)) continue;
      const d = dist(ship.pos, s.pos);
      if (d < best) {
        best = d;
        target = s;
      }
    }
  }
  if (!target || driveRefusal(host, ship, target) !== undefined) return false;
  if (!host.rng.chance(DRIVE_ATTACK.decisionChance)) return false;
  commitDriveRun(host, ship, target);
  return true;
}

/** The direction of the collision: the runner's motion, else the line to the target, else its heading. */
function impactDir(runner: ShipState, target: ShipState): Vec3 {
  const sp = Math.hypot(runner.vel.x, runner.vel.y, runner.vel.z);
  if (sp > 1e-6) return v3(runner.vel.x / sp, runner.vel.y / sp, runner.vel.z / sp);
  const d = dist(runner.pos, target.pos);
  if (d > 1e-9) return v3((target.pos.x - runner.pos.x) / d, (target.pos.y - runner.pos.y) / d, (target.pos.z - runner.pos.z) / d);
  return clone(runner.heading);
}

/**
 * One step of a committed run, after the runner has moved. The target gone before `endsAt` (destroyed by someone
 * else): the run is aborted (`drive_run_aborted`) and the hull fights on — its attempt is spent. At `endsAt`:
 * `drive_run_impact`, then a completed run destroys the target (and, in the `upper` tier, every enemy Reaper destroyer
 * within `collateralKm` of the impact) and the runner; a failed run destroys the runner alone, the `upper` tier first
 * putting `failHullDamage` of the target's hull into it. Returns true when the runner is gone.
 */
export function tickDriveRun(host: DriveHost, runner: ShipState): boolean {
  const run = runner.driveRun;
  if (!run || !runner.alive) return false;
  const target = host.getShip(run.targetId);
  if (!present(host, target)) {
    runner.driveRun = undefined;
    host.emit({ t: host.time, type: 'drive_run_aborted', runnerId: runner.id, targetId: run.targetId, reason: 'target_lost' });
    return false;
  }
  if (host.time < run.endsAt - 1e-9) return false;
  const def = DRIVE_TIERS[run.tier];
  const dir = impactDir(runner, target);
  const pos = run.completes ? clone(target.pos) : clone(runner.pos);
  host.emit({ t: host.time, type: 'drive_run_impact', runnerId: runner.id, targetId: target.id, pos, dir, success: run.completes });
  if (run.completes) {
    host.destroyShip(target, runner, 'drive_attack');
    if (def.collateralKm > 0) {
      for (const s of host.ships) {
        if (s.role !== 'reaper_destroyer' || !present(host, s) || !gridFilterPasses(runner, s)) continue;
        if (dist(s.pos, pos) <= def.collateralKm) host.destroyShip(s, runner, 'drive_attack');
      }
    }
  } else if (def.failHullDamage > 0) {
    const dmg = def.failHullDamage * target.maxHull;
    target.hull = Math.max(0, target.hull - dmg);
    target.stats.damageTaken += dmg;
    runner.stats.damageDealt += dmg;
    target.lastHitAt = host.time;
    if (target.hull <= 0) host.destroyShip(target, runner, 'drive_attack');
  }
  host.destroyShip(runner, undefined, 'drive_attack');
  return true;
}

import { isDamageType, flagshipMissionKillEvent, heaviestAntiCapitalMount } from './flagships';
import type { SimKernel } from './kernel';
import { attackerOf } from './reaperAi';
import { gridFilterPasses } from './spatial';
import { startApproach, startStrafe, strafeWaypoints } from './scriptedMoves';
import type { BattleSimulation } from './battle';
import type { DestructionCause, ShipState, Subsystems, WeaponState } from './types';

/**
 * Scripted specials (`sim.special`; CINEMATIC_DESIGN.md §1.6, WORK_BREAKDOWN.md §1.3.7, T13): one implementation for
 * the beats, the showcase scenes, the tests and — through `hadesStrike` without `force` — the player's HADES order.
 * Every method returns `'skipped'` for an unknown, dead or absent ship and `'applied'` otherwise, draws only from
 * `sim.rng`, and logs a `scripted_event` (`forced: true` when it overrides an outcome: a forced hit, a scripted
 * destruction, a state write, a mission kill, a scripted withdrawal).
 */

export type SpecialResult = 'applied' | 'skipped';
export type { DriveRunState, InterposeState } from './types';
export { flagshipTier } from './flagships';

export interface Specials {
  driveAttack(runnerId: string, targetId: string, opts?: { window?: number; force?: 'success' | 'intercept'; ignoreCorridor?: boolean; beatId?: string }): SpecialResult;
  hadesStrike(shooterId: string, targetId: string, opts?: { rounds?: number; force?: 'hit_penetrating'; outage?: 'weapons' | 'engines'; beatId?: string }): SpecialResult;
  approach(shipId: string, targetId: string, opts: { km: number; seconds: number; passThrough?: boolean; beatId?: string }): SpecialResult;
  strafeThrough(shipId: string, targetId: string, opts: { seconds: number; beatId?: string }): SpecialResult;
  novaStrike(shooterId: string, targetId: string, opts?: { withThanix?: boolean; force?: 'hit'; beatId?: string }): SpecialResult;
  missionKill(shipId: string, opts?: { weapons?: number; engines?: number; beatId?: string }): SpecialResult;
  destroy(shipId: string, opts?: { killerId?: string; ifHullBelow?: number; cause?: DestructionCause; beatId?: string }): SpecialResult;
  setHullFraction(shipId: string, fraction: number, opts?: { onlyLower?: boolean; beatId?: string }): SpecialResult;
  setBarrierFraction(shipId: string, fraction: number, opts?: { onlyLower?: boolean; beatId?: string }): SpecialResult;
  setSubsystem(shipId: string, subsystem: keyof Subsystems, level: number, opts?: { beatId?: string }): SpecialResult;
  withdrawShip(shipId: string, opts?: { beatId?: string }): SpecialResult;
  interpose(shipId: string, protectId: string, opts?: { againstId?: string; seconds?: number; beatId?: string }): SpecialResult;
  /** Ship-level forced target (scripted, `FORCE_TARGET_SECONDS` unless `seconds`); `forceNextShot` arms the heaviest anti-capital mount. */
  forceTarget(shipIds: string[], targetId: string, forceNextShot?: 'hit' | 'hit_penetrating', seconds?: number): void;
  /** Deploys the fleets' craft; `burst` empties up to that many from each hangar in one tick (`launch_drones`). */
  launchDrones(fleetIds: string[], burst?: number): void;
}

/** The Black Fleet drive-attack tiers (AP §9; the run itself is CORE T14). */
export const DRIVE_TIERS: Record<'rare' | 'upper', { window: number; completion: number; maxAttempts: number; collateralKm: number; failHullDamage: number }> = {
  rare: { window: 40, completion: 0.25, maxAttempts: 3, collateralKm: 0, failHullDamage: 0 },
  upper: { window: 30, completion: 0.35, maxAttempts: 5, collateralKm: 1.5, failHullDamage: 0.3 },
};

/** An unconsumed forced shot lapses after this long (`forced_shot_expired`). */
export const FORCED_SHOT_SECONDS = 6;
/** A scripted forced target holds this long unless a `seconds` is given (SIMULATION_ESTIMATE: long enough to mature a solution, 10 s, and fire). */
export const FORCE_TARGET_SECONDS = 20;
/** A scripted interpose lasts this long unless a `seconds` is given. */
export const INTERPOSE_SECONDS = 20;
/** `missionKill` defaults (CINEMATIC_DESIGN.md §1.6): weapons 0.1 (weapon factor 0.4 + 0.6 × 0.1 = 0.46: a wounded Reaper still kills), engines 0.3. */
export const MISSION_KILL = { weapons: 0.1, engines: 0.3 } as const;

/** What a forced shot carries beyond the contract's `forcedShot` fields. */
export interface ForcedShotExtra {
  /** The shot is a HADES penetrator: without `penetrate` only when the gate is open (the hold is lifted for it). */
  hades: boolean;
  outage?: 'weapons' | 'engines';
  /** Further forced shots queued on this mount after this one (`hadesStrike.rounds`). */
  repeats: number;
}
const FORCED_EXTRA = new WeakMap<WeaponState, ForcedShotExtra>();

/** The extra data of a mount's forced shot (undefined for a plain forced hit). */
export const forcedShotExtra = (w: WeaponState): ForcedShotExtra | undefined => FORCED_EXTRA.get(w);

/**
 * After a forced shot has left the mount: re-arm a queued repeat (it lapses `FORCED_SHOT_SECONDS` after the mount has
 * reloaded — `reloadSeconds` at the hull's current weapon factor) or clear it.
 */
export function consumeForcedShot(w: WeaponState, time: number, reloadSeconds = 0): void {
  const fs = w.forcedShot;
  const extra = FORCED_EXTRA.get(w);
  if (fs && extra && extra.repeats > 0) {
    extra.repeats--;
    w.forcedShot = { ...fs, expiresAt: time + Math.max(0, reloadSeconds) + FORCED_SHOT_SECONDS };
    return;
  }
  w.forcedShot = undefined;
  FORCED_EXTRA.delete(w);
}

/** Drops an unconsumed forced shot (expired); the caller emits `forced_shot_expired`. */
export function dropForcedShot(w: WeaponState): void {
  w.forcedShot = undefined;
  FORCED_EXTRA.delete(w);
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export function createSpecials(sim: BattleSimulation, k: SimKernel): Specials {
  const present = (s: ShipState | undefined): s is ShipState => s !== undefined && s.alive && !s.escaped && !k.pending(s);
  const ship = (id: string): ShipState | undefined => {
    const s = sim.getShip(id);
    return present(s) ? s : undefined;
  };
  const log = (special: string, shipIds: string[], forced: boolean, beatId?: string, detail?: Record<string, number>): void =>
    k.emit({ t: sim.time, type: 'scripted_event', ...(beatId ? { beatId } : {}), special, shipIds, forced, ...(detail ? { detail } : {}) });
  const armForcedShot = (w: WeaponState, targetId: string, hit: boolean, penetrate: boolean, extra?: ForcedShotExtra): void => {
    w.forcedShot = { targetId, hit, penetrate, expiresAt: sim.time + FORCED_SHOT_SECONDS };
    if (extra) FORCED_EXTRA.set(w, extra);
    else FORCED_EXTRA.delete(w);
  };
  const forceShipTarget = (s: ShipState, targetId: string, seconds: number): void => {
    s.forcedTargetId = targetId;
    s.forcedTargetUntil = sim.time + seconds;
    s.targetId = targetId;
  };

  return {
    driveAttack(runnerId, targetId) {
      // The Black Fleet drive attack is CORE T14 (eligibility, tiers, run kinematics). Until then nothing starts a run;
      // under canon and every non-Apex preset (`driveAttacks: 'off'`) this is the correct answer anyway.
      void runnerId;
      void targetId;
      return 'skipped';
    },

    hadesStrike(shooterId, targetId, opts = {}) {
      const shooter = ship(shooterId);
      const target = ship(targetId);
      if (!shooter || !target || shooter === target || !gridFilterPasses(shooter, target)) return 'skipped';
      const mounts = shooter.weapons.filter((w) => w.def.hadesRound && (w.specialAmmo ?? 0) > 0);
      if (mounts.length === 0) return 'skipped';
      const rounds = Math.max(1, Math.floor(opts.rounds ?? 1));
      const forced = opts.force === 'hit_penetrating';
      // One forced shot per mount, extra rounds queued round-robin on the same mounts (never beyond the magazine).
      mounts.forEach((w, i) => {
        const share = Math.floor(rounds / mounts.length) + (i < rounds % mounts.length ? 1 : 0);
        if (share <= 0) return;
        w.cooldown = 0;
        armForcedShot(w, target.id, forced, forced, { hades: true, outage: opts.outage, repeats: Math.min(share, w.specialAmmo ?? 0) - 1 });
        k.emit({ t: sim.time, type: 'strike_scheduled', shipId: shooter.id, weaponId: w.def.id, at: sim.time, kind: 'hades' });
      });
      forceShipTarget(shooter, target.id, FORCED_SHOT_SECONDS);
      log('hades_strike', [shooter.id, target.id], forced, opts.beatId);
      return 'applied';
    },

    approach(shipId, targetId, opts) {
      const s = ship(shipId);
      const t = ship(targetId);
      if (!s || !t || s === t || s.maxSpeed <= 0 || !(opts.km > 0) || !(opts.seconds > 0)) return 'skipped';
      startApproach(s, t, opts.km, sim.time + opts.seconds, opts.passThrough ?? false, opts.beatId);
      log('approach', [s.id, t.id], false, opts.beatId);
      return 'applied';
    },

    strafeThrough(shipId, targetId, opts) {
      const s = ship(shipId);
      const t = ship(targetId);
      if (!s || !t || s.role !== 'fighter' || !strafeWaypoints(t) || !(opts.seconds > 0)) return 'skipped';
      startStrafe(s, t, sim.time + opts.seconds, opts.beatId);
      log('strafe_through', [s.id, t.id], false, opts.beatId);
      return 'applied';
    },

    novaStrike(shooterId, targetId, opts = {}) {
      const shooter = ship(shooterId);
      const target = ship(targetId);
      if (!shooter || !target || shooter === target || !gridFilterPasses(shooter, target)) return 'skipped';
      const nova = shooter.weapons.find((w) => w.def.id === 'nova_array' && (w.ammo === undefined || w.ammo > 0)) ?? shooter.weapons.find((w) => w.def.id === 'nova_legacy' && (w.ammo === undefined || w.ammo > 0));
      if (!nova) return 'skipped';
      const hit = opts.force === 'hit';
      nova.cooldown = 0;
      armForcedShot(nova, target.id, hit, false);
      k.emit({ t: sim.time, type: 'strike_scheduled', shipId: shooter.id, weaponId: nova.def.id, at: sim.time, kind: nova.def.id === 'nova_legacy' ? 'nova_legacy' : 'nova' });
      if (opts.withThanix) {
        // The heavy Thanix channels follow 0.2–0.4 s later, so the strike lands in one tight interval (AP §8, card 19).
        for (const w of shooter.weapons) {
          if (w.def.id !== 'thanix_heavy') continue;
          w.cooldown = 0.2 + 0.2 * sim.rng.next();
          armForcedShot(w, target.id, hit, false);
        }
      }
      forceShipTarget(shooter, target.id, FORCED_SHOT_SECONDS);
      log('nova_strike', [shooter.id, target.id], hit, opts.beatId);
      return 'applied';
    },

    missionKill(shipId, opts = {}) {
      const s = ship(shipId);
      if (!s) return 'skipped';
      const weapons = clamp01(opts.weapons ?? MISSION_KILL.weapons);
      const engines = clamp01(opts.engines ?? MISSION_KILL.engines);
      // A pending HADES outage on these subsystems would hand its drop back later and undo part of the mission kill.
      if (s.outageUntil && (s.outageUntil.subsystem === 'weapons' || s.outageUntil.subsystem === 'engines')) s.outageUntil = undefined;
      s.subsystems.weapons = Math.min(s.subsystems.weapons, weapons);
      s.subsystems.engines = Math.min(s.subsystems.engines, engines);
      // Active beams are cut; the hull stays alive and keeps fighting at the reduced weapon factor (no shutdown mechanic).
      for (const w of s.weapons) {
        w.beamRemaining = 0;
        w.beamTargetId = undefined;
        w.beamEnd = undefined;
        w.beamStart = undefined;
        w.beamMembers = undefined;
      }
      k.emit({ t: sim.time, type: 'subsystem_disabled', shipId: s.id, subsystem: 'weapons', level: s.subsystems.weapons });
      k.emit({ t: sim.time, type: 'subsystem_disabled', shipId: s.id, subsystem: 'engines', level: s.subsystems.engines });
      k.emit({ t: sim.time, type: 'mission_kill', shipId: s.id });
      const fe = flagshipMissionKillEvent(sim.rng.fork(`flagship:${s.id}:mk`), sim.time, s);
      if (fe) k.emit(fe);
      log('mission_kill', [s.id], true, opts.beatId);
      return 'applied';
    },

    destroy(shipId, opts = {}) {
      const s = ship(shipId);
      if (!s) return 'skipped';
      if (opts.ifHullBelow !== undefined && s.hull / Math.max(1e-9, s.maxHull) >= opts.ifHullBelow) return 'skipped';
      const killer = opts.killerId ? sim.getShip(opts.killerId) : undefined;
      const cause: DestructionCause = opts.cause ?? 'scripted';
      // A named killer and a weapon cause name the killer's heaviest anti-capital mount, so the banner's
      // "KILLED BY … —" line is never empty even when no weapon actually fired (AP §22.2).
      const mount = killer && isDamageType(cause) ? (heaviestAntiCapitalMount(killer.weapons) ?? killer.weapons[0]) : undefined;
      log('destroy', [s.id, ...(killer ? [killer.id] : [])], true, opts.beatId);
      k.destroyShip(s, killer, cause, mount?.def.id);
      return 'applied';
    },

    setHullFraction(shipId, fraction, opts = {}) {
      const s = ship(shipId);
      if (!s) return 'skipped';
      const target = clamp01(fraction) * s.maxHull;
      if (!(opts.onlyLower && target >= s.hull)) s.hull = target;
      log('set_hull_fraction', [s.id], true, opts.beatId, { fraction: clamp01(fraction) });
      if (s.hull <= 0) k.destroyShip(s, undefined, 'scripted');
      else k.noteFlightLosses(s);
      return 'applied';
    },

    setBarrierFraction(shipId, fraction, opts = {}) {
      const s = ship(shipId);
      if (!s) return 'skipped';
      const target = clamp01(fraction) * s.maxBarriers;
      const before = s.barriers;
      if (!(opts.onlyLower && target >= s.barriers)) s.barriers = target;
      if (before > 0 && s.barriers <= 0) k.emit({ t: sim.time, type: 'barriers_down', shipId: s.id });
      log('set_barrier_fraction', [s.id], true, opts.beatId, { fraction: clamp01(fraction) });
      return 'applied';
    },

    setSubsystem(shipId, subsystem, level, opts = {}) {
      const s = ship(shipId);
      if (!s || !(subsystem in s.subsystems)) return 'skipped';
      const before = s.subsystems[subsystem];
      s.subsystems[subsystem] = clamp01(level);
      if (s.subsystems[subsystem] < before) k.emit({ t: sim.time, type: 'subsystem_disabled', shipId: s.id, subsystem, level: s.subsystems[subsystem] });
      log('set_subsystem', [s.id], true, opts.beatId, { level: s.subsystems[subsystem] });
      return 'applied';
    },

    withdrawShip(shipId, opts = {}) {
      const s = ship(shipId);
      if (!s || s.role === 'fighter' || s.maxSpeed <= 0) return 'skipped';
      // A scripted withdrawal is the tactical fall-back to the recovery station (never an exit); Reapers only by script
      // or under the Apex doctrine (AP §10).
      if (!s.withdrawing) k.withdraw(s);
      log('withdraw_ship', [s.id], true, opts.beatId);
      return 'applied';
    },

    interpose(shipId, protectId, opts = {}) {
      const s = ship(shipId);
      const p = ship(protectId);
      if (!s || !p || s === p || s.side !== p.side || s.maxSpeed <= 0) return 'skipped';
      const against = opts.againstId ? ship(opts.againstId) : attackerOf(sim, p);
      s.interpose = { protectId: p.id, ...(against ? { againstId: against.id } : {}), until: sim.time + (opts.seconds ?? INTERPOSE_SECONDS) };
      log('interpose', [s.id, p.id, ...(against ? [against.id] : [])], false, opts.beatId);
      return 'applied';
    },

    forceTarget(shipIds, targetId, forceNextShot, seconds = FORCE_TARGET_SECONDS) {
      const t = ship(targetId);
      if (!t) return;
      const ids: string[] = [];
      for (const id of shipIds) {
        const s = ship(id);
        // Only a hostile hull can be a scripted target (two hulls are enemies on different sides or when exactly one is rogue).
        if (!s || s === t || !gridFilterPasses(s, t)) continue;
        forceShipTarget(s, t.id, seconds);
        ids.push(s.id);
        if (forceNextShot) {
          const w = heaviestAntiCapitalMount(s.weapons);
          if (w) {
            const penetrate = forceNextShot === 'hit_penetrating';
            w.cooldown = 0;
            armForcedShot(w, t.id, true, penetrate, penetrate && w.def.hadesRound && (w.specialAmmo ?? 0) > 0 ? { hades: true, repeats: 0 } : undefined);
          }
        }
      }
      if (ids.length > 0) log('force_target', [...ids, t.id], forceNextShot !== undefined, undefined);
    },

    launchDrones(fleetIds, burst) {
      for (const id of fleetIds) {
        const fleet = sim.fleets.get(id);
        if (!fleet) continue;
        fleet.orders.fightersDeployed = true;
        let any = false;
        for (const s of sim.membersOf(id)) {
          if (!s.hangar || s.hangar.remaining <= 0) continue;
          s.hangar.launchTimer = 0;
          if (burst !== undefined && burst > 0) s.hangar.burst = Math.floor(burst);
          any = true;
        }
        if (any) k.comms(fleet.spec.side, 'fighters_launch', undefined, fleet);
      }
    },
  };
}


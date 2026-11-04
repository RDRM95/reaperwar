import type { Rng } from '@/core/rng';
import { scale, v3, type Vec3 } from '@/core/vec3';
import { FACTIONS, type FactionDoctrine } from '@/data/factions';
import { isCapitalRole } from '@/data/types';
import type { RuleSet } from '@/timelines/rules';
import { ARC_VERTICAL_REACH, BATTLESPACE_SCALE as S } from './constants';
import { slotToWorld } from './formations';
import {
  REWITHDRAW_COOLDOWN,
  WITHDRAWAL,
  carrierGoal,
  fighterPassGoal,
  fleetMotion,
  frigateRunGoal,
  frigateRuns,
  reaperAdvanceGoal,
  recoveryStation,
  shipMotion,
  standoffOf,
  stationGoal,
  stationThreatened,
  steerFleet,
  type FleetView,
} from './movement';
import { solutionFor } from './solutions';
import { detectable, hunterGoal, hunterTarget } from './stealth';
import type { FleetState, ShipState, TargetPriority } from './types';

/**
 * Tactical AI. Fleet-level decisions move the formation anchor and pick a
 * focus target; ship-level decisions pick targets and desired positions.
 * The battle loop turns desired positions into physical motion.
 */

export interface AiContext {
  time: number;
  rng: Rng;
  rules: RuleSet;
  ships: ShipState[];
  fleets: Map<string, FleetState>;
  enemiesOf(side: 'A' | 'B'): ShipState[];
  alliesOf(side: 'A' | 'B'): ShipState[];
  getShip(id: string): ShipState | undefined;
  /** The per-ship targeting set: the other side plus every rogue hull (AP §4.1). */
  enemiesOfShip(ship: ShipState): ShipState[];
  /** Living, present, non-fighter enemies of a side (cached per tick). */
  enemyCombatants(side: 'A' | 'B'): ShipState[];
  /** Point-weighted centroid of the enemy combatants (cached per tick). */
  enemyCentroid(side: 'A' | 'B'): Vec3 | undefined;
  /** Living, present members of a fleet (cached per tick). */
  membersOf(fleetId: string): ShipState[];
  /** Target candidates within `radius` of the ship through the spatial grid, capped (AP §21.5), in ship-index order. */
  candidates(ship: ShipState, radius: number): ShipState[];
}

/** The expensive part of a fleet decision (member lists, centroids, ranges) is refreshed on this timer (AP §21.5 stagger). */
export const FLEET_SLOW_INTERVAL = 0.25;

export interface MovementGoal {
  position: Vec3;
  /** Desired speed fraction (0..1) of max speed. */
  speedFraction: number;
  /** Optional facing target (world point). */
  face?: Vec3;
  /** The goal's own velocity (a slot moving with its anchor): the station-keeping controller tracks it. */
  velocity?: Vec3;
  /** Fly straight at the point at the speed fraction (runs, passes, transits) instead of keeping station on it. */
  transit?: boolean;
  /** Velocity bias added after steering (point-defence repulsion of small craft). */
  repel?: Vec3;
}

export const doctrineOf = (ship: ShipState): FactionDoctrine => FACTIONS[ship.faction].doctrine;

export function centroid(ships: ShipState[]): Vec3 | undefined {
  if (ships.length === 0) return undefined;
  const c = v3();
  let w = 0;
  for (const s of ships) {
    const weight = Math.max(1, s.pointValue);
    c.x += s.pos.x * weight;
    c.y += s.pos.y * weight;
    c.z += s.pos.z * weight;
    w += weight;
  }
  return scale(c, 1 / w);
}

/** A fleet with no anti-ship weapon at all engages at this range (compressed km). */
const FALLBACK_ENGAGEMENT_RANGE = 20 * S;

/**
 * Longest-range anti-capital weapon in the fleet (compressed km, like every weapon range in the simulation). The
 * v0.11 floor of 20 was a nominal-km figure compared with compressed ranges, so every fleet engaged as if it had a
 * 50 km (nominal) gun; the floor now applies only to a fleet with no anti-ship weapon.
 */
export function fleetEngagementRange(fleetShips: ShipState[]): number {
  let r = 0;
  for (const s of fleetShips) {
    if (s.role === 'fighter') continue;
    for (const w of s.weapons) if (w.def.antiCapital || !w.def.antiSmall) r = Math.max(r, w.def.range);
  }
  return r > 0 ? r : FALLBACK_ENGAGEMENT_RANGE;
}

export function priorityMultiplier(priority: TargetPriority, target: ShipState): number {
  switch (priority) {
    case 'reaper_destroyers':
      return target.role === 'reaper_destroyer' ? 4 : 1;
    case 'reaper_capitals':
      return target.role === 'reaper_capital' ? 4 : 1;
    case 'capitals':
      return isCapitalRole(target.role) ? 4 : 1;
    case 'escorts':
      return target.role === 'frigate' || target.role === 'cruiser' || target.role === 'reaper_destroyer' ? 3 : 1;
    case 'fighters':
      return target.role === 'fighter' ? 4 : 1;
    default:
      return 1;
  }
}

/**
 * Score a candidate target for a shooter. Higher is better.
 */
export function scoreTarget(ctx: AiContext, shooter: ShipState, fleet: FleetState, target: ShipState, mainRange: number): number {
  const d = doctrineOf(shooter);
  const ddx = target.pos.x - shooter.pos.x;
  const ddy = target.pos.y - shooter.pos.y;
  const ddz = target.pos.z - shooter.pos.z;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
  // Threat: how dangerous the target is to us (point value is a good proxy).
  const threat = Math.log2(1 + target.pointValue) / 12;
  const wounded = 1 - target.hull / target.maxHull;
  const barriersDown = target.barriers <= 0 ? 0.25 : 0;
  // A maturing firing solution concentrates fire (AP §19 8.7: scoreTarget += 0.3·q).
  let score = 0.4 + threat * d.threatPriority * 2 + wounded * d.finishWounded + barriersDown + 0.3 * solutionFor(shooter, target.id);
  // Range preference: in range is good, far beyond range is bad.
  if (dist > mainRange) score *= Math.max(0.1, 1 - (dist - mainRange) / mainRange);
  else score *= 1 + 0.2 * (1 - dist / mainRange);
  const craft = shooter.role === 'fighter';
  // Fighters are poor targets for capital guns.
  if (target.role === 'fighter' && !craft) score *= 0.05;
  // Focus fire: the fleet focus is the line's fire-control choice (always a hull). Small craft fly their own missions
  // and follow the fleet priority instead — with the focus bonus a Trident flew torpedo runs at a muted capital while
  // the drones shot it down (BALANCE_AUDIT.md §9.2: "a massacre, not a fight").
  if (!craft && fleet.focusTargetId === target.id) score *= 1 + d.focusFire * 2 * (fleet.orders.focusFire ? 1.5 : 1);
  // Player priority. Craft carrying anti-small guns switch to the screen automatically when enemy craft appear
  // (AP §13.1: the 'fighters' weight kicks in for anti-small weapons; it never stacks with the order itself).
  let pm = priorityMultiplier(fleet.orders.priority, target);
  if (craft && target.role === 'fighter' && pm < CRAFT_SCREEN_WEIGHT && carriesAntiSmall(shooter)) pm = CRAFT_SCREEN_WEIGHT;
  score *= pm;
  // Stickiness — except that a craft ordered onto the fighters does not stick to a hull.
  if (shooter.targetId === target.id && !(craft && fleet.orders.priority === 'fighters' && target.role !== 'fighter')) score *= 1.3;
  // Protect capitals: escorts favour enemies that are attacking our capitals.
  if (fleet.orders.protectCapitals && (shooter.role === 'frigate' || shooter.role === 'cruiser')) {
    const tgt = target.targetId ? ctx.getShip(target.targetId) : undefined;
    if (tgt && isCapitalRole(tgt.role) && tgt.side === shooter.side) score *= 1.8;
  }
  // Reapers clear the orbital defence network first (AP §10, brief §8.10) — except while the fleet holds a
  // pending volley, so a scripted answer lands on the line rather than on the stations (AP §4.2).
  if (
    shooter.faction === 'reaper' &&
    shooter.role !== 'fighter' &&
    target.role === 'fixed_platform' &&
    (fleet.orders.order === 'attack' || fleet.orders.order === 'advance') &&
    !fleet.volley &&
    dist <= PLATFORM_WEIGHT_RANGE * mainRange
  )
    score *= PLATFORM_WEIGHT;
  // A flight is scored as the craft it stands for (AP §21.3).
  if (target.flight) score *= Math.max(1, target.flight.craft);
  return score;
}

/** A craft armed with anti-small guns weighs enemy craft like the 'fighters' priority does (AP §13.1). */
export const CRAFT_SCREEN_WEIGHT = 4;

/** Whether a hull carries any anti-small weapon. */
const carriesAntiSmall = (ship: ShipState): boolean => ship.weapons.some((w) => w.def.antiSmall);

/** Reaper target weight against fixed platforms within `PLATFORM_WEIGHT_RANGE` × the shooter's range (AP §10). */
export const PLATFORM_WEIGHT = 2.5;
export const PLATFORM_WEIGHT_RANGE = 1.3;

/**
 * Time constant of the slew penalty (SIMULATION_ESTIMATE, TUNE): a target that needs this many seconds of turning
 * before any anti-ship mount bears on it scores half. A Reaper capital turns at 6°/s behind a ±35° beam arc, so a
 * re-target 146° off the bow cost about 20 s of silence (one burst per 22 s instead of one per 6.4 s) while frigates
 * sat inside its arc and range — the hull must prefer what it can bring to bear (brief §8.6: every unit with a
 * weapon in range fires or moves to get a solution).
 */
export const SLEW_TAU = 6;
/** A target steeply above or below an arc-limited mount scores as if it needed this many seconds of turning (factor 0.25). */
export const VERTICAL_SLEW_S = 3 * SLEW_TAU;

/**
 * Seconds of turning before one of the hull's anti-ship mounts bears on `target` (0 when a mount already does, or
 * a turreted mount covers every bearing). Mounts that reach the target are judged first; when none reaches, every
 * anti-ship mount counts (the hull closes anyway). Mounts of one hardpoint share facing and arc, so only the first
 * of each is evaluated; an empty magazine does not count. A target outside an arc-limited mount's vertical reach
 * (`ARC_VERTICAL_REACH`) cannot be brought to bear by turning at all: it counts as `VERTICAL_SLEW_S`.
 */
export function slewSeconds(ship: ShipState, target: ShipState, dist: number): number {
  const rate = ship.turnRate * (0.3 + 0.7 * ship.subsystems.engines);
  const yaw = Math.atan2(ship.heading.x, ship.heading.z);
  const bearing = Math.atan2(target.pos.x - ship.pos.x, target.pos.z - ship.pos.z);
  const steep = dist > 1e-6 && Math.abs(target.pos.y - ship.pos.y) / dist >= ARC_VERTICAL_REACH;
  let reach = Infinity;
  let any = Infinity;
  for (const w of ship.weapons) {
    if (w.mount !== 0 || w.def.antiSmall || (w.ammo !== undefined && w.ammo <= 0)) continue;
    let off = 0;
    if (w.def.arc < 360) {
      let diff = bearing - yaw - w.facing;
      diff -= 2 * Math.PI * Math.round(diff / (2 * Math.PI));
      off = Math.max(0, Math.abs(diff) - ((w.def.arc / 2) * Math.PI) / 180 - 0.05);
    }
    let s = off <= 0 ? 0 : rate > 0 ? off / rate : Infinity;
    if (steep && w.def.arc < 360) s = Math.max(s, VERTICAL_SLEW_S);
    if (dist <= w.def.range && s < reach) reach = s;
    if (s < any) any = s;
  }
  const s = Number.isFinite(reach) ? reach : any;
  return Number.isFinite(s) ? s : 0;
}

/** Score multiplier of the slew penalty: `SLEW_TAU / (SLEW_TAU + slew)` (1 for a target a mount already bears on). */
export const slewFactor = (ship: ShipState, target: ShipState, dist: number): number => {
  const s = slewSeconds(ship, target, dist);
  return s > 0 ? SLEW_TAU / (SLEW_TAU + s) : 1;
};

export function chooseTarget(ctx: AiContext, ship: ShipState, fleet: FleetState): string | undefined {
  if (ship.forcedTargetId) {
    const t = ctx.getShip(ship.forcedTargetId);
    if (t && t.alive && !t.escaped && detectable(ship, t)) return t.id;
    ship.forcedTargetId = undefined;
  }
  // Candidates within 1.5 × the (damaged) sensor range through the spatial grid, capped (AP §21.5).
  const sensor = ship.sensorRange * (0.4 + 0.6 * ship.subsystems.sensors);
  const enemies = ctx.candidates(ship, sensor * 1.5);
  if (enemies.length === 0) return undefined;
  let mainRange = 8;
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.range > mainRange) mainRange = w.def.range;
  let best: ShipState | undefined;
  let bestScore = -Infinity;
  const fighterWithoutGuns = ship.role === 'fighter' && !ship.weapons.some((w) => w.def.antiSmall);
  // A craft that can only burn small craft (the Oculus: anti-small only, "it cannot hurt a hull", BALANCE_AUDIT.md §9.2)
  // engages small craft only; it never strafes a hull it cannot damage.
  const craftWithoutAntiShip = ship.role === 'fighter' && !ship.weapons.some((w) => !w.def.antiSmall);
  const craftShooter = ship.role === 'fighter';
  for (const e of enemies) {
    if (!e.alive || e.escaped) continue;
    if (fighterWithoutGuns && e.role === 'fighter') continue;
    if (craftWithoutAntiShip && e.role !== 'fighter') continue;
    // A silent stealth hull beyond its detection range cannot be targeted (brief §15.2).
    if (!detectable(ship, e)) continue;
    let s = scoreTarget(ctx, ship, fleet, e, mainRange);
    // Slow-turning hulls prefer what their mounts can bear on (craft manoeuvre onto their targets instead).
    if (!craftShooter) s *= slewFactor(ship, e, Math.hypot(e.pos.x - ship.pos.x, e.pos.y - ship.pos.y, e.pos.z - ship.pos.z));
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best?.id;
}

/** The slowly refreshed part of a fleet decision (AP §21.5: the expensive part of `fleetDecision` on a 0.25 s timer). */
interface FleetSlowState extends FleetView {
  /** Fighting members: alive, present, non-fighter, not withdrawing. */
  mine: ShipState[];
}

/** Per-fleet slow state; keyed by the fleet object so it dies with it and the contract types stay untouched. */
const FLEET_SLOW = new WeakMap<FleetState, FleetSlowState>();

/** Longest spinal-gun range among a fleet's dreadnought-class hulls (0 without one). */
function spinalRange(mine: ShipState[]): number {
  let r = 0;
  for (const s of mine) {
    if (s.role !== 'dreadnought' && s.role !== 'super_dreadnought') continue;
    for (const w of s.weapons) if (w.def.kind === 'mass_accelerator' && w.def.antiCapital && w.def.arc <= 20 && w.def.range > r) r = w.def.range;
  }
  return r;
}

/** Recomputes the member lists, centroids, ranges and anchor speed; re-evaluates the focus target when its timer has run out. */
function refreshFleetSlow(ctx: AiContext, fleet: FleetState): FleetSlowState {
  const doctrine = FACTIONS[fleet.spec.faction].doctrine;
  const mine = ctx.membersOf(fleet.spec.id).filter((s) => s.role !== 'fighter' && !s.withdrawing);
  const enemyCentre = ctx.enemyCentroid(fleet.spec.side);
  // Stealth hunters never hold a station, so they do not pull the anchor's lag clamp after them.
  const myCentre = centroid(mine.filter((s) => !s.stealth)) ?? fleet.anchor;
  const range = fleetEngagementRange(mine);
  let slotRadius = 0;
  // The capital line's width limits how fast the formation may turn (escort screens are excluded: they can catch up).
  for (const s of mine) if (!s.stealth && isCapitalRole(s.role)) slotRadius = Math.max(slotRadius, Math.hypot(s.slot.x, s.slot.z));
  const slow: FleetSlowState = { mine, enemyCentre, myCentre, anchorSpeed: 0, range, spinal: spinalRange(mine), slotRadius };
  if (mine.length === 0) return slow;

  // Focus target: periodically re-evaluated (never a silent stealth hull nobody can see).
  const current = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
  if (current && (!current.alive || current.escaped || (current.stealth && current.stealth.state === 'silent'))) fleet.focusTargetId = undefined;
  if (fleet.decisionTimer <= 0) {
    fleet.decisionTimer = doctrine.decisionInterval * (0.8 + 0.4 * ctx.rng.next());
    const cur = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
    if (!cur || !cur.alive || cur.escaped || ctx.rng.chance(0.3)) {
      const representative = mine.reduce((a, b) => (a.pointValue >= b.pointValue ? a : b));
      let best: ShipState | undefined;
      let bestScore = -Infinity;
      for (const e of ctx.enemyCombatants(fleet.spec.side)) {
        if (!detectable(representative, e)) continue;
        const s = scoreTarget(ctx, representative, fleet, e, range);
        if (s > bestScore) {
          bestScore = s;
          best = e;
        }
      }
      fleet.focusTargetId = best?.id;
    }
  }

  let slowest = Infinity;
  for (const s of mine) if (s.maxSpeed > 0) slowest = Math.min(slowest, s.maxSpeed * (0.3 + 0.7 * s.subsystems.engines));
  slow.anchorSpeed = Number.isFinite(slowest) ? slowest * 0.95 : 0;
  return slow;
}

/**
 * Fleet-level decision: choose the focus target and steer the formation. The member lists, centroids, ranges and
 * anchor speed are refreshed every `FLEET_SLOW_INTERVAL` (AP §21.5); the heading and anchor are steered every
 * tick against the cached view (`movement.ts`: approach bearing, heading lock, deceleration, standoff).
 */
export function fleetDecision(ctx: AiContext, fleet: FleetState, dt: number): void {
  fleet.decisionTimer -= dt;
  fleet.decisionSlowTimer -= dt;
  let slow = FLEET_SLOW.get(fleet);
  if (!slow || fleet.decisionSlowTimer <= 0) {
    fleet.decisionSlowTimer = FLEET_SLOW_INTERVAL;
    slow = refreshFleetSlow(ctx, fleet);
    FLEET_SLOW.set(fleet, slow);
  }
  const motion = fleetMotion(fleet);
  if (slow.mine.length === 0 || fleet.static) {
    // A static fleet (fixed platforms) never moves its anchor or turns its formation; its hulls slew on their own.
    motion.anchorVel = v3();
    return;
  }
  steerFleet(ctx, fleet, slow, dt);
}

/** The fleet's doctrine standoff distance, from the slow view (the recovery stations sit 0.6 × this behind the anchor). */
export function fleetStandoff(fleet: FleetState): number {
  const slow = FLEET_SLOW.get(fleet);
  return slow ? standoffOf(fleet, slow).standoff : 20;
}

/** Send a hull into tactical withdrawal: fall back to its recovery station behind the line (brief §8.6). */
export function beginWithdrawal(ctx: AiContext, ship: ShipState, fleet: FleetState): void {
  ship.withdrawing = true;
  ship.recoveryStation = recoveryStation(ship, fleet, fleetStandoff(fleet));
  shipMotion(ship).withdrawnAt = ctx.time;
}

/** Ship-level decision: refresh target, decide on tactical withdrawal and re-engagement. */
export function shipDecision(ctx: AiContext, ship: ShipState, fleet: FleetState): void {
  const d = doctrineOf(ship);
  const current = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  if (ship.stealth && ship.role !== 'fighter') {
    // Hunters keep their target through a pass; a new one is chosen between passes or when it is lost.
    const phase = ship.manoeuvre?.phase;
    const lost = !current || !current.alive || current.escaped || !detectable(ship, current);
    if (lost || phase === undefined || phase === 'turn' || (phase === 'approach' && ctx.rng.chance(0.2))) ship.targetId = hunterTarget(ctx, ship, fleet)?.id;
  } else if (!current || !current.alive || current.escaped || !detectable(ship, current) || ctx.rng.chance(0.35)) {
    ship.targetId = chooseTarget(ctx, ship, fleet);
  }
  // Tactical withdrawal: a battered ship falls back behind the line to let its barriers recover, then re-engages.
  const m = shipMotion(ship);
  if (!ship.withdrawing && d.withdrawThreshold > 0 && ship.role !== 'fighter') {
    const hullFrac = ship.hull / ship.maxHull;
    if (hullFrac < d.withdrawThreshold && ctx.time - m.reengagedAt >= REWITHDRAW_COOLDOWN && ctx.rng.chance(0.5)) beginWithdrawal(ctx, ship, fleet);
  } else if (ship.withdrawing) {
    const recovered = ship.maxBarriers === 0 || ship.barriers >= ship.maxBarriers * WITHDRAWAL.reengageBarrierFraction;
    const longEnough = ctx.time - m.withdrawnAt >= WITHDRAWAL.reengageSeconds;
    const threatened = ship.recoveryStation !== undefined && stationThreatened(ctx, ship, ship.recoveryStation, fleetStandoff(fleet));
    if ((recovered && longEnough) || threatened) {
      ship.withdrawing = false;
      ship.recoveryStation = undefined;
      m.reengagedAt = ctx.time;
    }
  }
}

/** Compute where the ship wants to be and where it wants to point (movement.ts turns it into motion). */
export function movementGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal {
  const target = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  const slotVel = fleetMotion(fleet).anchorVel;

  // Fighters and Oculi: recall and rearm at the carrier, else strafing passes.
  if (ship.role === 'fighter') {
    if ((!fleet.orders.fightersDeployed || ship.rearming) && ship.carrierId) {
      const carrier = ctx.getShip(ship.carrierId);
      if (carrier && carrier.alive) return { position: carrier.pos, speedFraction: 1, transit: true };
      if (ship.rearming) ship.rearming = false; // carrier lost: fight on with guns
    }
    if (target && target.alive) return fighterPassGoal(ctx, ship, target, ctx.candidates(ship, 3.2));
    ship.manoeuvre = undefined;
    return { position: slotToWorld(fleet.anchor, fleet.heading, ship.slot), speedFraction: 0.8, velocity: slotVel };
  }

  // Stealth frigates hunt; they never hold a station in the line (brief §15.2).
  if (ship.stealth) return hunterGoal(ctx, ship, fleet, target);

  // Tactical withdrawal: fall back to the recovery station behind the line, guns still bearing on the enemy.
  if (ship.withdrawing) {
    if (!ship.recoveryStation) ship.recoveryStation = recoveryStation(ship, fleet, fleetStandoff(fleet));
    return { position: ship.recoveryStation, speedFraction: 1, face: target?.pos ?? ctx.enemyCentroid(ship.side) };
  }

  // Escort order at ship level.
  if (ship.escortId) {
    const e = ctx.getShip(ship.escortId);
    if (e && e.alive) {
      const off = slotToWorld(e.pos, e.heading, scale(ship.slot, 0.35));
      return { position: off, speedFraction: 1, velocity: e.vel, face: target?.pos };
    }
  }

  const slotPos = slotToWorld(fleet.anchor, fleet.heading, ship.slot);
  if (target && target.alive && frigateRuns(ship, fleet)) return frigateRunGoal(ctx, ship, fleet, target);
  ship.manoeuvre = undefined;
  if (ship.role === 'carrier') return carrierGoal(ctx, ship, fleet, slotPos, slotVel, target);
  // Reapers never idle: with no target in range and the anchor stopped, close on the nearest enemy group.
  if (ship.faction === 'reaper') {
    const advance = reaperAdvanceGoal(ctx, ship, fleet, target);
    if (advance) return advance;
  }
  return stationGoal(ship, fleet, slotPos, slotVel, target);
}

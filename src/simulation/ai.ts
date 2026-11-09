import type { Rng } from '@/core/rng';
import { scale, v3, type Vec3 } from '@/core/vec3';
import { FACTIONS, type FactionDoctrine } from '@/data/factions';
import { isCapitalRole } from '@/data/types';
import type { RuleSet } from '@/timelines/rules';
import { ARC_VERTICAL_REACH, BATTLESPACE_SCALE as S } from './constants';
import { slotToWorld } from './formations';
import {
  CONTACT_RANGE_FACTOR,
  REWITHDRAW_COOLDOWN,
  WITHDRAWAL,
  bearVertically,
  carrierGoal,
  clearOfFriends,
  fighterPassGoal,
  fleetMotion,
  frigateRunGoal,
  frigateRuns,
  inContact,
  moveUpGoal,
  reaperAdvanceGoal,
  recoveryStation,
  separationRepel,
  shipMotion,
  standoffOf,
  stationGoal,
  stationOf,
  stationThreatened,
  steerFleet,
  type FleetView,
} from './movement';
import { REAPER_AI, coverDamagedCapital, interposeGoal, rotateProtection, transferGoal } from './reaperAi';
import { driveRunGoal } from './driveAttack';
import { scriptedGoal } from './scriptedMoves';
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
  /** The visible enemy combatant with the highest recent damage — the Reapers' "active gun platform" (AP §10; cached per tick). */
  activeGunPlatform(side: 'A' | 'B'): ShipState | undefined;
  /** Every live hull of either side within `radius` of `p` through the spatial grid (separation steering, brief §22). */
  hullsNear(p: Vec3, radius: number): ShipState[];
  /** Length of the largest live non-craft hull in the battle (km; cached per tick). */
  largestHullKm(): number;
  /** A scripted opening holds the player's orders (`BattleSimulation.playerLocked`); undefined outside a simulation. */
  readonly playerLocked?: boolean;
}

/** A craft farther than this from its carrier (else its fleet's anchor), chasing a target as far out, turns for home. */
export const CRAFT_LEASH_KM = 100 * S;

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
  /** Drive overload: multiplies the top speed and the acceleration (a Black Fleet drive run ramps it 1 → 4, AP §9). */
  boost?: number;
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
  // Reapers kill the active gun platform: +40 % for the enemy dealing the most damage right now (AP §10; never a
  // silent stealth hull — a stealth frigate counts only while it is revealed, brief §15.2).
  if (shooter.faction === 'reaper' && shooter.role !== 'fighter' && ctx.activeGunPlatform(shooter.side) === target) score *= REAPER_AI.gunPlatformBonus;
  // A rogue hull (hostile to both sides, AP §4.1) prefers the enemies of its own bookkeeping side: ×1.5 (the hostile
  // Cerberus group at the Final Battle goes for the Alliance and still fights the Reapers that shoot at it).
  if (shooter.rogue && !target.rogue && target.side !== shooter.side) score *= ROGUE_PREFERENCE;
  // A flight is scored as the craft it stands for (AP §21.3).
  if (target.flight) score *= Math.max(1, target.flight.craft);
  return score;
}

/** A target none of the line's capitals can reach still keeps this share of its focus score (it may come into reach). */
export const MASS_FLOOR = 0.25;

/** A rogue hull's weight against the other side (AP §4.1). */
export const ROGUE_PREFERENCE = 1.5;

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
    // Slow-turning hulls prefer what their mounts can bear on (craft manoeuvre onto their targets instead) — except
    // that a fleet's line turns onto its focus, the target it masses on (brief §22: the battlegroups fight as one line).
    const massing = ship.faction !== 'reaper' && e.id === fleet.focusTargetId;
    if (!craftShooter && !massing) s *= slewFactor(ship, e, Math.hypot(e.pos.x - ship.pos.x, e.pos.y - ship.pos.y, e.pos.z - ship.pos.z));
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
  const keepers = mine.filter((s) => !s.stealth);
  const myCentre = centroid(keepers) ?? fleet.anchor;
  // The same weighting over the slots: the fleet's centre off its anchor (movement.ts, the anchor's lag clamp).
  let slotCentre: Vec3 | undefined;
  if (keepers.length > 0) {
    const c = v3();
    let w = 0;
    for (const s of keepers) {
      const k = Math.max(1, s.pointValue);
      c.x += s.slot.x * k;
      c.y += s.slot.y * k;
      c.z += s.slot.z * k;
      w += k;
    }
    slotCentre = scale(c, 1 / w);
  }
  const range = fleetEngagementRange(mine);
  let slotRadius = 0;
  // The capital line's width limits how fast the formation may turn (escort screens are excluded: they can catch up).
  for (const s of mine) if (!s.stealth && isCapitalRole(s.role)) slotRadius = Math.max(slotRadius, Math.hypot(s.slot.x, s.slot.z));
  const slow: FleetSlowState = { mine, enemyCentre, myCentre, anchorSpeed: 0, range, spinal: spinalRange(mine), slotRadius, slotCentre };
  // Contact (brief §21.4, §22): an enemy combatant within 1.1 × the fleet's range of any of its hulls in the line.
  fleetMotion(fleet).contact = inContact(keepers, ctx.enemyCombatants(fleet.spec.side), CONTACT_RANGE_FACTOR * range);
  if (mine.length === 0) return slow;

  // Focus target: periodically re-evaluated (never a silent stealth hull nobody can see).
  const current = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
  if (current && (!current.alive || current.escaped || (current.stealth && current.stealth.state === 'silent'))) {
    fleet.focusTargetId = undefined;
    // The line takes its next target at once: left without a focus until the decision timer ran out (up to a decision
    // interval), each capital picked its own and the line's fire scattered just when the next kill had to be massed.
    fleet.decisionTimer = 0;
  }
  if (fleet.decisionTimer <= 0) {
    fleet.decisionTimer = doctrine.decisionInterval * (0.8 + 0.4 * ctx.rng.next());
    const cur = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
    if (!cur || !cur.alive || cur.escaped || ctx.rng.chance(0.3)) {
      const representative = mine.reduce((a, b) => (a.pointValue >= b.pointValue ? a : b));
      // The line masses on what it can reach: with the capitals spread across battlegroups (brief §22), each candidate
      // is weighed by the share of the fleet's line capitals that have it within their main battery's range — and, for
      // a battery on a forward or beam arc (a spinal gun), within its vertical reach (`ARC_VERTICAL_REACH`): the 3D
      // layouts stack groups in height, and a focus steeply over most of the line silenced its spinal guns for the
      // half-minute the hulls took to climb onto it (the Prime/Apex reference engagement lost on that, seeds 2 and 15).
      const line = mine.filter((s) => isCapitalRole(s.role) && s.role !== 'carrier' && !s.stealth);
      let best: ShipState | undefined;
      let bestScore = -Infinity;
      for (const e of ctx.enemyCombatants(fleet.spec.side)) {
        if (!detectable(representative, e)) continue;
        let s = scoreTarget(ctx, representative, fleet, e, range);
        if (line.length > 0) {
          let mass = 0;
          for (const c of line) {
            const d = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y, e.pos.z - c.pos.z);
            let reach = 0;
            let arcOnly = true;
            for (const w of c.weapons) {
              if (w.def.antiSmall || w.def.range <= reach) continue;
              reach = w.def.range;
              arcOnly = w.def.arc < 360;
            }
            if (d <= reach && (!arcOnly || d < 1e-6 || Math.abs(e.pos.y - c.pos.y) / d < ARC_VERTICAL_REACH)) mass++;
          }
          s *= MASS_FLOOR + mass / line.length;
        }
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
  // A static fleet (fixed platforms) never moves its anchor or turns its formation; its hulls slew on their own. A wave
  // still dropping in (`fleet.arrived` false: hulls waiting for their flash or running in on their scripted curve,
  // CINEMATIC_DESIGN.md §1.5) holds its anchor and heading until every hull has settled into its slot — the anchor's
  // lag clamp would otherwise chase the centroid of whichever hulls happen to be in already.
  if (slow.mine.length === 0 || fleet.static || !fleet.arrived) {
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
  const m = shipMotion(ship);
  m.withdrawnAt = ctx.time;
  // Whatever point it had moved up to is stale once it falls back; it closes again from where it re-engages.
  m.moveUp = undefined;
  m.outSince = -1;
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
  // Reaper capitals rotate protection and call destroyers in to cover them when damaged (AP §10, every preset).
  if (ship.role === 'reaper_capital') {
    rotateProtection(ctx, ship, fleet);
    coverDamagedCapital(ctx, ship);
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
  // A committed Black Fleet drive run is terminal: straight at its target with the drive overloaded (AP §9).
  if (ship.driveRun) {
    const run = driveRunGoal(ctx, ship);
    if (run) return run;
  }
  // A scripted move (`Specials.approach`, `Specials.strafeThrough`) overrides every other goal while it lasts.
  const scripted = scriptedGoal(ctx, ship);
  if (scripted) return scripted;
  // Every other hull keeps clear of every other hull by its size-scaled separation (brief §22).
  return withSeparation(ctx, ship, hullGoal(ctx, ship, fleet));
}

/**
 * Add the separation bias (brief §22) to a hull's goal, and keep a held goal clear of the hulls of its side
 * (`clearOfFriends`); small craft fly their own passes without either, and transits (runs, passes) keep their lines.
 */
function withSeparation(ctx: AiContext, ship: ShipState, goal: MovementGoal): MovementGoal {
  if (ship.role === 'fighter') return goal;
  let g = goal;
  if (!g.transit) {
    const p = clearOfFriends(ctx, ship, g.position);
    if (p !== g.position) g = { ...g, position: p };
  }
  const rep = separationRepel(ctx, ship);
  if (!rep) return g;
  const r = g.repel;
  return { ...g, repel: r ? v3(r.x + rep.x, r.y + rep.y, r.z + rep.z) : rep };
}

function hullGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal {
  const target = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  const slotVel = fleetMotion(fleet).anchorVel;

  // Fighters and Oculi: recall and rearm at the carrier, else strafing passes.
  if (ship.role === 'fighter') {
    if ((!fleet.orders.fightersDeployed || ship.rearming) && ship.carrierId) {
      const carrier = ctx.getShip(ship.carrierId);
      if (carrier && carrier.alive) return { position: carrier.pos, speedFraction: 1, transit: true };
      if (ship.rearming) ship.rearming = false; // carrier lost: fight on with guns
    }
    // A craft that has chased its target far out of the battle breaks off and turns for home (its carrier, else its
    // fleet): no conga line of fighters and drones flying on in a straight chase past every hull (brief §22).
    const home = ship.carrierId ? ctx.getShip(ship.carrierId) : undefined;
    const base = home && home.alive ? home.pos : fleet.anchor;
    const out = Math.hypot(ship.pos.x - base.x, ship.pos.y - base.y, ship.pos.z - base.z);
    if (out > CRAFT_LEASH_KM && (!target || Math.hypot(target.pos.x - base.x, target.pos.y - base.y, target.pos.z - base.z) > CRAFT_LEASH_KM)) {
      ship.manoeuvre = undefined;
      return { position: base, speedFraction: 1, transit: true };
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

  // Interpose: hold the line between a protectee and its attacker (Reaper cover, AP §10; Specials.interpose).
  if (ship.interpose) {
    const cover = interposeGoal(ctx, ship);
    if (cover) return cover;
  }

  // Escort order at ship level.
  if (ship.escortId) {
    const e = ctx.getShip(ship.escortId);
    if (e && e.alive) {
      const off = slotToWorld(e.pos, e.heading, scale(ship.slot, 0.35));
      return { position: off, speedFraction: 1, velocity: e.vel, face: target?.pos };
    }
  }

  // The station: on the group leader for an escort, on the anchor for a leader (brief §22).
  const station = stationOf(ctx, ship, fleet);
  // A capital in a rotate-protection slot exchange flies to its new slot first (AP §10).
  if (ship.role === 'reaper_capital') {
    const transfer = transferGoal(ctx, ship, station.pos, station.vel);
    if (transfer) return transfer;
  }
  if (target && target.alive && frigateRuns(ship, fleet)) return frigateRunGoal(ctx, ship, fleet, target);
  ship.manoeuvre = undefined;
  // Every goal from here on keeps the hull's arc-limited guns able to bear on its target (brief §22).
  return bearVertically(ship, stationedGoal(ctx, ship, fleet, station, target), target);
}

/** The goal of a hull in the line: moving up, advancing (Reapers), the carrier stand-off, or its station. */
function stationedGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, station: { pos: Vec3; vel: Vec3 }, target: ShipState | undefined): MovementGoal {
  // Reapers never idle: once engaged, with no target in range, close on the nearest enemy hull (Q3) — except a fleet a
  // scripted opening holds (the player locked out and the fleet ordered to hold: the Final Battle's blockade waits
  // below the coalition's plane for its advance beat, AP §4.2).
  if (ship.faction === 'reaper') {
    if (!(ctx.playerLocked === true && fleet.orders.order === 'hold_formation')) {
      const advance = reaperAdvanceGoal(ctx, ship, fleet, target);
      if (advance) return advance;
    }
  } else {
    // No organic hull idles at the back: out of reach for 10 s while engaged, it moves up (brief §22, Q2b).
    const up = moveUpGoal(ctx, ship, fleet);
    if (up) return up;
  }
  if (ship.role === 'carrier') return carrierGoal(ctx, ship, fleet, station.pos, station.vel, target);
  return stationGoal(ctx, ship, fleet, station.pos, station.vel, target);
}

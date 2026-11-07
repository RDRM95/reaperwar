import { dcos, dsin } from '@/core/detmath';
import { v3, type Vec3 } from '@/core/vec3';
import { FACTIONS } from '@/data/factions';
import { isCapitalRole } from '@/data/types';
import type { AiContext, MovementGoal } from './ai';
import { BATTLESPACE_SCALE as S } from './constants';
import { isGroupCapital, minSeparationKm, offsetToWorld, slotToWorld } from './formations';
import type { FleetState, OrderType, ShipState } from './types';

/**
 * Fleet and ship movement (brief §8.1, CINEMATIC_DESIGN.md §7.1; WORK_BREAKDOWN.md T10).
 *
 * Fleets close along an approach bearing, decelerate into engagement range and hold a line: the formation
 * heading re-aims only outside a deadband, at a few degrees per second at most (slower still when the
 * formation is wide), and locks once the enemy is inside engagement range, so slots never sweep around the
 * anchor like a turntable. Ships keep station with a critically damped controller on their slot (no orbit term
 * anywhere); frigates fly straight runs and turn-ins; fighters make strafing passes with point-defence
 * repulsion; carriers weave; Reapers advance as a loose cluster and never idle. Everything is a pure function
 * of the simulation state — no randomness is drawn here (seeded choices hash the ship id).
 */

export const MOVEMENT = { headingDeadbandRad: 0.1745, headingRateRad: 0.05, reaperHeadingRateRad: 0.03, lockRangeFactor: 1.1, unlockRangeFactor: 1.4, unlockSeconds: 8, kp: 0.5, kd: 1.4142 } as const;

/** Tactical withdrawal (brief §8.6, CINEMATIC_DESIGN.md §7.6). */
export const WITHDRAWAL = { recoveryStationFactor: 0.6, regenBoost: 1.5, reengageBarrierFraction: 0.7, reengageSeconds: 20, combatIneffectiveFraction: 0.05 } as const;

/** A re-engaged hull does not fall back again for this long (stops a battered hull flip-flopping between line and station). */
export const REWITHDRAW_COOLDOWN = 30;
/** A withdrawing hull's barriers recover ×`regenBoost` once it has been out of contact this long. */
export const WITHDRAWN_QUIET_SECONDS = 5;
/** The recovery station is threatened by an enemy within this fraction of the standoff distance. */
const STATION_THREAT_FACTOR = 0.5;
/** Lateral offset of a recovery station: ±3 km (compressed), seeded by the ship id. */
const STATION_LATERAL_KM = 3;

/** Alliance and Cerberus dreadnought lines hold at the outer band of their spinal guns (INTEGRATION_NOTES.md, owner). */
export const SPINAL_STANDOFF = { band: [0.8, 0.95] as const, want: 0.875 } as const;
/** A spinal line capital leans in to hold its gun target at `SPINAL_STANDOFF.want` by up to this × its spinal range. */
export const SPINAL_LEAN = 0.3;
const UNLOCK_OFF_BOW_RAD = Math.PI / 3;
const REAIM_DONE_RAD = 0.0175;
/** Wingtip speed of a turning formation stays under this fraction of its slowest hull's speed. */
const FORMATION_TIP_SPEED = 0.8;
const FORMATION_MIN_RATE = 0.02;
const DECEL_FRACTION = 0.2;
const DECEL_MIN = 0.15;
/** Disengage holds the fleet at this multiple of its standoff distance. */
const DISENGAGE_STANDOFF = 1.5;
/** Leash of a hull that closes on a target out of range (CINEMATIC_DESIGN.md §7.6), compressed km. */
const SLOT_LEASH_KM = 2;
/** Escorts (cruisers, frigates) screen forward of their slot up to this far to bring their own guns to bear. */
const SCREEN_LEASH_KM = 20;
/** Carriers and liveships keep at least this fraction of the nearest enemy's main range (CINEMATIC_DESIGN.md §7.6)… */
const CARRIER_KEEP_OUT = 0.8;
/** …but never more than this fraction of their own main range: they keep distance and still shoot (brief §8.6, §22). */
const CARRIER_OWN_REACH = 0.9;
const CARRIER_WEAVE_KM = 2;
const CARRIER_WEAVE_PERIOD = 40;
/** A Reaper whose anchor has stopped and that has no target in range advances at this speed fraction (AP §10). */
const REAPER_ADVANCE_FRACTION = 0.6;
/** An anchor goal is dropped once the anchor is within this distance of it (compressed km; every step stays rate-limited). */
export const ANCHOR_GOAL_REACHED_KM = 1e-4;

const ZERO: Vec3 = Object.freeze(v3()) as Vec3;
/** The fixed simulation step (SIM_DT, battle.ts) for rate limits computed outside the step loop. */
const DT_HINT = 0.05;

// ------------------------------------------------------------------ hashing

/** Deterministic hash of a string to [0, 1): seeded choices without touching `sim.rng`. */
export function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const golden = (i: number): number => (i * 0.6180339887) % 1;

// --------------------------------------------------------------- fleet state

/** Per-fleet motion bookkeeping that the contract types do not carry. */
export interface FleetMotion {
  /** The anchor's velocity over the last step (the slots' translation velocity). */
  anchorVel: Vec3;
  /** Re-aiming the heading after the bearing error left the deadband. */
  reaiming: boolean;
  /** Since when the enemy has been off the bow or beyond the unlock range (−1: not). */
  offSince: number;
  /** Distance to the aim point when the current approach began (for the deceleration ramp). */
  closeFrom: number;
  /** Order the approach ramp was set up for. */
  order?: OrderType;
  /** An explicit attack order (player or scenario) is in force: stealth hunters engage even unvulnerable targets. */
  explicitAttack: boolean;
  /** Approach progress of the converging arcs (brief §22): 1 far out, 0 once within the lock range (`APPROACH_ARC`). */
  approach: number;
  /**
   * In contact: an enemy combatant within `CONTACT_RANGE_FACTOR` × the fleet's engagement range of any of its fighting
   * hulls (refreshed with the fleet's slow view, `ai.ts`). Once the fleet has been engaged it keeps it engaged.
   */
  contact: boolean;
  /** The fleet's heading has locked at least once (its first engagement has begun). */
  engagedOnce: boolean;
}

const FLEET_MOTION = new WeakMap<FleetState, FleetMotion>();

export function fleetMotion(fleet: FleetState): FleetMotion {
  let m = FLEET_MOTION.get(fleet);
  if (!m) {
    const o = fleet.spec.initialOrder?.order;
    m = { anchorVel: v3(), reaiming: false, offSince: -1, closeFrom: 0, explicitAttack: o === 'attack' || o === 'attack_target', approach: 1, contact: false, engagedOnce: false };
    FLEET_MOTION.set(fleet, m);
  }
  return m;
}

/** What steering a fleet needs from the slowly refreshed fleet view (`ai.ts` FleetSlowState). */
export interface FleetView {
  mine: ShipState[];
  enemyCentre?: Vec3;
  myCentre: Vec3;
  anchorSpeed: number;
  /** Longest anti-capital (or non-PD) range of the fleet. */
  range: number;
  /** Longest spinal-gun range of the fleet's dreadnought-class hulls, 0 without one. */
  spinal: number;
  /** Largest slot radius of the fighting members (for the formation turn-rate limit). */
  slotRadius: number;
  /** Fleet-local centroid of the members' slots, weighted as `myCentre` is: where the fleet's centre sits off its anchor. */
  slotCentre?: Vec3;
}

/** The standoff doctrine applies: an Alliance or Cerberus fleet whose line carries spinal guns. */
export const spinalDoctrine = (fleet: FleetState, view: FleetView): boolean => view.spinal > 0 && (fleet.spec.faction === 'alliance' || fleet.spec.faction === 'cerberus');

/** Standoff distance of a fleet (its doctrine range) and the distances its anchor closes to and backs off from. */
export function standoffOf(fleet: FleetState, view: FleetView): { standoff: number; want: number; backoff: number } {
  const d = FACTIONS[fleet.spec.faction].doctrine;
  const standoff = view.range * d.preferredRangeFactor;
  const o = fleet.orders.order;
  if (o === 'advance') return { standoff, want: standoff * 0.55, backoff: -Infinity };
  // The spinal line closes only to the outer band of its guns and holds there; when the enemy closes anyway the line
  // stands and its broadsides join in — it never kites backwards (the owner's "broadsides only when the enemy closes").
  if (spinalDoctrine(fleet, view)) return { standoff, want: SPINAL_STANDOFF.want * view.spinal, backoff: -Infinity };
  const want = standoff * (1.1 - d.aggression * 0.5);
  return { standoff, want, backoff: d.aggression < 0.8 ? want * 0.6 : -Infinity };
}

/**
 * Converging arcs (brief §22, "curved approaches"): far from the enemy every group's station sits `lateral` and
 * `vertical` (× the squared approach progress) further out from the fleet's axis than its slot; the spread falls to
 * nothing over the last `span` ranges before the lock range, so the flanking groups' paths bend inward and level
 * out onto their lines (a parabola, never a lurch: the progress changes at most `rate` per second).
 */
export const APPROACH_ARC = { lateral: 0.4, vertical: 0.35, span: 1.5, rate: 0.04 } as const;

/** Approach progress at an anchor-to-aim distance: 1 beyond the lock range plus `span` ranges, 0 at the lock range. */
export const approachProgress = (dist: number, range: number): number =>
  range > 0 ? Math.max(0, Math.min(1, (dist - MOVEMENT.lockRangeFactor * range) / (APPROACH_ARC.span * range))) : 0;

/** A hull's fleet-local station with the approach spread on its group's reference (the group keeps its shape). */
export function spreadSlot(ship: ShipState, approach: number): Vec3 {
  const g = ship.groupSlot ?? ship.slot;
  const a = approach * approach;
  const lat = 1 + APPROACH_ARC.lateral * a;
  const ver = 1 + APPROACH_ARC.vertical * a;
  return v3(g.x * lat + (ship.slot.x - g.x), g.y * ver + (ship.slot.y - g.y), ship.slot.z);
}

/**
 * A leader whose escorts keep station on it: present, in the line (not withdrawing, hunting, arriving, on a run, or
 * crossing to a new slot in a Reaper slot exchange — its escorts hold their slots meanwhile).
 */
const leads = (lead: ShipState): boolean =>
  lead.alive && !lead.escaped && !lead.withdrawing && !lead.stealth && lead.arrival === undefined && lead.driveRun === undefined && !(SHIP_MOTION.get(lead)?.transferring ?? false);

/**
 * A hull's station (brief §22, "station keeping relative to the group leader"): an escort whose group leader leads
 * holds its offset from that leader (turned with the fleet heading) and moves with it, so the group stays one cluster
 * while the fleet manoeuvres; a leader, a hull without a group and an escort whose leader is gone or out of the line
 * hold their slot on the anchor (with the approach spread on the group's reference).
 */
export function stationOf(ctx: Pick<AiContext, 'getShip'>, ship: ShipState, fleet: FleetState): { pos: Vec3; vel: Vec3 } {
  const lead = ship.groupLeaderId ? ctx.getShip(ship.groupLeaderId) : undefined;
  if (lead && ship.groupSlot && leads(lead)) {
    const off = offsetToWorld(fleet.heading, v3(ship.slot.x - ship.groupSlot.x, ship.slot.y - ship.groupSlot.y, ship.slot.z - ship.groupSlot.z));
    return { pos: v3(lead.pos.x + off.x, lead.pos.y + off.y, lead.pos.z + off.z), vel: lead.vel };
  }
  const m = fleetMotion(fleet);
  return { pos: slotToWorld(fleet.anchor, fleet.heading, spreadSlot(ship, m.approach)), vel: m.anchorVel };
}

/**
 * Separation (brief §22, "friendly avoidance between hulls and between groups"): a hull inside `reach` × the
 * size-scaled minimum separation of a hull of its own side (`minSeparationKm`) gets a velocity bias straight away from
 * it — `gain` × its top speed × (1 − d/need), times its share of the pair's give (`separationShare`: the smaller hull
 * gives way, a capital barely yields to an escort) — and, closing on it, a step to starboard. Small craft neither give
 * nor take it. It acts from the full minimum separation, rising linearly: the stations are laid out at least that far
 * apart, so a hull keeping station feels nothing, while two hulls pressed together (a gentler, shorter-reaching bias
 * let pairs settle at 0.5–0.75 of it for minutes) part to about 0.9 of it against their station-keeping. Enemy hulls
 * do not repel (an enemy screen closing on a Reaper capital shoved it about at full thrust, every shove a hard
 * manoeuvre costing every gun's solution on it); the clearance backstop keeps any two hulls from clipping.
 */
export const SEPARATION = { reach: 1, gain: 1, sidestep: 0.8 } as const;

/** A hull's share of the give between it and `other`: 2 × other's length over both, at most 1 (equal hulls give equally). */
export const separationShare = (ship: { lengthKm: number }, other: { lengthKm: number }): number =>
  Math.min(1, (2 * other.lengthKm) / Math.max(1e-6, ship.lengthKm + other.lengthKm));

export function separationRepel(ctx: Pick<AiContext, 'hullsNear' | 'largestHullKm'>, ship: ShipState): Vec3 | undefined {
  if (ship.role === 'fighter') return undefined;
  const big = Math.max(ship.lengthKm, ctx.largestHullKm());
  const radius = SEPARATION.reach * minSeparationKm(ship, { role: 'reaper_capital', lengthKm: big });
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let any = false;
  for (const o of ctx.hullsNear(ship.pos, radius)) {
    if (o === ship || o.role === 'fighter' || o.side !== ship.side) continue;
    const need = SEPARATION.reach * minSeparationKm(ship, o);
    let dx = ship.pos.x - o.pos.x;
    let dy = ship.pos.y - o.pos.y;
    let dz = ship.pos.z - o.pos.z;
    let d = Math.hypot(dx, dy, dz);
    if (d >= need) continue;
    if (d < 1e-6) {
      // Coincident hulls split along a direction fixed by the pair's ids.
      const a = hash01(ship.id < o.id ? ship.id + o.id : o.id + ship.id, 23) * 2 * Math.PI * (ship.id < o.id ? 1 : -1);
      dx = dcos(a);
      dy = 0;
      dz = dsin(a);
      d = 1;
    }
    // A linear rise from nothing at the minimum separation (the clearance backstop catches the rest).
    const r = Math.min(1, Math.hypot(ship.pos.x - o.pos.x, ship.pos.y - o.pos.y, ship.pos.z - o.pos.z) / need);
    const k = (SEPARATION.gain * (1 - r) * separationShare(ship, o) * ship.maxSpeed) / d;
    rx += dx * k;
    ry += dy * k;
    rz += dz * k;
    // Closing on each other: both also step to starboard of the line between them (opposite ways, since each sees the
    // other on the opposite bearing), so two hulls meeting head on pass each other rather than stall nose to nose.
    const closing = (o.vel.x - ship.vel.x) * dx + (o.vel.y - ship.vel.y) * dy + (o.vel.z - ship.vel.z) * dz;
    if (closing > 0) {
      const flat = Math.hypot(dx, dz);
      if (flat > 1e-9) {
        const side = SEPARATION.sidestep * k * d;
        rx += (-dz / flat) * side;
        rz += (dx / flat) * side;
      }
    }
    any = true;
  }
  return any ? v3(rx, ry, rz) : undefined;
}

/**
 * A goal kept clear of the hulls of its own side (brief §22, "rational spacing"): a goal point inside another hull's
 * size-scaled minimum separation is moved straight out to it. Stations are laid out that far apart, but they move with
 * their group capitals, and a capital moving through another group (or an escort lagging its station in its own
 * capital's wake) set an escort's station inside a capital's clearance: separation then fought the station-keeping and
 * the pair sat at 0.6 of it for minutes. Small craft and transit goals (runs, passes) are left alone.
 */
export const CLEAR_GOAL = 0.9;

export function clearOfFriends(ctx: Pick<AiContext, 'hullsNear' | 'largestHullKm'>, ship: ShipState, p: Vec3): Vec3 {
  if (ship.role === 'fighter') return p;
  const far = minSeparationKm(ship, { role: 'reaper_capital', lengthKm: Math.max(ship.lengthKm, ctx.largestHullKm()) });
  let x = p.x;
  let y = p.y;
  let z = p.z;
  let moved = false;
  for (const o of ctx.hullsNear(p, far)) {
    if (o === ship || o.side !== ship.side || o.role === 'fighter' || !o.alive || o.escaped) continue;
    // Out to `CLEAR_GOAL` of the minimum separation: a station a little inside it (the layouts pack a harvest group's
    // capitals just over their clearance) is left to separation's gentle push, so neighbours never jostle each other.
    const need = CLEAR_GOAL * minSeparationKm(ship, o);
    let dx = x - o.pos.x;
    let dy = y - o.pos.y;
    let dz = z - o.pos.z;
    let d = Math.hypot(dx, dy, dz);
    if (d >= need) continue;
    if (d < 1e-6) {
      // The goal on the hull itself: out on the side the ship is on (or a direction fixed by the pair's ids).
      dx = ship.pos.x - o.pos.x;
      dy = ship.pos.y - o.pos.y;
      dz = ship.pos.z - o.pos.z;
      d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) {
        const a = hash01(ship.id < o.id ? ship.id + o.id : o.id + ship.id, 19) * 2 * Math.PI;
        dx = dcos(a);
        dy = 0;
        dz = dsin(a);
        d = 1;
      }
    }
    x = o.pos.x + (dx / d) * need;
    y = o.pos.y + (dy / d) * need;
    z = o.pos.z + (dz / d) * need;
    moved = true;
  }
  return moved ? v3(x, y, z) : p;
}

/**
 * The clearance backstop (brief §22, "hulls never clip"): after every hull has moved, two hulls nearer than
 * `CLEARANCE_FLOOR` × their minimum separation are set apart to it along the line between them — the smaller hull
 * moving more, a hull that cannot move (a platform) not at all — and their closing speed along that line is removed.
 * Steering (`separationRepel`, `yieldFactor`) keeps hulls clear in the first place; this only catches the rare close
 * encounter (two hulls closing on one point, a hull passing through a formation). Small craft and `exempt` hulls
 * (scripted close passes, drive runs, arrivals) are left alone. Deterministic: ship-index order, each pair once.
 */
export const CLEARANCE_FLOOR = 0.5;

export function enforceClearance(ctx: Pick<AiContext, 'hullsNear' | 'largestHullKm'>, ships: readonly ShipState[], exempt: (s: ShipState) => boolean): void {
  const big = ctx.largestHullKm();
  for (const a of ships) {
    if (!a.alive || a.escaped || a.role === 'fighter' || exempt(a)) continue;
    // Padded by a kilometre: the grid indexes start-of-tick positions and a hull moves well under that in a step.
    const reach = CLEARANCE_FLOOR * minSeparationKm(a, { role: 'reaper_capital', lengthKm: Math.max(a.lengthKm, big) }) + 1;
    for (const b of ctx.hullsNear(a.pos, reach)) {
      if (b === a || b.id <= a.id || b.role === 'fighter' || exempt(b)) continue;
      const need = CLEARANCE_FLOOR * minSeparationKm(a, b);
      let dx = a.pos.x - b.pos.x;
      let dy = a.pos.y - b.pos.y;
      let dz = a.pos.z - b.pos.z;
      let d = Math.hypot(dx, dy, dz);
      if (d >= need) continue;
      const wa = a.maxSpeed > 0 ? 1 / Math.max(0.01, a.lengthKm) : 0;
      const wb = b.maxSpeed > 0 ? 1 / Math.max(0.01, b.lengthKm) : 0;
      if (wa + wb <= 0) continue;
      if (d < 1e-6) {
        const ang = hash01(a.id + b.id, 29) * 2 * Math.PI;
        dx = dcos(ang);
        dy = 0;
        dz = dsin(ang);
        d = 1;
      }
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      // A hair past the floor, so a pair the step pressed together is never left sitting on it.
      const push = need * (1 + 1e-3) - Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
      const fa = wa / (wa + wb);
      const fb = wb / (wa + wb);
      a.pos.x += ux * push * fa;
      a.pos.y += uy * push * fa;
      a.pos.z += uz * push * fa;
      b.pos.x -= ux * push * fb;
      b.pos.y -= uy * push * fb;
      b.pos.z -= uz * push * fb;
      const closing = (a.vel.x - b.vel.x) * ux + (a.vel.y - b.vel.y) * uy + (a.vel.z - b.vel.z) * uz;
      if (closing < 0) {
        a.vel.x -= ux * closing * fa;
        a.vel.y -= uy * closing * fa;
        a.vel.z -= uz * closing * fa;
        b.vel.x += ux * closing * fb;
        b.vel.y += uy * closing * fb;
        b.vel.z += uz * closing * fb;
      }
    }
  }
}

const flatNorm = (x: number, z: number): Vec3 | undefined => {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? v3(x / l, 0, z / l) : undefined;
};

/** Signed yaw from heading `a` to direction `b` (both flat, unit): positive turns `a` toward `b` with the rotation below. */
const signedYaw = (a: Vec3, b: Vec3): number => Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);

const rotateFlat = (h: Vec3, angle: number): Vec3 => {
  const c = dcos(angle);
  const s = dsin(angle);
  const x = h.x * c - h.z * s;
  const z = h.x * s + h.z * c;
  const l = Math.hypot(x, z) || 1;
  return v3(x / l, 0, z / l);
};

/** The broadside heading: turned so the fleet's right side (+x of its slots) points along the bearing, toward the enemy. */
const broadsideHeading = (bearing: Vec3): Vec3 => v3(-bearing.z, 0, bearing.x);

/**
 * Steer a fleet for one step: heading (deadband, rate limit, lock, doctrine facing) and anchor (along the approach
 * bearing with a deceleration ramp, standoff and back-off, the per-order goals). Static fleets never come here.
 */
export function steerFleet(ctx: AiContext, fleet: FleetState, view: FleetView, dt: number): void {
  const m = fleetMotion(fleet);
  const o = fleet.orders;
  const ax = fleet.anchor.x;
  const ay = fleet.anchor.y;
  const az = fleet.anchor.z;

  // Aim point: the attack target, else the enemy centroid.
  let aim: Vec3 | undefined = view.enemyCentre;
  if (o.order === 'attack_target' && o.targetId) {
    const t = ctx.getShip(o.targetId);
    if (t && t.alive && !t.escaped) aim = t.pos;
  }

  // ---- heading
  const isReaper = fleet.spec.faction === 'reaper';
  let rate: number = isReaper ? MOVEMENT.reaperHeadingRateRad : MOVEMENT.headingRateRad;
  // A wide line turns slower, so its wing capitals never outrun their hulls (never below FORMATION_MIN_RATE).
  let slowest = Infinity;
  for (const s of view.mine) slowest = Math.min(slowest, s.maxSpeed);
  if (Number.isFinite(slowest) && view.slotRadius > 1) rate = Math.min(rate, Math.max(FORMATION_MIN_RATE, (FORMATION_TIP_SPEED * slowest) / view.slotRadius));
  const maxTurn = rate * dt;
  if (aim) {
    const to = flatNorm(aim.x - ax, aim.z - az);
    const dist = Math.hypot(aim.x - ax, aim.y - ay, aim.z - az);
    if (to) {
      if (!fleet.headingLocked) {
        if (dist <= MOVEMENT.lockRangeFactor * view.range) {
          fleet.headingLocked = true;
          m.offSince = -1;
        }
      } else {
        const off = dist > MOVEMENT.unlockRangeFactor * view.range || Math.abs(signedYaw(fleet.approachBearing, to)) > UNLOCK_OFF_BOW_RAD;
        if (!off) m.offSince = -1;
        else if (m.offSince < 0) m.offSince = ctx.time;
        else if (ctx.time - m.offSince >= MOVEMENT.unlockSeconds) {
          fleet.headingLocked = false;
          m.offSince = -1;
          m.reaiming = true;
          m.closeFrom = 0;
        }
      }
      if (!fleet.headingLocked) {
        // Re-aim only outside the deadband, then all the way in at the rate limit; the bearing follows the heading.
        // (A broadside line approaches bow-on, in column, and turns its flank only once locked.)
        const err = signedYaw(fleet.heading, to);
        if (Math.abs(err) > MOVEMENT.headingDeadbandRad) m.reaiming = true;
        if (m.reaiming) {
          const turn = Math.sign(err) * Math.min(Math.abs(err), maxTurn);
          fleet.heading = rotateFlat(fleet.heading, turn);
          if (Math.abs(err) - Math.abs(turn) < REAIM_DONE_RAD) m.reaiming = false;
        }
        fleet.approachBearing = v3(fleet.heading.x, 0, fleet.heading.z);
      } else if (fleet.doctrineFacing === 'broadside') {
        // Locked broadside line: turn the flank to the enemy (the heading rotates 90° to the bearing).
        const want = broadsideHeading(fleet.approachBearing);
        const err = signedYaw(fleet.heading, want);
        if (Math.abs(err) > 1e-4) fleet.heading = rotateFlat(fleet.heading, Math.sign(err) * Math.min(Math.abs(err), maxTurn));
      }
      // Locked bow-on line: the heading holds while the targets move across it.
    }
  }

  // ---- anchor
  if (m.order !== o.order) {
    m.order = o.order;
    m.closeFrom = 0;
  }
  const b = fleet.approachBearing;
  const speed = view.anchorSpeed;
  const moveAlong = (delta: number): void => {
    fleet.anchor = v3(fleet.anchor.x + b.x * delta, fleet.anchor.y, fleet.anchor.z + b.z * delta);
  };
  const moveToward = (p: Vec3, sp: number): void => {
    const dx = p.x - fleet.anchor.x;
    const dy = p.y - fleet.anchor.y;
    const dz = p.z - fleet.anchor.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.05) return;
    if (m.closeFrom <= 0) m.closeFrom = d;
    const ramp = Math.min(1, Math.max(DECEL_MIN, d / (DECEL_FRACTION * Math.max(1, m.closeFrom))));
    const step = Math.min(d, sp * ramp * dt);
    fleet.anchor = v3(fleet.anchor.x + (dx / d) * step, fleet.anchor.y + (dy / d) * step, fleet.anchor.z + (dz / d) * step);
  };
  switch (o.order) {
    case 'attack':
    case 'attack_target':
    case 'advance': {
      if (!aim) break;
      // Hardcore Reapers keep their established gun line rather than
      // hauling every capital after a single retreating contact.
      if (ctx.rules.special.reaperHardcore && isReaper &&
          (m.engagedOnce || fleet.headingLocked) &&
          Math.hypot(aim.x - ax, aim.y - ay, aim.z - az) > view.range * 1.8) {
        const remaining = ctx.enemiesOf(fleet.spec.side).filter(e => e.alive && !e.escaped && e.role !== 'fighter');
        if (remaining.length > 0 && remaining.every(e =>
          e.withdrawing || ctx.fleets.get(e.fleetId)?.orders.order === 'retreat')) break;
      }
      const { want, backoff } = standoffOf(fleet, view);
      if (!fleet.headingLocked) {
        // Closing: along the approach bearing, decelerating over the last 20 % of the run-in.
        const dp = (aim.x - fleet.anchor.x) * b.x + (aim.z - fleet.anchor.z) * b.z;
        if (dp > want) {
          if (m.closeFrom <= 0) m.closeFrom = dp;
          const ramp = Math.min(1, Math.max(DECEL_MIN, (dp - want) / (DECEL_FRACTION * Math.max(1, m.closeFrom))));
          moveAlong(Math.min(dp - want, speed * ramp * dt));
        } else if (dp < backoff) moveAlong(-Math.min(backoff - dp, speed * 0.6 * dt));
      } else {
        // Locked: the line keeps its facing; the anchor only corrects the range to the aim point (no sliding
        // along a stale bearing when the enemy moves across it).
        const dx = aim.x - fleet.anchor.x;
        const dz = aim.z - fleet.anchor.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6 && d > want) {
          const step = Math.min(d - want, speed * DECEL_MIN * 2 * dt + Math.min(1, (d - want) / Math.max(1, 0.2 * want)) * speed * dt);
          fleet.anchor = v3(fleet.anchor.x + (dx / d) * step, fleet.anchor.y, fleet.anchor.z + (dz / d) * step);
        } else if (d > 1e-6 && d < backoff) {
          const step = Math.min(backoff - d, speed * 0.6 * dt);
          fleet.anchor = v3(fleet.anchor.x - (dx / d) * step, fleet.anchor.y, fleet.anchor.z - (dz / d) * step);
        }
      }
      break;
    }
    case 'defend_position':
      if (o.position) moveToward(o.position, speed);
      break;
    case 'hold_formation':
    case 'withdraw':
      break;
    case 'retreat': {
      // Disengage: fall back to 1.5 × standoff and hold there, firing at anything that follows.
      if (!aim) break;
      const want = DISENGAGE_STANDOFF * standoffOf(fleet, view).standoff;
      const dp = (aim.x - fleet.anchor.x) * b.x + (aim.z - fleet.anchor.z) * b.z;
      if (dp < want) moveAlong(-Math.min(want - dp, speed * dt));
      break;
    }
    case 'escort': {
      const t = o.targetId ? ctx.getShip(o.targetId) : undefined;
      if (t && t.alive) moveToward(t.pos, speed);
      break;
    }
    case 'intercept': {
      const t = o.targetId ? ctx.getShip(o.targetId) : undefined;
      if (t && t.alive) moveToward(t.pos, speed);
      else if (aim) moveToward(aim, speed);
      break;
    }
  }
  // An ordered anchor goal (`FleetOrders.anchorGoal`, the Final Battle's Reaper climb into the coalition's plane, AP
  // §4.2): each component it names leaves the order's movement and drifts toward the goal at the fleet's anchor speed,
  // never sweeping the line of sight from the aim point faster than the formation may turn (the heading-rate limit) —
  // the formation rises (or slides) as a whole; it never pitches or wheels. The goal is dropped once reached.
  const g = o.anchorGoal;
  if (g) {
    const cur = v3(g.x !== undefined ? ax : fleet.anchor.x, g.y !== undefined ? ay : fleet.anchor.y, g.z !== undefined ? az : fleet.anchor.z);
    const dx = g.x !== undefined ? g.x - cur.x : 0;
    const dy = g.y !== undefined ? g.y - cur.y : 0;
    const dz = g.z !== undefined ? g.z - cur.z : 0;
    const d = Math.hypot(dx, dy, dz);
    let sp = speed;
    if (aim) sp = Math.min(sp, rate * Math.hypot(aim.x - cur.x, aim.y - cur.y, aim.z - cur.z));
    const step = d > 1e-9 ? Math.min(d, sp * dt) : 0;
    fleet.anchor = d > 1e-9 ? v3(cur.x + (dx / d) * step, cur.y + (dy / d) * step, cur.z + (dz / d) * step) : cur;
    if (d - step <= ANCHOR_GOAL_REACHED_KM) delete o.anchorGoal;
  }
  // Converging arcs (brief §22): the approach progress falls from 1 far out to 0 at the lock range; the stations of
  // the groups are spread wider and higher by it (`spreadSlot`), so the groups close in on gently converging curves.
  if (fleet.headingLocked) m.approach = Math.max(0, m.approach - APPROACH_ARC.rate * dt);
  else if (aim) {
    const want = approachProgress(Math.hypot(aim.x - fleet.anchor.x, aim.z - fleet.anchor.z), view.range);
    m.approach += Math.max(-APPROACH_ARC.rate * dt, Math.min(APPROACH_ARC.rate * dt, want - m.approach));
  }
  // Keep the anchor from drifting too far from the actual fleet (ships lag behind). The fleet's centre sits off the
  // anchor by its slots' own centroid (a wedge's ranks trail its apex), so the clamp compares like with like.
  const sc = view.slotCentre ? offsetToWorld(fleet.heading, view.slotCentre) : ZERO;
  const cx = view.myCentre.x - sc.x;
  const cy = view.myCentre.y - sc.y;
  const cz = view.myCentre.z - sc.z;
  const lx = fleet.anchor.x - cx;
  const ly = fleet.anchor.y - cy;
  const lz = fleet.anchor.z - cz;
  const lag = Math.hypot(lx, ly, lz);
  const maxLag = 12 * S;
  if (lag > maxLag) fleet.anchor = v3(cx + (lx * maxLag) / lag, cy + (ly * maxLag) / lag, cz + (lz * maxLag) / lag);
  m.anchorVel = v3((fleet.anchor.x - ax) / dt, (fleet.anchor.y - ay) / dt, (fleet.anchor.z - az) / dt);
}

// ---------------------------------------------------------------- ship state

/** Per-ship motion bookkeeping that the contract types do not carry. */
export interface ShipMotion {
  /** |Δv| / dt / acceleration over the last step (1 = flat-out manoeuvre). */
  accelFrac: number;
  /** How long the hull has been manoeuvring hard (accelFrac > 0.7), −1 when not. */
  hardFor: number;
  /** Hard manoeuvres completed (each one costs every shooter's solution once, solutions.ts). */
  manoeuvres: number;
  hardCounted: boolean;
  /** Frigate runs / fighter passes: which side the next run or pass takes (±1) and how many have been flown. */
  side: number;
  cycle: number;
  /** Fighter passes: the current approach direction from the target (unit). */
  dir?: Vec3;
  /** Tactical withdrawal bookkeeping. */
  withdrawnAt: number;
  reengagedAt: number;
  /** Carriers: the current keep-out push-back behind the slot (km), smoothed. */
  keepOut: number;
  /** No-idle bookkeeping (brief §22): next reach check, whether an enemy hull is in reach, since when none is (−1). */
  reachAt: number;
  inReach: boolean;
  outSince: number;
  /** The move-up in force: toward which enemy, under which order, and why (lean in or back up an ally). */
  moveUp?: { targetId: string; order: OrderType; kind: 'lean' | 'backup'; allyId?: string; hold?: Vec3 };
  /** The lane in use toward `targetId` (`LANE`): its offset in the search spiral and when it is next re-checked. */
  lane?: { targetId: string; k: number; at: number };
  /** A Reaper capital crossing to its new slot in a rotate-protection exchange (reaperAi.ts). */
  transferring?: boolean;
  /** Stealth hunters (stealth.ts): net turn of the flat velocity heading (rad), its last value, the mirrored-pass state. */
  netTurn: number;
  lastYaw?: number;
  mirror: boolean;
  unwindSign: number;
}

const SHIP_MOTION = new WeakMap<ShipState, ShipMotion>();

export function shipMotion(ship: ShipState): ShipMotion {
  let m = SHIP_MOTION.get(ship);
  if (!m) {
    m = { accelFrac: 0, hardFor: -1, manoeuvres: 0, hardCounted: false, side: hash01(ship.id, 7) < 0.5 ? 1 : -1, cycle: 0, withdrawnAt: -1e9, reengagedAt: -1e9, keepOut: 0, reachAt: -1, inReach: false, outSince: -1, netTurn: 0, mirror: false, unwindSign: 0 };
    SHIP_MOTION.set(ship, m);
  }
  return m;
}

/** Sideways acceleration a hull keeps at any speed (manoeuvring thrusters), as a fraction of its acceleration. */
export const TURN_THRUSTER_FLOOR = 0.35;

/** A hull manoeuvres "hard" above this acceleration fraction; held for `HARD_MANOEUVRE_SECONDS` it costs solutions (AP §19 8.7). */
export const HARD_MANOEUVRE_FRACTION = 0.7;
export const HARD_MANOEUVRE_SECONDS = 0.5;

/**
 * Integrate one step of a mobile hull toward its goal. `transit` goals fly at the goal's speed fraction straight at
 * the point (runs and passes). Station goals use damped station keeping on the goal (CINEMATIC_DESIGN.md §7.1):
 * the hull tracks the goal's own velocity plus a relative velocity toward it of `kp × err`, capped by the speed
 * limit and by the braking curve `√(2 · a · |err|)`, so it arrives without overshoot and never circles. (The
 * literal `goalVel + clamp(err × kp − relVel × kd)` velocity command is unstable in discrete time — its
 * relative-velocity feedback has a loop gain of 1 + kd ≈ 2.4 per step and chatters at the acceleration limit —
 * so the damping `kd = 2√kp` is realised by the braking curve instead of a velocity-feedback term.)
 * The acceleration limit applies to both.
 */
export function steerShip(ship: ShipState, goal: MovementGoal, dt: number): void {
  // A drive overload (the Black Fleet drive run) raises the engine-scaled limits; every other goal leaves them as they are.
  const engineFactor = (0.25 + 0.75 * ship.subsystems.engines) * (goal.boost ?? 1);
  const maxSpeed = ship.maxSpeed * engineFactor * Math.max(0, Math.min(1, goal.speedFraction));
  const accel = ship.acceleration * engineFactor;
  const ex = goal.position.x - ship.pos.x;
  const ey = goal.position.y - ship.pos.y;
  const ez = goal.position.z - ship.pos.z;
  let dvx: number;
  let dvy: number;
  let dvz: number;
  if (goal.transit) {
    const d = Math.hypot(ex, ey, ez);
    const sp = d > 1e-6 ? maxSpeed : 0;
    dvx = d > 1e-6 ? (ex / d) * sp : 0;
    dvy = d > 1e-6 ? (ey / d) * sp : 0;
    dvz = d > 1e-6 ? (ez / d) * sp : 0;
  } else {
    const gv = goal.velocity ?? ZERO;
    const d = Math.hypot(ex, ey, ez);
    const rel = d > 1e-6 ? Math.min(maxSpeed, MOVEMENT.kp * d, Math.sqrt(2 * accel * d)) / d : 0;
    dvx = gv.x + ex * rel;
    dvy = gv.y + ey * rel;
    dvz = gv.z + ez * rel;
  }
  if (goal.repel) {
    dvx += goal.repel.x;
    dvy += goal.repel.y;
    dvz += goal.repel.z;
  }
  // Never faster than the (engine-scaled) maximum.
  const top = ship.maxSpeed * engineFactor;
  const dl = Math.hypot(dvx, dvy, dvz);
  if (dl > top) {
    dvx *= top / dl;
    dvy *= top / dl;
    dvz *= top / dl;
  }
  let ax = dvx - ship.vel.x;
  let ay = dvy - ship.vel.y;
  let az = dvz - ship.vel.z;
  // Turning limited by hull class (brief §22): at speed a hull swings its velocity no faster than its own turn rate
  // (main drives push along the hull), with a manoeuvring-thruster floor; speeding up and braking are not limited.
  // Small craft are exempt.
  const sp = Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z);
  if (ship.role !== 'fighter' && sp > 1e-6) {
    const ux = ship.vel.x / sp;
    const uy = ship.vel.y / sp;
    const uz = ship.vel.z / sp;
    const par = ax * ux + ay * uy + az * uz;
    const px = ax - par * ux;
    const py = ay - par * uy;
    const pz = az - par * uz;
    const pl = Math.hypot(px, py, pz);
    const maxPerp = Math.max(ship.turnRate * (0.3 + 0.7 * ship.subsystems.engines) * sp, TURN_THRUSTER_FLOOR * accel) * dt;
    if (pl > maxPerp) {
      const k = maxPerp / pl;
      ax = par * ux + px * k;
      ay = par * uy + py * k;
      az = par * uz + pz * k;
    }
  }
  const al = Math.hypot(ax, ay, az);
  const maxDv = accel * dt;
  if (al > maxDv) {
    ax *= maxDv / al;
    ay *= maxDv / al;
    az *= maxDv / al;
  }
  // In place: the renderer's interpolation snapshot (`prevPos`) is a distinct object copied before the step.
  ship.vel.x += ax;
  ship.vel.y += ay;
  ship.vel.z += az;
  ship.pos.x += ship.vel.x * dt;
  ship.pos.y += ship.vel.y * dt;
  ship.pos.z += ship.vel.z * dt;
  // Manoeuvre bookkeeping for the firing solutions of whoever is shooting at this hull.
  const m = shipMotion(ship);
  m.accelFrac = accel > 1e-9 ? Math.min(1, Math.hypot(ax, ay, az) / dt / accel) : 0;
  noteManoeuvre(m, dt);
}

/** Hard-manoeuvre bookkeeping: the duration accumulates through `dt`, so the module needs no clock. */
function noteManoeuvre(m: ShipMotion, dt: number): void {
  if (m.accelFrac > HARD_MANOEUVRE_FRACTION) {
    m.hardFor = m.hardFor < 0 ? dt : m.hardFor + dt;
    if (!m.hardCounted && m.hardFor >= HARD_MANOEUVRE_SECONDS) {
      m.manoeuvres++;
      m.hardCounted = true;
    }
  } else {
    m.hardFor = -1;
    m.hardCounted = false;
  }
}

// ------------------------------------------------------------ ship goals

/** Longest non-point-defence range of a hull (its main battery). */
export function mainRange(ship: ShipState): number {
  let r = 0;
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.range > r) r = w.def.range;
  return r;
}

const PD_RANGE = new Map<string, number>();
/** Longest point-defence range of a hull class (0 without point defence). */
export function pdRange(ship: ShipState): number {
  let r = PD_RANGE.get(ship.classId);
  if (r === undefined) {
    r = 0;
    for (const w of ship.weapons) if (w.def.antiSmall && w.def.kind === 'gardian' && w.def.range > r) r = w.def.range;
    PD_RANGE.set(ship.classId, r);
  }
  return r;
}

/** Right-hand unit vector of a flat heading (the slots' +x). */
export const rightOf = (h: Vec3): Vec3 => v3(h.z, 0, -h.x);

/** A hull's recovery station behind the line: anchor − heading × (0.6 × standoff) + a seeded lateral offset (±3 km). */
export function recoveryStation(ship: ShipState, fleet: FleetState, standoff: number): Vec3 {
  const lateral = (hash01(ship.id, 3) * 2 - 1) * STATION_LATERAL_KM;
  const r = rightOf(fleet.heading);
  const back = WITHDRAWAL.recoveryStationFactor * standoff;
  return v3(fleet.anchor.x - fleet.heading.x * back + r.x * lateral, fleet.anchor.y, fleet.anchor.z - fleet.heading.z * back + r.z * lateral);
}

/** An enemy combatant within `STATION_THREAT_FACTOR × standoff` of the station threatens it. */
export function stationThreatened(ctx: AiContext, ship: ShipState, station: Vec3, standoff: number): boolean {
  const r2 = (STATION_THREAT_FACTOR * standoff) ** 2;
  for (const e of ctx.enemyCombatants(ship.side)) {
    const dx = e.pos.x - station.x;
    const dy = e.pos.y - station.y;
    const dz = e.pos.z - station.z;
    if (dx * dx + dy * dy + dz * dz < r2) return true;
  }
  return false;
}

/** The nearest enemy combatant the ship can see (silent stealth hulls beyond their detection range are invisible). */
export function nearestEnemyCombatant(ctx: AiContext, ship: ShipState): ShipState | undefined {
  let best: ShipState | undefined;
  let bd = Infinity;
  for (const e of ctx.enemyCombatants(ship.side)) {
    const dx = e.pos.x - ship.pos.x;
    const dy = e.pos.y - ship.pos.y;
    const dz = e.pos.z - ship.pos.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/**
 * Carriers and liveships (CINEMATIC_DESIGN.md §7.6): keep at least 0.8 × the nearest enemy's main range, weave
 * laterally (±2 km, 40 s period, phase from the ship id) and keep their broadsides and GARDIAN working.
 */
export function carrierGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, slotPos: Vec3, slotVel: Vec3, target: ShipState | undefined): MovementGoal {
  const r = rightOf(fleet.heading);
  const phase = (2 * Math.PI * ctx.time) / CARRIER_WEAVE_PERIOD + hash01(ship.id, 11) * 2 * Math.PI;
  // ±2 km, but never a weave faster than half the hull's top speed (a liveship cannot swing 2 km in 20 s), and only
  // while the station holds: weaving across a station that is itself moving makes a slow hull lag and loop.
  const slotSpeed = Math.hypot(slotVel.x, slotVel.z);
  const hold = Math.max(0, 1 - slotSpeed / (0.25 * ship.maxSpeed));
  const amp = hold * Math.min(CARRIER_WEAVE_KM, (0.5 * ship.maxSpeed * CARRIER_WEAVE_PERIOD) / (2 * Math.PI));
  const w = dsin(phase) * amp;
  let px = slotPos.x + r.x * w;
  const py = slotPos.y;
  let pz = slotPos.z + r.z * w;
  // The keep-out is measured from the slot, not the weaved point, so the weave stays a straight side-to-side swing
  // (coupling the two turns the path into an ellipse and the hull circles).
  // The push-back follows the wanted value slowly (a slow hull cannot chase a goal that jumps, it loops round it).
  const e = nearestEnemyCombatant(ctx, ship);
  let want = 0;
  if (e) {
    const need = Math.min(CARRIER_KEEP_OUT * mainRange(e), CARRIER_OWN_REACH * mainRange(ship));
    const d = Math.hypot(e.pos.x - slotPos.x, e.pos.y - slotPos.y, e.pos.z - slotPos.z);
    if (d < need) want = Math.min(8, need - d);
  }
  const m = shipMotion(ship);
  const rate = 0.3 * ship.maxSpeed * DT_HINT;
  const drift = Math.max(-rate, Math.min(rate, want - m.keepOut));
  m.keepOut += drift;
  px -= fleet.heading.x * m.keepOut;
  pz -= fleet.heading.z * m.keepOut;
  const driftV = drift / DT_HINT;
  // The weave's own velocity rides on the slot's.
  const wv = (dcos(phase) * amp * 2 * Math.PI) / CARRIER_WEAVE_PERIOD;
  return { position: v3(px, py, pz), speedFraction: 1, velocity: v3(slotVel.x + r.x * wv - fleet.heading.x * driftV, slotVel.y, slotVel.z + r.z * wv - fleet.heading.z * driftV), face: faceIfBearing(ship, target) };
}

/**
 * Turn an arc-limited anti-ship mount onto the target when it has the target within 1.4 × its range (otherwise
 * undefined: the fleet heading). A forward mount — the main battery — faces the target with the bow whenever it has
 * one; only a hull whose arc-limited mounts all sit on its beams (a carrier's broadsides) turns so the mount's own axis
 * bears, the hull level — of several, the mount needing the least turn.
 */
export function faceIfBearing(ship: ShipState, target: ShipState | undefined): Vec3 | undefined {
  if (!target) return undefined;
  const dx = target.pos.x - ship.pos.x;
  const dz = target.pos.z - ship.pos.z;
  const d = Math.hypot(dx, target.pos.y - ship.pos.y, dz);
  // A forward mount (the main battery: a spinal gun, a Reaper beam) always takes the bow onto the target.
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.arc < 180 && Math.abs(w.facing) < 1e-6 && d < w.def.range * 1.4) return target.pos;
  const yaw = Math.atan2(ship.heading.x, ship.heading.z);
  const bearing = Math.atan2(dx, dz);
  let facing: number | undefined;
  let least = Infinity;
  for (const w of ship.weapons) {
    if (w.def.antiSmall || w.def.arc >= 180 || d >= w.def.range * 1.4) continue;
    let turn = bearing - w.facing - yaw;
    turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
    if (Math.abs(turn) < least - 1e-9) {
      least = Math.abs(turn);
      facing = w.facing;
    }
  }
  if (facing === undefined) return undefined;
  if (Math.abs(facing) < 1e-6) return target.pos;
  const flat = Math.hypot(dx, dz);
  return v3(ship.pos.x + dsin(bearing - facing) * flat, ship.pos.y, ship.pos.z + dcos(bearing - facing) * flat);
}

/**
 * The default station: hold the slot (moving with the anchor), face the target when a forward mount bears, and —
 * every unit with a weapon fires or moves for a solution — close on a target that is out of range under an attack
 * order, at half speed: a capital by up to the 2 km slot leash; an escort by up to the same leash on the approach and
 * by up to `SCREEN_LEASH_KM` once its fleet is engaged, along its lane (`LANE`: the group's screen leans in as a group,
 * its escorts on parallel lanes and never onto a point another hull holds — leaning straight at a shared target, the
 * escorts of a group converged and sat pressed together).
 */
export function stationGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, slotPos: Vec3, slotVel: Vec3, target: ShipState | undefined): MovementGoal {
  const face = fleet.doctrineFacing === 'broadside' ? undefined : faceIfBearing(ship, target);
  const o = fleet.orders.order;
  if (target && ENGAGE_ORDERS.has(o)) {
    const range = mainRange(ship);
    const dx = target.pos.x - slotPos.x;
    const dy = target.pos.y - slotPos.y;
    const dz = target.pos.z - slotPos.z;
    const d = Math.hypot(dx, dy, dz);
    // The capital line holds its standoff and leans at most the 2 km leash; the escorts screen forward to their own
    // weapon range (a frigate's guns reach 9.6 km, a spinal line holds at 15–17 km) — once the fleet is engaged: on
    // the approach the battlegroups close intact, escorts on their stations round their capitals (brief §22).
    const capital = isCapitalRole(ship.role);
    const engaged = fleetEngaged(fleet);
    // A spinal line capital holds its own gun target at its standoff (brief §22, "capitals keep their standoff band";
    // the owner's doctrine, `SPINAL_STANDOFF`): once engaged it leans in along its lane to the band's middle, by up to
    // `SPINAL_LEAN` × its spinal range. The battlegroups spread the line, and its wing capitals otherwise fought at the
    // very edge of their guns, too few hits to break a Reaper capital's barrier (its full recovery under fire).
    const spinal = capital && (fleet.spec.faction === 'alliance' || fleet.spec.faction === 'cerberus') ? spinalOf(ship) : 0;
    const band = spinal > 0 && engaged && isCapitalRole(target.role);
    const leash = band ? SPINAL_LEAN * spinal : capital || !engaged ? SLOT_LEASH_KM : SCREEN_LEASH_KM;
    const close = band ? SPINAL_STANDOFF.want * spinal : capital ? range : 0.9 * range;
    if (range > 0 && d > close && d > 1e-6) {
      if ((band || !capital) && engaged && target.role !== 'fighter') {
        const p = laneEnd(ctx, ship, fleet, target, close);
        let lx = p.x - slotPos.x;
        let ly = p.y - slotPos.y;
        let lz = p.z - slotPos.z;
        const ll = Math.hypot(lx, ly, lz);
        if (ll > leash) {
          lx *= leash / ll;
          ly *= leash / ll;
          lz *= leash / ll;
        }
        return { position: v3(slotPos.x + lx, slotPos.y + ly, slotPos.z + lz), speedFraction: 0.5, velocity: slotVel, face: face ?? target.pos };
      }
      const k = Math.min(leash, d - close) / d;
      return { position: v3(slotPos.x + dx * k, slotPos.y + dy * k, slotPos.z + dz * k), speedFraction: 0.5, velocity: slotVel, face: face ?? target.pos };
    }
  }
  return { position: slotPos, speedFraction: 1, velocity: slotVel, face };
}

/**
 * Bringing arc-limited guns to bear vertically (brief §22, rational movement): an arc-limited mount bears only under
 * `ARC_VERTICAL_REACH` (|Δy| / distance 0.6); goals near the gun target are held under `elevation` (0.45), and only
 * within `reach` × the mount's range (farther out the elevation does not matter yet).
 */
export const BEAR_VERTICALLY = { elevation: 0.45, reach: 1.25 } as const;

/**
 * Keep a hull's goal where its guns bear (see `BEAR_VERTICALLY`): when the hull's anti-ship fire on its gun target
 * rests on arc-limited mounts (no turreted anti-ship mount reaches the target from the goal) and the goal lies
 * steeper above or below the target than those mounts can bear, the goal swings round the target — same distance,
 * same horizontal bearing — up or down to the bearable elevation. The 3D layouts stack groups in height, and a hull
 * that reached a station steeply over its target would otherwise sit in range with its guns silent.
 */
export function bearVertically(ship: ShipState, goal: MovementGoal, target: ShipState | undefined): MovementGoal {
  if (!target || !target.alive || target.escaped || ship.role === 'fighter') return goal;
  let arc = 0;
  let turret = 0;
  for (const w of ship.weapons) {
    if (w.def.antiSmall || (w.ammo !== undefined && w.ammo <= 0)) continue;
    if (w.def.arc >= 360) turret = Math.max(turret, w.def.range);
    else arc = Math.max(arc, w.def.range);
  }
  const p = goal.position;
  const dx = p.x - target.pos.x;
  const dy = p.y - target.pos.y;
  const dz = p.z - target.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (arc <= 0 || d <= turret || d < 1e-6 || d > BEAR_VERTICALLY.reach * arc) return goal;
  const sinE = BEAR_VERTICALLY.elevation;
  if (Math.abs(dy) <= sinE * d) return goal;
  // The goal's own bearing from the target; the hull's when the goal sits right over the target; else astern.
  let ux = dx;
  let uz = dz;
  let flat = Math.hypot(ux, uz);
  if (flat < 0.05 * d) {
    ux = ship.pos.x - target.pos.x;
    uz = ship.pos.z - target.pos.z;
    flat = Math.hypot(ux, uz);
    if (flat < 1e-6) {
      ux = -ship.heading.x;
      uz = -ship.heading.z;
      flat = Math.hypot(ux, uz) || 1;
    }
  }
  const cosE = Math.sqrt(1 - sinE * sinE);
  const k = (cosE * d) / flat;
  return { ...goal, position: v3(target.pos.x + ux * k, target.pos.y + Math.sign(dy) * sinE * d, target.pos.z + uz * k) };
}

// ------------------------------------------------------------ no idling at the back

/**
 * No ship idles at the back (brief §22, §21.4; PACING_PLAN.md §3.2 Q2b, §3.3 Q3; all SIMULATION_ESTIMATE):
 * once its fleet is engaged under an attack-type order, an organic hull with no enemy hull within its longest weapon
 * range for `seconds` moves up — into a forward gap a loss left in its fleet, else beside the nearest ally in trouble
 * (damaged, or with more enemy hulls than friends in its reach), else straight in — until something is in reach:
 * escorts to `escortReach` × their range, capitals only to their standoff band — each along its own lane (`LANE`:
 * an escort keeps its place in its group, the group leans in as a group), never onto a point another hull holds. Once
 * there it holds that point (a steady gun platform; `HOLD_SLACK`) and keeps the lean while its fleet stays engaged
 * under the same order (no oscillating between the lean and its slot). The count runs from the fleet's contact
 * (`fleetEngaged`), whether or not the anchor is still settling: the battlegroups spread the capitals across the line,
 * and a wing group waiting for the anchor to stop left the centre to fight alone (Q2b's anchor gate, measured on the
 * reference engagement). Reapers never idle once their fleet is engaged (`reaperAdvanceGoal`). Only Hold and Defend
 * (and the non-attack orders) keep ships back.
 */
export const NO_IDLE = {
  seconds: 10,
  /** Reach is re-checked on this cadence (s). */
  checkEvery: 0.5,
  escortReach: 0.9,
  /** Moving-up pace: half speed (the escorts' pace, PACING_PLAN.md Q2b). */
  baseSpeed: 0.5,
  /** A forward vacancy is taken when its station is at least this × the hull's range nearer the enemy than the hull's own. */
  gapGain: 0.15,
  /** An ally is in trouble below this hull fraction, or when more enemy hulls than friends are within its reach. */
  allyDamaged: 0.5,
  /** An ally in trouble is backed up when it is within this × the hull's range. */
  allyReach: 2,
  /** Far out — no enemy hull within this × the hull's reach — a hull moves up at once, not after `seconds`. */
  far: 1.5,
  /** Beyond this × the distance it closes to, a hull moving up goes at full speed; inside it, at `baseSpeed`. */
  farPace: 1.25,
} as const;

/** Whether a hull is far out of reach: no enemy hull within `NO_IDLE.far` × `reach`. */
function farOut(ctx: AiContext, ship: ShipState, reach: number): boolean {
  return !enemyWithin(ctx, ship, NO_IDLE.far * reach);
}

/** The orders under which every hull engages (brief §21.4, "Attack means everyone fights"). */
export const ENGAGE_ORDERS: ReadonlySet<OrderType> = new Set<OrderType>(['attack', 'attack_target', 'advance', 'intercept']);

/** A fleet is in contact while an enemy combatant is within this × its engagement range of any of its fighting hulls. */
export const CONTACT_RANGE_FACTOR = 1.1;

/**
 * A fleet is engaged once its heading has locked (the enemy centroid within 1.1 × its range, PACING_PLAN.md §3.2) and
 * stays engaged while it is in contact — an enemy combatant within `CONTACT_RANGE_FACTOR` × its range of any of its
 * hulls (`FleetMotion.contact`). The heading lock alone left a gap: when a reserve wave appears the enemy centroid
 * jumps, the heading unlocks and no hull moved up although the first wave's survivors were still fighting inside the
 * formation. Contact does not start the first engagement: on the approach the forward screen meets the enemy first,
 * and a fleet engaged by its screen sent every hull behind it in at full speed, out of its group.
 */
export const fleetEngaged = (fleet: FleetState): boolean => {
  const m = fleetMotion(fleet);
  if (fleet.headingLocked) m.engagedOnce = true;
  return fleet.headingLocked || (m.engagedOnce && m.contact);
};

/**
 * Whether any of `mine` has an enemy combatant within `reach` (the contact test, on the fleet's slow refresh): a
 * bounding-sphere test first, so fleets far apart cost two centroid passes; then hull by hull, stopping at the first.
 */
export function inContact(mine: readonly ShipState[], enemies: readonly ShipState[], reach: number): boolean {
  if (mine.length === 0 || enemies.length === 0 || !(reach > 0)) return false;
  const sphere = (list: readonly ShipState[]): { x: number; y: number; z: number; r: number } => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const s of list) {
      x += s.pos.x;
      y += s.pos.y;
      z += s.pos.z;
    }
    x /= list.length;
    y /= list.length;
    z /= list.length;
    let r = 0;
    for (const s of list) r = Math.max(r, Math.hypot(s.pos.x - x, s.pos.y - y, s.pos.z - z));
    return { x, y, z, r };
  };
  const a = sphere(mine);
  const b = sphere(enemies);
  if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > a.r + b.r + reach) return false;
  const r2 = reach * reach;
  for (const s of mine) {
    for (const e of enemies) {
      const dx = e.pos.x - s.pos.x;
      const dy = e.pos.y - s.pos.y;
      const dz = e.pos.z - s.pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
  }
  return false;
}

/** Longest weapon range of a hull (every mount; for nearly every hull its main battery). */
export function longestRange(ship: ShipState): number {
  let r = 0;
  for (const w of ship.weapons) if (w.def.range > r) r = w.def.range;
  return r;
}

/** Longest spinal-gun range of a hull (a forward-arc anti-capital mass accelerator; 0 without one). */
function spinalOf(ship: ShipState): number {
  let r = 0;
  for (const w of ship.weapons) if (w.def.kind === 'mass_accelerator' && w.def.antiCapital && w.def.arc <= 20 && w.def.range > r) r = w.def.range;
  return r;
}

/** Whether any enemy hull (craft excluded; `capitals`: capital hulls only) lies within `r` of the ship. */
function enemyWithin(ctx: AiContext, ship: ShipState, r: number, capitals = false): boolean {
  const r2 = r * r;
  for (const e of ctx.enemyCombatants(ship.side)) {
    if (capitals && !isCapitalRole(e.role)) continue;
    const dx = e.pos.x - ship.pos.x;
    const dy = e.pos.y - ship.pos.y;
    const dz = e.pos.z - ship.pos.z;
    if (dx * dx + dy * dy + dz * dz <= r2) return true;
  }
  return false;
}

/** The nearest enemy capital hull (undefined when the enemy fields none). */
function nearestEnemyCapital(ctx: AiContext, ship: ShipState): ShipState | undefined {
  let best: ShipState | undefined;
  let bd = Infinity;
  for (const e of ctx.enemyCombatants(ship.side)) {
    if (!isCapitalRole(e.role)) continue;
    const d = (e.pos.x - ship.pos.x) ** 2 + (e.pos.y - ship.pos.y) ** 2 + (e.pos.z - ship.pos.z) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/**
 * A spinal-gun capital's line answers the enemy's line (brief §21.4: "capital lines advance to their standoff band"):
 * its reach is an enemy capital within its spinal range, and it moves up on the nearest enemy capital — escorts in
 * range do not hold it back. Undefined for every other hull, or when the enemy fields no capital.
 */
function lineTarget(ctx: AiContext, ship: ShipState): { range: number; nearest: () => ShipState | undefined } | undefined {
  if (!isCapitalRole(ship.role) || ship.role === 'carrier') return undefined;
  const spinal = spinalOf(ship);
  if (spinal <= 0) return undefined;
  if (!ctx.enemyCombatants(ship.side).some((e) => isCapitalRole(e.role))) return undefined;
  return { range: spinal, nearest: () => nearestEnemyCapital(ctx, ship) };
}

/** How close a hull moves up to its target: capitals to their standoff band, every other hull to 0.9 × its range. */
function moveUpDistance(ship: ShipState, fleet: FleetState): number {
  const own = mainRange(ship) || longestRange(ship);
  if (!isCapitalRole(ship.role) || ship.role === 'carrier') return NO_IDLE.escortReach * own;
  const spinal = spinalOf(ship);
  const doctrine = fleet.spec.faction === 'alliance' || fleet.spec.faction === 'cerberus';
  return doctrine && spinal > 0 ? SPINAL_STANDOFF.want * spinal : NO_IDLE.escortReach * own;
}

/** A gap a loss left in a fleet (its slot and group, and whose station it was). */
interface Vacancy {
  slot: Vec3;
  groupSlot: Vec3;
  leaderId?: string;
  /** The lost hull led its group: whoever fills the gap leads that group's escorts. */
  ledId?: string;
  capital: boolean;
}
const VACANCIES = new WeakMap<FleetState, Vacancy[]>();

/**
 * Record the gap a destroyed hull leaves in its fleet's formation (the battle calls this on every loss, with the
 * fleet's other live members). A lost group leader's escorts fall in with the nearest group capital still in the
 * line, from where they are: their station becomes their present offset from that capital, so the group re-forms
 * without a dash across the formation (brief §22, "groups stay coherent").
 */
export function noteLoss(fleet: FleetState, ship: ShipState, members: readonly ShipState[] = []): void {
  if (ship.role === 'fighter' || ship.stealth) return;
  let list = VACANCIES.get(fleet);
  if (!list) VACANCIES.set(fleet, (list = []));
  list.push({ slot: { ...ship.slot }, groupSlot: { ...(ship.groupSlot ?? ship.slot) }, leaderId: ship.groupLeaderId, ledId: ship.groupLeaderId ? undefined : ship.id, capital: isCapitalRole(ship.role) && ship.role !== 'carrier' });
  if (ship.groupLeaderId) return;
  const caps = members.filter((s) => s !== ship && s.alive && !s.escaped && !s.groupLeaderId && isGroupCapital(s.role) && !s.withdrawing);
  if (caps.length === 0) return;
  const h = fleet.heading;
  for (const e of members) {
    if (e.groupLeaderId !== ship.id || !e.alive) continue;
    let c = caps[0];
    let best = Infinity;
    for (const k of caps) {
      const d = Math.hypot(k.pos.x - e.pos.x, k.pos.y - e.pos.y, k.pos.z - e.pos.z);
      if (d < best) {
        best = d;
        c = k;
      }
    }
    const ref = c.groupSlot ?? c.slot;
    const wx = e.pos.x - c.pos.x;
    const wz = e.pos.z - c.pos.z;
    e.groupLeaderId = c.id;
    e.groupSlot = { ...ref };
    // The world offset in fleet axes (the inverse of `offsetToWorld`).
    e.slot = v3(ref.x + h.z * wx - h.x * wz, ref.y + e.pos.y - c.pos.y, ref.z + h.x * wx + h.z * wz);
  }
}

/** Fill a forward gap: the nearest-to-the-enemy vacancy of the hull's kind that lies well forward of its own station. */
function fillGap(ctx: AiContext, ship: ShipState, fleet: FleetState, enemy: ShipState): boolean {
  const list = VACANCIES.get(fleet);
  if (!list || list.length === 0 || ship.role === 'carrier') return false;
  const capital = isCapitalRole(ship.role);
  const m = fleetMotion(fleet);
  const own = stationOf(ctx, ship, fleet).pos;
  const dist = (p: Vec3): number => Math.hypot(p.x - enemy.pos.x, p.y - enemy.pos.y, p.z - enemy.pos.z);
  const need = dist(own) - NO_IDLE.gapGain * longestRange(ship);
  let best = -1;
  let bd = Infinity;
  list.forEach((v, i) => {
    if (v.capital !== capital) return;
    const p = slotToWorld(fleet.anchor, fleet.heading, spreadSlot({ slot: v.slot, groupSlot: v.groupSlot } as ShipState, m.approach));
    const d = dist(p);
    if (d < need && d < bd) {
      bd = d;
      best = i;
    }
  });
  if (best < 0) return false;
  const [v] = list.splice(best, 1);
  ship.slot = { ...v.slot };
  ship.groupSlot = { ...v.groupSlot };
  if (v.ledId) {
    // The hull takes over the lost leader's group: its escorts now keep station on it.
    ship.groupLeaderId = undefined;
    for (const o of ctx.membersOf(fleet.spec.id)) if (o.groupLeaderId === v.ledId) o.groupLeaderId = ship.id;
  } else {
    const lead = v.leaderId ? ctx.getShip(v.leaderId) : undefined;
    ship.groupLeaderId = lead && lead.alive ? lead.id : undefined;
  }
  return true;
}

/** The enemy pressing an ally hardest: the one targeting it with the most recent damage, else the nearest to it. */
function pressing(ctx: AiContext, ally: ShipState): ShipState | undefined {
  let best: ShipState | undefined;
  let top = -1;
  let nearest: ShipState | undefined;
  let nd = Infinity;
  for (const e of ctx.enemyCombatants(ally.side)) {
    if (e.targetId === ally.id && e.stats.recentDamage > top) {
      top = e.stats.recentDamage;
      best = e;
    }
    const d = Math.hypot(e.pos.x - ally.pos.x, e.pos.y - ally.pos.y, e.pos.z - ally.pos.z);
    if (d < nd) {
      nd = d;
      nearest = e;
    }
  }
  return best ?? nearest;
}

/** The nearest ally in trouble within reach: damaged, or with more enemy hulls than friends within its own range. */
function allyInTrouble(ctx: AiContext, ship: ShipState): ShipState | undefined {
  const reach = NO_IDLE.allyReach * longestRange(ship);
  const enemies = ctx.enemyCombatants(ship.side);
  let best: ShipState | undefined;
  let bd = Infinity;
  for (const a of ctx.alliesOf(ship.side)) {
    if (a === ship || a.role === 'fighter' || a.withdrawing || a.stealth || !a.alive || a.escaped) continue;
    const d = Math.hypot(a.pos.x - ship.pos.x, a.pos.y - ship.pos.y, a.pos.z - ship.pos.z);
    if (d > reach || d >= bd) continue;
    let trouble = a.hull < NO_IDLE.allyDamaged * a.maxHull;
    if (!trouble) {
      const r2 = longestRange(a) ** 2;
      let foes = 0;
      for (const e of enemies) if ((e.pos.x - a.pos.x) ** 2 + (e.pos.y - a.pos.y) ** 2 + (e.pos.z - a.pos.z) ** 2 <= r2) foes++;
      if (foes > 0) {
        let friends = 0;
        for (const f of ctx.alliesOf(ship.side)) if (f.role !== 'fighter' && (f.pos.x - a.pos.x) ** 2 + (f.pos.y - a.pos.y) ** 2 + (f.pos.z - a.pos.z) ** 2 <= r2) friends++;
        trouble = foes > friends;
      }
    }
    if (trouble) {
      bd = d;
      best = a;
    }
  }
  return best;
}

/**
 * The organic no-idle rule for a hull that would otherwise hold its station (see `NO_IDLE`). Returns the move-up
 * goal while one is in force, undefined otherwise (the hull keeps its station; after filling a gap the station is
 * the gap). Reach is checked every `checkEvery` seconds against every enemy hull.
 */
export function moveUpGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal | undefined {
  const m = shipMotion(ship);
  const o = fleet.orders.order;
  if (!ENGAGE_ORDERS.has(o) || !fleetEngaged(fleet) || fleet.static) {
    if (m.moveUp) dropLane(ctx, ship);
    m.moveUp = undefined;
    m.outSince = -1;
    return undefined;
  }
  if (m.moveUp && m.moveUp.order !== o) m.moveUp = undefined;
  const now = ctx.time;
  if (now >= m.reachAt - 1e-9) {
    m.reachAt = now + NO_IDLE.checkEvery;
    const line = lineTarget(ctx, ship);
    const reach = line ? line.range : longestRange(ship);
    // The hull's own gun target beyond its reach (the line's focus, say) counts as nothing in reach, whatever else is
    // near: the hull closes on what its fire control wants to shoot (brief §8.6, "firing or moving for a solution").
    const gun = weaponTarget(ctx, ship);
    const gunOut = gun !== undefined && gun.role !== 'fighter' && Math.hypot(gun.pos.x - ship.pos.x, gun.pos.y - ship.pos.y, gun.pos.z - ship.pos.z) > reach ? gun : undefined;
    m.inReach = !gunOut && enemyWithin(ctx, ship, reach, line !== undefined);
    if (m.inReach) m.outSince = -1;
    else if (m.outSince < 0) m.outSince = now;
    const nearest = (): ShipState | undefined => gunOut ?? (line ? line.nearest() : undefined) ?? nearestEnemyCombatant(ctx, ship);
    if (m.moveUp) {
      // Keep moving up on what is there now: the ally's current attacker while it needs backing up, else the nearest
      // enemy hull (the nearest enemy capital for a spinal line; a target picked once may simply outrun a slow hull).
      const ally = m.moveUp.kind === 'backup' && m.moveUp.allyId ? ctx.getShip(m.moveUp.allyId) : undefined;
      const foe = ally && ally.alive && !ally.escaped ? pressing(ctx, ally) : undefined;
      const e = foe ?? nearest();
      // The same target keeps the point the hull holds; a new one starts a new approach.
      const same = e !== undefined && e.id === m.moveUp.targetId;
      m.moveUp = e ? { targetId: e.id, order: o, kind: foe ? 'backup' : 'lean', allyId: foe ? m.moveUp.allyId : undefined, hold: same ? m.moveUp.hold : undefined } : undefined;
    } else if (m.outSince >= 0 && (now - m.outSince >= NO_IDLE.seconds - 1e-9 || farOut(ctx, ship, reach))) {
      const e = nearest();
      if (e) {
        if (fillGap(ctx, ship, fleet, e)) m.outSince = now;
        else {
          const ally = allyInTrouble(ctx, ship);
          const foe = ally ? pressing(ctx, ally) : undefined;
          m.moveUp = foe && ally ? { targetId: foe.id, order: o, kind: 'backup', allyId: ally.id } : { targetId: e.id, order: o, kind: 'lean' };
        }
      }
    }
  }
  if (!m.moveUp) {
    dropLane(ctx, ship);
    return undefined;
  }
  const t = ctx.getShip(m.moveUp.targetId);
  if (!t || !t.alive) return undefined;
  const line = lineTarget(ctx, ship);
  return laneGoal(ctx, ship, fleet, t, moveUpDistance(ship, fleet), NO_IDLE.baseSpeed, weaponTarget(ctx, ship), line ? line.range : longestRange(ship));
}

/** The hull's own gun target (its fire control may well have chosen another hull than the one it moves up on). */
const weaponTarget = (ctx: AiContext, ship: ShipState): ShipState | undefined => {
  const t = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  return t && t.alive && !t.escaped ? t : undefined;
};

/**
 * Lanes for hulls moving up (brief §22: "never a crowd", "escorts spread around their group", "groups a camera can tell
 * apart"). A hull moving up does not close on the one point every hull on the same enemy would reach along its own
 * bearing (they converged on it and parked there, a ball of frigates from three fleets): its lane ends `want` from the
 * enemy on its group's side — an escort of a leading capital keeps its station's offset across the line from the
 * enemy to that capital, so the group leans in as a group, its escorts on parallel lanes; any other hull keeps its own
 * bearing — and that end is kept at least `need` from every other lane end and every hull of its side keeping station
 * there (`laneNeed`: the pair's minimum separation, never under `spacingKm`) by a deterministic search round the enemy
 * (`SPIRAL`, `need` per step, the hull's own side first), re-checked on the no-idle cadence. The hull holds the end
 * once there. All SIMULATION_ESTIMATE.
 */
export const LANE = {
  /** No two lane ends nearer than this (km): about the spacing of a group's escorts (1.8 nominal km × SLOT_COMPRESSION). */
  spacingKm: 1,
  /** An escort's offset across its group's axis is kept within this × the distance it closes to. */
  maxLateral: 0.6,
  /** A hull this near its lane end (km) holds it. */
  arriveKm: 0.3,
} as const;

/** Lane-end offsets round the enemy, in steps across (`a`, mirrored by the hull's own side) and up (`b`): nearest first. */
const SPIRAL: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [[0, 0]];
  for (let k = 1; k <= 4; k++) {
    const ring: [number, number][] = [];
    for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) if (Math.max(Math.abs(a), Math.abs(b)) === k) ring.push([a, b]);
    ring.sort((p, q) => p[0] * p[0] + p[1] * p[1] - (q[0] * q[0] + q[1] * q[1]) || Math.abs(p[1]) - Math.abs(q[1]) || q[0] - p[0] || q[1] - p[1]);
    out.push(...ring);
  }
  return out;
})();

/** The lane end a hull keeps from another hull's (or from a hull keeping station there): km. */
const laneNeed = (a: ShipState, b: ShipState): number => Math.max(LANE.spacingKm, minSeparationKm(a, b));

interface LaneEnd {
  p: Vec3;
  ship: ShipState;
  time: number;
}
/** The current lane ends of the hulls moving up, per battle (its AI context) and side; each hull refreshes its own every step. */
const LANE_ENDS = new WeakMap<object, { A: Map<string, LaneEnd>; B: Map<string, LaneEnd> }>();
function laneBook(ctx: AiContext, side: 'A' | 'B'): Map<string, LaneEnd> {
  let b = LANE_ENDS.get(ctx);
  if (!b) LANE_ENDS.set(ctx, (b = { A: new Map(), B: new Map() }));
  return b[side];
}
/** An entry refreshed this step or the last is current (ship order: a later hull refreshes after an earlier one looks). */
const laneCurrent = (ctx: AiContext, e: LaneEnd): boolean => e.time >= ctx.time - 1.5 * DT_HINT && e.ship.alive && !e.ship.escaped;

/** Drop a hull's lane end (its move-up ended). */
function dropLane(ctx: AiContext, ship: ShipState): void {
  const b = LANE_ENDS.get(ctx);
  if (b) b[ship.side].delete(ship.id);
}

/** Whether `p` keeps every pair's `laneNeed` from the other lane ends of the hull's side and from its hulls keeping station. */
function laneClear(ctx: AiContext, ship: ShipState, p: Vec3, book: Map<string, LaneEnd>): boolean {
  for (const [id, e] of book) {
    if (id === ship.id || !laneCurrent(ctx, e)) continue;
    const need = laneNeed(ship, e.ship);
    if ((p.x - e.p.x) ** 2 + (p.y - e.p.y) ** 2 + (p.z - e.p.z) ** 2 < need * need) return false;
  }
  const far = Math.max(LANE.spacingKm, minSeparationKm(ship, { role: 'reaper_capital', lengthKm: Math.max(ship.lengthKm, ctx.largestHullKm()) }));
  for (const o of ctx.hullsNear(p, far)) {
    if (o === ship || o.side !== ship.side || o.role === 'fighter' || !o.alive || o.escaped) continue;
    const e = book.get(o.id);
    if (e && laneCurrent(ctx, e)) continue;
    const need = laneNeed(ship, o);
    if ((p.x - o.pos.x) ** 2 + (p.y - o.pos.y) ** 2 + (p.z - o.pos.z) ** 2 < need * need) return false;
  }
  return true;
}

/**
 * The end of a hull's lane toward `t` at `want` km (see `LANE`), registered as the hull's lane end for this step. The
 * lane is chosen when the hull first leans on `t` and re-checked on the no-idle cadence: the nearest clear end.
 */
function laneEnd(ctx: AiContext, ship: ShipState, fleet: FleetState, t: ShipState, want: number): Vec3 {
  const m = shipMotion(ship);
  const book = laneBook(ctx, ship.side);
  // The lane's axis: from the enemy to the group capital the escort keeps station on, else to the hull itself.
  const lead = ship.groupLeaderId ? ctx.getShip(ship.groupLeaderId) : undefined;
  const grouped = lead !== undefined && ship.groupSlot !== undefined && leads(lead);
  const ref = grouped ? lead.pos : ship.pos;
  let ex = ref.x - t.pos.x;
  let ey = ref.y - t.pos.y;
  let ez = ref.z - t.pos.z;
  let el = Math.hypot(ex, ey, ez);
  if (el < 1e-6) {
    ex = -fleet.heading.x;
    ey = 0;
    ez = -fleet.heading.z;
    el = Math.hypot(ex, ez) || 1;
  }
  ex /= el;
  ey /= el;
  ez /= el;
  // An escort's offset across that axis (its place in the group, turned with the fleet), within `maxLateral` × want.
  let ox = 0;
  let oy = 0;
  let oz = 0;
  if (grouped) {
    const g = ship.groupSlot!;
    const o = offsetToWorld(fleet.heading, v3(ship.slot.x - g.x, ship.slot.y - g.y, ship.slot.z - g.z));
    const along = o.x * ex + o.y * ey + o.z * ez;
    ox = o.x - along * ex;
    oy = o.y - along * ey;
    oz = o.z - along * ez;
    const ol = Math.hypot(ox, oy, oz);
    const cap = LANE.maxLateral * want;
    if (ol > cap) {
      ox *= cap / ol;
      oy *= cap / ol;
      oz *= cap / ol;
    }
  }
  const back = Math.sqrt(Math.max(0, want * want - (ox * ox + oy * oy + oz * oz)));
  // The base lane end and the basis round the enemy for the search: `u` from the enemy to it, `s` across, `v` up.
  let ux = ex * back + ox;
  let uy = ey * back + oy;
  let uz = ez * back + oz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  let sx = uz;
  let sz = -ux;
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) {
    sx = fleet.heading.z;
    sz = -fleet.heading.x;
  } else {
    sx /= sl;
    sz /= sl;
  }
  // v = u × s (u and s are orthogonal unit vectors, s horizontal).
  const vx = uy * sz;
  const vy = uz * sx - ux * sz;
  const vz = -uy * sx;
  const step = laneNeed(ship, ship) / want;
  const side = hash01(ship.id, 43) < 0.5 ? 1 : -1;
  const at = (k: number): Vec3 => {
    const [a, b] = SPIRAL[k];
    const px = ux + (a * side * sx + b * vx) * step;
    const py = uy + b * vy * step;
    const pz = uz + (a * side * sz + b * vz) * step;
    const pl = Math.hypot(px, py, pz) || 1;
    return v3(t.pos.x + (px / pl) * want, t.pos.y + (py / pl) * want, t.pos.z + (pz / pl) * want);
  };
  let lane = m.lane;
  if (!lane || lane.targetId !== t.id) lane = m.lane = { targetId: t.id, k: 0, at: -Infinity };
  if (ctx.time >= lane.at - 1e-9) {
    lane.at = ctx.time + NO_IDLE.checkEvery;
    if (!laneClear(ctx, ship, at(lane.k), book)) {
      const free = SPIRAL.findIndex((_, i) => laneClear(ctx, ship, at(i), book));
      if (free >= 0) lane.k = free;
    }
  }
  const p = at(lane.k);
  book.set(ship.id, { p, ship, time: ctx.time });
  return p;
}

/**
 * Close on `t` to `want` km along the hull's lane (`LANE`) at `pace0` × top speed — at full speed while still beyond
 * `NO_IDLE.farPace` × `want` — then hold the lane end (or, already within `want` with its own spot clear, that spot)
 * until the target draws off beyond `HOLD_SLACK` × `want` (never past the hull's `reach`). The hull faces its own gun
 * target when a forward mount bears on it (else `t`), so moving up never turns a spinal gun off the hull it is shooting.
 */
function laneGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, t: ShipState, want: number, pace0: number, gunTarget: ShipState | undefined, reach: number): MovementGoal {
  const mu = shipMotion(ship).moveUp!;
  const book = laneBook(ctx, ship.side);
  const d = Math.hypot(ship.pos.x - t.pos.x, ship.pos.y - t.pos.y, ship.pos.z - t.pos.z) || 1e-6;
  const pace = d > NO_IDLE.farPace * want ? 1 : pace0;
  const face = faceIfBearing(ship, gunTarget) ?? t.pos;
  const hold = (p: Vec3): MovementGoal => {
    book.set(ship.id, { p, ship, time: ctx.time });
    return { position: p, speedFraction: pace, velocity: ZERO, face };
  };
  // Holding: a steady gun platform, no chasing round a moving target, until it draws off beyond the slack.
  const h = mu.hold;
  if (h && Math.hypot(h.x - t.pos.x, h.y - t.pos.y, h.z - t.pos.z) <= Math.min(HOLD_SLACK * want, reach)) return hold(h);
  mu.hold = undefined;
  // Already within the wanted distance on a spot of its own: hold it.
  if (d <= want && laneClear(ctx, ship, ship.pos, book)) return hold((mu.hold = v3(ship.pos.x, ship.pos.y, ship.pos.z)));
  const p = laneEnd(ctx, ship, fleet, t, want);
  // At the lane end: hold it.
  if (Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z) <= LANE.arriveKm) return hold((mu.hold = p));
  // While short it closes on the point (a fast target's own velocity would only drag a slow hull alongside it).
  return { position: p, speedFraction: pace, face };
}

/** A hull that has moved up holds its point until its target is beyond this × the distance it closed to (or its reach). */
export const HOLD_SLACK = 1.15;

/**
 * Reapers never idle (AP §10; PACING_PLAN.md §3.3 Q3; brief §22): under an attack-type order, once the fleet is
 * engaged (or its anchor has stopped), a Reaper hull with no enemy hull within its main range closes — on its own gun
 * target when it has one, else on the nearest enemy hull — to 0.8 × its range at 0.6 × top speed (full speed while far
 * out, as every hull moving up), and keeps pressing (on its target, or the nearest enemy hull once that is gone) while
 * its fleet stays engaged under the same order. A hull with an enemy in reach keeps its station: it fires on what is
 * in reach. Hold and Defend keep it in place.
 */
export function reaperAdvanceGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, target: ShipState | undefined): MovementGoal | undefined {
  const m = shipMotion(ship);
  const o = fleet.orders.order;
  const av = fleetMotion(fleet).anchorVel;
  if (!ENGAGE_ORDERS.has(o) || (!fleetEngaged(fleet) && Math.hypot(av.x, av.y, av.z) >= 0.1 * ship.maxSpeed)) {
    if (m.moveUp) dropLane(ctx, ship);
    m.moveUp = undefined;
    return undefined;
  }
  if (m.moveUp && m.moveUp.order !== o) m.moveUp = undefined;
  const range = mainRange(ship);
  const now = ctx.time;
  if (now >= m.reachAt - 1e-9) {
    m.reachAt = now + NO_IDLE.checkEvery;
    m.inReach = enemyWithin(ctx, ship, range);
    const gun = target && target.alive && !target.escaped && target.role !== 'fighter' ? target : undefined;
    const gunOut = gun && Math.hypot(gun.pos.x - ship.pos.x, gun.pos.y - ship.pos.y, gun.pos.z - ship.pos.z) > range ? gun : undefined;
    if (m.moveUp || !m.inReach) {
      const e = gunOut ?? (m.moveUp ? ctx.getShip(m.moveUp.targetId) : undefined) ?? nearestEnemyCombatant(ctx, ship);
      const live = e && e.alive && !e.escaped ? e : nearestEnemyCombatant(ctx, ship);
      const same = live !== undefined && m.moveUp !== undefined && m.moveUp.targetId === live.id;
      m.moveUp = live ? { targetId: live.id, order: o, kind: 'lean', hold: same ? m.moveUp!.hold : undefined } : undefined;
    }
  }
  if (!m.moveUp) {
    dropLane(ctx, ship);
    return undefined;
  }
  const t = ctx.getShip(m.moveUp.targetId);
  if (!t || !t.alive || t.escaped) return undefined;
  return laneGoal(ctx, ship, fleet, t, 0.8 * range, REAPER_ADVANCE_FRACTION, target, range);
}

/** A frigate's run line sits up to this far above or below its target (km; seeded per frigate). */
export const RUN_LANE_KM = 1.2;

/** Frigates fly straight runs and turn-ins under loose formations and attack orders (CINEMATIC_DESIGN.md §7.1 item 5). */
export const frigateRuns = (ship: ShipState, fleet: FleetState): boolean => {
  const f = fleet.orders.formation;
  const o = fleet.orders.order;
  return (
    ship.role === 'frigate' &&
    !ship.stealth &&
    (f === 'dispersed' || f === 'strike_wedge' || f === 'stacked_wedge' || f === 'swarm_descent') &&
    (o === 'attack' || o === 'attack_target' || o === 'intercept' || o === 'advance') &&
    FACTIONS[ship.faction].doctrine.cohesion < 0.95
  );
};

/**
 * Frigate run machine: `approach` (to the start of a run line parallel to the enemy front, in torpedo range) →
 * `run` (straight across, 12–20 s, torpedoes and guns fire in arc) → `turnIn` (toward the target to 0.75 × torpedo
 * range) → `extend` (6 s straight away) → `approach` on the other side, so successive runs alternate direction and
 * the path never winds up in one sense. No orbit term.
 */
export function frigateRunGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, target: ShipState): MovementGoal {
  const m = shipMotion(ship);
  let torp = 0;
  for (const w of ship.weapons) if (w.def.kind === 'disruptor_torpedo' && w.def.range > torp) torp = w.def.range;
  if (torp <= 0) torp = Math.max(4, mainRange(ship));
  const b = fleet.approachBearing;
  const r = rightOf(b);
  const speed = ship.maxSpeed;
  const runSeconds = 12 + 8 * ((hash01(ship.id, 5) + golden(m.cycle + 1)) % 1);
  // Each frigate flies its own run line (brief §22, never a crowd): every frigate of a fleet on one target shared one
  // line, so their runs bunched into a ball; its height (±`RUN_LANE_KM`) and the line's centre along the front (± a
  // quarter of its length) are its own, seeded by its id; the stand-off stays 0.85 × torpedo range.
  const D = 0.85 * torp;
  const L = Math.max(2, speed * runSeconds);
  const lift = (hash01(ship.id, 53) * 2 - 1) * RUN_LANE_KM;
  const shift = (hash01(ship.id, 57) * 2 - 1) * 0.25 * L;
  const now = ctx.time;
  let man = ship.manoeuvre;
  if (!man) man = ship.manoeuvre = { phase: 'approach', until: now + 40 };
  const tp = target.pos;
  const lineFor = (side: number): { from: Vec3; to: Vec3 } => ({
    from: v3(tp.x - b.x * D + r.x * (shift - side * (L / 2)), tp.y + lift, tp.z - b.z * D + r.z * (shift - side * (L / 2))),
    to: v3(tp.x - b.x * D + r.x * (shift + side * (L / 2)), tp.y + lift, tp.z - b.z * D + r.z * (shift + side * (L / 2))),
  });
  const dist = (p: Vec3): number => Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z);
  switch (man.phase) {
    case 'approach': {
      const line = lineFor(m.side);
      man.line = line;
      if (dist(line.from) < 0.5 || now > man.until) {
        man.phase = 'run';
        man.until = now + runSeconds;
      }
      return { position: line.from, speedFraction: 1, transit: true };
    }
    case 'run': {
      const line = lineFor(m.side);
      man.line = line;
      if (dist(line.to) < 0.5 || now > man.until) {
        man.phase = 'turnIn';
        man.until = now + 12;
      }
      return { position: line.to, speedFraction: 1, transit: true };
    }
    case 'turnIn': {
      if (dist(tp) <= 0.75 * torp || now > man.until) {
        man.phase = 'extend';
        man.until = now + 6;
        const dx = ship.pos.x - tp.x;
        const dz = ship.pos.z - tp.z;
        const away = flatNorm(dx, dz) ?? v3(-b.x, 0, -b.z);
        man.line = { from: v3(ship.pos.x, ship.pos.y, ship.pos.z), to: v3(ship.pos.x + away.x * 12, ship.pos.y, ship.pos.z + away.z * 12) };
      }
      return { position: tp, speedFraction: 1, transit: true, face: tp };
    }
    case 'extend':
    default: {
      if (now > man.until) {
        m.side = -m.side;
        m.cycle++;
        man.phase = 'approach';
        man.until = now + 40;
      }
      const to = man.line?.to ?? v3(ship.pos.x - b.x * 10, ship.pos.y, ship.pos.z - b.z * 10);
      return { position: to, speedFraction: 1, transit: true };
    }
  }
}

/** Range of the weapons that can engage the target: guns against small craft, everything else against hulls. */
function engageRange(ship: ShipState, target: ShipState): number {
  let r = 0;
  const small = target.role === 'fighter';
  for (const w of ship.weapons) {
    if (small ? !w.def.antiSmall : w.def.antiSmall && w.def.kind !== 'gardian') continue;
    if (w.ammo !== undefined && w.ammo <= 0) continue;
    if (w.def.range > r) r = w.def.range;
  }
  if (r <= 0) for (const w of ship.weapons) r = Math.max(r, w.def.range);
  return r;
}

/** Projectile speed of the fastest gun that can engage the target (beams count as instantaneous). */
function gunSpeed(ship: ShipState, target: ShipState): number {
  let v = 0;
  const small = target.role === 'fighter';
  for (const w of ship.weapons) {
    if (small ? !w.def.antiSmall : w.def.antiSmall) continue;
    v = Math.max(v, Number.isFinite(w.def.projectileSpeed) ? w.def.projectileSpeed : 1e6);
  }
  return v > 0 ? v : 1e6;
}

/**
 * Point-defence repulsion (CINEMATIC_DESIGN.md §7.1 item 6): a velocity bias away from every enemy hull other than
 * the target whose point-defence envelope (× 1.1) the craft is inside.
 */
export function pdRepulsion(ctx: AiContext, ship: ShipState, target: ShipState | undefined, near: readonly ShipState[]): Vec3 | undefined {
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let any = false;
  for (const e of near) {
    if (e === target || e.role === 'fighter') continue;
    const R = pdRange(e) * 1.1;
    if (R <= 0) continue;
    const dx = ship.pos.x - e.pos.x;
    const dy = ship.pos.y - e.pos.y;
    const dz = ship.pos.z - e.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= R || d < 1e-6) continue;
    const k = (ship.maxSpeed * 0.8 * (1 - d / R)) / d;
    rx += dx * k;
    ry += dy * k;
    rz += dz * k;
    any = true;
  }
  void ctx;
  return any ? v3(rx, ry, rz) : undefined;
}

/**
 * Fighter and Oculus strafing passes (CINEMATIC_DESIGN.md §7.1 item 6): `approach` (to the stand-off point, 0.9 × the
 * range of the weapon that can engage the target) → `pass` (beside the target and out the far side, firing in arc)
 * → `extend` (3 s straight on) → `turn` (a new approach vector 40–70° round, seeded; successive passes alternate
 * side and sense, so no craft winds a full orbit round its target).
 */
export function fighterPassGoal(ctx: AiContext, ship: ShipState, target: ShipState, near: readonly ShipState[]): MovementGoal {
  const m = shipMotion(ship);
  const now = ctx.time;
  const tp = target.pos;
  // Against another craft it is a chase, not a strafing pass: hold the stand-off (0.9 × gun range) behind the target,
  // matching its velocity, nose on it — no orbit, and no ramming through it. The nose points at the target itself:
  // the guns' arc is judged on the target's position (the round is then aimed at the intercept), so a nose on a
  // lead point a second ahead kept a crossing drone outside a 20° gun arc almost all the time (CORE T10 → chunk 4 fix).
  if (target.role === 'fighter') {
    ship.manoeuvre = undefined;
    const gun = engageRange(ship, target);
    const standoffKm = 0.9 * gun;
    const dx = ship.pos.x - tp.x;
    const dy = ship.pos.y - tp.y;
    const dz = ship.pos.z - tp.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    // Pursuit lead: the round's flight time to the target (never more than half a second).
    const lead = Math.min(0.5, d / Math.max(0.1, gunSpeed(ship, target)));
    const aim = v3(tp.x + target.vel.x * lead, tp.y + target.vel.y * lead, tp.z + target.vel.z * lead);
    const hold = v3(aim.x + (dx / d) * standoffKm, aim.y + (dy / d) * standoffKm, aim.z + (dz / d) * standoffKm);
    return { position: hold, speedFraction: 1, velocity: target.vel, face: tp, repel: pdRepulsion(ctx, ship, undefined, near) };
  }
  const standoff = 0.9 * engageRange(ship, target);
  const hitR = target.radiusKm;
  if (!m.dir) m.dir = flatNorm(ship.pos.x - tp.x, ship.pos.z - tp.z) ?? v3(0, 0, 1);
  let man = ship.manoeuvre;
  if (!man) man = ship.manoeuvre = { phase: 'approach', until: now + 30 };
  const dir = m.dir;
  const lat = rightOf(dir);
  const repel = man.phase === 'pass' ? undefined : pdRepulsion(ctx, ship, target, near);
  switch (man.phase) {
    case 'approach': {
      const p = v3(tp.x + dir.x * standoff, tp.y + (hash01(ship.id, 13) - 0.5) * 0.6, tp.z + dir.z * standoff);
      const d = Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z);
      const inside = Math.hypot(ship.pos.x - tp.x, ship.pos.z - tp.z) < standoff * 1.05;
      if (d < Math.max(0.3, 0.2 * standoff) || (inside && now > man.until - 25) || now > man.until) {
        man.phase = 'pass';
        man.until = now + 20;
      }
      return { position: p, speedFraction: 1, transit: true, face: tp, repel };
    }
    case 'pass': {
      // Out the far side, offset to the alternating flank so the craft passes beside the hull, not through it.
      const off = hitR * 1.2 + 0.15;
      const beyond = hitR + 0.8;
      const exit = v3(tp.x - dir.x * beyond + lat.x * m.side * off, tp.y, tp.z - dir.z * beyond + lat.z * m.side * off);
      const past = (ship.pos.x - tp.x) * dir.x + (ship.pos.z - tp.z) * dir.z < -(hitR + 0.3);
      if (past || now > man.until) {
        man.phase = 'extend';
        man.until = now + 3;
        const v = flatNorm(ship.vel.x, ship.vel.z) ?? v3(-dir.x, 0, -dir.z);
        man.line = { from: v3(ship.pos.x, ship.pos.y, ship.pos.z), to: v3(ship.pos.x + v.x * 8, ship.pos.y, ship.pos.z + v.z * 8) };
      }
      return { position: exit, speedFraction: 1, transit: true, face: tp };
    }
    case 'extend': {
      if (now > man.until) man.phase = 'turn';
      const to = man.line?.to ?? v3(ship.pos.x - dir.x * 8, ship.pos.y, ship.pos.z - dir.z * 8);
      return { position: to, speedFraction: 1, transit: true, repel };
    }
    case 'turn':
    default: {
      // The new approach vector: the side the craft is on now, swung 40–70° round in the alternating sense.
      const here = flatNorm(ship.pos.x - tp.x, ship.pos.z - tp.z) ?? v3(-dir.x, 0, -dir.z);
      const swing = ((40 + 30 * hash01(ship.id, 17 + m.cycle)) * Math.PI) / 180;
      m.dir = rotateFlat(here, -m.side * swing);
      m.side = -m.side;
      m.cycle++;
      man.phase = 'approach';
      man.until = now + 30;
      const p = v3(tp.x + m.dir.x * standoff, tp.y, tp.z + m.dir.z * standoff);
      return { position: p, speedFraction: 1, transit: true, face: tp, repel };
    }
  }
}

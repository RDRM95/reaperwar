import { v3, type Vec3 } from '@/core/vec3';
import { FACTIONS } from '@/data/factions';
import { isCapitalRole } from '@/data/types';
import type { AiContext, MovementGoal } from './ai';
import { BATTLESPACE_SCALE as S } from './constants';
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
/** Carriers and liveships keep at least this fraction of the nearest enemy's main range (CINEMATIC_DESIGN.md §7.6). */
const CARRIER_KEEP_OUT = 0.8;
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
}

const FLEET_MOTION = new WeakMap<FleetState, FleetMotion>();

export function fleetMotion(fleet: FleetState): FleetMotion {
  let m = FLEET_MOTION.get(fleet);
  if (!m) {
    const o = fleet.spec.initialOrder?.order;
    m = { anchorVel: v3(), reaiming: false, offSince: -1, closeFrom: 0, explicitAttack: o === 'attack' || o === 'attack_target' };
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

const flatNorm = (x: number, z: number): Vec3 | undefined => {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? v3(x / l, 0, z / l) : undefined;
};

/** Signed yaw from heading `a` to direction `b` (both flat, unit): positive turns `a` toward `b` with the rotation below. */
const signedYaw = (a: Vec3, b: Vec3): number => Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);

const rotateFlat = (h: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
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
  // Keep the anchor from drifting too far from the actual fleet (ships lag behind).
  const lx = fleet.anchor.x - view.myCentre.x;
  const ly = fleet.anchor.y - view.myCentre.y;
  const lz = fleet.anchor.z - view.myCentre.z;
  const lag = Math.hypot(lx, ly, lz);
  const maxLag = 12 * S;
  if (lag > maxLag) fleet.anchor = v3(view.myCentre.x + (lx * maxLag) / lag, view.myCentre.y + (ly * maxLag) / lag, view.myCentre.z + (lz * maxLag) / lag);
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
}

const SHIP_MOTION = new WeakMap<ShipState, ShipMotion>();

export function shipMotion(ship: ShipState): ShipMotion {
  let m = SHIP_MOTION.get(ship);
  if (!m) {
    m = { accelFrac: 0, hardFor: -1, manoeuvres: 0, hardCounted: false, side: hash01(ship.id, 7) < 0.5 ? 1 : -1, cycle: 0, withdrawnAt: -1e9, reengagedAt: -1e9, keepOut: 0 };
    SHIP_MOTION.set(ship, m);
  }
  return m;
}

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
  const engineFactor = 0.25 + 0.75 * ship.subsystems.engines;
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
  const w = Math.sin(phase) * amp;
  let px = slotPos.x + r.x * w;
  const py = slotPos.y;
  let pz = slotPos.z + r.z * w;
  // The keep-out is measured from the slot, not the weaved point, so the weave stays a straight side-to-side swing
  // (coupling the two turns the path into an ellipse and the hull circles).
  // The push-back follows the wanted value slowly (a slow hull cannot chase a goal that jumps, it loops round it).
  const e = nearestEnemyCombatant(ctx, ship);
  let want = 0;
  if (e) {
    const need = CARRIER_KEEP_OUT * mainRange(e);
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
  const wv = (Math.cos(phase) * amp * 2 * Math.PI) / CARRIER_WEAVE_PERIOD;
  return { position: v3(px, py, pz), speedFraction: 1, velocity: v3(slotVel.x + r.x * wv - fleet.heading.x * driftV, slotVel.y, slotVel.z + r.z * wv - fleet.heading.z * driftV), face: faceIfBearing(ship, target) };
}

/** Face the target when a forward-arc anti-ship mount has it within 1.4 × its range (otherwise the fleet heading). */
export function faceIfBearing(ship: ShipState, target: ShipState | undefined): Vec3 | undefined {
  if (!target) return undefined;
  const d = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z);
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.arc < 180 && d < w.def.range * 1.4) return target.pos;
  return undefined;
}

/**
 * The default station: hold the slot (moving with the anchor), face the target when a forward mount bears, and —
 * every unit with a weapon fires or moves for a solution — close on a target that is out of range by up to the
 * 2 km slot leash at half speed under an attack order.
 */
export function stationGoal(ship: ShipState, fleet: FleetState, slotPos: Vec3, slotVel: Vec3, target: ShipState | undefined): MovementGoal {
  const face = fleet.doctrineFacing === 'broadside' ? undefined : faceIfBearing(ship, target);
  const o = fleet.orders.order;
  if (target && (o === 'attack' || o === 'attack_target' || o === 'advance' || o === 'intercept')) {
    const range = mainRange(ship);
    const dx = target.pos.x - slotPos.x;
    const dy = target.pos.y - slotPos.y;
    const dz = target.pos.z - slotPos.z;
    const d = Math.hypot(dx, dy, dz);
    // The capital line holds its standoff and leans at most the 2 km leash; the escorts screen forward to their own
    // weapon range (a frigate's guns reach 9.6 km, a spinal line holds at 15–17 km).
    const leash = isCapitalRole(ship.role) ? SLOT_LEASH_KM : SCREEN_LEASH_KM;
    const close = isCapitalRole(ship.role) ? range : 0.9 * range;
    if (range > 0 && d > close && d > 1e-6) {
      const k = Math.min(leash, d - close) / d;
      return { position: v3(slotPos.x + dx * k, slotPos.y + dy * k, slotPos.z + dz * k), speedFraction: 0.5, velocity: slotVel, face: face ?? target.pos };
    }
  }
  return { position: slotPos, speedFraction: 1, velocity: slotVel, face };
}

/** Reapers never idle (AP §10): with no target in range and the anchor stopped, close on the nearest enemy group at 0.6. */
export function reaperAdvanceGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, target: ShipState | undefined): MovementGoal | undefined {
  const range = mainRange(ship);
  if (target) {
    const d = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z);
    if (d <= range) return undefined;
  }
  const av = fleetMotion(fleet).anchorVel;
  if (Math.hypot(av.x, av.y, av.z) >= 0.1 * ship.maxSpeed) return undefined;
  const e = nearestEnemyCombatant(ctx, ship);
  if (!e) return undefined;
  const dx = e.pos.x - ship.pos.x;
  const dy = e.pos.y - ship.pos.y;
  const dz = e.pos.z - ship.pos.z;
  const d = Math.hypot(dx, dy, dz);
  const stop = Math.max(0, d - 0.8 * range);
  return { position: v3(ship.pos.x + (dx / d) * stop, ship.pos.y + (dy / d) * stop, ship.pos.z + (dz / d) * stop), speedFraction: REAPER_ADVANCE_FRACTION, face: e.pos };
}

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
  const D = 0.85 * torp;
  const L = Math.max(2, speed * runSeconds);
  const now = ctx.time;
  let man = ship.manoeuvre;
  if (!man) man = ship.manoeuvre = { phase: 'approach', until: now + 40 };
  const tp = target.pos;
  const lineFor = (side: number): { from: Vec3; to: Vec3 } => ({
    from: v3(tp.x - b.x * D - r.x * side * (L / 2), tp.y, tp.z - b.z * D - r.z * side * (L / 2)),
    to: v3(tp.x - b.x * D + r.x * side * (L / 2), tp.y, tp.z - b.z * D + r.z * side * (L / 2)),
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

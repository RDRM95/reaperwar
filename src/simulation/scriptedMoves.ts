import { v3, type Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import type { AiContext, MovementGoal } from './ai';
import type { ShipState } from './types';

/**
 * Scripted movement of the specials `approach` and `strafeThrough` (WORK_BREAKDOWN.md §1.3.7, T13): a movement goal
 * that overrides the AI's for a bounded time, and the completion test the simulation runs after each step. Plain
 * state keyed by the hull (no draws, no clock beyond `ctx.time`).
 */

/** A strafe-lane waypoint counts as passed within this distance (compressed km; a craft covers ≈ 0.07 km per step). */
export const STRAFE_CAPTURE_KM = 0.25;

interface ApproachMove {
  kind: 'approach';
  targetId: string;
  km: number;
  until: number;
  passThrough: boolean;
  /** Unit direction from the ship to the target when the order was given (the line a pass-through follows). */
  dir: Vec3;
  /** Within `km` of the target at some point. */
  reached: boolean;
  beatId?: string;
}

interface StrafeMove {
  kind: 'strafe';
  targetId: string;
  until: number;
  /** Index of the next waypoint (0: the lane's `from`, 1: its `to`, 2: done). */
  next: number;
  beatId?: string;
}

type ScriptedMove = ApproachMove | StrafeMove;
const MOVES = new WeakMap<ShipState, ScriptedMove>();

/** The world position of a ship-local point (metres) on a hull: forward +z, right +x, up +y (the mount convention). */
export function shipLocalToWorld(ship: ShipState, local: Vec3): Vec3 {
  const h = ship.heading;
  const flat = Math.hypot(h.x, h.z) || 1;
  const sin = h.x / flat;
  const cos = h.z / flat;
  const x = local.x / 1000;
  const y = local.y / 1000;
  const z = local.z / 1000;
  return v3(ship.pos.x + x * cos + z * sin, ship.pos.y + y, ship.pos.z - x * sin + z * cos);
}

/** The two strafe-lane waypoints of a hull in world space, or undefined when its class has no lane. */
export function strafeWaypoints(target: ShipState): [Vec3, Vec3] | undefined {
  const lane = getShipClass(target.classId).strafeLane;
  if (!lane) return undefined;
  return [shipLocalToWorld(target, lane.from), shipLocalToWorld(target, lane.to)];
}

export function startApproach(ship: ShipState, target: ShipState, km: number, until: number, passThrough: boolean, beatId?: string): void {
  const dx = target.pos.x - ship.pos.x;
  const dy = target.pos.y - ship.pos.y;
  const dz = target.pos.z - ship.pos.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  MOVES.set(ship, { kind: 'approach', targetId: target.id, km: Math.max(0.05, km), until, passThrough, dir: v3(dx / d, dy / d, dz / d), reached: false, beatId });
}

export function startStrafe(ship: ShipState, target: ShipState, until: number, beatId?: string): void {
  MOVES.set(ship, { kind: 'strafe', targetId: target.id, until, next: 0, beatId });
}

export const hasScriptedMove = (ship: ShipState): boolean => MOVES.has(ship);

/**
 * The scripted movement goal of a hull, or undefined. `approach`: straight in to half of `km` short of the target,
 * then station on that point moving with the target; with `passThrough`, straight through the target's position and
 * on along the approach line. `strafeThrough`: the lane's two waypoints in order, at full speed, with no point-defence
 * repulsion (the pass is the point).
 */
export function scriptedGoal(ctx: AiContext, ship: ShipState): MovementGoal | undefined {
  const m = MOVES.get(ship);
  if (!m) return undefined;
  const t = ctx.getShip(m.targetId);
  if (!t || !t.alive || t.escaped) return undefined;
  if (m.kind === 'approach') {
    if (m.passThrough) {
      const beyond = m.km + t.radiusKm + 1;
      return { position: v3(t.pos.x + m.dir.x * beyond, t.pos.y + m.dir.y * beyond, t.pos.z + m.dir.z * beyond), speedFraction: 1, transit: true };
    }
    const dx = ship.pos.x - t.pos.x;
    const dy = ship.pos.y - t.pos.y;
    const dz = ship.pos.z - t.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const stand = 0.5 * m.km;
    const point = v3(t.pos.x + (dx / d) * stand, t.pos.y + (dy / d) * stand, t.pos.z + (dz / d) * stand);
    return d > m.km ? { position: point, speedFraction: 1, transit: true, face: t.pos } : { position: point, speedFraction: 1, velocity: t.vel, face: t.pos };
  }
  const wp = strafeWaypoints(t);
  if (!wp || m.next > 1) return undefined;
  return { position: wp[m.next], speedFraction: 1, transit: true };
}

/** Result of a finished scripted move: the `scripted_event` detail the simulation logs. */
export interface ScriptedMoveDone {
  special: 'approach' | 'strafe_through';
  targetId: string;
  beatId?: string;
  detail: Record<string, number>;
}

/**
 * Advances a hull's scripted move after its step and reports it once it is over (completed, timed out, or its target
 * gone). `approach` completes within `km` (with `passThrough`, once past the target along the approach line after
 * coming within `km`); `strafeThrough` completes when both waypoints are passed.
 */
export function tickScriptedMove(time: number, ship: ShipState, getShip: (id: string) => ShipState | undefined): ScriptedMoveDone | undefined {
  const m = MOVES.get(ship);
  if (!m) return undefined;
  const t = getShip(m.targetId);
  const gone = !t || !t.alive || t.escaped || !ship.alive || ship.escaped;
  if (m.kind === 'approach') {
    let completed = false;
    if (t && !gone) {
      const d = Math.hypot(t.pos.x - ship.pos.x, t.pos.y - ship.pos.y, t.pos.z - ship.pos.z);
      if (d <= m.km) m.reached = true;
      if (m.passThrough) {
        const along = (ship.pos.x - t.pos.x) * m.dir.x + (ship.pos.y - t.pos.y) * m.dir.y + (ship.pos.z - t.pos.z) * m.dir.z;
        completed = m.reached && along > 0;
      } else completed = m.reached;
    }
    if (completed || gone || time >= m.until) {
      MOVES.delete(ship);
      return { special: 'approach', targetId: m.targetId, beatId: m.beatId, detail: { completed: completed ? 1 : 0 } };
    }
    return undefined;
  }
  if (t && !gone && m.next <= 1) {
    const wp = strafeWaypoints(t);
    if (wp) {
      const p = wp[m.next];
      if (Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z) <= STRAFE_CAPTURE_KM) m.next++;
    }
  }
  if (m.next > 1 || gone || time >= m.until) {
    MOVES.delete(ship);
    return { special: 'strafe_through', targetId: m.targetId, beatId: m.beatId, detail: { waypointsPassed: Math.min(2, m.next) } };
  }
  return undefined;
}

import type { Rng } from '@/core/rng';
import { add, distance, lengthSq, normalize, scale, sub, v3, type Vec3 } from '@/core/vec3';
import { FACTIONS, type FactionDoctrine } from '@/data/factions';
import type { RuleSet } from '@/timelines/rules';
import { slotToWorld } from './formations';
import { BATTLESPACE_SCALE as S } from './constants';
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
}

export interface MovementGoal {
  position: Vec3;
  /** Desired speed fraction (0..1) of max speed. */
  speedFraction: number;
  /** Optional facing target (world point). */
  face?: Vec3;
}

export const doctrineOf = (ship: ShipState): FactionDoctrine => FACTIONS[ship.faction].doctrine;

const isCombatant = (s: ShipState): boolean => s.alive && !s.escaped && s.role !== 'fighter';

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

/** Longest-range anti-capital weapon in the fleet. */
export function fleetEngagementRange(fleetShips: ShipState[]): number {
  let r = 20;
  for (const s of fleetShips) {
    if (s.role === 'fighter') continue;
    for (const w of s.weapons) if (w.def.antiCapital || !w.def.antiSmall) r = Math.max(r, w.def.range);
  }
  return r;
}

export function priorityMultiplier(priority: TargetPriority, target: ShipState): number {
  switch (priority) {
    case 'reaper_destroyers':
      return target.role === 'reaper_destroyer' ? 4 : 1;
    case 'reaper_capitals':
      return target.role === 'reaper_capital' ? 4 : 1;
    case 'capitals':
      return target.role === 'dreadnought' || target.role === 'carrier' || target.role === 'reaper_capital' ? 4 : 1;
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
  const dist = distance(shooter.pos, target.pos);
  // Threat: how dangerous the target is to us (point value is a good proxy).
  const threat = Math.log2(1 + target.pointValue) / 12;
  const wounded = 1 - target.hull / target.maxHull;
  const barriersDown = target.barriers <= 0 ? 0.25 : 0;
  let score = 0.4 + threat * d.threatPriority * 2 + wounded * d.finishWounded + barriersDown;
  // Range preference: in range is good, far beyond range is bad.
  if (dist > mainRange) score *= Math.max(0.1, 1 - (dist - mainRange) / mainRange);
  else score *= 1 + 0.2 * (1 - dist / mainRange);
  // Fighters are poor targets for capital guns.
  if (target.role === 'fighter' && shooter.role !== 'fighter') score *= 0.05;
  // Focus fire.
  if (fleet.focusTargetId === target.id) score *= 1 + d.focusFire * 2 * (fleet.orders.focusFire ? 1.5 : 1);
  // Player priority.
  score *= priorityMultiplier(fleet.orders.priority, target);
  // Stickiness.
  if (shooter.targetId === target.id) score *= 1.3;
  // Protect capitals: escorts favour enemies that are attacking our capitals.
  if (fleet.orders.protectCapitals && (shooter.role === 'frigate' || shooter.role === 'cruiser')) {
    const tgt = target.targetId ? ctx.getShip(target.targetId) : undefined;
    if (tgt && (tgt.role === 'dreadnought' || tgt.role === 'carrier') && tgt.side === shooter.side) score *= 1.8;
  }
  return score;
}

export function chooseTarget(ctx: AiContext, ship: ShipState, fleet: FleetState): string | undefined {
  if (ship.forcedTargetId) {
    const t = ctx.getShip(ship.forcedTargetId);
    if (t && t.alive && !t.escaped) return t.id;
    ship.forcedTargetId = undefined;
  }
  const enemies = ctx.enemiesOf(ship.side);
  if (enemies.length === 0) return undefined;
  const mainRange = Math.max(...ship.weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range), 8);
  let best: ShipState | undefined;
  let bestScore = -Infinity;
  const sensor = ship.sensorRange * (0.4 + 0.6 * ship.subsystems.sensors);
  for (const e of enemies) {
    if (!e.alive || e.escaped) continue;
    if (ship.role === 'fighter' && e.role === 'fighter' && !ship.weapons.some((w) => w.def.antiSmall)) continue;
    const dist = distance(ship.pos, e.pos);
    if (dist > sensor * 1.5) continue;
    const s = scoreTarget(ctx, ship, fleet, e, mainRange);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best?.id;
}

/** Fleet-level decision: choose focus target and move the anchor. */
export function fleetDecision(ctx: AiContext, fleet: FleetState, dt: number): void {
  const mine = ctx.ships.filter((s) => s.fleetId === fleet.spec.id && isCombatant(s) && !s.withdrawing);
  if (mine.length === 0) return;
  const doctrine = FACTIONS[fleet.spec.faction].doctrine;
  const enemies = ctx.enemiesOf(fleet.spec.side).filter(isCombatant);
  const enemyCentre = centroid(enemies);
  const myCentre = centroid(mine) ?? fleet.anchor;

  // Focus target: periodically re-evaluated.
  fleet.decisionTimer -= dt;
  if (fleet.decisionTimer <= 0) {
    fleet.decisionTimer = doctrine.decisionInterval * (0.8 + 0.4 * ctx.rng.next());
    const current = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
    if (!current || !current.alive || current.escaped || ctx.rng.chance(0.3)) {
      const representative = mine.reduce((a, b) => (a.pointValue >= b.pointValue ? a : b));
      let best: ShipState | undefined;
      let bestScore = -Infinity;
      const range = fleetEngagementRange(mine);
      for (const e of enemies) {
        const s = scoreTarget(ctx, representative, fleet, e, range) * (e.role === 'fighter' ? 0.01 : 1);
        if (s > bestScore) {
          bestScore = s;
          best = e;
        }
      }
      fleet.focusTargetId = best?.id;
    }
  }

  // Anchor movement.
  const range = fleetEngagementRange(mine);
  const standoff = range * doctrine.preferredRangeFactor;
  const slowest = Math.min(...mine.map((s) => s.maxSpeed * (0.3 + 0.7 * s.subsystems.engines)));
  const anchorSpeed = slowest * 0.95;
  let desired: Vec3 | undefined;
  const o = fleet.orders;
  switch (o.order) {
    case 'attack':
    case 'attack_target':
    case 'advance': {
      let focus: Vec3 | undefined = enemyCentre;
      if (o.order === 'attack_target' && o.targetId) {
        const t = ctx.getShip(o.targetId);
        if (t && t.alive) focus = t.pos;
      }
      if (focus) {
        const toEnemy = sub(focus, myCentre);
        const dist = Math.sqrt(lengthSq(toEnemy));
        const want = o.order === 'advance' ? standoff * 0.55 : standoff * (1.1 - doctrine.aggression * 0.5);
        if (dist > want) desired = add(fleet.anchor, scale(normalize(toEnemy), Math.min(dist - want, 50 * S)));
        else if (dist < want * 0.6 && doctrine.aggression < 0.8) desired = add(fleet.anchor, scale(normalize(toEnemy), -(want * 0.6 - dist)));
      }
      break;
    }
    case 'defend_position':
      desired = o.position ?? fleet.anchor;
      break;
    case 'hold_formation':
      desired = undefined;
      break;
    case 'withdraw':
    case 'retreat':
      if (enemyCentre) desired = add(fleet.anchor, scale(normalize(sub(myCentre, enemyCentre)), 60 * S));
      else desired = add(fleet.anchor, scale(fleet.heading, -60 * S));
      break;
    case 'escort': {
      const t = o.targetId ? ctx.getShip(o.targetId) : undefined;
      if (t && t.alive) desired = t.pos;
      break;
    }
    case 'intercept': {
      const t = o.targetId ? ctx.getShip(o.targetId) : undefined;
      if (t && t.alive) desired = t.pos;
      else if (enemyCentre) desired = enemyCentre;
      break;
    }
  }

  if (desired) {
    const delta = sub(desired, fleet.anchor);
    const dist = Math.sqrt(lengthSq(delta));
    if (dist > 0.05) {
      const step = Math.min(dist, anchorSpeed * dt);
      fleet.anchor = add(fleet.anchor, scale(delta, step / dist));
    }
  }
  // Keep anchor from drifting too far from the actual fleet (ships lag behind).
  const lag = sub(fleet.anchor, myCentre);
  const lagDist = Math.sqrt(lengthSq(lag));
  const maxLag = 12 * S;
  if (lagDist > maxLag) fleet.anchor = add(myCentre, scale(lag, maxLag / lagDist));

  // Fleet heading faces the enemy (or the direction of travel when withdrawing).
  let faceDir: Vec3 | undefined;
  if (enemyCentre && o.order !== 'withdraw' && o.order !== 'retreat') faceDir = sub(enemyCentre, fleet.anchor);
  else if (desired) faceDir = sub(desired, fleet.anchor);
  if (faceDir && lengthSq(faceDir) > 1e-6) {
    const target = normalize(v3(faceDir.x, 0, faceDir.z));
    const turn = 0.25 * dt; // rad/s for the formation as a whole
    const cur = fleet.heading;
    const angle = Math.atan2(cur.x * target.z - cur.z * target.x, cur.x * target.x + cur.z * target.z);
    const a = Math.sign(angle) * Math.min(Math.abs(angle), turn);
    const c = Math.cos(a);
    const s = Math.sin(a);
    fleet.heading = normalize(v3(cur.x * c - cur.z * s, 0, cur.x * s + cur.z * c));
  }
}

/** Ship-level decision: refresh target, decide on withdrawal. */
export function shipDecision(ctx: AiContext, ship: ShipState, fleet: FleetState): void {
  const d = doctrineOf(ship);
  const current = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  if (!current || !current.alive || current.escaped || ctx.rng.chance(0.35)) {
    ship.targetId = chooseTarget(ctx, ship, fleet);
  }
  // Withdrawal.
  if (!ship.withdrawing && d.withdrawThreshold > 0 && ship.role !== 'fighter') {
    const hullFrac = ship.hull / ship.maxHull;
    if (hullFrac < d.withdrawThreshold && ctx.rng.chance(0.5)) ship.withdrawing = true;
  }
}

/** Compute where the ship wants to be and where it wants to point. */
export function movementGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal {
  const target = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  const enemies = ctx.enemiesOf(ship.side).filter(isCombatant);
  const enemyCentre = centroid(enemies);

  // Fighters: strike runs.
  if (ship.role === 'fighter') {
    if (!fleet.orders.fightersDeployed && ship.carrierId) {
      const carrier = ctx.getShip(ship.carrierId);
      if (carrier && carrier.alive) return { position: carrier.pos, speedFraction: 1 };
    }
    if (target) {
      const torpRange = Math.max(...ship.weapons.map((w) => w.def.range));
      const phase = ctx.time * 0.6 + (ship.id.charCodeAt(ship.id.length - 1) % 7);
      const orbit = v3(Math.cos(phase), 0.3 * Math.sin(phase * 1.7), Math.sin(phase));
      const standoff = torpRange * 0.9;
      const pos = add(target.pos, scale(orbit, standoff));
      return { position: pos, speedFraction: 1, face: target.pos };
    }
    return { position: slotToWorld(fleet.anchor, fleet.heading, ship.slot), speedFraction: 0.8 };
  }

  // Withdrawing ships run away from the enemy.
  if (ship.withdrawing || fleet.orders.order === 'retreat') {
    const away = enemyCentre ? normalize(sub(ship.pos, enemyCentre)) : scale(fleet.heading, -1);
    return { position: add(ship.pos, scale(away, 40 * S)), speedFraction: 1 };
  }

  // Escort order at ship level.
  if (ship.escortId) {
    const e = ctx.getShip(ship.escortId);
    if (e && e.alive) {
      const off = slotToWorld(e.pos, e.heading, scale(ship.slot, 0.35));
      return { position: off, speedFraction: 1, face: target?.pos };
    }
  }

  const slotPos = slotToWorld(fleet.anchor, fleet.heading, ship.slot);
  const d = doctrineOf(ship);
  const loose = fleet.orders.formation === 'dispersed' || fleet.orders.formation === 'strike_wedge';
  // Frigates harass under loose formations and attack orders.
  if (
    ship.role === 'frigate' &&
    loose &&
    target &&
    (fleet.orders.order === 'attack' || fleet.orders.order === 'attack_target' || fleet.orders.order === 'intercept') &&
    d.cohesion < 0.95
  ) {
    const torp = ship.weapons.find((w) => w.def.kind === 'disruptor_torpedo');
    const want = (torp ? torp.def.range : 15) * 0.75;
    const toT = sub(target.pos, ship.pos);
    const dist = Math.sqrt(lengthSq(toT));
    if (dist > want) return { position: add(ship.pos, scale(normalize(toT), dist - want)), speedFraction: 1, face: target.pos };
    return { position: slotPos, speedFraction: 0.9, face: target.pos };
  }

  // Default: hold formation slot, face the target if we have forward-arc weapons in range.
  let face: Vec3 | undefined;
  if (target) {
    const fwd = ship.weapons.filter((w) => w.def.arc < 180 && !w.def.antiSmall);
    if (fwd.length > 0) {
      const maxR = Math.max(...fwd.map((w) => w.def.range));
      if (distance(ship.pos, target.pos) < maxR * 1.4) face = target.pos;
    }
  }
  return { position: slotPos, speedFraction: 1, face };
}

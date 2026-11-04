import { v3, type Vec3 } from '@/core/vec3';
import { isCapitalRole } from '@/data/types';
import type { AiContext, MovementGoal } from './ai';
import { BATTLESPACE_SCALE as S } from './constants';
import { fleetMotion, hash01, pdRange, rightOf } from './movement';
import type { FleetState, ShipState, WeaponState } from './types';

/**
 * IES stealth (brief §15.2; WORK_BREAKDOWN.md T10): who can see a silent hull, and how a stealth frigate fights.
 *
 * Detection: a silent hull is invisible beyond its `detectRange` — nobody may target it, hold a solution on it or
 * fire at it from further away, and existing locks drop at once. Firing, taking a hit, or any enemy (hull,
 * fighter, Oculus) inside `detectRange` reveals it for `revealOnFire` seconds; it goes silent again once clear.
 *
 * Hunter doctrine: stealth frigates are hunters, never line ships. They approach silent from the target's blind
 * side (behind, on the flank and below its plane), strike in one pass — torpedoes on the way in, the Thanix at
 * close range with a mature solution — break away with a hard burn beyond the enemy's point defence, run silent
 * again, vent out of range when the sink runs high, and repeat. Pattern frigates pick the most vulnerable target
 * (a damaged capital, a destroyer's flank, any hull with barriers down); the Normandy picks the most valuable one
 * it can reach. Without an explicit attack order a hunter with nothing vulnerable shadows the enemy silently; an
 * explicit attack order forces engagement; `retreat` keeps it silent. No randomness: seeded choices hash the id.
 */

/** Whether `viewer` can see `target`: anything not silent, or a silent stealth hull inside its detection range. */
export function detectable(viewer: ShipState, target: ShipState): boolean {
  const st = target.stealth;
  if (!st || st.state !== 'silent') return true;
  const dx = target.pos.x - viewer.pos.x;
  const dy = target.pos.y - viewer.pos.y;
  const dz = target.pos.z - viewer.pos.z;
  return dx * dx + dy * dy + dz * dz <= st.detectRange * st.detectRange;
}

/** A silent hull nobody can see from beyond its detection range (cheap pre-test for the per-tick lists). */
export const silentHull = (s: ShipState): boolean => s.stealth !== undefined && s.stealth.state === 'silent';

/** The AI may choose to vent once the sink is this full and no enemy is within `STEALTH_SAFE_RANGE` (brief §15.2: "vent out of range"). */
export const STEALTH_VENT_FRACTION = 0.5;
/** Beyond the longest enemy gun or beam in the catalogue (a Reaper capital's 44 km nominal). */
export const STEALTH_SAFE_RANGE = 46 * S;

const thanixOf = (ship: ShipState): WeaponState | undefined => ship.weapons.find((w) => w.def.kind === 'thanix');
const torpedoRange = (ship: ShipState): number => {
  let r = 0;
  for (const w of ship.weapons) if (w.def.kind === 'disruptor_torpedo' && w.def.range > r) r = w.def.range;
  return r;
};

/** Close strike range of the Thanix pass: well inside the gun's range, outside the target's point defence. */
export function strikeRange(ship: ShipState, target: ShipState): number {
  const th = thanixOf(ship);
  const r = th ? th.def.range : 8 * S;
  return Math.max(0.4 * r, pdRange(target) + 1.2 * S + target.radiusKm);
}

/** Start of the strike run: torpedo reach (or a little beyond the strike range) from the target. */
const runStart = (ship: ShipState, target: ShipState): number => Math.max(1.15 * torpedoRange(ship), strikeRange(ship, target) + 2.5);

/**
 * The outward side of a target: away from the centre of its own formation (the exposed flank), or a seeded side
 * when the target sits at the centre.
 */
function outwardOf(ctx: AiContext, ship: ShipState, target: ShipState): Vec3 {
  const c = ctx.enemyCentroid(ship.side);
  const h = target.heading;
  const hl = Math.hypot(h.x, h.z);
  const fl = hl > 1e-6 ? v3(h.x / hl, 0, h.z / hl) : v3(0, 0, 1);
  const r = rightOf(fl);
  if (c) {
    const ox = target.pos.x - c.x;
    const oz = target.pos.z - c.z;
    // The flank side of the target that faces away from its fleet.
    const side = ox * r.x + oz * r.z;
    if (Math.abs(side) > 0.5) return side > 0 ? r : v3(-r.x, 0, -r.z);
  }
  return hash01(ship.id, 23) < 0.5 ? r : v3(-r.x, 0, -r.z);
}

/** The blind side of a target: behind it, on its exposed flank and below its plane (inside the guns' vertical reach of the hunter's own Thanix). */
function blindSide(ctx: AiContext, ship: ShipState, target: ShipState): Vec3 {
  const h = target.heading;
  const hl = Math.hypot(h.x, h.z);
  const fl = hl > 1e-6 ? v3(h.x / hl, 0, h.z / hl) : v3(0, 0, 1);
  const out = outwardOf(ctx, ship, target);
  const x = -fl.x * 0.55 + out.x * 0.65;
  const z = -fl.z * 0.55 + out.z * 0.65;
  const y = -0.5;
  const l = Math.hypot(x, y, z);
  return v3(x / l, y / l, z / l);
}

/** The break-away jinks this far either side of its course, switching every `JINK_PERIOD` seconds. */
const JINK_RAD = (25 * Math.PI) / 180;
const JINK_PERIOD = 2.5;
/** Torpedoes go on the way in, released this far outside the Thanix strike range (about two seconds before the shot). */
const TORPEDO_LEAD_KM = 1.5;
/** The strike position keeps the target within this elevation (sine) of the hunter: inside the arc model's 0.6 vertical reach. */
const RUN_MAX_ELEVATION = 0.5;
/** The vent point lies this far beyond `STEALTH_SAFE_RANGE` from the enemy centroid. */
const VENT_MARGIN_KM = 4 * S;

/** Enemy hulls within this distance of a candidate make it a poor hunter target (it is covered by its neighbours' guns). */
const CROWD_KM = 6 * S;

/** How vulnerable a target is to a hunter: a damaged capital 3, a destroyer 2, any hull with barriers down 1, else 0. */
export function vulnerability(target: ShipState): number {
  if (isCapitalRole(target.role) && target.hull < 0.7 * target.maxHull) return 3;
  if (target.role === 'reaper_destroyer') return 2;
  if (target.barriers <= 0) return 1;
  return 0;
}

/**
 * The hunter's target: the ordered one (`attack_target` or a forced target); else the Normandy takes the most
 * valuable hull it can reach and a pattern frigate the most vulnerable; without an explicit attack order a hunter
 * that finds nothing vulnerable takes nothing (it shadows).
 */
export function hunterTarget(ctx: AiContext, ship: ShipState, fleet: FleetState): ShipState | undefined {
  const forced = ship.forcedTargetId ? ctx.getShip(ship.forcedTargetId) : undefined;
  if (forced && forced.alive && !forced.escaped) return forced;
  const o = fleet.orders;
  if (o.order === 'attack_target' && o.targetId) {
    const t = ctx.getShip(o.targetId);
    if (t && t.alive && !t.escaped) return t;
  }
  const explicit = fleetMotion(fleet).explicitAttack;
  const sensor = ship.sensorRange * (0.4 + 0.6 * ship.subsystems.sensors) * 1.5;
  let best: ShipState | undefined;
  let bestScore = -Infinity;
  const combatants = ctx.enemyCombatants(ship.side);
  for (const e of ctx.candidates(ship, sensor)) {
    if (!e.alive || e.escaped || e.role === 'fighter' || !detectable(ship, e)) continue;
    const d = Math.hypot(e.pos.x - ship.pos.x, e.pos.y - ship.pos.y, e.pos.z - ship.pos.z);
    const reach = 1 / (1 + d / (20 * S));
    const v = vulnerability(e);
    if (!explicit && v === 0) continue;
    // Hunters take the exposed flank: a hull covered by its neighbours' guns is a worse target.
    let crowd = 0;
    for (const o of combatants) if (o !== e && Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y, o.pos.z - e.pos.z) < CROWD_KM) crowd++;
    const cover = 1 / (1 + 0.6 * crowd);
    const score = (ship.flagship ? Math.log2(1 + e.pointValue) * reach * (1 + 0.15 * v) : (v + 1) * 10 + reach * Math.log2(1 + e.pointValue) * 0.1) * cover;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** The hunter's movement: approach → run → extend (break-away) → turn (re-stealth, vent) → approach. */
export function hunterGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, target: ShipState | undefined): MovementGoal {
  const now = ctx.time;
  const st = ship.stealth!;
  // Disengage keeps the hunter silent and with the fleet.
  if (fleet.orders.order === 'retreat' || !target || !target.alive) {
    ship.manoeuvre = undefined;
    return shadowGoal(ctx, ship, fleet);
  }
  let man = ship.manoeuvre;
  if (!man) man = ship.manoeuvre = { phase: 'approach', until: now + 45 };
  const tp = target.pos;
  const dist = Math.hypot(tp.x - ship.pos.x, tp.y - ship.pos.y, tp.z - ship.pos.z);
  switch (man.phase) {
    case 'approach': {
      const start = runStart(ship, target);
      const dir = blindSide(ctx, ship, target);
      const p = v3(tp.x + dir.x * start, tp.y + dir.y * start, tp.z + dir.z * start);
      man.line = { from: v3(ship.pos.x, ship.pos.y, ship.pos.z), to: p };
      const there = Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z) < 0.6;
      // A hull too hot to fire breaks off to vent first: a run it cannot finish would only park it under the guns.
      if (ship.overheated) {
        man.phase = 'turn';
        man.until = now + 60;
        return ventGoal(ctx, ship, fleet);
      }
      // Run in once at the start point (or close enough and coming from the blind side), never while venting.
      if (st.state !== 'venting' && (there || now > man.until || dist < start * 0.9)) {
        man.phase = 'run';
        man.until = now + 30;
      }
      return { position: p, speedFraction: 1, transit: true, face: tp };
    }
    case 'run': {
      const strike = strikeRange(ship, target);
      const th = thanixOf(ship);
      const fired = th !== undefined && (th.beamRemaining > 0 || (th.cooldown > th.def.cooldown * 0.7 && dist < strike + 1));
      // Overheated in the run (silent running sheds no heat, and revealed point defence piles it on): the guns cannot
      // fire, so the pass is over — break away rather than hold under the target's guns until a forced vent.
      if (fired || now > man.until || ship.overheated) {
        // Break away: a hard turn and a burn away from the target and out past its exposed flank, away from the
        // rest of its formation, out of its point defence and beyond detection.
        man.phase = 'extend';
        man.until = now + Math.max(12, st.revealOnFire + 2);
        const ax = ship.pos.x - tp.x;
        const az = ship.pos.z - tp.z;
        const al = Math.hypot(ax, az) || 1;
        const out = outwardOf(ctx, ship, target);
        const ox = (ax / al) * 0.6 + out.x * 0.8;
        const oz = (az / al) * 0.6 + out.z * 0.8;
        const ol = Math.hypot(ox, oz) || 1;
        const reach = 3 * runStart(ship, target);
        man.line = { from: v3(ship.pos.x, ship.pos.y, ship.pos.z), to: v3(ship.pos.x + (ox / ol) * reach, ship.pos.y - 0.08 * reach, ship.pos.z + (oz / ol) * reach) };
      }
      // Close to strike range and hold there for the shot — inside the Thanix's vertical reach (the arc model fires
      // only while |dy| / d < 0.6), so a hunter that ends its approach steeply below its target climbs into a firing
      // position instead of holding where its gun cannot bear (measured: the Normandy sat 24 s under a Reaper capital).
      const ux = ship.pos.x - tp.x;
      const uy = ship.pos.y - tp.y;
      const uz = ship.pos.z - tp.z;
      const flat = Math.hypot(ux, uz);
      const len = Math.hypot(flat, uy) || 1;
      let ey = uy / len;
      if (Math.abs(ey) > RUN_MAX_ELEVATION) ey = Math.sign(ey) * RUN_MAX_ELEVATION;
      const ef = Math.sqrt(1 - ey * ey);
      const hx = flat > 1e-6 ? ux / flat : 1;
      const hz = flat > 1e-6 ? uz / flat : 0;
      const r = Math.min(dist, strike);
      const p = v3(tp.x + hx * ef * r, tp.y + ey * r, tp.z + hz * ef * r);
      const gap = Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z);
      return { position: p, speedFraction: 1, transit: gap > 0.3, face: tp };
    }
    case 'extend': {
      if (now > man.until) {
        man.phase = 'turn';
        man.until = now + 60;
      }
      // Jink while revealed: the break-away swings ±25° every 2.5 s, so a gun that leads a constant-velocity hull misses.
      const to = man.line?.to ?? v3(ship.pos.x, ship.pos.y, ship.pos.z);
      const dx = to.x - ship.pos.x;
      const dz = to.z - ship.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-6) return { position: to, speedFraction: 1, transit: true };
      const swing = (Math.floor(now / JINK_PERIOD + hash01(ship.id, 41) * 2) % 2 === 0 ? 1 : -1) * JINK_RAD;
      const c = Math.cos(swing);
      const sn = Math.sin(swing);
      return { position: v3(ship.pos.x + (dx * c - dz * sn), to.y, ship.pos.z + (dx * sn + dz * c)), speedFraction: 1, transit: true };
    }
    case 'turn':
    default: {
      // Re-stealth (and vent, when safe) before the next pass; keep moving, out of the target's reach. A hull too
      // hot to fire goes out of everyone's reach to vent (brief §15.2: "vent out of range") before it hunts again.
      if (ship.overheated) {
        if (now > man.until) man.until = now + 60;
        return ventGoal(ctx, ship, fleet);
      }
      if (st.state === 'silent' || now > man.until) {
        man.phase = 'approach';
        man.until = now + 45;
      }
      return shadowGoal(ctx, ship, fleet, target);
    }
  }
}

/**
 * Out of everyone's reach to vent: on the far side of the hunter's own fleet from the enemy, `STEALTH_SAFE_RANGE` plus
 * a margin from the enemy's centroid, where the chosen vent can start (battle.ts housekeeping). A hull that gets there
 * while enemies still crowd it keeps drifting on its flank station instead of parking.
 */
function ventGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal {
  const c = ctx.enemyCentroid(ship.side);
  if (!c) return shadowGoal(ctx, ship, fleet);
  let ax = fleet.anchor.x - c.x;
  let az = fleet.anchor.z - c.z;
  let al = Math.hypot(ax, az);
  if (al < 1e-6) {
    ax = -fleet.heading.x;
    az = -fleet.heading.z;
    al = Math.hypot(ax, az) || 1;
  }
  const reach = STEALTH_SAFE_RANGE + VENT_MARGIN_KM;
  const r = rightOf(v3(ax / al, 0, az / al));
  const lateral = (hash01(ship.id, 31) < 0.5 ? 1 : -1) * 6;
  const p = v3(c.x + (ax / al) * reach + r.x * lateral, fleet.anchor.y - 1.5, c.z + (az / al) * reach + r.z * lateral);
  if (Math.hypot(p.x - ship.pos.x, p.y - ship.pos.y, p.z - ship.pos.z) < 1) return shadowGoal(ctx, ship, fleet);
  return { position: p, speedFraction: 1, transit: true };
}

/** Shadowing: hold a silent station on the fleet's flank, a little behind the anchor, drifting so the hull is never parked. */
function shadowGoal(ctx: AiContext, ship: ShipState, fleet: FleetState, target?: ShipState): MovementGoal {
  const r = rightOf(fleet.heading);
  const side = hash01(ship.id, 31) < 0.5 ? 1 : -1;
  const phase = (2 * Math.PI * ctx.time) / 50 + hash01(ship.id, 37) * 2 * Math.PI;
  const lateral = side * (6 + Math.sin(phase) * 1.5);
  const back = target ? 4 : 2;
  const p = v3(fleet.anchor.x + r.x * lateral - fleet.heading.x * back, fleet.anchor.y - 1.5, fleet.anchor.z + r.z * lateral - fleet.heading.z * back);
  return { position: p, speedFraction: 0.8, velocity: fleetMotion(fleet).anchorVel };
}

/**
 * Hunter fire control: while silent, nothing fires outside the strike run (firing reveals); in the run the
 * torpedoes go on the way in and the Thanix only at strike range against the run's target; after the pass the
 * guns stay quiet so the hull goes dark again, point defence answering only once it is revealed anyway.
 */
export function hunterHoldsFire(ship: ShipState, fleet: FleetState, w: WeaponState, target: ShipState | undefined): boolean {
  if (fleet.orders.order === 'retreat') return true;
  const st = ship.stealth!;
  const phase = ship.manoeuvre?.phase;
  if (w.def.antiSmall) return st.state === 'silent';
  if (phase !== 'run' || !target || !target.alive) return true;
  const d = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z);
  if (w.def.kind === 'thanix') return d > strikeRange(ship, target) + 0.5;
  // Torpedoes on the way in, close enough that the reveal and the Thanix strike come together.
  if (w.def.kind === 'disruptor_torpedo') return d > strikeRange(ship, target) + TORPEDO_LEAD_KM;
  return false;
}

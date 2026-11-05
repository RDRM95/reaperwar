import { v3, type Vec3 } from '@/core/vec3';
import { isCapitalRole } from '@/data/types';
import type { AiContext, MovementGoal } from './ai';
import { slotToWorld } from './formations';
import { silentHull } from './stealth';
import type { FleetState, InterposeState, ShipState } from './types';

/**
 * Reaper AI behaviours (ADOPTION_PLAN.md §10, D10; §0.3 #13; WORK_BREAKDOWN.md T12). All presets: rotate protection,
 * kill the active gun platform, cover a damaged capital, never idle (movement.ts), engage the platforms first
 * (ai.ts). `reaperDoctrine: 'apex'` only: abandon a badly damaged capital and the threatened group's tactical
 * fall-back-and-return (never an exit). Everything is evaluated on the Reaper decision interval and is deterministic
 * given the state (no draws are needed; any future draw comes from `sim.rng`). The three all-preset tactics are
 * canon-compatible inferences (SIMULATION_ESTIMATE), the two Apex behaviours AU.
 */
export const REAPER_AI = {
  /** Rotate protection: a capital whose barriers fall below this fraction swaps slots with the healthiest capital… */
  rotateBarrierFraction: 0.35,
  /** …when that capital's barriers are at least this fraction (otherwise the swap protects nothing). */
  rotateHealthyFraction: 0.6,
  /** A capital that rotated does not rotate again for this long (no slot flip-flopping). */
  rotateCooldown: 20,
  /** Kill the active gun platform: score × this for the enemy with the highest recent damage (+40 %). */
  gunPlatformBonus: 1.4,
  /** Cover a damaged capital: below this hull fraction the two nearest destroyers interpose. */
  coverHullFraction: 0.5,
  coverDestroyers: 2,
  /** Each cover order lasts this long and is renewed while the capital stays damaged. */
  coverSeconds: 15,
  /** Apex doctrine: a capital below this hull fraction is abandoned — no cover, no healthy slot. */
  abandonHullFraction: 0.2,
  /** Apex doctrine: a fleet below this fraction of its starting points with no capital above `groupCapitalHull` falls back. */
  groupWithdrawPoints: 0.3,
  groupCapitalHull: 0.5,
  /** A group that fell back does not fall back again for this long after the order. */
  groupWithdrawCooldown: 30,
  /**
   * The interposing hull holds on the protectee–attacker segment at `0.6 × protectee.lengthKm + 0.5 × ship.lengthKm`
   * from the protectee's centre (CINEMATIC_DESIGN.md §1.6), never past half the distance to the attacker.
   */
  interposeProtecteeLength: 0.6,
  interposeShipLength: 0.5,
} as const;

/** The cover states the Reaper AI set itself; a scripted `interpose` (`Specials.interpose`) is never released by the AI. */
const AI_COVERS = new WeakSet<InterposeState>();
const aiCover = (s: ShipState): boolean => s.interpose !== undefined && AI_COVERS.has(s.interpose);
const setCover = (d: ShipState, cover: InterposeState): void => {
  d.interpose = cover;
  AI_COVERS.add(cover);
};

const apexDoctrine = (ctx: AiContext): boolean => ctx.rules.special.reaperDoctrine === 'apex';

/** Apex doctrine abandons a capital this damaged: the group stops protecting it (AP §10, "abandon a damaged harvest ship"). */
export const abandoned = (ctx: AiContext, capital: ShipState): boolean => apexDoctrine(ctx) && capital.hull < REAPER_AI.abandonHullFraction * capital.maxHull;

/**
 * The active gun platform of a side's enemies (AP §10): the visible enemy combatant with the highest exponentially
 * decayed recent damage (`stats.recentDamage`, τ = 10 s). `enemies` are the enemy combatants — non-fighter hulls,
 * never a silent stealth hull — so a stealth frigate is a candidate only while it is revealed (brief §15.2);
 * `rogues` are the rogue hulls of the shooters' own side (enemies too, AP §4.1), filtered the same way. A tie keeps
 * the hull found first (the other side's combatants in ship-index order, then the rogue hulls).
 */
export function topGunPlatform(enemies: readonly ShipState[], rogues: readonly ShipState[] = []): ShipState | undefined {
  let best: ShipState | undefined;
  let top = 0;
  for (const e of enemies) {
    if (e.stats.recentDamage > top) {
      top = e.stats.recentDamage;
      best = e;
    }
  }
  for (const e of rogues) {
    if (e.role === 'fighter' || silentHull(e)) continue;
    if (e.stats.recentDamage > top) {
      top = e.stats.recentDamage;
      best = e;
    }
  }
  return best;
}

const LAST_ROTATION = new WeakMap<ShipState, number>();
/** A slot exchange in progress: each hull flies to its new slot at the common speed of the pair. */
const TRANSFER = new WeakMap<ShipState, { partner: ShipState; until: number }>();
/** A slot exchange ends once a hull is this close to its new slot, or after `TRANSFER_SECONDS`. */
const TRANSFER_DONE_KM = 0.5;
const TRANSFER_SECONDS = 60;

/**
 * Rotate protection (all presets): a capital whose barriers fall below 35 % trades formation slots with the
 * healthiest capital of its fleet, so the fresh barrier takes the exposed slot. A slot exchange, not a teleport:
 * both hulls fly to their new slots. Skipped when the damaged hull already holds the more sheltered slot, when the
 * healthiest has no barrier to offer, inside the cooldown, and (Apex doctrine) for an abandoned capital.
 */
export function rotateProtection(ctx: AiContext, ship: ShipState, fleet: FleetState): ShipState | undefined {
  if (ship.role !== 'reaper_capital' || ship.withdrawing || ship.maxBarriers <= 0) return undefined;
  if (ship.barriers >= REAPER_AI.rotateBarrierFraction * ship.maxBarriers || abandoned(ctx, ship)) return undefined;
  const now = ctx.time;
  if (now - (LAST_ROTATION.get(ship) ?? -Infinity) < REAPER_AI.rotateCooldown) return undefined;
  let partner: ShipState | undefined;
  let bestFrac: number = REAPER_AI.rotateHealthyFraction;
  for (const s of ctx.membersOf(fleet.spec.id)) {
    if (s === ship || s.role !== 'reaper_capital' || s.withdrawing || s.maxBarriers <= 0 || abandoned(ctx, s)) continue;
    if (now - (LAST_ROTATION.get(s) ?? -Infinity) < REAPER_AI.rotateCooldown) continue;
    const f = s.barriers / s.maxBarriers;
    if (f > bestFrac) {
      bestFrac = f;
      partner = s;
    }
  }
  if (!partner) return undefined;
  // The swap must move the fresh barrier forward: never trade into the more exposed slot.
  const enemy = ctx.enemyCentroid(ship.side);
  if (enemy) {
    const mine = slotToWorld(fleet.anchor, fleet.heading, ship.slot);
    const theirs = slotToWorld(fleet.anchor, fleet.heading, partner.slot);
    const dm = Math.hypot(mine.x - enemy.x, mine.y - enemy.y, mine.z - enemy.z);
    const dt = Math.hypot(theirs.x - enemy.x, theirs.y - enemy.y, theirs.z - enemy.z);
    if (dm > dt + 0.5) return undefined;
  }
  const slot = ship.slot;
  ship.slot = partner.slot;
  partner.slot = slot;
  LAST_ROTATION.set(ship, now);
  LAST_ROTATION.set(partner, now);
  TRANSFER.set(ship, { partner, until: now + TRANSFER_SECONDS });
  TRANSFER.set(partner, { partner: ship, until: now + TRANSFER_SECONDS });
  return partner;
}

/**
 * The movement of a hull in a slot exchange: to its new slot at the common speed of the pair, so the two pass each
 * other on one line at one speed and the exchange adds no rotation to the formation (the two r × v terms cancel).
 * Undefined when the hull is not exchanging, has arrived, or its partner is gone.
 */
export function transferGoal(ctx: AiContext, ship: ShipState, slotPos: Vec3, slotVel: Vec3): MovementGoal | undefined {
  const t = TRANSFER.get(ship);
  if (!t) return undefined;
  const d = Math.hypot(slotPos.x - ship.pos.x, slotPos.y - ship.pos.y, slotPos.z - ship.pos.z);
  if (ctx.time > t.until || d < TRANSFER_DONE_KM || !t.partner.alive || t.partner.escaped || ship.withdrawing) {
    TRANSFER.delete(ship);
    return undefined;
  }
  const speedOf = (s: ShipState): number => s.maxSpeed * (0.25 + 0.75 * s.subsystems.engines);
  const own = speedOf(ship);
  const common = Math.min(own, speedOf(t.partner));
  return { position: slotPos, speedFraction: own > 0 ? common / own : 1, velocity: slotVel };
}

/**
 * The enemy pressing a capital hardest: the one targeting it with the most recent damage, else the nearest combatant.
 * Candidates are the capital's targeting set (rogue hulls included, AP §4.1), hulls only, never a silent stealth hull.
 */
function attackerOf(ctx: AiContext, capital: ShipState): ShipState | undefined {
  let best: ShipState | undefined;
  let top = -1;
  let nearest: ShipState | undefined;
  let nd = Infinity;
  for (const e of ctx.enemiesOfShip(capital)) {
    if (e.role === 'fighter' || silentHull(e)) continue;
    if (e.targetId === capital.id && e.stats.recentDamage > top) {
      top = e.stats.recentDamage;
      best = e;
    }
    const d = Math.hypot(e.pos.x - capital.pos.x, e.pos.y - capital.pos.y, e.pos.z - capital.pos.z);
    if (d < nd) {
      nd = d;
      nearest = e;
    }
  }
  return best ?? nearest;
}

/**
 * Cover a damaged capital (all presets): below 50 % hull, the two nearest destroyers of the side take `interpose` on
 * it against its main attacker — the same state `Specials.interpose` sets. Covers are renewed while the capital stays
 * damaged and released when it recovers, dies or (Apex doctrine) is abandoned. The AI manages only the covers it set
 * itself: a scripted interpose stays until its own `until`. Returns the destroyers the AI has covering it.
 */
export function coverDamagedCapital(ctx: AiContext, capital: ShipState): ShipState[] {
  if (capital.role !== 'reaper_capital') return [];
  const destroyers = ctx.alliesOf(capital.side).filter((s) => s.role === 'reaper_destroyer' && s.alive && !s.escaped && !s.withdrawing);
  const covering = destroyers.filter((d) => aiCover(d) && d.interpose!.protectId === capital.id);
  if (capital.hull >= REAPER_AI.coverHullFraction * capital.maxHull || abandoned(ctx, capital)) {
    for (const d of covering) d.interpose = undefined;
    return [];
  }
  const now = ctx.time;
  // The attacker the cover holds against is kept while it lives and still targets the capital (a cover point that
  // jumps round the capital at every decision would send the destroyers circling it).
  const held = covering.find((d) => d.interpose?.againstId)?.interpose?.againstId;
  const keep = held ? ctx.getShip(held) : undefined;
  const against = keep && keep.alive && !keep.escaped && keep.targetId === capital.id ? keep : attackerOf(ctx, capital);
  const until = now + REAPER_AI.coverSeconds;
  for (const d of covering) setCover(d, { protectId: capital.id, againstId: against?.id, until });
  if (covering.length >= REAPER_AI.coverDestroyers) return covering;
  // The nearest free destroyers (no live cover or scripted interpose of their own), ties by deployment order.
  const free = destroyers
    .filter((d) => !d.interpose || d.interpose.until < now || !ctx.getShip(d.interpose.protectId)?.alive)
    .map((d, i) => ({ d, i, r: Math.hypot(d.pos.x - capital.pos.x, d.pos.y - capital.pos.y, d.pos.z - capital.pos.z) }))
    .sort((a, b) => a.r - b.r || a.i - b.i);
  for (const { d } of free) {
    if (covering.length >= REAPER_AI.coverDestroyers) break;
    setCover(d, { protectId: capital.id, againstId: against?.id, until });
    covering.push(d);
  }
  return covering;
}

/**
 * The interposing hull's movement (AP §10 cover, `Specials.interpose`; CINEMATIC_DESIGN.md §1.6): on the
 * protectee–attacker segment at `0.6 × protectee.lengthKm + 0.5 × ship.lengthKm` from the protectee (never past half
 * the distance), moving with it and facing the attacker (the enemy centroid when none is named); it fires as it
 * pleases. Undefined once the order has lapsed or the protectee is gone.
 */
export function interposeGoal(ctx: AiContext, ship: ShipState): MovementGoal | undefined {
  const ip = ship.interpose;
  if (!ip) return undefined;
  const p = ctx.getShip(ip.protectId);
  if (!p || !p.alive || p.escaped || ctx.time > ip.until) {
    ship.interpose = undefined;
    return undefined;
  }
  let a = ip.againstId ? ctx.getShip(ip.againstId) : undefined;
  if (a && (!a.alive || a.escaped)) a = undefined;
  const toward = a?.pos ?? ctx.enemyCentroid(ship.side);
  if (!toward) return { position: p.pos, speedFraction: 1, velocity: p.vel };
  const dx = toward.x - p.pos.x;
  const dy = toward.y - p.pos.y;
  const dz = toward.z - p.pos.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { position: p.pos, speedFraction: 1, velocity: p.vel };
  const gap = Math.min(0.5 * len, REAPER_AI.interposeProtecteeLength * p.lengthKm + REAPER_AI.interposeShipLength * ship.lengthKm);
  return { position: v3(p.pos.x + (dx / len) * gap, p.pos.y + (dy / len) * gap, p.pos.z + (dz / len) * gap), speedFraction: 1, velocity: p.vel, face: toward };
}

const GROUP_CHECK = new WeakMap<FleetState, { next: number; lastWithdrawal: number }>();

/**
 * Apex doctrine only (AP §10, "withdraw a threatened group"): on the Reaper decision interval, a Reaper fleet whose
 * remaining points fell below 30 % of its start with no capital above 50 % hull falls back — the caller sends every
 * hull to its recovery station (`beginWithdrawal`), where it regenerates and returns (the shared re-engagement rule).
 * Never an exit: nothing escapes. Returns the hulls to send back now (empty otherwise).
 */
export function threatenedGroup(ctx: AiContext, fleet: FleetState, interval: number): ShipState[] {
  if (fleet.spec.faction !== 'reaper' || fleet.static || !apexDoctrine(ctx)) return [];
  let g = GROUP_CHECK.get(fleet);
  if (!g) GROUP_CHECK.set(fleet, (g = { next: ctx.time, lastWithdrawal: -Infinity }));
  if (ctx.time < g.next) return [];
  g.next = ctx.time + interval;
  if (ctx.time - g.lastWithdrawal < REAPER_AI.groupWithdrawCooldown) return [];
  const hulls = ctx.membersOf(fleet.spec.id).filter((s) => s.role !== 'fighter');
  if (hulls.length === 0 || fleet.startPoints <= 0) return [];
  const points = hulls.reduce((n, s) => n + s.pointValue, 0);
  if (points >= REAPER_AI.groupWithdrawPoints * fleet.startPoints) return [];
  if (hulls.some((s) => isCapitalRole(s.role) && s.hull > REAPER_AI.groupCapitalHull * s.maxHull)) return [];
  const send = hulls.filter((s) => !s.withdrawing);
  if (send.length > 0) g.lastWithdrawal = ctx.time;
  return send;
}

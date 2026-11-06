import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { CUSTOM_DEFAULT_DISTANCE, buildCustomBattle, buildScenario } from '@/scenarios';
import { fleetEngagementRange } from '@/simulation/ai';
import { BattleSimulation } from '@/simulation/battle';
import { ROW_DENSE_HULLS, frontageOf, isGroupCapital, layoutFormation, minSeparationKm, type SlotShip } from '@/simulation/formations';
import { CONTACT_RANGE_FACTOR, shipMotion, stationOf } from '@/simulation/movement';
import { silentHull } from '@/simulation/stealth';
import { FORMATION_LABELS, type BattleConfig, type FormationType, type ShipState } from '@/simulation/types';
import { yieldToLoop } from './support/async';
import { DIGEST_PIN } from './support/digests';

/**
 * Battlegroup formations and the no-idle rule (brief §22, the owner's top priority; §21.4; PACING_PLAN.md §3).
 * (a) no rows, (b) groups, (c) separation at deployment and (c2) never a crowd during the battle, (d) no idling at the
 * back, (e) determinism, across runs and across JavaScript engines. Every run is deterministic.
 */

const ship = (id: string, classId: string): SlotShip => {
  const c = getShipClass(classId);
  return { id, role: c.role, lengthKm: c.lengthM.value / 1000 };
};
const fleetOf = (counts: Record<string, number>): SlotShip[] => Object.entries(counts).flatMap(([cls, n]) => Array.from({ length: n }, (_, i) => ship(`${cls}-${i + 1}`, cls)));
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Fleets of 12–64 hulls with their engagement ranges (simulation km): the scenario orders of battle and a cruiser fleet. */
const FLEETS: { name: string; ships: SlotShip[]; range: number }[] = [
  { name: 'Battle of Earth Fifth Fleet', ships: fleetOf({ alliance_dreadnought: 6, alliance_carrier: 1, alliance_cruiser: 14, alliance_frigate: 24, normandy_sr2: 1 }), range: 16.8 },
  { name: 'reference task force', ships: fleetOf({ alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, normandy_sr2: 1 }), range: 16.8 },
  { name: 'Hierarchy line', ships: fleetOf({ turian_dreadnought: 5, turian_cruiser: 10, turian_frigate: 16 }), range: 16.8 },
  { name: 'Reaper blockade', ships: fleetOf({ harbinger: 1, reaper_capital: 6, reaper_destroyer: 14 }), range: 17.6 },
  { name: 'Reaper harvest force', ships: fleetOf({ reaper_capital: 10, reaper_destroyer: 30 }), range: 17.6 },
  { name: 'Cerberus strike fleet', ships: fleetOf({ cerberus_cruiser: 10, cerberus_frigate: 16 }), range: 14 },
];
const FORMATIONS = Object.keys(FORMATION_LABELS) as FormationType[];
const SEED = 42;

/**
 * Hulls lying within `tol` of one straight line in the formation plane (a horizontal line, at any height): for every
 * pair, the line through the two at their mean height, and the hulls within `tol` of it (3D distance). The largest count.
 */
function longestRow(points: Vec3[], tol: number): number {
  let most = 0;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const ux = points[b].x - points[a].x;
      const uz = points[b].z - points[a].z;
      const ul = Math.hypot(ux, uz);
      if (ul < 1e-9) continue;
      const y0 = (points[a].y + points[b].y) / 2;
      let n = 0;
      for (const p of points) {
        const w = ((p.x - points[a].x) * uz - (p.z - points[a].z) * ux) / ul;
        if (w * w + (p.y - y0) ** 2 <= tol * tol) n++;
      }
      most = Math.max(most, n);
    }
  }
  return most;
}

/** Coefficient of variation (standard deviation over mean). */
function cv(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
  return sd / m;
}

describe('(a) no rows: battlegroups in depth and height, every hull varied', () => {
  it.each(FORMATIONS)('%s: in every fleet of 12–64 hulls no 4 hulls within 2 % of the frontage of one line; offsets vary (CV ≥ 0.15)', (formation) => {
    for (const f of FLEETS) {
      expect(f.ships.length).toBeGreaterThanOrEqual(12);
      expect(f.ships.length).toBeLessThanOrEqual(ROW_DENSE_HULLS);
      const layout = layoutFormation(f.ships, formation, { seed: SEED, range: f.range });
      const hulls = f.ships.filter((s) => s.role !== 'fighter');
      const points = hulls.map((s) => layout.slots.get(s.id)!);
      const tol = 0.02 * frontageOf(points);
      expect(longestRow(points, tol), `${f.name}, ${formation}`).toBeLessThan(4);
      // Each hull's lateral, vertical and depth offset from its group's capital varies from hull to hull.
      const off: { x: number[]; y: number[]; z: number[] } = { x: [], y: [], z: [] };
      for (const s of hulls) {
        const lead = layout.leaders.get(s.id);
        if (!lead) continue;
        const p = layout.slots.get(s.id)!;
        const q = layout.slots.get(lead)!;
        off.x.push(Math.abs(p.x - q.x));
        off.y.push(Math.abs(p.y - q.y));
        off.z.push(Math.abs(p.z - q.z));
      }
      expect(off.x.length, f.name).toBeGreaterThan(5);
      for (const axis of ['x', 'y', 'z'] as const) expect(cv(off[axis]), `${f.name}, ${formation}: ${axis} offsets`).toBeGreaterThanOrEqual(0.15);
    }
  });
});

/** Every non-capital hull's nearest group capital is its own group's (paired capitals: either of the pair). */
function strayEscorts(ships: { id: string; role: SlotShip['role'] }[], pos: (id: string) => Vec3, groupOf: (id: string) => number | string | undefined): string[] {
  const caps = ships.filter((s) => isGroupCapital(s.role));
  if (caps.length < 2) return [];
  const out: string[] = [];
  for (const s of ships) {
    if (isGroupCapital(s.role) || s.role === 'fighter') continue;
    let best = caps[0];
    let bd = Infinity;
    for (const c of caps) {
      const d = dist(pos(s.id), pos(c.id));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (groupOf(best.id) !== groupOf(s.id)) out.push(s.id);
  }
  return out;
}

describe('(b) groups: each capital with its own escorts round it', () => {
  it.each(FORMATIONS)('%s: one group per capital (the cruisers lead a fleet without one); every escort’s nearest capital is its own group’s', (formation) => {
    for (const f of FLEETS) {
      const layout = layoutFormation(f.ships, formation, { seed: SEED, range: f.range });
      const groups = new Set(layout.groups.values());
      const leaders = f.ships.filter((s) => !layout.leaders.has(s.id));
      expect(groups.size, f.name).toBe(leaders.length);
      const capitals = f.ships.filter((s) => isGroupCapital(s.role)).length;
      if (capitals > 0) expect(leaders.every((s) => isGroupCapital(s.role)) && leaders.length === capitals, `${f.name}: the capitals lead`).toBe(true);
      else expect(leaders.every((s) => s.role === 'cruiser'), `${f.name}: the cruisers lead`).toBe(true);
      expect(strayEscorts(f.ships, (id) => layout.slots.get(id)!, (id) => layout.groups.get(id)), `${f.name}, ${formation}`).toEqual([]);
    }
  });

  it('the Battle of Earth and the Final Battle deploy every fleet as battlegroups: escorts keep station on their capital', () => {
    for (const id of ['battle_of_earth', 'final_battle_of_earth']) {
      const sim = new BattleSimulation(buildScenario(id, 'canon_me3', SEED));
      for (const fleet of sim.fleets.values()) {
        const members = sim.ships.filter((s) => s.fleetId === fleet.spec.id);
        // The group a hull belongs to is the capital it keeps station on (a leader is its own).
        const groupOf = (sid: string): string => sim.getShip(sid)!.groupLeaderId ?? sid;
        expect(strayEscorts(members, (sid) => sim.getShip(sid)!.pos, groupOf), `${id}: ${fleet.spec.id}`).toEqual([]);
        for (const s of members) if (s.groupLeaderId) expect(isGroupCapital(sim.getShip(s.groupLeaderId)!.role) || members.every((o) => !isGroupCapital(o.role)), s.id).toBe(true);
      }
    }
  });
});

describe('(c) separation scaled to hull size', () => {
  it.each(FORMATIONS)('%s: no two hulls closer than their minimum separation at deployment (capitals 3 lengths apart)', (formation) => {
    for (const f of FLEETS) {
      const mixed = [...f.ships, ...fleetOf({ alliance_fighter: 6 })];
      const slots = layoutFormation(mixed, formation, { seed: SEED, range: f.range }).slots;
      for (let i = 0; i < mixed.length; i++) {
        for (let j = i + 1; j < mixed.length; j++) {
          const need = minSeparationKm(mixed[i], mixed[j]);
          expect(dist(slots.get(mixed[i].id)!, slots.get(mixed[j].id)!), `${f.name}, ${formation}: ${mixed[i].id} – ${mixed[j].id}`).toBeGreaterThanOrEqual(need - 1e-6);
        }
      }
    }
  });

  // The clearance backstop (movement.ts enforceClearance) holds every pair it does not exempt at half the minimum
  // separation, so this guards the backstop and the hulls it exempts (drive runs, arrivals, scripted moves); the crowd
  // during the battle — pairs pressed under 0.75 × their separation, knots, groups mixing — is measured by (c2) below.
  it('canon Battle of Earth, seed 42: no non-craft pair closer than half its minimum separation for more than 2 s', async () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', SEED));
    const since = new Map<string, number>();
    let worst = 0;
    let worstPair = '';
    while (!sim.finished) {
      sim.step();
      if (sim.tick % 400 === 0) await yieldToLoop();
      const live = sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter' && !sim.isPending(s));
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const key = `${a.id}|${b.id}`;
          if (dist(a.pos, b.pos) < 0.5 * minSeparationKm(a, b) - 1e-6) {
            const t0 = since.get(key) ?? sim.time;
            since.set(key, t0);
            if (sim.time - t0 > worst) {
              worst = sim.time - t0;
              worstPair = key;
            }
          } else since.delete(key);
        }
      }
    }
    expect(worst, worstPair).toBeLessThanOrEqual(2);
  }, 120_000);
});

/** Same-side hulls within this of one hull make a knot (brief §22: "never a crowd"). */
const KNOT_KM = 1.5;

interface CrowdMeasures {
  /** The largest number of same-side non-craft hulls within `KNOT_KM` of one hull (that hull included). */
  knot: { n: number; t: number; hull: string };
  /** The longest time any same-side non-craft pair stayed under 0.75 × its minimum separation. */
  pairSpell: { seconds: number; pair: string; at: number };
  /** Same-side pair-seconds under 0.75 × the minimum separation, per hull deployed. */
  pairSecondsPerHull: number;
  /** The largest share of a fleet's station-keeping escorts nearer another group capital than their own (every 30 s from 60 s). */
  stray: { share: number; fleet: string; t: number };
  /** The lowest group silhouette of a fleet, every 30 s from 60 s (1: tight separate groups; below 0: mixed into others). */
  silhouette: { value: number; fleet: string; t: number };
}

/**
 * Crowd measures over a whole battle, sampled every half second (brief §22: "never a crowd", "capitals several
 * lengths apart", "groups a camera can tell apart"). Craft and hulls still waiting to arrive are left out; the stray
 * share counts, in each fleet with at least two group capitals, the escorts keeping station on a capital in the line
 * (not hunting, not withdrawing; their capital neither withdrawing nor crossing to a new slot) whose nearest group
 * capital is another one.
 */
async function crowdMeasures(config: BattleConfig): Promise<CrowdMeasures> {
  const sim = new BattleSimulation(config);
  const out: CrowdMeasures = { knot: { n: 0, t: 0, hull: '' }, pairSpell: { seconds: 0, pair: '', at: 0 }, pairSecondsPerHull: 0, stray: { share: 0, fleet: '', t: 0 }, silhouette: { value: 1, fleet: '', t: 0 } };
  const since = new Map<string, number>();
  let pairSeconds = 0;
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 400 === 0) await yieldToLoop();
    if (sim.tick % 10 !== 0) continue;
    const live = sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter' && !sim.isPending(s));
    const near = new Map<string, number>();
    const seen = new Set<string>();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (a.side !== b.side) continue;
        const d = dist(a.pos, b.pos);
        if (d <= KNOT_KM) {
          near.set(a.id, (near.get(a.id) ?? 1) + 1);
          near.set(b.id, (near.get(b.id) ?? 1) + 1);
        }
        if (d < 0.75 * minSeparationKm(a, b)) {
          const key = `${a.id}|${b.id}`;
          seen.add(key);
          pairSeconds += 0.5;
          const t0 = since.get(key) ?? sim.time;
          since.set(key, t0);
          if (sim.time - t0 > out.pairSpell.seconds) out.pairSpell = { seconds: sim.time - t0, pair: key, at: t0 };
        }
      }
    }
    for (const k of [...since.keys()]) if (!seen.has(k)) since.delete(k);
    for (const [id, n] of near) if (n > out.knot.n) out.knot = { n, t: sim.time, hull: id };
    const t = Math.round(sim.time);
    // The groups, every 30 s from 60 s (the battle is joined by then) to the end.
    if (t >= 60 && t % 30 === 0 && Math.abs(sim.time - t) < 0.01) {
      for (const f of sim.fleets.values()) {
        const members = live.filter((s) => s.fleetId === f.spec.id && !s.stealth && !s.withdrawing);
        const caps = members.filter((s) => isGroupCapital(s.role) && !s.groupLeaderId);
        if (caps.length < 2) continue;
        // The group structure: escorts keeping station round their capital (within the 2 km slot leash of their
        // station). A screen leaning in to its own weapon range or a hull moving up runs ahead of its capital by design
        // (the knots and pair spells above hold those to "never a crowd"); escorts whose capital is out of the line
        // (withdrawing to recover) or crossing to a new slot in a Reaper slot exchange hold their slots on the formation
        // meanwhile (movement.ts `stationOf`), between leaders by design.
        const leading = new Set(caps.filter((c) => !shipMotion(c).transferring).map((c) => c.id));
        const escorts = members.filter((s) => s.groupLeaderId !== undefined && leading.has(s.groupLeaderId) && dist(stationOf(sim, s, f).pos, s.pos) <= 2);
        if (escorts.length >= 4) {
          let stray = 0;
          for (const e of escorts) {
            let best = caps[0];
            for (const c of caps) if (dist(e.pos, c.pos) < dist(e.pos, best.pos)) best = c;
            if (best.id !== e.groupLeaderId) stray++;
          }
          const share = stray / escorts.length;
          if (share > out.stray.share) out.stray = { share, fleet: f.spec.id, t };
        }
        // Silhouette of the groups (every member: a group is a capital and the hulls keeping station on it).
        const groupOf = (s: ShipState): string => s.groupLeaderId ?? s.id;
        const groups = new Map<string, ShipState[]>();
        for (const s of members) groups.set(groupOf(s), [...(groups.get(groupOf(s)) ?? []), s]);
        if (groups.size < 2) continue;
        let total = 0;
        let n = 0;
        for (const s of members) {
          const own = groups.get(groupOf(s))!;
          if (own.length < 2) continue;
          const a = own.reduce((acc, o) => acc + (o === s ? 0 : dist(s.pos, o.pos)), 0) / (own.length - 1);
          let b = Infinity;
          for (const [k, list] of groups) if (k !== groupOf(s)) b = Math.min(b, list.reduce((acc, o) => acc + dist(s.pos, o.pos), 0) / list.length);
          total += (b - a) / Math.max(a, b);
          n++;
        }
        if (n > 0 && total / n < out.silhouette.value) out.silhouette = { value: total / n, fleet: f.spec.id, t };
      }
    }
  }
  out.pairSecondsPerHull = pairSeconds / sim.ships.filter((s) => s.role !== 'fighter').length;
  return out;
}

/**
 * In-battle bounds (brief §22) on the canon Battle of Earth and the canon Final Battle of Earth (seed 42). Measured
 * there: knots of 6 and 12 hulls (38 in the Final Battle before hulls moving up took lanes), longest pressed pair
 * 13.5 s and 9.5 s (130.5 s and 121.5 s before), 1.2 and 3.1 pair-seconds per hull (26 and 38), stray share at most
 * 0.07 and 0.25, silhouette at least −0.07 (two Reaper capitals crossing in a slot exchange) and −0.12 (−0.54 before).
 */
const CROWD_BOUNDS = { knot: 15, pairSpellSeconds: 20, pairSecondsPerHull: 8, strayShare: 0.3, silhouette: -0.2 } as const;

describe('(c2) never a crowd during the battle', () => {
  it.each(['battle_of_earth', 'final_battle_of_earth'])('canon %s, seed 42: no knot of more than 15 hulls, no pair pressed under 0.75 × its separation for over 20 s, groups intact every 30 s from 60 s', async (id) => {
    const m = await crowdMeasures(buildScenario(id, 'canon_me3', SEED));
    expect(m.knot.n, `${m.knot.hull} at ${m.knot.t.toFixed(0)} s`).toBeLessThanOrEqual(CROWD_BOUNDS.knot);
    expect(m.pairSpell.seconds, `${m.pairSpell.pair} from ${m.pairSpell.at.toFixed(0)} s`).toBeLessThanOrEqual(CROWD_BOUNDS.pairSpellSeconds);
    expect(m.pairSecondsPerHull).toBeLessThanOrEqual(CROWD_BOUNDS.pairSecondsPerHull);
    expect(m.stray.share, `${m.stray.fleet} at ${m.stray.t} s`).toBeLessThanOrEqual(CROWD_BOUNDS.strayShare);
    expect(m.silhouette.value, `${m.silhouette.fleet} at ${m.silhouette.t} s`).toBeGreaterThanOrEqual(CROWD_BOUNDS.silhouette);
  }, 180_000);
});

/**
 * The no-idle measures (brief §22 "no ship idles at the back", §21.4; PACING_PLAN.md §3.2, §3.3, §3.8). From its
 * fleet's first contact — the heading lock, the enemy within 1.1 × the fleet's range (PACING_PLAN.md §3.2) — a
 * non-craft hull of a fleet under an attack-type order (not Hold, not Defend) with no enemy hull within its longest
 * weapon range is out of reach. Exempt by design (PACING_PLAN.md §3.6): a carrier (it keeps out of the enemy's main
 * range just beyond its own broadsides and fights through its craft, brief §21.4 "carriers launch"), a hull in tactical
 * withdrawal (brief §21.3, §8.6: it falls back to recover and returns) and a stealth hunter shadowing between strike
 * passes (brief §15.2); their spell starts again when they rejoin the line.
 * - `out`: the longest such spell (the original measure, held to 25 s on the Battle of Earth and the custom battle).
 * - For a battle in waves (the Final Battle: the reserve drops in well out of range at 144 s — PACING_PLAN.md Q4's
 *   arrival cap is CORE's pacing task), the spell counts only while the hull's fleet is in contact (an enemy combatant
 *   within 1.1 × the fleet's range of any of its hulls, the rule's own gate): out of contact the fleet is between
 *   waves, closing on the next one as a fleet (§21.4: "a fleet out of every weapon's range ... advances"), and that lull
 *   resets the count (`inContactOut`). Within it a hull is idle while it also moves at under a quarter of its top speed
 *   (`idle`): a slow capital crossing 20 km at full speed to back up its line is moving up, not idling.
 */
interface Spell {
  seconds: number;
  hull: string;
  at: number;
}

async function longestIdle(config: BattleConfig): Promise<{ out: Spell; inContactOut: Spell; idle: Spell; end: number }> {
  const sim = new BattleSimulation(config);
  const reach = new Map<string, number>();
  const contact = new Set<string>();
  const outSince = new Map<string, number>();
  const inContactSince = new Map<string, number>();
  const idleSince = new Map<string, number>();
  const none = (): Spell => ({ seconds: 0, hull: '', at: 0 });
  const res = { out: none(), inContactOut: none(), idle: none(), end: 0 };
  const track = (since: Map<string, number>, key: 'out' | 'inContactOut' | 'idle', s: ShipState, on: boolean): void => {
    if (!on) {
      since.delete(s.id);
      return;
    }
    const t0 = since.get(s.id) ?? sim.time;
    since.set(s.id, t0);
    if (sim.time - t0 > res[key].seconds) res[key] = { seconds: sim.time - t0, hull: s.id, at: t0 };
  };
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 400 === 0) await yieldToLoop();
    for (const f of sim.fleets.values()) if (f.headingLocked) contact.add(f.spec.id);
    const live = sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter' && !sim.isPending(s));
    const inContact = new Map<string, boolean>();
    for (const f of sim.fleets.values()) {
      const members = live.filter((s) => s.fleetId === f.spec.id && !s.stealth);
      const r2 = (CONTACT_RANGE_FACTOR * fleetEngagementRange(members)) ** 2;
      inContact.set(f.spec.id, members.some((s) => live.some((e) => e.side !== s.side && !silentHull(e) && (e.pos.x - s.pos.x) ** 2 + (e.pos.y - s.pos.y) ** 2 + (e.pos.z - s.pos.z) ** 2 <= r2)));
    }
    for (const s of live) {
      if (!reach.has(s.id)) reach.set(s.id, Math.max(...s.weapons.map((w) => w.def.range)));
      const f = sim.fleets.get(s.fleetId)!;
      const order = f.orders.order;
      const r = reach.get(s.id)!;
      const counts = contact.has(f.spec.id) && order !== 'hold_formation' && order !== 'defend_position' && !f.static && !s.withdrawing && !s.stealth && s.role !== 'carrier';
      const out = counts && !live.some((e) => e.side !== s.side && dist(e.pos, s.pos) <= r);
      const touching = out && inContact.get(f.spec.id) === true;
      track(outSince, 'out', s, out);
      track(inContactSince, 'inContactOut', s, touching);
      track(idleSince, 'idle', s, touching && Math.hypot(s.vel.x, s.vel.y, s.vel.z) < 0.25 * s.maxSpeed);
    }
  }
  res.end = sim.time;
  return res;
}

const at = (w: Spell, end: number): string => `${w.hull} from ${w.at.toFixed(1)} s (battle ends ${end.toFixed(0)} s)`;

describe('(d) no ship idles at the back', () => {
  it('canon Battle of Earth, seed 42: after contact no hull of an attacking fleet spends more than 25 s out of every weapon’s reach', async () => {
    const w = await longestIdle(buildScenario('battle_of_earth', 'canon_me3', SEED));
    expect(w.out.seconds, at(w.out, w.end)).toBeLessThanOrEqual(25);
  }, 120_000);

  it('canon Final Battle of Earth, seed 42: in contact, no hull idles out of reach for more than 25 s, or stays out of reach for more than 90 s', async () => {
    const w = await longestIdle(buildScenario('final_battle_of_earth', 'canon_me3', SEED));
    expect(w.idle.seconds, `idle: ${at(w.idle, w.end)}`).toBeLessThanOrEqual(25);
    expect(w.inContactOut.seconds, `out of reach: ${at(w.inContactOut, w.end)}`).toBeLessThanOrEqual(90);
  }, 240_000);

  it('a 120-vs-40 custom battle, seed 42: the same, for every hull of both sides', async () => {
    const config = buildCustomBattle({
      seed: SEED,
      rulesId: 'canon_me3',
      environment: 'deep_space',
      startingDistanceKm: CUSTOM_DEFAULT_DISTANCE,
      sideA: { faction: 'alliance', name: 'Coalition', formation: 'line_abreast', counts: { alliance_dreadnought: 16, alliance_carrier: 2, alliance_cruiser: 34, alliance_frigate: 66, alliance_frigate_thanix: 2 } },
      sideB: { faction: 'reaper', name: 'Harvest force', formation: 'strike_wedge', counts: { reaper_capital: 10, reaper_destroyer: 30 } },
    });
    expect(config.fleets[0].ships.reduce((a, s) => a + s.count, 0)).toBe(120);
    expect(config.fleets[1].ships.reduce((a, s) => a + s.count, 0)).toBe(40);
    const w = await longestIdle(config);
    expect(w.out.seconds, at(w.out, w.end)).toBeLessThanOrEqual(25);
  }, 240_000);
});

describe('(e) determinism', () => {
  it.each(FORMATIONS)('%s: the same ships, formation and seed give the same layout; another seed varies it', (formation) => {
    const f = FLEETS[0];
    const a = layoutFormation(f.ships, formation, { seed: SEED, range: f.range });
    const b = layoutFormation(f.ships, formation, { seed: SEED, range: f.range });
    for (const s of f.ships) {
      expect(b.slots.get(s.id)).toEqual(a.slots.get(s.id));
      expect(b.leaders.get(s.id)).toBe(a.leaders.get(s.id));
      expect(b.yaw.get(s.id)).toBe(a.yaw.get(s.id));
    }
    const c = layoutFormation(f.ships, formation, { seed: SEED + 1, range: f.range });
    expect(f.ships.some((s) => dist(c.slots.get(s.id)!, a.slots.get(s.id)!) > 1e-3)).toBe(true);
  });

  it('canon Battle of Earth, seed 42: two runs give identical events and positions', async () => {
    const run = async (): Promise<BattleSimulation> => {
      const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', SEED));
      for (let i = 0; i < 3600; i++) {
        sim.step();
        if (i % 400 === 0) await yieldToLoop();
      }
      return sim;
    };
    const x = await run();
    const y = await run();
    expect(y.events.length).toBe(x.events.length);
    expect(JSON.stringify(y.events)).toBe(JSON.stringify(x.events));
    expect(y.ships.map((s: ShipState) => [s.id, s.hull, s.pos])).toEqual(x.ships.map((s: ShipState) => [s.id, s.hull, s.pos]));
  }, 120_000);

  // The pin e2e/game.spec.ts recomputes in the browser: no engine-dependent arithmetic in the simulation (the lint test
  // keeps Math.sin, Math.cos, Math.pow and ** out), so Node and the browser play the same battle bit for bit.
  it('canon Battle of Earth, seed 42: the position digest at tick 600 is the pinned one (the e2e recomputes it in the browser)', () => {
    const sim = new BattleSimulation(buildScenario(DIGEST_PIN.scenario, DIGEST_PIN.rules, DIGEST_PIN.seed));
    while (sim.tick < DIGEST_PIN.tick) sim.step();
    expect(sim.positionDigest()).toBe(DIGEST_PIN.digest);
  });
});

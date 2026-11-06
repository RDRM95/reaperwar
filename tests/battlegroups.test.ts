import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { CUSTOM_DEFAULT_DISTANCE, buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { ROW_DENSE_HULLS, frontageOf, isGroupCapital, layoutFormation, minSeparationKm, type SlotShip } from '@/simulation/formations';
import { FORMATION_LABELS, type BattleConfig, type FormationType, type ShipState } from '@/simulation/types';
import { yieldToLoop } from './support/async';

/**
 * Battlegroup formations and the no-idle rule (brief §22, the owner's top priority; §21.4; PACING_PLAN.md §3).
 * (a) no rows, (b) groups, (c) separation, (d) no idling at the back, (e) determinism. Every run is deterministic.
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

/**
 * The no-idle measure (brief §22 "no ship idles at the back", §21.4; PACING_PLAN.md §3.2, §3.3): from its fleet's
 * contact — the heading lock, the enemy within 1.1 × the fleet's range (PACING_PLAN.md §3.2) — every non-craft hull of a
 * fleet under an attack-type order (not Hold, not Defend) has an enemy hull within its longest weapon range again
 * within 25 s whenever it has none. Exempt by design (PACING_PLAN.md §3.6): a hull in tactical withdrawal (brief §21.3,
 * §8.6: it falls back to recover and returns) and a stealth hunter shadowing between strike passes (brief §15.2); their
 * spell starts again when they rejoin the line.
 */
async function longestIdle(config: BattleConfig): Promise<{ seconds: number; hull: string; at: number; end: number }> {
  const sim = new BattleSimulation(config);
  const reach = new Map<string, number>();
  for (const s of sim.ships) reach.set(s.id, Math.max(...s.weapons.map((w) => w.def.range)));
  const contact = new Map<string, number>();
  const out = new Map<string, number>();
  let worst = { seconds: 0, hull: '', at: 0, end: 0 };
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 400 === 0) await yieldToLoop();
    for (const f of sim.fleets.values()) if (f.headingLocked && !contact.has(f.spec.id)) contact.set(f.spec.id, sim.time);
    const live = sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter' && !sim.isPending(s));
    for (const s of live) {
      if (!reach.has(s.id)) reach.set(s.id, Math.max(...s.weapons.map((w) => w.def.range)));
      const f = sim.fleets.get(s.fleetId)!;
      const order = f.orders.order;
      if (!contact.has(f.spec.id) || order === 'hold_formation' || order === 'defend_position' || f.static || s.withdrawing || s.stealth) {
        out.delete(s.id);
        continue;
      }
      const r = reach.get(s.id)!;
      if (live.some((e) => e.side !== s.side && dist(e.pos, s.pos) <= r)) {
        out.delete(s.id);
        continue;
      }
      const t0 = out.get(s.id) ?? sim.time;
      out.set(s.id, t0);
      if (sim.time - t0 > worst.seconds) worst = { seconds: sim.time - t0, hull: s.id, at: t0, end: 0 };
    }
  }
  worst.end = sim.time;
  return worst;
}

describe('(d) no ship idles at the back', () => {
  it('canon Battle of Earth, seed 42: after contact no hull of an attacking fleet spends more than 25 s out of every weapon’s reach', async () => {
    const w = await longestIdle(buildScenario('battle_of_earth', 'canon_me3', SEED));
    expect(w.seconds, `${w.hull} from ${w.at.toFixed(1)} s (battle ends ${w.end.toFixed(0)} s)`).toBeLessThanOrEqual(25);
  }, 120_000);

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
    expect(w.seconds, `${w.hull} from ${w.at.toFixed(1)} s (battle ends ${w.end.toFixed(0)} s)`).toBeLessThanOrEqual(25);
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
});

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Rng } from '@/core/rng';
import { v3, type Vec3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { PROFILE_PHASES } from '@/simulation/profile';
import { GRID_CELL_KM, SpatialGrid, gridFilterPasses } from '@/simulation/spatial';
import type { ShipState } from '@/simulation/types';
import { yieldToLoop } from './support/async';

/**
 * Performance structure tests (ADOPTION_PLAN.md §21.5, §21.6; WORK_BREAKDOWN.md §1.6.3 `tests/perf.test.ts`):
 * the spatial grid is equivalent to brute force, the per-step cost scales sub-quadratically (300 vs 100 costs
 * at most 4 × 100 vs 100 per step, measured in one process), a generous absolute smoke ceiling, and the
 * structural checks of the profiler (never a wall-time percentage, which is flaky under CI load).
 */

// --------------------------------------------------------------- grid fixtures

/** A minimal hull for the grid: only the fields the grid and its filters read. */
function hull(rng: Rng, i: number): ShipState {
  const side = rng.chance(0.5) ? 'A' : 'B';
  return {
    id: `h${i}`,
    side,
    alive: rng.next() > 0.05,
    escaped: rng.next() > 0.97,
    rogue: rng.next() > 0.95,
    pos: v3(rng.range(-60, 60), rng.range(-12, 12), rng.range(-60, 60)),
    radiusKm: rng.range(0.02, 1.1),
  } as unknown as ShipState;
}

function pointSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t, p.z - a.z - dz * t);
}

const ids = (ships: ShipState[]): string[] => ships.map((s) => s.id);

describe('SpatialGrid equals brute force', () => {
  const rng = new Rng(2026);
  const ships = Array.from({ length: 400 }, (_, i) => hull(rng, i));
  const grid = new SpatialGrid(GRID_CELL_KM);
  grid.rebuild(ships);

  it('indexes the live, present hulls into a bounded number of cells', () => {
    expect(grid.size).toBe(ships.filter((s) => s.alive && !s.escaped).length);
    expect(grid.cellCount).toBeGreaterThan(0);
    expect(grid.cellCount).toBeLessThanOrEqual(grid.size);
    expect(grid.maxRadiusKm).toBeCloseTo(Math.max(...ships.filter((s) => s.alive && !s.escaped).map((s) => s.radiusKm)), 12);
  });

  it('querySegment matches a brute-force sweep for 1,000 random segments, in ship-index order', () => {
    for (let n = 0; n < 1000; n++) {
      const a = v3(rng.range(-70, 70), rng.range(-15, 15), rng.range(-70, 70));
      const b = v3(a.x + rng.range(-9, 9), a.y + rng.range(-3, 3), a.z + rng.range(-9, 9));
      const pad = rng.range(0, 3);
      const filter = n % 3 === 0 ? undefined : n % 3 === 1 ? ('A' as const) : ships[rng.int(0, ships.length)];
      const brute = ships.filter((s) => gridFilterPasses(filter, s) && pointSegmentDistance(s.pos, a, b) <= pad);
      expect(ids(grid.querySegment(a, b, pad, filter))).toEqual(ids(brute));
    }
  });

  it('queryRadius and anyWithin match brute force, including radii larger than the battlespace', () => {
    for (let n = 0; n < 1000; n++) {
      const p = v3(rng.range(-70, 70), rng.range(-15, 15), rng.range(-70, 70));
      const r = n % 10 === 0 ? rng.range(100, 400) : rng.range(0, 25);
      const filter = n % 3 === 0 ? undefined : n % 3 === 1 ? ('B' as const) : ships[rng.int(0, ships.length)];
      const brute = ships.filter((s) => gridFilterPasses(filter, s) && Math.hypot(s.pos.x - p.x, s.pos.y - p.y, s.pos.z - p.z) <= r);
      expect(ids(grid.queryRadius(p, r, filter))).toEqual(ids(brute));
      expect(grid.anyWithin(p, r, filter)).toBe(brute.length > 0);
    }
  });

  it('nearest matches brute force (ties by ship index)', () => {
    for (let n = 0; n < 500; n++) {
      const p = v3(rng.range(-90, 90), rng.range(-20, 20), rng.range(-90, 90));
      const filter = n % 2 === 0 ? ('A' as const) : ships[rng.int(0, ships.length)];
      let best: ShipState | undefined;
      let bestD = Infinity;
      for (const s of ships) {
        if (!gridFilterPasses(filter, s)) continue;
        const d = Math.hypot(s.pos.x - p.x, s.pos.y - p.y, s.pos.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      expect(grid.nearest(p, filter)?.id).toBe(best?.id);
    }
  });

  it('filters: a Side selects the other side, a ship selects its targeting set with rogue hulls, dead hulls never match', () => {
    const a = { side: 'A', alive: true, escaped: false, rogue: false } as ShipState;
    const b = { side: 'B', alive: true, escaped: false, rogue: false } as ShipState;
    const rogueB = { side: 'B', alive: true, escaped: false, rogue: true } as ShipState;
    const dead = { side: 'B', alive: false, escaped: false, rogue: false } as ShipState;
    expect(gridFilterPasses('A', b)).toBe(true);
    expect(gridFilterPasses('A', a)).toBe(false);
    expect(gridFilterPasses('B', a)).toBe(true);
    expect(gridFilterPasses(a, b)).toBe(true);
    expect(gridFilterPasses(a, a)).toBe(false);
    expect(gridFilterPasses(b, rogueB)).toBe(true); // a rogue hull is everyone's enemy
    expect(gridFilterPasses(rogueB, b)).toBe(true); // and sees everyone else
    expect(gridFilterPasses(rogueB, rogueB)).toBe(false);
    // The rogue group never fights itself; two rogue groups on different sides are enemies (AP §4.1).
    const rogueB2 = { side: 'B', alive: true, escaped: false, rogue: true } as ShipState;
    const rogueA = { side: 'A', alive: true, escaped: false, rogue: true } as ShipState;
    expect(gridFilterPasses(rogueB, rogueB2)).toBe(false);
    expect(gridFilterPasses(rogueA, rogueB)).toBe(true);
    expect(gridFilterPasses(rogueA, a)).toBe(true);
    expect(gridFilterPasses(undefined, dead)).toBe(false);
    expect(gridFilterPasses('A', dead)).toBe(false);
  });

  it('is empty before a rebuild and after one with no live hull', () => {
    const empty = new SpatialGrid();
    expect(empty.queryRadius(v3(), 10)).toEqual([]);
    expect(empty.nearest(v3(), 'A')).toBeUndefined();
    empty.rebuild([{ ...ships[0], alive: false } as ShipState]);
    expect(empty.cellCount).toBe(0);
    expect(empty.querySegment(v3(), v3(1, 0, 0), 5)).toEqual([]);
  });
});

// ------------------------------------------------------------ scaling bound

/** The AP §21.5 ladder composition (coalition 6 / 2 / 32 / 60 %, Reapers 25 / 75 %), seed 11, deep space 80 km. */
function ladder(a: number, b: number): BattleSimulation {
  const dn = Math.round(a * 0.06);
  const cv = Math.round(a * 0.02);
  const ca = Math.round(a * 0.32);
  const caps = Math.round(b * 0.25);
  return new BattleSimulation(
    buildCustomBattle({
      seed: 11,
      rulesId: 'canon_me3',
      environment: 'deep_space',
      startingDistanceKm: 80,
      maxDuration: 1200,
      sideA: { faction: 'alliance', name: 'Coalition', formation: 'line_abreast', counts: { alliance_dreadnought: dn, alliance_carrier: cv, alliance_cruiser: ca, alliance_frigate: a - dn - cv - ca } },
      sideB: { faction: 'reaper', name: 'Reapers', formation: 'dispersed', counts: { reaper_capital: caps, reaper_destroyer: b - caps } },
    }),
  );
}

async function msPerStep(sim: BattleSimulation, warmup: number, steps: number): Promise<number> {
  for (let i = 0; i < warmup; i++) sim.step();
  await yieldToLoop();
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) sim.step();
  return (performance.now() - t0) / steps;
}

describe('scaling', () => {
  it('300 vs 100 costs at most 4 × the per-step cost of 100 vs 100 (200-step warm-up, 400 measured steps, one process)', async () => {
    // Warm the JIT on the small battle first so the comparison does not charge compilation to either row.
    await msPerStep(ladder(100, 100), 100, 100);
    const small = await msPerStep(ladder(100, 100), 200, 400);
    await yieldToLoop();
    const large = await msPerStep(ladder(300, 100), 200, 400);
    expect(large, `100 vs 100: ${small.toFixed(2)} ms/step, 300 vs 100: ${large.toFixed(2)} ms/step`).toBeLessThanOrEqual(4 * small);
  }, 120_000);

  it('smoke ceiling: 400 steps of 300 vs 100 complete in under 20 s', async () => {
    const sim = ladder(300, 100);
    const ms = await msPerStep(sim, 0, 400);
    expect(ms * 400).toBeLessThan(20_000);
    expect(sim.grid.cellCount).toBeGreaterThan(0);
  }, 120_000);
});

// ------------------------------------------------------------- profiler

describe('sim.profile', () => {
  it('records nothing while disabled and a consistent split while enabled (never a wall-time percentage)', () => {
    const off = ladder(40, 20);
    for (let i = 0; i < 50; i++) off.step();
    expect(off.profile.steps).toBe(0);
    expect(off.profile.totalMs).toBe(0);
    for (const p of PROFILE_PHASES) expect(off.profile.phases[p]).toBe(0);
    expect(off.profile.report()).toBe('profile: disabled');

    const on = ladder(40, 20);
    on.profile.enabled = true;
    // A monotone fake clock keeps the structural check deterministic: each read advances one unit.
    let ticks = 0;
    on.profile.now = () => ticks++;
    for (let i = 0; i < 50; i++) on.step();
    expect(on.profile.steps).toBe(50);
    for (const p of PROFILE_PHASES) expect(on.profile.phases[p]).toBeGreaterThanOrEqual(0);
    expect(Object.keys(on.profile.phases).sort()).toEqual([...PROFILE_PHASES].sort());
    expect(on.profile.phaseSum).toBeLessThanOrEqual(on.profile.totalMs);
    expect(on.profile.phaseSum).toBeGreaterThan(0);
    const split = on.profile.split();
    let sum = 0;
    for (const p of PROFILE_PHASES) sum += split[p];
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    expect(on.profile.report()).toMatch(/ms\/step over 50 steps/);
    // The profiler never changes a battle: the same seed gives the same state with it on and off.
    expect(on.events.length).toBe(off.events.length);
    expect(JSON.stringify(on.ships.map((s) => [s.id, s.hull, s.pos]))).toBe(JSON.stringify(off.ships.map((s) => [s.id, s.hull, s.pos])));
  });
});

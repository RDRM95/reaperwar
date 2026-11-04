import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { SCENARIOS, fleet } from '@/scenarios';
import { PLATFORM_WEIGHT, scoreTarget } from '@/simulation/ai';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleConfig, FleetSpec, VolleyState } from '@/simulation/types';
import { PRESETS, getPreset } from '@/timelines/presets';

/** Fixed orbital platforms (WORK_BREAKDOWN.md T9, §1.6.3; brief §8.10; CINEMATIC_DESIGN.md §7.10). */

const rules = getPreset('canon_me3');

function config(fleets: FleetSpec[], seed = 1): BattleConfig {
  return { id: 'platform-test', name: 'Platform test', scenarioId: 'custom', seed, rules, fleets, environment: 'earth_orbit', maxDuration: 600, perspectiveSide: 'A', objective: 'Test.' };
}

const platforms = (n = 2): FleetSpec => fleet('sol-platforms', 'alliance', rules, { counts: { sol_defence_platform: n }, name: 'Sol platforms', formation: 'static', position: v3(0, 0, -12), mult: 1 });
const reapers = (z = 20): FleetSpec => fleet('reapers', 'reaper', rules, { counts: { reaper_capital: 1, reaper_destroyer: 2 }, name: 'Reapers', side: 'B', position: v3(0, 0, z), mult: 1 });

const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
  return Math.acos(Math.max(-1, Math.min(1, c)));
};

describe('fixed platforms', () => {
  it('a platform never moves in 600 steps and slews at most turnRate × dt per step', () => {
    const sim = new BattleSimulation(config([platforms(), reapers()]));
    const plats = sim.ships.filter((s) => s.role === 'fixed_platform');
    expect(plats.length).toBe(2);
    expect(sim.fleets.get('sol-platforms')!.static).toBe(true);
    const start = plats.map((p) => ({ ...p.pos }));
    let slewed = 0;
    for (let i = 0; i < 600; i++) {
      const before = plats.map((p) => ({ ...p.heading }));
      sim.step();
      plats.forEach((p, k) => {
        const turned = angle(before[k], p.heading);
        expect(turned).toBeLessThanOrEqual(p.turnRate * SIM_DT + 1e-9);
        slewed = Math.max(slewed, turned);
      });
      if (plats.every((p) => !p.alive)) break;
    }
    plats.forEach((p, k) => {
      expect(p.pos).toEqual(start[k]);
      expect(p.vel).toEqual(v3());
    });
    // They do slew to bear on the Reapers (the stations start facing the bearing, the targets sit off it).
    expect(slewed).toBeGreaterThan(0);
  });

  it('move orders are rejected with order_rejected; attack_target still sets the focus', () => {
    const sim = new BattleSimulation(config([platforms(), reapers()]));
    const f = sim.fleets.get('sol-platforms')!;
    const before = { ...f.orders };
    for (const patch of [{ order: 'advance' as const }, { order: 'retreat' as const }, { order: 'defend_position' as const, position: v3(0, 0, 5) }, { formation: 'line_abreast' as const }]) {
      const n = sim.events.length;
      expect(sim.issueOrders('sol-platforms', patch)).toBe('rejected');
      const ev = sim.events.slice(n);
      expect(ev.some((e) => e.type === 'order_rejected' && e.fleetId === 'sol-platforms' && e.reason === 'static_fleet')).toBe(true);
      expect(ev.some((e) => e.type === 'order_issued')).toBe(false);
    }
    expect(f.orders).toEqual(before);
    const capital = sim.ships.find((s) => s.role === 'reaper_capital')!;
    expect(sim.issueOrders('sol-platforms', { order: 'attack_target', targetId: capital.id })).toBe('issued');
    expect(f.focusTargetId).toBe(capital.id);
    for (const p of sim.ships.filter((s) => s.fleetId === 'sol-platforms')) expect(p.forcedTargetId).toBe(capital.id);
    expect(sim.issueOrders('sol-platforms', { priority: 'capitals' })).toBe('issued');
    // A mobile fleet still takes the same move order.
    expect(sim.issueOrders('reapers', { order: 'advance' })).toBe('issued');
  });

  it('a Reaper fleet in range targets a platform before a closer, wounded cruiser — except while it holds a pending volley', () => {
    const build = (): BattleSimulation => {
      const line = fleet('line', 'alliance', rules, { counts: { alliance_cruiser: 1 }, name: 'Line', formation: 'line_abreast', position: v3(0, 0, -4), mult: 1 });
      const plat = fleet('sol-platforms', 'alliance', rules, { counts: { sol_defence_platform: 1 }, name: 'Platform', formation: 'static', position: v3(0, 0, -23), mult: 1 });
      const reaper = fleet('reapers', 'reaper', rules, { counts: { reaper_capital: 1 }, name: 'Reaper', side: 'B', position: v3(0, 0, 14), mult: 1 });
      const sim = new BattleSimulation(config([plat, line, reaper]));
      // The cruiser is the better target on every other count: closer, wounded, barriers down.
      const cruiser = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
      cruiser.hull = cruiser.maxHull * 0.3;
      cruiser.barriers = 0;
      return sim;
    };
    const sim = build();
    const reaper = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const platform = sim.ships.find((s) => s.role === 'fixed_platform')!;
    const cruiser = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
    const rf = sim.fleets.get('reapers')!;
    const range = Math.max(...reaper.weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range));
    const platScore = scoreTarget(sim, reaper, rf, platform, range);
    const cruScore = scoreTarget(sim, reaper, rf, cruiser, range);
    expect(platScore).toBeGreaterThan(cruScore);
    expect(platScore / PLATFORM_WEIGHT).toBeLessThan(cruScore);
    // The first decision picks the platform; every beam fired after it goes to the platform (a beam that leaves before
    // the first decision is a target of opportunity and is not counted).
    while (reaper.targetId === undefined) sim.step();
    const decidedAt = sim.time;
    expect(reaper.targetId).toBe(platform.id);
    for (let i = 0; i < 160; i++) sim.step();
    const beams = sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === reaper.id && e.kind === 'reaper_beam' && e.t >= decidedAt);
    expect(beams.length).toBeGreaterThan(0);
    for (const b of beams) expect(b.type === 'weapon_fired' ? b.targetId : undefined).toBe(platform.id);

    // A pending volley suspends the weight: the answer lands on the line.
    const held = build();
    const volley: VolleyState = { at: 1000, window: 2, mounts: 'beams', syncArrival: false, offsets: new Map(), fired: 0, held: 0, silent: 0 };
    held.fleets.get('reapers')!.volley = volley;
    const heldReaper = held.ships.find((s) => s.role === 'reaper_capital')!;
    while (heldReaper.targetId === undefined) held.step();
    expect(heldReaper.targetId).toBe(held.ships.find((s) => s.classId === 'alliance_cruiser')!.id);
    expect(held.fleets.get('reapers')!.focusTargetId).toBe(heldReaper.targetId);
  });

  it('the heavy super-accelerator platform only exists in scenario configs built under heavyPlatforms', () => {
    for (const scenario of SCENARIOS.filter((s) => s.id !== 'custom')) {
      for (const r of PRESETS) {
        const cfg = scenario.build(r, 1, {});
        const id = scenario.id;
        const p = r.id;
        const heavy = cfg.fleets.some((f) => f.ships.some((s) => s.classId === 'sol_platform_heavy' && s.count > 0));
        if (heavy) expect(r.special.heavyPlatforms, `${id} under ${p}`).toBe(true);
      }
    }
  });
});

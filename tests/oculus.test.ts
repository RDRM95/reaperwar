import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { SHIP_CLASSES, SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { buildScenario, fleet } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { BATTLESPACE_SCALE as S } from '@/simulation/constants';
import { fighterPassGoal } from '@/simulation/movement';
import { CRAFT_DETECT_RANGE, detectable } from '@/simulation/stealth';
import type { BattleConfig, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { runSimAsync } from './support/async';

/** Oculus drones through the hangar system and the fighter stand-off rule (ADOPTION_PLAN.md §13.1; WORK_BREAKDOWN.md T11). */

const canon = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'oculus', name: 'Oculus', scenarioId: 'custom', seed, rules: canon, fleets, environment: 'deep_space', maxDuration: 900, perspectiveSide: 'A', objective: 'Test.' });
const dist = (a: ShipState, b: { x: number; y: number; z: number }): number => Math.hypot(a.pos.x - b.x, a.pos.y - b.y, a.pos.z - b.z);

describe('Oculus complements (AP §13.1)', () => {
  it.each(['canon_me3', 'prime_apex'])('every Reaper warship carries 8 / 2 / 12 Oculi under %s, each complement a labelled extrapolation', (rulesId) => {
    const want: Record<string, number> = { reaper_capital: 8, reaper_destroyer: 2, harbinger: 12 };
    const reapers = SHIP_CLASS_LIST.filter((c) => c.faction === 'reaper' && c.role !== 'fighter');
    expect(reapers.map((c) => c.id).sort()).toEqual(Object.keys(want).sort());
    for (const c of reapers) {
      const fc = c.fighterComplement!;
      expect(fc.classId, c.id).toBe('reaper_oculus');
      expect(fc.count, c.id).toBe(want[c.id]);
      expect(fc.source?.provenance, c.id).toBe('SIMULATION_ESTIMATE');
      expect(fc.source?.note ?? '', c.id).toMatch(/extrapolation/);
    }
    // The hangars the simulation builds hold the same numbers under the preset.
    const rules = getPreset(rulesId);
    const f = fleet('r', 'reaper', rules, { counts: { reaper_capital: 1, reaper_destroyer: 1, harbinger: 1 }, name: 'R', side: 'B', position: v3(0, 0, 40), mult: 1 });
    const a = fleet('a', 'alliance', rules, { counts: { alliance_frigate: 1 }, name: 'A', position: v3(0, 0, -40), mult: 1 });
    const sim = new BattleSimulation({ ...config([a, f]), rules });
    for (const s of sim.ships.filter((x) => x.faction === 'reaper')) expect(s.hangar?.remaining, s.classId).toBe(want[s.classId]);
    expect(SHIP_CLASSES.reaper_oculus.designProvenance.provenance).toBe('CANON_CONFIRMED');
  });

  it('a hangar burst launches the whole burst in one tick; otherwise Oculi leave two every 0.4 s', () => {
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 60), mult: 1, initialOrder: { fightersDeployed: false, order: 'hold_formation' } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_frigate: 1 }, name: 'A', position: v3(0, 0, -60), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.ships.some((s) => s.classId === 'reaper_oculus')).toBe(false);
    sim.issueOrders('r', { fightersDeployed: true });
    cap.hangar!.burst = 8;
    sim.step();
    const drones = sim.ships.filter((s) => s.classId === 'reaper_oculus');
    expect(drones).toHaveLength(8);
    const deployed = sim.events.filter((e) => e.type === 'ship_deployed' && e.classId === 'reaper_oculus');
    expect(new Set(deployed.map((e) => e.t)).size).toBe(1);
    expect(cap.hangar!.remaining).toBe(0);
    expect(cap.hangar!.burst).toBeUndefined();
    expect(sim.events.some((e) => e.type === 'fighters_launched' && e.carrierId === cap.id && e.count === 8)).toBe(true);
    // No two drones launched on top of each other.
    for (let i = 0; i < drones.length; i++) for (let j = i + 1; j < drones.length; j++) expect(dist(drones[i], drones[j].pos)).toBeGreaterThan(0.05);

    // The ordinary cadence: a capital with its deck open launches its first pair after 2 s, then two every 0.4 s.
    const open = new BattleSimulation(config([a, fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 60), mult: 1 })]));
    const times: number[] = [];
    open.onEvent = (e) => {
      if (e.type === 'ship_deployed' && e.classId === 'reaper_oculus') times.push(e.t);
    };
    while (open.time < 6) open.step();
    expect(times).toHaveLength(8);
    expect(times[0]).toBeCloseTo(2, 1);
    expect(times[2] - times[0]).toBeCloseTo(0.4, 1);
    expect(new Set(times).size).toBe(4);
  });
});

describe('the fighter stand-off rule (AP §13.1: 0.9 × the range of the weapon that can engage the current target)', () => {
  it('a Trident holds 0.9 × its gun range behind an Oculus and starts a strafing pass 0.9 × its torpedo range from a hull', () => {
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 30), mult: 1, initialOrder: { order: 'hold_formation' } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_carrier: 1 }, name: 'A', position: v3(0, 0, -30), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    while (!sim.ships.some((s) => s.classId === 'alliance_fighter') || !sim.ships.some((s) => s.classId === 'reaper_oculus')) sim.step();
    const trident = sim.ships.find((s) => s.classId === 'alliance_fighter')!;
    const drone = sim.ships.find((s) => s.classId === 'reaper_oculus')!;
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    trident.pos = v3(0, 0, 0);
    trident.vel = v3(0, 0, 0);
    drone.pos = v3(0, 0, 3);
    drone.vel = v3(0, 0, 0);
    const chase = fighterPassGoal(sim, trident, drone, []);
    expect(dist(drone, chase.position)).toBeCloseTo(0.9 * WEAPONS.fighter_gun.range * S, 6);
    expect(chase.face).toEqual(drone.pos);
    trident.manoeuvre = undefined;
    cap.pos = v3(0, 0, 8);
    const pass = fighterPassGoal(sim, trident, cap, []);
    expect((trident.manoeuvre as ShipState['manoeuvre'])?.phase).toBe('approach');
    expect(Math.hypot(pass.position.x - cap.pos.x, pass.position.z - cap.pos.z)).toBeCloseTo(0.9 * WEAPONS.fighter_torpedo.range * S, 6);
  });
});

describe('small craft find silent ships only close in (brief §15.2: fighters and Oculi within 1.5 km)', () => {
  it('an Oculus reveals a silent stealth frigate within 1.5 km (nominal) but not at 2 km, where a hull would', () => {
    const hunter = fleet('h', 'alliance', canon, { counts: { alliance_frigate_thanix: 1 }, name: 'H', formation: 'dispersed', position: v3(0, 0, 0), mult: 1, initialOrder: { order: 'retreat' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 80), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([hunter, r]));
    while (!sim.ships.some((s) => s.classId === 'reaper_oculus')) sim.step();
    const f = sim.ships.find((s) => s.classId === 'alliance_frigate_thanix')!;
    const drone = sim.ships.find((s) => s.classId === 'reaper_oculus')!;
    const destroyer = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    for (const s of sim.ships.filter((x) => x.faction === 'reaper')) for (const w of s.weapons) w.cooldown = Infinity;
    expect(f.stealth!.state).toBe('silent');
    expect(CRAFT_DETECT_RANGE).toBeCloseTo(1.5 * S, 9);
    expect(CRAFT_DETECT_RANGE).toBeLessThan(f.stealth!.detectRange);
    const place = (s: ShipState, km: number): void => {
      s.pos = v3(f.pos.x + km, f.pos.y, f.pos.z);
      s.prevPos = v3(s.pos.x, s.pos.y, s.pos.z);
      s.vel = v3(0, 0, 0);
    };
    const between = (CRAFT_DETECT_RANGE + f.stealth!.detectRange) / 2;
    // The drone between the craft reach and the hull's detection range: still silent, still invisible to it.
    place(drone, between);
    place(destroyer, 30);
    sim.step();
    expect(f.stealth!.state).toBe('silent');
    expect(detectable(drone, f)).toBe(false);
    // A hull at the same distance does find it.
    place(drone, 10);
    place(destroyer, between);
    sim.step();
    expect(f.stealth!.state).toBe('revealed');
    const byHull = sim.events.filter((e) => e.type === 'stealth_revealed' && e.shipId === f.id).pop();
    expect(byHull && byHull.type === 'stealth_revealed' ? byHull.reason : '').toBe('detected');

    // A fresh frigate and the drone inside 1.5 km: revealed by the drone alone.
    const sim2 = new BattleSimulation(config([hunter, r]));
    while (!sim2.ships.some((s) => s.classId === 'reaper_oculus')) sim2.step();
    const f2 = sim2.ships.find((s) => s.classId === 'alliance_frigate_thanix')!;
    const d2 = sim2.ships.find((s) => s.classId === 'reaper_oculus')!;
    for (const s of sim2.ships.filter((x) => x.faction === 'reaper')) for (const w of s.weapons) w.cooldown = Infinity;
    d2.pos = v3(f2.pos.x + 0.8 * CRAFT_DETECT_RANGE, f2.pos.y, f2.pos.z);
    d2.prevPos = v3(d2.pos.x, d2.pos.y, d2.pos.z);
    d2.vel = v3(0, 0, 0);
    expect(detectable(d2, f2)).toBe(true);
    sim2.step();
    expect(f2.stealth!.state).toBe('revealed');
  });
});

describe('Oculi in the Battle of Earth (canon, seed 42)', () => {
  it('drones are out before 30 s, the Reapers still win and the Tridents live a median 55 s or more', async () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 42, {}));
    const born = new Map<string, number>();
    sim.onEvent = (e) => {
      if (e.type === 'ship_deployed' && (e.classId === 'alliance_fighter' || e.classId === 'reaper_oculus')) born.set(e.shipId, e.t);
    };
    await runSimAsync(sim);
    const died = new Map<string, number>();
    for (const e of sim.events) if (e.type === 'ship_destroyed' && e.role === 'fighter') died.set(e.shipId, e.t);
    const firstDrone = Math.min(...[...born.entries()].filter(([id]) => sim.getShip(id)?.classId === 'reaper_oculus').map(([, t]) => t));
    expect(firstDrone).toBeLessThan(30);
    expect(sim.result!.winner).toBe('B');
    const lives = [...born.entries()]
      .filter(([id]) => sim.getShip(id)?.classId === 'alliance_fighter')
      .map(([id, t]) => (died.get(id) ?? sim.time) - t)
      .sort((x, y) => x - y);
    expect(lives.length).toBeGreaterThan(0);
    expect(lives[Math.floor(lives.length / 2)]).toBeGreaterThanOrEqual(55);
  }, 120_000);
});

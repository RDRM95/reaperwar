import { describe, expect, it } from 'vitest';
import { v3, type Vec3 } from '@/core/vec3';
import { fleet } from '@/scenarios';
import { ARRIVAL, arrivalEase, arrivalPos } from '@/simulation/arrival';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { slotToWorld } from '@/simulation/formations';
import type { BattleConfig, Beat, BeatScript, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/**
 * Arrival waves and the `checkEnd` guard (CINEMATIC_DESIGN.md §1.5; ADOPTION_PLAN.md §6; WORK_BREAKDOWN.md T13,
 * §1.6.3 `tests/arrival.test.ts`). Every run is deterministic.
 */

const canon = getPreset('canon_me3');
const script = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({ version: 1, beats, beatScale: 1, scripted: true, ...extra });
const config = (fleets: FleetSpec[], beats?: BeatScript, maxDuration = 600): BattleConfig => ({
  id: 'arrival',
  name: 'Arrival',
  scenarioId: 'custom',
  seed: 3,
  rules: canon,
  fleets,
  environment: 'deep_space',
  maxDuration,
  perspectiveSide: 'A',
  objective: 'Test.',
  ...(beats ? { beats } : {}),
});
const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

describe('arrival kinematics', () => {
  it('arrivalEase runs 0 → 1 monotonically, arrivalPos starts at `from` and ends at `to`, the role profiles are the contract values', () => {
    expect(arrivalEase(0)).toBe(0);
    expect(arrivalEase(1)).toBe(1);
    let prev = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const e = arrivalEase(i / 200);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    const a = { appearAt: 2, settleAt: 8, from: v3(3, -1, -12), to: v3(3, 2, 0) };
    expect(arrivalPos(a, 0)).toEqual(a.from);
    expect(arrivalPos(a, 2)).toEqual(a.from);
    expect(arrivalPos(a, 8)).toEqual(a.to);
    expect(arrivalPos(a, 30)).toEqual(a.to);
    const mid = arrivalPos(a, 5);
    expect(mid.z).toBeGreaterThan(-12);
    expect(mid.z).toBeLessThan(0);
    expect(ARRIVAL).toEqual({ capital: { runKm: 12, duration: 6 }, cruiser: { runKm: 9, duration: 4.5 }, frigate: { runKm: 7, duration: 3.5 } });
  });
});

describe('a beat-spawned wave', () => {
  // Side A arrives only by beat (2 s, stagger 3 s) and advances on a Reaper capital that would fire at anything it sees.
  const build = (): BattleSimulation => {
    const wave: FleetSpec = {
      ...fleet('wave', 'alliance', canon, { counts: { alliance_dreadnought: 1, alliance_cruiser: 2, alliance_frigate: 2 }, name: 'Wave', position: v3(0, 0, -30), mult: 1, initialOrder: { order: 'advance' } }),
      arrivalMode: 'beat',
    };
    const reapers = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 0), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    return new BattleSimulation(config([wave, reapers], script([{ id: 'arrive', at: 2, event: { kind: 'spawn_wave', fleetId: 'wave', stagger: 3 } }])));
  };

  it('is absent before its beat, then every hull flashes once at appearAt, runs in and settles at rest on its slot; one fleet_arrived, one reinforcement_arrival', () => {
    const sim = build();
    const settled = new Map<string, number>();
    const appear = new Map<string, number>();
    const rel = new Map<string, Vec3>();
    for (let i = 0; i < Math.round(16 / SIM_DT); i++) {
      sim.step();
      if (sim.time < 2 - 1e-9) expect(sim.ships.some((s) => s.fleetId === 'wave')).toBe(false);
      const f = sim.fleets.get('wave');
      if (!f) continue;
      for (const s of sim.ships.filter((x) => x.fleetId === 'wave')) {
        if (s.arrival) appear.set(s.id, s.arrival.appearAt);
        const r = sub3(s.pos, slotToWorld(f.anchor, f.heading, s.slot));
        const before = rel.get(s.id);
        if (s.arrival === undefined && !settled.has(s.id) && before) {
          // The step on which the hull left its arrival state: its speed relative to the (moving) slot.
          settled.set(s.id, len(sub3(r, before)) / SIM_DT);
        }
        rel.set(s.id, r);
      }
    }
    const wave = sim.ships.filter((s) => s.fleetId === 'wave');
    expect(wave).toHaveLength(5);
    const flashes = sim.events.filter((e) => e.type === 'ship_arrival_flash');
    expect(flashes).toHaveLength(5);
    for (const s of wave) {
      const fl = flashes.filter((e) => e.type === 'ship_arrival_flash' && e.shipId === s.id);
      expect(fl).toHaveLength(1);
      const at = appear.get(s.id)!;
      expect(at).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(at).toBeLessThanOrEqual(5 + 1e-9);
      // The flash lands on the first tick at or after appearAt.
      expect(fl[0].t).toBeGreaterThanOrEqual(at - 1e-9);
      expect(fl[0].t - at).toBeLessThan(SIM_DT + 1e-9);
      // Settled at (essentially) zero speed relative to the slot.
      expect(settled.get(s.id)).toBeLessThan(0.05);
      expect(s.arrival).toBeUndefined();
      expect(s.weapons.every((w) => w.arrivalHold === undefined)).toBe(true);
    }
    expect(sim.events.filter((e) => e.type === 'fleet_arrived' && e.fleetId === 'wave')).toHaveLength(1);
    expect(sim.events.filter((e) => e.type === 'reinforcement_arrival' && e.fleetId === 'wave')).toHaveLength(1);
    // The wave settles after its last hull: the latest appearAt plus that hull's run-in duration.
    const arrived = sim.events.find((e) => e.type === 'fleet_arrived' && e.fleetId === 'wave')!;
    expect(arrived.t).toBeGreaterThan(Math.max(...appear.values()));
  }, 60_000);

  it('a pending hull is inert: not in enemiesOf / enemiesOfShip, never fired at or hit before appearAt, holds fire until it settles; targetable after', () => {
    const sim = build();
    const reaper = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const seenAfter = new Set<string>();
    const appear = new Map<string, number>();
    const settle = new Map<string, number>();
    for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
      sim.step();
      for (const s of sim.ships) {
        if (s.fleetId !== 'wave') continue;
        if (s.arrival) {
          appear.set(s.id, s.arrival.appearAt);
          settle.set(s.id, s.arrival.settleAt);
        }
        const pending = s.arrival !== undefined && sim.time < s.arrival.appearAt - 1e-9;
        expect(sim.isPending(s)).toBe(pending);
        const visible = sim.enemiesOf('B').includes(s);
        expect(sim.enemiesOfShip(reaper).includes(s)).toBe(visible);
        if (pending) expect(visible).toBe(false);
        else if (s.alive) {
          expect(visible).toBe(true);
          seenAfter.add(s.id);
        }
      }
    }
    expect(seenAfter.size).toBe(5);
    for (const e of sim.events) {
      if (e.type === 'weapon_fired') {
        const at = appear.get(e.targetId);
        if (at !== undefined) expect(e.t).toBeGreaterThanOrEqual(at - 1e-9);
        const st = settle.get(e.shipId);
        if (st !== undefined) expect(e.t).toBeGreaterThanOrEqual(st - 1e-9);
      }
      if (e.type === 'projectile_impact') {
        const at = appear.get(e.targetId);
        if (at !== undefined) expect(e.t).toBeGreaterThanOrEqual(at - 1e-9);
      }
    }
    // The capital fires at the wave once it is in (being shot while decelerating is correct, CINEMATIC_DESIGN.md §1.5).
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.shipId === reaper.id && appear.has(e.targetId))).toBe(true);
    // And the settled wave fires back.
    expect(sim.events.some((e) => e.type === 'weapon_fired' && appear.has(e.shipId))).toBe(true);
  }, 60_000);
});

describe('the checkEnd guard (ADOPTION_PLAN.md §6)', () => {
  const reapers = (): FleetSpec => fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 40), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });

  it('a side whose only fleet arrives at 30 s is not declared destroyed at tick 1; its points enter the attrition maths only at deployment', () => {
    const late = fleet('late', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'Late', position: v3(0, 0, -40), mult: 1, arrivalTime: 30 });
    const sim = new BattleSimulation(config([late, reapers()]));
    sim.step();
    expect(sim.finished).toBe(false);
    expect(sim.fleets.has('late')).toBe(false);
    sim.skipTo(29.9);
    expect(sim.finished).toBe(false);
    sim.skipTo(30.05);
    expect(sim.fleets.get('late')!.startPoints).toBeGreaterThan(0);
    expect(sim.events.filter((e) => e.type === 'reinforcement_arrival' && e.fleetId === 'late')).toHaveLength(1);
    expect(sim.events.filter((e) => e.type === 'fleet_arrived' && e.fleetId === 'late')).toHaveLength(1);
    // Before deployment the side has no points in the judgement: a time limit before 30 s goes to the other side.
    const early = new BattleSimulation(config([fleet('late', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'Late', position: v3(0, 0, -40), mult: 1, arrivalTime: 30 }), reapers()], undefined, 20));
    early.run();
    expect(early.time).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(early.result!.winner).toBe('B');
    expect(early.events.find((e) => e.type === 'battle_end')).toMatchObject({ reason: 'Time limit: attrition judgement' });
  });

  it('a side that arrives only by beat survives until its wave; without a beat to deploy it the battle ends at once', () => {
    const wave = (): FleetSpec => ({ ...fleet('wave', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'Wave', position: v3(0, 0, -40), mult: 1 }), arrivalMode: 'beat' });
    const sim = new BattleSimulation(config([wave(), reapers()], script([{ id: 'arrive', at: 10, event: { kind: 'spawn_wave', fleetId: 'wave' } }])));
    sim.step();
    expect(sim.finished).toBe(false);
    sim.skipTo(9.9);
    expect(sim.finished).toBe(false);
    expect(sim.ships.some((s) => s.fleetId === 'wave')).toBe(false);
    sim.skipTo(10.05);
    expect(sim.ships.filter((s) => s.fleetId === 'wave')).toHaveLength(2);
    expect(sim.events.filter((e) => e.type === 'reinforcement_arrival' && e.fleetId === 'wave')).toHaveLength(1);
    // A beat fleet no beat will ever deploy is not a pending force.
    const orphan = new BattleSimulation(config([wave(), reapers()]));
    orphan.step();
    expect(orphan.finished).toBe(true);
    expect(orphan.result!.winner).toBe('B');
  });
});

describe('arrivalTime reinforcements', () => {
  it('still emit reinforcement_arrival and fleet_arrived; with arrivalFlash they drop in through the arrival kinematics', () => {
    const plain = fleet('plain', 'alliance', canon, { counts: { alliance_frigate: 2 }, name: 'Plain', position: v3(-10, 0, -40), mult: 1, arrivalTime: 5 });
    const flash: FleetSpec = { ...fleet('flash', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'Flash', position: v3(10, 0, -40), mult: 1, arrivalTime: 5 }), arrivalFlash: true };
    const base = fleet('base', 'alliance', canon, { counts: { alliance_frigate: 1 }, name: 'Base', position: v3(0, 0, -50), mult: 1 });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 60), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([base, plain, flash, r]));
    sim.skipTo(15);
    for (const id of ['plain', 'flash']) {
      expect(sim.events.filter((e) => e.type === 'reinforcement_arrival' && e.fleetId === id)).toHaveLength(1);
      expect(sim.events.filter((e) => e.type === 'fleet_arrived' && e.fleetId === id)).toHaveLength(1);
    }
    const flashed = sim.events.filter((e) => e.type === 'ship_arrival_flash').map((e) => (e.type === 'ship_arrival_flash' ? sim.getShip(e.shipId)!.fleetId : ''));
    expect(flashed.sort()).toEqual(['flash', 'flash']);
    // The plain reinforcement appears in formation on its deployment tick (the first tick at or after 5 s), the flash
    // one only after its run-in.
    const tDeploy = sim.events.find((e) => e.type === 'reinforcement_arrival' && e.fleetId === 'plain')!.t;
    const tPlain = sim.events.find((e) => e.type === 'fleet_arrived' && e.fleetId === 'plain')!.t;
    const tFlash = sim.events.find((e) => e.type === 'fleet_arrived' && e.fleetId === 'flash')!.t;
    expect(tDeploy).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(tDeploy).toBeLessThan(5 + SIM_DT + 1e-6);
    expect(tPlain).toBe(tDeploy);
    expect(tFlash).toBeGreaterThan(tDeploy + ARRIVAL.cruiser.duration - 1e-9);
    // Ships of a beat-less battle never carry an arrival state once in.
    expect(sim.ships.every((s: ShipState) => s.arrival === undefined)).toBe(true);
  });
});

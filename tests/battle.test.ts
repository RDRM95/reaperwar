import { describe, expect, it } from 'vitest';
import { BattleSimulation } from '@/simulation/battle';
import { buildScenario, buildCustomBattle, getScenario, FLEET_SCALING_KEY } from '@/scenarios';
import { assessReapers } from '@/simulation/reaperIntel';
import { compareBattles } from '@/scenarios/comparison';
import { CANON_ME3, PRIME_APEX, getPreset } from '@/timelines/presets';
import { assignSlots, slotToWorld } from '@/simulation/formations';
import { v3 } from '@/core/vec3';

const fixed = { [FLEET_SCALING_KEY]: 'fixed' };

describe('battle simulation', () => {
  it('is deterministic: same config and seed give identical event logs', () => {
    const a = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 99, fixed));
    const b = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 99, fixed));
    for (let i = 0; i < 1200; i++) {
      a.step();
      b.step();
    }
    expect(a.events.length).toBe(b.events.length);
    expect(JSON.stringify(a.events.slice(-200))).toBe(JSON.stringify(b.events.slice(-200)));
    expect(a.ships.map((s) => [s.id, s.hull, s.pos])).toEqual(b.ships.map((s) => [s.id, s.hull, s.pos]));
  });

  it('different seeds produce different battles', () => {
    const a = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 1, fixed));
    const b = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 2, fixed));
    for (let i = 0; i < 1500; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(a.events.slice(-50))).not.toBe(JSON.stringify(b.events.slice(-50)));
  });

  it('the Battle of Earth completes with a result and destroyed ships', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 42));
    const result = sim.run();
    expect(sim.finished).toBe(true);
    expect(result.duration).toBeGreaterThan(30);
    expect(result.duration).toBeLessThanOrEqual(sim.config.maxDuration + 1);
    const kills = sim.events.filter((e) => e.type === 'ship_destroyed');
    expect(kills.length).toBeGreaterThan(5);
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.kind === 'reaper_beam')).toBe(true);
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.kind === 'mass_accelerator')).toBe(true);
    expect(sim.events.some((e) => e.type === 'projectile_impact')).toBe(true);
    expect(sim.events.some((e) => e.type === 'barriers_down')).toBe(true);
    expect(sim.events.some((e) => e.type === 'reinforcement_arrival')).toBe(true);
    expect(sim.events.some((e) => e.type === 'comms')).toBe(true);
  });

  it('canon rules: the Reapers win the reference engagement; the Alliance cannot destroy the Reaper force', () => {
    for (const seed of [7, 8]) {
      const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', seed, fixed));
      const r = sim.run();
      expect(r.winner).toBe('B');
      expect(r.sides.B.reaperCapitalLost).toBeLessThan(3);
      expect(r.sides.A.survivalPercent).toBeLessThan(30);
    }
  });

  it('Prime/Apex rules: the same fleets defeat the Reapers, at a cost', () => {
    for (const seed of [7, 8]) {
      const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', seed, fixed));
      const r = sim.run();
      expect(r.winner).toBe('A');
      expect(r.sides.B.destroyed).toBe(r.sides.B.deployed);
      expect(r.sides.A.destroyed).toBeGreaterThan(0);
    }
  });

  it('Reaper intelligence assessment reflects simulation data', () => {
    const canon = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 7, fixed));
    canon.run();
    const apex = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 7, fixed));
    apex.run();
    const a = assessReapers(canon);
    const b = assessReapers(apex);
    expect(['NEGLIGIBLE', 'LOW', 'MODERATE', 'ELEVATED']).toContain(a.threatLevel);
    expect(['SEVERE', 'CRITICAL']).toContain(b.threatLevel);
    expect(b.reaperCapitalLosses).toBeGreaterThan(a.reaperCapitalLosses);
  });

  it('player orders change behaviour: retreat ends the battle by withdrawal', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 5, fixed));
    for (let i = 0; i < 200; i++) sim.step();
    sim.issueOrders('alliance-tf', { order: 'retreat' });
    const r = sim.run();
    expect(r.reason).toMatch(/withdrew|destroyed/);
    expect(sim.events.some((e) => e.type === 'order_issued')).toBe(true);
  });

  it('attack_target order focuses the fleet on the chosen ship', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 5, fixed));
    const destroyer = sim.ships.find((s) => s.classId === 'reaper_destroyer')!;
    sim.issueOrders('alliance-tf', { order: 'attack_target', targetId: destroyer.id, priority: 'reaper_destroyers' });
    for (let i = 0; i < 100; i++) sim.step();
    const mine = sim.ships.filter((s) => s.fleetId === 'alliance-tf' && s.role !== 'fighter');
    const focused = mine.filter((s) => s.targetId === destroyer.id).length;
    expect(focused / mine.length).toBeGreaterThan(0.6);
  });

  it('fighters launch from carriers and torpedoes are fired', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 3, fixed));
    for (let i = 0; i < 1800; i++) sim.step();
    expect(sim.ships.some((s) => s.role === 'fighter')).toBe(true);
    expect(sim.events.some((e) => e.type === 'fighters_launched')).toBe(true);
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.kind === 'disruptor_torpedo')).toBe(true);
  });

  it('custom battles build and run', () => {
    const cfg = buildCustomBattle({
      seed: 11,
      rulesId: 'canon_me3',
      environment: 'deep_space',
      startingDistanceKm: 60,
      sideA: { faction: 'alliance', name: 'A', formation: 'strike_wedge', counts: { alliance_dreadnought: 2, alliance_cruiser: 4, alliance_frigate: 6 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'dispersed', counts: { reaper_destroyer: 2 } },
      maxDuration: 300,
    });
    const r = new BattleSimulation(cfg).run();
    expect(['A', 'B', 'draw']).toContain(r.winner);
    expect(r.sides.A.deployed).toBe(12);
    expect(r.sides.B.deployed).toBe(2);
  });

  it('every scenario builds under every preset', () => {
    for (const s of ['battle_of_earth', 'alliance_fleet_engagement', 'prime_apex_sol_defence', 'cerberus_ascendant_harbinger']) {
      for (const p of ['canon_me3', 'prepared_galaxy', 'humanity_ascendant', 'cerberus_reformed', 'reaper_escalation', 'prime_apex', 'cerberus_ascendant']) {
        const cfg = getScenario(s).build(getPreset(p), 1, {});
        const sim = new BattleSimulation(cfg);
        for (let i = 0; i < 40; i++) sim.step();
        expect(sim.ships.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('formations', () => {
  it('assign non-overlapping slots to capital ships', () => {
    const ships = Array.from({ length: 4 }, (_, i) => ({ id: `dn${i}`, role: 'dreadnought' as const, lengthKm: 0.888 }));
    const slots = assignSlots(ships, 'line_abreast');
    const xs = ships.map((s) => slots.get(s.id)!.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(1.2);
  });
  it('rotate slots with the fleet heading', () => {
    const w = slotToWorld(v3(0, 0, 0), v3(1, 0, 0), v3(0, 0, 5));
    expect(w.x).toBeCloseTo(5);
    expect(w.z).toBeCloseTo(0);
  });
});

describe('comparison', () => {
  it('runs both timelines on the same seed and explains the differences', () => {
    const s = getScenario('alliance_fleet_engagement');
    const a = s.build(CANON_ME3, 7, fixed);
    const b = s.build(PRIME_APEX, 7, fixed);
    const report = compareBattles(a, b);
    expect(report.a.result.seed).toBe(report.b.result.seed);
    expect(report.a.result.sides.A.deployed).toBe(report.b.result.sides.A.deployed);
    expect(report.metrics.length).toBeGreaterThan(10);
    expect(report.explanation.join(' ')).toMatch(/Hyper-mass accelerators/);
  });
  it('identical rule sets yield identical results', () => {
    const s = getScenario('alliance_fleet_engagement');
    const report = compareBattles(s.build(CANON_ME3, 3, fixed), s.build(getPreset('canon_me3'), 3, fixed));
    expect(report.a.result.duration).toBe(report.b.result.duration);
    expect(report.a.result.sides.A.destroyed).toBe(report.b.result.sides.A.destroyed);
    expect(report.explanation.join(' ')).toMatch(/identical/);
  });
});

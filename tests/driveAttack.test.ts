import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { DRIVE_ATTACK, DRIVE_TIERS, corridorClear, driveBoost, planetClear } from '@/simulation/driveAttack';
import { DRIVE_TIERS as SPECIALS_DRIVE_TIERS } from '@/simulation/specials';
import type { BattleEvent, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { normaliseRules } from '@/timelines/schema';

/**
 * The Black Fleet drive attack (ADOPTION_PLAN.md §9, D9; WORK_BREAKDOWN.md T14 and §1.6.3 `tests/driveAttack.test.ts`):
 * the tiers, the scripted special (`special.driveAttack`) with and without `force`, the run itself (outcome rolled once
 * at commitment, weapons silent, a valid target throughout, the drive overload), the impact, the attempt budget, the
 * `upper` tier's collateral and failure damage, and AI-initiated runs on the purpose-built fixture (the Apex Sol
 * Defence scenario fields no Cerberus hull, so it can never produce the mechanic).
 */

interface Fixture {
  sim: BattleSimulation;
  runners: ShipState[];
  capital: ShipState;
  destroyers: ShipState[];
}

/** Crippled Cerberus cruisers (hull 0.35 through `setHullFraction`) against a Reaper capital, deep space, 30 km. */
function fixture(rulesId: string, opts: { cruisers?: number; destroyers?: number; seed?: number; mute?: boolean; cripple?: boolean } = {}): Fixture {
  const sim = new BattleSimulation(
    buildCustomBattle({
      seed: opts.seed ?? 1,
      rulesId,
      environment: 'deep_space',
      startingDistanceKm: 30,
      maxDuration: 600,
      sideA: { faction: 'cerberus', name: 'Black Fleet detachment', formation: 'line_abreast', counts: { cerberus_cruiser: opts.cruisers ?? 3 } },
      sideB: { faction: 'reaper', name: 'Harvest group', formation: 'capital_column', counts: { reaper_capital: 1, reaper_destroyer: opts.destroyers ?? 0 } },
    }),
  );
  const runners = sim.ships.filter((s) => s.classId === 'cerberus_cruiser');
  if (opts.cripple !== false) for (const s of runners) expect(sim.special.setHullFraction(s.id, 0.35)).toBe('applied');
  const capital = sim.ships.find((s) => s.classId === 'reaper_capital')!;
  const destroyers = sim.ships.filter((s) => s.classId === 'reaper_destroyer');
  if (opts.mute) {
    for (const s of sim.ships) {
      if (s.side !== 'B') continue;
      for (const w of s.weapons) w.cooldown = Infinity;
      if (s.hangar) s.hangar.remaining = 0;
    }
  }
  return { sim, runners, capital, destroyers };
}

const of = <T extends BattleEvent['type']>(sim: BattleSimulation, type: T): Extract<BattleEvent, { type: T }>[] =>
  sim.events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

/** Steps until `endsAt` of the runner's run has passed (or the battle ends). */
function stepThroughRun(sim: BattleSimulation, runner: ShipState): void {
  const end = runner.driveRun!.endsAt + 2 * SIM_DT;
  while (!sim.finished && sim.time < end) sim.step();
}

describe('drive attack tiers and gates', () => {
  it('the tiers are AP §9 and specials.ts re-exports them; canon and every non-Apex preset are off', () => {
    expect(DRIVE_TIERS).toEqual({
      rare: { window: 40, completion: 0.25, maxAttempts: 3, collateralKm: 0, failHullDamage: 0 },
      upper: { window: 30, completion: 0.35, maxAttempts: 5, collateralKm: 1.5, failHullDamage: 0.3 },
    });
    expect(SPECIALS_DRIVE_TIERS).toBe(DRIVE_TIERS);
    expect(getPreset('canon_me3').special.driveAttacks).toBe('off');
    expect(getPreset('cerberus_ascendant').special.driveAttacks).toBe('off');
    expect(getPreset('prime_apex').special.driveAttacks).toBe('rare');
    expect(getPreset('apex_legacy').special.driveAttacks).toBe('upper');
    // A v0.11 custom rule set normalised at load reaches the tier table with a defined key (WB §1.6.3 timelines row).
    const legacy = normaliseRules({ ...getPreset('prime_apex'), special: { ...getPreset('prime_apex').special, driveAttacks: undefined as never } });
    expect(legacy.special.driveAttacks).toBe('off');
    expect(DRIVE_TIERS[getPreset('apex_legacy').special.driveAttacks as 'upper']).toBeDefined();
  });

  it("canon: special.driveAttack without force is skipped (driveAttacks 'off') and the AI never commits", () => {
    const { sim, runners, capital } = fixture('canon_me3', { mute: true });
    expect(sim.special.driveAttack(runners[0].id, capital.id)).toBe('skipped');
    sim.skipTo(30);
    expect(of(sim, 'drive_run_started')).toHaveLength(0);
    expect(sim.ships.some((s) => s.driveRun !== undefined)).toBe(false);
  });

  it('refuses a healthy hull, a hull without a working drive, a non-Cerberus hull and a target that is not a Reaper capital', () => {
    const healthy = fixture('prime_apex', { cripple: false, mute: true, destroyers: 1 });
    expect(healthy.sim.special.driveAttack(healthy.runners[0].id, healthy.capital.id)).toBe('skipped');
    const f = fixture('prime_apex', { mute: true, destroyers: 1 });
    expect(f.sim.special.driveAttack(f.runners[0].id, f.destroyers[0].id)).toBe('skipped');
    f.runners[1].subsystems.engines = DRIVE_ATTACK.enginesAtLeast - 0.01;
    expect(f.sim.special.driveAttack(f.runners[1].id, f.capital.id)).toBe('skipped');
    expect(f.sim.special.driveAttack(f.capital.id, f.runners[0].id)).toBe('skipped');
    expect(f.sim.special.driveAttack('nobody', f.capital.id)).toBe('skipped');
    expect(of(f.sim, 'drive_run_started')).toHaveLength(0);
  });

  it('the corridor closes for a friendly hull ahead on the run line, not for one alongside; the planet clearance holds in the battlespace', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true });
    const [runner, other, third] = runners;
    const pending = () => false;
    third.pos = { x: 30, y: 0, z: -6 }; // out of the way
    runner.pos = { x: 0, y: 0, z: -6 };
    capital.pos = { x: 0, y: 0, z: 6 };
    other.pos = { x: 1, y: 0, z: -5.5 }; // alongside the runner: beside the run, not in it
    expect(corridorClear(sim.ships, runner, capital, pending)).toBe(true);
    other.pos = { x: 1, y: 0, z: 0 }; // 1 km off the line, halfway to the target
    expect(corridorClear(sim.ships, runner, capital, pending)).toBe(false);
    other.pos = { x: 0.5, y: 0, z: 7 }; // in the impact zone just past the target
    expect(corridorClear(sim.ships, runner, capital, pending)).toBe(false);
    other.pos = { x: 4, y: 0, z: 0 }; // well clear
    expect(corridorClear(sim.ships, runner, capital, pending)).toBe(true);
    // An enemy hull never closes the corridor: the corridor is about friendlies.
    expect(planetClear('earth_orbit', { x: 0, y: 0, z: 0 })).toBe(true);
    expect(planetClear('earth_orbit', { x: 0, y: -2680, z: 0 })).toBe(false);
    expect(planetClear('deep_space', { x: 0, y: -2680, z: 0 })).toBe(true);
  });
});

describe('a committed run (Apex core)', () => {
  it('an eligible crippled cruiser starts a run: the outcome is rolled once, at commitment, from sim.rng', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true });
    const runner = runners[0];
    // A twin of the generator: the next draw depends only on the state modulo 2^32, and one draw advances it by one step.
    const s0 = sim.rng.getState();
    const expected = new Rng(s0 >>> 0).chance(DRIVE_TIERS.rare.completion);
    expect(sim.special.driveAttack(runner.id, capital.id, { beatId: 'drive' })).toBe('applied');
    expect(sim.rng.getState() - s0).toBe(0x6d2b79f5); // exactly one draw
    expect(runner.driveRun).toEqual({ targetId: capital.id, startedAt: 0, endsAt: DRIVE_TIERS.rare.window, completes: expected, tier: 'rare' });
    const started = of(sim, 'drive_run_started');
    expect(started).toEqual([{ t: 0, type: 'drive_run_started', runnerId: runner.id, targetId: capital.id, endsAt: 40 }]);
    expect(of(sim, 'scripted_event').some((e) => e.special === 'drive_attack' && !e.forced && e.beatId === 'drive')).toBe(true);
    // The run cannot be started twice, and the outcome does not change while it lasts.
    expect(sim.special.driveAttack(runner.id, capital.id)).toBe('skipped');
    stepThroughRun(sim, runner);
    const impact = of(sim, 'drive_run_impact');
    expect(impact).toHaveLength(1);
    expect(impact[0].success).toBe(expected);
    expect(runner.driveRun?.completes).toBe(expected);
    expect(runner.alive).toBe(false);
    expect(capital.alive).toBe(!expected);
  });

  it('during the run the hull is a valid target, its weapons are silent, the drive overload ramps 1 → 4 and the paced run ends on the target', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true, cruisers: 2 });
    const [runner, wingman] = runners;
    wingman.hull = wingman.maxHull; // healthy: fights normally, never runs
    capital.maxSpeed = 0; // a stationary target, so the run itself has to cover the 10 km
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'intercept', window: 20 })).toBe('applied');
    let peak = 0;
    let closest = Infinity;
    while (sim.time < runner.driveRun!.endsAt - 2 * SIM_DT) {
      sim.step();
      if (sim.time > 5 && sim.time < 6) {
        expect(sim.enemiesOfShip(capital)).toContain(runner);
        expect(sim.enemyCombatants('B')).toContain(runner);
        expect(sim.grid.queryRadius(runner.pos, 0.01, capital)).toContain(runner);
      }
      peak = Math.max(peak, Math.hypot(runner.vel.x, runner.vel.y, runner.vel.z));
      closest = Math.min(closest, Math.hypot(runner.pos.x - capital.pos.x, runner.pos.y - capital.pos.y, runner.pos.z - capital.pos.z));
    }
    expect(of(sim, 'weapon_fired').filter((e) => e.shipId === runner.id)).toHaveLength(0);
    expect(of(sim, 'weapon_fired').filter((e) => e.shipId === wingman.id).length).toBeGreaterThan(0);
    expect(driveBoost(runner.driveRun!, runner.driveRun!.startedAt)).toBe(1);
    expect(driveBoost(runner.driveRun!, runner.driveRun!.endsAt)).toBe(DRIVE_ATTACK.boostMax);
    expect(peak).toBeGreaterThan(1.05 * runner.maxSpeed); // faster than the un-overloaded drive allows
    expect(closest).toBeLessThan(capital.radiusKm); // on the target when the window closes
    stepThroughRun(sim, runner);
    expect(of(sim, 'drive_run_impact')).toHaveLength(1);
  });

  it('forced success destroys the target (cause drive_attack, killed by the runner), then the runner', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true });
    const runner = runners[0];
    const before = sim.rng.getState();
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'success', window: 14, beatId: 'drive' })).toBe('applied');
    expect(sim.rng.getState()).toBe(before); // a forced outcome draws nothing
    expect(runner.driveRun?.endsAt).toBe(14);
    expect(of(sim, 'scripted_event').some((e) => e.special === 'drive_attack' && e.forced)).toBe(true);
    stepThroughRun(sim, runner);
    const seq = sim.events.filter((e) => e.type === 'drive_run_impact' || (e.type === 'ship_destroyed' && (e.shipId === runner.id || e.shipId === capital.id)));
    expect(seq.map((e) => e.type)).toEqual(['drive_run_impact', 'ship_destroyed', 'ship_destroyed']);
    const [impact, targetDown, runnerDown] = seq;
    if (impact.type !== 'drive_run_impact' || targetDown.type !== 'ship_destroyed' || runnerDown.type !== 'ship_destroyed') throw new Error('unreachable');
    expect(impact).toMatchObject({ runnerId: runner.id, targetId: capital.id, success: true });
    expect(impact.t).toBeCloseTo(14, 6);
    expect(Math.hypot(impact.dir.x, impact.dir.y, impact.dir.z)).toBeCloseTo(1, 6);
    expect(targetDown).toMatchObject({ shipId: capital.id, cause: 'drive_attack', killerId: runner.id });
    expect(runnerDown).toMatchObject({ shipId: runner.id, cause: 'drive_attack' });
    expect(runnerDown.killerId).toBeUndefined();
  });

  it('forced intercept destroys the runner alone; under the rare tier the target is untouched', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true });
    const runner = runners[0];
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'intercept', window: 10 })).toBe('applied');
    stepThroughRun(sim, runner);
    expect(of(sim, 'drive_run_impact')).toMatchObject([{ success: false }]);
    expect(runner.alive).toBe(false);
    expect(capital.alive).toBe(true);
    expect(capital.hull).toBe(capital.maxHull);
    expect(of(sim, 'ship_destroyed').filter((e) => e.cause === 'drive_attack').map((e) => e.shipId)).toEqual([runner.id]);
  });

  it('a runner destroyed before endsAt is intercepted: no impact, the target survives', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true });
    const runner = runners[0];
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'success', window: 20 })).toBe('applied');
    sim.skipTo(8);
    expect(sim.special.destroy(runner.id, { killerId: capital.id, cause: 'reaper_beam' })).toBe('applied');
    sim.skipTo(25);
    expect(of(sim, 'drive_run_impact')).toHaveLength(0);
    expect(capital.alive).toBe(true);
    expect(of(sim, 'ship_destroyed').find((e) => e.shipId === runner.id)?.cause).toBe('reaper_beam');
  });

  it('a run whose target dies first is aborted: the hull fights on, its attempt spent', () => {
    const { sim, runners, capital } = fixture('prime_apex', { mute: true, cruisers: 1 });
    const runner = runners[0];
    expect(sim.special.driveAttack(runner.id, capital.id)).toBe('applied');
    sim.skipTo(5);
    sim.special.destroy(capital.id, { cause: 'scripted' });
    sim.step();
    expect(of(sim, 'drive_run_aborted')).toEqual([expect.objectContaining({ runnerId: runner.id, targetId: capital.id, reason: 'target_lost' })]);
    expect(runner.driveRun).toBeUndefined();
    expect(runner.alive).toBe(true);
    expect(of(sim, 'drive_run_impact')).toHaveLength(0);
  });
});

describe('the attempt budget and the upper tier', () => {
  it.each([
    ['prime_apex', 3],
    ['apex_legacy', 5],
  ] as const)('%s: at most %d runs per battle', (rulesId, cap) => {
    const { sim, runners, capital } = fixture(rulesId, { mute: true, cruisers: 6 });
    const results = runners.map((r) => sim.special.driveAttack(r.id, capital.id));
    expect(results).toEqual(runners.map((_, i) => (i < cap ? 'applied' : 'skipped')));
    expect(of(sim, 'drive_run_started')).toHaveLength(cap);
    // The AI does not start another one either.
    sim.skipTo(8);
    expect(of(sim, 'drive_run_started')).toHaveLength(cap);
  });

  /** A crippled cruiser and a static Reaper group: the capital, one destroyer 1 km from it and one 3 km from it. */
  function collateral(rulesId: string) {
    const f = fixture(rulesId, { mute: true, cruisers: 1, destroyers: 2 });
    const [near, far] = f.destroyers;
    for (const s of [f.capital, near, far]) s.maxSpeed = 0;
    f.capital.pos = { x: 0, y: 0, z: 6 };
    near.pos = { x: 1, y: 0, z: 6 };
    far.pos = { x: 3, y: 0, z: 6 };
    return { ...f, runner: f.runners[0], near, far };
  }

  it('upper: a completed run also destroys the Reaper destroyers within 1.5 km of the impact', () => {
    const { sim, runner, capital, near, far } = collateral('apex_legacy');
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'success' })).toBe('applied');
    expect(runner.driveRun?.endsAt).toBe(DRIVE_TIERS.upper.window);
    stepThroughRun(sim, runner);
    expect(capital.alive).toBe(false);
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
    expect(of(sim, 'ship_destroyed').find((e) => e.shipId === near.id)).toMatchObject({ cause: 'drive_attack', killerId: runner.id });
  });

  it('rare: no collateral', () => {
    const { sim, runner, capital, near } = collateral('prime_apex');
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'success' })).toBe('applied');
    stepThroughRun(sim, runner);
    expect(capital.alive).toBe(false);
    expect(near.alive).toBe(true);
  });

  it('upper: a failed run puts 30 % of the target’s hull into it', () => {
    const { sim, runner, capital } = collateral('apex_legacy');
    expect(sim.special.driveAttack(runner.id, capital.id, { force: 'intercept' })).toBe('applied');
    stepThroughRun(sim, runner);
    expect(runner.alive).toBe(false);
    expect(capital.alive).toBe(true);
    expect(capital.hull).toBeCloseTo(capital.maxHull * (1 - DRIVE_TIERS.upper.failHullDamage), 6);
  });
});

describe('AI-initiated runs (purpose-built fixture: 3 crippled Cerberus cruisers vs 1 Reaper capital, Apex core, deep space 30 km)', () => {
  const started: number[] = [];
  it.each([1, 2, 3, 4, 5, 6])('seed %d: 120 s', (seed) => {
    const { sim } = fixture('prime_apex', { seed });
    while (!sim.finished && sim.time < 120) sim.step();
    const runs = of(sim, 'drive_run_started');
    started.push(runs.length);
    expect(runs.length).toBeLessThanOrEqual(DRIVE_TIERS.rare.maxAttempts);
    // Every run is either resolved at its time or ended by the runner's destruction (an interception) or an abort.
    for (const r of runs) {
      const runner = sim.getShip(r.runnerId)!;
      const impact = of(sim, 'drive_run_impact').find((e) => e.runnerId === r.runnerId);
      const aborted = of(sim, 'drive_run_aborted').some((e) => e.runnerId === r.runnerId);
      if (impact) expect(impact.t).toBeCloseTo(r.endsAt, 6);
      else expect(!runner.alive || aborted || sim.time < r.endsAt).toBe(true);
    }
  });
  it('at least one AI-initiated drive_run_started across the six seeds', () => {
    expect(started).toHaveLength(6);
    expect(started.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
  });
  it('replays identically', () => {
    const run = () => {
      const { sim } = fixture('prime_apex', { seed: 3 });
      while (!sim.finished && sim.time < 60) sim.step();
      return JSON.stringify(sim.events);
    };
    const a = run();
    expect(a).toContain('drive_run_started');
    expect(run()).toBe(a);
  });
});

describe('integration smoke', () => {
  it("the Apex Final Battle with cerberus 'allied' builds and steps 60 s with the mechanic enabled", () => {
    const config = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default', cerberus: 'allied' });
    expect(config.rules.special.driveAttacks).toBe('rare');
    const sim = new BattleSimulation(config);
    sim.skipTo(60);
    expect(sim.time >= 60 - 1e-9 || sim.finished).toBe(true);
    // Every run the AI started is a Cerberus hull on an enemy Reaper capital.
    for (const r of of(sim, 'drive_run_started')) {
      expect(sim.getShip(r.runnerId)?.faction).toBe('cerberus');
      expect(sim.getShip(r.targetId)?.role).toBe('reaper_capital');
    }
  }, 120_000);
});

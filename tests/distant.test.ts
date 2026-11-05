import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { APEX_REAPER_COMBAT_AT_SOL, APEX_SCALE, AU_SCENARIO_SUFFIX } from '@/data/apexScale';
import { buildScenario } from '@/scenarios';
import { CANON_DISTANT_FACTOR, apexDistantGroups, canonDistantGroups, distantLayerFor, remainderGroups, simulatedBySide } from '@/scenarios/distantGroups';
import { BattleSimulation } from '@/simulation/battle';
import { DISTANT, DistantLayer, STATISTICAL_RESOLVER, distantCaptions, distantResultLine, distantSummary, type DistantHost, type DistantResolver } from '@/simulation/distant';
import type { BattleConfig, BattleEvent, ShipState } from '@/simulation/types';
import { cloneRules } from '@/timelines/rules';
import { getPreset } from '@/timelines/presets';
import { runSimAsync } from './support/async';

/**
 * The distant engagement layer (ADOPTION_PLAN.md §13.3, §4.4, §21.4; WORK_BREAKDOWN.md T15 and §1.6.3
 * `tests/distant.test.ts`): isolation from the real battle (event log minus `distant_*` and the result identical with
 * the layer on and off), monotone counts, the first-loss gate, the captions (Apex: the AU suffix; canon: no digit),
 * determinism, the group builders and the resolver seam.
 */

const isDistant = (e: BattleEvent): boolean => e.type === 'distant_update' || e.type === 'distant_group_broken';
const realLog = (sim: BattleSimulation): string => JSON.stringify(sim.events.filter((e) => !isDistant(e)));

/** The same scenario config with the layer of its rule set attached (`distantLayerFor`). */
function withLayer(config: BattleConfig): BattleConfig {
  return { ...config, distant: distantLayerFor(config.rules, config.fleets) };
}
/** The same config with no layer at all. */
function withoutLayer(config: BattleConfig): BattleConfig {
  const { distant: _unused, ...rest } = config;
  void _unused;
  return rest;
}

describe('isolation: the real battle is bit-identical with the layer on and off', () => {
  it.each([
    ['alliance_fleet_engagement', 'prime_apex', 7],
    ['battle_of_earth', 'canon_me3', 42],
  ] as const)('%s %s seed %d: event log minus distant_* and BattleResult identical', async (scenario, rules, seed) => {
    const base = buildScenario(scenario, rules, seed, { fleet_scaling: 'fixed' });
    const on = new BattleSimulation(withLayer(base));
    const off = new BattleSimulation(withoutLayer(base));
    expect(on.distant).toBeDefined();
    expect(off.distant).toBeUndefined();
    const limit = scenario === 'battle_of_earth' ? 150 : undefined;
    await runSimAsync(on, { untilTime: limit });
    await runSimAsync(off, { untilTime: limit });
    expect(on.events.some(isDistant)).toBe(true);
    expect(realLog(on)).toBe(realLog(off));
    expect(on.time).toBe(off.time);
    if (on.finished) expect(JSON.stringify(on.result)).toBe(JSON.stringify(off.result));
    // Losses happened in the layer while the real battle went on.
    expect(distantSummary(on).some((r) => r.losses > 0)).toBe(true);
  }, 120_000);
});

describe('the layer over a battle', () => {
  /** Runs a scenario with its layer, sampling the state every step. */
  async function sampled(scenario: string, rules: string, seed: number, until: number) {
    const sim = new BattleSimulation(withLayer(buildScenario(scenario, rules, seed, { fleet_scaling: 'fixed' })));
    const remainingSeries: number[][] = [];
    let firstDistantLoss: number | undefined;
    while (!sim.finished && sim.time < until) {
      sim.step();
      const rem = sim.distant!.groups.map((g) => g.remaining);
      remainingSeries.push(rem);
      if (firstDistantLoss === undefined && sim.distant!.groups.some((g) => g.losses > 0)) firstDistantLoss = sim.time;
      if (sim.tick % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return { sim, remainingSeries, firstDistantLoss };
  }

  it('counts never rise and never go negative; no loss before the first real ship_destroyed or firstLossAfter; an update every 5 s', async () => {
    const { sim, remainingSeries, firstDistantLoss } = await sampled('alliance_fleet_engagement', 'prime_apex', 8, 140);
    for (let i = 1; i < remainingSeries.length; i++) {
      remainingSeries[i].forEach((r, g) => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(remainingSeries[i - 1][g]);
      });
    }
    const firstReal = sim.events.find((e) => e.type === 'ship_destroyed')?.t ?? Infinity;
    const gate = Math.min(firstReal, sim.config.distant!.firstLossAfter ?? DISTANT.firstLossAfter);
    expect(firstDistantLoss).toBeDefined();
    expect(firstDistantLoss!).toBeGreaterThanOrEqual(gate - 1e-9);
    const updates = sim.events.filter((e) => e.type === 'distant_update');
    expect(updates.length).toBeGreaterThanOrEqual(Math.floor(sim.time / DISTANT.updateEvery) - 1);
    for (let i = 1; i < updates.length - 1; i++) expect(updates[i].t - updates[i - 1].t).toBeCloseTo(DISTANT.updateEvery, 6);
    // losses + remaining = count, group by group.
    sim.config.distant!.groups.forEach((g, i) => expect(sim.distant!.groups[i].remaining + sim.distant!.groups[i].losses).toBe(g.count));
  }, 120_000);

  it('with no real loss the layer waits for firstLossAfter', () => {
    // Two fleets 400 km apart: nobody is in reach for minutes, so only the timer opens the gate.
    const config = withLayer(buildScenario('alliance_fleet_engagement', 'canon_me3', 1, { fleet_scaling: 'fixed' }));
    for (const f of config.fleets) f.position = { x: f.position.x, y: f.position.y, z: f.side === 'A' ? -500 : 500 };
    config.distant = { ...config.distant!, firstLossAfter: 20 };
    const sim = new BattleSimulation(config);
    let first: number | undefined;
    while (sim.time < 60) {
      sim.step();
      if (first === undefined && sim.distant!.groups.some((g) => g.losses > 0)) first = sim.time;
    }
    expect(sim.events.some((e) => e.type === 'ship_destroyed')).toBe(false);
    expect(first).toBeDefined();
    expect(first!).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it('two runs with the layer on are identical', () => {
    const run = () => {
      const sim = new BattleSimulation(withLayer(buildScenario('alliance_fleet_engagement', 'prime_apex', 9, { fleet_scaling: 'fixed' })));
      sim.skipTo(60);
      return JSON.stringify(sim.events) + JSON.stringify(sim.distant);
    };
    const a = run();
    expect(a).toContain('distant_update');
    expect(run()).toBe(a);
  }, 60_000);
});

describe('captions and summaries', () => {
  it('Apex captions and the results line end in · AU SCENARIO VALUE; the counts are the AU figures', () => {
    const sim = new BattleSimulation(withLayer(buildScenario('alliance_fleet_engagement', 'prime_apex', 7, { fleet_scaling: 'fixed' })));
    expect(sim.config.distant!.captions).toBe('apex');
    const captions = distantCaptions(sim);
    expect(captions.length).toBeGreaterThan(0);
    for (const c of captions) expect(c.endsWith(AU_SCENARIO_SUFFIX)).toBe(true);
    expect(captions[0]).toContain('38,420 WARSHIPS COMMITTED TO SOL');
    expect(captions[0]).toContain(`${sim.simulatedHullCount('A')} SIMULATED`);
    expect(distantResultLine(sim)!.endsWith(AU_SCENARIO_SUFFIX)).toBe(true);
    expect(distantSummary(sim).every((r) => r.captioned)).toBe(true);
  });

  it('canon configs produce no digit-bearing distant caption, and the counter is percentages', () => {
    const sim = new BattleSimulation(withLayer(buildScenario('battle_of_earth', 'canon_me3', 42)));
    expect(sim.config.distant!.captions).toBe('canon');
    const captions = distantCaptions(sim);
    expect(captions.length).toBeGreaterThan(0);
    for (const c of captions) expect(c).not.toMatch(/\d/);
    expect(captions[0]).toContain('REAPER ARMADA');
    sim.skipTo(5);
    const rows = distantSummary(sim);
    expect(rows.map((r) => r.side)).toEqual(['A', 'B']);
    for (const r of rows) {
      expect(r.captioned).toBe(false);
      expect(r.remainingPercent).toBeCloseTo(100, 6);
    }
    expect(distantResultLine(sim)).toBe('DISTANT ENGAGEMENT (STATISTICAL) · A 100 % · B 100 %');
    // No layer, no caption, no summary.
    const bare = new BattleSimulation(withoutLayer(buildScenario('battle_of_earth', 'canon_me3', 42)));
    expect(distantCaptions(bare)).toEqual([]);
    expect(distantSummary(bare)).toEqual([]);
    expect(distantResultLine(bare)).toBeUndefined();
  });
});

describe('group builders', () => {
  it('apexDistantGroups: every coalition command minus its simulated hulls, the Reaper forces committed to Sol minus the simulated Reapers', () => {
    const config = buildScenario('alliance_fleet_engagement', 'prime_apex', 7, { fleet_scaling: 'fixed' });
    const sim = simulatedBySide(config.fleets);
    const groups = apexDistantGroups(sim);
    const a = groups.filter((g) => g.side === 'A');
    const b = groups.filter((g) => g.side === 'B');
    expect(a).toHaveLength(APEX_SCALE.coalition.byCommand.length);
    expect(a.reduce((s, g) => s + g.count, 0)).toBe(APEX_SCALE.coalition.mobileWarships - (sim.A.alliance ?? 0));
    expect(a.find((g) => g.id === 'apex-alliance')!.count).toBe(12800 - (sim.A.alliance ?? 0));
    expect(b.every((g) => g.faction === 'reaper')).toBe(true);
    expect(b.reduce((s, g) => s + g.count, 0)).toBe(APEX_REAPER_COMBAT_AT_SOL - (sim.B.reaper ?? 0));
    for (const g of groups) {
      expect(g.count).toBeGreaterThanOrEqual(0);
      expect(g.classMix.capital + g.classMix.heavy + g.classMix.line + g.classMix.light).toBeCloseTo(1, 9);
      expect(g.distanceKm).toBeGreaterThanOrEqual(60);
      expect(g.distanceKm).toBeLessThanOrEqual(160);
      // Behind the own line: side A in the rear half (bearing 110–250°), side B in the front half.
      const rear = g.bearingDeg > 90 && g.bearingDeg < 270;
      expect(rear).toBe(g.side === 'A');
    }
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    // More simulated hulls than the figure never yields a negative count.
    expect(apexDistantGroups({ A: { alliance: 99999 }, B: { reaper: 99999 } }).every((g) => g.count >= 0)).toBe(true);
  });

  it('canonDistantGroups: 12 × the simulated hulls of each real fleet; static platform fleets have no echelon', () => {
    const config = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' });
    const groups = canonDistantGroups(config.fleets);
    for (const g of groups) {
      const f = config.fleets.find((x) => `echelon-${x.id}` === g.id)!;
      const hulls = f.ships.reduce((s, x) => s + x.count, 0);
      expect(g.count).toBe(CANON_DISTANT_FACTOR * hulls);
      expect(g.side).toBe(f.side);
    }
    expect(groups.length).toBeGreaterThan(0);
    expect(canonDistantGroups([{ ...config.fleets[0], static: true }])).toEqual([]);
  });

  it('remainderGroups: total − simulated, nothing when nothing was compressed away', () => {
    const [g] = remainderGroups('A', 'alliance', 'Alliance Fifth Fleet', 1500, 400, { alliance_dreadnought: 40, alliance_cruiser: 400, alliance_frigate: 1060 });
    expect(g.count).toBe(1100);
    expect(g.side).toBe('A');
    expect(g.classMix.light).toBeGreaterThan(g.classMix.capital);
    expect(remainderGroups('B', 'reaper', 'Harvest group', 40, 40, { reaper_capital: 10 })).toEqual([]);
  });

  it('the Apex figures follow the preset id, never the Apex flags (isApexScenario, not isApexRules)', () => {
    const fleets = buildScenario('alliance_fleet_engagement', 'prime_apex', 7).fleets;
    expect(distantLayerFor(getPreset('prime_apex'), fleets).captions).toBe('apex');
    expect(distantLayerFor(getPreset('apex_legacy'), fleets).captions).toBe('apex');
    expect(distantLayerFor(getPreset('canon_me3'), fleets).captions).toBe('canon');
    const lookalike = cloneRules(getPreset('prime_apex'));
    lookalike.id = 'my_apex_copy';
    const layer = distantLayerFor(lookalike, fleets);
    expect(layer.captions).toBe('canon');
    expect(layer.groups.every((g) => g.id.startsWith('echelon-'))).toBe(true);
  });
});

describe('the resolver (statistical model and seam)', () => {
  /** A minimal host: `n` live side-A hulls against `k` side-B hulls with the given points, plus synthetic events. */
  interface TestHost extends DistantHost {
    time: number;
    events: BattleEvent[];
  }
  function host(opts: { aPoints: number; bPoints: number; events?: BattleEvent[] }): TestHost {
    const ship = (id: string, side: 'A' | 'B', pointValue: number): ShipState => ({ id, side, role: 'cruiser', alive: true, escaped: false, pointValue }) as unknown as ShipState;
    const h = {
      time: 0,
      ships: [ship('a1', 'A', opts.aPoints), ship('a2', 'A', 0), ship('b1', 'B', opts.bPoints)],
      events: opts.events ?? [],
      pending: () => false,
      emit(e: BattleEvent) {
        this.events.push(e);
      },
    };
    return h;
  }

  it('λ = 0.0009 × pressure + 0.6 × realLoss / 20 with stochastic rounding: a group under pressure 3 and total real losses breaks, once', () => {
    const groups = [{ id: 'g', side: 'A' as const, faction: 'alliance' as const, label: 'g', count: 1000, bearingDeg: 180, distanceKm: 100, spreadKm: 10, classMix: { capital: 0, heavy: 0, line: 1, light: 0 } }];
    // Side A is outgunned 3:1 and lost both of its two deployed hulls in the window: λ = 0.0027 + 0.03 per second.
    const h = host({ aPoints: 100, bPoints: 900, events: [{ t: 0, type: 'ship_destroyed', shipId: 'a1', classId: 'x', faction: 'alliance', side: 'A', name: 'x', pos: { x: 0, y: 0, z: 0 }, role: 'cruiser', cause: 'kinetic' }] });
    h.events.push({ ...(h.events[0] as Extract<BattleEvent, { type: 'ship_destroyed' }>), shipId: 'a2' });
    const layer = new DistantLayer({ enabled: true, groups, captions: 'none', firstLossAfter: 30 }, new Rng(5));
    const dt = 0.05;
    let prev = 1000;
    for (let i = 1; i <= 400; i++) {
      h.time = i * dt;
      layer.advance(h, dt);
      expect(layer.state.groups[0].remaining).toBeLessThanOrEqual(prev);
      prev = layer.state.groups[0].remaining;
    }
    // Both losses stay inside the 20 s window for the whole run: λ = 0.0009 × 3 + 0.6 × (2 / 2) / 20 throughout, so
    // the expected count after 20 s is 1,000 × e^(−20λ) ≈ 520 (stochastic rounding keeps it within a few per cent).
    const lambda = 0.0009 * 3 + (0.6 * (2 / 2)) / 20;
    const expected = 1000 * Math.exp(-lambda * 20);
    expect(Math.abs(layer.state.groups[0].remaining - expected)).toBeLessThan(0.08 * expected);
    expect(layer.state.groups[0].losses + layer.state.groups[0].remaining).toBe(1000);
    // Drive it below 10 %: one broken event, never two.
    const heavy = host({ aPoints: 1, bPoints: 900 });
    const layer2 = new DistantLayer({ enabled: true, groups, captions: 'none', firstLossAfter: 0 }, new Rng(9));
    for (let i = 1; i <= 40000 && layer2.state.groups[0].remaining >= 100; i++) {
      heavy.time = i * dt;
      heavy.events.push({ t: heavy.time, type: 'ship_destroyed', shipId: 'a1', classId: 'x', faction: 'alliance', side: 'A', name: 'x', pos: { x: 0, y: 0, z: 0 }, role: 'cruiser', cause: 'kinetic' });
      layer2.advance(heavy, dt);
    }
    for (let i = 0; i < 100; i++) {
      heavy.time += dt;
      layer2.advance(heavy, dt);
    }
    expect(heavy.events.filter((e) => e.type === 'distant_group_broken')).toHaveLength(1);
  });

  it('the resolver is a seam: a different resolver drives the same layer and the statistical model is the default', () => {
    const groups = [{ id: 'g', side: 'B' as const, faction: 'reaper' as const, label: 'g', count: 50, bearingDeg: 0, distanceKm: 100, spreadKm: 10, classMix: { capital: 0, heavy: 0, line: 1, light: 0 } }];
    const frozen: DistantResolver = { id: 'frozen', advance: () => undefined };
    const h = host({ aPoints: 900, bPoints: 1 });
    const layer = new DistantLayer({ enabled: true, groups, captions: 'none', firstLossAfter: 0 }, new Rng(1), frozen);
    for (let i = 1; i <= 200; i++) {
      h.time = i * 0.05;
      layer.advance(h, 0.05);
    }
    expect(layer.state.groups[0].remaining).toBe(50);
    expect(STATISTICAL_RESOLVER.id).toBe('statistical');
  });
});

import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { assessReapers } from '@/simulation/reaperIntel';

/**
 * The Reaper assessment on the results screen must agree with the result.
 *
 * Owner's report on the Codex build, 13 Nov 2026: after a battle in which all 8,652 allied warships were destroyed
 * and 15 of 1,500 Sovereigns lost, the report concluded "Organic fleets capable of defeating harvest forces in open
 * engagement." This engine had the same fault: the threat score added 0.4 for every capital lost, whatever the
 * number committed (fifteen scored 6, where 3.2 is CRITICAL), and the conclusion was read off that score alone.
 */
describe('Reaper assessment', () => {
  /** A harvest fleet of 1,500 Sovereigns that has just destroyed everything sent against it, at the cost of `lost`. */
  const afterVictory = (lost: number) => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 45, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 120, maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Allied fleet', formation: 'line_abreast', counts: { alliance_dreadnought: 4, alliance_cruiser: 8 } },
      sideB: { faction: 'reaper', name: 'Harvest fleet', formation: 'strike_wedge', counts: { reaper_capital: 1500 } } }));
    const capitals = sim.ships.filter(s => s.role === 'reaper_capital');
    for (const ship of capitals.slice(0, lost)) { ship.alive = false; ship.hull = 0; }
    for (const ship of sim.ships) if (ship.side === 'A') { ship.alive = false; ship.hull = 0; ship.stats.shotsFired = 120; ship.stats.damageDealt = 9000; }
    sim.step();
    return sim;
  };

  it('fifteen Sovereigns lost of fifteen hundred, and every allied ship destroyed, is not a critical threat', () => {
    const sim = afterVictory(15);
    expect(sim.finished).toBe(true);
    const reaperSide = sim.ships.find(s => s.faction === 'reaper')!.side;
    expect(sim.result!.winner).toBe(reaperSide);
    const report = assessReapers(sim);
    expect(report.reaperCapitalLosses).toBe(15);
    expect(report.organicFleetStrength).toBe(0);
    // Was CRITICAL, "Organic fleets capable of defeating harvest forces in open engagement", "Harvest of this
    // system: cannot be completed with committed forces".
    expect(['NEGLIGIBLE', 'LOW']).toContain(report.threatLevel);
    expect(report.projectedResistance).toBe('Organic fleet destroyed. No resistance remains in this engagement.');
    expect(report.harvestCompletionEstimate).toBe('Harvest of this system: proceeding.');
    expect(report.headline).toBe('CAPITAL UNIT LOSSES RECORDED. ATTRITION WITHIN COMMITTED RESERVES.');
    expect(report.lines).toContain('Engagement concluded. Resistance eliminated.');
  }, 120_000);

  it('a victory that cost the harvest fleet a third of its capitals says so, and is still a victory', () => {
    const report = assessReapers(afterVictory(500));
    expect(['ELEVATED', 'SEVERE', 'CRITICAL']).toContain(report.threatLevel);
    expect(report.headline).toBe('CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS.');
    expect(report.projectedResistance).toBe('Organic fleet destroyed at a cost above projections. No resistance remains in this engagement.');
    expect(report.harvestCompletionEstimate).toBe('Harvest of this system: proceeding. Replacement of lost units advisable.');
  }, 120_000);
});

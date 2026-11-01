import { describe, expect, it } from 'vitest';
import { buildCustomBattle, countsForFaction } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';

const base = {
  seed: 5,
  rulesId: 'canon_me3',
  environment: 'deep_space' as const,
  startingDistanceKm: 70,
  sideA: { faction: 'alliance' as const, name: 'Fifth Fleet', formation: 'line_abreast' as const, counts: { alliance_dreadnought: 2, alliance_cruiser: 4 } },
  sideB: { faction: 'turian' as const, name: 'Hierarchy group', formation: 'line_abreast' as const, counts: { turian_dreadnought: 2, turian_cruiser: 4 } },
};

describe('custom battles with united fleets', () => {
  it('a stale Reaper roster never spawns Reapers in a turian reinforcement wave', () => {
    const cfg = buildCustomBattle({ ...base, reinforcementTime: 60, reinforcementCounts: { reaper_capital: 2, reaper_destroyer: 4, turian_frigate: 6 } });
    const wave = cfg.fleets.find((f) => f.id === 'custom-b-reinforcements')!;
    expect(wave.faction).toBe('turian');
    expect(wave.ships.map((s) => s.classId)).toEqual(['turian_frigate']);
    expect(wave.arrivalTime).toBe(60);
    expect(countsForFaction({ reaper_capital: 2, alliance_frigate: 3 }, 'alliance')).toEqual({ alliance_frigate: 3 });
  });

  it('reinforcements can be a different faction from side B', () => {
    const cfg = buildCustomBattle({ ...base, reinforcementTime: 30, reinforcementFaction: 'reaper', reinforcementCounts: { reaper_destroyer: 3 } });
    const wave = cfg.fleets.find((f) => f.id === 'custom-b-reinforcements')!;
    expect(wave.faction).toBe('reaper');
    expect(wave.name).toMatch(/^Reapers? reinforcements$/);
  });

  it('multiple factions fight under one side and the battle runs', () => {
    const cfg = buildCustomBattle({
      ...base,
      sideB: { faction: 'reaper', name: 'Harvest group', formation: 'strike_wedge', counts: { reaper_capital: 2, reaper_destroyer: 6 } },
      extraA: [
        { faction: 'turian', name: 'Hierarchy wing', formation: 'line_abreast', counts: { turian_cruiser: 6 } },
        { faction: 'geth', name: 'Geth wing', formation: 'strike_wedge', counts: { geth_frigate: 8 }, arrivalTime: 20 },
      ],
      extraB: [{ faction: 'cerberus', name: 'Cerberus raiders', formation: 'strike_wedge', counts: { cerberus_cruiser: 3 } }],
    });
    const a = cfg.fleets.filter((f) => f.side === 'A');
    const b = cfg.fleets.filter((f) => f.side === 'B');
    expect(a.map((f) => f.faction)).toEqual(['alliance', 'turian', 'geth']);
    expect(b.map((f) => f.faction)).toEqual(['reaper', 'cerberus']);
    expect(a[2].arrivalTime).toBe(20);
    expect(new Set(a.map((f) => f.position.x)).size).toBe(3); // laid out side by side
    expect(cfg.name).toContain('+ 2 allied fleets');
    const sim = new BattleSimulation(cfg);
    for (let i = 0; i < 400; i++) sim.step();
    expect(sim.ships.filter((s) => s.side === 'A' && s.faction === 'turian').length).toBeGreaterThan(0);
    expect(sim.ships.filter((s) => s.side === 'B' && s.faction === 'cerberus').length).toBeGreaterThan(0);
  });

  it('has no hull cap', () => {
    const cfg = buildCustomBattle({ ...base, sideA: { ...base.sideA, counts: { alliance_frigate: 240 } } });
    expect(cfg.fleets[0].ships[0].count).toBe(240);
  });
});

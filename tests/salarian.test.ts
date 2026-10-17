import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { getShipClass, SHIP_CLASS_LIST } from '@/data/ships';
import { createCampaign, orderMove } from '@/campaign/engine';
import { getPreset } from '@/timelines/presets';
import { hasModel } from '@/rendering/ships';

describe('Salarian Union', () => {
  it('has a full hull family with models and provenance', () => {
    const ids = ['salarian_fighter', 'salarian_frigate', 'salarian_cruiser', 'salarian_dreadnought'];
    for (const id of ids) {
      const c = getShipClass(id);
      expect(c.faction).toBe('salarian');
      expect(hasModel(id)).toBe(true);
      expect(c.designProvenance.provenance).toBe('CANON_INFERRED');
    }
    expect(SHIP_CLASS_LIST.filter((c) => c.faction === 'salarian')).toHaveLength(4);
    // STG frigates are the stealthiest organic hull.
    const stg = getShipClass('salarian_frigate');
    for (const c of SHIP_CLASS_LIST.filter((x) => x.faction !== 'reaper' && x.role !== 'fighter' && x.id !== stg.id)) expect(stg.signature).toBeLessThanOrEqual(c.signature);
  });

  it('Defence of Sur’Kesh runs under canon and Prime/Apex with diverging outcomes', () => {
    const canon = new BattleSimulation(buildScenario('defence_of_surkesh', 'canon_me3', 5, { stg_warning: 'early' })).run();
    expect(canon.duration).toBeGreaterThan(0);
    expect(canon.sides.A.destroyed).toBeGreaterThan(0);
    const apex = new BattleSimulation(buildScenario('defence_of_surkesh', 'prime_apex', 5, { stg_warning: 'early' })).run();
    expect(apex.sides.B.destroyed).toBeGreaterThan(canon.sides.B.destroyed);
    const late = buildScenario('defence_of_surkesh', 'canon_me3', 5, { stg_warning: 'late' });
    expect(late.fleets.find((f) => f.name === 'Reaper flanking group')?.arrivalTime).toBe(25);
  });

  it('custom battles accept salarian fleets', () => {
    const cfg = buildCustomBattle({
      seed: 3,
      rulesId: 'canon_me3',
      environment: 'surkesh_orbit',
      startingDistanceKm: 60,
      sideA: { faction: 'salarian', name: 'Union', formation: 'line_abreast', counts: { salarian_dreadnought: 2, salarian_cruiser: 6, salarian_frigate: 8 } },
      sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { reaper_destroyer: 4 } },
      maxDuration: 240,
    });
    const r = new BattleSimulation(cfg).run();
    expect(r.duration).toBeGreaterThan(0);
    expect(r.sides.B.destroyed).toBeGreaterThan(0);
  });

  it('the genophage world state decides the First Fleet and salarian cooperation', () => {
    const cured = createCampaign({ seed: 1, rules: getPreset('canon_me3'), worldState: { genophage: 'cured' } });
    const sabotaged = createCampaign({ seed: 1, rules: getPreset('canon_me3'), worldState: { genophage: 'sabotaged' } });
    expect(cured.fleets.some((f) => f.name === 'Salarian First Fleet')).toBe(false);
    expect(sabotaged.fleets.some((f) => f.name === 'Salarian First Fleet')).toBe(true);
    const third = cured.fleets.find((f) => f.name === 'Salarian Third Fleet')!;
    expect(orderMove(cured, third.id, 'sol').ok).toBe(false); // keeps its fleets at home
    const first = sabotaged.fleets.find((f) => f.name === 'Salarian First Fleet')!;
    expect(orderMove(sabotaged, first.id, 'widow').ok).toBe(true);
    const final = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', genophage: 'sabotaged' });
    expect(final.fleets.some((f) => f.name === 'Salarian First Fleet')).toBe(true);
  });
});

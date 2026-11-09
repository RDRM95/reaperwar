import { describe, expect, it } from 'vitest';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig } from '@/simulation/types';
import { UNIQUE_CLASS_IDS, isAuClass } from '@/data/types';
import { NAMES, SCENARIOS, buildScenario, defaultWorldState, getScenario } from '@/scenarios';
import { resolveWorldState } from '@/scenarios/worldState';
import { PRESETS, getPreset } from '@/timelines/presets';
import { cloneRules } from '@/timelines/rules';

/**
 * One Normandy, many SR-2-pattern frigates (ADOPTION_PLAN.md §22.1; brief §15; WORK_BREAKDOWN.md §1.6.3
 * `tests/normandy.test.ts`): every scenario that fields Shepard's ship fields exactly one `normandy_sr2`, the pattern
 * frigates are a separate class with original names, and no vessel name is used twice.
 */

const countOf = (config: BattleConfig, classId: string): number => config.fleets.reduce((a, f) => a + f.ships.filter((s) => s.classId === classId).reduce((b, s) => b + s.count, 0), 0);
const declaresNormandy = (scenarioId: string): boolean => (getScenario(scenarioId).worldState ?? []).some((o) => o.id === 'normandy');

/** Builds with explicit rules (the preset's world-state resolution, as `buildScenario` does). */
function buildWith(scenarioId: string, rules: ReturnType<typeof getPreset>, seed: number, ws: Record<string, string>): BattleConfig {
  const s = getScenario(scenarioId);
  return s.build(rules, seed, resolveWorldState(s, rules, { ...defaultWorldState(s), ...ws }).ws);
}

describe('exactly one Normandy SR-2 where the world state says so', () => {
  const withOption = SCENARIOS.filter((s) => declaresNormandy(s.id));
  it('the Normandy option is declared by the scenarios that field her', () => {
    expect(withOption.map((s) => s.id)).toContain('final_battle_of_earth');
    expect(withOption.length).toBeGreaterThanOrEqual(3);
  });
  it.each(withOption.map((s) => s.id))('%s: one normandy_sr2 with yes, none with no, under every preset', (id) => {
    for (const p of PRESETS) {
      const yes = buildScenario(id, p.id, 1, { normandy: 'yes' });
      const no = buildScenario(id, p.id, 1, { normandy: 'no' });
      expect(countOf(yes, 'normandy_sr2'), `${id} / ${p.id} yes`).toBe(1);
      expect(countOf(no, 'normandy_sr2'), `${id} / ${p.id} no`).toBe(0);
    }
  });
  it('no scenario under any preset fields more than one Normandy,', () => {
    for (const s of SCENARIOS) {
      for (const p of PRESETS) {
        const c = buildScenario(s.id, p.id, 1);
        expect(countOf(c, 'normandy_sr2'), `${s.id} / ${p.id}`).toBeLessThanOrEqual(1);
      }
    }
  });
  it('fleetStrength.alliance 2.0 leaves the Normandy at one', () => {
    const rules = cloneRules(getPreset('canon_me3'));
    rules.fleetStrength.alliance = 2;
    for (const s of withOption) expect(countOf(buildWith(s.id, rules, 1, { normandy: 'yes' }), 'normandy_sr2'), s.id).toBe(1);
  });
});

describe('the SR-2-pattern stealth frigates', () => {
  it('scale with the Alliance fleet under Apex and are absent from the Alliance Fleet Engagement', () => {
    const apex = getPreset('prime_apex');
    const base = countOf(buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default' }), 'alliance_frigate_thanix');
    expect(base).toBeGreaterThan(0);
    expect(base).toBeGreaterThan(countOf(buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' }), 'alliance_frigate_thanix'));
    const strong = cloneRules(apex);
    strong.fleetStrength.alliance = apex.fleetStrength.alliance * 2;
    expect(countOf(buildWith('final_battle_of_earth', strong, 1, { forces: 'default' }), 'alliance_frigate_thanix')).toBeGreaterThan(base);
    for (const p of PRESETS) expect(countOf(buildScenario('alliance_fleet_engagement', p.id, 1), 'alliance_frigate_thanix'), p.id).toBe(0);
  });
  it('the canon Final Battle fields the pattern frigates beside exactly one Normandy, each with an original name', () => {
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', normandy: 'yes' }));
    const pattern = sim.ships.filter((s) => s.classId === 'alliance_frigate_thanix');
    expect(pattern.length).toBeGreaterThan(0);
    for (const s of pattern) {
      expect(NAMES.alliance_frigate_thanix).toContain(s.name);
      expect(s.name).not.toMatch(/Normandy/);
    }
    expect(sim.ships.filter((s) => s.classId === 'normandy_sr2').map((s) => s.name)).toEqual(['SSV Normandy SR-2']);
  });
  it('class flags: the Normandy is canon and unique, the pattern frigate is neither unique nor a single ship', () => {
    expect(isAuClass('normandy_sr2')).toBe(false);
    expect(UNIQUE_CLASS_IDS).toContain('normandy_sr2');
    expect(UNIQUE_CLASS_IDS).not.toContain('alliance_frigate_thanix');
  });
});

describe('vessel names are never used twice', () => {
  it('no name appears in two NAMES lists (SSV Trafalgar is a cruiser only)', () => {
    const seen = new Map<string, string>();
    for (const [classId, list] of Object.entries(NAMES)) {
      for (const n of list) {
        expect(seen.get(n), `${n} in ${classId} and ${seen.get(n)}`).toBeUndefined();
        seen.set(n, classId);
      }
      expect(new Set(list).size, classId).toBe(list.length);
    }
    expect(seen.get('SSV Trafalgar')).toBe('alliance_cruiser');
  });
  it('no built scenario fields two hulls of one name, nor two SSV Normandy SR-2', () => {
    for (const s of SCENARIOS) {
      for (const id of ['canon_me3', 'prime_apex', 'cerberus_ascendant']) {
        const sim = new BattleSimulation(buildScenario(s.id, id, 1));
        const names = sim.ships.filter((x) => x.role !== 'fighter').map((x) => x.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        expect(dupes, `${s.id} / ${id}`).toEqual([]);
        expect(names.filter((n) => n === 'SSV Normandy SR-2').length, `${s.id} / ${id}`).toBeLessThanOrEqual(1);
      }
    }
  }, 120_000);
  it.each(['final_battle_of_earth', 'battle_of_earth'])('canon %s fields exactly the Kilimanjaro-class pair, SSV Kilimanjaro and SSV Orizaba', (id) => {
    const sim = new BattleSimulation(buildScenario(id, 'canon_me3', 1));
    expect(sim.ships.filter((s) => s.classId === 'alliance_dreadnought_k').map((s) => s.name).sort()).toEqual(['SSV Kilimanjaro', 'SSV Orizaba']);
  });
});

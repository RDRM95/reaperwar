import { describe, expect, it } from 'vitest';
import { CANON_ME3, CERBERUS_ASCENDANT, PRESETS, PRIME_APEX, getPreset, makeCustom } from '@/timelines/presets';
import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, TECH_KEYS, applyRulesToShip, applyRulesToWeapon, cloneRules } from '@/timelines/rules';
import { exportRuleSet, importRuleSet, validateRuleSet } from '@/timelines/schema';
import { getShipClass, SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';

describe('canon preset integrity', () => {
  it('canon has all multipliers at 1 and no special technology', () => {
    for (const k of TECH_KEYS) {
      expect(CANON_ME3.organic[k]).toBe(1);
      expect(CANON_ME3.reaper[k]).toBe(1);
    }
    expect(CANON_ME3.special).toEqual(CANON_SPECIAL);
    expect(CANON_ME3.fleetStrength).toEqual(CANON_FLEETS);
    expect(CANON_ME3.strategic).toEqual(CANON_STRATEGIC);
    expect(CANON_ME3.category).toBe('canon');
  });

  it('getPreset returns clones: mutating a preset never leaks into canon', () => {
    const p = getPreset('canon_me3');
    p.organic.massAcceleratorDamage = 99;
    p.special.hadesRounds = true;
    expect(getPreset('canon_me3').organic.massAcceleratorDamage).toBe(1);
    expect(getPreset('canon_me3').special.hadesRounds).toBe(false);
    expect(CANON_ME3.organic.massAcceleratorDamage).toBe(1);
  });

  it('canon effective stats equal catalogue values for every ship class', () => {
    for (const cls of SHIP_CLASS_LIST) {
      const eff = applyRulesToShip(cls, CANON_ME3);
      expect(eff.hull).toBe(cls.hull.value);
      expect(eff.barriers).toBe(cls.barriers.value);
      expect(eff.armour).toBe(cls.armour.value);
      for (const hp of cls.hardpoints) {
        const w = applyRulesToWeapon(WEAPONS[hp.weaponId], cls.faction, cls, CANON_ME3, WEAPONS);
        expect(w.id).toBe(hp.weaponId);
        expect(w.damage).toBe(WEAPONS[hp.weaponId].damage);
        expect(w.armourBypass).toBe(0);
        expect(w.barrierEfficiencyMultiplier).toBe(1);
      }
    }
  });
});

describe('AU isolation', () => {
  it('Prime/Apex rules do not leak into canon', () => {
    const dn = getShipClass('alliance_dreadnought');
    const apex = applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', dn, PRIME_APEX, WEAPONS);
    const canon = applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', dn, CANON_ME3, WEAPONS);
    expect(apex.id).toBe('apex_hyper_ma');
    expect(canon.id).toBe('alliance_dn_main');
    expect(WEAPONS.alliance_dn_main.damage).toBe(1000);
  });

  it('Cerberus Ascendant rules do not leak into Prime/Apex and vice versa', () => {
    expect(PRIME_APEX.strategic.shepardAlive).toBe(true);
    expect(CERBERUS_ASCENDANT.strategic.shepardAlive).toBe(false);
    expect(CERBERUS_ASCENDANT.special.hyperMassAccelerators).toBe(false);
    expect(CERBERUS_ASCENDANT.special.hadesRounds).toBe(false);
    expect(PRIME_APEX.strategic.cerberusStance).toBe('cooperative');
    expect(CERBERUS_ASCENDANT.strategic.cerberusStance).toBe('controls_reapers');
    expect(PRIME_APEX.strategic.catalystOperational).toBe(true);
    expect(CERBERUS_ASCENDANT.strategic.catalystOperational).toBe(false);
  });

  it('Reaper technology is unchanged in Prepared Galaxy and Prime/Apex', () => {
    for (const id of ['prepared_galaxy', 'prime_apex']) {
      const p = getPreset(id);
      for (const k of TECH_KEYS) expect(p.reaper[k]).toBe(1);
    }
  });

  it('every preset has a unique id and non-canon presets declare history changes', () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    expect(ids.size).toBe(PRESETS.length);
    for (const p of PRESETS) if (p.category !== 'canon') expect(p.historyChanges.length).toBeGreaterThan(0);
  });
});

describe('rule set schema', () => {
  it('round-trips a preset through export/import', () => {
    const res = importRuleSet(exportRuleSet(PRIME_APEX));
    expect(res.ok).toBe(true);
    expect(res.rules!.organic).toEqual(PRIME_APEX.organic);
    expect(res.rules!.special).toEqual(PRIME_APEX.special);
    expect(res.rules!.strategic).toEqual(PRIME_APEX.strategic);
  });

  it('rejects invalid JSON and non-objects', () => {
    expect(importRuleSet('{not json').ok).toBe(false);
    expect(validateRuleSet(42).ok).toBe(false);
    expect(validateRuleSet([]).ok).toBe(false);
  });

  it('clamps out-of-range values and drops unknown keys without executing anything', () => {
    const res = validateRuleSet({
      name: 'Hacky',
      organic: { massAcceleratorDamage: 1000, bogus: 'x' },
      factionOverrides: { klingon: { accuracy: 2 }, alliance: { accuracy: 1.2 } },
      special: { thanixAvailability: 'everywhere' },
      strategic: { cerberusStance: 'controls_reapers', catalystOperational: true },
      __proto__: { polluted: true },
    });
    expect(res.ok).toBe(true);
    expect(res.rules!.organic.massAcceleratorDamage).toBe(10);
    expect((res.rules!.organic as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect(res.rules!.factionOverrides.alliance?.accuracy).toBe(1.2);
    expect((res.rules!.factionOverrides as Record<string, unknown>).klingon).toBeUndefined();
    expect(res.rules!.special.thanixAvailability).toBe('canon');
    expect(res.rules!.strategic.catalystOperational).toBe(false); // prerequisite enforced
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.rules!.category).toBe('custom');
  });

  it('imported sets cannot claim canon status', () => {
    const res = validateRuleSet({ ...cloneRules(CANON_ME3), id: 'canon_me3', category: 'canon', name: 'Fake canon' });
    expect(res.rules!.category).toBe('custom');
    expect(res.rules!.id).not.toBe('canon_me3');
  });

  it('custom timelines start identical to canon', () => {
    const c = makeCustom();
    expect(c.organic).toEqual(CANON_TECH);
    expect(c.category).toBe('custom');
  });
});

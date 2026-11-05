import { describe, expect, it } from 'vitest';
import { CANON_ME3, CERBERUS_ASCENDANT, PRESETS, PRIME_APEX, getPreset, makeCustom } from '@/timelines/presets';
import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, SPECIAL_KEYS, STRATEGIC_KEYS, TECH_KEYS, applyRulesToShip, applyRulesToWeapon, cloneRules, isApexRules, isApexScenario, type RuleSet } from '@/timelines/rules';
import { exportRuleSet, importRuleSet, normaliseRules, validateRuleSet } from '@/timelines/schema';
import { getShipClass, SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { BattleSimulation } from '@/simulation/battle';
import { DRIVE_TIERS } from '@/simulation/specials';
import { getScenario } from '@/scenarios';

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
      expect(eff.heatCapacity).toBe(cls.heatCapacity?.value ?? 100);
      expect(eff.barrierRegenUnderFire).toBe(cls.barrierRegenUnderFire?.value ?? 0);
      expect(eff.barrierLoadThreshold).toBe(cls.barrierLoadThreshold?.value ?? 0);
      if (cls.faction !== 'reaper') {
        expect(eff.barrierRegenUnderFire).toBe(0);
        expect(eff.barrierLoadThreshold).toBe(0);
      }
      for (const hp of cls.hardpoints) {
        const w = applyRulesToWeapon(WEAPONS[hp.weaponId], cls.faction, cls, CANON_ME3, WEAPONS);
        expect(w.id).toBe(hp.weaponId);
        expect(w.damage).toBe(WEAPONS[hp.weaponId].damage);
        expect(w.armourBypass).toBe(0);
        expect(w.barrierEfficiencyMultiplier).toBe(1);
        expect(w.hadesRound).toBeUndefined();
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

  it('the Titan predicate covers Alliance and Black Fleet dreadnought spinal guns only', () => {
    const titan = (weaponId: string, faction: 'alliance' | 'turian' | 'cerberus' | 'asari', clsId: string) => applyRulesToWeapon(WEAPONS[weaponId], faction, getShipClass(clsId), PRIME_APEX, WEAPONS);
    expect(titan('alliance_dn_main', 'alliance', 'alliance_dreadnought').id).toBe('apex_hyper_ma');
    expect(titan('alliance_dn_main', 'cerberus', 'cerberus_dreadnought').id).toBe('apex_hyper_ma');
    expect(titan('turian_dn_main', 'turian', 'turian_dreadnought').id).toBe('turian_dn_main');
    expect(titan('ascension_main', 'asari', 'destiny_ascension').id).toBe('ascension_main');
    expect(titan('alliance_broadside', 'alliance', 'alliance_dreadnought').id).toBe('alliance_broadside');
    expect(titan('alliance_cruiser_main', 'alliance', 'alliance_cruiser').id).not.toBe('apex_hyper_ma');
  });

  it('HADES is round-level: only the Titan gun carries a HADES round, every ordinary round keeps slug values', () => {
    const dn = getShipClass('alliance_dreadnought');
    const titan = applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', dn, PRIME_APEX, WEAPONS);
    expect(titan.hadesRound).toBeDefined();
    expect(titan.hadesRound?.armourBypass).toBe(0.5);
    expect(titan.hadesRound?.barrierEfficiencyMultiplier).toBe(1);
    expect(titan.hadesRound?.warhead.damage).toBe(2260);
    expect(titan.hadesRound?.fuse.residualFraction).toBe(0.5);
    expect(titan.specialAmmo).toBe(12);
    expect(titan.armourBypass).toBe(0);
    expect(titan.barrierEfficiencyMultiplier).toBe(1);
    const broadside = applyRulesToWeapon(WEAPONS.alliance_broadside, 'alliance', dn, PRIME_APEX, WEAPONS);
    expect(broadside.hadesRound).toBeUndefined();
    expect(broadside.armourBypass).toBe(0);
    expect(broadside.barrierEfficiencyMultiplier).toBe(1);
    // The Titan gun without hadesRounds is an ordinary (if heavy) accelerator.
    const noHades = cloneRules(PRIME_APEX);
    noHades.special.hadesRounds = false;
    expect(applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', dn, noHades, WEAPONS).hadesRound).toBeUndefined();
  });

  it('isApexRules gates mechanics by flags and isApexScenario gates figures by preset id', () => {
    expect(isApexRules(PRIME_APEX)).toBe(true);
    expect(isApexScenario(PRIME_APEX)).toBe(true);
    expect(isApexRules(CANON_ME3)).toBe(false);
    expect(isApexScenario(CANON_ME3)).toBe(false);
    expect(isApexRules(getPreset('cerberus_reformed'))).toBe(false);
    const custom = cloneRules(PRIME_APEX);
    custom.id = 'my_apex_copy';
    expect(isApexRules(custom)).toBe(true);
    expect(isApexScenario(custom)).toBe(false);
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

  it('Reaper technology is unchanged in Prepared Galaxy and both Apex presets', () => {
    for (const id of ['prepared_galaxy', 'prime_apex', 'apex_legacy']) {
      const p = getPreset(id);
      for (const k of TECH_KEYS) expect(p.reaper[k]).toBe(1);
    }
  });

  it('the two Apex presets carry the AP §1 literals: Apex core, Apex legacy inheriting it, 0.1c and penetrator/warhead wording', () => {
    const core = getPreset('prime_apex');
    const legacy = getPreset('apex_legacy');
    expect(core.name).toBe('Prime/Apex — Apex core');
    expect(legacy.name).toBe('Prime/Apex — Apex legacy (high power)');
    expect(core.name.startsWith('Prime/Apex')).toBe(true);
    expect(core.historyChanges.some((h) => h.includes('Homeworld Defence Rule'))).toBe(true);
    expect(core.strategic.crucibleAvailable).toBe(false);
    expect(core.strategic.conventionalVictoryPossible).toBe(true);
    expect(core.special).toMatchObject({ valkyrieAvailable: true, legacyNova: false, driveAttacks: 'rare', heavyPlatforms: true, superDreadnoughts: true, reaperDoctrine: 'apex', readinessScale: 1 });
    expect(legacy.special).toEqual({ ...core.special, legacyNova: true, driveAttacks: 'upper' });
    expect(legacy.organic).toEqual(core.organic);
    expect(legacy.reaper).toEqual(core.reaper);
    expect(legacy.factionOverrides).toEqual(core.factionOverrides);
    expect(legacy.fleetStrength).toEqual(core.fleetStrength);
    expect(legacy.strategic).toEqual(core.strategic);
    expect(legacy.historyChanges.slice(0, core.historyChanges.length)).toEqual(core.historyChanges);
    expect(legacy.historyChanges.length).toBe(core.historyChanges.length + 3);
    expect(PRESETS.map((p) => p.id)).toEqual(['canon_me3', 'prepared_galaxy', 'humanity_ascendant', 'cerberus_reformed', 'reaper_escalation', 'prime_apex', 'apex_legacy', 'cerberus_ascendant']);
    // Wording: the HADES history line names the penetrator and the warhead; nothing says "near-c" or quotes the old "~3×" yield.
    const hades = core.historyChanges.find((h) => h.includes('HADES'))!;
    expect(hades).toMatch(/penetrator/);
    expect(hades).toMatch(/warhead/);
    for (const p of PRESETS) {
      const text = [p.name, p.tagline, p.description, ...p.historyChanges].join(' ');
      expect(text).not.toMatch(/near-c|near light/i);
      expect(text).not.toMatch(/3× canon slug|3x canon slug/);
    }
    expect(legacy.historyChanges.join(' ')).toMatch(/0\.1c|tenth of light speed/);
    // The organic TUNE multipliers stay inside the AP §1.3 bounds: ≥ 1 and ≤ the v0.11 shipped values.
    const shipped: Record<string, number> = { massAcceleratorDamage: 1.25, massAcceleratorPenetration: 1.3, massAcceleratorRange: 1.0, fireRate: 1.1, heatCapacity: 1.3, kineticBarrierStrength: 1.35, barrierRegen: 1.4, armourStrength: 1.3, hullIntegrity: 1.15, speed: 1.08, sensors: 1.4, electronicWarfare: 1.3, accuracy: 1.1, fighterStrength: 1.3, torpedoDamage: 1.4, gardianEffectiveness: 1.4, beamDamage: 1.35, crewQuality: 1.15 };
    for (const k of TECH_KEYS) {
      expect(core.organic[k], k).toBeGreaterThanOrEqual(1);
      expect(core.organic[k], k).toBeLessThanOrEqual(shipped[k]);
      expect(core.reaper[k], k).toBe(1);
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

  it('validates the new special keys and clamps readinessScale', () => {
    const res = validateRuleSet({ name: 'Flags', special: { driveAttacks: 'upper', reaperDoctrine: 'apex', readinessScale: 9, valkyrieAvailable: true, superDreadnoughts: 'yes' } });
    expect(res.ok).toBe(true);
    expect(res.rules!.special.driveAttacks).toBe('upper');
    expect(res.rules!.special.reaperDoctrine).toBe('apex');
    expect(res.rules!.special.readinessScale).toBe(1.5);
    expect(res.rules!.special.valkyrieAvailable).toBe(true);
    expect(res.rules!.special.superDreadnoughts).toBe(false);
    expect(res.rules!.special.legacyNova).toBe(false);
    expect(res.rules!.special.heavyPlatforms).toBe(false);
  });
});

describe('normaliseRules', () => {
  /** A custom rule set exactly as v0.11 stored it: five special keys, no readinessScale, no new strategic keys. */
  const v011 = (): RuleSet =>
    JSON.parse(
      JSON.stringify({
        id: 'my_custom',
        name: 'My custom timeline',
        tagline: 'v0.11 save',
        category: 'custom',
        description: '',
        historyChanges: ['Something changed.'],
        organic: { ...CANON_TECH, massAcceleratorDamage: 1.2 },
        reaper: { ...CANON_TECH },
        factionOverrides: { alliance: { accuracy: 1.1 } },
        special: { hyperMassAccelerators: true, hadesRounds: true, thanixAvailability: 'fleetwide', reaperCommandVulnerability: true, indoctrinationDisabled: false },
        fleetStrength: { ...CANON_FLEETS, alliance: 1.4 },
        strategic: { alliedCoordination: 0.7, reaperCompetence: 1, indoctrinationEffectiveness: 1, reaperReinforcements: 1, conventionalVictoryPossible: true, crucibleAvailable: true, shepardAlive: true, shepardEffectiveness: 1, illusiveManIndoctrinated: false, cerberusStance: 'cooperative', harbingerOperational: true, catalystOperational: true },
      }),
    ) as RuleSet;

  it('fills every missing special and strategic key from the canon values, keeps the stored values and is idempotent', () => {
    const stored = v011();
    const n = normaliseRules(stored);
    for (const k of SPECIAL_KEYS) expect(n.special[k], k).toBeDefined();
    for (const k of STRATEGIC_KEYS) expect(n.strategic[k], k).toBeDefined();
    expect(n.special.valkyrieAvailable).toBe(CANON_SPECIAL.valkyrieAvailable);
    expect(n.special.driveAttacks).toBe('off');
    expect(n.special.reaperDoctrine).toBe('canon');
    expect(n.special.readinessScale).toBe(1);
    expect(n.strategic.homeworldIndependence).toBe(CANON_STRATEGIC.homeworldIndependence);
    // Stored values untouched: id, name, category, history, flags, numbers.
    expect(n.id).toBe('my_custom');
    expect(n.name).toBe('My custom timeline');
    expect(n.category).toBe('custom');
    expect(n.historyChanges).toEqual(['Something changed.']);
    expect(n.special.hyperMassAccelerators).toBe(true);
    expect(n.special.thanixAvailability).toBe('fleetwide');
    expect(n.strategic.cerberusStance).toBe('cooperative');
    expect(n.organic.massAcceleratorDamage).toBe(1.2);
    expect(n.fleetStrength.alliance).toBe(1.4);
    expect(n.factionOverrides.alliance?.accuracy).toBe(1.1);
    // The input is not mutated and a second pass changes nothing.
    expect((stored.special as Partial<typeof stored.special>).readinessScale).toBeUndefined();
    expect(normaliseRules(n)).toEqual(n);
    // Presets are already complete: normalising one is the identity.
    expect(normaliseRules(cloneRules(PRIME_APEX))).toEqual(PRIME_APEX);
    expect(normaliseRules(cloneRules(CANON_ME3))).toEqual(CANON_ME3);
  });

  it('never throws and clamps readinessScale', () => {
    expect(() => normaliseRules(undefined as unknown as RuleSet)).not.toThrow();
    expect(() => normaliseRules({} as RuleSet)).not.toThrow();
    const broken = normaliseRules({ id: 'x', special: { readinessScale: Number.NaN, driveAttacks: 'warp' }, strategic: { alliedCoordination: 'high' }, organic: { massAcceleratorDamage: 'lots' } } as unknown as RuleSet);
    expect(broken.special.readinessScale).toBe(1);
    expect(broken.special.driveAttacks).toBe('off');
    expect(broken.strategic.alliedCoordination).toBe(CANON_STRATEGIC.alliedCoordination);
    expect(broken.organic.massAcceleratorDamage).toBe(1);
    expect(normaliseRules({ ...v011(), special: { ...v011().special, readinessScale: 7 } } as RuleSet).special.readinessScale).toBe(1.5);
  });

  it('a normalised v0.11 rule set builds the reference engagement with a readiness-tiered fleet and finite crew quality', () => {
    const n = normaliseRules(v011());
    const cfg = getScenario('alliance_fleet_engagement').build(n, 1, {});
    cfg.fleets[0].readiness = 'regular';
    const sim = new BattleSimulation(cfg);
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.ships.length).toBeGreaterThan(0);
    for (const s of sim.ships) expect(Number.isFinite(s.crewQuality), s.id).toBe(true);
    expect(['off', 'rare', 'upper']).toContain(n.special.driveAttacks);
    // The drive-attack tier table answers every normalised tier that is not 'off' (T14).
    for (const r of [n, ...PRESETS].map((x) => normaliseRules(x))) if (r.special.driveAttacks !== 'off') expect(DRIVE_TIERS[r.special.driveAttacks], r.id).toBeDefined();
  });
});

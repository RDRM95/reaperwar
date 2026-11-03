import { describe, expect, it } from 'vitest';
import { forbiddenWording } from '@/core/lint';
import { FACTIONS } from '@/data/factions';
import { IES_STEALTH, OCULUS_COMPLEMENT_NOTE, SHIP_CLASSES, SHIP_CLASS_LIST, getShipClass } from '@/data/ships';
import { TRANSMISSIONS, TRANSMISSIONS_PROVENANCE, transmissionKey } from '@/data/transmissions';
import { NAMED_FLAGSHIPS, UNIQUE_CLASS_IDS, isAuClass, type ShipRole } from '@/data/types';
import { HADES_WARHEAD, WEAPONS, WEAPON_LIST } from '@/data/weapons';
import { NAMES, NAME_PROVENANCE, buildScenario, getScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { BATTLESPACE_SCALE } from '@/simulation/constants';
import { getPreset } from '@/timelines/presets';

/**
 * The V2 data catalogue (WORK_BREAKDOWN.md T5): the canon calibration values of
 * ADOPTION_PLAN.md §3.2, the new classes and weapons of §14.2/§14.3, the stealth
 * classes of brief §15, names, Oculus complements and transmissions. Every
 * number here is typed from the plan, never re-derived.
 */

describe('canon calibration values (AP §3.2)', () => {
  it('dreadnought guns fire every two seconds with re-based heat; the quarian and Ascension guns keep their own cadence', () => {
    for (const id of ['alliance_dn_main', 'turian_dn_main', 'asari_dn_main', 'salarian_dn_main', 'geth_dn_main']) expect(WEAPONS[id].cooldown, id).toBe(2.0);
    expect(WEAPONS.alliance_dn_main.heat).toBe(12);
    expect(WEAPONS.turian_dn_main.heat).toBe(12);
    expect(WEAPONS.asari_dn_main.heat).toBe(11);
    expect(WEAPONS.geth_dn_main.heat).toBe(11);
    expect(WEAPONS.salarian_dn_main.heat).toBe(10);
    expect(WEAPONS.quarian_heavy_main.cooldown).toBe(3.0);
    expect(WEAPONS.quarian_heavy_main.heat).toBe(14);
    expect(WEAPONS.ascension_main.cooldown).toBe(4.0);
    expect(WEAPONS.ascension_main.heat).toBe(16);
    expect(WEAPONS.alliance_broadside.heat).toBe(3);
    expect(WEAPONS.alliance_dn_main.damage).toBe(1000); // the DKE anchor
    expect(WEAPONS.alliance_dn_main.provenance.provenance).toBe('CANON_CONFIRMED');
  });

  it('Reaper cadence, point defence and torpedo survivability follow the plan', () => {
    expect(WEAPONS.reaper_capital_beam.cooldown).toBe(6.0);
    expect(WEAPONS.reaper_capital_beam.damage).toBe(1900);
    expect(WEAPONS.reaper_capital_beam.beamDuration).toBe(2.8);
    expect(WEAPONS.reaper_destroyer_beam.cooldown).toBe(6.5);
    expect(WEAPONS.reaper_point_defence.damage).toBe(12);
    expect(WEAPONS.disruptor_torpedo.missileHp).toBe(24);
    expect(WEAPONS.fighter_torpedo.missileHp).toBe(16);
  });

  it('Reaper hull pools and recovery mechanics carry the calibrated values and their provenance notes', () => {
    const cap = getShipClass('reaper_capital');
    expect([cap.barriers.value, cap.hull.value, cap.armour.value, cap.barrierRegen.value]).toEqual([7000, 12000, 320, 1000]);
    expect(cap.barrierRegenUnderFire?.value).toBe(1);
    expect(cap.barrierLoadThreshold?.value).toBe(1000);
    expect(cap.hull.provenance).toBe('SIMULATION_ESTIMATE');
    expect(cap.hull.note).toMatch(/planning benchmark/);
    expect(cap.hull.note).toMatch(/unverified/);
    expect(cap.hull.note).toMatch(/return fire four dreadnoughts usually lose/);
    const h = getShipClass('harbinger');
    expect([h.barriers.value, h.hull.value, h.armour.value, h.barrierRegen.value]).toEqual([10500, 18000, 380, 1300]);
    expect(h.barrierRegenUnderFire?.value).toBe(1);
    expect(h.barrierLoadThreshold?.value).toBe(1000);
    expect(h.lengthM.value).toBe(2200);
    expect(h.lengthM.provenance).toBe('SIMULATION_ESTIMATE');
    expect(h.lengthM.note).toMatch(/size unstated/);
    const dd = getShipClass('reaper_destroyer');
    expect([dd.barriers.value, dd.hull.value, dd.armour.value, dd.barrierRegen.value]).toEqual([1000, 700, 120, 25]);
    expect(dd.barrierRegenUnderFire).toBeUndefined();
    expect(dd.barrierLoadThreshold).toBeUndefined();
    expect(dd.description).toMatch(/stops a single dreadnought round and recovers only when left alone/);
    expect(getShipClass('alliance_cruiser').lengthM.value).toBe(700);
    expect(getShipClass('alliance_cruiser').lengthM.note).toMatch(/York-class/);
    // Every Reaper class keeps the M1/M2 fields off except the two capital hulls.
    for (const c of SHIP_CLASS_LIST) {
      if (c.role === 'reaper_capital') continue;
      expect(c.barrierRegenUnderFire, c.id).toBeUndefined();
      expect(c.barrierLoadThreshold, c.id).toBeUndefined();
    }
  });

  it('no catalogue description quotes the superseded Reaper pools', () => {
    for (const c of SHIP_CLASS_LIST) {
      for (const n of ['42,000', '32,000', '6,500', '3,200', '42000', '32000']) expect(c.description, `${c.id} quotes ${n}`).not.toContain(n);
    }
  });

  it('heat capacity follows the hull role (M3), with the heavy cruiser and heavy platform exceptions', () => {
    const expected: Record<ShipRole, number> = { fighter: 100, frigate: 110, cruiser: 140, dreadnought: 200, super_dreadnought: 260, carrier: 180, fixed_platform: 240, reaper_destroyer: 100, reaper_capital: 100 };
    for (const c of SHIP_CLASS_LIST) {
      const want = c.id === 'cerberus_heavy_cruiser' ? 160 : c.id === 'sol_platform_heavy' ? 260 : expected[c.role];
      expect(c.heatCapacity?.value ?? 100, c.id).toBe(want);
      if (c.role === 'fighter' || c.faction === 'reaper') expect(c.heatCapacity, c.id).toBeUndefined();
    }
  });
});

describe('new classes (AP §14.2, §22.1, brief §15)', () => {
  it('fields every new class id with its role, faction and point value', () => {
    const rows: [string, string, ShipRole, number][] = [
      ['reaper_oculus', 'reaper', 'fighter', 4],
      ['alliance_dreadnought_k', 'alliance', 'dreadnought', 320],
      ['normandy_valkyrie', 'alliance', 'super_dreadnought', 900],
      ['cerberus_dreadnought', 'cerberus', 'dreadnought', 360],
      ['cerberus_heavy_cruiser', 'cerberus', 'cruiser', 150],
      ['sol_defence_platform', 'alliance', 'fixed_platform', 700],
      ['sol_platform_heavy', 'alliance', 'fixed_platform', 1000],
      ['alliance_super_dreadnought', 'alliance', 'super_dreadnought', 560],
      ['turian_super_dreadnought', 'turian', 'super_dreadnought', 570],
      ['destiny_ascension', 'asari', 'super_dreadnought', 1100],
      ['normandy_sr2', 'alliance', 'frigate', 32],
      ['alliance_frigate_thanix', 'alliance', 'frigate', 30],
    ];
    for (const [id, faction, role, pts] of rows) {
      const c = getShipClass(id);
      expect(c.faction, id).toBe(faction);
      expect(c.role, id).toBe(role);
      expect(c.pointValue, id).toBe(pts);
      expect(c.designProvenance.value, id).toMatch(/[Oo]riginal model|original hull|simulation estimate/);
    }
  });

  it('the Everest-class and Kilimanjaro-class are separate dreadnought classes with identical combat values', () => {
    const e = getShipClass('alliance_dreadnought');
    const k = getShipClass('alliance_dreadnought_k');
    expect(e.name).toBe('Everest-class dreadnought');
    expect(k.name).toBe('Kilimanjaro-class dreadnought');
    expect(e.designProvenance.value).toMatch(/Everest-class is canon/);
    expect(k.lengthM.value).toBe(1000);
    expect(k.lengthM.provenance).toBe('SIMULATION_ESTIMATE');
    for (const f of ['hull', 'armour', 'barriers', 'barrierRegen', 'maxSpeed', 'acceleration', 'turnRate', 'sensorRange'] as const) expect(k[f].value, f).toBe(e[f].value);
    expect(k.hardpoints.map((h) => [h.weaponId, h.count])).toEqual(e.hardpoints.map((h) => [h.weaponId, h.count]));
    expect(SHIP_CLASS_LIST.filter((c) => c.name.startsWith('Kilimanjaro-class')).length).toBe(1);
  });

  it('AU hulls are AU_MODIFIED with "(AU)" in the name; canon-shaped hulls are not', () => {
    for (const id of ['normandy_valkyrie', 'cerberus_dreadnought', 'cerberus_heavy_cruiser', 'sol_platform_heavy', 'alliance_super_dreadnought', 'turian_super_dreadnought']) {
      expect(isAuClass(id), id).toBe(true);
      expect(getShipClass(id).name, id).toMatch(/\(AU[ )]/);
      expect(getShipClass(id).hull.provenance, id).toBe('AU_MODIFIED');
    }
    for (const id of ['reaper_oculus', 'alliance_dreadnought_k', 'sol_defence_platform', 'destiny_ascension', 'normandy_sr2', 'alliance_frigate_thanix', 'alliance_dreadnought']) {
      expect(isAuClass(id), id).toBe(false);
      expect(getShipClass(id).name, id).not.toContain('(AU)');
    }
    expect(getShipClass('sol_defence_platform').designProvenance.provenance).toBe('SIMULATION_ESTIMATE');
    expect(getShipClass('sol_defence_platform').description).not.toMatch(/AU scenario asset/);
    expect(getShipClass('sol_defence_platform').description).toMatch(/no canon description of Earth’s orbital network exists/);
  });

  it('the Valkyrie carries the AP §8 loadout and the legacy Nova hardpoint', () => {
    const v = getShipClass('normandy_valkyrie');
    const count = (id: string) => v.hardpoints.filter((h) => h.weaponId === id).reduce((a, h) => a + h.count, 0);
    expect(count('nova_array')).toBe(1);
    expect(count('thanix_heavy')).toBe(3);
    expect(count('alliance_broadside')).toBe(12);
    expect(count('gardian')).toBe(14);
    expect(count('nova_legacy')).toBe(1);
    expect(v.fighterComplement).toBeUndefined();
    expect(v.lengthM.value).toBe(2000);
    expect([v.hull.value, v.armour.value, v.barriers.value, v.barrierRegen.value]).toEqual([22500, 180, 14800, 128]);
    expect(v.crewQuality).toBe(1.25);
    expect(v.flagship).toBe(true);
    expect(v.unique).toBe(true);
  });

  it('the super-dreadnoughts, platforms and the re-based Cerberus hulls carry the AP §14.2 values', () => {
    const o = getShipClass('alliance_super_dreadnought');
    expect([o.lengthM.value, o.hull.value, o.armour.value, o.barriers.value, o.barrierRegen.value]).toEqual([1800, 19000, 170, 11500, 95]);
    expect(o.hardpoints.filter((h) => h.weaponId === 'alliance_dn_main').length).toBe(2);
    const p = getShipClass('turian_super_dreadnought');
    expect([p.lengthM.value, p.hull.value, p.armour.value, p.barriers.value, p.barrierRegen.value]).toEqual([1900, 20000, 185, 11000, 95]);
    expect(p.hardpoints.filter((h) => h.weaponId === 'turian_dn_main').length).toBe(2);
    const s = getShipClass('sol_defence_platform');
    expect([s.lengthM.value, s.hull.value, s.armour.value, s.barriers.value, s.barrierRegen.value, s.maxSpeed.value, s.turnRate.value]).toEqual([1200, 36000, 220, 13000, 73, 0, 2.5]);
    expect(s.hardpoints.filter((h) => h.weaponId === 'platform_gun').reduce((a, h) => a + h.count, 0)).toBe(2);
    const sh = getShipClass('sol_platform_heavy');
    expect([sh.lengthM.value, sh.hull.value, sh.armour.value, sh.barriers.value, sh.barrierRegen.value, sh.maxSpeed.value, sh.turnRate.value]).toEqual([1400, 44000, 240, 16000, 80, 0, 2.0]);
    expect(sh.hardpoints.some((h) => h.weaponId === 'platform_gun_heavy')).toBe(true);
    const cd = getShipClass('cerberus_dreadnought');
    expect([cd.lengthM.value, cd.hull.value, cd.armour.value, cd.barriers.value, cd.barrierRegen.value]).toEqual([1000, 10800, 135, 6300, 69]);
    expect(cd.hardpoints.map((h) => h.weaponId)).toContain('thanix_heavy');
    expect(cd.crewQuality).toBe(1.1);
    const hc = getShipClass('cerberus_heavy_cruiser');
    expect([hc.lengthM.value, hc.hull.value, hc.armour.value, hc.barriers.value, hc.barrierRegen.value]).toEqual([650, 4900, 70, 2400, 32]);
    expect(hc.hardpoints.map((h) => h.weaponId)).toEqual(expect.arrayContaining(['cerberus_cruiser_main', 'thanix_heavy', 'javelin_rack', 'alliance_broadside', 'gardian']));
    expect(getShipClass('destiny_ascension').designProvenance.note).toMatch(/simulation classification/);
  });

  it('the Normandy and the SR-2-pattern stealth frigate are the two stealth hulls (brief §15)', () => {
    const n = getShipClass('normandy_sr2');
    const p = getShipClass('alliance_frigate_thanix');
    expect(n.name).toBe('Normandy SR-2 (command vessel)');
    expect(n.shortName).toBe('Normandy');
    expect(p.name).toBe('SR-2-pattern stealth frigate');
    expect(p.shortName).toBe('Stealth frigate');
    expect(n.flagship).toBe(true);
    expect(n.unique).toBe(true);
    expect(p.flagship).toBeUndefined();
    expect(p.unique).toBeUndefined();
    expect(n.crewQuality).toBe(1.3);
    expect(p.crewQuality).toBe(1.15);
    expect([n.hull.value, n.barriers.value, n.maxSpeed.value, n.sensorRange.value, n.ecm]).toEqual([700, 520, 1.6, 80, 0.6]);
    expect([p.hull.value, p.barriers.value, p.maxSpeed.value, p.sensorRange.value, p.ecm]).toEqual([680, 500, 1.55, 78, 0.5]);
    expect(n.designProvenance.provenance).toBe('CANON_CONFIRMED');
    expect(p.designProvenance.provenance).toBe('SIMULATION_ESTIMATE');
    expect(p.designProvenance.value).toMatch(/only the Normandy itself/);
    expect(n.hardpoints.map((h) => [h.weaponId, h.count])).toEqual(p.hardpoints.map((h) => [h.weaponId, h.count]));
    for (const c of [n, p]) {
      expect(c.stealth).toBeDefined();
      expect(c.stealth!.capacity.value).toBe(120);
      expect(c.stealth!.ventTime.value).toBe(18);
      expect(c.stealth!.detectRange.value).toBe(2.5);
      expect(c.stealth!.revealOnFire.value).toBe(10);
      for (const f of ['capacity', 'ventTime', 'detectRange', 'revealOnFire'] as const) {
        expect(c.stealth![f].provenance, `${c.id}.${f}`).toBe('SIMULATION_ESTIMATE');
        expect(c.stealth![f].note, `${c.id}.${f}`).toMatch(/Internal Emission Sink/);
      }
    }
    expect(IES_STEALTH.capacity.note).toMatch(/vent/);
    // No other hull has the IES model (the STG frigate keeps its low signature only).
    for (const c of SHIP_CLASS_LIST) if (c.id !== 'normandy_sr2' && c.id !== 'alliance_frigate_thanix') expect(c.stealth, c.id).toBeUndefined();
  });

  it('unique hulls and flagship hulls are flagged for data-driven UIs', () => {
    for (const id of UNIQUE_CLASS_IDS) expect(getShipClass(id).unique, id).toBe(true);
    for (const c of SHIP_CLASS_LIST) if (!UNIQUE_CLASS_IDS.includes(c.id)) expect(c.unique, c.id).toBeUndefined();
    for (const id of ['normandy_sr2', 'normandy_valkyrie', 'destiny_ascension', 'harbinger']) expect(getShipClass(id).flagship, id).toBe(true);
    for (const c of SHIP_CLASS_LIST) if (!['normandy_sr2', 'normandy_valkyrie', 'destiny_ascension', 'harbinger'].includes(c.id)) expect(c.flagship, c.id).toBeUndefined();
    expect(NAMED_FLAGSHIPS).toContain('Sovereign');
  });

  it('Reaper warships carry Oculus complements of 8 / 2 / 12 tagged as an extrapolation', () => {
    const want: Record<string, number> = { reaper_capital: 8, reaper_destroyer: 2, harbinger: 12 };
    for (const [id, n] of Object.entries(want)) {
      const c = getShipClass(id).fighterComplement!;
      expect(c.classId, id).toBe('reaper_oculus');
      expect(c.count, id).toBe(n);
      expect(c.source?.provenance, id).toBe('SIMULATION_ESTIMATE');
      expect(c.source?.value, id).toBe(n);
      expect(c.source?.note, id).toContain('extrapolation');
      expect(c.source?.note, id).toBe(OCULUS_COMPLEMENT_NOTE);
    }
    const o = getShipClass('reaper_oculus');
    expect(o.designProvenance.provenance).toBe('CANON_CONFIRMED');
    expect(o.lengthM.value).toBe(12);
    expect(o.lengthM.provenance).toBe('CANON_INFERRED');
    expect([o.hull.value, o.armour.value, o.barriers.value, o.barrierRegen.value]).toEqual([48, 5, 0, 0]);
    expect([o.maxSpeed.value, o.acceleration.value, o.turnRate.value]).toEqual([3.6, 1.8, 110]);
    expect(o.hardpoints).toEqual([{ weaponId: 'oculus_beam', offset: [0, 0, 5], facing: 0, count: 1 }]);
    expect(FACTIONS.reaper.comms.fighters_launch).toContain('Deploying Oculus.');
    // Organic carriers keep their complements without a provenance note (nothing changed).
    expect(getShipClass('alliance_carrier').fighterComplement).toEqual({ classId: 'alliance_fighter', count: 24 });
  });

  it('Reaper capitals carry a ship-local strafing lane between the arms', () => {
    for (const id of ['reaper_capital', 'harbinger']) {
      const lane = getShipClass(id).strafeLane!;
      expect(lane.from.z).toBeGreaterThan(lane.to.z);
      expect(lane.from.y).toBeLessThan(0);
      expect(lane.from.x).toBe(0);
    }
    expect(getShipClass('reaper_destroyer').strafeLane).toBeUndefined();
  });
});

describe('new weapons (AP §14.3, §7)', () => {
  it('the Titan gun carries twelve HADES penetrators beside its slugs', () => {
    const t = WEAPONS.apex_hyper_ma;
    expect([t.heat, t.arc, t.specialAmmo, t.antiCapital, t.kind]).toEqual([24, 12, 12, true, 'mass_accelerator']);
    expect(t.name).toBe('Project Titan heavy accelerator (HADES penetrators)');
    expect(t.provenance.provenance).toBe('AU_MODIFIED');
    expect(HADES_WARHEAD.damage).toBe(2260);
  });

  it('carries the Nova, legacy Nova, heavy Thanix, Javelin, Oculus beam and platform guns', () => {
    const n = WEAPONS.nova_array;
    expect([n.damage, n.cooldown, n.range, n.projectileSpeed, n.accuracy, n.penetration, n.heat, n.magazine, n.arc]).toEqual([2780, 6.0, 52, 48, 0.8, 1.2, 30, 40, 10]);
    expect(n.degradedTargetBonus).toEqual({ barrierFractionBelow: 0.5, multiplier: 1.5 });
    const l = WEAPONS.nova_legacy;
    expect([l.damage, l.cooldown, l.range, l.projectileSpeed, l.accuracy, l.penetration, l.heat, l.magazine, l.arc, l.chargeTime]).toEqual([30000, 60.0, 56, 400, 0.7, 1.5, 90, 12, 8, 6]);
    expect(l.requiresSpecial).toBe('legacyNova');
    const th = WEAPONS.thanix_heavy;
    expect([th.kind, th.damageType, th.damage, th.beamDuration, th.cooldown, th.range, th.accuracy, th.penetration, th.heat, th.arc]).toEqual(['thanix', 'thanix_stream', 625, 1.6, 5.0, 34, 0.8, 0.95, 30, 25]);
    expect(th.perMountHeat).toBe(true);
    const j = WEAPONS.javelin_rack;
    expect([j.kind, j.damageType, j.damage, j.cooldown, j.range, j.projectileSpeed, j.accuracy, j.penetration, j.heat, j.magazine, j.missileHp, j.arc, j.salvo]).toEqual(['disruptor_torpedo', 'warhead', 325, 20.0, 16, 2.4, 0.9, 0.9, 6, 4, 14, 150, 4]);
    expect(j.provenance.provenance).toBe('CANON_INFERRED');
    const o = WEAPONS.oculus_beam;
    expect([o.kind, o.damageType, o.damage, o.beamDuration, o.cooldown, o.range, o.accuracy, o.penetration, o.heat, o.arc, o.antiSmall, o.antiCapital]).toEqual(['reaper_beam', 'reaper_beam', 48, 1.0, 2.4, 3.5, 0.7, 0.6, 0, 40, true, false]);
    const pg = WEAPONS.platform_gun;
    expect([pg.damage, pg.cooldown, pg.range, pg.projectileSpeed, pg.accuracy, pg.penetration, pg.heat, pg.arc]).toEqual([1000, 2.0, 44, 30, 0.74, 0.85, 18, 60]);
    expect(pg.provenance.provenance).toBe('SIMULATION_ESTIMATE');
    const ph = WEAPONS.platform_gun_heavy;
    expect([ph.damage, ph.cooldown, ph.range, ph.projectileSpeed, ph.accuracy, ph.penetration, ph.heat, ph.arc]).toEqual([2400, 5.0, 56, 36, 0.78, 1.0, 40, 40]);
    expect(ph.provenance.provenance).toBe('AU_MODIFIED');
    // Canon weapons never set the new optional fields.
    for (const w of WEAPON_LIST) {
      if (w.provenance.provenance === 'AU_MODIFIED' || w.id === 'javelin_rack') continue;
      expect(w.specialAmmo, w.id).toBeUndefined();
      expect(w.warhead, w.id).toBeUndefined();
      expect(w.degradedTargetBonus, w.id).toBeUndefined();
      expect(w.chargeTime, w.id).toBeUndefined();
      expect(w.salvo, w.id).toBeUndefined();
      expect(w.perMountHeat, w.id).toBeUndefined();
      expect(w.requiresSpecial, w.id).toBeUndefined();
    }
  });

  it('every hardpoint names a catalogue weapon and every HADES text keeps the penetrator/warhead wording', () => {
    for (const c of SHIP_CLASS_LIST) for (const h of c.hardpoints) expect(WEAPONS[h.weaponId], `${c.id} → ${h.weaponId}`).toBeDefined();
    const texts = [WEAPONS.apex_hyper_ma.name, WEAPONS.apex_hyper_ma.provenance.value, WEAPONS.apex_hyper_ma.provenance.note ?? ''];
    for (const t of texts) expect(forbiddenWording(t), t).toBe(false);
    expect(WEAPONS.apex_hyper_ma.provenance.value).toMatch(/penetrator/);
    expect(WEAPONS.apex_hyper_ma.provenance.value).toMatch(/warhead/);
    for (const c of SHIP_CLASS_LIST) expect(forbiddenWording(`${c.name} ${c.description} ${c.designProvenance.value}`), c.id).toBe(false);
  });
});

describe('names and transmissions', () => {
  it('carries the AP §14.2 name lists, led by SSV Omaha for the AU super-dreadnoughts, with no name in two lists', () => {
    expect(NAMES.alliance_dreadnought_k).toEqual(['SSV Kilimanjaro', 'SSV Orizaba', 'SSV Tai Shan', 'SSV Shasta', 'SSV Aconcagua']);
    expect(NAMES.alliance_dreadnought).toEqual(['SSV Everest', 'SSV Fuji', 'SSV Elbrus', 'SSV Logan', 'SSV Denali', 'SSV Ararat']);
    expect(NAMES.alliance_super_dreadnought[0]).toBe('SSV Omaha');
    expect(NAMES.cerberus_dreadnought).toEqual(['Black Fleet Flagship Prometheus', 'Eos', 'Hyperion']);
    expect(NAMES.normandy_valkyrie).toEqual(['SSV Normandy Valkyrie']);
    expect(NAMES.normandy_sr2).toEqual(['SSV Normandy SR-2']);
    expect(NAMES.alliance_frigate_thanix).toEqual(['SSV Thermopylae', 'SSV Austerlitz', 'SSV Sekigahara', 'SSV Adwa', 'SSV Plataea', 'SSV Carrhae', 'SSV Talas', 'SSV Lechfeld']);
    expect(NAMES.alliance_frigate_thanix).not.toContain('SSV Normandy SR-2');
    const seen = new Map<string, string>();
    for (const [cls, list] of Object.entries(NAMES)) {
      for (const n of list) {
        expect(seen.has(n), `${n} in ${seen.get(n)} and ${cls}`).toBe(false);
        seen.set(n, cls);
      }
    }
    expect(seen.get('SSV Trafalgar')).toBe('alliance_cruiser');
    for (const cls of Object.keys(NAMES)) expect(SHIP_CLASSES[cls], cls).toBeDefined();
    // Per-name provenance for stage D's verify list.
    expect(NAME_PROVENANCE['SSV Kilimanjaro'].provenance).toBe('CANON_CONFIRMED');
    expect(NAME_PROVENANCE['SSV Orizaba'].provenance).toBe('CANON_CONFIRMED');
    expect(NAME_PROVENANCE['SSV Everest'].provenance).toBe('CANON_CONFIRMED');
    for (const n of ['SSV Fuji', 'SSV Elbrus', 'SSV Logan', 'SSV Denali', 'SSV Ararat', 'SSV Tai Shan', 'SSV Shasta', 'SSV Aconcagua']) {
      expect(NAME_PROVENANCE[n].provenance, n).toBe('CANON_INFERRED');
      expect(NAME_PROVENANCE[n].value, n).toMatch(/verify/);
    }
    for (const n of NAMES.alliance_frigate_thanix) expect(NAME_PROVENANCE[n].provenance, n).toBe('SIMULATION_ESTIMATE');
    expect(NAME_PROVENANCE['SSV Omaha'].provenance).toBe('AU_MODIFIED');
  });

  it('every flagship has original transmissions in all three channels and the key resolves by class or by name', () => {
    for (const [k, set] of Object.entries(TRANSMISSIONS)) {
      for (const ch of ['missionKill', 'destroyed', 'reaction'] as const) {
        expect(set[ch].length, `${k}.${ch}`).toBeGreaterThan(0);
        for (const line of set[ch]) {
          expect(line.trim().length, `${k}.${ch}`).toBeGreaterThan(0);
          expect(forbiddenWording(line), line).toBe(false);
        }
      }
    }
    expect(TRANSMISSIONS.harbinger.missionKill).toEqual(['This cycle is not concluded.']);
    expect(TRANSMISSIONS.harbinger.destroyed).toContain('This vessel ends. The harvest does not.');
    expect(TRANSMISSIONS.sovereign.destroyed).toEqual(['Your victory is a rounding error.']);
    expect(TRANSMISSIONS.destiny_ascension.destroyed).toEqual(['Ascension is lost. Hold the line for Thessia.']);
    expect(TRANSMISSIONS.normandy_sr2.destroyed).toEqual(['Normandy actual — we are going down. Finish it without us.']);
    expect(TRANSMISSIONS.normandy_valkyrie.destroyed).toEqual(['Valkyrie to all ships: the line is yours.']);
    expect(TRANSMISSIONS_PROVENANCE.provenance).toBe('SIMULATION_ESTIMATE');
    expect(transmissionKey({ classId: 'harbinger', name: 'Harbinger' })).toBe('harbinger');
    expect(transmissionKey({ classId: 'reaper_capital', name: 'Sovereign' })).toBe('sovereign');
    expect(transmissionKey({ classId: 'reaper_capital', name: 'Reaper capital 02' })).toBeUndefined();
    expect(transmissionKey({ classId: 'normandy_sr2', name: 'SSV Normandy SR-2' })).toBe('normandy_sr2');
    expect(transmissionKey({ classId: 'normandy_valkyrie', name: 'SSV Normandy Valkyrie' })).toBe('normandy_valkyrie');
    expect(transmissionKey({ classId: 'destiny_ascension', name: 'Destiny Ascension' })).toBe('destiny_ascension');
    expect(transmissionKey({ classId: 'constructor', name: 'x' })).toBeUndefined();
    expect(transmissionKey({ classId: 'alliance_frigate_thanix', name: 'SSV Thermopylae' })).toBeUndefined();
  });
});

describe('the catalogue in the simulation', () => {
  it('scenarios field exactly one Normandy as normandy_sr2 (never scaled) and the stealth hulls start silent', () => {
    for (const id of ['alliance_fleet_engagement', 'battle_of_earth', 'cerberus_intervention', 'final_battle_of_earth', 'prime_apex_sol_defence']) {
      for (const preset of ['canon_me3', 'prime_apex']) {
        const cfg = getScenario(id).build(getPreset(preset), 1, { ...(id === 'final_battle_of_earth' ? { forces: 'default' } : {}) });
        const normandies = cfg.fleets.flatMap((f) => f.ships.filter((s) => s.classId === 'normandy_sr2'));
        expect(normandies.length, `${id} ${preset}`).toBe(1);
        expect(normandies[0].count, `${id} ${preset}`).toBe(1);
        expect(normandies[0].names).toEqual(['SSV Normandy SR-2']);
        expect(cfg.fleets.some((f) => f.ships.some((s) => s.classId === 'alliance_frigate_thanix' && s.names?.includes('SSV Normandy SR-2'))), `${id} ${preset}`).toBe(false);
      }
    }
    const absent = buildScenario('alliance_fleet_engagement', 'canon_me3', 1, { normandy: 'no' });
    expect(absent.fleets.some((f) => f.ships.some((s) => s.classId === 'normandy_sr2'))).toBe(false);
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 1));
    const normandy = sim.ships.find((s) => s.classId === 'normandy_sr2')!;
    expect(normandy.name).toBe('SSV Normandy SR-2');
    expect(normandy.flagship).toBe(true);
    expect(normandy.stealth).toEqual({ state: 'silent', sinkHeat: 0, revealedUntil: 0, ventingUntil: 0, capacity: 120, ventTime: 18, detectRange: 2.5 * BATTLESPACE_SCALE, revealOnFire: 10 });
    for (const s of sim.ships) if (s.classId !== 'normandy_sr2') expect(s.stealth, s.id).toBeUndefined();
    expect(sim.ships.find((s) => s.classId === 'alliance_dreadnought')?.name).toBe('SSV Everest');
    expect(sim.ships.find((s) => s.classId === 'reaper_capital')?.heatCapacity).toBe(100);
    expect(sim.ships.find((s) => s.classId === 'alliance_dreadnought')?.heatCapacity).toBe(200);
  });

  it('Reaper hulls launch Oculi through the generic carrier path', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 2));
    for (let i = 0; i < 200; i++) sim.step();
    const oculi = sim.ships.filter((s) => s.classId === 'reaper_oculus');
    expect(oculi.length).toBe(4 * 8 + 8 * 2);
    for (const o of oculi) {
      expect(o.side).toBe('B');
      expect(o.role).toBe('fighter');
      expect(o.maxBarriers).toBe(0);
      expect(o.carrierId).toBeDefined();
    }
    expect(sim.events.filter((e) => e.type === 'fighters_launched' && sim.getShip(e.carrierId)?.faction === 'reaper').length).toBeGreaterThan(0);
  });
});

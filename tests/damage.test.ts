import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { WEAPONS } from '@/data/weapons';
import { getShipClass } from '@/data/ships';
import { applyRulesToShip, applyRulesToWeapon } from '@/timelines/rules';
import { CANON_ME3, PRIME_APEX } from '@/timelines/presets';
import { applyDamage, hitProbability } from '@/simulation/damage';
import { BattleSimulation } from '@/simulation/battle';
import { buildScenario } from '@/scenarios';
import type { ShipState } from '@/simulation/types';

/** Build a ShipState directly from the catalogue for unit tests. */
function makeShip(classId: string, rules = CANON_ME3, side: 'A' | 'B' = 'A'): ShipState {
  const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', rules.id, 1));
  let found = sim.ships.find((s) => s.classId === classId);
  // Fighters launch from carriers a few seconds in.
  for (let i = 0; i < 120 && !found; i++) {
    sim.step();
    found = sim.ships.find((s) => s.classId === classId);
  }
  if (!found) throw new Error(`no ${classId} in scenario`);
  return { ...found, side, hull: found.maxHull, barriers: found.maxBarriers, armour: found.maxArmour, subsystems: { engines: 1, weapons: 1, sensors: 1 } };
}

const weapon = (id: string, faction: 'alliance' | 'reaper', cls: string, rules = CANON_ME3) =>
  applyRulesToWeapon(WEAPONS[id], faction, getShipClass(cls), rules, WEAPONS);

describe('damage model', () => {
  it('kinetic rounds are fully absorbed by barriers until they are exhausted', () => {
    const frigate = makeShip('alliance_frigate');
    const slug = weapon('alliance_frigate_main', 'alliance', 'alliance_frigate');
    const out = applyDamage(frigate, 70, slug, new Rng(1), 0);
    expect(out.barrierDamage).toBe(70);
    expect(out.hullDamage).toBe(0);
    expect(frigate.hull).toBe(frigate.maxHull);
  });

  it('a dreadnought slug destroys a frigate outright', () => {
    const frigate = makeShip('alliance_frigate');
    const slug = weapon('alliance_dn_main', 'alliance', 'alliance_dreadnought');
    const out = applyDamage(frigate, slug.damage, slug, new Rng(1), 0);
    expect(out.destroyed).toBe(true);
    expect(frigate.alive).toBe(false);
  });

  it('a Reaper beam passes most of its energy through barriers', () => {
    const cruiser = makeShip('alliance_cruiser');
    const beam = weapon('reaper_capital_beam', 'reaper', 'reaper_capital');
    const out = applyDamage(cruiser, 1000, beam, new Rng(1), 0);
    expect(out.barrierDamage).toBeCloseTo(400, 5); // 40% absorbed
    expect(out.hullDamage).toBeGreaterThan(500);
  });

  it('GARDIAN lasers ignore kinetic barriers entirely', () => {
    const fighter = makeShip('alliance_fighter');
    const laser = weapon('gardian', 'alliance', 'alliance_cruiser');
    const out = applyDamage(fighter, 14, laser, new Rng(1), 0);
    expect(out.barrierDamage).toBe(0);
    expect(out.hullDamage).toBeGreaterThan(0);
  });

  it('armour reduces hull damage from low-penetration weapons against Reaper plating', () => {
    const reaper = makeShip('reaper_capital', CANON_ME3, 'B');
    reaper.barriers = 0;
    const frigateGun = weapon('alliance_frigate_main', 'alliance', 'alliance_frigate');
    const dnGun = weapon('alliance_dn_main', 'alliance', 'alliance_dreadnought');
    const a = applyDamage(reaper, 70, frigateGun, new Rng(1), 0);
    const b = applyDamage(reaper, 1000, dnGun, new Rng(2), 0);
    expect(a.hullDamage / 70).toBeLessThan(0.3); // frigate guns barely scratch it
    expect(b.hullDamage / 1000).toBeGreaterThan(0.8); // dreadnought rounds get through
  });

  it('HADES rounds (Prime/Apex) bypass armour and pierce barriers more efficiently', () => {
    const canonReaper = makeShip('reaper_capital', CANON_ME3, 'B');
    const apexReaper = makeShip('reaper_capital', PRIME_APEX, 'B');
    const canonGun = weapon('alliance_dn_main', 'alliance', 'alliance_dreadnought', CANON_ME3);
    const apexGun = weapon('alliance_dn_main', 'alliance', 'alliance_dreadnought', PRIME_APEX);
    expect(apexGun.substitutedFrom).toBe('alliance_dn_main');
    expect(apexGun.id).toBe('apex_hyper_ma');
    expect(apexGun.armourBypass).toBeGreaterThan(0);
    const a = applyDamage(canonReaper, 1000, canonGun, new Rng(1), 0);
    const b = applyDamage(apexReaper, 1000, apexGun, new Rng(1), 0);
    // With full barriers: canon absorbs everything; HADES lets some through.
    expect(a.hullDamage).toBe(0);
    expect(b.hullDamage).toBeGreaterThan(0);
  });

  it('hit probability drops for fighters targeted by capital guns and rises for large targets', () => {
    const dn = makeShip('alliance_dreadnought');
    const fighter = makeShip('alliance_fighter', CANON_ME3, 'B');
    const reaper = makeShip('reaper_capital', CANON_ME3, 'B');
    const gun = weapon('alliance_dn_main', 'alliance', 'alliance_dreadnought');
    const pf = hitProbability(dn, fighter, gun, 10, 0);
    const pr = hitProbability(dn, reaper, gun, 10, 0);
    expect(pf).toBeLessThan(0.1);
    expect(pr).toBeGreaterThan(0.6);
    expect(pr).toBeLessThanOrEqual(0.98);
  });

  it('subsystems can be disabled by heavy hits', () => {
    const cruiser = makeShip('alliance_cruiser');
    cruiser.barriers = 0;
    const beam = weapon('reaper_capital_beam', 'reaper', 'reaper_capital');
    let disabled = false;
    for (let i = 0; i < 20 && cruiser.alive; i++) {
      const out = applyDamage(cruiser, 300, beam, new Rng(i), 0);
      if (out.subsystem) disabled = true;
    }
    expect(disabled).toBe(true);
  });

  it('effective ship stats scale with rule multipliers', () => {
    const cls = getShipClass('alliance_dreadnought');
    const canon = applyRulesToShip(cls, CANON_ME3);
    const apex = applyRulesToShip(cls, PRIME_APEX);
    expect(canon.hull).toBe(cls.hull.value);
    expect(apex.hull).toBeGreaterThan(canon.hull);
    expect(apex.barriers).toBeGreaterThan(canon.barriers);
  });
});

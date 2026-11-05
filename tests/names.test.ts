import { describe, expect, it } from 'vitest';
import { NAME_POOLS, NameRegistry, RESERVED_NAMES, reaperDesignation, roman } from '@/data/names';
import { getShipClass } from '@/data/ships';
import { NAMED_FLAGSHIPS } from '@/data/types';
import { NAMES, buildCustomBattle, type CustomBattleInput } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig, ShipState } from '@/simulation/types';

/**
 * Vessel names (brief §12): every organic hull is named from its navy's convention, deterministically from the battle
 * seed and from a generator of its own; canonical list names come first, Roman numerals follow exhaustion, canon names
 * stay unique, unnamed Reapers carry tracking designations.
 */

const NUMERAL = / (?:II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/;
const hulls = (sim: BattleSimulation): ShipState[] => sim.ships.filter((s) => s.role !== 'fighter');

/** A battle of more than 400 hulls across every faction (v1 custom-battle shape; nothing is stepped). */
const big = (seed = 11): CustomBattleInput => ({
  seed,
  rulesId: 'canon_me3',
  environment: 'deep_space',
  startingDistanceKm: 80,
  sideA: {
    faction: 'alliance',
    name: 'Alliance',
    formation: 'line_abreast',
    counts: { alliance_dreadnought: 30, alliance_dreadnought_k: 8, alliance_super_dreadnought: 3, alliance_carrier: 6, alliance_cruiser: 90, alliance_frigate: 70, alliance_frigate_thanix: 12, normandy_sr2: 1, sol_defence_platform: 3 },
  },
  sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { harbinger: 1, reaper_capital: 24, reaper_destroyer: 60 } },
  extraA: [
    { faction: 'turian', name: 'Hierarchy', formation: 'line_abreast', counts: { turian_dreadnought: 10, turian_super_dreadnought: 2, turian_cruiser: 36, turian_frigate: 30 } },
    { faction: 'asari', name: 'Republics', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 6, asari_cruiser: 32 } },
    { faction: 'salarian', name: 'Union', formation: 'line_abreast', counts: { salarian_dreadnought: 4, salarian_cruiser: 14, salarian_frigate: 30 } },
    { faction: 'quarian', name: 'Migrant Fleet', formation: 'defensive_screen', counts: { quarian_liveship: 3, quarian_heavy: 8, quarian_cruiser: 20 } },
    { faction: 'geth', name: 'Geth', formation: 'strike_wedge', counts: { geth_dreadnought: 3, geth_cruiser: 14, geth_frigate: 20 } },
    { faction: 'cerberus', name: 'Cerberus', formation: 'strike_wedge', counts: { cerberus_dreadnought: 3, cerberus_heavy_cruiser: 2, cerberus_cruiser: 12, cerberus_frigate: 16 } },
  ],
});

describe('vessel names (brief §12)', () => {
  it('a battle of more than 400 hulls names every organic hull once, by its navy’s convention, never with a bare number', () => {
    const sim = new BattleSimulation(buildCustomBattle(big()));
    const all = hulls(sim);
    expect(all.length).toBeGreaterThan(400);
    const names = all.map((s) => s.name);
    expect(new Set(names).size, 'a name appears twice').toBe(names.length);
    const canonical = new Set(Object.values(NAMES).flat());
    for (const s of all) {
      const cls = getShipClass(s.classId);
      // The v0.11 numbering ("Hierarchy cruiser 07") is gone for every hull.
      expect(s.name.startsWith(`${cls.shortName ?? cls.name} `), s.name).toBe(false);
      if (s.faction === 'reaper') continue;
      if (s.faction === 'geth') {
        expect(s.name, s.classId).toMatch(/^(?:Consensus|Collective|Platform|Array) \d-\d+$/);
        continue;
      }
      // Generated names never end in a bare number (a canonical name such as "SSV Normandy SR-2" may).
      if (!canonical.has(s.name)) expect(s.name, `${s.classId} ends in a bare number`).not.toMatch(/\d$/);
      if (s.faction === 'alliance') expect(s.name, s.classId).toMatch(s.role === 'fixed_platform' ? /^Sol Platform / : /^SSV /);
      if (s.faction === 'turian') expect(s.name, s.classId).toMatch(/^PFS /);
    }
    // Pools were exhausted: 90 cruisers outrun the 16 canonical names plus the city pool, so numerals follow the stems.
    const cruisers = all.filter((s) => s.classId === 'alliance_cruiser').map((s) => s.name);
    expect(cruisers.slice(0, NAMES.alliance_cruiser.length)).toEqual(NAMES.alliance_cruiser);
    const numbered = cruisers.filter((n) => NUMERAL.test(n));
    expect(numbered.length).toBe(90 - NAMES.alliance_cruiser.length - NAME_POOLS['alliance:line'].length);
    for (const n of numbered) expect(cruisers, n).toContain(n.replace(NUMERAL, ''));
    // Salarian light hulls are STG operations; generated quarian names carry the flotilla's crew form.
    const generatedSalarianFrigates = all.filter((s) => s.classId === 'salarian_frigate').slice(NAMES.salarian_frigate.length);
    for (const s of generatedSalarianFrigates) expect(s.name).toMatch(/^STG /);
    const generatedQuarians = all.filter((s) => s.classId === 'quarian_cruiser').slice(NAMES.quarian_cruiser.length);
    expect(generatedQuarians.length).toBeGreaterThan(0);
    for (const s of generatedQuarians) expect(s.name).toMatch(/ vas (?:Shellen|Tonbay)$/);
  });

  it('unnamed Reapers carry tracking designations, named Reapers keep their names', () => {
    const sim = new BattleSimulation(buildCustomBattle(big()));
    const reapers = hulls(sim).filter((s) => s.faction === 'reaper');
    const caps = reapers.filter((s) => s.classId === 'reaper_capital').map((s) => s.name);
    const dds = reapers.filter((s) => s.classId === 'reaper_destroyer').map((s) => s.name);
    expect(caps).toEqual(Array.from({ length: 24 }, (_, i) => reaperDesignation('reaper_capital', i + 1)));
    expect(dds).toEqual(Array.from({ length: 60 }, (_, i) => reaperDesignation('reaper_destroyer', i + 1)));
    expect(caps[6]).toBe('RC-07');
    expect(dds[22]).toBe('RD-23');
    expect(reapers.filter((s) => s.classId === 'harbinger').map((s) => s.name)).toEqual(['Harbinger']);
    // Oculi keep their squadron labels (the overlay leaves them unlabelled).
    expect(reaperDesignation('reaper_destroyer', 123)).toBe('RD-123');
  });

  it('canon names stay unique: never generated for another hull, never given a numeral, flagship status only where canon puts it', () => {
    const twice: CustomBattleInput = {
      ...big(3),
      sideA: { faction: 'alliance', name: 'Sword', formation: 'line_abreast', counts: { alliance_dreadnought_k: 12, normandy_sr2: 1, normandy_valkyrie: 1, alliance_dreadnought: 70 } },
      extraA: [
        { faction: 'alliance', name: 'Second Sword', formation: 'line_abreast', counts: { alliance_dreadnought_k: 12, normandy_sr2: 1, normandy_valkyrie: 1 } },
        { faction: 'asari', name: 'Republics', formation: 'line_abreast', counts: { destiny_ascension: 1 } },
        { faction: 'asari', name: 'Republics II', formation: 'line_abreast', counts: { destiny_ascension: 1 } },
      ],
    };
    const config = buildCustomBattle(twice);
    // A second Sovereign-named capital on side B (a scenario that names two of them by mistake).
    config.fleets.push({ ...config.fleets.find((f) => f.side === 'B')!, id: 'second', ships: [{ classId: 'reaper_capital', count: 2, names: ['Sovereign', 'Sovereign'] }] });
    const sim = new BattleSimulation(config);
    const names = hulls(sim).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const canonName of RESERVED_NAMES) {
      expect(names.filter((n) => n === canonName).length, canonName).toBeLessThanOrEqual(1);
      expect(names.some((n) => n.startsWith(`${canonName} `)), `${canonName} with a numeral`).toBe(false);
    }
    expect(names.filter((n) => n === 'SSV Kilimanjaro')).toHaveLength(1);
    expect(names.filter((n) => n === 'SSV Orizaba')).toHaveLength(1);
    expect(names.filter((n) => n === 'Sovereign')).toHaveLength(1);
    // 70 Everest-class hulls exhaust the list and the mountain pool; the numerals never touch a canon name.
    expect(names.filter((n) => NUMERAL.test(n)).length).toBeGreaterThan(0);
    // A generated name is never a flagship's: only the flagship classes and the one named Sovereign carry the flag.
    for (const s of hulls(sim)) {
      const cls = getShipClass(s.classId);
      if (!cls.flagship) expect(s.flagship, `${s.name} (${s.classId})`).toBe(s.name === 'Sovereign');
      if (NAMED_FLAGSHIPS.includes(s.name)) expect(s.flagship).toBe(true);
    }
  });

  it('is deterministic per seed, and naming never draws from the battle’s generator', () => {
    const names = (c: BattleConfig): string[] => hulls(new BattleSimulation(c)).map((s) => s.name);
    expect(names(buildCustomBattle(big(21)))).toEqual(names(buildCustomBattle(big(21))));
    const a = names(buildCustomBattle(big(21)));
    const b = names(buildCustomBattle(big(22)));
    expect(a).not.toEqual(b); // the pools are shuffled per seed
    // The canonical lists do not depend on the seed.
    expect(a.slice(0, NAMES.alliance_dreadnought.length)).toEqual(b.slice(0, NAMES.alliance_dreadnought.length));

    // The same battle with every hull named in the config (the registry draws nothing) and without names (the
    // registry shuffles its pools): the battle generator ends construction, and 300 steps later, in the same state.
    const plain = buildCustomBattle({ ...big(5), extraA: big(5).extraA!.slice(0, 2) });
    const named: BattleConfig = { ...plain, fleets: plain.fleets.map((f) => ({ ...f, ships: f.ships.map((s) => ({ ...s, names: Array.from({ length: s.count }, (_, i) => `Test hull ${f.id} ${s.classId} ${i}`) })) })) };
    const simPlain = new BattleSimulation(plain);
    const simNamed = new BattleSimulation(named);
    expect(simNamed.ships.some((s) => s.name.startsWith('Test hull'))).toBe(true);
    expect(simPlain.ships.some((s) => s.name.startsWith('Test hull'))).toBe(false);
    expect(simPlain.rng.getState()).toBe(simNamed.rng.getState());
    for (let i = 0; i < 300; i++) {
      simPlain.step();
      simNamed.step();
    }
    expect(simPlain.rng.getState()).toBe(simNamed.rng.getState());
    expect(simPlain.ships.map((s) => [s.id, s.hull, s.pos.x, s.pos.z])).toEqual(simNamed.ships.map((s) => [s.id, s.hull, s.pos.x, s.pos.z]));
  });

  it('the registry: preferred name, then the canonical list in order, then the convention pool, then numerals', () => {
    const reg = new NameRegistry(7);
    const heavy = getShipClass('quarian_heavy');
    const list = NAMES.quarian_heavy;
    const pool = NAME_POOLS[`quarian:capital`];
    const out = Array.from({ length: list.length + pool.length + 2 }, () => reg.next(heavy, undefined, list));
    expect(out.slice(0, list.length)).toEqual(list);
    expect([...out.slice(list.length, list.length + pool.length)].sort()).toEqual([...pool].sort());
    expect(out.slice(-2)).toEqual([`${list[0]} II`, `${list[1]} II`]);
    // A preferred (scripted) name is honoured while free and falls back to the convention when taken.
    expect(reg.next(getShipClass('turian_cruiser'), 'PFS Example')).toBe('PFS Example');
    expect(reg.next(getShipClass('turian_cruiser'), 'PFS Example')).toMatch(/^PFS /);
    expect(reg.has('PFS Example')).toBe(true);
    // The v0.11 class label kept in NAMES.geth_dreadnought is not a vessel name.
    expect(reg.next(getShipClass('geth_dreadnought'), NAMES.geth_dreadnought[0], NAMES.geth_dreadnought)).toMatch(/^Consensus \d-\d+$/);
    expect([1, 2, 3, 4, 9, 14, 40, 90, 400].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD']);
  });

  it('the convention pools never contain a canonical list name or a reserved canon name', () => {
    const canonical = new Set(Object.values(NAMES).flat());
    for (const [key, pool] of Object.entries(NAME_POOLS)) {
      expect(new Set(pool).size, `${key} repeats a name`).toBe(pool.length);
      for (const n of pool) {
        expect(canonical.has(n), `${key}: ${n} is a canonical list name`).toBe(false);
        expect(RESERVED_NAMES.includes(n), `${key}: ${n} is reserved`).toBe(false);
      }
    }
  });
});

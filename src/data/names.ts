import { Rng } from '@/core/rng';
import type { FactionId, ShipRole } from './types';

/**
 * Vessel names (brief §12, WORK_BREAKDOWN.md T16): every organic hull is named, never numbered; Reapers carry tracking
 * designations. Deterministic per battle seed, from its own generator (never `sim.rng`, so naming can never change a
 * battle). Conventions follow each navy: Alliance (SSV) dreadnoughts after mountains, cruisers after cities, frigates
 * after battles and historic places, carriers after scientists; turian (PFS) virtues, campaigns and colonies; asari
 * matriarchs, places and concepts; salarian scientists, rivers and STG operations; quarian ships with the "vas" crew
 * form of the flotilla they sail with; geth Consensus designations (number-and-dash, the geth manner); Cerberus
 * mythological and operational names. The lists below are real-world names or original inventions (SIMULATION_ESTIMATE
 * naming, no game text). A battle's preferred names (a scenario's canonical list, a scripted name) come first; when a
 * class has used every name, the pool repeats with Roman numerals (SSV Cairo II) — never a bare number. Canon names
 * stay unique: never generated for another hull, never given a numeral.
 */

/** Named canon (and the AU one-off) hulls: one per battle, never generated for any other hull, never numbered. */
export const RESERVED_NAMES: readonly string[] = [
  'SSV Normandy SR-2',
  'SSV Normandy Valkyrie',
  'Destiny Ascension',
  'SSV Kilimanjaro',
  'SSV Orizaba',
  'Sovereign',
  'Harbinger',
  'Kwunu',
];
const RESERVED = new Set(RESERVED_NAMES);

/**
 * Preferred names that are v0.11 class labels rather than vessel names (`NAMES.geth_dreadnought` — kept in the
 * scenario lists because the measured threat table fingerprints them): the generator gives such a hull its
 * convention's name instead.
 */
const CLASS_LABELS = new Set(['Geth dreadnought']);

const prefixed = (prefix: string, names: readonly string[]): string[] => names.map((n) => `${prefix} ${n}`);

const ALLIANCE_MOUNTAINS = prefixed('SSV', [
  'Annapurna', 'Makalu', 'Lhotse', 'Cho Oyu', 'Dhaulagiri', 'Manaslu', 'Nanga Parbat', 'Kangchenjunga', 'Matterhorn', 'Mont Blanc',
  'Rainier', 'Whitney', 'Kosciuszko', 'Vinson', 'Aoraki', 'Kenya', 'Stanley', 'Elgon', 'Toubkal', 'Etna', 'Teide', 'Cotopaxi',
  'Chimborazo', 'Huascaran', 'Illimani', 'Sajama', 'Damavand', 'Kazbek', 'Ushba', 'Belukha', 'Kinabalu', 'Ruapehu', 'Taranaki',
  'Robson', 'Saint Elias', 'Foraker', 'Sanford', 'Baker', 'Hood', 'Elbert', 'Mauna Loa', 'Haleakala', 'Jungfrau', 'Eiger',
  'Triglav', 'Olympus', 'Musala', 'Gerlach', 'Hekla', 'Pico', 'Popocatepetl', 'Orohena', 'Kailash', 'Muztagh', 'Khan Tengri',
]);
const ALLIANCE_CITIES = prefixed('SSV', [
  'Lagos', 'Nairobi', 'Lima', 'Bogota', 'Santiago', 'Montreal', 'Vancouver', 'Sydney', 'Auckland', 'Mumbai', 'Delhi', 'Karachi',
  'Dhaka', 'Manila', 'Seoul', 'Osaka', 'Hanoi', 'Bangkok', 'Istanbul', 'Tehran', 'Casablanca', 'Tunis', 'Athens', 'Rome', 'Vienna',
  'Prague', 'Budapest', 'Kyiv', 'Oslo', 'Stockholm', 'Helsinki', 'Copenhagen', 'Dublin', 'Lisbon', 'Edinburgh', 'Toronto',
  'Chicago', 'Houston', 'Denver', 'Havana', 'Caracas', 'Quito', 'Montevideo', 'Brasilia', 'Recife', 'Luanda', 'Kinshasa',
  'Addis Ababa', 'Accra', 'Dakar', 'Harare', 'Perth', 'Brisbane', 'Wellington', 'Reykjavik', 'Singapore', 'Kolkata', 'Lahore',
]);
const ALLIANCE_BATTLES = prefixed('SSV', [
  'Marathon', 'Gettysburg', 'Yorktown', 'Waterloo', 'Tours', 'Bunker Hill', 'Antietam', 'Verdun', 'Ypres', 'Gallipoli', 'Tobruk',
  'El Alamein', 'Coral Sea', 'Guadalcanal', 'Okinawa', 'Inchon', 'Plassey', 'Blenheim', 'Borodino', 'Leipzig', 'Marne',
  'Tannenberg', 'Jena', 'Lutzen', 'Pavia', 'Crecy', 'Poitiers', 'Bannockburn', 'Culloden', 'Naseby', 'Princeton', 'Trenton',
  'Concord', 'Valmy', 'Fleurus', 'Rivoli', 'Marengo', 'Wagram', 'Salamanca', 'Talavera', 'Quatre Bras', 'Inkerman', 'Balaclava',
  'Solferino', 'Gravelotte', 'Tsushima', 'Kadesh', 'Gaugamela', 'Zama', 'Cannae', 'Hattin', 'Ain Jalut', 'Panipat', 'Kosovo',
]);
const ALLIANCE_SCIENTISTS = prefixed('SSV', [
  'Curie', 'Darwin', 'Galileo', 'Kepler', 'Copernicus', 'Faraday', 'Maxwell', 'Bohr', 'Planck', 'Noether', 'Lovelace', 'Turing',
  'Feynman', 'Tesla', 'Meitner', 'Fermi', 'Dirac', 'Ramanujan', 'Euler', 'Gauss', 'Riemann', 'Hubble', 'Sagan', 'Leavitt',
  'Franklin', 'Hopper', 'Mendel', 'Pasteur', 'Lavoisier', 'Volta', 'Hertz', 'Rutherford', 'Chandrasekhar', 'Raman', 'Yukawa',
  'Tsiolkovsky', 'Korolev', 'Goddard', 'Oberth', 'Herschel', 'Huygens', 'Cassini', 'Brahe', 'Al-Khwarizmi', 'Ibn Sina',
]);
const SOL_PLATFORMS = prefixed('Sol Platform', [
  'Tycho', 'Clavius', 'Plato', 'Aristarchus', 'Grimaldi', 'Langrenus', 'Petavius', 'Theophilus', 'Ptolemaeus', 'Alphonsus',
  'Arzachel', 'Archimedes', 'Eratosthenes', 'Posidonius', 'Endymion', 'Schickard', 'Maginus', 'Longomontanus', 'Gassendi', 'Kopff',
]);
const TURIAN_CAPITAL = prefixed('PFS', [
  'Fidelity', 'Constancy', 'Discipline', 'Fortitude', 'Perseverance', 'Clemency', 'Temperance', 'Integrity', 'Sacrifice',
  'Dominion', 'Sovereign Will', 'Iron Accord', 'Unbroken', 'Valour', 'Honour', 'Duty', 'Obligation', 'Rectitude', 'Primacy',
  'Hierarch', 'Ascendancy', 'Auspice', 'Severity', 'Probity', 'Gravitas', 'Constant Watch', 'Long March', 'Eighth Legion',
]);
const TURIAN_LINE = prefixed('PFS', [
  'Bulwark', 'Aegis', 'Spearhead', 'Phalanx', 'Cohort', 'Tribune', 'Sentinel', 'Warden', 'Vanguard', 'Lancer', 'Pilum', 'Gladius',
  'Halberd', 'Talon', 'Gauntlet', 'Brazen', 'Undaunted', 'Implacable', 'Relentless Tide', 'Iron Resolve', 'Stoic', 'Austere',
  'Taetrus Dawn', 'Gothis Watch', 'Invictus Line', 'Cipritine Guard', 'Macedyn Shield', 'Digeris Spear', 'Edessa', 'Nimines',
]);
const TURIAN_LIGHT = prefixed('PFS', [
  'Swift', 'Keen', 'Vigil', 'Arrow', 'Javelin', 'Dart', 'Falcate', 'Skirmisher', 'Outrider', 'Pathfinder', 'Courser', 'Harrier',
  'Scout', 'Picket', 'Lookout', 'Ranger', 'Strider', 'Fleetfoot', 'Quickstep', 'Watchful', 'Wary', 'Alert', 'Ready', 'Prompt',
]);
const ASARI_CAPITAL = [
  'Matriarch Ielara', 'Matriarch Selonne', 'Matriarch Tevoria', 'Matriarch Vaenia', 'Matriarch Ilaris', 'Matriarch Anareth',
  'Matriarch Lysene', 'Matriarch Corrinth', 'Matriarch Eshara', 'Matriarch Dovelle', 'Matriarch Nimira', 'Matriarch Talisse',
  'Eternal Accord', 'Long Patience', 'Usella', 'Lesuss', 'Thessaly Light', 'Serenity of Armali', 'Unity', 'Harmony',
];
const ASARI_LINE = [
  'Grace', 'Lumen', 'Aurora', 'Patience', 'Accord', 'Concord of Lusia', 'Gentle Tide', 'Silver Reach', 'Still Water', 'Moonward',
  'Veiled Star', 'Morning Song', 'Quiet Strength', 'First Light', 'Clear Sky', 'Deep Current', 'Evening Star', 'Bright Shore',
  'Willow', 'Riverlight', 'Starfall', 'Dawnreach', 'Calm Horizon', 'Open Hand', 'Mirrorlake', 'Highvale', 'Ardent Grace', 'Solace',
];
const SALARIAN_CAPITAL = [
  'Veskar', 'Haltoun', 'Mivek', 'Dorrin', 'Ossan', 'Lirrek', 'Tavesh', 'Kessaru', 'Arenoth', 'Velloc', 'Quinsar', 'Nethis',
  'Ombrin', 'Saleth', 'Teruun', 'Pallix', 'Dravesh', 'Imrel', 'Corvan', 'Hessaru',
];
const SALARIAN_LINE = [
  'Arenoth River', 'Kessaru Delta', 'Silver Fen', 'Marsh Light', 'Talin Reach', 'Ombrin Falls', 'Veskar Ford', 'Lirrek Bend',
  'Quiet Marsh', 'Swift Water', 'Mire Watch', 'Delta Lantern', 'Fenwarden', 'Reed Spear', 'Long Estuary', 'Cold Spring',
  'Low Tide', 'High Water', 'Rainline', 'Mistrun', 'Floodgate', 'Clearwater', 'Shallows', 'Backwater', 'Rushes',
];
const SALARIAN_LIGHT = prefixed('STG', [
  'Probe', 'Trocar', 'Bodkin', 'Stiletto', 'Fleam', 'Gimlet', 'Bradawl', 'Burin', 'Graver', 'Tenon', 'Pipette', 'Caliper',
  'Forceps', 'Tweezer', 'Lens', 'Prism', 'Filament', 'Syringe', 'Cannula', 'Suture', 'Splinter', 'Shard', 'Whisker', 'Hairline',
]);
const QUARIAN_BASE = [
  'Kelim', 'Saraa', 'Tolan', 'Varis', 'Lenya', 'Hadra', 'Iskan', 'Moreni', 'Telis', 'Anvra', 'Yorell', 'Sena', 'Delan', 'Ruvan',
  'Ceyra', 'Ilith', 'Pashan', 'Morvel', 'Tanit', 'Oskel', 'Veyra', 'Lorin', 'Haskel', 'Neris',
];
const QUARIAN_FLOTILLAS = ['Rayya', 'Shellen', 'Tonbay'];
const CERBERUS_POOL = [
  'Tartarus', 'Nemesis', 'Erinys', 'Hecate', 'Thanatos', 'Hypnos', 'Styx', 'Lethe', 'Acheron', 'Phlegethon', 'Cocytus', 'Rhea',
  'Themis', 'Mnemosyne', 'Tethys', 'Oceanus', 'Atlas', 'Epimetheus', 'Pallas', 'Perses', 'Astraeus', 'Selene', 'Helios',
  'Vanguard', 'Bastion', 'Rook', 'Gambit', 'Longbow', 'Quarterstaff', 'Tripwire', 'Black Lantern', 'Iron Veil', 'Nightfall',
];

/** Name pools by `faction:tier` (tier: capital, line, light, carrier, platform); exported read-only for the tests. */
const POOLS: Record<string, readonly string[]> = {
  'alliance:capital': ALLIANCE_MOUNTAINS,
  'alliance:line': ALLIANCE_CITIES,
  'alliance:light': ALLIANCE_BATTLES,
  'alliance:carrier': ALLIANCE_SCIENTISTS,
  'alliance:platform': SOL_PLATFORMS,
  'turian:capital': TURIAN_CAPITAL,
  'turian:line': TURIAN_LINE,
  'turian:light': TURIAN_LIGHT,
  'turian:carrier': TURIAN_CAPITAL,
  'asari:capital': ASARI_CAPITAL,
  'asari:line': ASARI_LINE,
  'asari:light': ASARI_LINE,
  'asari:carrier': ASARI_CAPITAL,
  'salarian:capital': SALARIAN_CAPITAL,
  'salarian:line': SALARIAN_LINE,
  'salarian:light': SALARIAN_LIGHT,
  'salarian:carrier': SALARIAN_CAPITAL,
  'quarian:capital': QUARIAN_BASE.map((n) => `${n} vas ${QUARIAN_FLOTILLAS[0]}`),
  'quarian:line': QUARIAN_BASE.flatMap((n) => QUARIAN_FLOTILLAS.slice(1).map((f) => `${n} vas ${f}`)),
  'quarian:light': QUARIAN_BASE.map((n) => `${n} vas ${QUARIAN_FLOTILLAS[2]}`),
  'quarian:carrier': QUARIAN_BASE.map((n) => `${n} vas ${QUARIAN_FLOTILLAS[1]}`),
  'cerberus:capital': CERBERUS_POOL,
  'cerberus:line': CERBERUS_POOL,
  'cerberus:light': CERBERUS_POOL,
  'cerberus:carrier': CERBERUS_POOL,
};

/** Every convention pool by `faction:tier` (read-only; `tests/names.test.ts` checks them against the canonical lists). */
export const NAME_POOLS: Readonly<Record<string, readonly string[]>> = POOLS;

/** The tier of a role for the pools. */
function tierOf(role: ShipRole, classId: string): string {
  if (role === 'fixed_platform') return 'platform';
  if (role === 'carrier' || classId === 'quarian_liveship') return 'carrier';
  if (role === 'dreadnought' || role === 'super_dreadnought') return 'capital';
  if (role === 'cruiser') return 'line';
  return 'light';
}

/** The geth convention: Consensus designations in number-and-dash form, prefixed by the hull's tier. */
const GETH_PREFIX: Record<string, string> = { capital: 'Consensus', carrier: 'Consensus', line: 'Collective', light: 'Platform', platform: 'Array' };

const ROMAN: readonly [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
/** Roman numeral (1 → I, 2 → II, …). */
export function roman(n: number): string {
  let x = Math.max(1, Math.floor(n));
  let out = '';
  for (const [v, s] of ROMAN) {
    while (x >= v) {
      out += s;
      x -= v;
    }
  }
  return out;
}

/** Tracking designation of an unnamed Reaper (brief §12): capitals `RC-07`, destroyers `RD-23`. */
export const reaperDesignation = (role: ShipRole, n: number): string => `${role === 'reaper_capital' ? 'RC' : 'RD'}-${String(n).padStart(2, '0')}`;

/** What the registry needs to know about a class (kept structural, so this module needs no catalogue import). */
export interface NamedClass {
  id: string;
  faction: FactionId;
  role: ShipRole;
}

/**
 * One battle's vessel names: deterministic from the seed, unique across the battle. `next(cls, preferred, list)` names
 * a hull — its preferred name when free (a scenario's canonical list entry or a scripted name), else the class's
 * canonical `list` in order, then its convention's pool in a seeded order, then the same names with Roman numerals
 * (reserved canon names excepted). Reapers without a preferred name get tracking designations.
 */
export class NameRegistry {
  private readonly used = new Set<string>();
  private readonly rng: Rng;
  private readonly orders = new Map<string, string[]>();
  private readonly cursor = new Map<string, number>();
  private readonly reaperCount = { RC: 0, RD: 0 };
  private gethSerial: number;

  constructor(seed: number) {
    this.rng = new Rng(`names:${seed}`);
    this.gethSerial = 100 + this.rng.int(0, 800);
  }

  /** Whether a name is already taken in this battle. */
  has(name: string): boolean {
    return this.used.has(name);
  }

  private take(name: string): string {
    this.used.add(name);
    return name;
  }

  /** The seeded order of a pool (computed once per pool key and battle). */
  private orderOf(key: string, pool: readonly string[]): string[] {
    let order = this.orders.get(key);
    if (!order) {
      order = [...pool];
      for (let i = order.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.orders.set(key, order);
    }
    return order;
  }

  next(cls: NamedClass, preferred?: string, list: readonly string[] = []): string {
    if (preferred !== undefined && !this.used.has(preferred) && !CLASS_LABELS.has(preferred)) return this.take(preferred);
    if (cls.faction === 'reaper') {
      const key = cls.role === 'reaper_capital' ? 'RC' : 'RD';
      for (;;) {
        const name = reaperDesignation(cls.role, ++this.reaperCount[key]);
        if (!this.used.has(name)) return this.take(name);
      }
    }
    if (cls.faction === 'geth') {
      const prefix = GETH_PREFIX[tierOf(cls.role, cls.id)];
      for (;;) {
        this.gethSerial += 1 + this.rng.int(0, 7);
        const name = `${prefix} ${1 + (this.gethSerial % 9)}-${this.gethSerial}`;
        if (!this.used.has(name)) return this.take(name);
      }
    }
    // The class's canonical list in order, then its convention's pool in the battle's seeded order.
    const poolKey = `${cls.faction}:${tierOf(cls.role, cls.id)}`;
    const pool = POOLS[poolKey] ?? POOLS[`alliance:${tierOf(cls.role, cls.id)}`] ?? ALLIANCE_BATTLES;
    const names = [...list.filter((n) => !CLASS_LABELS.has(n)), ...this.orderOf(poolKey, pool).filter((n) => !RESERVED.has(n))];
    for (const n of names) if (!this.used.has(n)) return this.take(n);
    // Exhausted: the same names again with Roman numerals, II upwards; reserved canon names are never numbered.
    const numbered = names.filter((n) => !RESERVED.has(n));
    const key = `${cls.id}`;
    let k = this.cursor.get(key) ?? 0;
    for (;;) {
      const round = 2 + Math.floor(k / Math.max(1, numbered.length));
      const name = `${numbered[k % Math.max(1, numbered.length)] ?? cls.id} ${roman(round)}`;
      k++;
      if (!this.used.has(name)) {
        this.cursor.set(key, k);
        return this.take(name);
      }
    }
  }
}

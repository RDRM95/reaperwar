import { v3 } from '@/core/vec3';
import { FACTIONS } from '@/data/factions';
import { IES_STEALTH, SHIP_CLASSES } from '@/data/ships';
import { BARRIER_EFFICIENCY, HADES_WARHEAD, WEAPONS, WEAPON_LIST } from '@/data/weapons';
import { HADES_FUSE, HADES_GATE, UNIQUE_CLASS_IDS, type FactionId } from '@/data/types';
import { BattleSimulation } from '@/simulation/battle';
import * as SIM_CONSTANTS from '@/simulation/constants';
import { summarise } from '@/simulation/results';
import type { BattleConfig, FleetSpec, FormationType } from '@/simulation/types';
import { CANON_ME3 } from '@/timelines/presets';
import { cloneRules, isApexRules, type RuleSet } from '@/timelines/rules';
import { THREAT_PROBE_KEYS, THREAT_RUNGS, type RungGroup, type ThreatFingerprint, type ThreatRun } from '@/timelines/threat';
import { fleet } from './index';

/**
 * The threat reference engagement (docs/apex/TIMELINES_V2.md §1.1): a
 * Council-era coalition in one battle line against five Reaper groups of
 * growing size, four seeds each. SIMULATION_ESTIMATE: a compressed stand-in
 * like every scenario fleet, not a canon battle. Deterministic (every draw
 * comes from the seeded Rng inside BattleSimulation); not registered as a
 * Quick Battle scenario.
 */

export const THREAT_REFERENCE_ID = 'threat_reference';
export const THREAT_SEEDS = [1, 2, 3, 4] as const;

/** The longest weapon range in the catalogue, before any rule multiplier (nominal km). */
export const THREAT_LONGEST_RANGE = Math.max(...WEAPON_LIST.map((w) => w.range));
/** The two lines start 7 % beyond that range, so nobody opens fire before the first move (nominal km, 0.1 km steps). */
export const THREAT_STANDOFF = Math.round(10 * 1.07 * THREAT_LONGEST_RANGE) / 10;
/** The time limit: 3.2 × the time a canon Reaper capital at top speed needs to cross the standoff (whole seconds). */
export const THREAT_MAX_DURATION = Math.round((3.2 * THREAT_STANDOFF) / SHIP_CLASSES.reaper_capital.maxSpeed.value);

const cerberusAllied = (r: RuleSet): boolean => r.strategic.cerberusStance === 'cooperative' || r.strategic.cerberusStance === 'controls_reapers';

interface Contingent {
  id: string;
  faction: Exclude<FactionId, 'reaper'>;
  name: string;
  /** Anchor x (nominal km); every contingent stands on the coalition line, Cerberus 12 km behind it. */
  x: number;
  behind?: number;
  formation: FormationType;
  /** Extra predicate on top of "fleetStrength of the faction > 0" (0 = absent). */
  when?: (r: RuleSet) => boolean;
  counts: (r: RuleSet) => Record<string, number>;
}

/** §1.1, in this order: the order of the contingents and of the classes inside each fixes the random draws. */
export const THREAT_COALITION: readonly Contingent[] = [
  { id: 'ref-alliance', faction: 'alliance', name: 'Systems Alliance', x: -5, formation: 'line_abreast', counts: (r) => ({ alliance_dreadnought: 2, alliance_carrier: 1, alliance_cruiser: 3, alliance_frigate: 3, normandy_sr2: r.strategic.shepardAlive ? 1 : 0, normandy_valkyrie: r.special.valkyrieAvailable ? 1 : 0, alliance_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-turian', faction: 'turian', name: 'Turian Hierarchy', x: -15, formation: 'line_abreast', counts: (r) => ({ turian_dreadnought: 2, turian_cruiser: 3, turian_frigate: 3, turian_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-asari', faction: 'asari', name: 'Asari Republics', x: 5, formation: 'defensive_screen', counts: () => ({ asari_dreadnought: 1, asari_cruiser: 3 }) },
  { id: 'ref-salarian', faction: 'salarian', name: 'Salarian Union', x: 15, formation: 'line_abreast', counts: () => ({ salarian_dreadnought: 1, salarian_cruiser: 2, salarian_frigate: 2 }) },
  { id: 'ref-quarian', faction: 'quarian', name: 'Quarian fleet', x: 25, formation: 'defensive_screen', counts: () => ({ quarian_heavy: 1, quarian_cruiser: 3 }) },
  { id: 'ref-geth', faction: 'geth', name: 'Geth fleet', x: -25, formation: 'strike_wedge', counts: () => ({ geth_dreadnought: 1, geth_cruiser: 2, geth_frigate: 2 }) },
  { id: 'ref-cerberus', faction: 'cerberus', name: 'Cerberus', x: 0, behind: 12, formation: 'strike_wedge', when: cerberusAllied, counts: (r) => ({ cerberus_cruiser: 2, cerberus_frigate: 3, cerberus_dreadnought: isApexRules(r) ? 1 : 0 }) },
];

/** Whether a contingent fights under these rules: its faction is present (fleetStrength > 0) and its own predicate holds. */
export const contingentFields = (c: Contingent, rules: RuleSet): boolean => rules.fleetStrength[c.faction] > 0 && (!c.when || c.when(rules));

const reaperGroup = (rules: RuleSet, rung: number): FleetSpec => {
  const g = THREAT_RUNGS[rung];
  return fleet('ref-reapers', 'reaper', rules, {
    counts: { reaper_capital: g.capitals, reaper_destroyer: g.destroyers },
    name: `Reaper ${g.name.toLowerCase()}`,
    side: 'B',
    formation: 'strike_wedge',
    position: v3(0, 0, THREAT_STANDOFF / 2),
    heading: v3(0, 0, -1),
    playerControlled: false,
  });
};

const countOf = (f: FleetSpec, classId: string): number => f.ships.filter((s) => s.classId === classId).reduce((a, s) => a + s.count, 0);

/** The five Reaper groups as this timeline deploys them (after `fleetStrength.reaper`). */
export const threatRungGroups = (rules: RuleSet): RungGroup[] =>
  THREAT_RUNGS.map((g, k) => {
    const f = reaperGroup(rules, k);
    return { name: g.name, capitals: countOf(f, 'reaper_capital'), destroyers: countOf(f, 'reaper_destroyer') };
  });

/** `rung` is 0-based (0 = Raid … 4 = Harvest fleet). Fleet scaling is on: every faction's fleetStrength and factionOverrides act. */
export function buildThreatReference(rules: RuleSet, rung: number, seed: number): BattleConfig {
  const g = THREAT_RUNGS[rung];
  const line = -THREAT_STANDOFF / 2;
  const fleets: FleetSpec[] = THREAT_COALITION.filter((c) => contingentFields(c, rules)).map((c) =>
    fleet(c.id, c.faction, rules, { counts: c.counts(rules), name: c.name, formation: c.formation, position: v3(c.x, 0, line - (c.behind ?? 0)), heading: v3(0, 0, 1) }),
  );
  fleets.push(reaperGroup(rules, rung));
  return {
    id: `${THREAT_REFERENCE_ID}-${rules.id}-r${rung + 1}-${seed}`,
    name: `Threat reference: ${g.name}`,
    scenarioId: THREAT_REFERENCE_ID,
    seed,
    rules,
    environment: 'deep_space',
    maxDuration: THREAT_MAX_DURATION,
    perspectiveSide: 'A',
    objective: 'Destroy the Reaper group.',
    fleets: fleets.filter((f) => f.ships.length > 0),
  };
}

/** The §1.2 metrics of a finished battle. */
export function threatRunOf(sim: BattleSimulation, rung: number, seed: number): ThreatRun {
  const result = sim.result ?? summarise(sim);
  let value = 0;
  let lost = 0;
  for (const s of sim.ships) {
    if (s.side !== 'B' || s.role === 'fighter') continue;
    value += s.pointValue;
    lost += s.pointValue * (s.alive ? Math.max(0, 1 - s.hull / s.maxHull) : 1);
  }
  return {
    rung,
    seed,
    reaperLoss: value > 0 ? lost / value : 0,
    organicSurvival: result.sides.A.survivalPercent / 100,
    winner: result.winner,
    duration: sim.time,
    timeLimit: sim.time >= sim.config.maxDuration,
  };
}

/** Synchronous: the script's path. Tests step with tests/support/async.ts `runSimAsync` and call `threatRunOf`. */
export function runThreatReference(rules: RuleSet, rung: number, seed: number): ThreatRun {
  const sim = new BattleSimulation(buildThreatReference(rules, rung, seed));
  sim.run();
  return threatRunOf(sim, rung, seed);
}

// ------------------------------------------------------------------ the probe ladder (TIMELINES_V2.md §1.3)

/**
 * A probe of the ladder: canon with every organic faction's fire rate, heat capacity and hull integrity × m
 * (`THREAT_PROBE_KEYS`; heat capacity moves with the fire rate so the heat cycle is unchanged). Preset-blind:
 * built from canon alone, the ladder's own m = 1 point.
 */
export function threatProbeRules(m: number): RuleSet {
  const r = cloneRules(CANON_ME3);
  r.id = `probe_m${m}`;
  r.name = `Probe ×${m}`;
  for (const k of THREAT_PROBE_KEYS) r.organic[k] = m;
  return r;
}

// ------------------------------------------------------------------ fingerprint (TIMELINES_V2.md §1.8)

/** Text that never reaches a battle: names, descriptions, provenance notes and colours. */
const TEXT_KEYS: ReadonlySet<string> = new Set(['name', 'shortName', 'description', 'note', 'provenance', 'designProvenance', 'colour', 'colourHex', 'engineColourHex', 'tagline', 'historyChanges', 'objective']);

const isSourced = (x: object): x is { value: unknown } => 'value' in x && 'provenance' in x;

/** A stable text form of plain data: keys sorted, numbers in full (Infinity kept), Sourced values reduced to `.value`, text keys and functions dropped. */
function stable(x: unknown): string {
  if (x === null || x === undefined) return 'null';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (typeof x === 'function') return 'fn';
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (typeof x === 'object') {
    if (isSourced(x)) return stable(x.value);
    const keys = Object.keys(x)
      .filter((k) => !TEXT_KEYS.has(k) && typeof (x as Record<string, unknown>)[k] !== 'function' && (x as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(x));
}

/** cyrb53: a 53-bit string hash (public domain), as 14 hex digits. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The battle-relevant knobs of a rule set (every field but its id and texts). */
const rulesKnobs = (r: RuleSet): unknown => ({ organic: r.organic, reaper: r.reaper, factionOverrides: r.factionOverrides, special: r.special, fleetStrength: r.fleetStrength, strategic: r.strategic });

/** The reference battles a rule set builds, without the rules themselves (rungs × seeds share fleets; seed 1 stands for all). */
const referenceOf = (r: RuleSet): unknown =>
  THREAT_RUNGS.map((_, k) => {
    const { rules: _rules, id: _id, seed: _seed, ...rest } = buildThreatReference(r, k, 1);
    return rest;
  });

/** The battle-relevant catalogue: weapons, ship classes, faction doctrine (and how many comms lines each event draws from), and the data and simulation constants. */
export const threatCatalogueFingerprint = (): string =>
  hash53(
    stable({
      weapons: WEAPONS,
      ships: SHIP_CLASSES,
      factions: Object.fromEntries(Object.entries(FACTIONS).map(([id, f]) => [id, { doctrine: f.doctrine, comms: Object.fromEntries(Object.entries(f.comms).map(([k, v]) => [k, v.length])) }])),
      constants: { barrierEfficiency: BARRIER_EFFICIENCY, hadesWarhead: HADES_WARHEAD, hadesFuse: HADES_FUSE, hadesGate: HADES_GATE, iesStealth: IES_STEALTH, unique: UNIQUE_CLASS_IDS, simulation: { ...SIM_CONSTANTS } },
    }),
  );

/** A preset's knobs and the reference fleets it builds (so a change to `fleet()` or to the coalition shows up too). */
export const threatPresetFingerprint = (r: RuleSet): string => hash53(stable({ rules: rulesKnobs(r), reference: referenceOf(r) }));

/** What a measurement of these presets was taken from (§1.8): `threatMeasured.ts` stores it, a test and `--check` compare it. */
export const threatFingerprint = (presets: readonly RuleSet[]): ThreatFingerprint => ({
  catalogue: threatCatalogueFingerprint(),
  presets: Object.fromEntries(presets.map((p) => [p.id, threatPresetFingerprint(p)])),
});

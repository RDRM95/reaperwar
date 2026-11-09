import { au, canon, estimate, inferred, type Sourced } from '@/core/provenance';
import { v3, type Vec3 } from '@/core/vec3';
import { UNIQUE_CLASS_IDS, type FactionId } from '@/data/types';
import type { BattleConfig, Environment, FleetSpec, FormationType, Readiness, ShipSpec, Side } from '@/simulation/types';
import type { RuleSet } from '@/timelines/rules';

/**
 * Fleet builders and the canonical vessel-name lists the scenarios share (WORK_BREAKDOWN.md §1.3.12: `fleet`,
 * `reaperFleet`, `base`, `NAMES`; re-exported from `src/scenarios/index.ts`). `fleet()` is also what the threat
 * table's reference engagement builds with, and its fingerprint hashes the specs (`threatReference.ts`): an option
 * left out must leave the spec exactly as it was.
 */

/**
 * World-state key that controls whether scenario fleets scale with the rule
 * set's fleetStrength. Comparison mode fixes fleets so only technology and
 * doctrine differ between the two runs.
 */
export const FLEET_SCALING_KEY = 'fleet_scaling';

/**
 * More room between fleets (brief §22, "more space in the map between fleets"): every scenario's fleet positions,
 * late arrivals and time limit are 1.6 × the 0.12 values, so the fleets start well apart, visibly manoeuvre and close,
 * and the battles still resolve. The full codex-scale change follows in the pacing pass (docs/apex/PACING_PLAN.md).
 * SIMULATION_ESTIMATE. (Defined here so `finalBattle.ts` shares it without an import cycle; re-exported by the index.)
 */
export const SCENARIO_SPACING = 1.6;
/** A scenario position (nominal km) at the §22 spacing. */
export const scenarioAt = (x: number, y: number, z: number): Vec3 => v3(x * SCENARIO_SPACING, y * SCENARIO_SPACING, z * SCENARIO_SPACING);
/** A scenario time (arrival or time limit, s) at the §22 spacing, in whole seconds. */
export const scenarioSecs = (t: number): number => Math.round(t * SCENARIO_SPACING);

/** Everest-class dreadnoughts (ADOPTION_PLAN.md §14.2): the mountain convention, ending in SSV Ararat; no battle names. */
const ALLIANCE_DN_NAMES = ['SSV Everest', 'SSV Fuji', 'SSV Elbrus', 'SSV Logan', 'SSV Denali', 'SSV Ararat'];
/** Kilimanjaro-class dreadnoughts: SSV Kilimanjaro and SSV Orizaba are canon, the rest are the pack's list (verify). */
const ALLIANCE_DN_K_NAMES = ['SSV Kilimanjaro', 'SSV Orizaba', 'SSV Tai Shan', 'SSV Shasta', 'SSV Aconcagua'];
const ALLIANCE_CRUISER_NAMES = ['SSV Emden', 'SSV Geneva', 'SSV Warsaw', 'SSV Cairo', 'SSV Madrid', 'SSV Shanghai', 'SSV Cape Town', 'SSV Jakarta', 'SSV Hastings', 'SSV Agincourt', 'SSV Trafalgar', 'SSV Midway', 'SSV Leyte', 'SSV Jutland', 'SSV Salamis', 'SSV Lepanto'];
const ALLIANCE_FRIGATE_NAMES = ['SSV Hong Kong', 'SSV Iwo Jima', 'SSV Cheyenne', 'SSV Agamemnon', 'SSV Achilles', 'SSV Perugia', 'SSV Hyderabad', 'SSV Trident', 'SSV Lexington', 'SSV Saratoga'];
/** SR-2-pattern stealth frigates: original names (SIMULATION_ESTIMATE); the Normandy itself is `normandy_sr2`. */
const ALLIANCE_PATTERN_FRIGATE_NAMES = ['SSV Thermopylae', 'SSV Austerlitz', 'SSV Sekigahara', 'SSV Adwa', 'SSV Plataea', 'SSV Carrhae', 'SSV Talas', 'SSV Lechfeld'];
const TURIAN_DN_NAMES = ['PFS Indomitable', 'PFS Vengeance', 'PFS Cipritine', 'PFS Digeris', 'PFS Taetrus', 'PFS Invictus', 'PFS Macedyn', 'PFS Oma Ker'];
const TURIAN_CRUISER_NAMES = ['PFS Resolute', 'PFS Steadfast', 'PFS Unyielding', 'PFS Adamant', 'PFS Vigilant', 'PFS Relentless', 'PFS Spirit of Menae', 'PFS Bastion', 'PFS Rampart', 'PFS Ardent', 'PFS Stalwart', 'PFS Tenacious'];
const ASARI_DN_NAMES = ['Cyone', 'Serrice Guard', 'Armali', 'Lusia'];
const ASARI_CRUISER_NAMES = ['Tevura', 'Athame', 'Lucen', 'Piares', 'Nevos', 'Dilinaga', 'Anthea', 'Illium Dawn', 'Thessia Star', 'Nos Astra', 'Sanves', 'Niacal'];
const CERBERUS_NAMES = ['Minuteman', 'Cronos', 'Elbrus', 'Horizon', 'Sanctum', 'Covenant', 'Lazarus', 'Overlord', 'Firewalker', 'Arrival'];

/** Canonical name lists by class (names are original where canon gives none). A name never appears in two lists. */
export const NAMES: Record<string, string[]> = {
  alliance_dreadnought: ALLIANCE_DN_NAMES,
  alliance_dreadnought_k: ALLIANCE_DN_K_NAMES,
  /** The owner's AU super-dreadnought line is led by SSV Omaha (docs/apex/INTEGRATION_NOTES.md). */
  alliance_super_dreadnought: ['SSV Omaha', 'SSV Olympus Mons', 'SSV Mauna Kea'],
  alliance_cruiser: ALLIANCE_CRUISER_NAMES,
  alliance_frigate: ALLIANCE_FRIGATE_NAMES,
  alliance_carrier: ['SSV Einstein', 'SSV Hawking', 'SSV Newton'],
  alliance_frigate_thanix: ALLIANCE_PATTERN_FRIGATE_NAMES,
  normandy_sr2: ['SSV Normandy SR-2'],
  normandy_valkyrie: ['SSV Normandy Valkyrie'],
  turian_dreadnought: TURIAN_DN_NAMES,
  turian_super_dreadnought: ['PFS Praetor', 'PFS Legate'],
  turian_cruiser: TURIAN_CRUISER_NAMES,
  asari_dreadnought: ASARI_DN_NAMES,
  asari_cruiser: ASARI_CRUISER_NAMES,
  destiny_ascension: ['Destiny Ascension'],
  salarian_dreadnought: ['Sur’Kesh', 'Mannovai', 'Jaëto', 'Erinle'],
  salarian_cruiser: ['Talat', 'Nasurn', 'Aegohr', 'Halegeuse', 'Gorot', 'Heshtok', 'Dagnes', 'Senoquol', 'Tuchanka Watch', 'Kirrahe', 'Virmire', 'Solus'],
  salarian_frigate: ['STG Scalpel', 'STG Needle', 'STG Lancet', 'STG Quill', 'STG Thorn', 'STG Barb', 'STG Sliver', 'STG Spine', 'STG Awl', 'STG Stylus'],
  cerberus_cruiser: CERBERUS_NAMES,
  cerberus_heavy_cruiser: ['Erebus', 'Nyx'],
  cerberus_dreadnought: ['Black Fleet Flagship Prometheus', 'Eos', 'Hyperion'],
  harbinger: ['Harbinger'],
  quarian_liveship: ['Rayya', 'Shellen', 'Tonbay'],
  quarian_heavy: ['Qwib-Qwib', 'Alarei', 'Neema', 'Idenna', 'Moreh', 'Iktomi'],
  quarian_cruiser: ['Usela', 'Tesleya', 'Chayym', 'Defrahnz', 'Honorata', 'Konesh', 'Rannoch Hope', 'Tasi', 'Ulnay', 'Yaska'],
  geth_dreadnought: ['Geth dreadnought'],
};

/**
 * Per-name provenance for the lists ADOPTION_PLAN.md §14.2 anchors (stage D
 * copies the CANON_INFERRED entries onto LORE_REFERENCE.md's verify list).
 */
export const NAME_PROVENANCE: Record<string, Sourced<string>> = {
  'SSV Kilimanjaro': canon('Kilimanjaro-class dreadnought named in ME3 (LORE_REFERENCE.md).'),
  'SSV Orizaba': canon('Kilimanjaro-class dreadnought named in ME3 (LORE_REFERENCE.md).'),
  'SSV Everest': canon('The Everest-class name is canon (ME1 codex); the lead ship bears the class name.'),
  ...Object.fromEntries(['SSV Fuji', 'SSV Elbrus', 'SSV Logan', 'SSV Denali', 'SSV Ararat', 'SSV Tai Shan', 'SSV Shasta', 'SSV Aconcagua'].map((n) => [n, inferred('pack list; verify class')])),
  ...Object.fromEntries(ALLIANCE_PATTERN_FRIGATE_NAMES.map((n) => [n, estimate('Original name for an SR-2-pattern stealth frigate; the trilogy names only the Normandy.')])),
  'SSV Normandy SR-2': canon('The Normandy SR-2 is canon (ME2–ME3).'),
  'SSV Normandy Valkyrie': au('AU LOCK one-off (ADOPTION_PLAN.md §8).'),
  ...Object.fromEntries(['SSV Omaha', 'SSV Olympus Mons', 'SSV Mauna Kea', 'PFS Praetor', 'PFS Legate', 'Erebus', 'Nyx', 'Black Fleet Flagship Prometheus', 'Eos', 'Hyperion'].map((n) => [n, au('Original name for an alternate-universe hull.')])),
};

/** Scale a ship count by a fleet strength multiplier, never below 1 if the base was >= 1. */
export const scaleCount = (base: number, mult: number): number => (base <= 0 ? 0 : Math.max(1, Math.round(base * mult)));

const fleetMult = (rules: RuleSet, faction: FactionId, ws: Record<string, string>): number =>
  ws[FLEET_SCALING_KEY] === 'fixed' ? 1 : rules.fleetStrength[faction];

export interface FleetOpts {
  /** Ship counts by class id (before scaling). */
  counts: Record<string, number>;
  /** Classes that do not scale with fleet strength (named single ships). */
  fixedClasses?: string[];
  name: string;
  side?: Side;
  formation?: FormationType;
  position?: Vec3;
  heading?: Vec3;
  mult?: number;
  arrivalTime?: number;
  playerControlled?: boolean;
  ws?: Record<string, string>;
  initialOrder?: FleetSpec['initialOrder'];
  /** Start each class's canonical name list this many entries in (a second fleet of a class names its hulls further down). */
  nameOffsets?: Record<string, number>;
  /** Readiness tier (AP §1.6): only the named Apex compositions set it; canon scenarios never do. */
  readiness?: Readiness;
  /** A fixed-platform fleet: never moves, move orders are rejected. */
  static?: boolean;
  /** Hostile to both sides for targeting (AP §4.1); bookkeeping stays with `side`. */
  rogue?: boolean;
  /** `'beat'`: deployed only by a `spawn_wave` beat (the Final Battle's arrival waves). */
  arrivalMode?: 'time' | 'beat';
  /** The fleet arrives with the FTL flash and run-in. */
  arrivalFlash?: boolean;
}

/** Generic fleet builder for any faction. */
export function fleet(id: string, faction: FactionId, rules: RuleSet, opts: FleetOpts): FleetSpec {
  const m = opts.mult ?? fleetMult(rules, faction, opts.ws ?? {});
  const ships: ShipSpec[] = [];
  for (const [classId, baseCount] of Object.entries(opts.counts)) {
    if (baseCount <= 0) continue;
    // Unique hulls (Harbinger, the Ascension, the Normandy, the Valkyrie) exist once per battle and never scale (AP §22.1).
    const unique = UNIQUE_CLASS_IDS.includes(classId);
    const fixed = unique || opts.fixedClasses?.includes(classId);
    // Carriers scale more conservatively than the line.
    const mult = fixed ? 1 : classId.endsWith('carrier') ? Math.min(m, 1.5) : m;
    const count = unique ? Math.min(1, baseCount) : scaleCount(baseCount, mult);
    const offset = opts.nameOffsets?.[classId] ?? 0;
    const list = NAMES[classId];
    ships.push({ classId, count, names: offset > 0 && list ? list.slice(offset) : list });
  }
  const side = opts.side ?? (faction === 'reaper' ? 'B' : 'A');
  return {
    id,
    name: opts.name,
    faction,
    side,
    ships,
    formation: opts.formation ?? (faction === 'reaper' ? 'strike_wedge' : 'defensive_screen'),
    position: opts.position ?? (side === 'A' ? v3(0, 0, -36) : v3(0, 0, 40)),
    heading: opts.heading ?? (side === 'A' ? v3(0, 0, 1) : v3(0, 0, -1)),
    playerControlled: opts.playerControlled ?? side === 'A',
    arrivalTime: opts.arrivalTime,
    initialOrder: opts.initialOrder,
    // Optional V2 fields only when set, so a spec built without them is exactly the v0.11 spec.
    ...(opts.readiness !== undefined ? { readiness: opts.readiness } : {}),
    ...(opts.static !== undefined ? { static: opts.static } : {}),
    ...(opts.rogue !== undefined ? { rogue: opts.rogue } : {}),
    ...(opts.arrivalMode !== undefined ? { arrivalMode: opts.arrivalMode } : {}),
    ...(opts.arrivalFlash !== undefined ? { arrivalFlash: opts.arrivalFlash } : {}),
  };
}

export interface ReaperFleetOpts {
  capitals: number;
  destroyers: number;
  harbinger?: boolean;
  name?: string;
  side?: Side;
  position?: Vec3;
  heading?: Vec3;
  arrivalTime?: number;
  mult?: number;
  ws?: Record<string, string>;
  formation?: FormationType;
  initialOrder?: FleetSpec['initialOrder'];
  arrivalFlash?: boolean;
}

/** A Reaper fleet: Harbinger (fixed, unique) when asked, capitals and destroyers scaled with the Reaper fleet strength. */
export const reaperFleet = (id: string, rules: RuleSet, opts: ReaperFleetOpts): FleetSpec =>
  fleet(id, 'reaper', rules, {
    counts: { ...(opts.harbinger ? { harbinger: 1 } : {}), reaper_capital: opts.capitals, reaper_destroyer: opts.destroyers },
    fixedClasses: ['harbinger'],
    name: opts.name ?? 'Reaper harvest group',
    side: opts.side,
    position: opts.position,
    heading: opts.heading,
    arrivalTime: opts.arrivalTime,
    mult: opts.mult,
    ws: opts.ws,
    formation: opts.formation,
    playerControlled: opts.side === 'A',
    initialOrder: opts.initialOrder,
    arrivalFlash: opts.arrivalFlash,
  });

/** The common shell of a scenario's battle config. */
export const base = (id: string, name: string, scenarioId: string, seed: number, rules: RuleSet, environment: Environment, maxDuration: number, objective: string, ws: Record<string, string>, fleets: FleetSpec[]): BattleConfig => ({
  id: `${id}-${rules.id}-${seed}`,
  name,
  scenarioId,
  seed,
  rules,
  environment,
  maxDuration,
  perspectiveSide: 'A',
  objective,
  worldState: ws,
  fleets,
});

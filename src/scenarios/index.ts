import { v3 } from '@/core/vec3';
import { getPreset } from '@/timelines/presets';
import type { RuleSet } from '@/timelines/rules';
import type { BattleConfig, Environment, FleetSpec, FormationType, ShipSpec } from '@/simulation/types';

/**
 * Battle scenarios. Each scenario builds a BattleConfig from a rule set and a
 * seed. Fleet sizes marked SIMULATION_ESTIMATE are compressed representations
 * of much larger canon engagements so that the battle is watchable.
 */

export interface WorldStateOption {
  id: string;
  label: string;
  /** Provenance category for the UI. */
  kind: 'player_dependent' | 'extrapolation' | 'au';
  description: string;
  choices: { id: string; label: string; description: string }[];
  default: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  subtitle: string;
  environment: Environment;
  description: string;
  /** Which timelines this scenario is designed for (others still run). */
  recommendedRules: string[];
  /** Scenario is only meaningful in AU timelines. */
  auOnly?: boolean;
  worldState?: WorldStateOption[];
  objective: string;
  maxDuration: number;
  build: (rules: RuleSet, seed: number, worldState: Record<string, string>) => BattleConfig;
  /** Short lore note displayed in the briefing. */
  briefing: string[];
}

const ALLIANCE_DN_NAMES = ['SSV Kilimanjaro', 'SSV Orizaba', 'SSV Fuji', 'SSV Elbrus', 'SSV Aconcagua', 'SSV Logan', 'SSV Tai Shan', 'SSV Shasta', 'SSV Everest', 'SSV Denali'];
const ALLIANCE_CRUISER_NAMES = ['SSV Emden', 'SSV Geneva', 'SSV Warsaw', 'SSV Cairo', 'SSV Madrid', 'SSV Shanghai', 'SSV Cape Town', 'SSV Jakarta', 'SSV Hastings', 'SSV Agincourt', 'SSV Trafalgar', 'SSV Midway', 'SSV Leyte', 'SSV Jutland', 'SSV Salamis', 'SSV Lepanto'];
const ALLIANCE_FRIGATE_NAMES = ['SSV Hong Kong', 'SSV Iwo Jima', 'SSV Cheyenne', 'SSV Agamemnon', 'SSV Achilles', 'SSV Perugia', 'SSV Hyderabad', 'SSV Trident', 'SSV Lexington', 'SSV Saratoga'];

/** Scale a ship count by a fleet strength multiplier, never below 1 if the base was >= 1. */
export const scaleCount = (base: number, mult: number): number => (base <= 0 ? 0 : Math.max(1, Math.round(base * mult)));

/**
 * World-state key that controls whether scenario fleets scale with the rule
 * set's fleetStrength. Comparison mode fixes fleets so only technology and
 * doctrine differ between the two runs.
 */
export const FLEET_SCALING_KEY = 'fleet_scaling';

const fleetMult = (rules: RuleSet, faction: keyof RuleSet['fleetStrength'], ws: Record<string, string>): number =>
  ws[FLEET_SCALING_KEY] === 'fixed' ? 1 : rules.fleetStrength[faction];

function allianceFleet(id: string, rules: RuleSet, opts: { dn: number; ca: number; ff: number; cv: number; normandy?: boolean; formation?: FormationType; position?: ReturnType<typeof v3>; heading?: ReturnType<typeof v3>; mult?: number; name?: string; arrivalTime?: number; ws?: Record<string, string> }): FleetSpec {
  const m = opts.mult ?? fleetMult(rules, 'alliance', opts.ws ?? {});
  const ships: ShipSpec[] = [];
  const dn = scaleCount(opts.dn, m);
  const ca = scaleCount(opts.ca, m);
  const ff = scaleCount(opts.ff, m);
  const cv = opts.cv > 0 ? scaleCount(opts.cv, Math.min(m, 1.5)) : 0;
  if (dn > 0) ships.push({ classId: 'alliance_dreadnought', count: dn, names: ALLIANCE_DN_NAMES });
  if (cv > 0) ships.push({ classId: 'alliance_carrier', count: cv, names: ['SSV Einstein', 'SSV Hawking', 'SSV Newton'] });
  if (ca > 0) ships.push({ classId: 'alliance_cruiser', count: ca, names: ALLIANCE_CRUISER_NAMES });
  if (opts.normandy) ships.push({ classId: 'alliance_frigate_thanix', count: 1, names: ['SSV Normandy SR-2'] });
  if (ff > 0) ships.push({ classId: 'alliance_frigate', count: ff, names: ALLIANCE_FRIGATE_NAMES });
  return {
    id,
    name: opts.name ?? 'Alliance Fifth Fleet',
    faction: 'alliance',
    side: 'A',
    ships,
    formation: opts.formation ?? 'defensive_screen',
    position: opts.position ?? v3(0, 0, -36),
    heading: opts.heading ?? v3(0, 0, 1),
    playerControlled: true,
    arrivalTime: opts.arrivalTime,
  };
}

function reaperFleet(id: string, rules: RuleSet, opts: { capitals: number; destroyers: number; harbinger?: boolean; formation?: FormationType; position?: ReturnType<typeof v3>; heading?: ReturnType<typeof v3>; mult?: number; name?: string; arrivalTime?: number; side?: 'A' | 'B'; ws?: Record<string, string> }): FleetSpec {
  const m = opts.mult ?? fleetMult(rules, 'reaper', opts.ws ?? {});
  const ships: ShipSpec[] = [];
  if (opts.harbinger) ships.push({ classId: 'harbinger', count: 1, names: ['Harbinger'] });
  const caps = scaleCount(opts.capitals, m);
  const des = scaleCount(opts.destroyers, m);
  if (caps > 0) ships.push({ classId: 'reaper_capital', count: caps });
  if (des > 0) ships.push({ classId: 'reaper_destroyer', count: des });
  return {
    id,
    name: opts.name ?? 'Reaper harvest group',
    faction: 'reaper',
    side: opts.side ?? 'B',
    ships,
    formation: opts.formation ?? 'strike_wedge',
    position: opts.position ?? v3(0, 0, 40),
    heading: opts.heading ?? v3(0, 0, -1),
    arrivalTime: opts.arrivalTime,
  };
}

const SHEPARD_WORLD_STATE: WorldStateOption = {
  id: 'normandy',
  label: 'Normandy SR-2 present',
  kind: 'player_dependent',
  description: 'Whether Shepard’s Normandy takes part in the engagement.',
  choices: [
    { id: 'yes', label: 'Normandy present', description: 'The Normandy SR-2 joins the fleet with its Thanix cannon.' },
    { id: 'no', label: 'Normandy absent', description: 'The Normandy is elsewhere.' },
  ],
  default: 'yes',
};

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'battle_of_earth',
    name: 'Battle of Earth',
    subtitle: 'Sol system, 2186 — Reaper invasion of Earth',
    environment: 'earth_orbit',
    description:
      'The Reapers arrive through the Charon relay and overwhelm Arcturus Station before falling on Earth. Alliance fleets in Sol orbit attempt to hold long enough for the evacuation. In canon the Alliance is forced to withdraw; this is the simulator’s vertical-slice engagement.',
    recommendedRules: ['canon_me3', 'prime_apex'],
    objective: 'Hold Earth orbit: destroy or drive off the Reaper harvest group.',
    maxDuration: 420,
    worldState: [
      SHEPARD_WORLD_STATE,
      {
        id: 'fleet_commitment',
        label: 'Alliance fleet commitment',
        kind: 'extrapolation',
        description: 'How much of the home fleet is in Sol when the Reapers arrive (canon does not give numbers).',
        choices: [
          { id: 'standard', label: 'Home fleet elements', description: '6 dreadnoughts, 1 carrier, 14 cruisers, 24 frigates.' },
          { id: 'heavy', label: 'Fleet concentration', description: '8 dreadnoughts, 2 carriers, 18 cruisers, 30 frigates.' },
          { id: 'light', label: 'Dispersed fleet', description: '4 dreadnoughts, 1 carrier, 10 cruisers, 18 frigates.' },
        ],
        default: 'standard',
      },
    ],
    briefing: [
      'Reaper forces have entered Sol in strength. Arcturus Station is lost.',
      'Fleet command intends to delay the harvest group in low Earth orbit while evacuation transports clear the gravity well.',
      'Reaper capital ships cannot be engaged in the open on equal terms. Concentrate fire; protect the dreadnoughts.',
    ],
    build: (rules, seed, ws) => {
      const commitment = ws.fleet_commitment ?? 'standard';
      const base = commitment === 'heavy' ? { dn: 8, ca: 18, ff: 30, cv: 2 } : commitment === 'light' ? { dn: 4, ca: 10, ff: 18, cv: 1 } : { dn: 6, ca: 14, ff: 24, cv: 1 };
      return {
        id: `battle_of_earth-${rules.id}-${seed}`,
        name: 'Battle of Earth',
        scenarioId: 'battle_of_earth',
        seed,
        rules,
        environment: 'earth_orbit',
        maxDuration: 420,
        perspectiveSide: 'A',
        objective: 'Hold Earth orbit against the Reaper harvest group.',
        worldState: ws,
        fleets: [
          allianceFleet('alliance-5th', rules, { ...base, normandy: (ws.normandy ?? 'yes') === 'yes', position: v3(0, 0, -34), formation: 'defensive_screen', ws }),
          reaperFleet('reaper-sol', rules, { capitals: 3, destroyers: 7, position: v3(6, 2, 46), heading: v3(-0.12, 0, -1), ws }),
          reaperFleet('reaper-sol-2', rules, { capitals: 1, destroyers: 3, position: v3(-40, -3, 70), heading: v3(0.4, 0, -1), arrivalTime: 55, name: 'Reaper second wave', ws }),
        ],
      };
    },
  },
  {
    id: 'alliance_fleet_engagement',
    name: 'Alliance Fleet Engagement',
    subtitle: 'Deep space — Alliance dreadnought group versus Reaper capital ships',
    environment: 'deep_space',
    description: 'A clean fleet-on-fleet engagement with no second wave: the reference battle used by the comparison mode and the balance tests.',
    recommendedRules: ['canon_me3', 'prime_apex', 'humanity_ascendant'],
    objective: 'Destroy the Reaper force.',
    maxDuration: 360,
    worldState: [SHEPARD_WORLD_STATE],
    briefing: ['A Reaper task group has been located in deep space.', 'The dreadnought group will engage at maximum range.'],
    build: (rules, seed, ws) => ({
      id: `alliance_fleet_engagement-${rules.id}-${seed}`,
      name: 'Alliance Fleet Engagement',
      scenarioId: 'alliance_fleet_engagement',
      seed,
      rules,
      environment: 'deep_space',
      maxDuration: 360,
      perspectiveSide: 'A',
      objective: 'Destroy the Reaper force.',
      worldState: ws,
      fleets: [
        allianceFleet('alliance-tf', rules, { dn: 8, ca: 16, ff: 30, cv: 1, normandy: (ws.normandy ?? 'yes') === 'yes', position: v3(0, 0, -36), formation: 'line_abreast', name: 'Alliance Task Force', ws }),
        reaperFleet('reaper-tg', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 40), ws }),
      ],
    }),
  },
  {
    id: 'prime_apex_sol_defence',
    name: 'Prime/Apex — Sol Defence',
    subtitle: 'Alternate universe — a prepared Systems Alliance meets the invasion',
    environment: 'earth_orbit',
    description: 'The Homeworld Defence Rule in action: under Prime/Apex rules the Systems Alliance faces the Reaper invasion of Earth without allied rescue. Selecting the preset wins nothing; the fleet still has to win.',
    recommendedRules: ['prime_apex'],
    auOnly: true,
    objective: 'Defeat the Reaper invasion force in Sol without allied assistance.',
    maxDuration: 480,
    briefing: [
      'ALTERNATE UNIVERSE. Prime/Apex rules apply: HADES rounds, hyper-mass accelerators, hardened barriers.',
      'The Alliance Home Fleet is at full war strength. No allied fleets are available.',
      'Expect the Reapers to adapt. Their numbers and weapons are unchanged.',
    ],
    build: (rules, seed, ws) => ({
      id: `prime_apex_sol_defence-${rules.id}-${seed}`,
      name: 'Prime/Apex — Sol Defence',
      scenarioId: 'prime_apex_sol_defence',
      seed,
      rules,
      environment: 'earth_orbit',
      maxDuration: 480,
      perspectiveSide: 'A',
      objective: 'Defeat the Reaper invasion force in Sol without allied assistance.',
      worldState: ws,
      fleets: [
        allianceFleet('alliance-home', rules, { dn: 8, ca: 18, ff: 30, cv: 2, normandy: true, position: v3(0, 0, -36), formation: 'line_abreast', name: 'Alliance Home Fleet', mult: 1 }),
        reaperFleet('reaper-sol', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 44), mult: 1 }),
        reaperFleet('reaper-sol-2', rules, { capitals: 2, destroyers: 4, position: v3(-45, 0, 70), heading: v3(0.4, 0, -1), arrivalTime: 70, name: 'Reaper second wave', mult: 1 }),
      ],
    }),
  },
  {
    id: 'cerberus_ascendant_harbinger',
    name: 'Cerberus Ascendant — Harbinger',
    subtitle: 'Alternate continuity — controlled Reapers engage the independent Harbinger',
    environment: 'deep_space',
    description: 'In the Cerberus Ascendant continuity, the Illusive Man’s controlled Reaper fleet turns on Harbinger, the one Reaper that remains independent.',
    recommendedRules: ['cerberus_ascendant'],
    auOnly: true,
    objective: 'Destroy Harbinger.',
    maxDuration: 360,
    briefing: [
      'ALTERNATE CONTINUITY. The Catalyst is destroyed; the Illusive Man controls the Reaper fleet.',
      'Harbinger retains independence and has gathered the destroyers still loyal to it.',
      'Controlled Reaper units will engage. Cerberus fleet elements observe and support.',
    ],
    build: (rules, seed, ws) => ({
      id: `cerberus_ascendant_harbinger-${rules.id}-${seed}`,
      name: 'Cerberus Ascendant — Harbinger',
      scenarioId: 'cerberus_ascendant_harbinger',
      seed,
      rules,
      environment: 'deep_space',
      maxDuration: 360,
      perspectiveSide: 'A',
      objective: 'Destroy Harbinger.',
      worldState: ws,
      fleets: [
        reaperFleet('controlled-reapers', rules, { capitals: 3, destroyers: 6, position: v3(0, 0, -40), heading: v3(0, 0, 1), side: 'A', name: 'Controlled Reaper fleet (Cerberus)', mult: 1, formation: 'line_abreast' }),
        reaperFleet('harbinger-group', rules, { capitals: 0, destroyers: 6, harbinger: true, position: v3(0, 0, 40), name: 'Harbinger', mult: 1 }),
      ],
    }),
  },
  {
    id: 'custom',
    name: 'Custom Battle',
    subtitle: 'Player-configured engagement',
    environment: 'deep_space',
    description: 'Configured in the Custom Battle builder.',
    recommendedRules: [],
    objective: 'Destroy the enemy force.',
    maxDuration: 420,
    briefing: ['Custom engagement.'],
    build: (rules, seed) => ({
      id: `custom-${rules.id}-${seed}`,
      name: 'Custom Battle',
      scenarioId: 'custom',
      seed,
      rules,
      environment: 'deep_space',
      maxDuration: 420,
      perspectiveSide: 'A',
      objective: 'Destroy the enemy force.',
      fleets: [],
    }),
  },
];

export const getScenario = (id: string): ScenarioDef => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
};

export const defaultWorldState = (s: ScenarioDef): Record<string, string> => {
  const ws: Record<string, string> = {};
  for (const o of s.worldState ?? []) ws[o.id] = o.default;
  return ws;
};

/** Convenience: build a config for a scenario + preset id. */
export function buildScenario(scenarioId: string, rulesId: string, seed: number, worldState?: Record<string, string>): BattleConfig {
  const s = getScenario(scenarioId);
  const rules = getPreset(rulesId);
  return s.build(rules, seed, { ...defaultWorldState(s), ...(worldState ?? {}) });
}

// ------------------------------------------------------------ custom battles

export interface CustomFleetInput {
  faction: 'alliance' | 'reaper';
  name: string;
  formation: FormationType;
  counts: Record<string, number>;
}

export interface CustomBattleInput {
  seed: number;
  rulesId: string;
  environment: Environment;
  startingDistanceKm: number;
  sideA: CustomFleetInput;
  sideB: CustomFleetInput;
  maxDuration?: number;
  /** Seconds until side B's optional second wave arrives (0 = none). */
  reinforcementTime?: number;
  reinforcementCounts?: Record<string, number>;
}

export function buildCustomBattle(input: CustomBattleInput, rules?: RuleSet): BattleConfig {
  const r = rules ?? getPreset(input.rulesId);
  const half = Math.max(10, input.startingDistanceKm) / 2;
  const mk = (f: CustomFleetInput, side: 'A' | 'B', id: string, z: number, heading: number, arrivalTime?: number, counts?: Record<string, number>): FleetSpec => ({
    id,
    name: f.name,
    faction: f.faction,
    side,
    ships: Object.entries(counts ?? f.counts)
      .filter(([, n]) => n > 0)
      .map(([classId, count]) => ({ classId, count, names: classId === 'alliance_dreadnought' ? ALLIANCE_DN_NAMES : classId === 'alliance_cruiser' ? ALLIANCE_CRUISER_NAMES : undefined })),
    formation: f.formation,
    position: v3(0, 0, z),
    heading: v3(0, 0, heading),
    playerControlled: side === 'A',
    arrivalTime,
  });
  const fleets = [mk(input.sideA, 'A', 'custom-a', -half, 1), mk(input.sideB, 'B', 'custom-b', half, -1)];
  if (input.reinforcementTime && input.reinforcementTime > 0 && input.reinforcementCounts && Object.values(input.reinforcementCounts).some((n) => n > 0)) {
    fleets.push(mk({ ...input.sideB, name: `${input.sideB.name} reinforcements` }, 'B', 'custom-b2', half + 30, -1, input.reinforcementTime, input.reinforcementCounts));
  }
  return {
    id: `custom-${r.id}-${input.seed}`,
    name: 'Custom Battle',
    scenarioId: 'custom',
    seed: input.seed,
    rules: r,
    environment: input.environment,
    maxDuration: input.maxDuration ?? 420,
    perspectiveSide: 'A',
    objective: 'Destroy the enemy force.',
    fleets,
  };
}

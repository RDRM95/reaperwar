import {
  CANON_FLEETS,
  CANON_SPECIAL,
  CANON_STRATEGIC,
  CANON_TECH,
  cloneRules,
  type RuleSet,
  type TechModifiers,
} from './rules';

const tech = (p: Partial<TechModifiers> = {}): TechModifiers => ({ ...CANON_TECH, ...p });

/**
 * PRESET 1 — Canon Mass Effect 3. All multipliers are 1. Player-dependent
 * world-state choices (genophage, geth/quarian, etc.) are configured on the
 * scenario, not here, and never alter these physics.
 */
export const CANON_ME3: RuleSet = Object.freeze({
  id: 'canon_me3',
  name: 'Canon Mass Effect 3',
  tagline: 'The Reaper War, 2186. As it happened.',
  category: 'canon',
  description:
    'The established Reaper War. Reaper capital ships are near-invulnerable to conventional fleets; the Crucible is the only strategic hope. Player-dependent outcomes from the trilogy are selected per scenario.',
  historyChanges: [],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC },
}) as RuleSet;

/** PRESET 2 — Prepared Galaxy. */
export const PREPARED_GALAXY: RuleSet = {
  id: 'prepared_galaxy',
  name: 'Prepared Galaxy',
  tagline: 'The Council listened. The fleets mobilised early.',
  category: 'au',
  description:
    'After Sovereign’s attack the Council accepted the Reaper threat. Shipyards ran at war tempo for three years and the species trained together. Reaper technology is unchanged; the organics simply have more of what they already had.',
  historyChanges: [
    'Council acknowledges Reapers in 2183 instead of dismissing them.',
    'Alliance, Hierarchy and Republics expand fleets by roughly 40–60%.',
    'Joint fleet exercises raise coordination; Thanix refits reach cruiser squadrons.',
    'Reaper capabilities are unchanged.',
  ],
  organic: tech({ fireRate: 1.1, accuracy: 1.08, crewQuality: 1.1, barrierRegen: 1.15 }),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, thanixAvailability: 'fleetwide' },
  fleetStrength: { ...CANON_FLEETS, alliance: 1.5, turian: 1.4, asari: 1.4, salarian: 1.3 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.85 },
};

/** PRESET 3 — Humanity Ascendant. */
export const HUMANITY_ASCENDANT: RuleSet = {
  id: 'humanity_ascendant',
  name: 'Humanity Ascendant',
  tagline: 'Element zero on Mars, a century early.',
  category: 'au',
  description:
    'Humanity found the Prothean archive on Mars in the 2040s and reached the relay network with a head start. The Alliance of 2186 fields a larger, more advanced navy, but a century of human expansion has strained relations with the Council.',
  historyChanges: [
    'Mars archive discovered ~2048; humanity industrialises eezo early.',
    'First Contact War is a prolonged border conflict; Human–Turian relations remain poor.',
    'Alliance fleet is ~2.2× canon with stronger mass accelerators and barriers.',
    'Council coordination with humanity is weaker than canon.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    alliance: {
      massAcceleratorDamage: 1.5,
      massAcceleratorPenetration: 1.25,
      kineticBarrierStrength: 1.4,
      armourStrength: 1.3,
      hullIntegrity: 1.15,
      fireRate: 1.15,
      sensors: 1.3,
      accuracy: 1.1,
    },
  },
  special: { ...CANON_SPECIAL, thanixAvailability: 'fleetwide' },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.2, turian: 0.95 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.35 },
};

/** PRESET 4 — Cerberus Reformed. */
export const CERBERUS_REFORMED: RuleSet = {
  id: 'cerberus_reformed',
  name: 'Cerberus Reformed',
  tagline: 'The Illusive Man keeps his mind. Cerberus fights for humanity, on its own terms.',
  category: 'au',
  description:
    'Without indoctrination the Illusive Man treats the Reapers as the existential threat they are. Cerberus fleets cooperate with the Alliance against the Reapers while pursuing an explicitly pro-human agenda. Cerberus is not altruistic; it is pragmatic.',
  historyChanges: [
    'Illusive Man is never indoctrinated after the Collector Base.',
    'Cerberus ceases attacks on Alliance assets; a wary cooperation forms.',
    'Cerberus fleet strength roughly doubles through unmolested black-site production.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: { cerberus: { sensors: 1.2, electronicWarfare: 1.4, accuracy: 1.1 } },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, cerberus: 2.0 },
  strategic: {
    ...CANON_STRATEGIC,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    alliedCoordination: 0.6,
  },
};

/** PRESET 5 — Reaper Escalation. */
export const REAPER_ESCALATION: RuleSet = {
  id: 'reaper_escalation',
  name: 'Reaper Escalation',
  tagline: 'They remember the Protheans. They will not make the same mistakes.',
  category: 'au',
  description:
    'The Reapers commit more capital ships to each front and adapt aggressively to organic tactics. An extremely difficult survival scenario.',
  historyChanges: [
    'Reaper fleet committed to the Milky Way is ~1.6× canon.',
    'Reaper targeting and coordination improve during each engagement.',
    'Indoctrination pressure on fleet crews is heightened.',
  ],
  organic: tech(),
  reaper: tech({ accuracy: 1.08, barrierRegen: 1.3, crewQuality: 1.15 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, reaper: 1.6 },
  strategic: { ...CANON_STRATEGIC, reaperCompetence: 1.3, indoctrinationEffectiveness: 1.3, reaperReinforcements: 1.6 },
};

/**
 * PRESET 6 — Prime/Apex: Successful Refuse. Optional, player-selected AU.
 * Nothing in here touches canon mode.
 */
export const PRIME_APEX: RuleSet = {
  id: 'prime_apex',
  name: 'Prime/Apex — Successful Refuse',
  tagline: 'No Crucible shortcut. A galaxy prepared to win the war by force.',
  category: 'au',
  description:
    'An exceptionally successful Shepard and an extraordinarily well prepared humanity and allied galaxy. HADES ammunition, hyper-mass accelerators and hardened defences let Alliance and Turian fleets genuinely threaten Reaper capital ships. The Homeworld Defence Rule applies: Earth and Palaven can each resist invasion without rescue. Victory is still earned in combat — selecting this preset declares nothing won.',
  historyChanges: [
    'Shepard combines Paragon and Renegade strengths; diplomacy and strategy succeed beyond normal limits.',
    'Alliance industrial base and R&D expanded massively after Sovereign; Turian Hierarchy follows.',
    'HADES rounds enter service: kinetic penetrators with a nuclear warhead that detonates after penetration; they bypass half of Reaper armour and pierce barriers more efficiently.',
    'Hyper-mass accelerators refit all Alliance and Turian dreadnoughts (AU weapon, ~3× canon slug energy).',
    'Barriers, armour, sensors and fleet coordination substantially improved.',
    'Cerberus Black Fleet optionally cooperates with Shepard and the Alliance; Cerberus remains Cerberus.',
    'Homeworld Defence Rule: Earth and Palaven can hold without allied rescue.',
    'The Catalyst’s options are refused; the Reapers must be defeated conventionally.',
  ],
  organic: tech({
    massAcceleratorDamage: 1.25,
    massAcceleratorPenetration: 1.3,
    massAcceleratorRange: 1.0,
    fireRate: 1.1,
    heatCapacity: 1.3,
    kineticBarrierStrength: 1.35,
    barrierRegen: 1.4,
    armourStrength: 1.3,
    hullIntegrity: 1.15,
    speed: 1.08,
    sensors: 1.4,
    electronicWarfare: 1.3,
    accuracy: 1.1,
    fighterStrength: 1.3,
    torpedoDamage: 1.4,
    gardianEffectiveness: 1.4,
    beamDamage: 1.35,
    crewQuality: 1.15,
  }),
  reaper: tech(),
  factionOverrides: {
    cerberus: { electronicWarfare: 1.6, sensors: 1.6 },
  },
  special: {
    hyperMassAccelerators: true,
    hadesRounds: true,
    thanixAvailability: 'fleetwide',
    reaperCommandVulnerability: true,
    indoctrinationDisabled: false,
  },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.0, turian: 1.6, asari: 1.3, salarian: 1.3, cerberus: 1.5 },
  strategic: {
    ...CANON_STRATEGIC,
    alliedCoordination: 0.9,
    conventionalVictoryPossible: true,
    crucibleAvailable: true,
    shepardEffectiveness: 1.8,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    homeworldIndependence: true,
    indoctrinationEffectiveness: 0.5,
  },
};

/**
 * PRESET 7 — Cerberus Ascendant. A separate continuity: Shepard died at the
 * Collector Base; the unindoctrinated Illusive Man seizes control of the
 * Reaper fleet. Harbinger alone remains independent.
 */
export const CERBERUS_ASCENDANT: RuleSet = {
  id: 'cerberus_ascendant',
  name: 'Cerberus Ascendant',
  tagline: 'Shepard died at the Collector Base. The Illusive Man kept his mind — and took the Reapers.',
  category: 'au',
  description:
    'Shepard is killed in 2185. The Collector Base survives intact and the Illusive Man is never indoctrinated. Cerberus perfects a control solution: the Catalyst is destroyed, indoctrination is permanently disabled, and the Illusive Man alone commands the captured Reaper fleet. Harbinger stays independent and is destroyed by the controlled Reapers. Twenty years of Cerberus-led reconstruction follow, ending with the dismantling of the Reapers once humanity can defend itself.',
  historyChanges: [
    'Shepard dies at the conclusion of the Collector Base operation (2185).',
    'Collector Base preserved; Cerberus reverse-engineers Reaper command architecture.',
    'Catalyst destroyed; Reaper indoctrination permanently disabled.',
    'Illusive Man gains exclusive control of the Reaper fleet. No shared authority, no successor.',
    'Harbinger remains independent and is destroyed by controlled Reapers.',
    'Post-war 2186–2206: Cerberus directs reconstruction and a 20-year plan to replace Reaper superiority with human conventional fleets, then dismantle the Reapers.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: { cerberus: { sensors: 1.3, electronicWarfare: 1.5, accuracy: 1.1, crewQuality: 1.1 } },
  special: { ...CANON_SPECIAL, indoctrinationDisabled: true, reaperCommandVulnerability: false },
  fleetStrength: { ...CANON_FLEETS, cerberus: 1.6 },
  strategic: {
    ...CANON_STRATEGIC,
    shepardAlive: false,
    shepardEffectiveness: 0,
    illusiveManIndoctrinated: false,
    cerberusStance: 'controls_reapers',
    catalystOperational: false,
    harbingerOperational: true,
    crucibleAvailable: false,
    conventionalVictoryPossible: true,
    indoctrinationEffectiveness: 0,
  },
};

/** PRESET 8 — Custom (starts as a copy of canon). */
export const makeCustom = (): RuleSet => {
  const r = cloneRules(CANON_ME3);
  r.id = 'custom';
  r.name = 'Custom Timeline';
  r.tagline = 'Your rules.';
  r.category = 'custom';
  r.description = 'A player-authored rule set. Starts identical to canon.';
  return r;
};

export const PRESETS: RuleSet[] = [
  CANON_ME3,
  PREPARED_GALAXY,
  HUMANITY_ASCENDANT,
  CERBERUS_REFORMED,
  REAPER_ESCALATION,
  PRIME_APEX,
  CERBERUS_ASCENDANT,
];

export const getPreset = (id: string): RuleSet => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) {
    if (id === 'custom') return makeCustom();
    throw new Error(`Unknown timeline preset ${id}`);
  }
  return cloneRules(p);
};

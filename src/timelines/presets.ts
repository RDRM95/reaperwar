import { ALTERNATE_PRESETS } from './alternates';
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
 * Opt-in tactical challenge. A gameplay variant rather than a claim that
 * every canon Reaper hit produces an automatic kill.
 */
export const REAPER_HARDCORE: RuleSet = {
  ...cloneRules(REAPER_ESCALATION),
  id: 'reaper_hardcore',
  name: 'Reaper Hardcore — Annihilation',
  tagline: 'Capital beams are lethal. Reapers attack as an organised force.',
  category: 'au',
  description: 'Optional high-lethality challenge: direct Reaper capital main-beam contacts destroy standard warships. Explicitly hardened AU super-vessels can absorb heavy damage. Reaper targeting prioritises gunships, fleet leaders and orbital defences. No indoctrination mechanics or Reaper retreats. This is a gameplay mode, not a canon claim.',
  historyChanges: [
    'Reaper capital main guns destroy unprotected ships on a successful direct contact.',
    'Specially hardened AU vessels use their normal armour and barrier mechanics under stronger beam damage.',
    'Reaper harvest formations prioritise threats and limit aimless pursuit.',
    'Indoctrination is disabled; normal canon and APEX presets remain unchanged.',
  ],
  reaper: tech({ accuracy: 1.15, sensors: 1.3, crewQuality: 1.2, barrierRegen: 1.2, beamDamage: 1.4 }),
  fleetStrength: { ...CANON_FLEETS },
  special: { ...CANON_SPECIAL, reaperHardcore: true, indoctrinationDisabled: true, reaperDoctrine: 'canon' },
  strategic: { ...CANON_STRATEGIC, reaperCompetence: 1.5, indoctrinationEffectiveness: 0 },
};

/**
 * PRESET 6 — Prime/Apex: Apex core (ADOPTION_PLAN.md §1.3). Optional,
 * player-selected AU. Nothing in here touches canon mode. The id stays
 * `prime_apex` so saves, preferences and campaign snapshots keep working.
 *
 * The organic multipliers are TUNE values (AP §1.3: each ≥ 1.0 and ≤ the
 * v0.11 shipped value; tuned in the order kineticBarrierStrength,
 * massAcceleratorDamage, fleetStrength, then the HADES levers) and are
 * re-measured by the calibration passes (T7, T19).
 */
export const PRIME_APEX: RuleSet = {
  id: 'prime_apex',
  name: 'Prime/Apex — Apex core',
  tagline: 'The Refuse: the Crucible plans were rejected and never built. A galaxy prepared to win the war by force.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE. Shepard never died; the galaxy mobilised for three years; Cerberus committed the Black Fleet; there is no Crucible. Project Titan fires finite HADES penetrators, the Normandy Valkyrie leads the line, and Reaper losses are earned in combat. Nothing here is presented as canon.',
  historyChanges: [
    'Shepard combines Paragon coalition-building with Renegade decisiveness and never dies; the two Lazarus years become preparation.',
    'Javik is recovered in 2183; Jenkins, Nihlus and Saren survive; Mordin completes an earlier cure; quarians and geth settle early.',
    'The Illusive Man is never indoctrinated; Cerberus abandons Reaper control and commits the Black Fleet (420 warships, AU value).',
    'The Treaty of Farixen is suspended by emergency accord; yards run at war tempo (38,420 coalition warships at Sol, AU value).',
    'Project Titan: heavy accelerators on Alliance and Black Fleet dreadnoughts fire HADES penetrators with a nuclear warhead fused to detonate after penetration (finite magazine).',
    'The Normandy Valkyrie, a 2,000 m Normandy-lineage command dreadnought, is available (AU LOCK).',
    'Black Fleet drive attacks are a rare specialist event; 612 fixed defence platforms guard Sol (captions; a few are simulated).',
    'Homeworld Defence Rule: Earth and Palaven can each hold without allied rescue.',
    'The Refuse: the Crucible plans recovered on Mars are judged a Reaper trap and refused by the Council; the galaxy commits to a conventional war.',
    'There is no Crucible and no Catalyst encounter; the Reapers must be defeated conventionally.',
  ],
  // TUNE (AP §1.3 bounds: each ≥ 1 and ≤ the v0.11 shipped value). Calibration pass 1 (CORE T6/T7, measured on
  // the fixed-fleet reference engagement with the re-based Titan gun and the HADES fuse and gate in force): the
  // §1.3 literals lose the engagement on seeds 7–9; the lever order kineticBarrierStrength → massAcceleratorDamage
  // (fleetStrength does not act on fixed fleets; the HADES levers only weaken) was exhausted at the bounds, so every
  // remaining key sits at its bound except armourStrength, which stays at the §1.3 literal 1.15 because 1.3 lifts
  // seed 7's survival past the < 85 % target. See docs/apex/CALIBRATION_REPORT.md §1. CORE T8 (spatial grid, idle
  // retry, staggered decisions) shifted the seed trajectories and seed 9 crossed 85 %; the first lever of the order,
  // kineticBarrierStrength, came back one notch (1.35 → 1.3) and seeds 7–9 hold again (CALIBRATION_REPORT.md §0.4).
  organic: tech({
    massAcceleratorDamage: 1.25,
    massAcceleratorPenetration: 1.3,
    massAcceleratorRange: 1.0,
    fireRate: 1.1,
    heatCapacity: 1.3,
    kineticBarrierStrength: 1.3,
    barrierRegen: 1.4,
    armourStrength: 1.15,
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
    cerberus: { sensors: 1.3, electronicWarfare: 1.4, accuracy: 1.1 },
    asari: { accuracy: 1.13 },
    salarian: { sensors: 1.5, gardianEffectiveness: 1.55 },
    geth: { crewQuality: 1.2, barrierRegen: 1.4 },
    quarian: { barrierRegen: 1.35 },
  },
  special: {
    hyperMassAccelerators: true,
    hadesRounds: true,
    thanixAvailability: 'fleetwide',
    reaperCommandVulnerability: true,
    indoctrinationDisabled: false,
    valkyrieAvailable: true,
    legacyNova: false,
    driveAttacks: 'rare',
    heavyPlatforms: true,
    superDreadnoughts: true,
    reaperDoctrine: 'apex',
    readinessScale: 1,
  },
  fleetStrength: { alliance: 1.8, turian: 1.5, asari: 1.3, salarian: 1.3, quarian: 1.2, geth: 1.2, cerberus: 1.5, reaper: 1.0 },
  strategic: {
    alliedCoordination: 0.85,
    reaperCompetence: 1,
    indoctrinationEffectiveness: 0.5,
    reaperReinforcements: 1,
    conventionalVictoryPossible: true,
    crucibleAvailable: false,
    shepardAlive: true,
    shepardEffectiveness: 1.8,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    harbingerOperational: true,
    catalystOperational: true,
    homeworldIndependence: true,
  },
};

/**
 * PRESET 6b — Prime/Apex: Apex legacy, high power (ADOPTION_PLAN.md §1.4).
 * Apex core plus the earlier Apex material's 0.1c Legacy Nova and upper-tier
 * drive attacks. Deliberately easier; labelled HIGH POWER — EASIER BY DESIGN
 * wherever `special.legacyNova` is true.
 */
export const APEX_LEGACY: RuleSet = {
  ...cloneRules(PRIME_APEX),
  id: 'apex_legacy',
  name: 'Prime/Apex — Apex legacy (high power)',
  tagline: 'Easier by design: the 0.1c Legacy Nova and upper-tier drive attacks. Separately labelled.',
  category: 'au',
  description:
    'ALTERNATE UNIVERSE, HIGH POWER. Apex core plus the earlier Apex material’s single-shot capital-killing Nova and more frequent Black Fleet drive attacks. Same inventories, same Reapers. Deliberately easier; not a balance reference.',
  historyChanges: [
    ...PRIME_APEX.historyChanges,
    'Legacy Nova: a 20 kg round at a tenth of light speed (≈ 2.2 Mt), 60 s cycle, twelve rounds, visible six-second charge — AU HIGH POWER.',
    'Upper-tier drive attacks: five attempts, shorter commitment, nearby destroyers caught in the impact.',
    'This preset is easier by design and is labelled as such on every screen.',
  ],
  special: { ...PRIME_APEX.special, legacyNova: true, driveAttacks: 'upper' },
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
  APEX_LEGACY,
  CERBERUS_ASCENDANT,
  ...ALTERNATE_PRESETS,
];

export const getPreset = (id: string): RuleSet => {
  if (id === REAPER_HARDCORE.id) return cloneRules(REAPER_HARDCORE);
  const p = PRESETS.find((x) => x.id === id);
  if (!p) {
    if (id === 'custom') return makeCustom();
    throw new Error(`Unknown timeline preset ${id}`);
  }
  return cloneRules(p);
};

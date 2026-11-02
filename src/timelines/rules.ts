import { HADES_FUSE, type FactionId, type HadesFuse, type ShipClassDef, type WarheadDef, type WeaponDef } from '@/data/types';
import { HADES_WARHEAD } from '@/data/weapons';

/**
 * The alternate-universe rule engine.
 *
 * A RuleSet is plain data. Nothing in it is executed; imports are validated
 * against the schema in `schema.ts`. Rules modify the actual simulation by
 * changing the effective ship/weapon statistics produced by `applyRules*`,
 * by substituting weapons, and by changing fleet composition multipliers
 * consumed by scenario builders.
 */

/** Multipliers applied to a faction group's technology. 1 = canon ME3. */
export interface TechModifiers {
  massAcceleratorDamage: number;
  massAcceleratorPenetration: number;
  massAcceleratorRange: number;
  fireRate: number; // >1 = faster cooldowns
  heatCapacity: number;
  kineticBarrierStrength: number;
  barrierRegen: number;
  armourStrength: number;
  hullIntegrity: number;
  speed: number;
  sensors: number;
  electronicWarfare: number; // scales ECM rating
  accuracy: number;
  fighterStrength: number;
  torpedoDamage: number;
  gardianEffectiveness: number;
  /** Beam/stream weapons (Thanix for organics, primary beams for Reapers). */
  beamDamage: number;
  crewQuality: number;
}

export interface SpecialTechnology {
  /** Project Titan: Alliance and Cerberus (Black Fleet) dreadnought and super-dreadnought spinal guns become the Titan gun `apex_hyper_ma`. */
  hyperMassAccelerators: boolean;
  /**
   * HADES penetrators: each Titan gun carries a separate magazine of HADES rounds — a penetrator with a
   * nuclear warhead that detonates only after a penetrating hit (ADOPTION_PLAN.md §7). Round-level: the
   * values live on `EffectiveWeapon.hadesRound`; no faction-wide armour bypass.
   */
  hadesRounds: boolean;
  /** Where Thanix cannons are mounted. */
  thanixAvailability: 'canon' | 'fleetwide' | 'none';
  /** Reaper command network can be disrupted: losing a capital ship degrades others' coordination. */
  reaperCommandVulnerability: boolean;
  /** Indoctrination disabled: no morale/coordination penalty on organics from Reaper presence. */
  indoctrinationDisabled: boolean;
  /** Scenario builders and compositions may spawn `normandy_valkyrie` (AU). */
  valkyrieAvailable: boolean;
  /** The Valkyrie's `nova_legacy` hardpoint is fitted (weapons declare `requiresSpecial`). AU HIGH POWER. */
  legacyNova: boolean;
  /** Black Fleet drive attacks: off, rare (Apex core) or upper tier (Apex legacy). */
  driveAttacks: 'off' | 'rare' | 'upper';
  /** Sol scenarios place `sol_platform_heavy` (super-accelerator) beside the dreadnought-grade platforms that exist under every preset. */
  heavyPlatforms: boolean;
  /** The Olympus-class and Praetor-class heavy dreadnoughts may be spawned by scenario builders and compositions. */
  superDreadnoughts: boolean;
  /** Enables the two withdrawal-type Reaper behaviours (tactical fall-back and return, never an exit). */
  reaperDoctrine: 'canon' | 'apex';
  /** Multiplies the readiness-tier weights; clamped to [0.5, 1.5]. */
  readinessScale: number;
}

export interface FleetStrength {
  alliance: number;
  turian: number;
  asari: number;
  salarian: number;
  quarian: number;
  geth: number;
  cerberus: number;
  reaper: number;
}

export interface StrategicVariables {
  /** Degree of allied coordination 0..1. Affects decision interval & accuracy. */
  alliedCoordination: number;
  /** Reaper strategic competence multiplier 0.5..1.5. */
  reaperCompetence: number;
  /** Indoctrination effectiveness 0..1 — degrades organic crew quality in Reaper presence. */
  indoctrinationEffectiveness: number;
  /** Reaper reinforcement availability multiplier. */
  reaperReinforcements: number;
  /** Whether the war can be won conventionally (campaign). */
  conventionalVictoryPossible: boolean;
  crucibleAvailable: boolean;
  shepardAlive: boolean;
  shepardEffectiveness: number; // 0..2
  illusiveManIndoctrinated: boolean;
  cerberusStance: 'hostile' | 'neutral' | 'cooperative' | 'controls_reapers';
  harbingerOperational: boolean;
  catalystOperational: boolean;
  /** Homeworld Defence Rule (Prime/Apex): Alliance & Turians can hold their homeworlds unaided. */
  homeworldIndependence: boolean;
}

export type TimelineCategory = 'canon' | 'au' | 'custom';

export interface RuleSet {
  id: string;
  name: string;
  tagline: string;
  category: TimelineCategory;
  description: string;
  /** Explicit list of changed history; shown in codex and comparison. */
  historyChanges: string[];
  organic: TechModifiers;
  reaper: TechModifiers;
  /** Per-faction overrides merged on top of `organic`. */
  factionOverrides: Partial<Record<FactionId, Partial<TechModifiers>>>;
  special: SpecialTechnology;
  fleetStrength: FleetStrength;
  strategic: StrategicVariables;
}

export const CANON_TECH: TechModifiers = {
  massAcceleratorDamage: 1,
  massAcceleratorPenetration: 1,
  massAcceleratorRange: 1,
  fireRate: 1,
  heatCapacity: 1,
  kineticBarrierStrength: 1,
  barrierRegen: 1,
  armourStrength: 1,
  hullIntegrity: 1,
  speed: 1,
  sensors: 1,
  electronicWarfare: 1,
  accuracy: 1,
  fighterStrength: 1,
  torpedoDamage: 1,
  gardianEffectiveness: 1,
  beamDamage: 1,
  crewQuality: 1,
};

export const CANON_SPECIAL: SpecialTechnology = {
  hyperMassAccelerators: false,
  hadesRounds: false,
  thanixAvailability: 'canon',
  reaperCommandVulnerability: false,
  indoctrinationDisabled: false,
  valkyrieAvailable: false,
  legacyNova: false,
  driveAttacks: 'off',
  heavyPlatforms: false,
  superDreadnoughts: false,
  reaperDoctrine: 'canon',
  readinessScale: 1,
};

export const CANON_FLEETS: FleetStrength = {
  alliance: 1,
  turian: 1,
  asari: 1,
  salarian: 1,
  quarian: 1,
  geth: 1,
  cerberus: 1,
  reaper: 1,
};

export const CANON_STRATEGIC: StrategicVariables = {
  alliedCoordination: 0.5,
  reaperCompetence: 1,
  indoctrinationEffectiveness: 1,
  reaperReinforcements: 1,
  conventionalVictoryPossible: false,
  crucibleAvailable: true,
  shepardAlive: true,
  shepardEffectiveness: 1,
  illusiveManIndoctrinated: true,
  cerberusStance: 'hostile',
  harbingerOperational: true,
  catalystOperational: true,
  homeworldIndependence: false,
};

export const TECH_KEYS = Object.keys(CANON_TECH) as (keyof TechModifiers)[];
export const SPECIAL_KEYS = Object.keys(CANON_SPECIAL) as (keyof SpecialTechnology)[];
export const STRATEGIC_KEYS = Object.keys(CANON_STRATEGIC) as (keyof StrategicVariables)[];

/** Gates Apex MECHANICS (Black Fleet dreadnoughts, the Omega group): a cooperative Cerberus with Project Titan. */
export const isApexRules = (rules: RuleSet): boolean => rules.strategic.cerberusStance === 'cooperative' && rules.special.hyperMassAccelerators;
/** Gates the Apex FIGURES (APEX_SCALE captions, the strategic counter, apexDistantGroups): the two Apex presets by id. */
export const isApexScenario = (rules: RuleSet): boolean => rules.id === 'prime_apex' || rules.id === 'apex_legacy';

/** Deep-clone a rule set (rules are plain JSON). */
export const cloneRules = (r: RuleSet): RuleSet => JSON.parse(JSON.stringify(r)) as RuleSet;

/** Effective technology modifiers for a given faction under a rule set. */
export function techFor(rules: RuleSet, faction: FactionId): TechModifiers {
  const base = faction === 'reaper' ? rules.reaper : rules.organic;
  const override = rules.factionOverrides[faction];
  return override ? { ...base, ...override } : { ...base };
}

// --------------------------------------------------------------------------
// Effective statistics
// --------------------------------------------------------------------------

export interface EffectiveShipStats {
  hull: number;
  armour: number;
  barriers: number;
  barrierRegen: number;
  maxSpeed: number;
  acceleration: number;
  turnRate: number;
  sensorRange: number;
  ecm: number;
  crewQuality: number;
  /** (cls.heatCapacity ?? 100) × the faction's heat-capacity multiplier. */
  heatCapacity: number;
  /** Fraction of barrier regeneration that continues under fire (M1; Reaper capitals 1, everything else 0). */
  barrierRegenUnderFire: number;
  /** Barrier load threshold in points (M2; 0 = off). */
  barrierLoadThreshold: number;
}

export function applyRulesToShip(cls: ShipClassDef, rules: RuleSet): EffectiveShipStats {
  const t = techFor(rules, cls.faction);
  const isFighter = cls.role === 'fighter';
  const f = isFighter ? t.fighterStrength : 1;
  let crew = cls.crewQuality * t.crewQuality;
  if (cls.faction !== 'reaper') {
    // Indoctrination pressure and coordination quality shape crew effectiveness.
    const indoct = rules.special.indoctrinationDisabled ? 0 : rules.strategic.indoctrinationEffectiveness;
    crew *= 1 - 0.08 * indoct;
    crew *= 0.9 + 0.2 * rules.strategic.alliedCoordination;
  } else {
    crew *= rules.strategic.reaperCompetence;
  }
  return {
    hull: cls.hull.value * t.hullIntegrity * f,
    armour: cls.armour.value * t.armourStrength * f,
    barriers: cls.barriers.value * t.kineticBarrierStrength * f,
    barrierRegen: cls.barrierRegen.value * t.barrierRegen * f,
    maxSpeed: cls.maxSpeed.value * t.speed,
    acceleration: cls.acceleration.value * t.speed,
    turnRate: cls.turnRate.value * (0.8 + 0.2 * t.speed),
    sensorRange: cls.sensorRange.value * t.sensors,
    ecm: Math.min(0.95, cls.ecm * t.electronicWarfare),
    crewQuality: crew,
    heatCapacity: (cls.heatCapacity?.value ?? 100) * t.heatCapacity,
    barrierRegenUnderFire: cls.barrierRegenUnderFire?.value ?? 0,
    barrierLoadThreshold: cls.barrierLoadThreshold?.value ?? 0,
  };
}

/** The HADES round carried by a Titan gun under `special.hadesRounds` (ADOPTION_PLAN.md §7). */
export interface HadesRound {
  /** Fraction of target armour the penetrator ignores. */
  armourBypass: number;
  /** 1.0: a HADES round never pierces barriers better than a slug; penetration is the fuse's business. */
  barrierEfficiencyMultiplier: number;
  warhead: WarheadDef;
  fuse: HadesFuse;
}

export const TITAN_GUN_ID = 'apex_hyper_ma';
const TITAN_EXCLUDED_CLASSES: ReadonlySet<string> = new Set(['destiny_ascension', 'normandy_valkyrie']);

/** The Project Titan substitution predicate (ADOPTION_PLAN.md §1.2): which spinal guns become Titan guns. */
export const isTitanCandidate = (weapon: WeaponDef, faction: FactionId, cls: ShipClassDef): boolean =>
  (faction === 'alliance' || faction === 'cerberus') &&
  (cls.role === 'dreadnought' || cls.role === 'super_dreadnought') &&
  weapon.kind === 'mass_accelerator' &&
  weapon.antiCapital &&
  weapon.arc <= 20 &&
  !TITAN_EXCLUDED_CLASSES.has(cls.id);

export interface EffectiveWeapon extends WeaponDef {
  /** Fraction of target armour ignored by an ordinary round (always 0: the HADES bypass is round-level, see `hadesRound`). */
  armourBypass: number;
  /** Multiplier on barrier efficiency against an ordinary round (always 1). */
  barrierEfficiencyMultiplier: number;
  /** Original weapon id if this one was substituted by a rule. */
  substitutedFrom?: string;
  /** Present on the Titan gun under `special.hadesRounds` only: the special round's values. */
  hadesRound?: HadesRound;
}

/**
 * Resolve the weapon a hardpoint actually mounts under the rules (handles AU
 * substitutions), then scale it by the faction's technology modifiers.
 */
export function applyRulesToWeapon(
  weapon: WeaponDef,
  faction: FactionId,
  cls: ShipClassDef,
  rules: RuleSet,
  catalogue: Record<string, WeaponDef>,
): EffectiveWeapon {
  const t = techFor(rules, faction);
  let w: WeaponDef = weapon;
  let substitutedFrom: string | undefined;

  if (faction !== 'reaper') {
    // Project Titan: Alliance and Black Fleet dreadnought spinal guns become Titan guns.
    if (rules.special.hyperMassAccelerators && isTitanCandidate(weapon, faction, cls)) {
      w = catalogue[TITAN_GUN_ID];
      substitutedFrom = weapon.id;
    }
    // Thanix availability.
    if (rules.special.thanixAvailability === 'fleetwide' && weapon.id === 'alliance_cruiser_main') {
      w = { ...catalogue.alliance_thanix, damage: catalogue.alliance_thanix.damage * 1.4, cooldown: 5.5 };
      substitutedFrom = weapon.id;
    }
    if (rules.special.thanixAvailability === 'none' && weapon.kind === 'thanix') {
      w = catalogue.alliance_cruiser_main;
      substitutedFrom = weapon.id;
    }
  }

  const isMA = w.kind === 'mass_accelerator';
  const isBeam = w.kind === 'thanix' || w.kind === 'reaper_beam';
  const isTorp = w.kind === 'disruptor_torpedo' || w.kind === 'missile';
  const isGardian = w.kind === 'gardian';
  const fighterMult = cls.role === 'fighter' ? t.fighterStrength : 1;

  let damage = w.damage * fighterMult;
  if (isMA) damage *= t.massAcceleratorDamage;
  if (isBeam) damage *= t.beamDamage;
  if (isTorp) damage *= t.torpedoDamage;
  if (isGardian) damage *= t.gardianEffectiveness;

  // HADES is round-level: only the Titan gun carries the special magazine, and only under hadesRounds.
  const hadesRound: HadesRound | undefined =
    faction !== 'reaper' && rules.special.hadesRounds && w.id === TITAN_GUN_ID
      ? { armourBypass: 0.5, barrierEfficiencyMultiplier: 1, warhead: HADES_WARHEAD, fuse: HADES_FUSE }
      : undefined;

  return {
    ...w,
    damage,
    penetration: isMA ? w.penetration * t.massAcceleratorPenetration : w.penetration,
    range: isMA ? w.range * t.massAcceleratorRange : w.range,
    cooldown: w.cooldown / t.fireRate,
    accuracy: Math.min(0.99, w.accuracy * t.accuracy),
    armourBypass: 0,
    barrierEfficiencyMultiplier: 1,
    substitutedFrom,
    ...(hadesRound ? { hadesRound } : {}),
  };
}

import type { Sourced } from '@/core/provenance';
import type { Vec3 } from '@/core/vec3';
import type { SpecialTechnology } from '@/timelines/rules';
import { SHIP_CLASSES } from './ships';

export type FactionId =
  | 'alliance'
  | 'turian'
  | 'asari'
  | 'salarian'
  | 'quarian'
  | 'geth'
  | 'cerberus'
  | 'reaper';

export type ShipRole =
  | 'fighter'
  | 'frigate'
  | 'cruiser'
  | 'dreadnought'
  | 'super_dreadnought'
  | 'carrier'
  | 'fixed_platform'
  | 'reaper_destroyer'
  | 'reaper_capital';

/** Roles counted as capital hulls (comms, results, target priority, formation tier 0). */
export const CAPITAL_ROLES: ReadonlySet<ShipRole> = new Set<ShipRole>(['dreadnought', 'super_dreadnought', 'carrier', 'fixed_platform', 'reaper_capital']);
export const isCapitalRole = (role: ShipRole): boolean => CAPITAL_ROLES.has(role);

export type WeaponKind =
  | 'mass_accelerator'
  | 'thanix'
  | 'gardian'
  | 'missile'
  | 'disruptor_torpedo'
  | 'reaper_beam';

export type DamageType = 'kinetic' | 'thanix_stream' | 'laser' | 'warhead' | 'reaper_beam';

/**
 * The HADES warhead (ADOPTION_PLAN.md §7): a penetrator with a nuclear
 * warhead that detonates inside the hull only after a penetrating hit.
 */
export interface WarheadDef {
  damage: number;
  damageType: 'warhead';
  /** The burst is already inside the hull: barriers are ignored entirely. */
  barrierEfficiencyMultiplier: 0;
  /** Armour is ignored entirely. */
  armourBypass: 1;
  /** One subsystem drops by `drop` and is restored `seconds` later. */
  subsystemOutage: { drop: number; seconds: number };
  /** No barrier recovery, under fire or not, for this long after the burst. */
  regenSuppressSeconds: number;
}

/** The HADES fuse: the warhead arms only when at least this fraction of the round's energy passed the barrier. */
export interface HadesFuse {
  residualFraction: number;
}

export const HADES_FUSE: HadesFuse = { residualFraction: 0.5 };
/** The Titan AI fires a HADES round only at a Reaper capital whose barrier fraction is below this (TUNE 0.1–0.35, AP §7). */
export const HADES_GATE: { barrierFractionBelow: number } = { barrierFractionBelow: 0.2 };

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  damageType: DamageType;
  /** Damage per shot (or per second for beams). */
  damage: number;
  /** Seconds between shots / bursts. */
  cooldown: number;
  /** Maximum effective range in km (compressed battlespace). */
  range: number;
  /** Projectile speed km/s; Infinity for hitscan beams. */
  projectileSpeed: number;
  /** Base accuracy 0..1 at optimal range against a cruiser-sized target. */
  accuracy: number;
  /** Penetration factor vs armour (0..1+). */
  penetration: number;
  /** Beam burst duration in seconds (beams only). */
  beamDuration?: number;
  /** For missiles: hull HP of the missile and its speed. */
  missileHp?: number;
  /** Heat units generated per shot (ship heat capacity is 100). */
  heat: number;
  /** Rounds carried per mount; undefined = not ammunition-limited. Fighters rearm at their carrier. */
  magazine?: number;
  /** Point-defence lasers fire in heat-limited bursts: `shots` before a `recovery`-second pause. */
  burst?: { shots: number; recovery: number };
  /** Whether this weapon can target fighters/missiles. */
  antiSmall: boolean;
  /** Prefer firing at larger targets. */
  antiCapital: boolean;
  /** Firing arc in degrees relative to the hardpoint facing (360 = turret). */
  arc: number;
  provenance: Sourced<string>;
  /** Special rounds per mount in a separate magazine (Titan gun: 12 HADES), fired only through the AP §7 gate. */
  specialAmmo?: number;
  /** Applied inside the hull after a penetrating special round. */
  warhead?: WarheadDef;
  /** Damage multiplier against a target whose barrier fraction is below the threshold at impact. */
  degradedTargetBonus?: { barrierFractionBelow: number; multiplier: number };
  /** Seconds of visible charge; the mount cannot fire or turn while charging. */
  chargeTime?: number;
  /** Torpedoes per launch (javelin_rack: 4). */
  salvo?: number;
  /** The mount keeps its own heat pool (thanix_heavy). */
  perMountHeat?: boolean;
  /** Hardpoint fitted only when this special-technology flag is true (nova_legacy). */
  requiresSpecial?: keyof SpecialTechnology;
}

export interface HardpointDef {
  weaponId: string;
  /** Local offset on the hull, in metres along ship axes (x right, y up, z forward). */
  offset: [number, number, number];
  /** Facing direction yaw in degrees (0 = forward). */
  facing: number;
  /** Number of identical mounts represented by this hardpoint. */
  count: number;
}

export interface ShipClassDef {
  id: string;
  name: string;
  /** Short label used for auto-generated vessel names. */
  shortName?: string;
  faction: FactionId;
  role: ShipRole;
  /** Whether this class name/design is canonical or an original fan design. */
  designProvenance: Sourced<string>;
  lengthM: Sourced<number>;
  /** Hull integrity points. */
  hull: Sourced<number>;
  /** Armour thickness (flat per-hit reduction, depletes slowly). */
  armour: Sourced<number>;
  /** Kinetic barrier capacity. */
  barriers: Sourced<number>;
  /** Barrier regeneration per second when not recently hit. */
  barrierRegen: Sourced<number>;
  /** Maximum combat manoeuvring speed km/s (compressed). */
  maxSpeed: Sourced<number>;
  /** Acceleration km/s^2. */
  acceleration: Sourced<number>;
  /** Turn rate degrees/s. */
  turnRate: Sourced<number>;
  /** Sensor range km. */
  sensorRange: Sourced<number>;
  /** Target profile multiplier (1 = cruiser). Larger is easier to hit. */
  signature: number;
  /** Electronic warfare rating 0..1 (reduces enemy accuracy). */
  ecm: number;
  /** Crew/VI effectiveness 0..1.5 */
  crewQuality: number;
  hardpoints: HardpointDef[];
  /** Fighters carried (launched at battle start / on order). `source` carries the provenance of the complement (Oculus: SIMULATION_ESTIMATE with the extrapolation note, AP §13.1). */
  fighterComplement?: { classId: string; count: number; source?: Sourced<number> };
  /** Point value for scenario balancing and comparison metrics. */
  pointValue: number;
  description: string;
  /** Heat capacity of the hull (default 100; AP §3.1 M3). */
  heatCapacity?: Sourced<number>;
  /** Fraction of barrier regeneration that continues under fire, 0..1 (default 0; reaper_capital and harbinger 1). */
  barrierRegenUnderFire?: Sourced<number>;
  /** Barrier load threshold in points (default 0 = off; capitals 1,000). */
  barrierLoadThreshold?: Sourced<number>;
  /** Flagship hulls emit flagship_destroyed / flagship_mission_kill (normandy_sr2, normandy_valkyrie, destiny_ascension, harbinger). */
  flagship?: boolean;
  /** Mirrors UNIQUE_CLASS_IDS for data-driven UIs: one per battle, never scaled. */
  unique?: boolean;
  /** Ship-local waypoints between the arms (reaper_capital, harbinger) for Specials.strafeThrough. */
  strafeLane?: { from: Vec3; to: Vec3 };
  /**
   * IES stealth block (owner requirement, docs/apex/INTEGRATION_NOTES.md brief §15; SIMULATION_ESTIMATE):
   * silent-running capacity in seconds, venting time, the range at which a silent hull is detected
   * and how long firing reveals it. The mechanics land with the movement and scenario tasks.
   */
  stealth?: { capacity: Sourced<number>; ventTime: Sourced<number>; detectRange: Sourced<number>; revealOnFire: Sourced<number> };
}

/** Hulls that exist once per battle, never scaled by fleetStrength, clamped to one across both sides (AP §22.1). */
export const UNIQUE_CLASS_IDS: readonly string[] = ['harbinger', 'destiny_ascension', 'normandy_sr2', 'normandy_valkyrie'];
/** Named vessels whose loss emits a flagship event (AP §22.2). */
export const NAMED_FLAGSHIPS: readonly string[] = ['Harbinger', 'Sovereign', 'Destiny Ascension', 'SSV Normandy SR-2', 'SSV Normandy Valkyrie'];
/** True for an alternate-universe hull (designProvenance AU_MODIFIED); false for unknown ids. */
export const isAuClass = (classId: string): boolean => SHIP_CLASSES[classId]?.designProvenance.provenance === 'AU_MODIFIED';

import type { Vec3 } from '@/core/vec3';
import type { DamageType, FactionId, ShipRole } from '@/data/types';
import type { EffectiveWeapon, RuleSet, TechModifiers } from '@/timelines/rules';

export type Side = 'A' | 'B';

export type FormationType =
  | 'defensive_screen'
  | 'line_abreast'
  | 'strike_wedge'
  | 'capital_column'
  | 'fighter_screen'
  | 'dispersed'
  | 'layered_line'
  | 'stacked_wedge'
  | 'box'
  | 'swarm_descent'
  | 'broadside_line'
  | 'static';

export const FORMATION_LABELS: Record<FormationType, string> = {
  defensive_screen: 'Defensive screen',
  line_abreast: 'Broad defensive line',
  strike_wedge: 'Concentrated strike group',
  capital_column: 'Capital ship formation',
  fighter_screen: 'Fighter interception screen',
  dispersed: 'Dispersed formation',
  layered_line: 'Layered line (3D)',
  stacked_wedge: 'Stacked wedge (3D)',
  box: 'Box (3D)',
  swarm_descent: 'Descending swarm (Reaper)',
  broadside_line: 'Broadside line',
  static: 'Static (platforms)',
};

export type OrderType =
  | 'attack'
  | 'attack_target'
  | 'defend_position'
  | 'hold_formation'
  | 'advance'
  | 'withdraw'
  | 'escort'
  | 'intercept'
  | 'retreat';

export type TargetPriority = 'default' | 'reaper_destroyers' | 'reaper_capitals' | 'capitals' | 'escorts' | 'fighters';

/** Which mounts a fleet holds silent while a volley is pending. */
export type HoldFire = 'none' | 'spinal' | 'beams' | 'all';

/** Readiness tier of a fleet (AP §1.6): multiplies crew quality by 1.0 / 0.85 / 0.6 × readinessScale. */
export type Readiness = 'veteran' | 'regular' | 'reserve';

// --------------------------------------------------------- beat data model
// Plain data (CINEMATIC_DESIGN.md §1.1, WORK_BREAKDOWN.md §1.3.6). It lives
// here, not in beats.ts, because FleetOrders, BattleConfig and the event
// union reference it; beats.ts re-exports what it implements.

/** How a beat names ships. Resolved inside the simulation, deterministically (ties broken by ship id order). */
export type ShipRef =
  | { name: string }
  | { id: string }
  | { fleetId: string; classId?: string; role?: ShipRole; nth?: number }
  | { query: 'top_damage_dealer'; side: Side; window?: number; roles?: ShipRole[] }
  | { query: 'most_valuable'; side: Side; faction?: FactionId; role?: ShipRole; roles?: ShipRole[] }
  /** The nearest match to `to`, or — without `to` — to the ship the reference is resolved for (a volley target is resolved per mount). */
  | { query: 'nearest'; to?: ShipRef; side?: Side; role?: ShipRole; roles?: ShipRole[] }
  | { query: 'weakest_barriers'; side: Side; role?: ShipRole; roles?: ShipRole[] };

/** Fleet selector; `{ side, wave }` is the n-th beat-arriving wave of that side, by faction order. */
export type FleetSel = { fleetIds: string[] } | { side: Side } | { side: Side; wave: number } | 'all';

/**
 * Mount classes of a volley or a mount-level target order: `spinal` (anti-capital accelerators and Thanix lances with an
 * arc ≤ 25°), `beams` (Reaper beams), both, every anti-capital mount, or `broadside` (the remaining anti-ship
 * accelerators — the flank batteries; `force_target.mounts`, WORK_BREAKDOWN.md §1.6.3).
 */
export type VolleyMounts = 'spinal' | 'beams' | 'spinal_and_beams' | 'all_anti_capital' | 'broadside';
export type CaptionStyle = 'title' | 'tag' | 'tactical' | 'quote' | 'insert';

export interface ArrivalProfile {
  runKm: number;
  duration: number;
}

export type SpecialTrigger =
  | { type: 'drive_attack'; runner: ShipRef; target: ShipRef; window?: number; force?: 'success' | 'intercept'; ignoreCorridor?: boolean }
  | { type: 'hades_strike'; shooter: ShipRef; target: ShipRef; rounds?: number; force?: 'hit_penetrating'; outage?: 'weapons' | 'engines' }
  | { type: 'nova_strike'; shooter: ShipRef; target: ShipRef; withThanix?: boolean; force?: 'hit' }
  | { type: 'mission_kill'; ship: ShipRef; weapons?: number; engines?: number }
  | { type: 'destroy'; ship: ShipRef; killer?: ShipRef; ifHullBelow?: number; cause?: DestructionCause }
  | { type: 'set_hull_fraction'; ship: ShipRef; fraction: number; onlyLower?: boolean }
  | { type: 'set_barrier_fraction'; ship: ShipRef; fraction: number; onlyLower?: boolean }
  | { type: 'set_subsystem'; ship: ShipRef; subsystem: keyof Subsystems; level: number }
  | { type: 'withdraw_ship'; ship: ShipRef }
  | { type: 'interpose'; ship: ShipRef; protect: ShipRef; against?: ShipRef; seconds?: number }
  | { type: 'approach'; ship: ShipRef; target: ShipRef; km: number; seconds: number; passThrough?: boolean }
  | { type: 'strafe_through'; ship: ShipRef; target: ShipRef; seconds: number };

export type BeatEvent =
  /** Deploys `arrivalMode: 'beat'` fleets: by id, or by selector (`{ side, wave }` picks the n-th wave by faction order). */
  | { kind: 'spawn_wave'; fleetId?: string; fleets?: FleetSel; stagger?: number; run?: Partial<ArrivalProfile> }
  | { kind: 'set_fleet_order'; fleets: FleetSel; patch: Partial<FleetOrders> }
  /** `spread` (with a `nearest` target): each ship takes the nearest qualifying hull, weighted by how many ships already chose it (AP §4.3: the answer's beams spread over the nearest line hulls). */
  | { kind: 'fleet_volley'; fleets: FleetSel; window?: number; lead?: number; mounts?: VolleyMounts; target?: ShipRef; anchor?: ShipRef; syncArrival?: boolean; spread?: boolean }
  /** `seconds` (scene seconds, × beatScale; default `FORCE_TARGET_SECONDS`) is how long the scripted target holds. */
  /**
   * `spread` (ship-level, with a `nearest` target): the ships spread over the qualifying hulls like a spread volley
   * (`beats.ts` `spreadTargets`); `perFleet`: the target is resolved once per fleet, from its largest hull, for all its
   * members (AP §4.3's mark: each coalition fleet on the Reaper capital nearest to it).
   */
  | { kind: 'force_target'; ships?: ShipRef[]; fleets?: FleetSel; target: ShipRef; forceNextShot?: 'hit' | 'hit_penetrating'; mounts?: VolleyMounts; seconds?: number; spread?: boolean; perFleet?: boolean }
  | { kind: 'launch_drones'; fleets?: FleetSel; ships?: ShipRef[]; burst?: number }
  | { kind: 'trigger_special'; special: SpecialTrigger }
  | { kind: 'caption'; text: string; duration: number; style: CaptionStyle; speaker?: string; au?: boolean }
  | { kind: 'player_control'; locked: boolean };

export interface Beat {
  /** Stable id used by events, tests and the shot list ("volley", "arrive_turian"). */
  id: string;
  /** Scene seconds before `beatScale`. */
  at: number;
  event: BeatEvent;
  /**
   * Strict references. By default `anchor` and `target` are soft (WORK_BREAKDOWN.md §1.3.6): one that resolves to
   * nothing is dropped and the beat fires with `beat_fired.note`; with `true` the beat is skipped instead
   * (`beat_skipped`). Empty `ships` / `fleets` selectors and an unresolved special's ship skip the beat either way.
   */
  requireAlive?: boolean;
  label?: string;
  /**
   * World-state condition: the beat belongs to the battle (and to the briefing's preview) only when, for every key,
   * `worldState[key]` is one of the listed choices (e.g. `{ cerberus: ['allied'] }`). Absent: always.
   */
  when?: Record<string, string[]>;
}

export interface BeatScript {
  version: 1;
  beats: Beat[];
  /** 0.5–2.0; multiplies every `at` and every caption duration. Default 1. */
  beatScale: number;
  /** Player orders are refused (with a toast) until this scene time × beatScale. Default 0 = never locked. */
  lockPlayerUntil?: number;
  /** Sim-side marker used by the HUD/Showcase for honesty text. */
  scripted: boolean;
}

// --------------------------------------------------------- distant layer

export interface DistantGroup {
  id: string;
  side: Side;
  faction: FactionId;
  label: string;
  count: number;
  bearingDeg: number;
  distanceKm: number;
  spreadKm: number;
  classMix: { capital: number; heavy: number; line: number; light: number };
}

export interface DistantLayerConfig {
  enabled: boolean;
  groups: DistantGroup[];
  captions: 'apex' | 'canon' | 'none';
  firstLossAfter?: number;
}

export interface DistantGroupState {
  id: string;
  remaining: number;
  losses: number;
  firingRate: number;
}

export interface DistantState {
  groups: DistantGroupState[];
  lastUpdate: number;
}

// ------------------------------------------------------- runtime sub-states

export interface ArrivalState {
  appearAt: number;
  settleAt: number;
  from: Vec3;
  to: Vec3;
}

export interface DriveRunState {
  targetId: string;
  startedAt: number;
  endsAt: number;
  completes: boolean;
  tier: 'rare' | 'upper';
}

export interface InterposeState {
  protectId: string;
  againstId?: string;
  until: number;
}

export type ManoeuvreState = { phase: 'approach' | 'run' | 'turnIn' | 'extend' | 'pass' | 'turn'; until: number; line?: { from: Vec3; to: Vec3 } };

/** IES stealth state of a stealth hull (brief §15.2): silent, revealed or venting. */
export type StealthMode = 'silent' | 'revealed' | 'venting';

/**
 * Runtime stealth state, present only on hulls whose class carries a `stealth`
 * block (the Normandy and the SR-2-pattern stealth frigates). Every other hull
 * leaves it undefined and behaves exactly as before.
 */
export interface StealthState {
  state: StealthMode;
  /** Seconds of combat heat stored in the sink while not venting; venting is forced at `capacity`. */
  sinkHeat: number;
  /** The ship stays revealed until this time (firing, taking a hit, detection). */
  revealedUntil: number;
  /** A vent ends at this time; the sink is empty afterwards. */
  ventingUntil: number;
  capacity: number;
  ventTime: number;
  /** Compressed-battlespace km inside which a silent hull is detected. */
  detectRange: number;
  revealOnFire: number;
}

/** Firing solution against one target: q in 0..1 builds while tracking and decays off-target. */
export interface Solution {
  targetId: string;
  q: number;
  since: number;
}

export interface VolleyState {
  at: number;
  window: number;
  mounts: VolleyMounts;
  targetId?: string;
  syncArrival: boolean;
  offsets: Map<string, number>;
  fired: number;
  held: number;
  silent: number;
}

export type DestructionCause = 'kinetic' | 'thanix_stream' | 'reaper_beam' | 'warhead' | 'laser' | 'drive_attack' | 'scripted' | 'combat_ineffective';

export interface FleetOrders {
  order: OrderType;
  /** Target ship id for attack_target / escort / intercept. */
  targetId?: string;
  /** Position for defend_position. */
  position?: Vec3;
  formation: FormationType;
  focusFire: boolean;
  priority: TargetPriority;
  protectCapitals: boolean;
  fightersDeployed: boolean;
  /** GARDIAN concentrates on missiles rather than fighters. */
  pointDefenceMissiles: boolean;
  /** Mounts held silent until a volley releases them (default 'none'). */
  holdFire?: HoldFire;
  /** Keep HADES rounds in the magazine (ordinary slugs only). */
  holdSpecialAmmo?: boolean;
  /**
   * The formation anchor drifts to this point (nominal km like `position`; the components it names) at the fleet's
   * anchor speed, never sweeping the line of sight from its aim point faster than the heading-rate limit — the Reaper
   * climb of the Final Battle (AP §4.2). Dropped once reached.
   */
  anchorGoal?: Partial<Vec3>;
  /** Target reference resolved at issue time. */
  targetRef?: ShipRef;
}

export interface ShipSpec {
  classId: string;
  count: number;
  /** Optional named vessels (e.g. "SSV Kilimanjaro") assigned in order. */
  names?: string[];
}

export interface FleetSpec {
  id: string;
  name: string;
  faction: FactionId;
  side: Side;
  ships: ShipSpec[];
  formation: FormationType;
  /** Fleet centre at deployment (km). */
  position: Vec3;
  /** Initial facing (unit vector). */
  heading: Vec3;
  initialOrder?: Partial<FleetOrders>;
  /** Seconds after battle start when the fleet arrives (0 = present at start). */
  arrivalTime?: number;
  /** Player can command this fleet. */
  playerControlled?: boolean;
  /** Scenario-level technology override for this fleet (e.g. Reaper-upgraded geth). Merged over the faction's rules. */
  techOverride?: Partial<TechModifiers>;
  /** 'time' (default): deployed at arrivalTime; 'beat': deployed only by a spawn_wave beat. */
  arrivalMode?: 'time' | 'beat';
  /** Ships of this fleet arrive with the FTL flash and run-in. */
  arrivalFlash?: boolean;
  /** Readiness tier (AP §1.6); canon scenarios never set it. */
  readiness?: Readiness;
  /** Fixed platforms: never moves, move orders are rejected. */
  static?: boolean;
  /** Enemies of both sides for targeting only; bookkeeping stays with `side` (AP §4.1). */
  rogue?: boolean;
}

export type Environment =
  | 'earth_orbit'
  | 'palaven_orbit'
  | 'thessia_orbit'
  | 'rannoch_orbit'
  | 'surkesh_orbit'
  | 'citadel'
  | 'deep_space'
  | 'relay';

export interface BattleConfig {
  id: string;
  name: string;
  scenarioId: string;
  seed: number;
  rules: RuleSet;
  fleets: FleetSpec[];
  environment: Environment;
  /** Battle ends by attrition judgement at this time (s). */
  maxDuration: number;
  /** Fleets on this side are the "player"/perspective side for results. */
  perspectiveSide: Side;
  /** Human-readable description of objective. */
  objective: string;
  /** Optional narrative label for world-state choices used by the scenario. */
  worldState?: Record<string, string>;
  /** Scripted beats (cinematic openings, showcase scenes). */
  beats?: BeatScript;
  /** Statistical distant engagement layer. */
  distant?: DistantLayerConfig;
  /** The order of battle fields alternate-universe hulls (HUD banner, "Custom (AU)" naming). */
  auContent?: boolean;
  /** Display names for the two sides. */
  sideLabels?: Record<Side, string>;
  /** Notes shown on the briefing (world-state coercions, budget warnings). */
  notes?: string[];
}

export interface WeaponState {
  index: number;
  hardpointIndex: number;
  mount: number;
  def: EffectiveWeapon;
  cooldown: number;
  /** Local offset in km. */
  offset: Vec3;
  facing: number;
  /** For beams: remaining burst time and current target. */
  beamRemaining: number;
  beamTargetId?: string;
  beamHit: boolean;
  /** World-space termination point of an active beam (km). */
  beamEnd?: Vec3;
  /** World-space origin of the active beam (km). */
  beamStart?: Vec3;
  /** Rounds remaining for magazine-limited weapons (undefined = unlimited). */
  ammo?: number;
  /** Shots left in the current point-defence burst (burst weapons only). */
  burstLeft?: number;
  /** Seconds until a spent burst recovers. */
  burstRecover: number;
  /** HADES rounds left in the separate magazine (Titan gun under hadesRounds). */
  specialAmmo?: number;
  /** Per-mount heat pool (perMountHeat weapons). */
  heat?: number;
  /** Seconds of charge left before the mount may fire (chargeTime weapons). */
  charging?: number;
  /** A scripted next shot: forced hit / penetration against a target until `expiresAt`. */
  forcedShot?: { targetId: string; hit: boolean; penetrate: boolean; expiresAt: number };
  /** The mount waits for the fleet's arrival volley. */
  arrivalHold?: boolean;
  /** A flight's beam burst: how many members' beams hit (the burst's damage multiplier; undefined = one beam). */
  beamMembers?: number;
  /** A mount-level target (volley target resolved per mount, `force_target.mounts`, a HADES salvo) until `assignedUntil`. */
  assignedTargetId?: string;
  assignedUntil?: number;
}

export interface Subsystems {
  engines: number; // 0..1
  weapons: number;
  sensors: number;
}

export interface ShipStats {
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  hits: number;
  kills: number;
  /** Damage dealt recently, exponentially decayed (τ = 10 s). */
  recentDamage: number;
}

export interface ShipState {
  id: string;
  name: string;
  classId: string;
  faction: FactionId;
  role: ShipRole;
  side: Side;
  fleetId: string;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  heading: Vec3;
  prevHeading: Vec3;
  lengthKm: number;
  radiusKm: number;
  signature: number;
  hull: number;
  maxHull: number;
  armour: number;
  maxArmour: number;
  barriers: number;
  maxBarriers: number;
  barrierRegen: number;
  maxSpeed: number;
  acceleration: number;
  turnRate: number; // rad/s
  sensorRange: number;
  ecm: number;
  crewQuality: number;
  heat: number;
  heatCapacity: number;
  overheated: boolean;
  weapons: WeaponState[];
  subsystems: Subsystems;
  alive: boolean;
  destroyedAt?: number;
  targetId?: string;
  /** Formation slot offset in fleet-local space (km). */
  slot: Vec3;
  /** Battlegroup (brief §22): the hull this one keeps station on — its group's lead capital; absent for a leader. */
  groupLeaderId?: string;
  /** Fleet-local slot of the group's reference (its leader's slot when the formation was laid out; km). */
  groupSlot?: Vec3;
  /** Yaw of the hull's station facing off the fleet heading (rad; brief §22, "a slight yaw"). */
  stationYaw?: number;
  withdrawing: boolean;
  /** Left the battlespace (retreated). Still alive, no longer participates. */
  escaped: boolean;
  lastHitAt: number;
  /** Time the ship first fired (for comms). */
  firstShotAt?: number;
  /** Fighter returning to its carrier to reload torpedoes. */
  rearming?: boolean;
  /** Seconds of hangar time left before a rearming fighter relaunches. */
  rearmTimer?: number;
  aiTimer: number;
  stats: ShipStats;
  /** Carrier: fighters not yet launched. */
  hangar?: { classId: string; remaining: number; launchTimer: number; burst?: number };
  /** Fighter: id of carrier (returns there when recalled). */
  carrierId?: string;
  pointValue: number;
  /** Ship-level overrides from player orders. */
  forcedTargetId?: string;
  escortId?: string;
  /** Flagship hull or named flagship (AP §22.2). */
  flagship: boolean;
  /** Copied from the fleet spec: enemy of both sides for targeting only. */
  rogue: boolean;
  /** Small craft simulated as a flight of several craft (AP §21.3). */
  flight?: { classId: string; craft: number; maxCraft: number };
  /** FTL arrival run-in; the ship is inert until `appearAt`. */
  arrival?: ArrivalState;
  driveRun?: DriveRunState;
  interpose?: InterposeState;
  manoeuvre?: ManoeuvreState;
  /** Firing solutions per target. */
  solutions: Solution[];
  /** A scripted forced target expires at this time. */
  forcedTargetUntil?: number;
  /** A HADES outage restores `amount` of `subsystem` at `until`. */
  outageUntil?: { subsystem: keyof Subsystems; until: number; amount: number };
  /** No barrier recovery before this time (HADES regen suppression). */
  regenSuppressedUntil: number;
  /** Times of recent hits taken (final-salvo count for flagship events). */
  recentHitTimes: number[];
  /** Each flagship event is emitted at most once. */
  flagshipEvents: { destroyed: boolean; missionKill: boolean };
  /** Fraction of barrier regeneration that continues under fire (M1). */
  barrierRegenUnderFire: number;
  /** Barrier load threshold in points, 0 = off (M2). */
  barrierLoadThreshold: number;
  /** Tactical-withdrawal recovery station behind the line (km). */
  recoveryStation?: Vec3;
  /** IES stealth runtime state; only stealth hulls carry it. */
  stealth?: StealthState;
}

export interface Projectile {
  id: number;
  shooterId: string;
  side: Side;
  weapon: EffectiveWeapon;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  ttl: number;
  intendedTargetId: string;
  /** A HADES round left the gun (counts against specialAmmo; the fuse runs on impact). */
  special: boolean;
  /** Closest approach to the intended target for a deliberate miss (km); cleared once the round has passed it. */
  missDistance?: number;
  /**
   * The hit roll failed and the round was aimed off its target (kept for the whole flight, unlike `missDistance`). A
   * HADES penetrator arms only when it strikes the hull it was fired at on a successful roll: one that misses or is
   * intercepted by another hull is an expensive slug (AP §7).
   */
  rolledMiss?: boolean;
  /**
   * A scripted shot (`WeaponState.forcedShot`: `Specials.hadesStrike`, `forceTarget`, `force_target.forceNextShot`):
   * with `hit` the round steers onto its intended target and can strike nothing else; with `penetrate` a penetrator's
   * warhead arms whatever the barrier held; `outage` names the subsystem the warhead knocks out.
   */
  forced?: { hit: boolean; penetrate: boolean; outage?: 'weapons' | 'engines' };
}

export interface Missile {
  id: number;
  shooterId: string;
  side: Side;
  weapon: EffectiveWeapon;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  targetId: string;
  hp: number;
  ttl: number;
  alive: boolean;
  /** A scripted forced hit (`forcedShot.hit`): it cannot miss once it arrives; point defence can still kill it on the way. */
  forced?: boolean;
}

export interface BeamVisual {
  shooterId: string;
  weaponIndex: number;
  targetId: string;
  /** Point the beam terminates at (km). */
  end: Vec3;
  remaining: number;
  kind: 'thanix' | 'reaper_beam';
  hit: boolean;
}

export interface FleetState {
  spec: FleetSpec;
  orders: FleetOrders;
  anchor: Vec3;
  heading: Vec3;
  /** Fleet-level focus target. */
  focusTargetId?: string;
  decisionTimer: number;
  arrived: boolean;
  startPoints: number;
  /** Comms cooldowns to avoid spam. */
  commsCooldown: number;
  /** Coordination penalty (Reaper command vulnerability). */
  coordinationPenalty: number;
  /** Pending coordinated volley. */
  volley?: VolleyState;
  /** Bearing of approach locked once inside engagement range. */
  approachBearing: Vec3;
  headingLocked: boolean;
  /** Fixed platforms: the fleet never moves. */
  static: boolean;
  doctrineFacing: 'bow' | 'broadside';
  /** Timer for the expensive part of fleetDecision (0.25 s). */
  decisionSlowTimer: number;
}

// -------------------------------------------------------------------- Events

export interface FlagshipEventBase {
  shipId: string;
  name: string;
  classId: string;
  faction: FactionId;
  side: Side;
  pos: Vec3;
  tier: 'harbinger' | 'flagship';
  transmission: string;
  reaction: string;
}

export type BattleEvent =
  | { t: number; type: 'battle_start'; name: string }
  | { t: number; type: 'ship_deployed'; shipId: string; classId: string; faction: FactionId; side: Side; name: string }
  | { t: number; type: 'fleet_arrived'; fleetId: string }
  /**
   * `muzzle`: world position the shot left from (`mountWorldPosition`); `projectileId`: the first round's id (a volley of
   * `shots` rounds carries consecutive ids; mass accelerators and torpedoes); `volley` / `salvo`: a fleet volley's or a
   * coordinated HADES salvo's shot; `forced`: a scripted forced shot (brief §20, CINEMATIC_DESIGN.md §1.6).
   */
  | { t: number; type: 'weapon_fired'; shipId: string; weaponId: string; targetId: string; weaponIndex: number; kind: string; shots?: number; special?: boolean; volley?: boolean; salvo?: boolean; forced?: boolean; muzzle?: Vec3; projectileId?: number }
  /**
   * `armourDamage`: energy the armour stopped after the barrier; `penetrated`: some of the round passed the barrier;
   * `projectileId` links the impact to its `weapon_fired`; `special`: a HADES penetrator (its warhead, if the fuse armed,
   * follows as `hades_detonation`) — brief §20.
   */
  | { t: number; type: 'projectile_impact'; shipId: string; targetId: string; damage: number; damageType: DamageType; barrierDamage: number; hullDamage: number; armourDamage?: number; penetrated?: boolean; weaponId?: string; projectileId?: number; special?: boolean; pos: Vec3 }
  | { t: number; type: 'projectile_near_miss'; shooterId: string; targetId: string; pos: Vec3; miss: number }
  | { t: number; type: 'barrier_damaged'; shipId: string; remaining: number }
  | { t: number; type: 'barriers_down'; shipId: string }
  | { t: number; type: 'subsystem_disabled'; shipId: string; subsystem: keyof Subsystems; level: number }
  | { t: number; type: 'ship_destroyed'; shipId: string; killerId?: string; classId: string; faction: FactionId; side: Side; name: string; pos: Vec3; role: ShipRole; cause: DestructionCause; weaponId?: string }
  | { t: number; type: 'missile_intercepted'; missileId: number; interceptorId: string; pos: Vec3 }
  | { t: number; type: 'fighters_launched'; carrierId: string; count: number }
  | { t: number; type: 'ammunition_depleted'; shipId: string; weaponId: string }
  | { t: number; type: 'fighter_rearmed'; shipId: string; carrierId: string }
  | { t: number; type: 'fleet_withdraw'; fleetId: string; side: Side }
  | { t: number; type: 'ship_withdrawing'; shipId: string }
  | { t: number; type: 'reinforcement_arrival'; fleetId: string; side: Side }
  | { t: number; type: 'order_issued'; fleetId: string; order: string }
  | { t: number; type: 'order_rejected'; fleetId: string; order: string; reason: 'static_fleet' | 'player_locked' }
  | { t: number; type: 'comms'; faction: FactionId; side: Side; text: string }
  | { t: number; type: 'objective_completed'; side: Side; text: string }
  | { t: number; type: 'beat_fired' | 'beat_skipped'; beatId: string; kind: string; label?: string; note?: string }
  | { t: number; type: 'caption'; text: string; duration: number; style: CaptionStyle; speaker?: string; au: boolean }
  | { t: number; type: 'fleet_volley_ordered'; fleetId: string; at: number; window: number; mounts: VolleyMounts; mountsOrdered: number; anchorShipId?: string }
  | { t: number; type: 'fleet_volley_fired'; fleetId: string; fired: number; held: number; silent: number }
  | { t: number; type: 'ship_arrival_flash'; shipId: string; pos: Vec3; heading: Vec3; lengthKm: number }
  | { t: number; type: 'drive_run_started'; runnerId: string; targetId: string; endsAt: number }
  | { t: number; type: 'drive_run_impact'; runnerId: string; targetId: string; pos: Vec3; dir: Vec3; success: boolean }
  /** A committed drive run whose target was destroyed by someone else before `endsAt`: the runner fights on (T14 addition). */
  | { t: number; type: 'drive_run_aborted'; runnerId: string; targetId: string; reason: 'target_lost' }
  | { t: number; type: 'hades_detonation'; shipId: string; targetId: string; pos: Vec3; damage: number; outage: keyof Subsystems; projectileId?: number }
  | { t: number; type: 'strike_scheduled'; shipId: string; weaponId: string; at: number; kind: 'hades' | 'nova' | 'nova_legacy' }
  | { t: number; type: 'weapon_charging'; shipId: string; weaponIndex: number; weaponId?: string; seconds: number }
  | { t: number; type: 'mission_kill'; shipId: string }
  | { t: number; type: 'scripted_event'; beatId?: string; special: string; shipIds: string[]; forced: boolean; detail?: Record<string, number> }
  | { t: number; type: 'forced_shot_expired'; shipId: string; weaponIndex: number }
  | { t: number; type: 'flight_member_lost'; shipId: string; remaining: number }
  | { t: number; type: 'distant_update'; groups: { id: string; remaining: number; losses: number }[] }
  | { t: number; type: 'distant_group_broken'; id: string }
  | ({ t: number; type: 'flagship_destroyed'; killer?: { shipId: string; name: string; classId: string; faction: FactionId; weaponId?: string; weaponName?: string }; damageType?: DamageType; finalSalvoHits: number } & FlagshipEventBase)
  | ({ t: number; type: 'flagship_mission_kill' } & FlagshipEventBase)
  | { t: number; type: 'stealth_engaged' | 'stealth_revealed' | 'stealth_venting'; shipId: string; reason?: string }
  | { t: number; type: 'battle_end'; winner: Side | 'draw'; reason: string };

export interface SideSummary {
  side: Side;
  factions: FactionId[];
  deployed: number;
  destroyed: number;
  survivors: number;
  capitalDeployed: number;
  capitalLost: number;
  reaperCapitalLost: number;
  reaperDestroyersLost: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  hits: number;
  pointsDeployed: number;
  pointsLost: number;
  survivalPercent: number;
  /** Damage dealt per point of fleet value lost. */
  tacticalEffectiveness: number;
  lossesByClass: Record<string, { deployed: number; lost: number; name: string }>;
}

export interface BattleResult {
  configId: string;
  scenarioId: string;
  rulesId: string;
  rulesName: string;
  seed: number;
  duration: number;
  winner: Side | 'draw';
  reason: string;
  perspectiveSide: Side;
  outcome: 'victory' | 'defeat' | 'draw';
  sides: Record<Side, SideSummary>;
  eventCount: number;
  objectiveCompleted: boolean;
}

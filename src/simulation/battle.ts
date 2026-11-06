import { Rng } from '@/core/rng';
import {
  add,
  addScaled,
  clone,
  cross,
  distance,
  dot,
  interceptPoint,
  length,
  lengthSq,
  normalize,
  rotateY,
  scale,
  sub,
  v3,
  type Vec3,
} from '@/core/vec3';
import { FACTIONS, type CommsEvent } from '@/data/factions';
import { NameRegistry } from '@/data/names';
import { getShipClass } from '@/data/ships';
import { HADES_GATE, NAMED_FLAGSHIPS, isCapitalRole, type DamageType, type FactionId, type WarheadDef } from '@/data/types';
import { WEAPONS, getWeapon } from '@/data/weapons';
import { applyRulesToShip, applyRulesToWeapon, cloneRules, type EffectiveWeapon, type RuleSet } from '@/timelines/rules';
import { beginWithdrawal, centroid, fleetDecision, fleetEngagementRange, movementGoal, shipDecision, type AiContext } from './ai';
import { threatenedGroup, topGunPlatform } from './reaperAi';
import { applyDamage, barrierFraction, hitProbability } from './damage';
import { layoutFormation, type FormationLayout } from './formations';
import { WITHDRAWAL, WITHDRAWN_QUIET_SECONDS, approachProgress, enforceClearance, fleetMotion, noteLoss, spreadSlot, steerShip } from './movement';
import { SHARED_SOLUTION_Q, barrierFlare, missOffset, shotQuality, solutionFactor, updateSolutions, usesSolution } from './solutions';
import { CRAFT_DETECT_RANGE, STEALTH_SAFE_RANGE, STEALTH_VENT_FRACTION, detectable, hunterHoldsFire, silentHull } from './stealth';
import { SimProfile } from './profile';
import { summarise } from './results';
import { GRID_CELL_KM, SpatialGrid, gridFilterPasses } from './spatial';
import { FLIGHT_SIZE, formFlight, launchAsFlights, launchUnits, liveCraft, membersLeft } from './flights';
import { ARC_VERTICAL_REACH, BATTLESPACE_SCALE as S, SIM_DT } from './constants';
import { DEFAULT_ARRIVAL_STAGGER, arrivalPending, arrivalPos, arrivalProfileFor } from './arrival';
import { applyBeat, beatApplies, clampBeatScale, resolveFleetSel as resolveFleetSelIn, resolveShipRef as resolveShipRefIn, scheduleBeats, waveSpawnPending, type ScheduledBeat } from './beats';
import { DistantLayer, type DistantHost } from './distant';
import { considerDriveRun, tickDriveRun, type DriveHost } from './driveAttack';
import { flagshipDestroyedEvent } from './flagships';
import type { SimKernel } from './kernel';
import { inScriptedMove, tickScriptedMove } from './scriptedMoves';
import { consumeForcedShot, createSpecials, dropForcedShot, forcedShotExtra, type Specials } from './specials';
import {
  finishVolley,
  hadesSalvoOf,
  heldBy,
  noteSalvoShot,
  noteVolleyShot,
  openHadesSalvo,
  orderVolley as orderVolleyIn,
  salvoStep,
  volleyEnd,
  volleyStep,
  type VolleyHost,
  type VolleyOptions,
} from './volley';

/** Hangar time for a fighter to reload torpedoes alongside its carrier. */
const REARM_SECONDS = 12;
import type {
  ArrivalProfile,
  ArrivalState,
  BattleConfig,
  BattleEvent,
  BattleResult,
  DestructionCause,
  DistantState,
  FleetOrders,
  FleetSel,
  FleetSpec,
  FleetState,
  FormationType,
  Missile,
  OrderType,
  Projectile,
  ShipRef,
  ShipState,
  Side,
  Subsystems,
  WeaponState,
} from './types';

export { SIM_DT };

/** Heat pool of a `perMountHeat` mount (heavy Thanix channel): the mount fires only while a shot fits under this (AP §14.3). */
export const MOUNT_HEAT_CAPACITY = 100;
/** `stats.recentDamage` decays exponentially with τ = 10 s (AP §10). */
const RECENT_DAMAGE_DECAY = Math.exp(-SIM_DT / 10);
/** Hits taken in the last 3 s are the "final salvo" of a flagship event (AP §22.2). */
const RECENT_HIT_WINDOW = 3;
/**
 * A mount that finds nothing to shoot at waits this long before it scans again (AP §21.5, TUNE 0.25–0.5 s).
 * Deterministic: it is a plain cooldown, so an idle point-defence battery no longer rescans every tick.
 */
export const IDLE_RETRY_S = 0.25;
/** Target acquisition scores at most this many nearest candidates plus every capital hull in range (AP §21.5). */
export const TARGET_CANDIDATE_CAP = 24;
/** A mass-accelerator round flies on to this multiple of its gun's range (brief §8.7: long shots stream past). */
export const PROJECTILE_RANGE_FACTOR = 2.2;
/** A round passing its intended target within this many radii is a near miss (the barrier-edge flare). */
export const NEAR_MISS_RADII = 1.6;
/** Broadsides fire freely but miss more (AP §19 8.7). */
export const BROADSIDE_ACCURACY = 0.85;

/** Options of a resolved hit (`BattleSimulation.applyHit`). */
export interface HitOptions {
  /** The round is a HADES penetrator (left the gun through the gate or a forced strike). */
  special?: boolean;
  /** A forced strike names the subsystem the warhead knocks out; otherwise `rng.pick(['weapons', 'engines'])`. */
  outage?: 'weapons' | 'engines';
  /** A forced `hit_penetrating` strike arms the warhead whatever the residual (logged by the caller). */
  forcePenetrate?: boolean;
  /** The round's id (`Projectile.id` / `Missile.id`), carried on `projectile_impact` and `hades_detonation` (brief §20). */
  projectileId?: number;
}

/**
 * World position of a hull's mount (brief §20: the muzzle the gunnery cameras sit at and the rounds leave from). The
 * mount offset is ship-local in km (forward +z, right +x, up +y) and turns with the hull's yaw — the same frame the
 * simulation fires from, so a projectile's first position is exactly this point. Undefined for an unknown mount.
 */
export function mountWorldPosition(ship: ShipState, mountIndex: number): Vec3 | undefined {
  const w = ship.weapons[mountIndex];
  if (!w) return undefined;
  const yaw = Math.atan2(ship.heading.x, ship.heading.z);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const o = w.offset;
  return v3(ship.pos.x + o.x * cos + o.z * sin, ship.pos.y + o.y, ship.pos.z - o.x * sin + o.z * cos);
}

/**
 * The HADES gate (AP §7): the AI spends a penetrator only on a Reaper capital
 * whose barriers are collapsed or below `HADES_GATE.barrierFractionBelow`.
 */
export const hadesGateOpen = (target: ShipState): boolean =>
  target.role === 'reaper_capital' && (target.barriers <= 0 || barrierFraction(target) < HADES_GATE.barrierFractionBelow);

const EMPTY_SHIPS: ShipState[] = [];

/** Doctrine facing of a fleet (CINEMATIC_DESIGN.md §7.1): a broadside line turns its flank to the enemy; Reapers always fight bow-on. */
const doctrineFacingFor = (faction: FactionId, formation: FormationType): 'bow' | 'broadside' => (formation === 'broadside_line' && faction !== 'reaper' ? 'broadside' : 'bow');

/** The orders a static fleet cannot follow: every move-type order, a formation change, a position or an anchor goal. */
const MOVE_ORDERS: ReadonlySet<OrderType> = new Set<OrderType>(['advance', 'attack', 'withdraw', 'retreat', 'escort', 'intercept', 'defend_position']);
const movesFleet = (patch: Partial<FleetOrders>, current: FleetOrders): boolean =>
  (patch.order !== undefined && MOVE_ORDERS.has(patch.order)) ||
  (patch.formation !== undefined && patch.formation !== current.formation) ||
  patch.position !== undefined ||
  patch.anchorGoal !== undefined;

/** An anchor goal is given in nominal km like a fleet position; the battlespace runs compressed (`× S`). */
const scaleGoal = (g: Partial<Vec3>): Partial<Vec3> => ({
  ...(g.x !== undefined ? { x: g.x * S } : {}),
  ...(g.y !== undefined ? { y: g.y * S } : {}),
  ...(g.z !== undefined ? { z: g.z * S } : {}),
});

/** The `order` text of `order_issued` / `order_rejected`: the patch's fields as `key=value`. */
const orderLabel = (patch: Partial<FleetOrders>): string =>
  Object.entries(patch)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');

const DEFAULT_ORDERS: FleetOrders = {
  order: 'attack',
  formation: 'line_abreast',
  focusFire: true,
  priority: 'default',
  protectCapitals: false,
  fightersDeployed: true,
  pointDefenceMissiles: false,
};

/**
 * Deterministic, headless battle simulation. Stepped at a fixed 20 Hz. All
 * randomness comes from a seeded RNG; given identical config the event log
 * is identical, which is what makes replays and canon-vs-AU comparisons valid.
 */
export class BattleSimulation implements AiContext {
  readonly config: BattleConfig;
  readonly rng: Rng;
  readonly rules;
  time = 0;
  tick = 0;
  ships: ShipState[] = [];
  readonly shipById = new Map<string, ShipState>();
  readonly fleets = new Map<string, FleetState>();
  projectiles: Projectile[] = [];
  missiles: Missile[] = [];
  readonly events: BattleEvent[] = [];
  /** Transient per-tick visual notifications (gardian shots etc.). */
  flashes: { from: Vec3; to: Vec3; kind: 'gardian' | 'reaper_pd'; ttl: number }[] = [];
  finished = false;
  result?: BattleResult;
  /** Per-phase step timings; zero cost and no clock while `profile.enabled` is false (the default). */
  readonly profile = new SimProfile();
  /** Spatial hash over the live hulls, rebuilt every tick after the reinforcements deploy (AP §21.5). */
  readonly grid = new SpatialGrid(GRID_CELL_KM);
  private nextId = 1;
  private shipCounter = new Map<string, number>();
  private fleetRules = new Map<string, RuleSet>();
  private pendingFleets: FleetSpec[] = [];
  private heavyLossesAnnounced = new Set<Side>();
  private engagementAnnounced = new Set<string>();
  /** Listener for events (renderer/UI). */
  onEvent?: (e: BattleEvent) => void;

  /** Pace of the beat script (`BeatScript.beatScale`, 0.5–2.0; 1 without a script): multiplies beat times and caption durations. */
  readonly beatScale: number;
  /** Remaining scheduled beats in firing order. */
  private beatList: ScheduledBeat[];
  /** Player orders are refused while true: until `playerLockUntil`, or as a `player_control` beat says. */
  playerLocked: boolean;
  private lockUntil: number;
  private lockReleased = false;
  /** Scripted specials (beats, showcase scenes, tests, the player's HADES order). */
  readonly special: Specials;
  /** Internal plumbing for `beats.ts` and `specials.ts` (see `kernel.ts`); not for render or UI code. */
  readonly kernel: SimKernel;
  /** Hulls carrying an arrival run-in (pending or running in); the arrival bookkeeping runs only while any exists. */
  private arrivals = 0;
  /** Arrival states whose `ship_arrival_flash` has been emitted. */
  private readonly flashed = new WeakSet<ArrivalState>();
  /** The battle's vessel names and Reaper designations (brief §12; `src/data/names.ts`). */
  private readonly names: NameRegistry;
  /** The statistical distant engagement layer's state (present when `config.distant?.enabled`; AP §13.3). */
  readonly distant?: DistantState;
  /** Its runtime: a child generator forked once here, advanced after `checkEnd`, read by nothing in the battle. */
  private readonly distantLayer?: DistantLayer;

  constructor(config: BattleConfig) {
    this.config = config;
    this.rules = config.rules;
    this.rng = new Rng(config.seed);
    // Vessel names come from their own seeded registry (brief §12), so naming never touches the battle's draws.
    this.names = new NameRegistry(config.seed);
    // The distant layer draws from its own child generator, forked before anything else (forking draws nothing), so
    // the real battle is bit-identical with the layer on or off (AP §13.3).
    if (config.distant?.enabled) {
      this.distantLayer = new DistantLayer(config.distant, this.rng.fork('distant'));
      this.distant = this.distantLayer.state;
    }
    this.beatScale = clampBeatScale(config.beats?.beatScale);
    const ws = config.worldState;
    // Beats the world state excludes (`Beat.when`) never enter the queue; a config without a world state keeps them all.
    this.beatList = config.beats ? scheduleBeats({ ...config.beats, beatScale: this.beatScale, beats: config.beats.beats.filter((b) => ws === undefined || beatApplies(b, ws)) }) : [];
    this.lockUntil = Math.max(0, (config.beats?.lockPlayerUntil ?? 0) * this.beatScale);
    this.playerLocked = this.lockUntil > 0;
    this.kernel = {
      emit: (e) => this.emit(e),
      destroyShip: (ship, killer, cause, weaponId) => this.destroyShip(ship, killer, cause, weaponId),
      comms: (side, kind, shipName, fleet) => this.comms(side, kind, shipName, fleet),
      noteFlightLosses: (ship) => this.noteFlightLosses(ship),
      pending: (ship) => this.isPending(ship),
      withdraw: (ship) => {
        const fleet = this.fleets.get(ship.fleetId);
        if (!fleet) return;
        beginWithdrawal(this, ship, fleet);
        this.emit({ t: this.time, type: 'ship_withdrawing', shipId: ship.id });
      },
      spawnBeatFleet: (spec, opts) => {
        if (this.fleets.has(spec.id)) return undefined;
        const fleet = this.deployFleet(spec, { stagger: opts.stagger ?? DEFAULT_ARRIVAL_STAGGER, run: opts.run });
        this.comms(spec.side, 'battle_start', undefined, fleet);
        return fleet;
      },
      applyOrders: (fleetId, patch, source) => this.applyOrders(fleetId, patch, source),
      drive: this.driveHost,
    };
    this.special = createSpecials(this, this.kernel);
    this.emit({ t: 0, type: 'battle_start', name: config.name });
    for (const f of config.fleets) {
      // A beat-arriving fleet is deployed only by its `spawn_wave` beat (CINEMATIC_DESIGN.md §1.1).
      if (f.arrivalMode === 'beat') continue;
      if ((f.arrivalTime ?? 0) <= 0) this.deployFleet(f);
      else this.pendingFleets.push(f);
    }
    this.pendingFleets.sort((a, b) => (a.arrivalTime ?? 0) - (b.arrivalTime ?? 0));
    this.comms(undefined, 'battle_start');
  }

  /** Remaining scheduled beats (read-only view for the HUD, the briefing and the showcase). */
  get beatQueue(): readonly ScheduledBeat[] {
    return this.beatList;
  }
  /** When the opening's player lock ends (s; 0 when the battle was never locked). */
  get playerLockUntil(): number {
    return this.lockUntil;
  }
  /** Whether a hull is still waiting for its arrival flash: inert — no AI, no targeting, no collisions, no fire. */
  isPending(ship: ShipState): boolean {
    return arrivalPending(ship.arrival, this.time);
  }

  // ------------------------------------------------------------------ setup

  /**
   * Deploys a fleet: its hulls on their formation slots, or — with `arrival` (a beat wave, an `arrivalFlash`
   * reinforcement) — through the arrival kinematics (CINEMATIC_DESIGN.md §1.5): each hull appears at a seeded offset
   * inside `stagger` (drawn from `rng` in deployment order), `runKm` behind its slot along the fleet heading, and
   * decelerates into the slot over the role's duration; until it appears it is inert, while it runs in it can be shot
   * but holds fire. `reinforcement_arrival` for every deployment at t > 0; `fleet_arrived` once every hull is in.
   */
  private deployFleet(spec: FleetSpec, arrival?: { stagger: number; run?: Partial<ArrivalProfile> }): FleetState {
    const fleet: FleetState = {
      spec,
      orders: {
        ...DEFAULT_ORDERS,
        formation: spec.formation,
        ...(spec.initialOrder ?? {}),
        ...(spec.initialOrder?.position ? { position: scale(spec.initialOrder.position, S) } : {}),
        ...(spec.initialOrder?.anchorGoal ? { anchorGoal: scaleGoal(spec.initialOrder.anchorGoal) } : {}),
      },
      anchor: scale(spec.position, S),
      heading: normalize(v3(spec.heading.x, 0, spec.heading.z)),
      decisionTimer: 0,
      arrived: true,
      startPoints: 0,
      commsCooldown: 0,
      coordinationPenalty: 0,
      approachBearing: normalize(v3(spec.heading.x, 0, spec.heading.z)),
      headingLocked: false,
      static: spec.static ?? false,
      doctrineFacing: doctrineFacingFor(spec.faction, spec.initialOrder?.formation ?? spec.formation),
      decisionSlowTimer: 0,
    };
    this.fleets.set(spec.id, fleet);
    const created: ShipState[] = [];
    for (const group of spec.ships) {
      for (let i = 0; i < group.count; i++) {
        const ship = this.createShip(group.classId, spec, group.names?.[i], undefined, 1, group.names);
        created.push(ship);
      }
    }
    fleet.startPoints = created.reduce((a, s) => a + s.pointValue, 0);
    // A fleet made only of fixed platforms is static whatever the spec says: it never moves and rejects move orders.
    if (spec.static === undefined && created.length > 0 && created.every((s) => s.role === 'fixed_platform')) fleet.static = true;
    // Battlegroup slots (brief §22): seeded from the battle seed and each ship id, the frontage bounded by the range.
    this.applyLayout(fleet, created);
    // Converging arcs: a fleet that deploys with the enemy in view starts at its approach progress; else far out.
    // (Computed directly: the per-tick side cache must not be filled before this fleet's hulls exist.)
    const enemy = centroid(this.ships.filter((o) => o.alive && !o.escaped && o.side !== spec.side && o.role !== 'fighter' && !this.isPending(o) && !silentHull(o)));
    fleetMotion(fleet).approach = enemy ? approachProgress(Math.hypot(enemy.x - fleet.anchor.x, enemy.z - fleet.anchor.z), fleetEngagementRange(created)) : 1;
    for (const s of created) {
      const world = this.stationWorld(fleet, s);
      s.pos = world;
      s.prevPos = clone(world);
      s.heading = clone(fleet.heading);
      s.prevHeading = clone(fleet.heading);
      if (arrival) {
        const prof = { ...arrivalProfileFor(s.role), ...(arrival.run ?? {}) };
        const appearAt = this.time + this.rng.next() * Math.max(0, arrival.stagger);
        const from = v3(world.x - fleet.heading.x * prof.runKm, world.y, world.z - fleet.heading.z * prof.runKm);
        s.arrival = { appearAt, settleAt: appearAt + Math.max(SIM_DT, prof.duration), from, to: clone(world) };
        s.pos = clone(from);
        s.prevPos = clone(from);
        for (const w of s.weapons) w.arrivalHold = true;
        this.arrivals++;
      }
      this.ships.push(s);
      this.shipById.set(s.id, s);
      this.emit({
        t: this.time,
        type: 'ship_deployed',
        shipId: s.id,
        classId: s.classId,
        faction: s.faction,
        side: s.side,
        name: s.name,
      });
    }
    if (this.time > 0) this.emit({ t: this.time, type: 'reinforcement_arrival', fleetId: spec.id, side: spec.side });
    if (arrival && created.length > 0) fleet.arrived = false;
    else if (this.time > 0) this.emit({ t: this.time, type: 'fleet_arrived', fleetId: spec.id });
    return fleet;
  }

  /**
   * The arrival bookkeeping of one step: every arriving hull's run-in follows its slot (both ends shift with the
   * formation, so it settles at zero speed relative to the slot), the `ship_arrival_flash` at `appearAt`.
   */
  private updateArrivals(): void {
    for (const s of this.ships) {
      const a = s.arrival;
      if (!a || !s.alive) continue;
      const fleet = this.fleets.get(s.fleetId);
      if (fleet) {
        const to = this.stationWorld(fleet, s);
        a.from = v3(a.from.x + to.x - a.to.x, a.from.y + to.y - a.to.y, a.from.z + to.z - a.to.z);
        a.to = to;
      }
      if (this.time >= a.appearAt - 1e-9 && !this.flashed.has(a)) {
        this.flashed.add(a);
        s.pos = clone(a.from);
        s.prevPos = clone(a.from);
        if (fleet) {
          s.heading = clone(fleet.heading);
          s.prevHeading = clone(fleet.heading);
        }
        this.emit({ t: this.time, type: 'ship_arrival_flash', shipId: s.id, pos: clone(a.from), heading: clone(s.heading), lengthKm: s.lengthKm });
      }
    }
  }

  /** A hull leaves its arrival state (settled, or destroyed on the way in); the fleet reports `fleet_arrived` once all are in. */
  private endArrival(s: ShipState): void {
    if (!s.arrival) return;
    s.arrival = undefined;
    for (const w of s.weapons) w.arrivalHold = undefined;
    this.arrivals = Math.max(0, this.arrivals - 1);
    const fleet = this.fleets.get(s.fleetId);
    if (fleet && !fleet.arrived && !this.ships.some((o) => o.fleetId === s.fleetId && o.alive && o.arrival !== undefined)) {
      fleet.arrived = true;
      this.emit({ t: this.time, type: 'fleet_arrived', fleetId: fleet.spec.id });
    }
  }

  /** A hull's station on the anchor (its slot, with the approach spread on its group's reference): deployment and arrivals. */
  private stationWorld(fleet: FleetState, ship: ShipState): Vec3 {
    const slot = spreadSlot(ship, fleetMotion(fleet).approach);
    const h = fleet.heading;
    const rx = h.z;
    const rz = -h.x;
    return v3(fleet.anchor.x + rx * slot.x + h.x * slot.z, fleet.anchor.y + slot.y, fleet.anchor.z + rz * slot.x + h.z * slot.z);
  }

  /** Lay a fleet's hulls out as battlegroups (formations.ts): slots, group leaders and references, station yaw. */
  private applyLayout(fleet: FleetState, ships: ShipState[]): FormationLayout {
    const layout = layoutFormation(
      ships.map((s) => ({ id: s.id, role: s.role, lengthKm: s.lengthKm })),
      fleet.orders.formation,
      { seed: this.config.seed, range: fleetEngagementRange(ships) },
    );
    for (const s of ships) {
      s.slot = layout.slots.get(s.id) ?? s.slot ?? v3();
      s.groupLeaderId = layout.leaders.get(s.id);
      s.groupSlot = layout.groupSlots.get(s.id);
      s.stationYaw = layout.yaw.get(s.id);
    }
    return layout;
  }

  private rulesFor(spec: FleetSpec): RuleSet {
    if (!spec.techOverride) return this.rules;
    let r = this.fleetRules.get(spec.id);
    if (!r) {
      r = cloneRules(this.rules);
      r.factionOverrides[spec.faction] = { ...(r.factionOverrides[spec.faction] ?? {}), ...spec.techOverride };
      this.fleetRules.set(spec.id, r);
    }
    return r;
  }

  /**
   * Builds a hull. `name` is its preferred name (a scenario's canonical list entry or a scripted name) and `list` its
   * class's canonical list: the battle's name registry (brief §12) honours the preferred name when it is free, else
   * continues down the list and then the class's naming convention, so every organic hull is named and no name repeats
   * in a battle; unnamed Reapers get tracking designations (RC-07, RD-23). Small craft keep their squadron labels.
   */
  private createShip(classId: string, spec: FleetSpec, name?: string, carrierId?: string, craft = 1, list?: readonly string[]): ShipState {
    const cls = getShipClass(classId);
    const rules = this.rulesFor(spec);
    const stats = applyRulesToShip(cls, rules);
    const n = (this.shipCounter.get(classId) ?? 0) + 1;
    this.shipCounter.set(classId, n);
    const id = `${spec.id}-${classId}-${n}`;
    const weapons: WeaponState[] = [];
    let wi = 0;
    cls.hardpoints.forEach((hp, hpIndex) => {
      const base = getWeapon(hp.weaponId);
      // Hardpoints gated on a special-technology flag (nova_legacy) are fitted only when the flag is true.
      if (base.requiresSpecial && rules.special[base.requiresSpecial] !== true) return;
      const nominal = applyRulesToWeapon(base, cls.faction, cls, rules, WEAPONS);
      const def: EffectiveWeapon = { ...nominal, range: nominal.range * S, projectileSpeed: nominal.projectileSpeed * S };
      for (let m = 0; m < hp.count; m++) {
        weapons.push({
          index: wi++,
          hardpointIndex: hpIndex,
          mount: m,
          def,
          // Stagger initial cooldowns so batteries do not fire in lockstep.
          cooldown: def.cooldown * this.rng.next() * 0.6,
          offset: v3(hp.offset[0] / 1000, hp.offset[1] / 1000, hp.offset[2] / 1000),
          facing: (hp.facing * Math.PI) / 180,
          beamRemaining: 0,
          beamHit: false,
          ammo: def.magazine,
          burstLeft: def.burst?.shots,
          burstRecover: 0,
          // The Titan gun's separate HADES magazine (counts down only when a HADES round leaves the gun).
          ...(def.hadesRound && def.specialAmmo !== undefined ? { specialAmmo: def.specialAmmo } : {}),
          // A heavy Thanix channel keeps its own heat pool.
          ...(def.perMountHeat ? { heat: 0 } : {}),
        });
      }
    });
    const lengthKm = cls.lengthM.value / 1000;
    // A flight is one squadron object named for its craft ("Trident flight 07"; AP §21.3); every hull gets a vessel
    // name or a Reaper tracking designation from the battle's registry (brief §12).
    const shipName =
      cls.role === 'fighter' || craft > 1
        ? (name ?? `${cls.shortName ?? cls.name}${craft > 1 ? ' flight' : ''} ${String(n).padStart(2, '0')}`)
        : this.names.next(cls, name, list);
    const ship: ShipState = {
      id,
      name: shipName,
      classId,
      faction: cls.faction,
      role: cls.role,
      side: spec.side,
      fleetId: spec.id,
      pos: v3(),
      prevPos: v3(),
      vel: v3(),
      heading: v3(0, 0, 1),
      prevHeading: v3(0, 0, 1),
      lengthKm,
      radiusKm: Math.max(0.02, lengthKm * 0.5),
      signature: cls.signature,
      hull: stats.hull,
      maxHull: stats.hull,
      armour: stats.armour,
      maxArmour: stats.armour,
      barriers: stats.barriers,
      maxBarriers: stats.barriers,
      barrierRegen: stats.barrierRegen,
      maxSpeed: stats.maxSpeed * S,
      acceleration: stats.acceleration * S,
      turnRate: (stats.turnRate * Math.PI) / 180,
      sensorRange: stats.sensorRange * S,
      ecm: stats.ecm,
      crewQuality: stats.crewQuality,
      heat: 0,
      heatCapacity: stats.heatCapacity,
      overheated: false,
      weapons,
      subsystems: { engines: 1, weapons: 1, sensors: 1 },
      alive: true,
      slot: v3(),
      withdrawing: false,
      escaped: false,
      lastHitAt: -100,
      aiTimer: this.rng.next() * 1.5,
      stats: { damageDealt: 0, damageTaken: 0, shotsFired: 0, hits: 0, kills: 0, recentDamage: 0 },
      pointValue: cls.pointValue,
      carrierId,
      flagship: cls.flagship === true || NAMED_FLAGSHIPS.includes(shipName),
      rogue: spec.rogue ?? false,
      solutions: [],
      regenSuppressedUntil: 0,
      recentHitTimes: [],
      flagshipEvents: { destroyed: false, missionKill: false },
      barrierRegenUnderFire: stats.barrierRegenUnderFire,
      barrierLoadThreshold: stats.barrierLoadThreshold,
    };
    if (cls.stealth) {
      // Stealth hulls start silent (brief §15.2); every other hull leaves the field undefined.
      ship.stealth = {
        state: 'silent',
        sinkHeat: 0,
        revealedUntil: 0,
        ventingUntil: 0,
        capacity: cls.stealth.capacity.value,
        ventTime: cls.stealth.ventTime.value,
        detectRange: cls.stealth.detectRange.value * S,
        revealOnFire: cls.stealth.revealOnFire.value,
      };
    }
    if (cls.fighterComplement) {
      ship.hangar = { classId: cls.fighterComplement.classId, remaining: cls.fighterComplement.count, launchTimer: 2 };
    }
    formFlight(ship, craft);
    return ship;
  }

  // -------------------------------------------------------------- AiContext

  /**
   * Per-tick caches of the side lists, the rogue hulls, the fleet members, the carriers' craft and the
   * point-weighted combatant centroids. Everything is rebuilt lazily on first use in a tick, in ship-index
   * order, so every consumer sees the same deterministic candidate order as a scan of `ships`.
   */
  private sideCache: {
    tick: number;
    A: ShipState[];
    B: ShipState[];
    rogueA: ShipState[];
    rogueB: ShipState[];
    combatantsA: ShipState[];
    combatantsB: ShipState[];
    centroidA?: Vec3 | null;
    centroidB?: Vec3 | null;
    members: Map<string, ShipState[]>;
    craft: Map<string, ShipState[]>;
    enemiesRogue: Map<string, ShipState[]>;
  } = { tick: -1, A: [], B: [], rogueA: [], rogueB: [], combatantsA: [], combatantsB: [], members: new Map(), craft: new Map(), enemiesRogue: new Map() };

  private refreshSideCache(): void {
    if (this.sideCache.tick === this.tick) return;
    const A: ShipState[] = [];
    const B: ShipState[] = [];
    const rogueA: ShipState[] = [];
    const rogueB: ShipState[] = [];
    const combatantsA: ShipState[] = [];
    const combatantsB: ShipState[] = [];
    const members = new Map<string, ShipState[]>();
    const craft = new Map<string, ShipState[]>();
    const arriving = this.arrivals > 0;
    for (const s of this.ships) {
      if (!s.alive || s.escaped) continue;
      // A hull waiting for its arrival flash is not in the battle yet: no AI sees it, nothing targets it.
      if (arriving && this.isPending(s)) continue;
      const a = s.side === 'A';
      (a ? A : B).push(s);
      if (s.rogue) (a ? rogueA : rogueB).push(s);
      // A silent stealth hull is invisible to the enemy's fleet-level picture (focus targets, centroids, threats).
      if (s.role !== 'fighter' && !silentHull(s)) (a ? combatantsA : combatantsB).push(s);
      let m = members.get(s.fleetId);
      if (!m) members.set(s.fleetId, (m = []));
      m.push(s);
      if (s.carrierId) {
        let c = craft.get(s.carrierId);
        if (!c) craft.set(s.carrierId, (c = []));
        c.push(s);
      }
    }
    this.sideCache = { tick: this.tick, A, B, rogueA, rogueB, combatantsA, combatantsB, members, craft, enemiesRogue: new Map() };
  }

  /** Living, present ships on the opposing side (plain two-sided bookkeeping; cached per tick). */
  enemiesOf(side: Side): ShipState[] {
    this.refreshSideCache();
    return side === 'A' ? this.sideCache.B : this.sideCache.A;
  }
  alliesOf(side: Side): ShipState[] {
    this.refreshSideCache();
    return side === 'A' ? this.sideCache.A : this.sideCache.B;
  }
  /**
   * The per-ship targeting set (AP §4.1): the other side plus every rogue hull; a rogue ship sees everyone but its
   * own rogue group (two hulls are enemies when they are on different sides or exactly one of them is rogue — the
   * `gridFilterPasses` rule). Identical to `enemiesOf(ship.side)` while no rogue hull is deployed.
   */
  enemiesOfShip(ship: ShipState): ShipState[] {
    this.refreshSideCache();
    const c = this.sideCache;
    if (ship.rogue) {
      const key = `rogue:${ship.side}`;
      let list = c.enemiesRogue.get(key);
      if (!list) {
        list = [];
        for (const s of this.ships) if (s.alive && !s.escaped && !this.isPending(s) && (s.side !== ship.side || !s.rogue)) list.push(s);
        c.enemiesRogue.set(key, list);
      }
      return list;
    }
    const ownRogues = ship.side === 'A' ? c.rogueA : c.rogueB;
    if (ownRogues.length === 0) return ship.side === 'A' ? c.B : c.A;
    let list = c.enemiesRogue.get(ship.side);
    if (!list) {
      list = [];
      for (const s of this.ships) if (s.alive && !s.escaped && !this.isPending(s) && (s.side !== ship.side || s.rogue)) list.push(s);
      c.enemiesRogue.set(ship.side, list);
    }
    return list;
  }
  /** Living, present, non-fighter enemies of a side (cached per tick). */
  enemyCombatants(side: Side): ShipState[] {
    this.refreshSideCache();
    return side === 'A' ? this.sideCache.combatantsB : this.sideCache.combatantsA;
  }
  /** Point-weighted centroid of the enemy combatants, or undefined when none is present (cached per tick). */
  enemyCentroid(side: Side): Vec3 | undefined {
    this.refreshSideCache();
    const c = this.sideCache;
    if (side === 'A') {
      if (c.centroidB === undefined) c.centroidB = centroid(c.combatantsB) ?? null;
      return c.centroidB ?? undefined;
    }
    if (c.centroidA === undefined) c.centroidA = centroid(c.combatantsA) ?? null;
    return c.centroidA ?? undefined;
  }
  /**
   * The Reapers' "active gun platform" among a side's enemies (AP §10): the visible combatant with the most recent
   * damage — the other side's combatants plus the rogue hulls of the own side (they are enemies too, AP §4.1). A
   * silent stealth hull is never a candidate (brief §15.2). Cached per tick.
   */
  private gunPlatformCache = { tick: -1, A: undefined as ShipState | undefined, B: undefined as ShipState | undefined };
  activeGunPlatform(side: Side): ShipState | undefined {
    const c = this.gunPlatformCache;
    if (c.tick !== this.tick) {
      c.tick = this.tick;
      this.refreshSideCache();
      c.A = topGunPlatform(this.enemyCombatants('A'), this.sideCache.rogueA);
      c.B = topGunPlatform(this.enemyCombatants('B'), this.sideCache.rogueB);
    }
    return side === 'A' ? c.A : c.B;
  }

  /** Every live hull of either side within `radius` of `p` (the spatial grid, start-of-tick positions; brief §22). */
  hullsNear(p: Vec3, radius: number): ShipState[] {
    return this.grid.queryRadius(p, radius);
  }
  private largestCache = { tick: -1, km: 0 };
  /** Length of the largest live non-craft hull in the battle (km; cached per tick). */
  largestHullKm(): number {
    const c = this.largestCache;
    if (c.tick !== this.tick) {
      c.tick = this.tick;
      c.km = 0;
      for (const s of this.ships) if (s.alive && !s.escaped && s.role !== 'fighter' && s.lengthKm > c.km) c.km = s.lengthKm;
    }
    return c.km;
  }

  /** Living, present members of a fleet in ship-index order (cached per tick). */
  membersOf(fleetId: string): ShipState[] {
    this.refreshSideCache();
    return this.sideCache.members.get(fleetId) ?? EMPTY_SHIPS;
  }
  /** Living, present craft launched by a carrier (cached per tick). */
  private craftOf(carrierId: string): ShipState[] {
    this.refreshSideCache();
    return this.sideCache.craft.get(carrierId) ?? EMPTY_SHIPS;
  }
  getShip(id: string): ShipState | undefined {
    return this.shipById.get(id);
  }

  /**
   * Target candidates for a ship's acquisition (AP §21.5): the live hulls of its targeting set within `radius`
   * through the grid, capped at the `TARGET_CANDIDATE_CAP` nearest. Every capital hull in range and the ship's
   * current, forced and fleet focus targets are kept beyond the cap, so a line of frigates ahead of a dreadnought
   * never hides the dreadnought (a strict nearest-only cap turned the Reapers onto the screen in the reference
   * engagement). The result is in ship-index order, the order a brute-force scan yields.
   */
  candidates(ship: ShipState, radius: number): ShipState[] {
    const found = this.grid.queryRadius(ship.pos, radius, ship);
    if (found.length <= TARGET_CANDIDATE_CAP) return found;
    const fleet = this.fleets.get(ship.fleetId);
    const keep = new Set<string>();
    if (ship.targetId) keep.add(ship.targetId);
    if (ship.forcedTargetId) keep.add(ship.forcedTargetId);
    if (fleet?.focusTargetId) keep.add(fleet.focusTargetId);
    const px = ship.pos.x;
    const py = ship.pos.y;
    const pz = ship.pos.z;
    const scored = found.map((s, i) => {
      const dx = s.pos.x - px;
      const dy = s.pos.y - py;
      const dz = s.pos.z - pz;
      return { i, d2: dx * dx + dy * dy + dz * dz };
    });
    scored.sort((a, b) => a.d2 - b.d2 || a.i - b.i);
    const chosen = new Set<number>();
    for (let k = 0; k < TARGET_CANDIDATE_CAP; k++) chosen.add(scored[k].i);
    found.forEach((s, i) => {
      if (isCapitalRole(s.role) || keep.has(s.id)) chosen.add(i);
    });
    const out: ShipState[] = [];
    found.forEach((s, i) => {
      if (chosen.has(i)) out.push(s);
    });
    return out;
  }

  // ----------------------------------------------------------------- orders

  /**
   * Issue orders to a fleet (player command). A static fleet (fixed platforms) rejects every order that would move
   * it — the move-type orders, a formation change, a position or an anchor goal — with `order_rejected`; an
   * `attack_target` is accepted because it only sets the focus the platforms slew to (CINEMATIC_DESIGN.md §7.10).
   */
  issueOrders(fleetId: string, patch: Partial<FleetOrders>): 'issued' | 'rejected' {
    // The cinematic opening's player lock (AP §4.3): the HUD toasts, the simulation refuses and logs it.
    if (this.playerLocked && this.fleets.has(fleetId)) {
      this.emit({ t: this.time, type: 'order_rejected', fleetId, order: orderLabel(patch), reason: 'player_locked' });
      return 'rejected';
    }
    return this.applyOrders(fleetId, patch, 'player');
  }

  /**
   * Applies an order patch to a fleet. `'player'` (through `issueOrders`): a static fleet refuses the whole patch when
   * it would move; a new order clears every forced target of the fleet. `'beat'` (scripted, passes the player lock): a
   * static fleet keeps the parts it can follow (a hold, a priority, a target) and refuses only the movement; a new
   * order spares the scripted forced targets (`forcedTargetUntil` set), which lapse on their own.
   */
  private applyOrders(fleetId: string, input: Partial<FleetOrders>, source: 'beat' | 'player'): 'issued' | 'rejected' {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return 'rejected';
    let patch: Partial<FleetOrders> = { ...input };
    // A target reference is resolved at issue time, from the fleet's largest hull (FleetOrders.targetRef).
    if (patch.targetRef) {
      const from = this.membersOf(fleetId).reduce<ShipState | undefined>((a, b) => (b.role === 'fighter' ? a : !a || b.lengthKm > a.lengthKm ? b : a), undefined);
      const t = this.resolveShipRef(patch.targetRef, from);
      delete patch.targetRef;
      if (t) patch.targetId = t.id;
      else if (patch.order === 'attack_target') delete patch.order;
    }
    const label = orderLabel(patch);
    if (fleet.static && movesFleet(patch, fleet.orders)) {
      this.emit({ t: this.time, type: 'order_rejected', fleetId, order: label, reason: 'static_fleet' });
      if (source === 'player') return 'rejected';
      const kept: Partial<FleetOrders> = { ...patch };
      if (kept.order !== undefined && MOVE_ORDERS.has(kept.order)) delete kept.order;
      delete kept.formation;
      delete kept.position;
      delete kept.anchorGoal;
      if (Object.keys(kept).length === 0) return 'rejected';
      patch = kept;
    }
    const prevFormation = fleet.orders.formation;
    fleet.orders = {
      ...fleet.orders,
      ...patch,
      ...(patch.position ? { position: scale(patch.position, S) } : {}),
      ...(patch.anchorGoal ? { anchorGoal: scaleGoal(patch.anchorGoal) } : {}),
    };
    if (patch.formation && patch.formation !== prevFormation) {
      this.reassignSlots(fleet);
      fleet.doctrineFacing = doctrineFacingFor(fleet.spec.faction, patch.formation);
    }
    if (patch.order === 'attack_target' && patch.targetId) {
      fleet.focusTargetId = patch.targetId;
      for (const s of this.ships) {
        if (s.fleetId !== fleetId || !s.alive || s.role === 'fighter') continue;
        s.forcedTargetId = patch.targetId;
        s.forcedTargetUntil = undefined;
      }
    } else if (patch.order && patch.order !== 'attack_target') {
      for (const s of this.ships) {
        if (s.fleetId !== fleetId) continue;
        if (source === 'beat' && s.forcedTargetUntil !== undefined) continue;
        s.forcedTargetId = undefined;
        s.forcedTargetUntil = undefined;
      }
    }
    if (patch.order === 'escort' && patch.targetId) {
      for (const s of this.ships) if (s.fleetId === fleetId && (s.role === 'frigate' || s.role === 'cruiser')) s.escortId = patch.targetId;
    } else if (patch.order && patch.order !== 'escort') {
      for (const s of this.ships) if (s.fleetId === fleetId) s.escortId = undefined;
    }
    if (patch.order) fleetMotion(fleet).explicitAttack = patch.order === 'attack' || patch.order === 'attack_target';
    // Withdraw: the fleet-wide tactical withdrawal — every hull falls back to its recovery station behind the line,
    // regenerates and returns (brief §8.6). Disengage (`retreat`) pulls the whole line back and holds it there.
    if (patch.order === 'withdraw') {
      for (const s of this.membersOf(fleetId)) {
        if (s.role === 'fighter' || s.withdrawing) continue;
        beginWithdrawal(this, s, fleet);
        this.emit({ t: this.time, type: 'ship_withdrawing', shipId: s.id });
      }
    }
    if (patch.order === 'withdraw' || patch.order === 'retreat') {
      this.comms(fleet.spec.side, 'withdraw', undefined, fleet);
    }
    if (patch.focusFire === true || patch.order === 'attack_target') this.comms(fleet.spec.side, 'focus_fire', undefined, fleet);
    if (patch.fightersDeployed === true) this.comms(fleet.spec.side, 'fighters_launch', undefined, fleet);
    this.emit({ t: this.time, type: 'order_issued', fleetId, order: label });
    return 'issued';
  }

  /** Order a single ship (or selection) to attack a target (refused during the opening's player lock). */
  orderShipsAttack(shipIds: string[], targetId: string): void {
    if (this.playerLocked) {
      const first = this.shipById.get(shipIds[0]);
      if (first) this.emit({ t: this.time, type: 'order_rejected', fleetId: first.fleetId, order: `ships ${shipIds.length} attack ${targetId}`, reason: 'player_locked' });
      return;
    }
    for (const id of shipIds) {
      const s = this.shipById.get(id);
      if (s && s.alive) {
        s.forcedTargetId = targetId;
        s.forcedTargetUntil = undefined;
        s.targetId = targetId;
      }
    }
    const first = this.shipById.get(shipIds[0]);
    if (first) this.emit({ t: this.time, type: 'order_issued', fleetId: first.fleetId, order: `ships ${shipIds.length} attack ${targetId}` });
  }

  /**
   * Resolves a ship reference (beats, scenes, HUD; deterministic, ties by id). `nth` counts deployment order including
   * dead hulls; `from` is the ship a relative query (`nearest` without `to`) is resolved for.
   */
  resolveShipRef(ref: ShipRef, from?: ShipState): ShipState | undefined {
    return resolveShipRefIn(this.refHost, ref, from);
  }
  /** Resolves a fleet selector to deployed fleets (`{ side, wave }`: the n-th beat-arriving fleet of the side by faction order). */
  resolveFleetSel(sel: FleetSel): FleetState[] {
    return resolveFleetSelIn(this.refHost, sel);
  }
  private readonly refHost = {
    sim: this as BattleSimulation,
    get ships(): readonly ShipState[] {
      return this.sim.ships;
    },
    get fleets(): Map<string, FleetState> {
      return this.sim.fleets;
    },
    get config(): BattleConfig {
      return this.sim.config;
    },
    getShip: (id: string): ShipState | undefined => this.shipById.get(id),
    pending: (s: ShipState): boolean => this.isPending(s),
  };

  /**
   * Orders a volley for each fleet (the one entry point for the HUD, the beats and the scenes; never refused by the
   * player lock — the controller gates the HUD button): hold until `time + lead`, release inside the window, every
   * mount that can bear firing on the beat (`volley.ts`).
   */
  orderVolley(fleetIds: string[], opts: VolleyOptions = {}): void {
    orderVolleyIn(this.volleyHost, fleetIds, opts);
  }
  private readonly volleyHost: VolleyHost = {
    sim: this as BattleSimulation,
    get time(): number {
      return this.sim.time;
    },
    get rng(): Rng {
      return this.sim.rng;
    },
    get ships(): readonly ShipState[] {
      return this.sim.ships;
    },
    get fleets(): Map<string, FleetState> {
      return this.sim.fleets;
    },
    getShip: (id: string): ShipState | undefined => this.shipById.get(id),
    emit: (e: BattleEvent): void => this.emit(e),
    pending: (s: ShipState): boolean => this.isPending(s),
    resolveShipRef: (ref: ShipRef, from?: ShipState): ShipState | undefined => this.resolveShipRef(ref, from),
  } as VolleyHost & { sim: BattleSimulation };

  /** What the Black Fleet drive attack needs (`driveAttack.ts`); `attempts` is the battle's run budget (AP §9). */
  private readonly driveHost: DriveHost = {
    sim: this as BattleSimulation,
    attempts: 0,
    get time(): number {
      return this.sim.time;
    },
    get rng(): Rng {
      return this.sim.rng;
    },
    get rules(): RuleSet {
      return this.sim.rules;
    },
    get environment() {
      return this.sim.config.environment;
    },
    get ships(): readonly ShipState[] {
      return this.sim.ships;
    },
    getShip: (id: string): ShipState | undefined => this.shipById.get(id),
    pending: (s: ShipState): boolean => this.isPending(s),
    emit: (e: BattleEvent): void => this.emit(e),
    destroyShip: (ship: ShipState, killer?: ShipState, cause?: DestructionCause): void => this.destroyShip(ship, killer, cause),
  } as DriveHost & { sim: BattleSimulation };

  /** What the distant layer reads (`distant.ts`): time, hulls, the event log; it writes only `distant_*` events. */
  private readonly distantHost: DistantHost = {
    sim: this as BattleSimulation,
    get time(): number {
      return this.sim.time;
    },
    get ships(): readonly ShipState[] {
      return this.sim.ships;
    },
    get events(): readonly BattleEvent[] {
      return this.sim.events;
    },
    pending: (s: ShipState): boolean => this.isPending(s),
    emit: (e: BattleEvent): void => this.emit(e),
  } as DistantHost & { sim: BattleSimulation };

  /** Steps synchronously until `time` (or the end of the battle): the tests' and the e2e helper's fast-forward. */
  skipTo(time: number): void {
    while (!this.finished && this.time < time - 1e-9) this.step();
  }

  /** Live non-fighter hulls in the battle (for the captions and the HUD budget line); a hull still waiting to arrive does not count. */
  simulatedHullCount(side?: Side): number {
    let n = 0;
    for (const s of this.ships) if (s.alive && !s.escaped && s.role !== 'fighter' && (side === undefined || s.side === side) && !this.isPending(s)) n++;
    return n;
  }

  private reassignSlots(fleet: FleetState): void {
    this.applyLayout(fleet, this.ships.filter((s) => s.fleetId === fleet.spec.id && s.alive && !s.escaped));
  }

  // ------------------------------------------------------------------- loop

  /** Advance the simulation by one fixed step. */
  step(): void {
    if (this.finished) return;
    const dt = SIM_DT;
    this.time += dt;
    this.tick++;
    // Per-phase profiling: `mark`/`lap` read no clock and cost a predicate while the profiler is disabled (the default).
    const prof = this.profile;
    const profiling = prof.enabled;
    const t0 = prof.mark();
    let tp = t0;

    // The opening's player lock lifts at `playerLockUntil` (a `player_control` beat may lift or impose it as well).
    if (this.playerLocked && this.lockUntil > 0 && !this.lockReleased && this.time >= this.lockUntil - 1e-9) {
      this.playerLocked = false;
      this.lockReleased = true;
    }
    // Reinforcements (an `arrivalFlash` fleet drops in through the arrival kinematics).
    while (this.pendingFleets.length > 0 && (this.pendingFleets[0].arrivalTime ?? 0) <= this.time) {
      const f = this.pendingFleets.shift()!;
      this.deployFleet(f, f.arrivalFlash ? { stagger: DEFAULT_ARRIVAL_STAGGER } : undefined);
      this.comms(f.side, 'battle_start', undefined, this.fleets.get(f.id));
    }
    // Beats: after the reinforcements and before the fleet decisions, so a wave spawned and an order given at the same
    // beat act in the same tick (CINEMATIC_DESIGN.md §1.2).
    while (this.beatList.length > 0 && this.beatList[0].t <= this.time + 1e-9 && !this.finished) applyBeat(this, this.beatList.shift()!.beat);
    if (this.arrivals > 0) this.updateArrivals();
    // The spatial hash indexes the hulls at their start-of-tick positions; craft launched later in the tick join it next
    // tick; a hull still waiting for its arrival flash is not in it (nothing can hit it).
    this.grid.rebuild(this.arrivals > 0 ? this.ships.filter((sh) => !this.isPending(sh)) : this.ships);
    if (profiling) tp = prof.lap('reinforcements', tp);

    for (const fleet of this.fleets.values()) {
      // A volley's window has closed: `fleet_volley_fired`, the standing hold back to 'none'.
      if (fleet.volley && this.time >= volleyEnd(fleet.volley, dt) - 1e-9) finishVolley(this.volleyHost, fleet);
      fleet.commsCooldown = Math.max(0, fleet.commsCooldown - dt);
      fleet.coordinationPenalty = Math.max(0, fleet.coordinationPenalty - dt / 30);
      fleetDecision(this, fleet, dt);
      // Apex doctrine: a threatened Reaper group falls back to its recovery stations and returns (AP §10; never an exit).
      for (const s of threatenedGroup(this, fleet, FACTIONS[fleet.spec.faction].doctrine.decisionInterval)) {
        beginWithdrawal(this, s, fleet);
        this.emit({ t: this.time, type: 'ship_withdrawing', shipId: s.id });
      }
    }
    if (profiling) tp = prof.lap('fleets', tp);

    for (const ship of this.ships) {
      if (!ship.alive || ship.escaped) continue;
      // A hull waiting for its arrival flash is inert.
      if (ship.arrival && this.isPending(ship)) continue;
      // Interpolation snapshots, copied in place (the renderer reads distinct prev/current objects).
      ship.prevPos.x = ship.pos.x;
      ship.prevPos.y = ship.pos.y;
      ship.prevPos.z = ship.pos.z;
      ship.prevHeading.x = ship.heading.x;
      ship.prevHeading.y = ship.heading.y;
      ship.prevHeading.z = ship.heading.z;
      const fleet = this.fleets.get(ship.fleetId)!;
      // A scripted forced target (a mark, a volley target, a scripted strike) lapses at its time.
      if (ship.forcedTargetUntil !== undefined && this.time > ship.forcedTargetUntil + 1e-9) {
        ship.forcedTargetId = undefined;
        ship.forcedTargetUntil = undefined;
      }
      // Locks on a hull that went silent beyond its detection range drop at once (brief §15.2: within 2 s).
      if (ship.targetId) {
        const t = this.shipById.get(ship.targetId);
        if (t && t.stealth && !detectable(ship, t)) {
          if (ship.forcedTargetId === ship.targetId) ship.forcedTargetId = undefined;
          ship.targetId = undefined;
        }
      }
      ship.aiTimer -= dt;
      if (ship.aiTimer <= 0) {
        ship.aiTimer = FACTIONS[ship.faction].doctrine.decisionInterval * (0.7 + 0.6 * this.rng.next());
        // A crippled Cerberus hull may commit to a Black Fleet drive run (AP §9; nothing is drawn unless it is
        // eligible); a committed run is terminal, so the hull takes no other decision until it ends.
        if (!ship.driveRun) considerDriveRun(this.driveHost, ship);
        if (!ship.driveRun) {
          const wasWithdrawing = ship.withdrawing;
          shipDecision(this, ship, fleet);
          if (ship.withdrawing && !wasWithdrawing) this.emit({ t: this.time, type: 'ship_withdrawing', shipId: ship.id });
        }
      }
      if (profiling) tp = prof.lap('ai', tp);
      // An arriving hull follows its scripted run-in into the slot; everything else steers.
      if (ship.arrival) this.runIn(ship, fleet, dt);
      else this.updateMovement(ship, fleet, dt);
      // A drive run ends at its time — the impact, and the runner is gone — or when its target is lost (aborted).
      if (ship.driveRun && tickDriveRun(this.driveHost, ship)) {
        if (profiling) tp = prof.lap('movement', tp);
        continue;
      }
      // A scripted move (`approach`, `strafeThrough`) reports once it is over.
      const moved = tickScriptedMove(this.time, ship, (id) => this.shipById.get(id));
      if (moved) this.emit({ t: this.time, type: 'scripted_event', ...(moved.beatId ? { beatId: moved.beatId } : {}), special: moved.special, shipIds: [ship.id, moved.targetId], forced: false, detail: moved.detail });
      if (profiling) tp = prof.lap('movement', tp);
      this.updateHousekeeping(ship, dt);
      // Firing solutions govern the anti-ship guns and beams of hulls only (solutions.ts `usesSolution`): small craft keep none.
      if (ship.role !== 'fighter') updateSolutions(this.solutionCtx, ship, fleet.focusTargetId, dt);
      if (profiling) tp = prof.lap('housekeeping', tp);
      this.updateCarrier(ship, fleet, dt);
      if (profiling) tp = prof.lap('carriers', tp);
      this.updateWeapons(ship, fleet, dt);
      if (profiling) tp = prof.lap('weapons', tp);
    }

    // No two hulls ever clip (brief §22): the clearance backstop after every hull has moved.
    enforceClearance(this, this.ships, (sh) => sh.driveRun !== undefined || sh.arrival !== undefined || inScriptedMove(sh));
    this.updateProjectiles(dt);
    if (profiling) tp = prof.lap('projectiles', tp);
    this.updateMissiles(dt);
    if (profiling) tp = prof.lap('missiles', tp);
    for (const f of this.flashes) f.ttl -= dt;
    this.flashes = this.flashes.filter((f) => f.ttl > 0);

    this.checkEnd();
    // The distant layer advances last, after the end check, so nothing it does can influence this tick or the next.
    if (this.distantLayer) this.distantLayer.advance(this.distantHost, dt, this.finished);
    if (profiling) {
      prof.lap('end', tp);
      prof.endStep(t0);
    }
  }

  /** Run to completion (headless). Returns the result. */
  run(maxSteps = 200_000): BattleResult {
    let n = 0;
    while (!this.finished && n++ < maxSteps) this.step();
    if (!this.finished) this.end('draw', 'Simulation step limit reached');
    return this.result!;
  }

  // --------------------------------------------------------------- movement

  /** One step of an arrival run-in: the eased position into the (moving) slot, the fleet's heading; settles at `settleAt`. */
  private runIn(ship: ShipState, fleet: FleetState, dt: number): void {
    const a = ship.arrival!;
    const p = arrivalPos(a, this.time);
    ship.vel = v3((p.x - ship.prevPos.x) / dt, (p.y - ship.prevPos.y) / dt, (p.z - ship.prevPos.z) / dt);
    ship.pos = p;
    ship.heading = clone(fleet.heading);
    if (this.time >= a.settleAt - 1e-9) this.endArrival(ship);
  }

  private updateMovement(ship: ShipState, fleet: FleetState, dt: number): void {
    // A fixed platform never moves: it only slews to bear on its target, bounded by its turn rate (brief §8.10).
    if (ship.maxSpeed <= 0) {
      ship.vel.x = 0;
      ship.vel.y = 0;
      ship.vel.z = 0;
      if (ship.weapons.some((w) => w.charging !== undefined)) return;
      const target = ship.targetId ? this.shipById.get(ship.targetId) : undefined;
      if (target && target.alive) this.turnToward(ship, sub(target.pos, ship.pos), dt);
      return;
    }
    const goal = movementGoal(this, ship, fleet);
    steerShip(ship, goal, dt);
    const speed = Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z);
    const maxSpeed = ship.maxSpeed * (0.25 + 0.75 * ship.subsystems.engines);

    // Heading. A mount in its visible charge (legacy Nova) holds the hull's heading until it fires.
    if (ship.weapons.some((w) => w.charging !== undefined)) return;
    let faceDir: Vec3 | undefined;
    if (goal.face) faceDir = sub(goal.face, ship.pos);
    else if (speed > maxSpeed * 0.15) faceDir = ship.vel;
    else if (ship.role !== 'fighter') faceDir = ship.stationYaw ? rotateY(fleet.heading, ship.stationYaw) : fleet.heading;
    if (faceDir) this.turnToward(ship, faceDir, dt);
  }

  /** Turn the hull toward `faceDir` by at most its (engine-scaled) turn rate this step. */
  private turnToward(ship: ShipState, faceDir: Vec3, dt: number): void {
    if (lengthSq(faceDir) > 1e-8) {
      const target = normalize(faceDir);
      const cur = ship.heading;
      const cosA = Math.max(-1, Math.min(1, dot(cur, target)));
      const angle = Math.acos(cosA);
      const maxTurn = ship.turnRate * (0.3 + 0.7 * ship.subsystems.engines) * dt;
      if (angle <= maxTurn || angle < 1e-4) ship.heading = target;
      else {
        // Rotate cur towards target around their common normal.
        let axis = cross(cur, target);
        if (lengthSq(axis) < 1e-8) axis = v3(0, 1, 0);
        axis = normalize(axis);
        const c = Math.cos(maxTurn);
        const s = Math.sin(maxTurn);
        // Rodrigues rotation.
        const term1 = scale(cur, c);
        const term2 = scale(cross(axis, cur), s);
        const term3 = scale(axis, dot(axis, cur) * (1 - c));
        ship.heading = normalize(add(add(term1, term2), term3));
      }
    }
  }

  private updateHousekeeping(ship: ShipState, dt: number): void {
    // Barrier regeneration: in full after a 3 s pause in incoming fire, and under fire at the hull's
    // recovery-under-fire fraction (M1: Reaper capitals 1, everything else 0); never while HADES-suppressed.
    const quiet = this.time - ship.lastHitAt;
    const regenFrac = quiet > 3 ? 1 : ship.barrierRegenUnderFire;
    if (regenFrac > 0 && ship.barriers < ship.maxBarriers && this.time >= ship.regenSuppressedUntil) {
      // A hull recovering at its station behind the line, out of contact, regenerates ×1.5 (brief §8.6).
      const boost = ship.withdrawing && quiet > WITHDRAWN_QUIET_SECONDS ? WITHDRAWAL.regenBoost : 1;
      ship.barriers = Math.min(ship.maxBarriers, ship.barriers + ship.barrierRegen * regenFrac * boost * dt);
    }
    // A HADES outage restores its drop when its time is up.
    const outage = ship.outageUntil;
    if (outage && this.time >= outage.until) {
      ship.subsystems[outage.subsystem] = Math.min(1, ship.subsystems[outage.subsystem] + outage.amount);
      ship.outageUntil = undefined;
    }
    // Recent damage dealt decays with τ = 10 s.
    ship.stats.recentDamage = ship.stats.recentDamage < 1e-6 ? 0 : ship.stats.recentDamage * RECENT_DAMAGE_DECAY;
    // Heat: a stealth hull radiates nothing while silent or revealed (cooling suspended, the sink fills) and
    // sheds its heat only while venting, which is forced when the sink reaches capacity (brief §15.2).
    const st = ship.stealth;
    if (st && st.state !== 'venting') {
      st.sinkHeat += dt;
      // An enemy hull inside the detection range, or a fighter or Oculus within 1.5 km, reveals the hull (and keeps it revealed).
      if (this.stealthDetected(ship, st.detectRange)) this.revealStealth(ship, 'detected');
      if (st.state === 'revealed' && this.time >= st.revealedUntil) {
        st.state = 'silent';
        this.emit({ t: this.time, type: 'stealth_engaged', shipId: ship.id });
      }
      // Venting is forced at capacity, or chosen once the sink runs high (or the hull is too hot to fire) and nothing
      // is within reach (brief §15.2).
      const chosen =
        st.state === 'silent' &&
        (st.sinkHeat >= STEALTH_VENT_FRACTION * st.capacity || ship.overheated) &&
        ship.manoeuvre?.phase !== 'run' &&
        !this.grid.anyWithin(ship.pos, STEALTH_SAFE_RANGE, ship);
      if (st.sinkHeat >= st.capacity || chosen) {
        st.state = 'venting';
        st.ventingUntil = this.time + st.ventTime;
        this.emit({ t: this.time, type: 'stealth_venting', shipId: ship.id });
        this.emit({ t: this.time, type: 'stealth_revealed', shipId: ship.id, reason: 'venting' });
      }
    } else {
      if (st) {
        st.sinkHeat = Math.max(0, st.sinkHeat - (st.capacity / st.ventTime) * dt);
        if (this.time >= st.ventingUntil) {
          st.sinkHeat = 0;
          st.state = 'silent';
          this.emit({ t: this.time, type: 'stealth_engaged', shipId: ship.id });
        }
      }
      ship.heat = Math.max(0, ship.heat - ship.heatCapacity * 0.08 * dt);
    }
    if (ship.overheated && ship.heat < ship.heatCapacity * 0.55) ship.overheated = false;
    if (!ship.overheated && ship.heat > ship.heatCapacity) ship.overheated = true;
  }

  /**
   * Whether an enemy sees a silent hull at close range (brief §15.2): any enemy hull inside its detection range, or a
   * fighter or Oculus drone within `CRAFT_DETECT_RANGE`. Deterministic (grid order); no allocation beyond the query.
   */
  private stealthDetected(ship: ShipState, detectRange: number): boolean {
    const r = Math.max(detectRange, CRAFT_DETECT_RANGE);
    if (!this.grid.anyWithin(ship.pos, r, ship)) return false;
    for (const e of this.grid.queryRadius(ship.pos, r, ship)) {
      const d2 = (e.pos.x - ship.pos.x) ** 2 + (e.pos.y - ship.pos.y) ** 2 + (e.pos.z - ship.pos.z) ** 2;
      const reach = e.role === 'fighter' ? CRAFT_DETECT_RANGE : detectRange;
      if (d2 <= reach * reach) return true;
    }
    return false;
  }

  /** A stealth hull is revealed by firing, by taking a hit or (T10) by an enemy inside its detection range. */
  private revealStealth(ship: ShipState, reason: 'fired' | 'hit' | 'detected'): void {
    const st = ship.stealth;
    if (!st || st.state === 'venting') return;
    st.revealedUntil = Math.max(st.revealedUntil, this.time + st.revealOnFire);
    if (st.state === 'silent') {
      st.state = 'revealed';
      this.emit({ t: this.time, type: 'stealth_revealed', shipId: ship.id, reason });
    }
  }

  /** A flight sheds one member per craft hull lost; each loss is one `flight_member_lost` (AP §21.3). */
  private noteFlightLosses(target: ShipState): void {
    const f = target.flight;
    if (!f) return;
    const left = membersLeft(target);
    while (f.craft > left) {
      f.craft--;
      this.emit({ t: this.time, type: 'flight_member_lost', shipId: target.id, remaining: f.craft });
    }
  }

  /** Bookkeeping for a hit taken: the final-salvo window of the flagship events and the stealth reveal. */
  private noteHit(target: ShipState): void {
    const times = target.recentHitTimes;
    times.push(this.time);
    while (times.length > 0 && times[0] < this.time - RECENT_HIT_WINDOW) times.shift();
    this.revealStealth(target, 'hit');
  }

  /** Craft launched this tick per side (the start-of-tick side lists do not hold them yet). */
  private craftLaunchedTick = { tick: -1, A: 0, B: 0 };

  /** Live small craft of a side at this moment of the tick: the start-of-tick lists plus this tick's launches (AP §21.3). */
  private liveCraftOf(side: Side): number {
    const c = this.craftLaunchedTick;
    if (c.tick !== this.tick) {
      c.tick = this.tick;
      c.A = 0;
      c.B = 0;
    }
    return liveCraft(this.alliesOf(side), side) + c[side];
  }

  private updateCarrier(ship: ShipState, fleet: FleetState, dt: number): void {
    if (!ship.hangar) return;
    const h = ship.hangar;
    if (fleet.orders.fightersDeployed && h.remaining > 0) {
      // A burst (`launch_drones`) empties up to `burst` craft from the hangar at once; otherwise two every 0.4 s.
      const burst = h.burst !== undefined && h.burst > 0 ? Math.min(h.burst, h.remaining) : 0;
      h.launchTimer -= dt;
      if (burst > 0 || h.launchTimer <= 0) {
        h.burst = undefined;
        const live = this.liveCraftOf(ship.side);
        let n = burst > 0 ? burst : Math.min(2, h.remaining);
        // Above the side's flight threshold every further launch is a flight of up to four (AP §21.3): the deck
        // then sends a whole flight every 0.8 s instead of a pair every 0.4 s (the same craft rate).
        if (burst === 0 && launchAsFlights(live, n)) n = Math.min(FLIGHT_SIZE, h.remaining);
        h.launchTimer = burst > 0 ? 0.4 : 0.4 * Math.max(1, n / 2);
        const units = launchUnits(live, n);
        const yaw = Math.atan2(ship.heading.x, ship.heading.z);
        units.forEach((craft, i) => {
          const f = this.createShip(h.classId, fleet.spec, undefined, ship.id, craft);
          const row = Math.floor(i / 2);
          const off = rotateY(v3((i % 2 === 0 ? 1 : -1) * 0.12 * (1 + row), -0.05, 0.1 - 0.06 * row), yaw);
          f.pos = add(ship.pos, off);
          f.prevPos = clone(f.pos);
          f.heading = clone(ship.heading);
          f.prevHeading = clone(ship.heading);
          f.vel = scale(ship.heading, 0.6);
          f.slot = v3((this.rng.next() - 0.5) * 6 * S, (2 + this.rng.next() * 2) * S, (10 + this.rng.next() * 3) * S);
          this.ships.push(f);
          this.shipById.set(f.id, f);
          this.emit({ t: this.time, type: 'ship_deployed', shipId: f.id, classId: f.classId, faction: f.faction, side: f.side, name: f.name });
        });
        this.craftLaunchedTick[ship.side] += n;
        h.remaining -= n;
        // `count` is craft, never flights.
        if (burst > 0 || h.remaining === 0 || h.remaining % 8 === 0) this.emit({ t: this.time, type: 'fighters_launched', carrierId: ship.id, count: n });
      }
    }
    // Recall: fighters near the carrier return to the hangar.
    const craft = this.craftOf(ship.id);
    if (!fleet.orders.fightersDeployed) {
      for (const f of craft) {
        if (f.alive && !f.escaped && distance(f.pos, ship.pos) < ship.lengthKm) {
          f.escaped = true; // Treated as recovered: not a loss, no longer in battle.
          f.alive = true;
          // A recovered flight returns its surviving members to the hangar.
          h.remaining += f.flight ? f.flight.craft : 1;
        }
      }
    }
    // Rearming: fighters that have spent their torpedoes reload alongside the carrier.
    for (const f of craft) {
      if (!f.rearming || !f.alive || f.escaped) continue;
      if (distance(f.pos, ship.pos) > ship.lengthKm * 1.5) continue;
      f.rearmTimer = (f.rearmTimer ?? REARM_SECONDS) - dt;
      if (f.rearmTimer > 0) continue;
      for (const w of f.weapons) if (w.def.magazine !== undefined) w.ammo = w.def.magazine;
      f.rearming = false;
      f.rearmTimer = undefined;
      this.emit({ t: this.time, type: 'fighter_rearmed', shipId: f.id, carrierId: ship.id });
    }
  }

  // ---------------------------------------------------------------- weapons

  /** Yaw of the hull being processed, memoised per ship and tick (the heading is fixed while its mounts are updated). */
  private yawMemo = { id: '', tick: -1, yaw: 0, sin: 0, cos: 0 };

  private yawOf(ship: ShipState): { yaw: number; sin: number; cos: number } {
    const m = this.yawMemo;
    if (m.id !== ship.id || m.tick !== this.tick) {
      m.id = ship.id;
      m.tick = this.tick;
      m.yaw = Math.atan2(ship.heading.x, ship.heading.z);
      m.sin = Math.sin(m.yaw);
      m.cos = Math.cos(m.yaw);
    }
    return m;
  }

  /** World position of a mount written into `out` (allocation-free; the per-tick yaw is memoised). */
  private mountOrigin(ship: ShipState, w: WeaponState, out: Vec3): Vec3 {
    const y = this.yawOf(ship);
    const o = w.offset;
    out.x = ship.pos.x + o.x * y.cos + o.z * y.sin;
    out.y = ship.pos.y + o.y;
    out.z = ship.pos.z - o.x * y.sin + o.z * y.cos;
    return out;
  }

  private weaponWorldOffset(ship: ShipState, w: WeaponState): Vec3 {
    return this.mountOrigin(ship, w, v3());
  }

  /** Scalar arc test from the hull's position: horizontal angle against the mount's facing plus a generous vertical tolerance. */
  private inArcScalar(ship: ShipState, w: WeaponState, tx: number, ty: number, tz: number, facingSin: number, facingCos: number, cosLimit: number): boolean {
    if (w.def.arc >= 360) return true;
    const dx = tx - ship.pos.x;
    const dy = ty - ship.pos.y;
    const dz = tz - ship.pos.z;
    const flat2 = dx * dx + dz * dz;
    const len = Math.sqrt(flat2 + dy * dy);
    if (len < 1e-9) return true;
    if (Math.abs(dy) / len >= ARC_VERTICAL_REACH) return false;
    if (flat2 < 1e-18) return true;
    const cosA = (facingSin * dx + facingCos * dz) / Math.sqrt(flat2);
    return cosA >= cosLimit;
  }

  /** The mount's facing direction and arc limit for this tick (one trig evaluation per mount per acquisition). */
  private arcParams(ship: ShipState, w: WeaponState): { sin: number; cos: number; cosLimit: number } {
    const yaw = this.yawOf(ship).yaw + w.facing;
    const halfArc = ((w.def.arc / 2) * Math.PI) / 180;
    return { sin: Math.sin(yaw), cos: Math.cos(yaw), cosLimit: Math.cos(halfArc + 0.05) };
  }

  private inArc(ship: ShipState, w: WeaponState, target: Vec3): boolean {
    if (w.def.arc >= 360) return true;
    const a = this.arcParams(ship, w);
    return this.inArcScalar(ship, w, target.x, target.y, target.z, a.sin, a.cos, a.cosLimit);
  }

  private updateWeapons(ship: ShipState, fleet: FleetState, dt: number): void {
    const wpnFactor = 0.4 + 0.6 * ship.subsystems.weapons;
    // One grid query per ship per tick: is any hull of this ship's targeting set within its longest weapon range?
    // Without one the mounts only do their bookkeeping (cooldowns, beams, heat, bursts, charges) and never scan;
    // point-defence lasers still get to look for missiles while any are in flight.
    let longest = 0;
    let hasPd = false;
    for (const w of ship.weapons) {
      if (w.def.range > longest) longest = w.def.range;
      if (w.def.kind === 'gardian') hasPd = true;
    }
    const enemyNear = this.grid.anyWithin(ship.pos, longest + ship.lengthKm, ship);
    const missilesNear = hasPd && this.missiles.length > 0;
    // Fleet fire control (volley.ts): a pending volley, an open HADES salvo, the standing hold.
    const volley = fleet.volley;
    const salvo = hadesSalvoOf(fleet, this.time);
    const hold = fleet.orders.holdFire;
    const running = ship.driveRun !== undefined;
    for (const w of ship.weapons) {
      // Active beams deal damage over time.
      if (w.beamRemaining > 0) {
        w.beamRemaining -= dt;
        const target = w.beamTargetId ? this.shipById.get(w.beamTargetId) : undefined;
        w.beamStart = this.weaponWorldOffset(ship, w);
        if (target && target.alive && w.beamHit) {
          w.beamEnd = clone(target.pos);
          // A flight's burst carries one beam per member that hit (`beamMembers`).
          const dmg = w.def.damage * dt * (w.beamMembers ?? 1);
          // Beams are judged by their whole burst for the M2 load threshold, not by the per-tick chunk.
          const out = applyDamage(target, dmg, w.def, this.rng, this.time, { hitSize: w.def.damage * (w.def.beamDuration ?? 1.5) });
          this.noteFlightLosses(target);
          ship.stats.damageDealt += out.hullDamage + out.barrierDamage;
          ship.stats.recentDamage += out.hullDamage + out.barrierDamage;
          if (out.barriersCollapsed) this.emit({ t: this.time, type: 'barriers_down', shipId: target.id });
          if (out.subsystem) this.emit({ t: this.time, type: 'subsystem_disabled', shipId: target.id, subsystem: out.subsystem.name, level: out.subsystem.level });
          if (out.destroyed) this.destroyShip(target, ship, w.def.damageType, w.def.id);
        } else if (target && w.beamEnd) {
          // Missed beam keeps pointing at its miss point.
        } else {
          w.beamRemaining = 0;
        }
        if (w.beamRemaining <= 0) {
          w.beamTargetId = undefined;
          w.beamEnd = undefined;
          w.beamStart = undefined;
          w.beamMembers = undefined;
        }
        continue;
      }
      // A per-mount heat pool cools on its own, like a hull.
      if (w.heat !== undefined) w.heat = Math.max(0, w.heat - MOUNT_HEAT_CAPACITY * 0.08 * dt);
      // A charging mount counts its charge down and fires at the end of it.
      if (w.charging !== undefined) {
        w.charging -= dt;
        if (w.charging > 0) continue;
        w.charging = undefined;
        // The charged shot leaves at the end of its charge as an ordinary shot (a charge begun on a volley's beat
        // releases after the window; the volley counts that mount as silent).
        this.tryFire(ship, fleet, w);
        continue;
      }
      w.cooldown -= dt * wpnFactor;
      // Heat-limited point-defence bursts recover while the mount is silent.
      if (w.def.burst && w.burstLeft !== undefined && w.burstLeft <= 0) {
        w.burstRecover -= dt;
        if (w.burstRecover > 0) continue;
        w.burstLeft = w.def.burst.shots;
      }
      // A scripted forced shot left unconsumed lapses after its 6 s (CINEMATIC_DESIGN.md §1.6).
      if (w.forcedShot && this.time > w.forcedShot.expiresAt + 1e-9) {
        dropForcedShot(w);
        this.emit({ t: this.time, type: 'forced_shot_expired', shipId: ship.id, weaponIndex: w.index });
      }
      // An arriving hull holds fire until it has settled into its slot; a hull on a drive run is silent (AP §9).
      if (w.arrivalHold || running) continue;
      // Fire control (volley.ts). A scripted forced shot bypasses every hold. A volley mount holds until its release
      // offset, then fires once inside the window — a gun that is nearly ready (reload left ≤ the window) fires on the
      // beat (CINEMATIC_DESIGN.md §1.3); a HADES-salvo member holds until its release; the standing hold keeps the rest
      // of its class silent. The cooldown keeps running while a mount is held.
      let volleyShot = false;
      let salvoShot = false;
      if (!w.forcedShot) {
        if (volley) {
          const vs = volleyStep(volley, ship, w, this.time, w.cooldown <= 0);
          if (vs === 'hold') continue;
          if (vs === 'release' || vs === 'window') {
            if (w.cooldown > 0 && w.cooldown <= volley.window) w.cooldown = 0;
            volleyShot = true;
          }
        }
        if (salvo) {
          const ss = salvoStep(salvo, ship, w, this.time);
          if (ss === 'hold') continue;
          salvoShot = ss === 'due';
        }
        if (!volleyShot && !salvoShot && heldBy(hold, w)) continue;
      }
      if (w.cooldown > 0) continue;
      if (w.ammo !== undefined && w.ammo <= 0) continue;
      // Heat: a per-mount pool fires only while the shot fits under its capacity; everything else waits on the hull.
      if (w.def.perMountHeat ? (w.heat ?? 0) + w.def.heat > MOUNT_HEAT_CAPACITY : ship.overheated && w.def.heat > 0) continue;
      // A stealth hunter fires only in its strike run (firing reveals it); every other hull fires at whatever its
      // mounts can reach — withdrawing and disengaging hulls included (brief §8.6: guns still bearing).
      if (ship.stealth && ship.role !== 'fighter' && !w.forcedShot && hunterHoldsFire(ship, fleet, w, ship.targetId ? this.shipById.get(ship.targetId) : undefined)) {
        w.cooldown = IDLE_RETRY_S;
        continue;
      }
      // Nothing to shoot at within reach: the mount waits the idle retry instead of scanning (AP §21.5).
      if (!enemyNear && !(missilesNear && w.def.kind === 'gardian')) {
        w.cooldown = IDLE_RETRY_S;
        continue;
      }
      if (w.def.chargeTime) {
        // The visible charge begins only with something to shoot at; the shot itself is resolved at release.
        if (!(w.forcedShot ? this.acquireForced(ship, w, w.forcedShot.targetId) : this.acquireTarget(ship, fleet, w, volleyShot || salvoShot))) {
          w.cooldown = IDLE_RETRY_S;
          continue;
        }
        w.charging = w.def.chargeTime;
        this.emit({ t: this.time, type: 'weapon_charging', shipId: ship.id, weaponIndex: w.index, weaponId: w.def.id, seconds: w.def.chargeTime });
        continue;
      }
      if (!this.tryFire(ship, fleet, w, volleyShot, salvoShot)) w.cooldown = IDLE_RETRY_S;
      else {
        if (volleyShot && volley) noteVolleyShot(volley, ship, w);
        if (salvoShot && salvo) noteSalvoShot(salvo, ship, w);
      }
    }
  }

  /**
   * Whether a Titan mount spends a HADES penetrator on this target (AP §7): the mount carries HADES rounds, the
   * magazine is not empty, the fleet is not holding special ammunition and the gate is open (a Reaper capital
   * whose barriers are collapsed or degraded below `HADES_GATE.barrierFractionBelow`).
   */
  useSpecialAmmo(ship: ShipState, w: WeaponState, target: ShipState): boolean {
    if (!w.def.hadesRound || (w.specialAmmo ?? 0) <= 0) return false;
    if (this.fleets.get(ship.fleetId)?.orders.holdSpecialAmmo) return false;
    return hadesGateOpen(target);
  }

  /** Scratch origin for target acquisition (the result's `origin` aliases it: clone before storing). */
  private originScratch = v3();

  /** What the firing-solution model needs from the simulation (solutions.ts). */
  private readonly solutionCtx = {
    sim: this as BattleSimulation,
    get time(): number {
      return this.sim.time;
    },
    getShip: (id: string): ShipState | undefined => this.shipById.get(id),
    canTrack: (viewer: ShipState, target: ShipState): boolean => detectable(viewer, target),
    sharedSolution: (ship: ShipState, targetId: string): boolean => this.sharedSolution(ship, targetId),
  };

  /** Another hull of the ship's fleet already holds more than `SHARED_SOLUTION_Q` on the target ("target solution shared"). */
  private sharedSolution(ship: ShipState, targetId: string): boolean {
    for (const m of this.membersOf(ship.fleetId)) {
      if (m === ship) continue;
      for (const sol of m.solutions) if (sol.targetId === targetId && sol.q > SHARED_SOLUTION_Q) return true;
    }
    return false;
  }

  /**
   * A scripted forced shot's target (CINEMATIC_DESIGN.md §1.6): the named hull when it is alive, present, visible,
   * hostile, within the mount's range and in its arc; otherwise undefined and the shot waits (it lapses after 6 s).
   */
  private acquireForced(ship: ShipState, w: WeaponState, targetId: string): { target: ShipState; origin: Vec3 } | undefined {
    const t = this.shipById.get(targetId);
    if (!t || !t.alive || t.escaped || this.isPending(t) || !gridFilterPasses(ship, t) || !detectable(ship, t)) return undefined;
    const origin = this.mountOrigin(ship, w, this.originScratch);
    const dx = t.pos.x - origin.x;
    const dy = t.pos.y - origin.y;
    const dz = t.pos.z - origin.z;
    if (dx * dx + dy * dy + dz * dz > w.def.range * w.def.range) return undefined;
    if (!this.inArc(ship, w, t.pos)) return undefined;
    return { target: t, origin };
  }

  /**
   * What the mount would shoot at right now, or undefined. Candidates come from the spatial grid within the
   * mount's range (ship-index order, the order the old brute-force scan yielded); every distance is a squared
   * scalar and nothing is allocated on the idle path (AP §21.5). A mount-level target (`WeaponState.assignedTargetId`:
   * a volley target resolved per mount, `force_target.mounts`, a HADES salvo) stands in for the hull's own target
   * while it lasts. `coordinated`: the shot is a volley's or a salvo's, so a spinal gun with any target in arc fires on
   * the beat instead of waiting for its primary (CINEMATIC_DESIGN.md §1.3).
   */
  private acquireTarget(ship: ShipState, fleet: FleetState, w: WeaponState, coordinated = false): { target?: ShipState; missile?: Missile; origin: Vec3 } | undefined {
    const def = w.def;
    const origin = this.mountOrigin(ship, w, this.originScratch);
    const range2 = def.range * def.range;
    let target: ShipState | undefined;
    let missile: Missile | undefined;

    if (def.antiSmall) {
      // Point defence: missiles threatening our side first, then fighters, then (lasers) anything close.
      let best = Infinity;
      if (def.kind === 'gardian') {
        for (const m of this.missiles) {
          if (!m.alive || m.side === ship.side) continue;
          const dx = m.pos.x - origin.x;
          const dy = m.pos.y - origin.y;
          const dz = m.pos.z - origin.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > range2) continue;
          const d = Math.sqrt(d2);
          const tgt = this.shipById.get(m.targetId);
          const threatBonus = tgt && tgt.id === ship.id ? 0.5 : fleet.orders.pointDefenceMissiles ? 0.6 : 1;
          if (d * threatBonus < best) {
            best = d * threatBonus;
            missile = m;
          }
        }
      }
      if (!missile) {
        const near = this.grid.queryRadius(origin, def.range, ship);
        const arc = def.arc >= 360 ? undefined : this.arcParams(ship, w);
        for (const e of near) {
          if (e.role !== 'fighter' || !detectable(ship, e)) continue;
          const dx = e.pos.x - origin.x;
          const dy = e.pos.y - origin.y;
          const dz = e.pos.z - origin.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < best && (arc === undefined || this.inArcScalar(ship, w, e.pos.x, e.pos.y, e.pos.z, arc.sin, arc.cos, arc.cosLimit))) {
            best = d;
            target = e;
          }
        }
        if (!target && def.kind === 'gardian') {
          // GARDIAN lasers can scorch nearby hulls (bypassing barriers) — low priority.
          for (const e of near) {
            if (!detectable(ship, e)) continue;
            const dx = e.pos.x - origin.x;
            const dy = e.pos.y - origin.y;
            const dz = e.pos.z - origin.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < best) {
              best = d;
              target = e;
            }
          }
        }
      }
      if (!missile && !target) return undefined;
    } else {
      let primary = ship.targetId ? this.shipById.get(ship.targetId) : undefined;
      if (w.assignedTargetId !== undefined) {
        const a = this.time <= (w.assignedUntil ?? Infinity) + 1e-9 ? this.shipById.get(w.assignedTargetId) : undefined;
        if (a && a.alive && !a.escaped) primary = a;
        else {
          w.assignedTargetId = undefined;
          w.assignedUntil = undefined;
        }
      }
      const arc = def.arc >= 360 ? undefined : this.arcParams(ship, w);
      const inArc = (e: ShipState): boolean => arc === undefined || this.inArcScalar(ship, w, e.pos.x, e.pos.y, e.pos.z, arc.sin, arc.cos, arc.cosLimit);
      const within = (e: ShipState): boolean => {
        const dx = e.pos.x - origin.x;
        const dy = e.pos.y - origin.y;
        const dz = e.pos.z - origin.z;
        return dx * dx + dy * dy + dz * dz <= range2;
      };
      // Anti-ship mounts never engage small craft (a torpedo or a spinal round is not spent on a fighter or a drone).
      if (primary && primary.alive && !primary.escaped && primary.role !== 'fighter' && detectable(ship, primary) && within(primary) && inArc(primary)) {
        target = primary;
      } else {
        // Secondary target of opportunity in arc (never a silent stealth hull beyond its detection range).
        let best = -Infinity;
        for (const e of this.grid.queryRadius(origin, def.range, ship)) {
          if (e.role === 'fighter' || !inArc(e) || !detectable(ship, e)) continue;
          const dx = e.pos.x - origin.x;
          const dy = e.pos.y - origin.y;
          const dz = e.pos.z - origin.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const s = (def.antiCapital ? Math.log2(1 + e.pointValue) : 1) * (1 - d / def.range) + (1 - e.hull / e.maxHull) * 0.5;
          if (s > best) {
            best = s;
            target = e;
          }
        }
        // Spinal guns wait for the primary target rather than wasting a shot — except on a volley's or salvo's beat.
        if (target && def.antiCapital && def.arc <= 20 && primary && primary.alive && target.id !== primary.id && !coordinated && this.rng.chance(0.6)) return undefined;
      }
      if (!target) return undefined;
    }
    return { target, missile, origin };
  }

  /**
   * Fires the mount at what it can acquire; false when it found nothing (the caller sets the idle retry).
   * `volleyShot` / `salvoShot` mark a fleet volley's or a HADES salvo's shot (`weapon_fired.volley` / `.salvo`). A mount
   * with a scripted `forcedShot` fires only at that target: with `hit` the round cannot miss (it homes onto the target
   * and strikes nothing else), with `penetrate` a penetrator's warhead arms whatever the barrier held; the shot is
   * consumed (a queued `hadesStrike` round re-arms the mount).
   */
  private tryFire(ship: ShipState, fleet: FleetState, w: WeaponState, volleyShot = false, salvoShot = false): boolean {
    const forced = w.forcedShot;
    const acquired: { target?: ShipState; missile?: Missile; origin: Vec3 } | undefined = forced
      ? this.acquireForced(ship, w, forced.targetId)
      : this.acquireTarget(ship, fleet, w, volleyShot || salvoShot);
    if (!acquired) return false;
    const { target, missile } = acquired;
    const def = w.def;
    // A spinal gun needs a bow solution: the target in arc (acquisition) and the predicted intercept in arc too (AP §19 8.7).
    if (target && def.kind === 'mass_accelerator' && def.antiCapital && def.arc <= 20 && !this.inArc(ship, w, interceptPoint(acquired.origin, target.pos, target.vel, def.projectileSpeed))) return false;
    // Coordinated HADES batteries (owner requirement, INTEGRATION_NOTES.md; volley.ts `openHadesSalvo`): a Titan mount
    // ready to send a penetrator at a gated Reaper capital does not fire alone — it opens a salvo for its fleet and holds
    // with the other members until their common release; inside a salvo already open on that capital it fires at once.
    if (!forced && !salvoShot && target && def.hadesRound && this.useSpecialAmmo(ship, w, target)) {
      const open = hadesSalvoOf(fleet, this.time);
      if (!open) {
        if (openHadesSalvo(this.volleyHost, fleet, ship, w, target)) return false;
      } else if (open.targetId === target.id) salvoShot = true;
    }
    const origin = clone(acquired.origin);

    // Fire.
    w.cooldown = def.cooldown * (0.95 + 0.1 * this.rng.next());
    if (def.perMountHeat) w.heat = (w.heat ?? 0) + def.heat;
    else ship.heat += def.heat;
    // A flight fires one shot per live member per volley (AP §21.3).
    const members = ship.flight ? Math.max(1, ship.flight.craft) : 1;
    const shots = (def.salvo ?? 1) * members;
    ship.stats.shotsFired += shots;
    if (w.burstLeft !== undefined && def.burst) {
      w.burstLeft--;
      if (w.burstLeft <= 0) w.burstRecover = def.burst.recovery;
    }
    if (w.ammo !== undefined) {
      w.ammo--;
      if (w.ammo <= 0 && !ship.weapons.some((o) => o.def.id === def.id && (o.ammo ?? 1) > 0)) {
        this.emit({ t: this.time, type: 'ammunition_depleted', shipId: ship.id, weaponId: def.id });
        if (ship.role === 'fighter' && ship.carrierId) ship.rearming = true;
      }
    }
    if (ship.firstShotAt === undefined) {
      ship.firstShotAt = this.time;
      if (!this.engagementAnnounced.has(fleet.spec.id) && ship.role !== 'fighter') {
        this.engagementAnnounced.add(fleet.spec.id);
        this.comms(ship.side, 'engage', undefined, fleet);
      }
    }
    // A HADES penetrator leaves the gun only through the gate (AP §7) and counts against the separate magazine. A
    // scripted strike (`hadesStrike`): without `force` the gate still decides (the fleet's hold on special ammunition is
    // lifted for the order), with `force` it bypasses gate and fuse (`penetrate`).
    const extra = forced ? forcedShotExtra(w) : undefined;
    let special = false;
    if (target) {
      if (extra?.hades) special = def.hadesRound !== undefined && (w.specialAmmo ?? 0) > 0 && (forced!.penetrate || hadesGateOpen(target));
      else special = this.useSpecialAmmo(ship, w, target);
    }
    if (special) w.specialAmmo = (w.specialAmmo ?? 1) - 1;
    const forcedHit = forced?.hit === true;
    const scripted: Projectile['forced'] = forced ? { hit: forcedHit, penetrate: special && forced.penetrate, ...(extra?.outage ? { outage: extra.outage } : {}) } : undefined;
    if (forced) consumeForcedShot(w, this.time, w.cooldown / (0.4 + 0.6 * ship.subsystems.weapons));
    this.revealStealth(ship, 'fired');
    const targetId = target?.id ?? `missile-${missile!.id}`;
    // Brief §20: the muzzle the round leaves from and the id of the first round (a volley of `shots` rounds carries
    // consecutive ids), so the gunnery views and the audio follow the real shot.
    const projectileId = target && (def.kind === 'mass_accelerator' || def.kind === 'missile' || def.kind === 'disruptor_torpedo') ? this.nextId : undefined;
    this.emit({
      t: this.time,
      type: 'weapon_fired',
      shipId: ship.id,
      weaponId: def.id,
      targetId,
      weaponIndex: w.index,
      kind: def.kind,
      muzzle: clone(origin),
      ...(projectileId !== undefined ? { projectileId } : {}),
      ...(shots > 1 ? { shots } : {}),
      ...(special ? { special: true } : {}),
      ...(volleyShot ? { volley: true } : {}),
      ...(salvoShot ? { salvo: true } : {}),
      ...(forced ? { forced: true } : {}),
    });

    const coordination = 1 - fleet.coordinationPenalty * 0.5;

    if (missile) {
      const p = Math.min(0.95, def.accuracy * (0.5 + 0.5 * ship.subsystems.sensors) * coordination);
      this.flashes.push({ from: origin, to: clone(missile.pos), kind: ship.faction === 'reaper' ? 'reaper_pd' : 'gardian', ttl: 0.12 });
      for (let m = 0; m < members && missile.alive; m++) {
        if (!this.rng.chance(p)) continue;
        missile.hp -= def.damage;
        ship.stats.hits++;
        if (missile.hp <= 0) {
          missile.alive = false;
          this.emit({ t: this.time, type: 'missile_intercepted', missileId: missile.id, interceptorId: ship.id, pos: clone(missile.pos) });
        }
      }
      return true;
    }
    if (!target) return true;

    const dist = distance(origin, target.pos);
    const closing = length(sub(target.vel, ship.vel));
    // Firing solution (AP §19 8.7): p_hit × (0.25 + 0.75·q) for the anti-ship guns and beams of a hull; broadsides
    // (non-spinal anti-ship guns) fire freely but at accuracy × 0.85.
    const solved = usesSolution(ship, def);
    const q = solved ? shotQuality(ship, target, this.sharedSolution(ship, target.id)) : 1;
    const broadside = solved && def.kind === 'mass_accelerator' && !(def.antiCapital && def.arc <= 20) ? BROADSIDE_ACCURACY : 1;
    const p = hitProbability(ship, target, def, dist, closing) * coordination * (solved ? solutionFactor(q) : 1) * broadside;

    switch (def.kind) {
      case 'mass_accelerator': {
        // One round per member of a flight, each with its own hit roll (a single hull fires one).
        for (let m = 0; m < members; m++) {
          const aim = interceptPoint(origin, target.pos, target.vel, def.projectileSpeed);
          let aimPoint = aim;
          const hit = forcedHit || this.rng.chance(p);
          let missDistance: number | undefined;
          if (!hit) {
            // Deliberate miss offset larger than the target's bounding sphere: wide for a green solution, close for a mature one.
            const dir = normalize(sub(aim, origin));
            let perp = cross(dir, v3(0, 1, 0));
            if (lengthSq(perp) < 1e-6) perp = v3(1, 0, 0);
            perp = normalize(perp);
            const up = cross(perp, dir);
            const ang = this.rng.next() * Math.PI * 2;
            const mag = solved ? missOffset(target.radiusKm, q, this.rng.next()) : target.radiusKm * (1.6 + this.rng.next() * 3) + 0.05;
            missDistance = mag;
            aimPoint = add(aim, add(scale(perp, Math.cos(ang) * mag), scale(up, Math.sin(ang) * mag)));
          }
          const dir = normalize(sub(aimPoint, origin));
          this.projectiles.push({
            id: this.nextId++,
            shooterId: ship.id,
            side: ship.side,
            weapon: def,
            pos: clone(origin),
            prevPos: clone(origin),
            vel: scale(dir, def.projectileSpeed),
            // Long shots stream past the target and keep flying (2.2 × range, brief §8.7).
            ttl: (def.range * PROJECTILE_RANGE_FACTOR) / def.projectileSpeed + 0.5,
            intendedTargetId: target.id,
            special: special && m === 0,
            ...(missDistance !== undefined ? { missDistance, rolledMiss: true } : {}),
            ...(scripted && m === 0 ? { forced: scripted } : {}),
          });
        }
        break;
      }
      case 'thanix':
      case 'reaper_beam': {
        // A flight's members each roll; the burst carries one beam per member that hit (`beamMembers`).
        let hits = 0;
        for (let m = 0; m < members; m++) if (forcedHit || this.rng.chance(p)) hits++;
        const hit = hits > 0;
        w.beamRemaining = def.beamDuration ?? 1.5;
        w.beamTargetId = target.id;
        w.beamHit = hit;
        w.beamMembers = members > 1 ? hits : undefined;
        if (hit) {
          ship.stats.hits += hits;
          this.noteHit(target);
          // A burst this size flares the target's own barrier and blinds its fire control for a moment.
          if (target.barriers > 0) barrierFlare(target, def.damage * (def.beamDuration ?? 1.5), this.time);
        }
        w.beamStart = origin;
        if (hit) w.beamEnd = clone(target.pos);
        else {
          const dir = normalize(sub(target.pos, origin));
          let perp = cross(dir, v3(0, 1, 0));
          if (lengthSq(perp) < 1e-6) perp = v3(1, 0, 0);
          perp = normalize(perp);
          const mag = target.radiusKm * 2.5 + 0.3;
          const ang = this.rng.next() * Math.PI * 2;
          const up = cross(perp, dir);
          w.beamEnd = add(addScaled(target.pos, dir, 6), add(scale(perp, Math.cos(ang) * mag), scale(up, Math.sin(ang) * mag)));
        }
        break;
      }
      case 'gardian': {
        this.flashes.push({ from: origin, to: clone(target.pos), kind: ship.faction === 'reaper' ? 'reaper_pd' : 'gardian', ttl: 0.1 });
        for (let m = 0; m < members && target.alive; m++) {
          if (forcedHit || this.rng.chance(p)) this.applyHit(ship, target, def, def.damage, clone(target.pos));
        }
        break;
      }
      case 'disruptor_torpedo':
      case 'missile': {
        const dir = normalize(sub(target.pos, origin));
        // A salvo rack launches `salvo` torpedoes abreast; each homes on the target on its own.
        let perp = cross(dir, v3(0, 1, 0));
        if (lengthSq(perp) < 1e-6) perp = v3(1, 0, 0);
        perp = normalize(perp);
        for (let i = 0; i < shots; i++) {
          const start = addScaled(origin, perp, (i - (shots - 1) / 2) * 0.03);
          this.missiles.push({
            id: this.nextId++,
            shooterId: ship.id,
            side: ship.side,
            weapon: def,
            pos: clone(start),
            prevPos: clone(start),
            vel: scale(dir, def.projectileSpeed),
            targetId: target.id,
            hp: def.missileHp ?? 10,
            ttl: (def.range * 2.5) / def.projectileSpeed + 4,
            alive: true,
            ...(forcedHit && i === 0 ? { forced: true } : {}),
          });
        }
        break;
      }
    }
    return true;
  }

  /**
   * Resolve a hit on a hull: the kinetic step, then — for a HADES penetrator — the fuse and the warhead.
   * Public because the scripted specials (`hadesStrike`) and the tests resolve hits through it.
   */
  applyHit(shooter: ShipState, target: ShipState, weapon: EffectiveWeapon, damage: number, pos: Vec3, opts: HitOptions = {}): void {
    const hr = opts.special ? weapon.hadesRound : undefined;
    // The Valkyrie's kill rule (AP §8): a degraded target takes the bonus multiplier.
    let raw = damage;
    if (weapon.degradedTargetBonus && barrierFraction(target) < weapon.degradedTargetBonus.barrierFractionBelow) raw *= weapon.degradedTargetBonus.multiplier;
    // A HADES penetrator meets the barrier like a slug (multiplier 1.0) and ignores half the armour (AP §7).
    const round: EffectiveWeapon = hr ? { ...weapon, armourBypass: hr.armourBypass, barrierEfficiencyMultiplier: hr.barrierEfficiencyMultiplier } : weapon;
    const out = applyDamage(target, raw, round, this.rng, this.time);
    this.noteFlightLosses(target);
    shooter.stats.hits++;
    shooter.stats.damageDealt += out.hullDamage + out.barrierDamage;
    shooter.stats.recentDamage += out.hullDamage + out.barrierDamage;
    this.noteHit(target);
    barrierFlare(target, out.barrierDamage, this.time);
    // Brief §20: the impact carries what the barrier, the armour and the hull each took, whether the round got through
    // the barrier, and the round's id and weapon, so effects and audio resolve against the real collision.
    this.emit({
      t: this.time,
      type: 'projectile_impact',
      shipId: shooter.id,
      targetId: target.id,
      damage: raw,
      damageType: weapon.damageType,
      barrierDamage: out.barrierDamage,
      hullDamage: out.hullDamage,
      armourDamage: Math.max(0, out.residual - out.hullDamage),
      penetrated: out.residual > 0,
      weaponId: weapon.id,
      ...(opts.projectileId !== undefined ? { projectileId: opts.projectileId } : {}),
      ...(hr ? { special: true } : {}),
      pos,
    });
    if (out.barriersCollapsed) this.emit({ t: this.time, type: 'barriers_down', shipId: target.id });
    if (out.subsystem) this.emit({ t: this.time, type: 'subsystem_disabled', shipId: target.id, subsystem: out.subsystem.name, level: out.subsystem.level });
    if (out.destroyed) {
      this.destroyShip(target, shooter, weapon.damageType, weapon.id);
      return;
    }
    // The fuse: the warhead arms only when at least `residualFraction` of the round passed the barrier
    // (a collapsed or nearly collapsed field at the impact point); otherwise the penetrator was an expensive slug.
    if (hr && (opts.forcePenetrate || out.residual >= hr.fuse.residualFraction * raw)) this.detonateWarhead(shooter, target, weapon, hr.warhead, pos, opts.outage, opts.projectileId);
  }

  /** The HADES burst inside the hull: barriers and armour ignored, one subsystem outage, barrier recovery suppressed. */
  private detonateWarhead(shooter: ShipState, target: ShipState, weapon: EffectiveWeapon, warhead: WarheadDef, pos: Vec3, forcedOutage?: 'weapons' | 'engines', projectileId?: number): void {
    const burst: EffectiveWeapon = { ...weapon, damageType: warhead.damageType, damage: warhead.damage, barrierEfficiencyMultiplier: warhead.barrierEfficiencyMultiplier, armourBypass: warhead.armourBypass };
    const out = applyDamage(target, warhead.damage, burst, this.rng, this.time, { subsystemRoll: false });
    this.noteFlightLosses(target);
    shooter.stats.damageDealt += out.hullDamage;
    shooter.stats.recentDamage += out.hullDamage;
    const outage = forcedOutage ?? this.rng.pick(['weapons', 'engines'] as const);
    this.applyOutage(target, outage, warhead.subsystemOutage.drop, warhead.subsystemOutage.seconds);
    target.regenSuppressedUntil = Math.max(target.regenSuppressedUntil, this.time + warhead.regenSuppressSeconds);
    this.emit({ t: this.time, type: 'hades_detonation', shipId: shooter.id, targetId: target.id, pos: clone(pos), damage: warhead.damage, outage, ...(projectileId !== undefined ? { projectileId } : {}) });
    if (out.destroyed) this.destroyShip(target, shooter, 'warhead', weapon.id);
  }

  /**
   * Knock a subsystem down by `drop` for `seconds`. One outage is pending per hull: a second burst on the same
   * subsystem deepens and extends it; a burst on a different subsystem restores the pending one first.
   */
  private applyOutage(target: ShipState, subsystem: keyof Subsystems, drop: number, seconds: number): void {
    const pending = target.outageUntil;
    if (pending && pending.subsystem !== subsystem) {
      target.subsystems[pending.subsystem] = Math.min(1, target.subsystems[pending.subsystem] + pending.amount);
      target.outageUntil = undefined;
    }
    const before = target.subsystems[subsystem];
    const level = Math.max(0.1, before - drop);
    target.subsystems[subsystem] = level;
    target.outageUntil = { subsystem, until: this.time + seconds, amount: (target.outageUntil?.amount ?? 0) + (before - level) };
    this.emit({ t: this.time, type: 'subsystem_disabled', shipId: target.id, subsystem, level });
  }

  // ------------------------------------------------------------ projectiles

  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    // The swept segment is padded with the largest hit sphere in play (fighters count at 2.5 × their radius).
    const pad = this.grid.maxRadiusKm * 2.5 + 0.1;
    for (const p of this.projectiles) {
      // A scripted forced hit (`forcedShot.hit`) steers onto its intended target at its own speed (CINEMATIC_DESIGN.md
      // §1.6: the mount fires "with hit = true"), and strikes nothing else on the way.
      const homing = p.forced?.hit ? this.shipById.get(p.intendedTargetId) : undefined;
      if (homing && homing.alive && !homing.escaped) {
        const dx = homing.pos.x - p.pos.x;
        const dy = homing.pos.y - p.pos.y;
        const dz = homing.pos.z - p.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 1e-9) {
          const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
          p.vel.x = (dx / d) * speed;
          p.vel.y = (dy / d) * speed;
          p.vel.z = (dz / d) * speed;
        }
      }
      p.prevPos.x = p.pos.x;
      p.prevPos.y = p.pos.y;
      p.prevPos.z = p.pos.z;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      p.ttl -= dt;
      let hitShip: ShipState | undefined;
      let bestT = Infinity;
      // A round can hit whatever its shooter may target (enemiesOfShip semantics, AP §4.1): a rogue hull's rounds hit
      // both sides and rounds aimed at a rogue hull hit it. Without a rogue hull this is exactly the shooter's enemy side.
      const shooterState = this.shipById.get(p.shooterId);
      if (p.forced?.hit) {
        if (homing && homing.alive && !homing.escaped) {
          const t = segmentSphere(p.prevPos, p.pos, homing.pos, homing.radiusKm * (homing.role === 'fighter' ? 2.5 : 1));
          if (t !== undefined) {
            bestT = t;
            hitShip = homing;
          }
        }
      } else {
        for (const s of this.grid.querySegment(p.prevPos, p.pos, pad, shooterState ?? p.side)) {
          if (s.role === 'fighter' && !p.weapon.antiSmall) continue;
          const r = s.radiusKm * (s.role === 'fighter' ? 2.5 : 1);
          const t = segmentSphere(p.prevPos, p.pos, s.pos, r);
          if (t !== undefined && t < bestT) {
            bestT = t;
            hitShip = s;
          }
        }
      }
      if (hitShip) {
        const hitPoint = addScaled(p.prevPos, sub(p.pos, p.prevPos), bestT);
        if (shooterState) {
          // A HADES penetrator is a penetrator only on the hull it was fired at and only on a successful hit roll: a
          // round that misses or is intercepted by another hull (a destroyer covering its capital) is an expensive slug —
          // kinetic damage only, no internal effect, no event (AP §7). A forced hit homes onto its target and strikes
          // nothing else, so it always qualifies.
          const penetrator = p.special && hitShip.id === p.intendedTargetId && !p.rolledMiss;
          this.applyHit(shooterState, hitShip, p.weapon, p.weapon.damage, hitPoint, {
            projectileId: p.id,
            ...(penetrator ? { special: true } : {}),
            ...(p.forced?.penetrate ? { forcePenetrate: true } : {}),
            ...(p.forced?.outage ? { outage: p.forced.outage } : {}),
          });
        }
        continue;
      }
      if (p.missDistance !== undefined) this.checkNearMiss(p);
      if (p.ttl > 0) survivors.push(p);
    }
    this.projectiles = survivors;
  }

  /**
   * A deliberate miss passing its intended target: at the closest approach (the segment of this step brackets it),
   * a pass within `NEAR_MISS_RADII` radii emits `projectile_near_miss` (the barrier-edge flare). Checked once.
   */
  private checkNearMiss(p: Projectile): void {
    const t = this.shipById.get(p.intendedTargetId);
    if (!t || !t.alive) {
      p.missDistance = undefined;
      return;
    }
    const dx = p.pos.x - p.prevPos.x;
    const dy = p.pos.y - p.prevPos.y;
    const dz = p.pos.z - p.prevPos.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-12) return;
    const u = ((t.pos.x - p.prevPos.x) * dx + (t.pos.y - p.prevPos.y) * dy + (t.pos.z - p.prevPos.z) * dz) / len2;
    if (u > 1) return; // still closing
    const k = Math.max(0, u);
    const cx = p.prevPos.x + dx * k;
    const cy = p.prevPos.y + dy * k;
    const cz = p.prevPos.z + dz * k;
    const miss = Math.hypot(t.pos.x - cx, t.pos.y - cy, t.pos.z - cz);
    p.missDistance = undefined;
    if (miss < NEAR_MISS_RADII * t.radiusKm) this.emit({ t: this.time, type: 'projectile_near_miss', shooterId: p.shooterId, targetId: t.id, pos: v3(cx, cy, cz), miss });
  }

  private updateMissiles(dt: number): void {
    const survivors: Missile[] = [];
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.prevPos = clone(m.pos);
      m.ttl -= dt;
      const target = this.shipById.get(m.targetId);
      if (!target || !target.alive || target.escaped || m.ttl <= 0) {
        m.alive = false;
        continue;
      }
      const toT = sub(target.pos, m.pos);
      const d = length(toT);
      const speed = m.weapon.projectileSpeed;
      // Homing: blend current velocity direction toward the target.
      const desired = scale(toT, speed / Math.max(d, 1e-6));
      const turn = Math.min(1, 2.5 * dt);
      m.vel = scale(normalize(add(scale(m.vel, 1 - turn), scale(desired, turn))), speed);
      m.pos = addScaled(m.pos, m.vel, dt);
      if (distance(m.pos, target.pos) <= target.radiusKm + speed * dt) {
        const shooter = this.shipById.get(m.shooterId);
        const pHit = Math.min(0.97, m.weapon.accuracy * (1 - target.ecm * 0.4));
        // A scripted forced hit cannot miss once it arrives (point defence can still kill it on the way).
        if (shooter && (m.forced || this.rng.chance(pHit))) {
          this.applyHit(shooter, target, m.weapon, m.weapon.damage, clone(m.pos), { projectileId: m.id });
        }
        m.alive = false;
        continue;
      }
      survivors.push(m);
    }
    this.missiles = survivors;
  }

  // ------------------------------------------------------------- lifecycle

  private destroyShip(ship: ShipState, killer?: ShipState, cause: DestructionCause | DamageType = 'kinetic', weaponId?: string): void {
    if (killer) killer.stats.kills++;
    ship.alive = false;
    ship.destroyedAt = this.time;
    // The gap it leaves in its fleet's formation, for a hull further back to fill (brief §22).
    const home = this.fleets.get(ship.fleetId);
    if (home) noteLoss(home, ship);
    if (ship.flight) {
      ship.hull = 0;
      this.noteFlightLosses(ship);
    }
    for (const w of ship.weapons) {
      w.beamRemaining = 0;
      w.beamTargetId = undefined;
      w.beamEnd = undefined;
      w.beamStart = undefined;
    }
    this.emit({
      t: this.time,
      type: 'ship_destroyed',
      shipId: ship.id,
      killerId: killer?.id,
      classId: ship.classId,
      faction: ship.faction,
      side: ship.side,
      name: ship.name,
      pos: clone(ship.pos),
      role: ship.role,
      cause,
      weaponId,
    });
    // A flagship's death (AP §22.2): exactly one `flagship_destroyed` right after its `ship_destroyed`, naming the killer
    // and the weapon that fired the killing round. The narrative text is drawn from a fork of `sim.rng` taken at this
    // moment (deterministic, in step order) so the banner never changes what happens next in the battle.
    if (ship.flagship) {
      const weapon = killer && weaponId ? killer.weapons.find((w) => w.def.id === weaponId)?.def : undefined;
      const fe = flagshipDestroyedEvent(this.rng.fork(`flagship:${ship.id}`), this.time, ship, killer, cause, weapon);
      if (fe) this.emit(fe);
    }
    // A hull destroyed on its way in leaves the arrival bookkeeping (its wave still reports `fleet_arrived`).
    if (ship.arrival) this.endArrival(ship);
    const fleet = this.fleets.get(ship.fleetId);
    const enemySide: Side = ship.side === 'A' ? 'B' : 'A';
    const isCapital = isCapitalRole(ship.role);
    if (ship.role !== 'fighter') {
      if (isCapital) {
        this.comms(ship.side, 'capital_lost', ship.name, fleet);
        this.comms(enemySide, 'enemy_capital_lost', ship.name);
      } else if (this.rng.chance(0.35)) {
        this.comms(ship.side, 'ally_lost', ship.name, fleet);
        if (this.rng.chance(0.4)) this.comms(enemySide, 'enemy_destroyed', ship.name);
      }
    }
    // Reaper command vulnerability (AU rule): losing a capital Reaper degrades coordination.
    if (ship.role === 'reaper_capital' && this.rules.special.reaperCommandVulnerability) {
      for (const f of this.fleets.values()) if (f.spec.faction === 'reaper') f.coordinationPenalty = Math.min(1, f.coordinationPenalty + 0.6);
    }
    // Heavy losses announcement.
    const sidePoints = this.sidePoints(ship.side);
    if (!this.heavyLossesAnnounced.has(ship.side) && sidePoints.remaining < sidePoints.start * 0.5) {
      this.heavyLossesAnnounced.add(ship.side);
      this.comms(ship.side, 'heavy_losses', undefined, fleet);
    }
  }

  private sidePoints(side: Side): { start: number; remaining: number } {
    let start = 0;
    let remaining = 0;
    for (const f of this.fleets.values()) if (f.spec.side === side) start += f.startPoints;
    for (const s of this.ships) if (s.side === side && s.alive && !s.escaped && s.role !== 'fighter') remaining += s.pointValue;
    return { start, remaining };
  }

  /**
   * Whether a side still has forces to come (AP §6, the `checkEnd` guard): an undeployed `arrivalTime` fleet, or an
   * undeployed `arrivalMode: 'beat'` fleet that a `spawn_wave` beat still in the queue will deploy. Hulls waiting for
   * their arrival flash are alive and count through the ship scan.
   */
  private forcesPending(side: Side): boolean {
    return this.pendingFleets.some((f) => f.side === side) || waveSpawnPending(this, side);
  }

  private checkEnd(): void {
    const a = this.sidePoints('A');
    const b = this.sidePoints('B');
    // A side whose fleets are still to arrive is not beaten yet; the points of an undeployed fleet enter the
    // attrition maths only when it deploys (`startPoints` are summed over deployed fleets).
    const aAlive = this.ships.some((s) => s.side === 'A' && s.alive && !s.escaped && s.role !== 'fighter') || this.forcesPending('A');
    const bAlive = this.ships.some((s) => s.side === 'B' && s.alive && !s.escaped && s.role !== 'fighter') || this.forcesPending('B');
    if (!aAlive && !bAlive) return this.end('draw', 'Mutual annihilation');
    if (!aAlive) return this.end('B', a.remaining === 0 ? 'Side A fleet destroyed' : 'Side A fleet withdrew from the battlespace');
    if (!bAlive) return this.end('A', b.remaining === 0 ? 'Side B fleet destroyed' : 'Side B fleet withdrew from the battlespace');

    // Nobody runs: there is no fleet-wide auto-retreat and nobody escapes; a side fights until it is destroyed,
    // combat-ineffective (below 5 % of its starting points with no capital hull left) or the clock runs out.
    const ineffective = (side: Side, p: { start: number; remaining: number }): boolean =>
      p.start > 0 &&
      p.remaining < WITHDRAWAL.combatIneffectiveFraction * p.start &&
      !this.forcesPending(side) &&
      !this.ships.some((s) => s.side === side && s.alive && !s.escaped && isCapitalRole(s.role));
    const ia = ineffective('A', a);
    const ib = ineffective('B', b);
    if (ia && ib) return this.end('draw', 'Both sides combat-ineffective');
    if (ia) return this.end('B', 'Side A combat-ineffective: below 5 % of its starting strength with no capital ship left');
    if (ib) return this.end('A', 'Side B combat-ineffective: below 5 % of its starting strength with no capital ship left');

    if (this.time >= this.config.maxDuration) {
      const fa = a.remaining / Math.max(1, a.start);
      const fb = b.remaining / Math.max(1, b.start);
      if (Math.abs(fa - fb) < 0.08) return this.end('draw', 'Time limit: forces remain evenly matched');
      return this.end(fa > fb ? 'A' : 'B', 'Time limit: attrition judgement');
    }
  }

  private end(winner: Side | 'draw', reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.emit({ t: this.time, type: 'battle_end', winner, reason });
    if (winner !== 'draw') {
      this.comms(winner, 'victory');
      this.comms(winner === 'A' ? 'B' : 'A', 'defeat');
      this.emit({ t: this.time, type: 'objective_completed', side: winner, text: `${this.config.objective}` });
    }
    this.result = summarise(this);
  }

  // ------------------------------------------------------------------ comms

  private comms(side: Side | undefined, kind: CommsEvent, shipName?: string, fleet?: FleetState): void {
    const fleets = [...this.fleets.values()].filter((f) => (side ? f.spec.side === side : true) && (!fleet || f === fleet));
    const seenFactions = new Set<FactionId>();
    for (const f of fleets) {
      if (seenFactions.has(f.spec.faction)) continue;
      seenFactions.add(f.spec.faction);
      if (kind !== 'battle_start' && kind !== 'victory' && kind !== 'defeat' && f.commsCooldown > 0) continue;
      const lines = FACTIONS[f.spec.faction].comms[kind];
      if (!lines || lines.length === 0) continue;
      const text = this.rng.pick(lines).replace('{ship}', shipName ?? 'ship');
      f.commsCooldown = 4 + this.rng.next() * 4;
      this.emit({ t: this.time, type: 'comms', faction: f.spec.faction, side: f.spec.side, text });
    }
  }

  private emit(e: BattleEvent): void {
    this.events.push(e);
    this.onEvent?.(e);
  }
}

/**
 * Segment-sphere intersection. Returns parametric t in [0,1] of first contact
 * along the segment, or undefined.
 */
export function segmentSphere(a: Vec3, b: Vec3, c: Vec3, r: number): number | undefined {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  if (A < 1e-12) return lengthSq(f) <= r * r ? 0 : undefined;
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return undefined;
  disc = Math.sqrt(disc);
  const t1 = (-B - disc) / (2 * A);
  const t2 = (-B + disc) / (2 * A);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  if (t1 < 0 && t2 > 1) return 0;
  return undefined;
}

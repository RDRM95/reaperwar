import type { Rng } from '@/core/rng';
import type { FactionId } from '@/data/types';
import type { EffectiveWeapon } from '@/timelines/rules';
import { gridFilterPasses } from './spatial';
import type { BattleEvent, FleetState, HoldFire, ShipRef, ShipState, VolleyMounts, VolleyState, WeaponState } from './types';

export type { HoldFire, VolleyMounts, VolleyState } from './types';

/**
 * Fleet fire control (CINEMATIC_DESIGN.md §1.3; ADOPTION_PLAN.md §4.3; WORK_BREAKDOWN.md §1.3.6, T13): the two-phase
 * volley order (hold, then a release window), the standing `holdFire`, and the coordinated HADES salvo the owner asked
 * for (INTEGRATION_NOTES.md: Titan-armed hulls of one fleet synchronise their penetrators so they land as one
 * concentrated salvo). Every draw comes from `sim.rng` in step order. A volley is timing, not a damage bonus: each
 * volley mount holds until its release offset and fires once inside the window; a gun that is nearly ready — at most
 * the window's length of reload left — fires on the beat (CINEMATIC_DESIGN.md §1.3), which is what makes every mount
 * with a target in arc and range fire inside the window (a line held through the lead has reloaded anyway). Hit
 * probability, heat, ammunition and arcs are untouched; a mount with nothing in arc stays silent and is counted so.
 */

/** Release window per faction (s); an explicit `window` overrides it (AP §4.3: the Final Battle uses 1.5 for everyone). */
export const VOLLEY_WINDOW: Record<FactionId, number> = { alliance: 1.5, turian: 1.0, asari: 1.3, salarian: 1.2, geth: 0.8, quarian: 1.8, cerberus: 1.2, reaper: 2.0 };

/** Default lead between the order and the release (s): long enough for 2 s-cadence guns to be ready. */
export const VOLLEY_LEAD = 2.0;

/** The spinal class: anti-capital accelerators and Thanix lances with an arc of at most 25°. */
export const isSpinal = (def: EffectiveWeapon): boolean => def.antiCapital && def.arc <= 25 && (def.kind === 'mass_accelerator' || def.kind === 'thanix');

/** Whether a mount belongs to a mount class of a volley (or of a mount-level target order). */
export function volleyMount(w: WeaponState, mounts: VolleyMounts): boolean {
  const spinal = isSpinal(w.def);
  const beam = w.def.kind === 'reaper_beam';
  switch (mounts) {
    case 'spinal':
      return spinal;
    case 'beams':
      return beam;
    case 'spinal_and_beams':
      return spinal || beam;
    case 'all_anti_capital':
      return w.def.antiCapital;
    case 'broadside':
      return w.def.kind === 'mass_accelerator' && !w.def.antiSmall && !spinal;
  }
}

/** Whether a standing `holdFire` keeps this mount silent: spinal, beams, or every anti-ship mount ('all' — point defence always fires). */
export function heldBy(hold: HoldFire | undefined, w: WeaponState): boolean {
  switch (hold) {
    case 'spinal':
      return isSpinal(w.def);
    case 'beams':
      return w.def.kind === 'reaper_beam';
    case 'all':
      return !w.def.antiSmall;
    default:
      return false;
  }
}

export interface VolleyOptions {
  /** Release time = order time + lead (default 2.0 s). */
  lead?: number;
  /** Release window (s); default `VOLLEY_WINDOW[faction]`. */
  window?: number;
  /** Mount class (default 'spinal'). */
  mounts?: VolleyMounts;
  /** One forced focus for every ship of the volley, until `at + window + 1`. */
  targetId?: string;
  /** A target resolved for each ship of the volley (so the beams spread over the nearest line hulls, AP §4.3); overrides `targetId`. */
  targetRef?: ShipRef;
  /** An explicit target per ship id (a spread volley, `beats.ts`); overrides `targetRef` and `targetId` for the ships it names. */
  targets?: ReadonlyMap<string, string>;
  /** This ship's mounts get offset 0 (the camera is on its bow at `at`); an absent or dead anchor falls back to the largest capital. */
  anchorShipId?: string;
  /** Offsets subtract each round's flight time so the impacts, not the departures, cluster (min 0, max ≤ window). */
  syncArrival?: boolean;
}

/** Per-mount bookkeeping of a volley (the contract's `VolleyState` carries only the counters). */
interface VolleyBook {
  /** Mounts that fired inside the window. */
  fired: Set<string>;
  /** Mounts that had their shot ready before their release and held it. */
  held: Set<string>;
  /** Mounts whose release tick has passed (the reload is forgiven once, at release). */
  released: Set<string>;
}
const BOOKS = new WeakMap<VolleyState, VolleyBook>();

export const mountKey = (ship: ShipState, w: WeaponState): string => `${ship.id}:${w.index}`;

function bookOf(v: VolleyState): VolleyBook {
  let b = BOOKS.get(v);
  if (!b) BOOKS.set(v, (b = { fired: new Set(), held: new Set(), released: new Set() }));
  return b;
}

/** What `orderVolley` needs from the simulation. */
export interface VolleyHost {
  readonly time: number;
  readonly rng: Rng;
  readonly ships: readonly ShipState[];
  readonly fleets: Map<string, FleetState>;
  getShip(id: string): ShipState | undefined;
  emit(e: BattleEvent): void;
  /** Whether a hull is still waiting for its arrival flash. */
  pending(ship: ShipState): boolean;
  resolveShipRef(ref: ShipRef, from?: ShipState): ShipState | undefined;
}

const takesPart = (host: VolleyHost, s: ShipState): boolean => s.alive && !s.escaped && s.role !== 'fighter' && !s.stealth && !host.pending(s);

/**
 * The volley anchor: the named ship when it is alive and fires in the volley, else the largest live capital of the
 * ordered fleets that carries a volley mount — the first ordered fleet's faction first (so the Final Battle's
 * fallback is the largest Alliance capital, AP §4.3), then by length, points and deployment order.
 */
export function volleyAnchor(host: VolleyHost, fleets: readonly FleetState[], mounts: VolleyMounts, anchorShipId?: string): ShipState | undefined {
  const ids = new Set(fleets.map((f) => f.spec.id));
  const eligible = (s: ShipState): boolean => ids.has(s.fleetId) && takesPart(host, s) && s.weapons.some((w) => volleyMount(w, mounts));
  const named = anchorShipId ? host.getShip(anchorShipId) : undefined;
  if (named && eligible(named)) return named;
  const faction = fleets[0]?.spec.faction;
  let best: ShipState | undefined;
  const better = (a: ShipState, b: ShipState): boolean => {
    const fa = a.faction === faction ? 1 : 0;
    const fb = b.faction === faction ? 1 : 0;
    if (fa !== fb) return fa > fb;
    if (a.lengthKm !== b.lengthKm) return a.lengthKm > b.lengthKm;
    return a.pointValue > b.pointValue;
  };
  for (const s of host.ships) {
    if (!eligible(s) || !(s.role === 'dreadnought' || s.role === 'super_dreadnought' || s.role === 'reaper_capital' || s.role === 'carrier' || s.role === 'cruiser')) continue;
    if (!best || better(s, best)) best = s;
  }
  return best;
}

/** Seconds a round of this mount takes to reach `target` (0 for a beam). */
const flightTime = (ship: ShipState, w: WeaponState, target: ShipState | undefined): number => {
  if (!target || !Number.isFinite(w.def.projectileSpeed) || w.def.projectileSpeed <= 0) return 0;
  return Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z) / w.def.projectileSpeed;
};

/**
 * Orders a volley for each fleet (one entry point for the HUD, the beats and the scenes): release at `time + lead`,
 * per-mount offsets drawn from `rng` in ship-index order inside `[0, window − 0.1]` (the anchor's mounts at 0), the
 * fleet's standing hold set to the mount class until the window closes, an optional target, and
 * `fleet_volley_ordered`. A fleet with a volley still pending has it closed first. Returns the new volley states.
 */
export function orderVolley(host: VolleyHost, fleetIds: readonly string[], opts: VolleyOptions = {}): VolleyState[] {
  const fleets: FleetState[] = [];
  for (const id of fleetIds) {
    const f = host.fleets.get(id);
    if (f && !fleets.includes(f)) fleets.push(f);
  }
  const mounts = opts.mounts ?? 'spinal';
  const anchor = volleyAnchor(host, fleets, mounts, opts.anchorShipId);
  const out: VolleyState[] = [];
  for (const fleet of fleets) {
    if (fleet.volley) finishVolley(host, fleet);
    const lead = Math.max(0, opts.lead ?? VOLLEY_LEAD);
    const at = host.time + lead;
    const window = Math.max(0.1, opts.window ?? VOLLEY_WINDOW[fleet.spec.faction]);
    const until = at + window + 1;
    const offsets = new Map<string, number>();
    const flights = new Map<string, number>();
    for (const s of host.ships) {
      if (s.fleetId !== fleet.spec.id || !takesPart(host, s)) continue;
      // A per-ship target (resolved for this ship) or the volley's one target.
      let target: ShipState | undefined;
      const assigned = opts.targets?.get(s.id);
      if (assigned !== undefined) target = host.getShip(assigned);
      else if (opts.targetRef) target = host.resolveShipRef(opts.targetRef, s);
      else if (opts.targetId) target = host.getShip(opts.targetId);
      // Only a live, hostile hull can be a volley's target (a mis-aimed reference falls back to the hull's own choice).
      if (target && (!target.alive || target.escaped || !gridFilterPasses(s, target))) target = undefined;
      let any = false;
      for (const w of s.weapons) {
        if (!volleyMount(w, mounts)) continue;
        any = true;
        const key = mountKey(s, w);
        offsets.set(key, s === anchor ? 0 : host.rng.next() * Math.max(0, window - 0.1));
        if (opts.syncArrival) flights.set(key, flightTime(s, w, target ?? (s.targetId ? host.getShip(s.targetId) : undefined)));
        if (target) {
          w.assignedTargetId = target.id;
          w.assignedUntil = until;
        }
      }
      if (any && target) {
        s.forcedTargetId = target.id;
        s.forcedTargetUntil = until;
        s.targetId = target.id;
      }
    }
    if (opts.syncArrival && offsets.size > 0) {
      // Impacts, not departures, cluster: earlier release for the longer flight, shifted so the earliest is 0.
      let min = Infinity;
      for (const [k, o] of offsets) {
        const v = o - (flights.get(k) ?? 0);
        offsets.set(k, v);
        if (v < min) min = v;
      }
      for (const [k, o] of offsets) offsets.set(k, Math.min(window - 0.1, Math.max(0, o - min)));
    }
    const focus = opts.targetId && !opts.targetRef && !opts.targets ? host.getShip(opts.targetId) : undefined;
    if (focus && focus.alive && (focus.side !== fleet.spec.side || focus.rogue !== (fleet.spec.rogue ?? false))) fleet.focusTargetId = focus.id;
    const v: VolleyState = { at, window, mounts, targetId: opts.targetRef || opts.targets ? undefined : opts.targetId, syncArrival: opts.syncArrival ?? false, offsets, fired: 0, held: 0, silent: 0 };
    // The standing hold shows the class the volley holds (HUD: HOLDING FIRE); the volley gate itself holds the mounts.
    // A standing hold of every anti-ship mount ('all') stays until the window closes, so nothing but the volley speaks
    // first (the Final Battle's opening, AP §20: the volley, then the first losses).
    if ((mounts === 'spinal' || mounts === 'beams') && fleet.orders.holdFire !== 'all') fleet.orders.holdFire = mounts;
    fleet.volley = v;
    host.emit({ t: host.time, type: 'fleet_volley_ordered', fleetId: fleet.spec.id, at, window, mounts, mountsOrdered: offsets.size, ...(anchor ? { anchorShipId: anchor.id } : {}) });
    out.push(v);
  }
  return out;
}

/** End of a volley's window: the first tick at or after `at + window + SIM_DT` (the release window includes its last tick). */
export const volleyEnd = (v: VolleyState, dt: number): number => v.at + v.window + dt;

/** Closes a fleet's volley: `fleet_volley_fired { fired, held, silent }`, the standing hold back to 'none'. */
export function finishVolley(host: Pick<VolleyHost, 'time' | 'emit'>, fleet: FleetState): void {
  const v = fleet.volley;
  if (!v) return;
  const book = bookOf(v);
  v.fired = book.fired.size;
  v.held = book.held.size;
  v.silent = Math.max(0, v.offsets.size - book.fired.size);
  host.emit({ t: host.time, type: 'fleet_volley_fired', fleetId: fleet.spec.id, fired: v.fired, held: v.held, silent: v.silent });
  fleet.volley = undefined;
  fleet.orders.holdFire = 'none';
}

/** What a volley mount does this tick. */
export type VolleyStep = 'hold' | 'release' | 'window' | 'fired' | 'free';

/**
 * The per-mount phase of a fleet's volley at `time`: `hold` before the mount's release, `release` on its first tick in
 * the window (the caller forgives the reload once), `window` while it may still fire, `fired` once it has fired in this
 * volley, `free` for a mount that is not part of the volley. `ready` says whether the mount had a shot ready while held
 * (counted once as "held").
 */
export function volleyStep(v: VolleyState, ship: ShipState, w: WeaponState, time: number, ready: boolean): VolleyStep {
  const key = mountKey(ship, w);
  const offset = v.offsets.get(key);
  if (offset === undefined) return 'free';
  const book = bookOf(v);
  if (book.fired.has(key)) return 'fired';
  if (time < v.at + offset - 1e-9) {
    if (ready) book.held.add(key);
    return 'hold';
  }
  if (!book.released.has(key)) {
    book.released.add(key);
    return 'release';
  }
  return 'window';
}

/** Records that a volley mount fired inside the window. */
export function noteVolleyShot(v: VolleyState, ship: ShipState, w: WeaponState): void {
  bookOf(v).fired.add(mountKey(ship, w));
}

// ------------------------------------------------------------ HADES salvo

/**
 * Coordinated HADES batteries (owner requirement, INTEGRATION_NOTES.md: Titan-armed hulls of one fleet synchronise
 * their salvos so the penetrations land as one concentrated salvo; SIMULATION_ESTIMATE, AU with the Titan gun). When a
 * Titan mount is ready to send a penetrator at a Reaper capital through the gate, it does not fire alone: it opens a
 * salvo for its fleet. The members are every Titan mount of the fleet that still carries penetrators, has that capital
 * within range and **finishes its reload within `gather` seconds** — the opener included. Each is assigned the capital
 * and released at a seeded time inside the salvo window, which opens once the slowest member has reloaded. The salvo is
 * pure timing: a ready gun waits for the others, nothing is ever reloaded early, so it adds no firepower — it only
 * groups the rounds. A member fires a penetrator if the gate is still open at its release, a slug otherwise. Members
 * that fired together reload together, so the next salvo gathers the same battery without waiting. A Titan mount that
 * becomes ready while a salvo on the same capital is open fires at once, inside it. With no other mount to wait for,
 * the opener fires alone. `strike_scheduled { kind: 'hades' }` marks each member's release for the effects (the grouped
 * bow glow, flashes and stacked audio).
 */
export const HADES_SALVO = { window: 1.5, gather: 3 } as const;

export interface HadesSalvo {
  targetId: string;
  /** The salvo closes (members that have not fired go back to free fire) at this time. */
  until: number;
  /** Member mount → release time. */
  release: Map<string, number>;
  fired: Set<string>;
}
const SALVOS = new WeakMap<FleetState, HadesSalvo>();

/** The fleet's open HADES salvo, if any (closed salvos are dropped). */
export function hadesSalvoOf(fleet: FleetState, time: number): HadesSalvo | undefined {
  const s = SALVOS.get(fleet);
  if (s && time > s.until + 1e-9) {
    SALVOS.delete(fleet);
    return undefined;
  }
  return s;
}

/** Seconds of reload a mount has left at its hull's current weapon factor (`updateWeapons` runs the cooldown at `dt × wpnFactor`). */
const reloadSeconds = (ship: ShipState, w: WeaponState): number => Math.max(0, w.cooldown) / (0.4 + 0.6 * ship.subsystems.weapons);

/**
 * Opens a HADES salvo on `target` for `opener`'s fleet (no-op when the fleet already has one open). Members, in
 * ship-index order: the fleet's live Titan mounts with penetrators left, the target within range and a reload that
 * ends within `gather` (the opener included). With fewer than two members there is nothing to synchronise and no
 * salvo opens (undefined: the opener fires alone). Otherwise the window opens when the slowest member has reloaded and
 * each release is drawn from `rng` inside `[open, open + window − 0.1]`.
 */
export function openHadesSalvo(host: Pick<VolleyHost, 'time' | 'rng' | 'ships' | 'emit' | 'pending'>, fleet: FleetState, opener: ShipState, openerMount: WeaponState, target: ShipState): HadesSalvo | undefined {
  if (hadesSalvoOf(fleet, host.time)) return undefined;
  const members: { ship: ShipState; w: WeaponState; reload: number }[] = [];
  for (const s of host.ships) {
    if (s.fleetId !== fleet.spec.id || !takesPart(host as VolleyHost, s)) continue;
    const d = Math.hypot(target.pos.x - s.pos.x, target.pos.y - s.pos.y, target.pos.z - s.pos.z);
    for (const w of s.weapons) {
      if (!w.def.hadesRound || (w.specialAmmo ?? 0) <= 0 || d > w.def.range) continue;
      const reload = s === opener && w === openerMount ? 0 : reloadSeconds(s, w);
      if (reload > HADES_SALVO.gather) continue;
      members.push({ ship: s, w, reload });
    }
  }
  if (members.length < 2) return undefined;
  const open = host.time + Math.max(...members.map((m) => m.reload));
  const span = HADES_SALVO.window - 0.1;
  const salvo: HadesSalvo = { targetId: target.id, until: open + HADES_SALVO.window, release: new Map(), fired: new Set() };
  for (const m of members) {
    const at = open + host.rng.next() * span;
    salvo.release.set(mountKey(m.ship, m.w), at);
    m.w.assignedTargetId = target.id;
    m.w.assignedUntil = salvo.until;
    host.emit({ t: host.time, type: 'strike_scheduled', shipId: m.ship.id, weaponId: m.w.def.id, at, kind: 'hades' });
  }
  SALVOS.set(fleet, salvo);
  return salvo;
}

/** A salvo member's phase: `hold` before its release, `due` from its release until it fires, `free` for a non-member or once it has fired. */
export function salvoStep(salvo: HadesSalvo | undefined, ship: ShipState, w: WeaponState, time: number): 'hold' | 'due' | 'free' {
  if (!salvo) return 'free';
  const key = mountKey(ship, w);
  const at = salvo.release.get(key);
  if (at === undefined || salvo.fired.has(key)) return 'free';
  return time < at - 1e-9 ? 'hold' : 'due';
}

export function noteSalvoShot(salvo: HadesSalvo, ship: ShipState, w: WeaponState): void {
  salvo.fired.add(mountKey(ship, w));
}

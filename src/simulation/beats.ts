import { FACTIONS } from '@/data/factions';
import { isCapitalRole, type FactionId, type ShipRole } from '@/data/types';
import { DEFAULT_ARRIVAL_STAGGER } from './arrival';
import type { BattleSimulation } from './battle';
import { SIM_DT } from './constants';
import { FORCE_TARGET_SECONDS } from './specials';
import { gridFilterPasses } from './spatial';
import { silentHull } from './stealth';
import { volleyMount } from './volley';
import type { Beat, BeatEvent, BeatScript, FleetOrders, FleetSel, FleetSpec, FleetState, ShipRef, ShipState, Side, SpecialTrigger, VolleyMounts } from './types';

export type { ArrivalProfile, Beat, BeatEvent, BeatScript, CaptionStyle, FleetSel, ShipRef, SpecialTrigger, VolleyMounts } from './types';

/**
 * The beat scheduler (CINEMATIC_DESIGN.md §1.1–§1.2; ADOPTION_PLAN.md §4.3; WORK_BREAKDOWN.md §1.3.6, T13). A beat
 * script is plain data on `BattleConfig`; the simulation sorts it once (`scheduleBeats`) and fires each beat on its
 * tick, after the reinforcements and before the fleet decisions, so a wave spawned and an order issued at the same
 * beat act in the same tick. References: `anchor` and `target` are **soft** — one that resolves to nothing is
 * dropped and the beat still fires (`beat_fired.note`); only `ships` / `fleets` selectors that resolve to nothing
 * skip a beat (`beat_skipped`). Resolution is deterministic (ties broken by ship id).
 */

export interface ScheduledBeat {
  beat: Beat;
  /** `at × beatScale`, quantised to `SIM_DT`. */
  t: number;
  index: number;
}

/** A pace multiplier is clamped to the briefing's range (0.5–2.0); anything else means 1. */
export const clampBeatScale = (x: number | undefined): number => (x !== undefined && Number.isFinite(x) && x > 0 ? Math.min(2, Math.max(0.5, x)) : 1);

/** Sorts a script's beats by `at × beatScale` quantised to `SIM_DT`; equal times keep authoring order. */
export function scheduleBeats(script: BeatScript): ScheduledBeat[] {
  const scale = clampBeatScale(script.beatScale);
  return script.beats
    .map((beat, index) => ({ beat, index, t: Math.round((beat.at * scale) / SIM_DT) * SIM_DT }))
    .sort((a, b) => a.t - b.t || a.index - b.index);
}

/** Whether a beat belongs to a battle with this world state (`Beat.when`; no condition → always). */
export function beatApplies(beat: Beat, ws: Record<string, string> | undefined): boolean {
  if (!beat.when) return true;
  if (!ws) return false;
  return Object.entries(beat.when).every(([key, choices]) => ws[key] !== undefined && choices.includes(ws[key]));
}

/** The briefing's beat list: the beats this world state keeps, at their paced times (`ws.beat_scale`), in firing order. */
export function beatPreview(beats: Beat[], ws: Record<string, string>): { id: string; at: number; label: string }[] {
  const scale = clampBeatScale(ws.beat_scale !== undefined ? Number(ws.beat_scale) : undefined);
  return scheduleBeats({ version: 1, beats: beats.filter((b) => beatApplies(b, ws)), beatScale: scale, scripted: true }).map((s) => ({ id: s.beat.id, at: s.t, label: s.beat.label ?? s.beat.id }));
}

// ------------------------------------------------------------ references

/** What reference resolution reads from the simulation. */
export interface RefHost {
  readonly ships: readonly ShipState[];
  readonly fleets: Map<string, FleetState>;
  readonly config: { fleets: FleetSpec[] };
  getShip(id: string): ShipState | undefined;
  /** Whether a hull is still waiting for its arrival flash. */
  pending(ship: ShipState): boolean;
}

const present = (h: RefHost, s: ShipState | undefined): s is ShipState => s !== undefined && s.alive && !s.escaped && !h.pending(s);

/** Role filter of a query: `role` and `roles` both apply; small craft only when a filter names them. */
const roleOk = (s: ShipState, role?: ShipRole, roles?: ShipRole[]): boolean => {
  if (role !== undefined && s.role !== role) return false;
  if (roles !== undefined && !roles.includes(s.role)) return false;
  if (s.role === 'fighter' && role !== 'fighter' && !(roles ?? []).includes('fighter')) return false;
  return true;
};

/** The best candidate by `score` (higher wins), ties by ship id. */
function best(cands: Iterable<ShipState>, score: (s: ShipState) => number): ShipState | undefined {
  let out: ShipState | undefined;
  let top = -Infinity;
  for (const s of cands) {
    const v = score(s);
    if (v > top || (v === top && out !== undefined && s.id < out.id)) {
      top = v;
      out = s;
    }
  }
  return out;
}

/** Live, present candidates of a query (never a silent stealth hull: a script does not see what the sensors cannot). */
function* queryCands(h: RefHost, side: Side | undefined, role?: ShipRole, roles?: ShipRole[], faction?: FactionId): Generator<ShipState> {
  for (const s of h.ships) {
    if (!present(h, s) || silentHull(s)) continue;
    if (side !== undefined && s.side !== side) continue;
    if (faction !== undefined && s.faction !== faction) continue;
    if (!roleOk(s, role, roles)) continue;
    yield s;
  }
}

/**
 * Resolves a ship reference (deterministic; ties by id). `{ name }` and `{ id }` find that hull alive and present;
 * `{ fleetId, classId?, role?, nth }` is the nth match in deployment order *including dead hulls* (so "the third
 * cruiser" stays one hull) — without `nth`, the fleet's first live match; the queries pick among live, present hulls.
 * `nearest` measures from `to`, or — without `to` — from `from` (the ship the reference is resolved for: a volley
 * target is resolved per ship). Undefined when nothing qualifies.
 */
export function resolveShipRef(h: RefHost, ref: ShipRef, from?: ShipState): ShipState | undefined {
  if ('name' in ref) return best((function* () {
    for (const s of h.ships) if (s.name === ref.name && present(h, s)) yield s;
  })(), () => 0);
  if ('id' in ref) {
    const s = h.getShip(ref.id);
    return present(h, s) ? s : undefined;
  }
  if ('fleetId' in ref) {
    const matches = h.ships.filter((s) => s.fleetId === ref.fleetId && (ref.classId === undefined || s.classId === ref.classId) && (ref.role === undefined || s.role === ref.role));
    if (ref.nth === undefined) return matches.find((s) => present(h, s));
    const m = matches[Math.max(0, Math.floor(ref.nth))];
    return present(h, m) ? m : undefined;
  }
  switch (ref.query) {
    case 'top_damage_dealer':
      return best(queryCands(h, ref.side, undefined, ref.roles), (s) => s.stats.recentDamage);
    case 'most_valuable':
      return best(queryCands(h, ref.side, ref.role, ref.roles, ref.faction), (s) => s.pointValue);
    case 'weakest_barriers':
      return best(queryCands(h, ref.side, ref.role, ref.roles), (s) => -(s.maxBarriers > 0 ? s.barriers / s.maxBarriers : 0));
    case 'nearest': {
      const origin = ref.to ? resolveShipRef(h, ref.to, from) : from;
      if (!origin) return undefined;
      const o = origin.pos;
      return best(
        (function* () {
          for (const s of queryCands(h, ref.side, ref.role, ref.roles)) if (s !== origin) yield s;
        })(),
        (s) => -Math.hypot(s.pos.x - o.x, s.pos.y - o.y, s.pos.z - o.z),
      );
    }
  }
}

/** Faction order of the arrival waves (the beat table's order: Alliance, turian, asari, salarian, quarian, geth, Cerberus, …). */
const FACTION_ORDER: readonly FactionId[] = Object.keys(FACTIONS) as FactionId[];

/** The beat-arriving fleets of a side in wave order: by faction order, then authoring order. */
export function waveSpecs(h: Pick<RefHost, 'config'>, side: Side): FleetSpec[] {
  const list = h.config.fleets.filter((f) => f.side === side && f.arrivalMode === 'beat');
  return list
    .map((f, i) => ({ f, i, r: FACTION_ORDER.indexOf(f.faction) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
}

/** Resolves a fleet selector to deployed fleets (deployment order; `{ fleetIds }` in the order given). */
export function resolveFleetSel(h: RefHost, sel: FleetSel): FleetState[] {
  if (sel === 'all') return [...h.fleets.values()];
  if ('fleetIds' in sel) {
    const out: FleetState[] = [];
    for (const id of sel.fleetIds) {
      const f = h.fleets.get(id);
      if (f && !out.includes(f)) out.push(f);
    }
    return out;
  }
  if ('wave' in sel) {
    const spec = waveSpecs(h, sel.side)[Math.floor(sel.wave)];
    const f = spec ? h.fleets.get(spec.id) : undefined;
    return f ? [f] : [];
  }
  return [...h.fleets.values()].filter((f) => f.spec.side === sel.side);
}

/** The undeployed beat fleets a `spawn_wave` names (by id and/or selector). */
function spawnSpecs(sim: BattleSimulation, ev: Extract<BeatEvent, { kind: 'spawn_wave' }>): FleetSpec[] {
  const beatFleets = sim.config.fleets.filter((f) => f.arrivalMode === 'beat');
  const out: FleetSpec[] = [];
  const add = (f: FleetSpec | undefined): void => {
    if (f && !sim.fleets.has(f.id) && !out.includes(f)) out.push(f);
  };
  if (ev.fleetId !== undefined) add(beatFleets.find((f) => f.id === ev.fleetId));
  const sel = ev.fleets;
  if (sel !== undefined) {
    if (sel === 'all') beatFleets.forEach(add);
    else if ('fleetIds' in sel) sel.fleetIds.forEach((id) => add(beatFleets.find((f) => f.id === id)));
    else if ('wave' in sel) add(waveSpecs(sim, sel.side)[Math.floor(sel.wave)]);
    else beatFleets.filter((f) => f.side === sel.side).forEach(add);
  }
  return out;
}

/**
 * Whether a `spawn_wave` beat still in the queue will deploy an undeployed beat fleet of `side` — the `checkEnd` guard
 * (ADOPTION_PLAN.md §6): a side whose fleets arrive by beat is not beaten before its waves come in.
 */
export function waveSpawnPending(sim: BattleSimulation, side: Side): boolean {
  for (const sb of sim.beatQueue) {
    const ev = sb.beat.event;
    if (ev.kind === 'spawn_wave' && spawnSpecs(sim, ev).some((f) => f.side === side)) return true;
  }
  return false;
}

/** A spread's weight: a hull already chosen by n ships counts as `1 + SPREAD_LOAD × n` times as far… */
export const SPREAD_LOAD = 0.5;
/** …and a hull whose class (capital-class or not) n ships already chose as `1 + SPREAD_CLASS_LOAD × n` times as far. */
export const SPREAD_CLASS_LOAD = 0.15;
/** Candidates within this × the shooter's reach (its longest mount of the class) come first; none within reach, all count. */
export const SPREAD_REACH = 1.1;

/**
 * A spread's per-ship targets (AP §4.3: "resolved per mount, so the beams spread over the nearest line hulls"; the mark,
 * "barriers ripple in a wall"): in ship order, each shooter takes, among the hulls its `nearest` query qualifies (side,
 * role filters; present, visible, hostile) — those within its reach first —, the one that minimises distance × (1 +
 * SPREAD_LOAD × the shooters that already chose that hull) × (1 + SPREAD_CLASS_LOAD × the shooters that already chose
 * its class), so the fire spreads over the nearest hulls and over the classes the query names (the answer's cruisers
 * and the dreadnoughts behind them). Deterministic (ties by ship id). Any other reference resolves per ship as before.
 */
export function spreadTargets(sim: BattleSimulation, shooters: readonly ShipState[], ref: ShipRef, mounts?: VolleyMounts): Map<string, string> {
  const out = new Map<string, string>();
  const load = new Map<string, number>();
  const classLoad = new Map<boolean, number>();
  const host: RefHost = { ships: sim.ships, fleets: sim.fleets, config: sim.config, getShip: (id) => sim.getShip(id), pending: (x) => sim.isPending(x) };
  const nearest = 'query' in ref && ref.query === 'nearest' && ref.to === undefined ? ref : undefined;
  const cands = nearest ? [...queryCands(host, nearest.side, nearest.role, nearest.roles)] : [];
  for (const s of shooters) {
    let t: ShipState | undefined;
    if (nearest) {
      let reach = 0;
      for (const w of s.weapons) if ((mounts ? volleyMount(w, mounts) : !w.def.antiSmall) && w.def.range > reach) reach = w.def.range;
      const pick = (inReach: boolean): ShipState | undefined => {
        let found: ShipState | undefined;
        let bestScore = Infinity;
        for (const c of cands) {
          if (c === s || !gridFilterPasses(s, c)) continue;
          const d = Math.hypot(c.pos.x - s.pos.x, c.pos.y - s.pos.y, c.pos.z - s.pos.z);
          if (inReach && d > reach * SPREAD_REACH) continue;
          const score = d * (1 + SPREAD_LOAD * (load.get(c.id) ?? 0)) * (1 + SPREAD_CLASS_LOAD * (classLoad.get(isCapitalRole(c.role)) ?? 0));
          if (score < bestScore || (score === bestScore && found !== undefined && c.id < found.id)) {
            bestScore = score;
            found = c;
          }
        }
        return found;
      };
      t = pick(true) ?? pick(false);
    } else t = sim.resolveShipRef(ref, s);
    if (!t) continue;
    out.set(s.id, t.id);
    load.set(t.id, (load.get(t.id) ?? 0) + 1);
    const cls = isCapitalRole(t.role);
    classLoad.set(cls, (classLoad.get(cls) ?? 0) + 1);
  }
  return out;
}

/** The fleet's representative for references resolved per fleet: its largest live, present hull. */
const representative = (sim: BattleSimulation, fleet: FleetState): ShipState | undefined =>
  best(
    sim.membersOf(fleet.spec.id).filter((s) => s.role !== 'fighter'),
    (s) => s.lengthKm * 1e6 + s.pointValue,
  );

// ------------------------------------------------------------ application

interface BeatOutcome {
  outcome: 'fired' | 'skipped';
  note?: string;
}
const FIRED: BeatOutcome = { outcome: 'fired' };
const SKIPPED: BeatOutcome = { outcome: 'skipped' };
const joinNotes = (a: string | undefined, b: string): string => (a ? `${a}, ${b}` : b);

/**
 * Applies one beat to the simulation and logs `beat_fired` (with `note` when a soft reference was dropped) or
 * `beat_skipped`. Never throws for a missing fleet or ship.
 */
export function applyBeat(sim: BattleSimulation, beat: Beat): 'fired' | 'skipped' {
  const r = runBeat(sim, beat);
  sim.kernel.emit({
    t: sim.time,
    type: r.outcome === 'fired' ? 'beat_fired' : 'beat_skipped',
    beatId: beat.id,
    kind: beat.event.kind,
    ...(beat.label !== undefined ? { label: beat.label } : {}),
    ...(r.note !== undefined ? { note: r.note } : {}),
  });
  return r.outcome;
}

function runBeat(sim: BattleSimulation, beat: Beat): BeatOutcome {
  const ev = beat.event;
  const scale = sim.beatScale;
  switch (ev.kind) {
    case 'spawn_wave': {
      const specs = spawnSpecs(sim, ev);
      if (specs.length === 0) return SKIPPED;
      for (const spec of specs) sim.kernel.spawnBeatFleet(spec, { stagger: ev.stagger ?? DEFAULT_ARRIVAL_STAGGER, run: ev.run });
      return FIRED;
    }
    case 'set_fleet_order': {
      const fleets = sim.resolveFleetSel(ev.fleets);
      if (fleets.length === 0) return SKIPPED;
      let note: string | undefined;
      for (const f of fleets) {
        const patch: Partial<FleetOrders> = { ...ev.patch };
        if (patch.targetRef) {
          const t = sim.resolveShipRef(patch.targetRef, representative(sim, f));
          delete patch.targetRef;
          if (t) patch.targetId = t.id;
          else {
            note = 'target unresolved';
            delete patch.targetId;
            if (patch.order === 'attack_target') delete patch.order;
          }
        }
        if (Object.keys(patch).length > 0) sim.kernel.applyOrders(f.spec.id, patch, 'beat');
      }
      return { outcome: 'fired', note };
    }
    case 'fleet_volley': {
      const fleets = sim.resolveFleetSel(ev.fleets);
      if (fleets.length === 0) return SKIPPED;
      let note: string | undefined;
      let anchorShipId: string | undefined;
      if (ev.anchor) {
        const a = sim.resolveShipRef(ev.anchor);
        if (a) anchorShipId = a.id;
        else note = joinNotes(note, 'anchor unresolved');
      }
      let targetRef: ShipRef | undefined;
      if (ev.target) {
        const target = ev.target;
        const any = fleets.some((f) => sim.membersOf(f.spec.id).some((s) => s.role !== 'fighter' && sim.resolveShipRef(target, s) !== undefined));
        if (any) targetRef = target;
        else note = joinNotes(note, 'target unresolved');
      }
      // Strict references (`requireAlive: true`): an unresolved anchor or target skips the beat instead.
      if (note !== undefined && beat.requireAlive === true) return SKIPPED;
      const mounts = ev.mounts ?? 'spinal';
      const shooters = targetRef && ev.spread ? fleets.flatMap((f) => sim.membersOf(f.spec.id).filter((s) => s.role !== 'fighter' && !s.stealth && s.weapons.some((w) => volleyMount(w, mounts)))) : [];
      const targets = targetRef && ev.spread ? spreadTargets(sim, shooters, targetRef, mounts) : undefined;
      sim.orderVolley(
        fleets.map((f) => f.spec.id),
        { lead: ev.lead, window: ev.window, mounts: ev.mounts, targetRef, targets, anchorShipId, syncArrival: ev.syncArrival },
      );
      return { outcome: 'fired', note };
    }
    case 'force_target': {
      if (ev.ships === undefined && ev.fleets === undefined) return SKIPPED;
      const ships: ShipState[] = [];
      for (const ref of ev.ships ?? []) {
        const s = sim.resolveShipRef(ref);
        if (s && !ships.includes(s)) ships.push(s);
      }
      const fleets = ev.fleets !== undefined ? sim.resolveFleetSel(ev.fleets) : [];
      // A fleet-wide mark leaves stealth hunters to their doctrine (they hold no line station and fire in no volley,
      // brief §15.2); a scripted reference that names one (`ships`) still forces it.
      for (const f of fleets) for (const s of sim.membersOf(f.spec.id)) if (s.role !== 'fighter' && !s.stealth && !ships.includes(s)) ships.push(s);
      if (ships.length === 0) return SKIPPED;
      const seconds = (ev.seconds ?? FORCE_TARGET_SECONDS) * scale;
      // Strict references (`requireAlive: true`): a target that resolves for none of the ships skips the beat.
      if (beat.requireAlive === true && !ships.some((s) => { const t = sim.resolveShipRef(ev.target, s); return t !== undefined && t !== s && gridFilterPasses(s, t); })) return SKIPPED;
      let assigned = 0;
      // A spread mark distributes the ships over the hulls the reference qualifies; a per-fleet mark resolves the
      // reference once per fleet, from its largest hull, for every member (the Final Battle's mark, AP §4.3).
      const pre = new Map<string, string>();
      if (ev.spread && !ev.mounts) for (const [k, v] of spreadTargets(sim, ships, ev.target)) pre.set(k, v);
      else if (ev.perFleet) {
        for (const f of fleets) {
          const rep = representative(sim, f);
          const t = rep ? sim.resolveShipRef(ev.target, rep) : undefined;
          if (t) for (const s of sim.membersOf(f.spec.id)) pre.set(s.id, t.id);
        }
      }
      for (const s of ships) {
        const assignedId = pre.get(s.id);
        const t = assignedId !== undefined ? sim.getShip(assignedId) : sim.resolveShipRef(ev.target, s);
        if (!t || t === s || !gridFilterPasses(s, t)) continue;
        assigned++;
        if (ev.mounts) {
          // Mount-level: only the named class of mounts takes the target; the ship's own target (and the others) stay.
          for (const w of s.weapons) {
            if (!volleyMount(w, ev.mounts)) continue;
            w.assignedTargetId = t.id;
            w.assignedUntil = sim.time + seconds;
          }
          if (ev.forceNextShot) {
            const w = s.weapons.filter((m) => volleyMount(m, ev.mounts!)).sort((a, b) => b.def.damage - a.def.damage || a.index - b.index)[0];
            if (w) {
              w.cooldown = 0;
              w.forcedShot = { targetId: t.id, hit: true, penetrate: ev.forceNextShot === 'hit_penetrating', expiresAt: sim.time + 6 };
            }
          }
        } else sim.special.forceTarget([s.id], t.id, ev.forceNextShot, seconds);
      }
      // The fleets' focus follows their representative's target (the mark of AP §4.3: every mount tracks it).
      if (!ev.mounts) {
        for (const f of fleets) {
          const rep = representative(sim, f);
          const t = rep ? sim.resolveShipRef(ev.target, rep) : undefined;
          if (t && rep && gridFilterPasses(rep, t)) f.focusTargetId = t.id;
        }
      }
      return assigned > 0 ? FIRED : { outcome: 'fired', note: 'target unresolved' };
    }
    case 'launch_drones': {
      if (ev.fleets === undefined && ev.ships === undefined) return SKIPPED;
      const fleetIds = ev.fleets !== undefined ? sim.resolveFleetSel(ev.fleets).map((f) => f.spec.id) : [];
      const ships = (ev.ships ?? []).map((r) => sim.resolveShipRef(r)).filter((s): s is ShipState => s !== undefined && s.hangar !== undefined);
      if (fleetIds.length === 0 && ships.length === 0) return SKIPPED;
      if (fleetIds.length > 0) sim.special.launchDrones(fleetIds, ev.burst);
      for (const s of ships) {
        const f = sim.fleets.get(s.fleetId);
        if (!f || !s.hangar) continue;
        f.orders.fightersDeployed = true;
        s.hangar.launchTimer = 0;
        if (ev.burst !== undefined && ev.burst > 0) s.hangar.burst = Math.floor(ev.burst);
      }
      return FIRED;
    }
    case 'trigger_special':
      return runSpecial(sim, ev.special, beat.id);
    case 'caption':
      sim.kernel.emit({ t: sim.time, type: 'caption', text: ev.text, duration: ev.duration * scale, style: ev.style, ...(ev.speaker !== undefined ? { speaker: ev.speaker } : {}), au: ev.au ?? false });
      return FIRED;
    case 'player_control':
      sim.playerLocked = ev.locked;
      return FIRED;
  }
}

function runSpecial(sim: BattleSimulation, sp: SpecialTrigger, beatId: string): BeatOutcome {
  const r = (ref: ShipRef, from?: ShipState): ShipState | undefined => sim.resolveShipRef(ref, from);
  const done = (x: 'applied' | 'skipped'): BeatOutcome => (x === 'applied' ? FIRED : SKIPPED);
  switch (sp.type) {
    case 'drive_attack': {
      const runner = r(sp.runner);
      const target = runner ? r(sp.target, runner) : undefined;
      if (!runner || !target) return SKIPPED;
      return done(sim.special.driveAttack(runner.id, target.id, { window: sp.window, force: sp.force, ignoreCorridor: sp.ignoreCorridor, beatId }));
    }
    case 'hades_strike': {
      const shooter = r(sp.shooter);
      const target = shooter ? r(sp.target, shooter) : undefined;
      if (!shooter || !target) return SKIPPED;
      return done(sim.special.hadesStrike(shooter.id, target.id, { rounds: sp.rounds, force: sp.force, outage: sp.outage, beatId }));
    }
    case 'nova_strike': {
      const shooter = r(sp.shooter);
      const target = shooter ? r(sp.target, shooter) : undefined;
      if (!shooter || !target) return SKIPPED;
      return done(sim.special.novaStrike(shooter.id, target.id, { withThanix: sp.withThanix, force: sp.force, beatId }));
    }
    case 'mission_kill': {
      const s = r(sp.ship);
      return s ? done(sim.special.missionKill(s.id, { weapons: sp.weapons, engines: sp.engines, beatId })) : SKIPPED;
    }
    case 'destroy': {
      const s = r(sp.ship);
      if (!s) return SKIPPED;
      const killer = sp.killer ? r(sp.killer, s) : undefined;
      return done(sim.special.destroy(s.id, { killerId: killer?.id, ifHullBelow: sp.ifHullBelow, cause: sp.cause, beatId }));
    }
    case 'set_hull_fraction': {
      const s = r(sp.ship);
      return s ? done(sim.special.setHullFraction(s.id, sp.fraction, { onlyLower: sp.onlyLower, beatId })) : SKIPPED;
    }
    case 'set_barrier_fraction': {
      const s = r(sp.ship);
      return s ? done(sim.special.setBarrierFraction(s.id, sp.fraction, { onlyLower: sp.onlyLower, beatId })) : SKIPPED;
    }
    case 'set_subsystem': {
      const s = r(sp.ship);
      return s ? done(sim.special.setSubsystem(s.id, sp.subsystem, sp.level, { beatId })) : SKIPPED;
    }
    case 'withdraw_ship': {
      const s = r(sp.ship);
      return s ? done(sim.special.withdrawShip(s.id, { beatId })) : SKIPPED;
    }
    case 'interpose': {
      const s = r(sp.ship);
      const p = s ? r(sp.protect, s) : undefined;
      if (!s || !p) return SKIPPED;
      // `against` is a soft reference: unresolved, the special picks the protectee's attacker itself.
      const a = sp.against ? r(sp.against, p) : undefined;
      const out = done(sim.special.interpose(s.id, p.id, { againstId: a?.id, seconds: sp.seconds !== undefined ? sp.seconds * sim.beatScale : undefined, beatId }));
      return sp.against && !a && out.outcome === 'fired' ? { outcome: 'fired', note: 'target unresolved' } : out;
    }
    case 'approach': {
      const s = r(sp.ship);
      const t = s ? r(sp.target, s) : undefined;
      if (!s || !t) return SKIPPED;
      return done(sim.special.approach(s.id, t.id, { km: sp.km, seconds: sp.seconds * sim.beatScale, passThrough: sp.passThrough, beatId }));
    }
    case 'strafe_through': {
      const s = r(sp.ship);
      const t = s ? r(sp.target, s) : undefined;
      if (!s || !t) return SKIPPED;
      return done(sim.special.strafeThrough(s.id, t.id, { seconds: sp.seconds * sim.beatScale, beatId }));
    }
  }
}

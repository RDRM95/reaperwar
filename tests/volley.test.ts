import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { SHIP_CLASS_LIST } from '@/data/ships';
import type { FactionId } from '@/data/types';
import { fleet } from '@/scenarios';
import { BattleSimulation, SIM_DT, mountWorldPosition } from '@/simulation/battle';
import { ARC_VERTICAL_REACH } from '@/simulation/constants';
import { solutionFor } from '@/simulation/solutions';
import { HADES_SALVO, VOLLEY_WINDOW, isSpinal, volleyMount } from '@/simulation/volley';
import type { BattleConfig, BattleEvent, Beat, BeatScript, FleetOrders, FleetSpec, ShipState, Side, WeaponState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/**
 * Fleet fire control (CINEMATIC_DESIGN.md §1.3; ADOPTION_PLAN.md §4.3; WORK_BREAKDOWN.md T13, §1.6.3
 * `tests/volley.test.ts`) and the owner's coordinated HADES salvos (INTEGRATION_NOTES.md). Every run is deterministic.
 */

const config = (fleets: FleetSpec[], rulesId: string, seed: number, beats?: BeatScript): BattleConfig => ({
  id: 'volley',
  name: 'Volley',
  scenarioId: 'custom',
  seed,
  rules: getPreset(rulesId),
  fleets,
  environment: 'deep_space',
  maxDuration: 600,
  perspectiveSide: 'A',
  objective: 'Test.',
  ...(beats ? { beats } : {}),
});
const script = (beats: Beat[], beatScale = 1): BeatScript => ({ version: 1, beats, beatScale, scripted: true });
const mute = (sim: BattleSimulation, side: Side): void => {
  for (const s of sim.ships) if (s.side === side) for (const w of s.weapons) w.cooldown = Infinity;
};
type Fired = Extract<BattleEvent, { type: 'weapon_fired' }>;
const fired = (sim: BattleSimulation): Fired[] => sim.events.filter((e): e is Fired => e.type === 'weapon_fired');

/** An Alliance line facing a muted Reaper line 11.2 km away (compressed): inside every Alliance spinal gun's reach. */
function lines(opts: { seed?: number; rulesId?: string; hold?: boolean; beats?: BeatScript; gap?: number } = {}): BattleSimulation {
  const rules = getPreset(opts.rulesId ?? 'canon_me3');
  const half = (opts.gap ?? 28) / 2;
  const order: Partial<FleetOrders> = { order: 'hold_formation', ...(opts.hold === false ? {} : { holdFire: 'spinal' as const }) };
  const a = fleet('a', 'alliance', rules, { counts: { alliance_dreadnought_k: 2, alliance_dreadnought: 2, alliance_cruiser: 4 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -half), mult: 1, initialOrder: order });
  const r = fleet('r', 'reaper', rules, { counts: { reaper_capital: 3, reaper_destroyer: 4 }, name: 'R', side: 'B', position: v3(0, 0, half), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
  const sim = new BattleSimulation(config([a, r], opts.rulesId ?? 'canon_me3', opts.seed ?? 1, opts.beats));
  mute(sim, 'B');
  return sim;
}

/** The simulation's arc and range test for a mount, from outside (`inArcScalar` + the mount-origin range check). */
function bears(ship: ShipState, w: WeaponState, t: ShipState): boolean {
  const o = mountWorldPosition(ship, w.index)!;
  if (Math.hypot(t.pos.x - o.x, t.pos.y - o.y, t.pos.z - o.z) > w.def.range) return false;
  if (w.def.arc >= 360) return true;
  const dx = t.pos.x - ship.pos.x;
  const dy = t.pos.y - ship.pos.y;
  const dz = t.pos.z - ship.pos.z;
  const flat = Math.hypot(dx, dz);
  if (Math.abs(dy) / Math.hypot(flat, dy) >= ARC_VERTICAL_REACH) return false;
  const yaw = Math.atan2(ship.heading.x, ship.heading.z) + w.facing;
  return (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / flat >= Math.cos(((w.def.arc / 2) * Math.PI) / 180 + 0.05);
}

describe('ordering a volley', () => {
  it('draws one offset per spinal mount inside [0, window − 0.1], the anchor at 0, identically in two simulations', () => {
    const run = (): BattleSimulation => {
      const sim = lines();
      sim.skipTo(4);
      sim.orderVolley(['a'], { anchorShipId: 'a-alliance_dreadnought_k-1' });
      return sim;
    };
    const x = run();
    const y = run();
    const v = x.fleets.get('a')!.volley!;
    expect([...v.offsets.entries()]).toEqual([...y.fleets.get('a')!.volley!.offsets.entries()]);
    expect(v.offsets.size).toBe(8);
    expect(v.window).toBe(VOLLEY_WINDOW.alliance);
    for (const [key, o] of v.offsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(v.window - 0.1 + 1e-12);
      if (key.startsWith('a-alliance_dreadnought_k-1:')) expect(o).toBe(0);
    }
    const ordered = x.events.find((e): e is Extract<BattleEvent, { type: 'fleet_volley_ordered' }> => e.type === 'fleet_volley_ordered')!;
    expect(ordered).toMatchObject({ fleetId: 'a', window: 1.5, mounts: 'spinal', mountsOrdered: 8, anchorShipId: 'a-alliance_dreadnought_k-1' });
    expect(ordered.at).toBeCloseTo(x.time + 2, 9);
  });

  it('an explicit window overrides VOLLEY_WINDOW for every faction', () => {
    const factions = Object.keys(VOLLEY_WINDOW) as FactionId[];
    const classOf = (f: FactionId): string => (SHIP_CLASS_LIST.find((c) => c.faction === f && c.role === 'cruiser') ?? SHIP_CLASS_LIST.find((c) => c.faction === f && c.role !== 'fighter'))!.id;
    const build = (): BattleSimulation => {
      const rules = getPreset('canon_me3');
      const fleets = factions.map((f, i) =>
        fleet(`f-${f}`, f, rules, { counts: { [classOf(f)]: 1 }, name: f, side: f === 'reaper' ? 'B' : 'A', position: v3(-60 + 20 * i, 0, f === 'reaper' ? 60 : -60), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } }),
      );
      return new BattleSimulation(config(fleets, 'canon_me3', 1));
    };
    const explicit = build();
    explicit.orderVolley(factions.map((f) => `f-${f}`), { window: 1.5 });
    const defaults = build();
    defaults.orderVolley(factions.map((f) => `f-${f}`));
    for (const f of factions) {
      const w1 = explicit.events.find((e) => e.type === 'fleet_volley_ordered' && e.fleetId === `f-${f}`);
      const w2 = defaults.events.find((e) => e.type === 'fleet_volley_ordered' && e.fleetId === `f-${f}`);
      expect(w1 && w1.type === 'fleet_volley_ordered' && w1.window).toBe(1.5);
      expect(w2 && w2.type === 'fleet_volley_ordered' && w2.window).toBe(VOLLEY_WINDOW[f]);
    }
  });

  it('a volley whose anchor is absent or dead anchors on the largest alive capital of the ordered side', () => {
    const sim = lines();
    sim.skipTo(1);
    sim.orderVolley(['a'], { anchorShipId: 'nope' });
    const first = sim.events.filter((e) => e.type === 'fleet_volley_ordered').at(-1)!;
    expect(first.type === 'fleet_volley_ordered' && first.anchorShipId).toBe('a-alliance_dreadnought_k-1');
    expect(sim.special.destroy('a-alliance_dreadnought_k-1')).toBe('applied');
    sim.orderVolley(['a'], { anchorShipId: 'a-alliance_dreadnought_k-1' });
    const second = sim.events.filter((e) => e.type === 'fleet_volley_ordered').at(-1)!;
    expect(second.type === 'fleet_volley_ordered' && second.anchorShipId).toBe('a-alliance_dreadnought_k-2');
    const v = sim.fleets.get('a')!.volley!;
    for (const [key, o] of v.offsets) if (key.startsWith('a-alliance_dreadnought_k-2:')) expect(o).toBe(0);
  });

  it('syncArrival offsets start at 0 and end within the window', () => {
    const sim = lines();
    sim.skipTo(4);
    sim.orderVolley(['a'], { syncArrival: true, window: 1.5 });
    const v = sim.fleets.get('a')!.volley!;
    const offsets = [...v.offsets.values()];
    expect(Math.min(...offsets)).toBe(0);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(v.window);
    expect(v.syncArrival).toBe(true);
  });
});

describe('hold and release', () => {
  it('no volley mount fires between the order and its release; each fires at most once inside the window', () => {
    const sim = lines({ hold: false });
    sim.skipTo(6);
    const t0 = sim.time;
    sim.orderVolley(['a'], { lead: 2 });
    const v = sim.fleets.get('a')!.volley!;
    const { at, window } = v;
    const offsets = new Map(v.offsets);
    sim.skipTo(at + window + 2);
    const spinalShots = fired(sim).filter((e) => e.t > t0 && offsets.has(`${e.shipId}:${e.weaponIndex}`));
    for (const e of spinalShots) {
      const release = at + offsets.get(`${e.shipId}:${e.weaponIndex}`)!;
      expect(e.t).toBeGreaterThanOrEqual(release - 1e-9);
    }
    const inWindow = spinalShots.filter((e) => e.t <= at + window + SIM_DT + 1e-9);
    const perMount = new Map<string, number>();
    for (const e of inWindow) perMount.set(`${e.shipId}:${e.weaponIndex}`, (perMount.get(`${e.shipId}:${e.weaponIndex}`) ?? 0) + 1);
    expect(Math.max(...perMount.values())).toBe(1);
    expect(inWindow.every((e) => e.volley === true)).toBe(true);
  });

  it('mounts held under holdFire keep tracking their marked target: solution rising throughout, ≥ 0.6 after 10 s, not a shot fired', () => {
    // A gap of 24 km nominal (9.6 compressed): the marked capitals sit at 0.5–0.6 of each hull's main range. The build
    // rate falls with the range fraction (solutions.ts), so at 0.7 of range ten seconds give q ≈ 0.60 and beyond less.
    const mark: Beat = { id: 'mark', at: 1, event: { kind: 'force_target', fleets: { fleetIds: ['a'] }, target: { query: 'nearest', to: { fleetId: 'a' }, side: 'B', roles: ['reaper_capital'] } } };
    const sim = lines({ beats: script([mark]), gap: 24 });
    sim.skipTo(1.05);
    const line = sim.ships.filter((s) => s.fleetId === 'a');
    const last = new Map(line.map((s) => [s.id, solutionFor(s, s.forcedTargetId!)]));
    while (sim.time < 11.05 - 1e-9) {
      sim.step();
      for (const s of line) {
        const q = solutionFor(s, s.forcedTargetId!);
        expect(q).toBeGreaterThanOrEqual(last.get(s.id)!);
        last.set(s.id, q);
      }
    }
    for (const s of line) {
      expect(s.forcedTargetId).toBeDefined();
      const t = sim.getShip(s.forcedTargetId!)!;
      expect(t.role).toBe('reaper_capital');
      expect(solutionFor(s, t.id)).toBeGreaterThanOrEqual(0.6);
    }
    expect(fired(sim).some((e) => e.shipId.startsWith('a-') && line.some((s) => s.id === e.shipId && isSpinal(s.weapons[e.weaponIndex].def)))).toBe(false);
  });

  it('after the window the volley is closed, the hold is lifted and the spinal guns keep firing', () => {
    const sim = lines();
    sim.skipTo(4);
    sim.orderVolley(['a'], { lead: 2 });
    const v = sim.fleets.get('a')!.volley!;
    sim.skipTo(v.at + v.window + 1);
    const f = sim.fleets.get('a')!;
    expect(f.volley).toBeUndefined();
    expect(f.orders.holdFire).toBe('none');
    const done = sim.events.find((e): e is Extract<BattleEvent, { type: 'fleet_volley_fired' }> => e.type === 'fleet_volley_fired')!;
    expect(done.fired + done.silent).toBe(8);
    expect(done.fired).toBeGreaterThan(0);
    const after = sim.time;
    sim.skipTo(after + 10);
    expect(fired(sim).some((e) => e.t > after && e.shipId.startsWith('a-') && isSpinal(sim.getShip(e.shipId)!.weapons[e.weaponIndex].def))).toBe(true);
  });

  it('a beams volley resolves its target per ship: every Reaper beam mount takes its own hull’s nearest line hull', () => {
    const rules = getPreset('canon_me3');
    const a = fleet('a', 'alliance', rules, { counts: { alliance_dreadnought: 2, alliance_cruiser: 4, alliance_frigate: 4 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -14), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', rules, { counts: { reaper_capital: 3 }, name: 'R', side: 'B', formation: 'line_abreast', position: v3(0, 0, 14), mult: 1, initialOrder: { order: 'hold_formation', holdFire: 'beams', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r], 'canon_me3', 2, script([{ id: 'answer', at: 3, event: { kind: 'fleet_volley', fleets: { fleetIds: ['r'] }, lead: 2, window: 2, mounts: 'beams', target: { query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought'] } } }])));
    mute(sim, 'A');
    sim.skipTo(3.05);
    for (const s of sim.ships.filter((x) => x.role === 'reaper_capital')) {
      const near = sim.resolveShipRef({ query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought'] }, s)!;
      for (const w of s.weapons.filter((m) => volleyMount(m, 'beams'))) expect(w.assignedTargetId).toBe(near.id);
      expect(s.targetId).toBe(near.id);
    }
    sim.skipTo(8);
    const done = sim.events.find((e): e is Extract<BattleEvent, { type: 'fleet_volley_fired' }> => e.type === 'fleet_volley_fired' && e.fleetId === 'r')!;
    expect(done.fired).toBeGreaterThanOrEqual(4);
    expect(fired(sim).filter((e) => e.volley && e.kind === 'reaper_beam').every((e) => sim.getShip(e.targetId)!.role !== 'frigate')).toBe(true);
  });
});

describe('the volley lands on the beat (beatScale 0.5 / 1 / 2, seeds 1–3, fixed fleets)', () => {
  const cases = [0.5, 1, 2].flatMap((scale) => [1, 2, 3].map((seed) => ({ scale, seed })));
  it.each(cases)('beatScale $scale, seed $seed: ≥ 85 % of the spinal mounts with a target in arc and range fire inside [at, at + window + SIM_DT]', ({ scale, seed }) => {
    const beats = script(
      [
        { id: 'mark', at: 2, event: { kind: 'force_target', fleets: { fleetIds: ['a'] }, target: { query: 'nearest', to: { fleetId: 'a' }, side: 'B', roles: ['reaper_capital'] } } },
        { id: 'volley', at: 12, event: { kind: 'fleet_volley', fleets: { side: 'A' }, lead: 2, window: 1.5, mounts: 'spinal', anchor: { name: 'SSV Kilimanjaro' } } },
      ],
      scale,
    );
    const sim = lines({ seed, beats });
    while (!sim.fleets.get('a')!.volley) sim.step();
    const v = sim.fleets.get('a')!.volley!;
    expect(v.at).toBeCloseTo(12 * scale + 2, 6);
    sim.skipTo(v.at);
    const enemies = sim.ships.filter((s) => s.side === 'B' && s.alive && s.role !== 'fighter');
    const eligible = new Set<string>();
    for (const s of sim.ships.filter((x) => x.fleetId === 'a' && x.alive)) {
      for (const w of s.weapons) if (isSpinal(w.def) && enemies.some((e) => bears(s, w, e))) eligible.add(`${s.id}:${w.index}`);
    }
    expect(eligible.size).toBeGreaterThanOrEqual(6);
    sim.skipTo(v.at + v.window + SIM_DT);
    const hit = new Set(fired(sim).filter((e) => e.volley && e.t >= v.at - 1e-9 && e.t <= v.at + v.window + SIM_DT + 1e-9).map((e) => `${e.shipId}:${e.weaponIndex}`));
    const share = [...eligible].filter((k) => hit.has(k)).length / eligible.size;
    expect(share).toBeGreaterThanOrEqual(0.85);
  });
});

describe('coordinated HADES salvos (owner requirement, INTEGRATION_NOTES.md)', () => {
  it('Titan batteries hold for each other and land their penetrators inside one window, without ever reloading early', () => {
    const apex = getPreset('prime_apex');
    const a = fleet('a', 'alliance', apex, { counts: { alliance_dreadnought: 4 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -14), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', apex, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 14), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r], 'prime_apex', 1));
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    mute(sim, 'B');
    // A degraded capital that stays degraded (the gate open throughout) and survives the test.
    cap.maxSpeed = 0;
    cap.maxHull *= 50;
    cap.hull = cap.maxHull;
    cap.barrierRegen = 0;
    expect(sim.special.setBarrierFraction(cap.id, 0.05)).toBe('applied');
    sim.skipTo(40);
    const titan = fired(sim).filter((e) => e.weaponId === 'apex_hyper_ma');
    const hades = titan.filter((e) => e.special);
    expect(hades.length).toBeGreaterThanOrEqual(16);
    // Every penetrator left inside a salvo.
    expect(hades.every((e) => e.salvo === true)).toBe(true);
    // Salvos: the strike_scheduled releases of one opening; every member fires inside [open, open + window + SIM_DT].
    const scheduled = sim.events.filter((e): e is Extract<BattleEvent, { type: 'strike_scheduled' }> => e.type === 'strike_scheduled' && e.kind === 'hades');
    const openings = new Map<number, typeof scheduled>();
    for (const e of scheduled) openings.set(e.t, [...(openings.get(e.t) ?? []), e]);
    expect(openings.size).toBeGreaterThanOrEqual(4);
    let full = 0;
    for (const group of openings.values()) {
      const open = Math.min(...group.map((e) => e.at));
      const shots = hades.filter((e) => e.t >= open - 1e-9 && e.t <= open + HADES_SALVO.window + SIM_DT + 1e-9);
      if (new Set(shots.map((e) => e.shipId)).size === 4) full++;
    }
    expect(full).toBeGreaterThanOrEqual(4);
    // Pure timing: no Titan mount ever fires again before its own reload is done.
    const byMount = new Map<string, number[]>();
    for (const e of titan) byMount.set(`${e.shipId}:${e.weaponIndex}`, [...(byMount.get(`${e.shipId}:${e.weaponIndex}`) ?? []), e.t]);
    const cooldown = sim.ships.find((s) => s.fleetId === 'a')!.weapons.find((w) => w.def.id === 'apex_hyper_ma')!.def.cooldown;
    for (const times of byMount.values()) for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(0.95 * cooldown - 1e-9);
  });
});

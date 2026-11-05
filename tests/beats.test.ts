import { describe, expect, it } from 'vitest';
import { v3, type Vec3 } from '@/core/vec3';
import { fleet } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { beatPreview, scheduleBeats } from '@/simulation/beats';
import { MOVEMENT } from '@/simulation/movement';
import { isSpinal, volleyMount } from '@/simulation/volley';
import type { BattleConfig, BattleEvent, Beat, BeatScript, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/**
 * The beat scheduler (CINEMATIC_DESIGN.md §1.1–§1.2; ADOPTION_PLAN.md §4.3; WORK_BREAKDOWN.md T13, §1.6.3
 * `tests/beats.test.ts`): scheduling, soft references, selectors, captions, waves, orders, the player lock and replay.
 */

const canon = getPreset('canon_me3');
const script = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({ version: 1, beats, beatScale: 1, scripted: true, ...extra });
const config = (fleets: FleetSpec[], beats?: BeatScript, seed = 2): BattleConfig => ({
  id: 'beats',
  name: 'Beats',
  scenarioId: 'custom',
  seed,
  rules: canon,
  fleets,
  environment: 'deep_space',
  maxDuration: 600,
  perspectiveSide: 'A',
  objective: 'Test.',
  ...(beats ? { beats } : {}),
});
const caption = (id: string, at: number): Beat => ({ id, at, event: { kind: 'caption', text: id, duration: 2, style: 'tag' } });
const ofType = <T extends BattleEvent['type']>(sim: BattleSimulation, type: T) => sim.events.filter((e): e is BattleEvent & { type: T } => e.type === type);
const muteAll = (ships: readonly ShipState[]): void => {
  for (const s of ships) for (const w of s.weapons) w.cooldown = Infinity;
};
const twoLines = (): FleetSpec[] => [
  fleet('a', 'alliance', canon, { counts: { alliance_dreadnought_k: 2, alliance_cruiser: 2 }, name: 'A', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } }),
  fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 2 }, name: 'R', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } }),
];

describe('scheduleBeats', () => {
  it('sorts by at × beatScale quantised to SIM_DT, keeps authoring order on ties, and beatScale 2 moves at 36 to tick 1440', () => {
    const beats = [caption('late', 36), caption('first', 0.5), caption('tie1', 12), caption('tie2', 12), caption('odd', 1.02)];
    const s1 = scheduleBeats(script(beats));
    expect(s1.map((s) => s.beat.id)).toEqual(['first', 'odd', 'tie1', 'tie2', 'late']);
    for (const s of s1) expect(Math.abs(s.t / SIM_DT - Math.round(s.t / SIM_DT))).toBeLessThan(1e-9);
    expect(s1.find((s) => s.beat.id === 'odd')!.t).toBeCloseTo(1.0, 9);
    const s2 = scheduleBeats(script(beats, { beatScale: 2 }));
    expect(Math.round(s2.find((s) => s.beat.id === 'late')!.t / SIM_DT)).toBe(1440);
    // In a running battle the beat fires on that very tick.
    const sim = new BattleSimulation(config(twoLines(), script([caption('late', 36)], { beatScale: 2 })));
    muteAll(sim.ships);
    let firedTick = -1;
    sim.onEvent = (e) => {
      if (e.type === 'beat_fired' && e.beatId === 'late') firedTick = sim.tick;
    };
    sim.skipTo(73);
    expect(firedTick).toBe(1440);
    // The briefing's preview applies the pace and keeps the firing order.
    const preview = beatPreview(beats, { beat_scale: '2' });
    expect(preview.map((p) => p.id)).toEqual(['first', 'odd', 'tie1', 'tie2', 'late']);
    [1, 2.05, 24, 24, 72].forEach((at, i) => expect(preview[i].at).toBeCloseTo(at, 9));
  });
});

describe('references and selectors', () => {
  it('an empty ships or fleets selector skips the beat (beat_skipped) and the battle steps on', () => {
    const beats: Beat[] = [
      { id: 'no_fleet', at: 1, event: { kind: 'set_fleet_order', fleets: { fleetIds: ['nope'] }, patch: { order: 'advance' } } },
      { id: 'no_ship', at: 1, event: { kind: 'force_target', ships: [{ name: 'SSV Nobody' }], target: { query: 'nearest', side: 'B' } } },
      { id: 'no_wave', at: 1, event: { kind: 'spawn_wave', fleetId: 'nope' } },
      { id: 'no_drones', at: 1, event: { kind: 'launch_drones', fleets: { fleetIds: ['nope'] } } },
      { id: 'no_special', at: 1, event: { kind: 'trigger_special', special: { type: 'mission_kill', ship: { name: 'SSV Nobody' } } } },
      { id: 'no_volley', at: 1, event: { kind: 'fleet_volley', fleets: { side: 'A', wave: 3 } } },
    ];
    const sim = new BattleSimulation(config(twoLines(), script(beats)));
    muteAll(sim.ships);
    sim.skipTo(3);
    expect(ofType(sim, 'beat_skipped').map((e) => e.beatId).sort()).toEqual(['no_drones', 'no_fleet', 'no_ship', 'no_special', 'no_volley', 'no_wave']);
    expect(ofType(sim, 'beat_fired')).toHaveLength(0);
    expect(sim.finished).toBe(false);
    expect(sim.time).toBeGreaterThan(2.9);
  });

  it('an unresolvable anchor or target is dropped and the beat still fires with a note; requireAlive makes it strict', () => {
    const beats: Beat[] = [
      { id: 'volley', at: 1, event: { kind: 'fleet_volley', fleets: { side: 'A' }, anchor: { name: 'SSV Nobody' } } },
      { id: 'mark', at: 5, event: { kind: 'force_target', fleets: { side: 'A' }, target: { name: 'Nobody' } } },
      { id: 'answer', at: 6, event: { kind: 'fleet_volley', fleets: { fleetIds: ['r'] }, mounts: 'beams', target: { query: 'nearest', side: 'A', roles: ['super_dreadnought'] } } },
      { id: 'strict', at: 9, requireAlive: true, event: { kind: 'fleet_volley', fleets: { side: 'A' }, anchor: { name: 'SSV Nobody' } } },
    ];
    const sim = new BattleSimulation(config(twoLines(), script(beats)));
    muteAll(sim.ships);
    sim.skipTo(10);
    const fired = new Map(ofType(sim, 'beat_fired').map((e) => [e.beatId, e]));
    expect(fired.get('volley')!.note).toBe('anchor unresolved');
    expect(fired.get('mark')!.note).toBe('target unresolved');
    expect(fired.get('answer')!.note).toBe('target unresolved');
    expect(ofType(sim, 'beat_skipped').map((e) => e.beatId)).toEqual(['strict']);
    // The volley anchored on the largest alive capital of the ordered side instead.
    const ordered = ofType(sim, 'fleet_volley_ordered').find((e) => e.fleetId === 'a')!;
    const anchor = sim.getShip(ordered.anchorShipId!)!;
    expect(anchor.classId).toBe('alliance_dreadnought_k');
    expect(anchor.name).toBe('SSV Kilimanjaro');
  });

  it('{ side, wave } selects the n-th beat-arriving fleet of that side by faction order', () => {
    const beatFleet = (id: string, faction: 'alliance' | 'turian' | 'asari', counts: Record<string, number>, x: number): FleetSpec => ({
      ...fleet(id, faction, canon, { counts, name: id, position: v3(x, 0, -30), mult: 1, initialOrder: { order: 'hold_formation' } }),
      arrivalMode: 'beat',
    });
    // Authored turian, alliance, asari; faction order is alliance (wave 0), turian (wave 1), asari (wave 2).
    const fleets = [
      beatFleet('w-turian', 'turian', { turian_cruiser: 1 }, -20),
      beatFleet('w-alliance', 'alliance', { alliance_cruiser: 1 }, 0),
      beatFleet('w-asari', 'asari', { asari_cruiser: 1 }, 20),
      fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 60), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } }),
    ];
    const sim = new BattleSimulation(config(fleets, script([{ id: 'second', at: 1, event: { kind: 'spawn_wave', fleets: { side: 'A', wave: 1 } } }])));
    sim.skipTo(2);
    expect([...sim.fleets.keys()].sort()).toEqual(['r', 'w-turian']);
    expect(sim.resolveFleetSel({ side: 'A', wave: 1 }).map((f) => f.spec.id)).toEqual(['w-turian']);
    expect(sim.resolveFleetSel({ side: 'A', wave: 0 })).toEqual([]);
  });
});

describe('resolveShipRef', () => {
  it('nth counts deployment order including dead hulls; the queries pick among live hulls with ties by id', () => {
    const sim = new BattleSimulation(config(twoLines()));
    muteAll(sim.ships);
    sim.step();
    const cruisers = sim.ships.filter((s) => s.classId === 'alliance_cruiser');
    expect(sim.resolveShipRef({ fleetId: 'a', classId: 'alliance_cruiser', nth: 1 })).toBe(cruisers[1]);
    sim.special.destroy(cruisers[0].id);
    // The second cruiser stays "nth 1" after the first dies; "nth 0" names the dead one and resolves to nothing.
    expect(sim.resolveShipRef({ fleetId: 'a', classId: 'alliance_cruiser', nth: 1 })).toBe(cruisers[1]);
    expect(sim.resolveShipRef({ fleetId: 'a', classId: 'alliance_cruiser', nth: 0 })).toBeUndefined();
    // Without nth: the first live match.
    expect(sim.resolveShipRef({ fleetId: 'a', classId: 'alliance_cruiser' })).toBe(cruisers[1]);
    expect(sim.resolveShipRef({ name: 'SSV Orizaba' })!.classId).toBe('alliance_dreadnought_k');
    expect(sim.resolveShipRef({ id: cruisers[0].id })).toBeUndefined();
    const reapers = sim.ships.filter((s) => s.side === 'B');
    reapers[2].stats.recentDamage = 500;
    expect(sim.resolveShipRef({ query: 'top_damage_dealer', side: 'B' })).toBe(reapers[2]);
    expect(sim.resolveShipRef({ query: 'most_valuable', side: 'B' })!.role).toBe('reaper_capital');
    reapers[1].barriers = 0;
    expect(sim.resolveShipRef({ query: 'weakest_barriers', side: 'B', roles: ['reaper_destroyer'] })).toBe(reapers[1]);
    const capital = reapers.find((s) => s.role === 'reaper_capital')!;
    const nearest = sim.resolveShipRef({ query: 'nearest', to: { id: capital.id }, side: 'A', roles: ['cruiser', 'dreadnought'] })!;
    const d = (s: ShipState): number => Math.hypot(s.pos.x - capital.pos.x, s.pos.y - capital.pos.y, s.pos.z - capital.pos.z);
    for (const s of sim.ships.filter((x) => x.side === 'A' && x.alive && x.role !== 'fighter')) expect(d(nearest)).toBeLessThanOrEqual(d(s));
    // Without `to`, `nearest` measures from the ship the reference is resolved for.
    expect(sim.resolveShipRef({ query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought'] }, capital)).toBe(nearest);
    expect(sim.resolveShipRef({ query: 'nearest', side: 'A' })).toBeUndefined();
  });
});

describe('beat kinds', () => {
  it('launch_drones bursts the hangar: the whole burst leaves in one tick and the fleet deploys its craft', () => {
    const fleets = twoLines();
    fleets[1].initialOrder = { order: 'hold_formation', fightersDeployed: false };
    const sim = new BattleSimulation(config(fleets, script([{ id: 'oculus', at: 2, event: { kind: 'launch_drones', fleets: { fleetIds: ['r'] }, burst: 8 } }])));
    muteAll(sim.ships);
    sim.skipTo(1.95);
    expect(sim.ships.some((s) => s.classId === 'reaper_oculus')).toBe(false);
    sim.skipTo(2.05);
    expect(sim.fleets.get('r')!.orders.fightersDeployed).toBe(true);
    const launched = sim.events.filter((e): e is Extract<BattleEvent, { type: 'fighters_launched' }> => e.type === 'fighters_launched');
    const capital = sim.ships.find((s) => s.role === 'reaper_capital')!;
    expect(launched.filter((e) => e.carrierId === capital.id)).toEqual([expect.objectContaining({ count: 8 })]);
    expect(new Set(launched.filter((e) => e.carrierId === capital.id).map((e) => e.t)).size).toBe(1);
    expect(sim.ships.filter((s) => s.classId === 'reaper_oculus' && s.carrierId === capital.id)).toHaveLength(8);
  });

  it('captions ride the event log with duration × beatScale, style, speaker and the AU flag', () => {
    const beats: Beat[] = [
      { id: 'title', at: 0.5, event: { kind: 'caption', text: 'SOL · 2186', duration: 3.5, style: 'title' } },
      { id: 'quote', at: 2, event: { kind: 'caption', text: 'This cycle is not concluded.', duration: 4, style: 'quote', speaker: 'HARBINGER', au: true } },
    ];
    const sim = new BattleSimulation(config(twoLines(), script(beats, { beatScale: 1.5 })));
    muteAll(sim.ships);
    sim.skipTo(4);
    const caps = ofType(sim, 'caption');
    expect(caps).toHaveLength(2);
    expect(caps[0]).toMatchObject({ text: 'SOL · 2186', style: 'title', au: false });
    expect(caps[0].duration).toBeCloseTo(3.5 * 1.5, 9);
    expect(caps[0].t).toBeCloseTo(0.75, 6);
    expect(caps[1]).toMatchObject({ style: 'quote', speaker: 'HARBINGER', au: true });
    expect(caps[1].duration).toBeCloseTo(6, 9);
    expect(caps[1].t).toBeCloseTo(3, 6);
  });

  it('spawn_wave deploys an arrivalMode beat fleet: no ships before, an arrival state on every ship after, one flash per ship, one fleet_arrived, one reinforcement_arrival', () => {
    const wave: FleetSpec = { ...fleet('wave', 'alliance', canon, { counts: { alliance_cruiser: 2, alliance_frigate: 2 }, name: 'Wave', position: v3(0, 0, -30), mult: 1, initialOrder: { order: 'hold_formation' } }), arrivalMode: 'beat' };
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 60), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([wave, r], script([{ id: 'arrive', at: 3, event: { kind: 'spawn_wave', fleetId: 'wave', stagger: 2 } }])));
    sim.skipTo(2.95);
    expect(sim.ships.filter((s) => s.fleetId === 'wave')).toHaveLength(0);
    sim.skipTo(3.05);
    const ships = sim.ships.filter((s) => s.fleetId === 'wave');
    expect(ships).toHaveLength(4);
    expect(ships.every((s) => s.arrival !== undefined)).toBe(true);
    const appearAt = new Map(ships.map((s) => [s.id, s.arrival!.appearAt]));
    sim.skipTo(12);
    const flashes = ofType(sim, 'ship_arrival_flash');
    expect(flashes.map((e) => e.shipId).sort()).toEqual(ships.map((s) => s.id).sort());
    for (const e of flashes) expect(e.t - appearAt.get(e.shipId)!).toBeGreaterThanOrEqual(-1e-9);
    for (const e of flashes) expect(e.t - appearAt.get(e.shipId)!).toBeLessThan(SIM_DT + 1e-9);
    expect(ofType(sim, 'fleet_arrived').filter((e) => e.fleetId === 'wave')).toHaveLength(1);
    expect(ofType(sim, 'reinforcement_arrival').filter((e) => e.fleetId === 'wave')).toHaveLength(1);
    expect(ofType(sim, 'beat_fired').map((e) => e.beatId)).toEqual(['arrive']);
  });

  it('set_fleet_order.anchorGoal lifts the formation anchor into the plane without sweeping it faster than the heading-rate limit', () => {
    // Inside beam range, so the Reapers hold (they never idle out of range) and only the climb moves the anchor.
    const a = fleet('a', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'A', position: v3(0, 0, -16), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 2 }, name: 'R', side: 'B', position: v3(0, -12, 16), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r], script([{ id: 'climb', at: 1, event: { kind: 'set_fleet_order', fleets: { fleetIds: ['r'] }, patch: { anchorGoal: { y: 0 } } } }])));
    muteAll(sim.ships);
    const f = sim.fleets.get('r')!;
    const startY = f.anchor.y;
    expect(startY).toBeCloseTo(-12 * 0.4, 6);
    const limit = MOVEMENT.reaperHeadingRateRad * SIM_DT + 1e-9;
    let prev: Vec3 = { ...f.anchor };
    let prevHeading: Vec3 = { ...f.heading };
    let reachedAt = -1;
    for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
      sim.step();
      const aim = sim.enemyCentroid('B')!;
      const u = v3(prev.x - aim.x, prev.y - aim.y, prev.z - aim.z);
      const w = v3(f.anchor.x - aim.x, f.anchor.y - aim.y, f.anchor.z - aim.z);
      const cos = (u.x * w.x + u.y * w.y + u.z * w.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(w.x, w.y, w.z));
      // The line of sight from the aim point sweeps no faster than the Reaper heading-rate limit.
      expect(Math.acos(Math.min(1, cos))).toBeLessThanOrEqual(limit);
      // The climb is a translation: the formation's heading never turns faster than its limit either.
      const hc = prevHeading.x * f.heading.x + prevHeading.z * f.heading.z;
      expect(Math.acos(Math.min(1, hc))).toBeLessThanOrEqual(limit);
      prev = { ...f.anchor };
      prevHeading = { ...f.heading };
      if (reachedAt < 0 && Math.abs(f.anchor.y) < 1e-6) reachedAt = sim.time;
    }
    expect(reachedAt).toBeGreaterThan(1);
    expect(f.orders.anchorGoal).toBeUndefined();
    // The hulls followed: the Reaper centroid rose by most of the climb.
    const ys = sim.ships.filter((s) => s.fleetId === 'r').map((s) => s.pos.y);
    expect(ys.reduce((x, y) => x + y, 0) / ys.length).toBeGreaterThan(startY + 0.8 * Math.abs(startY));
    expect(ofType(sim, 'order_issued').some((e) => e.fleetId === 'r' && e.order.includes('anchorGoal'))).toBe(true);
  });

  it("force_target.mounts 'broadside' gives the flank batteries the target and leaves the spinal mount's target alone", () => {
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, 0), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 2 }, name: 'R', side: 'B', formation: 'dispersed', position: v3(0, 0, 10), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    // Ship ids are deterministic (`<fleet>-<class>-<n>`), so the beats can name the hulls before the battle exists.
    const beats = script([
      { id: 'own', at: 0.5, event: { kind: 'force_target', ships: [{ id: 'a-alliance_dreadnought-1' }], target: { id: 'r-reaper_destroyer-1' } } },
      { id: 'flank', at: 1, event: { kind: 'force_target', ships: [{ id: 'a-alliance_dreadnought-1' }], target: { id: 'r-reaper_destroyer-2' }, mounts: 'broadside' } },
    ]);
    const sim2 = new BattleSimulation(config([a, r], beats));
    const dn2 = sim2.ships.find((s) => s.role === 'dreadnought')!;
    const [ahead2, flank2] = sim2.ships.filter((s) => s.role === 'reaper_destroyer');
    expect(dn2.id).toBe('a-alliance_dreadnought-1');
    expect([ahead2.id, flank2.id]).toEqual(['r-reaper_destroyer-1', 'r-reaper_destroyer-2']);
    muteAll([ahead2, flank2]);
    // One destroyer dead ahead in the spinal gun's arc, the other on the right flank, where the +90° battery bears.
    ahead2.pos = v3(0, 0, 4);
    flank2.pos = v3(4.8, 0, 0);
    for (const s of [ahead2, flank2]) {
      s.maxSpeed = 0;
      s.vel = v3();
    }
    sim2.skipTo(1.05);
    const spinal = dn2.weapons.filter((w) => isSpinal(w.def));
    const broadside = dn2.weapons.filter((w) => volleyMount(w, 'broadside'));
    expect(spinal.length).toBe(1);
    expect(broadside.length).toBe(8);
    expect(spinal.every((w) => w.assignedTargetId === undefined)).toBe(true);
    expect(broadside.every((w) => w.assignedTargetId === flank2.id)).toBe(true);
    expect(dn2.forcedTargetId).toBe(ahead2.id);
    sim2.skipTo(12);
    const shots = sim2.events.filter((e): e is Extract<BattleEvent, { type: 'weapon_fired' }> => e.type === 'weapon_fired' && e.shipId === dn2.id && e.t > 1.05);
    const spinalIdx = new Set(spinal.map((w) => w.index));
    const flankIdx = new Set(broadside.filter((w) => w.facing > 0).map((w) => w.index));
    expect(shots.some((e) => spinalIdx.has(e.weaponIndex) && e.targetId === ahead2.id)).toBe(true);
    expect(shots.some((e) => spinalIdx.has(e.weaponIndex) && e.targetId === flank2.id)).toBe(false);
    expect(shots.some((e) => flankIdx.has(e.weaponIndex) && e.targetId === flank2.id)).toBe(true);
  });
});

describe('the player lock', () => {
  it('refuses player orders until lockPlayerUntil × beatScale, lets scripted orders through, and player_control lifts it early', () => {
    const run = (beats: Beat[]): BattleSimulation => {
      const sim = new BattleSimulation(config(twoLines(), script(beats, { beatScale: 1.5, lockPlayerUntil: 10 })));
      muteAll(sim.ships);
      return sim;
    };
    const sim = run([{ id: 'form_up', at: 2, event: { kind: 'set_fleet_order', fleets: { side: 'A' }, patch: { order: 'advance', holdFire: 'spinal' } } }]);
    expect(sim.playerLockUntil).toBeCloseTo(15, 9);
    expect(sim.playerLocked).toBe(true);
    sim.skipTo(1);
    expect(sim.issueOrders('a', { order: 'attack' })).toBe('rejected');
    sim.orderShipsAttack([sim.ships[0].id], sim.ships.find((s) => s.side === 'B')!.id);
    const rejected = ofType(sim, 'order_rejected');
    expect(rejected).toHaveLength(2);
    expect(rejected.every((e) => e.reason === 'player_locked')).toBe(true);
    expect(sim.fleets.get('a')!.orders.order).toBe('hold_formation');
    // The scripted form-up goes through the lock.
    sim.skipTo(3.1);
    expect(sim.fleets.get('a')!.orders).toMatchObject({ order: 'advance', holdFire: 'spinal' });
    sim.skipTo(14.9);
    expect(sim.playerLocked).toBe(true);
    sim.skipTo(15.05);
    expect(sim.playerLocked).toBe(false);
    expect(sim.issueOrders('a', { order: 'attack' })).toBe('issued');
    // player_control { locked: false } at 5 × 1.5 = 7.5 s lifts it early.
    const early = run([{ id: 'free', at: 5, event: { kind: 'player_control', locked: false } }]);
    early.skipTo(7.4);
    expect(early.playerLocked).toBe(true);
    early.skipTo(7.55);
    expect(early.playerLocked).toBe(false);
    expect(early.issueOrders('a', { order: 'attack' })).toBe('issued');
  });
});

describe('replay', () => {
  /** A scripted opening that exercises every new event type in 80 s. */
  const kitchenSink = (): BattleConfig => {
    const wave: FleetSpec = {
      ...fleet('sword', 'alliance', canon, { counts: { alliance_dreadnought_k: 2, alliance_dreadnought: 2, alliance_cruiser: 4, alliance_carrier: 1 }, name: 'Sword', position: v3(0, 0, -16), mult: 1, initialOrder: { order: 'hold_formation', holdFire: 'spinal', fightersDeployed: false } }),
      arrivalMode: 'beat',
    };
    const late: FleetSpec = { ...fleet('late', 'alliance', canon, { counts: { alliance_frigate: 3 }, name: 'Late', position: v3(-14, 0, -20), mult: 1, arrivalTime: 20 }), arrivalFlash: true };
    const reapers = fleet('blockade', 'reaper', canon, { counts: { harbinger: 1, reaper_capital: 2, reaper_destroyer: 4 }, fixedClasses: ['harbinger'], name: 'Blockade', side: 'B', position: v3(0, -6, 26), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const beats: Beat[] = [
      { id: 'arrive', at: 0, event: { kind: 'spawn_wave', fleetId: 'sword', stagger: 3 } },
      { id: 'title', at: 0.5, event: { kind: 'caption', text: 'SOL', duration: 3.5, style: 'title' } },
      { id: 'missing', at: 1, event: { kind: 'spawn_wave', fleetId: 'nope' } },
      { id: 'form_up', at: 12, event: { kind: 'set_fleet_order', fleets: { side: 'A' }, patch: { order: 'advance', holdSpecialAmmo: true } } },
      { id: 'reapers_advance', at: 14, event: { kind: 'set_fleet_order', fleets: { fleetIds: ['blockade'] }, patch: { order: 'advance', holdFire: 'beams', anchorGoal: { y: 0 } } } },
      { id: 'oculus', at: 16, event: { kind: 'launch_drones', fleets: { fleetIds: ['blockade'] }, burst: 8 } },
      { id: 'mark', at: 18, event: { kind: 'force_target', fleets: { side: 'A' }, target: { query: 'nearest', to: { fleetId: 'sword' }, side: 'B', roles: ['reaper_capital'] } } },
      { id: 'volley', at: 26, event: { kind: 'fleet_volley', fleets: { side: 'A' }, lead: 2, window: 1.5, mounts: 'spinal', anchor: { name: 'SSV Kilimanjaro' } } },
      { id: 'answer', at: 32, event: { kind: 'fleet_volley', fleets: { fleetIds: ['blockade'] }, lead: 2, window: 2, mounts: 'beams', target: { query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought'] } } },
      { id: 'cripple', at: 40, event: { kind: 'trigger_special', special: { type: 'mission_kill', ship: { name: 'Harbinger' } } } },
      { id: 'strike', at: 42, event: { kind: 'force_target', ships: [{ name: 'SSV Orizaba' }], target: { name: 'Harbinger' }, forceNextShot: 'hit' } },
      { id: 'stale', at: 44, event: { kind: 'trigger_special', special: { type: 'hades_strike', shooter: { name: 'SSV Kilimanjaro' }, target: { name: 'Harbinger' } } } },
      { id: 'kill', at: 50, event: { kind: 'trigger_special', special: { type: 'destroy', ship: { name: 'Harbinger' }, killer: { name: 'SSV Kilimanjaro' }, cause: 'kinetic' } } },
      { id: 'free_play', at: 60, event: { kind: 'player_control', locked: false } },
    ];
    return { ...config([wave, late, reapers], script(beats, { lockPlayerUntil: 80 }), 5), name: 'Kitchen sink' };
  };

  it('two simulations of the same scripted config log identical events after 1,600 steps, every new event type included', () => {
    const run = (): BattleSimulation => {
      const sim = new BattleSimulation(kitchenSink());
      for (let i = 0; i < 1600; i++) sim.step();
      // A player order during the lock, so order_rejected is in the log too.
      return sim;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    const types = new Set(a.events.map((e) => e.type));
    for (const t of ['beat_fired', 'beat_skipped', 'caption', 'ship_arrival_flash', 'fleet_arrived', 'reinforcement_arrival', 'fleet_volley_ordered', 'fleet_volley_fired', 'mission_kill', 'flagship_mission_kill', 'flagship_destroyed', 'scripted_event'] as const) {
      expect(types.has(t), t).toBe(true);
    }
    // A player order inside the lock is refused and logged; replaying it reproduces the log.
    const c = new BattleSimulation(kitchenSink());
    const d = new BattleSimulation(kitchenSink());
    for (const s of [c, d]) {
      s.skipTo(30);
      expect(s.issueOrders('sword', { order: 'retreat' })).toBe('rejected');
      s.skipTo(45);
    }
    expect(JSON.stringify(c.events)).toBe(JSON.stringify(d.events));
    expect(c.events.some((e) => e.type === 'order_rejected' && e.reason === 'player_locked')).toBe(true);
  }, 120_000);
});

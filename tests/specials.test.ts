import { describe, expect, it } from 'vitest';
import { v3, type Vec3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { fleet } from '@/scenarios';
import { movementGoal } from '@/simulation/ai';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { STRAFE_CAPTURE_KM, strafeWaypoints } from '@/simulation/scriptedMoves';
import { FORCED_SHOT_SECONDS, MISSION_KILL } from '@/simulation/specials';
import type { BattleConfig, BattleEvent, FleetSpec, ShipState, Side } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/**
 * Scripted specials (`sim.special`; CINEMATIC_DESIGN.md §1.6; WORK_BREAKDOWN.md T13, §1.3.7, §1.6.3
 * `tests/specials.test.ts`). The forced HADES strike cases live in `tests/hades.test.ts`.
 */

const config = (fleets: FleetSpec[], rulesId = 'canon_me3', seed = 4): BattleConfig => ({ id: 'specials', name: 'Specials', scenarioId: 'custom', seed, rules: getPreset(rulesId), fleets, environment: 'deep_space', maxDuration: 900, perspectiveSide: 'A', objective: 'Test.' });
const mute = (sim: BattleSimulation, side?: Side): void => {
  for (const s of sim.ships) if (side === undefined || s.side === side) for (const w of s.weapons) w.cooldown = Infinity;
};
type Scripted = Extract<BattleEvent, { type: 'scripted_event' }>;
const scripted = (sim: BattleSimulation): Scripted[] => sim.events.filter((e): e is Scripted => e.type === 'scripted_event');
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Under Apex: a Valkyrie, a Titan dreadnought, two cruisers and a Trident pair against a muted Reaper group. */
function arena(): { sim: BattleSimulation; ship: (classId: string, n?: number) => ShipState } {
  const apex = getPreset('prime_apex');
  const a = fleet('a', 'alliance', apex, { counts: { normandy_valkyrie: 1, alliance_dreadnought: 1, alliance_cruiser: 2, alliance_fighter: 2 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -16), mult: 1, initialOrder: { order: 'hold_formation' } });
  const r = fleet('r', 'reaper', apex, { counts: { harbinger: 1, reaper_capital: 1, reaper_destroyer: 2 }, fixedClasses: ['harbinger'], name: 'R', side: 'B', position: v3(0, 0, 16), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
  const sim = new BattleSimulation(config([a, r], 'prime_apex'));
  mute(sim);
  const ship = (classId: string, n = 1): ShipState => sim.ships.filter((s) => s.classId === classId)[n - 1];
  return { sim, ship };
}

describe('every special', () => {
  it("returns 'skipped' for an unknown ship and 'applied' for a valid one; the ones that override an outcome log scripted_event { forced: true }", () => {
    const { sim, ship } = arena();
    const sp = sim.special;
    const cap = ship('reaper_capital');
    const dn = ship('alliance_dreadnought');
    // Unknown ships.
    expect(sp.driveAttack('nope', cap.id)).toBe('skipped');
    expect(sp.hadesStrike('nope', cap.id)).toBe('skipped');
    expect(sp.hadesStrike(dn.id, 'nope')).toBe('skipped');
    expect(sp.approach('nope', cap.id, { km: 2, seconds: 10 })).toBe('skipped');
    expect(sp.strafeThrough('nope', cap.id, { seconds: 10 })).toBe('skipped');
    expect(sp.novaStrike('nope', cap.id)).toBe('skipped');
    expect(sp.missionKill('nope')).toBe('skipped');
    expect(sp.destroy('nope')).toBe('skipped');
    expect(sp.setHullFraction('nope', 0.5)).toBe('skipped');
    expect(sp.setBarrierFraction('nope', 0.5)).toBe('skipped');
    expect(sp.setSubsystem('nope', 'engines', 0.5)).toBe('skipped');
    expect(sp.withdrawShip('nope')).toBe('skipped');
    expect(sp.interpose('nope', cap.id)).toBe('skipped');
    expect(scripted(sim)).toHaveLength(0);
    sim.step();
    // Valid ships.
    expect(sp.hadesStrike(dn.id, cap.id, { force: 'hit_penetrating' })).toBe('applied');
    expect(sp.approach(ship('alliance_cruiser').id, cap.id, { km: 3, seconds: 30 })).toBe('applied');
    expect(sp.strafeThrough(ship('alliance_fighter').id, cap.id, { seconds: 30 })).toBe('applied');
    expect(sp.novaStrike(ship('normandy_valkyrie').id, cap.id, { withThanix: true, force: 'hit' })).toBe('applied');
    expect(sp.missionKill(ship('harbinger').id)).toBe('applied');
    expect(sp.destroy(ship('reaper_destroyer').id)).toBe('applied');
    expect(sp.setHullFraction(ship('alliance_cruiser', 2).id, 0.5)).toBe('applied');
    expect(sp.setBarrierFraction(cap.id, 0.5)).toBe('applied');
    expect(sp.setSubsystem(cap.id, 'sensors', 0.5)).toBe('applied');
    expect(sp.withdrawShip(ship('alliance_cruiser', 2).id)).toBe('applied');
    expect(sp.interpose(ship('reaper_destroyer', 2).id, cap.id, { againstId: dn.id })).toBe('applied');
    // The Black Fleet drive attack is CORE T14; until then no run starts (and under canon none ever does).
    expect(sp.driveAttack(ship('alliance_cruiser').id, cap.id)).toBe('skipped');
    const log = new Map(scripted(sim).map((e) => [e.special, e]));
    for (const k of ['hades_strike', 'nova_strike', 'mission_kill', 'destroy', 'set_hull_fraction', 'set_barrier_fraction', 'set_subsystem', 'withdraw_ship']) expect(log.get(k)?.forced, k).toBe(true);
    for (const k of ['approach', 'strafe_through', 'interpose']) expect(log.get(k)?.forced, k).toBe(false);
    // A dead ship is no longer a valid subject.
    expect(sp.missionKill(ship('reaper_destroyer').id)).toBe('skipped');
    // Specials never touch the battle's own randomness except where they roll (none here): the battle keeps stepping.
    sim.skipTo(5);
    expect(sim.finished).toBe(false);
  });
});

describe('scripted targets are hostile hulls only', () => {
  it('a strike, a forced target or a volley target naming a friendly hull does nothing', () => {
    const { sim, ship } = arena();
    const dn = ship('alliance_dreadnought');
    const cruiser = ship('alliance_cruiser');
    sim.step();
    const before = scripted(sim).length;
    expect(sim.special.hadesStrike(dn.id, cruiser.id, { force: 'hit_penetrating' })).toBe('skipped');
    expect(sim.special.novaStrike(ship('normandy_valkyrie').id, cruiser.id)).toBe('skipped');
    sim.special.forceTarget([dn.id], cruiser.id, 'hit');
    expect(dn.forcedTargetId).toBeUndefined();
    expect(dn.weapons.every((w) => w.forcedShot === undefined)).toBe(true);
    expect(scripted(sim)).toHaveLength(before);
    sim.orderVolley(['a'], { targetId: cruiser.id });
    expect(sim.fleets.get('a')!.focusTargetId).not.toBe(cruiser.id);
    expect(dn.weapons.every((w) => w.assignedTargetId !== cruiser.id)).toBe(true);
  });
});

describe('destroy', () => {
  it('ifHullBelow skips above the fraction; a killer and a weapon cause on a flagship name the killer’s heaviest anti-capital mount', () => {
    const { sim, ship } = arena();
    const d1 = ship('reaper_destroyer');
    expect(sim.special.setHullFraction(d1.id, 0.6)).toBe('applied');
    expect(sim.special.destroy(d1.id, { ifHullBelow: 0.5 })).toBe('skipped');
    expect(d1.alive).toBe(true);
    expect(sim.special.setHullFraction(d1.id, 0.4)).toBe('applied');
    expect(sim.special.destroy(d1.id, { ifHullBelow: 0.5 })).toBe('applied');
    expect(d1.alive).toBe(false);
    expect(sim.events.find((e) => e.type === 'ship_destroyed' && e.shipId === d1.id)).toMatchObject({ cause: 'scripted' });
    // Harbinger, killed by the Titan dreadnought with a kinetic cause: no weapon fired, yet the banner names one.
    const harbinger = ship('harbinger');
    const dn = ship('alliance_dreadnought');
    expect(sim.special.destroy(harbinger.id, { killerId: dn.id, cause: 'kinetic' })).toBe('applied');
    const fd = sim.events.filter((e): e is Extract<BattleEvent, { type: 'flagship_destroyed' }> => e.type === 'flagship_destroyed');
    expect(fd).toHaveLength(1);
    const heaviest = dn.weapons.filter((w) => w.def.antiCapital).sort((a, b) => b.def.damage - a.def.damage)[0];
    expect(fd[0].killer).toMatchObject({ shipId: dn.id, name: dn.name, classId: dn.classId, faction: 'alliance', weaponId: heaviest.def.id, weaponName: heaviest.def.name });
    expect(fd[0].killer!.weaponName).toBe(WEAPONS.apex_hyper_ma.name);
    expect(fd[0].damageType).toBe('kinetic');
    expect(fd[0].tier).toBe('harbinger');
    const sd = sim.events.findIndex((e) => e.type === 'ship_destroyed' && e.shipId === harbinger.id);
    expect(sim.events.indexOf(fd[0])).toBe(sd + 1);
  });
});

describe('interpose', () => {
  it('moves the ship onto the protectee–attacker segment within 10 s and keeps it there', () => {
    const { sim, ship } = arena();
    const cap = ship('reaper_capital');
    const guard = ship('reaper_destroyer', 2);
    const dn = ship('alliance_dreadnought');
    expect(sim.special.interpose(guard.id, cap.id, { againstId: dn.id, seconds: 30 })).toBe('applied');
    expect(guard.interpose).toMatchObject({ protectId: cap.id, againstId: dn.id });
    let onSegmentAt = -1;
    while (sim.time < 12) {
      sim.step();
      const ab = v3(dn.pos.x - cap.pos.x, dn.pos.y - cap.pos.y, dn.pos.z - cap.pos.z);
      const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
      const u = ((guard.pos.x - cap.pos.x) * ab.x + (guard.pos.y - cap.pos.y) * ab.y + (guard.pos.z - cap.pos.z) * ab.z) / len2;
      const foot = v3(cap.pos.x + ab.x * u, cap.pos.y + ab.y * u, cap.pos.z + ab.z * u);
      const off = dist(guard.pos, foot);
      if (onSegmentAt < 0 && u > 0 && u < 1 && off < 0.3) onSegmentAt = sim.time;
    }
    expect(onSegmentAt).toBeGreaterThan(0);
    expect(onSegmentAt).toBeLessThanOrEqual(10);
    // The Reaper AI does not release a scripted interpose (it manages only the covers it set itself).
    expect(guard.interpose?.protectId).toBe(cap.id);
  });
});

describe('approach', () => {
  it('brings the ship within km of the target within the given seconds (detail.completed 1); passThrough carries it past the target', () => {
    for (const passThrough of [false, true]) {
      const { sim, ship } = arena();
      const cruiser = ship('alliance_cruiser');
      const cap = ship('reaper_capital');
      const start = v3(cruiser.pos.x, cruiser.pos.y, cruiser.pos.z);
      expect(dist(start, cap.pos)).toBeGreaterThan(10);
      expect(sim.special.approach(cruiser.id, cap.id, { km: 2, seconds: 60, passThrough, beatId: 'run' })).toBe('applied');
      let closest = Infinity;
      let done: Scripted | undefined;
      while (sim.time < 60 && !done) {
        sim.step();
        closest = Math.min(closest, dist(cruiser.pos, cap.pos));
        done = scripted(sim).find((e) => e.special === 'approach' && e.detail !== undefined);
      }
      expect(done).toBeDefined();
      expect(done!).toMatchObject({ beatId: 'run', shipIds: [cruiser.id, cap.id], detail: { completed: 1 } });
      expect(closest).toBeLessThanOrEqual(2 + 1e-6);
      if (passThrough) {
        // Past the target along the approach line: further from the start than the target is.
        expect(dist(cruiser.pos, start)).toBeGreaterThan(dist(cap.pos, start));
      }
    }
  });
});

describe('strafeThrough', () => {
  it('flies a fighter along the strafe lane of a Reaper capital, both waypoints passed within the time, no point-defence repulsion; skipped for a non-fighter', () => {
    const { sim, ship } = arena();
    const fighter = ship('alliance_fighter');
    const cap = ship('reaper_capital');
    expect(getShipClass('reaper_capital').strafeLane).toBeDefined();
    expect(sim.special.strafeThrough(ship('alliance_cruiser').id, cap.id, { seconds: 30 })).toBe('skipped');
    expect(sim.special.strafeThrough(fighter.id, ship('reaper_destroyer').id, { seconds: 30 })).toBe('skipped');
    expect(sim.special.strafeThrough(fighter.id, cap.id, { seconds: 40, beatId: 'pass' })).toBe('applied');
    const passed = [false, false];
    let done: Scripted | undefined;
    while (sim.time < 40 && !done) {
      // The scripted goal replaces the strafing pass: straight at the next waypoint, no repulsion vector.
      const goal = movementGoal(sim, fighter, sim.fleets.get(fighter.fleetId)!);
      expect(goal.repel).toBeUndefined();
      sim.step();
      const wp = strafeWaypoints(cap)!;
      wp.forEach((p, i) => {
        if (dist(fighter.pos, p) <= STRAFE_CAPTURE_KM) passed[i] = true;
      });
      done = scripted(sim).find((e) => e.special === 'strafe_through' && e.detail !== undefined);
    }
    expect(done).toMatchObject({ beatId: 'pass', shipIds: [fighter.id, cap.id], detail: { waypointsPassed: 2 } });
    expect(passed).toEqual([true, true]);
    expect(done!.t).toBeLessThanOrEqual(40);
  });
});

describe('missionKill', () => {
  it('leaves the 46 % weapon factor and cuts active beams; the hull stays alive', () => {
    const { sim, ship } = arena();
    const cap = ship('reaper_capital');
    const dn = ship('alliance_dreadnought');
    const beam = cap.weapons.find((w) => w.def.kind === 'reaper_beam')!;
    beam.beamRemaining = 1.2;
    beam.beamTargetId = dn.id;
    beam.beamHit = true;
    expect(sim.special.missionKill(cap.id)).toBe('applied');
    expect(cap.subsystems.weapons).toBeCloseTo(MISSION_KILL.weapons, 9);
    expect(cap.subsystems.engines).toBeCloseTo(MISSION_KILL.engines, 9);
    expect(0.4 + 0.6 * cap.subsystems.weapons).toBeCloseTo(0.46, 9);
    expect(cap.weapons.every((w) => w.beamRemaining === 0 && w.beamTargetId === undefined)).toBe(true);
    expect(cap.alive).toBe(true);
    expect(sim.events.filter((e) => e.type === 'mission_kill' && e.shipId === cap.id)).toHaveLength(1);
    expect(sim.events.filter((e) => e.type === 'subsystem_disabled' && e.shipId === cap.id)).toHaveLength(2);
    // A plain capital is not a flagship: no flagship event.
    expect(sim.events.some((e) => e.type === 'flagship_mission_kill')).toBe(false);
  });
});

describe('forced shots', () => {
  it('a forced shot that cannot bear lapses after 6 s with forced_shot_expired', () => {
    const canon = getPreset('canon_me3');
    const a = fleet('a', 'alliance', canon, { counts: { alliance_cruiser: 1 }, name: 'A', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 160), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r]));
    mute(sim, 'B');
    const cr = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
    const far = sim.ships.find((s) => s.classId === 'reaper_destroyer')!;
    far.maxSpeed = 0;
    cr.maxSpeed = 0;
    sim.step();
    const armedAt = sim.time;
    sim.special.forceTarget([cr.id], far.id, 'hit');
    const armed = cr.weapons.find((w) => w.forcedShot !== undefined)!;
    expect(armed.forcedShot).toMatchObject({ targetId: far.id, hit: true });
    expect(armed.def.antiCapital).toBe(true);
    sim.skipTo(armedAt + FORCED_SHOT_SECONDS + 0.5);
    const expired = sim.events.filter((e): e is Extract<BattleEvent, { type: 'forced_shot_expired' }> => e.type === 'forced_shot_expired');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ shipId: cr.id, weaponIndex: armed.index });
    expect(expired[0].t - armedAt).toBeGreaterThanOrEqual(FORCED_SHOT_SECONDS - 1e-9);
    expect(expired[0].t - armedAt).toBeLessThanOrEqual(FORCED_SHOT_SECONDS + SIM_DT + 1e-9);
    expect(armed.forcedShot).toBeUndefined();
  });

  it('a forced hit leaves on the next ready tick, cannot miss and strikes nothing but its target', () => {
    const canon = getPreset('canon_me3');
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 1 }, name: 'R', side: 'B', formation: 'capital_column', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r]));
    mute(sim, 'B');
    const dn = sim.ships.find((s) => s.classId === 'alliance_dreadnought')!;
    const cap = sim.ships.find((s) => s.classId === 'reaper_capital')!;
    for (const s of sim.ships) {
      s.maxSpeed = 0;
      s.vel = v3();
    }
    // 12 km apart (the spinal gun reaches 16.8), the destroyer off to the side.
    dn.pos = v3(0, 0, -6);
    cap.pos = v3(0, 0, 6);
    sim.ships.find((s) => s.classId === 'reaper_destroyer')!.pos = v3(5, 0, 6);
    for (const w of dn.weapons) w.cooldown = Infinity;
    const main = dn.weapons.find((w) => w.def.id === 'alliance_dn_main')!;
    // Point the dreadnought at the capital so the spinal gun bears, then force one hit.
    dn.heading = v3((cap.pos.x - dn.pos.x) / dist(cap.pos, dn.pos), 0, (cap.pos.z - dn.pos.z) / dist(cap.pos, dn.pos));
    main.cooldown = 0;
    sim.special.forceTarget([dn.id], cap.id, 'hit');
    expect(main.forcedShot).toBeDefined();
    sim.step();
    const shot = sim.events.find((e): e is Extract<BattleEvent, { type: 'weapon_fired' }> => e.type === 'weapon_fired' && e.shipId === dn.id);
    expect(shot).toMatchObject({ weaponId: 'alliance_dn_main', targetId: cap.id, forced: true });
    expect(main.forcedShot).toBeUndefined();
    sim.skipTo(4);
    const impacts = sim.events.filter((e): e is Extract<BattleEvent, { type: 'projectile_impact' }> => e.type === 'projectile_impact' && e.shipId === dn.id);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ targetId: cap.id, projectileId: shot!.projectileId, weaponId: 'alliance_dn_main' });
    expect(sim.events.some((e) => e.type === 'scripted_event' && e.special === 'force_target' && e.forced)).toBe(true);
  });
});

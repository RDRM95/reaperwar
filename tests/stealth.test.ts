import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { SCENARIOS, fleet } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { STEALTH_VENT_FRACTION } from '@/simulation/stealth';
import type { BattleConfig, BattleEvent, FleetOrders, FleetSpec, ShipState } from '@/simulation/types';
import { PRESETS, getPreset } from '@/timelines/presets';

/** IES stealth and the hunter doctrine (brief §15.2; WORK_BREAKDOWN.md T10). Every run is deterministic. */

const rules = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'stealth', name: 'Stealth', scenarioId: 'custom', seed, rules, fleets, environment: 'deep_space', maxDuration: 900, perspectiveSide: 'A', objective: 'Test.' });
const hunterFleet = (classId: string, z: number, initialOrder?: Partial<FleetOrders>): FleetSpec => fleet('hunter', 'alliance', rules, { counts: { [classId]: 1 }, name: 'Hunter', formation: 'dispersed', position: v3(0, 0, z), mult: 1, initialOrder });
const dist = (a: ShipState, b: ShipState): number => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);

/** A silent SR-2-pattern frigate 40 km (nominal) from a lone Reaper destroyer that launches no Oculi. */
function destroyerHunt(seed = 1): BattleSimulation {
  const prey = fleet('prey', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Prey', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { fightersDeployed: false } });
  return new BattleSimulation(config([hunterFleet('alliance_frigate_thanix', -20), prey], seed));
}

describe('IES stealth: detection and firing solutions', () => {
  it('a silent frigate closing on a Reaper destroyer takes no hits and is targeted by nothing before its first shot', () => {
    const sim = destroyerHunt();
    const f = sim.ships.find((s) => s.fleetId === 'hunter')!;
    const d = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    expect(f.stealth?.state).toBe('silent');
    const hull = f.hull;
    const barriers = f.barriers;
    let firstShot: number | undefined;
    let closest = Infinity;
    while (sim.time < 120 && firstShot === undefined) {
      sim.step();
      closest = Math.min(closest, dist(f, d));
      // Nobody may target or hold a solution on a silent hull beyond its detection range.
      if (f.stealth!.state === 'silent' && dist(f, d) > f.stealth!.detectRange) {
        expect(d.targetId).not.toBe(f.id);
        expect(d.solutions.some((s) => s.targetId === f.id)).toBe(false);
      }
      firstShot = sim.events.find((e) => e.type === 'weapon_fired' && e.shipId === f.id)?.t;
    }
    expect(firstShot).toBeDefined();
    const before = sim.events.filter((e) => e.t < firstShot!);
    expect(before.some((e) => e.type === 'weapon_fired' && e.targetId === f.id)).toBe(false);
    expect(before.some((e) => e.type === 'projectile_impact' && e.targetId === f.id)).toBe(false);
    expect(f.hull).toBe(hull);
    expect(f.barriers).toBe(barriers);
    // It closed silent: the run ends far inside the destroyer's beam range but never inside its detection range.
    expect(closest).toBeGreaterThan(f.stealth!.detectRange);
    expect(closest).toBeLessThan(d.weapons.find((w) => w.def.kind === 'reaper_beam')!.def.range);
  });

  it('after firing the frigate is revealed for revealOnFire seconds, then silent again once clear', () => {
    const sim = destroyerHunt();
    const f = sim.ships.find((s) => s.fleetId === 'hunter')!;
    while (!sim.events.some((e) => e.type === 'weapon_fired' && e.shipId === f.id)) sim.step();
    const t0 = sim.events.find((e) => e.type === 'weapon_fired' && e.shipId === f.id)!.t;
    const reveal = sim.events.find((e) => e.type === 'stealth_revealed' && e.shipId === f.id)!;
    expect(reveal.t).toBe(t0);
    expect(reveal.type === 'stealth_revealed' ? reveal.reason : '').toBe('fired');
    expect(f.stealth!.state).toBe('revealed');
    expect(f.stealth!.revealedUntil).toBeGreaterThanOrEqual(t0 + f.stealth!.revealOnFire - 1e-9);
    // Not silent before revealOnFire has run out.
    while (sim.time < t0 + f.stealth!.revealOnFire - SIM_DT) {
      sim.step();
      expect(f.stealth!.state).not.toBe('silent');
    }
    // Silent again (stealth_engaged) after the pass, once the last shot's reveal has run out and nothing is near.
    let engaged: BattleEvent | undefined;
    while (sim.time < t0 + 60 && !engaged) {
      sim.step();
      engaged = sim.events.find((e) => e.type === 'stealth_engaged' && e.shipId === f.id && e.t > t0);
    }
    expect(engaged).toBeDefined();
    const lastShot = sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === f.id && e.t < engaged!.t).at(-1)!;
    expect(engaged!.t).toBeGreaterThanOrEqual(lastShot.t + f.stealth!.revealOnFire - 1e-9);
  });

  it('any enemy inside the detection range reveals a silent hull (reason "detected"), and locks drop within 2 s of it going silent', () => {
    // A Reaper destroyer placed 0.6 km from a silent frigate that holds fire (disengage).
    const prey = fleet('prey', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Prey', side: 'B', position: v3(0, 0, 30), mult: 1, initialOrder: { fightersDeployed: false, order: 'hold_formation' } });
    const sim = new BattleSimulation(config([hunterFleet('alliance_frigate_thanix', 0, { order: 'retreat' }), prey]));
    const f = sim.ships.find((s) => s.fleetId === 'hunter')!;
    const near = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    near.pos = v3(f.pos.x, f.pos.y, f.pos.z + 0.6);
    near.prevPos = v3(near.pos.x, near.pos.y, near.pos.z);
    expect(f.stealth!.detectRange).toBeGreaterThan(0.6);
    sim.step();
    const detected = sim.events.find((e) => e.type === 'stealth_revealed' && e.shipId === f.id);
    expect(detected && detected.type === 'stealth_revealed' ? detected.reason : undefined).toBe('detected');
    expect(f.stealth!.state).toBe('revealed');

    // The full hunt: every time the frigate goes silent beyond the destroyer's detection range, the destroyer's lock is gone within 2 s.
    const hunt = destroyerHunt();
    const h = hunt.ships.find((s) => s.fleetId === 'hunter')!;
    const d = hunt.ships.find((s) => s.role === 'reaper_destroyer')!;
    let silentSince = -1;
    let checked = 0;
    while (hunt.time < 150 && h.alive && d.alive) {
      hunt.step();
      const hidden = h.stealth!.state === 'silent' && dist(h, d) > h.stealth!.detectRange;
      if (hidden && silentSince < 0) silentSince = hunt.time;
      if (!hidden) silentSince = -1;
      if (hidden && hunt.time - silentSince >= 2) {
        expect(d.targetId).not.toBe(h.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('venting is forced at capacity; the AI chooses to vent early only once out of everyone’s reach', () => {
    // Forced: a hunter with nothing vulnerable to strike (an undamaged cruiser, no attack order) shadows its fleet,
    // never fires and stays inside the cruiser's reach, so the sink fills to capacity.
    const cruiser = fleet('line', 'cerberus', rules, { counts: { cerberus_cruiser: 1 }, name: 'Line', side: 'B', formation: 'line_abreast', position: v3(0, 0, 16), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([hunterFleet('alliance_frigate_thanix', -10, { order: 'hold_formation' }), cruiser]));
    const f = sim.ships.find((s) => s.fleetId === 'hunter')!;
    while (sim.time < 150 && !sim.events.some((e) => e.type === 'stealth_venting')) sim.step();
    const vent = sim.events.find((e) => e.type === 'stealth_venting' && e.shipId === f.id)!;
    expect(vent).toBeDefined();
    expect(vent.t).toBeGreaterThanOrEqual(f.stealth!.capacity - SIM_DT);
    expect(vent.t).toBeLessThanOrEqual(f.stealth!.capacity + 2 * SIM_DT);
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.shipId === f.id)).toBe(false);
    const revealed = sim.events.find((e) => e.type === 'stealth_revealed' && e.t === vent.t);
    expect(revealed && revealed.type === 'stealth_revealed' ? revealed.reason : undefined).toBe('venting');
    // Venting lasts ventTime, then the sink is empty and the hull silent again.
    while (!sim.events.some((e) => e.type === 'stealth_engaged' && e.t > vent.t)) {
      sim.step();
      expect(sim.time).toBeLessThan(vent.t + f.stealth!.ventTime + 1);
    }
    const engaged = sim.events.find((e) => e.type === 'stealth_engaged' && e.t > vent.t)!;
    expect(engaged.t).toBeCloseTo(vent.t + f.stealth!.ventTime, 1);
    expect(f.stealth!.state).toBe('silent');
    expect(f.stealth!.sinkHeat).toBe(0);

    // Chosen: with every enemy far beyond reach, the hunter vents once the sink is half full.
    const far = fleet('far', 'cerberus', rules, { counts: { cerberus_cruiser: 1 }, name: 'Far', side: 'B', formation: 'line_abreast', position: v3(0, 0, 160), mult: 1, initialOrder: { order: 'hold_formation' } });
    const lone = new BattleSimulation(config([hunterFleet('alliance_frigate_thanix', 0, { order: 'hold_formation' }), far]));
    const g = lone.ships.find((s) => s.fleetId === 'hunter')!;
    while (lone.time < 100 && !lone.events.some((e) => e.type === 'stealth_venting')) lone.step();
    const chosen = lone.events.find((e) => e.type === 'stealth_venting')!;
    expect(chosen).toBeDefined();
    expect(chosen.t).toBeCloseTo(STEALTH_VENT_FRACTION * g.stealth!.capacity, 1);
  });
});

describe('the hunter doctrine', () => {
  it('a stealth frigate ordered to attack completes at least two strike passes in 180 s against an undamaged cruiser line', () => {
    const line = fleet('line', 'cerberus', rules, { counts: { cerberus_cruiser: 4 }, name: 'Line', side: 'B', formation: 'line_abreast', position: v3(0, 0, 30), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([hunterFleet('normandy_sr2', -30), line]));
    expect(sim.issueOrders('hunter', { order: 'attack' })).toBe('issued');
    const n = sim.ships.find((s) => s.fleetId === 'hunter')!;
    while (sim.time < 180 && !sim.finished) sim.step();
    // Each pass ends with one Thanix strike at close range; passes are separated by the break-away and re-stealth.
    const strikes = sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === n.id && e.kind === 'thanix' && e.t <= 180).map((e) => e.t);
    const passes = strikes.filter((t, i) => i === 0 || t - strikes[i - 1] >= 10);
    expect(passes.length).toBeGreaterThanOrEqual(2);
    // Never a line ship: the hunter goes silent again between passes.
    expect(sim.events.some((e) => e.type === 'stealth_engaged' && e.shipId === n.id && e.t > passes[0] && e.t < passes[1])).toBe(true);
  });

  it('disengage (retreat) keeps a hunter silent: it never fires', () => {
    const prey = fleet('prey', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Prey', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { fightersDeployed: false } });
    const sim = new BattleSimulation(config([hunterFleet('alliance_frigate_thanix', -20, { order: 'retreat' }), prey]));
    const f = sim.ships.find((s) => s.fleetId === 'hunter')!;
    for (let i = 0; i < 1200; i++) sim.step();
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.shipId === f.id)).toBe(false);
    expect(sim.events.some((e) => e.type === 'stealth_revealed' && e.shipId === f.id && e.reason === 'fired')).toBe(false);
  });

  it('exactly one Normandy exists in every scenario that fields it, under every preset', () => {
    for (const s of SCENARIOS.filter((x) => x.id !== 'custom')) {
      for (const r of PRESETS) {
        const cfg = s.build(r, 1, {});
        const n = cfg.fleets.reduce((a, f) => a + f.ships.filter((x) => x.classId === 'normandy_sr2').reduce((b, x) => b + x.count, 0), 0);
        expect(n, `${s.id} under ${r.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the stealth events are deterministic', () => {
    const run = (): string => {
      const sim = destroyerHunt(3);
      for (let i = 0; i < 2400; i++) sim.step();
      return JSON.stringify(sim.events.filter((e) => e.type.startsWith('stealth') || (e.type === 'weapon_fired' && e.shipId.startsWith('hunter'))));
    };
    const a = run();
    expect(a).toBe(run());
    expect(a).toContain('stealth_revealed');
    expect(a).toContain('stealth_engaged');
  });
});

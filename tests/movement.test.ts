import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { buildScenario, fleet } from '@/scenarios';
import { slotToWorld } from '@/simulation/formations';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { MOVEMENT, SPINAL_STANDOFF, fleetMotion, stationOf } from '@/simulation/movement';
import type { BattleConfig, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { duelConfig, mute } from './support/calibration';
import { yieldToLoop } from './support/async';

/**
 * Fleet movement looks like Mass Effect, not a spinning plate (brief §8.1, AP §19 8.1; WORK_BREAKDOWN.md T10, §1.6.3),
 * plus the owner's regression requirements (INTEGRATION_NOTES.md): formation cohesion and a stable standoff band.
 */

/**
 * Hulls that keep a formation station (the angular-momentum and cohesion measures are about the formation). Off
 * station by design: stealth hunters, withdrawing hulls and — since CORE T12 — hulls on an interpose cover mission
 * (Reaper destroyers escorting a damaged capital, AP §10), which follow their protectee. Every non-fighter's own path
 * stays bounded by the 360° check below.
 */
const stationKeeper = (s: ShipState): boolean => s.alive && !s.escaped && s.role !== 'fighter' && !s.stealth && !s.withdrawing && !s.interpose && s.maxSpeed > 0;

const yawOf = (x: number, z: number): number => Math.atan2(x, z);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

interface Trace {
  maxHeadingRate: number;
  /** Mean angular rate of the stations about the anchor per fleet per 10 s window after first contact. */
  windows: { fleet: string; t: number; omega: number }[];
  /** Largest one-way turn of a non-fighter's path (rad). */
  maxPathTurn: number;
  /** Largest winding of a fighter round its current hull target (rad). */
  maxFighterWinding: number;
  firstContact: number;
}

/** Battle of Earth canon seed 42 for 120 s, sampled every step. */
async function traceEarth(): Promise<Trace> {
  const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 42));
  const prevStation = new Map<string, { x: number; z: number; tick: number }>();
  const prevHeading = new Map<string, number>();
  const pathTurn = new Map<string, number>();
  const lastYaw = new Map<string, number>();
  const winding = new Map<string, { target: string; angle: number; acc: number }>();
  const acc = new Map<string, { sum: number; n: number; start: number }>();
  const windows: Trace['windows'] = [];
  let maxHeadingRate = 0;
  let maxPathTurn = 0;
  let maxFighterWinding = 0;
  let firstContact = -1;
  /** Each fleet's own first contact (a member fired at a hull or was hit): a wave still running in is not yet "in contact". */
  const contact = new Map<string, number>();
  let ei = 0;
  while (sim.time < 120) {
    sim.step();
    if (sim.tick % 200 === 0) await yieldToLoop();
    for (; ei < sim.events.length; ei++) {
      const e = sim.events[ei];
      if (e.type === 'weapon_fired' && sim.getShip(e.targetId)) {
        if (firstContact < 0) firstContact = e.t;
        const f = sim.getShip(e.shipId)!.fleetId;
        if (!contact.has(f)) contact.set(f, e.t);
      }
      if (e.type === 'projectile_impact') {
        const f = sim.getShip(e.targetId)?.fleetId;
        if (f && !contact.has(f)) contact.set(f, e.t);
      }
    }
    for (const f of sim.fleets.values()) {
      // Formation heading turn rate.
      const yaw = yawOf(f.heading.x, f.heading.z);
      const prev = prevHeading.get(f.spec.id);
      if (prev !== undefined) maxHeadingRate = Math.max(maxHeadingRate, Math.abs(wrap(yaw - prev)) / SIM_DT);
      prevHeading.set(f.spec.id, yaw);
      // Angular rate of the formation about its anchor: (Σ (r × v)·ŷ) / Σ |r|² over its station keepers' stations (their
      // places in the formation: a slot on the anchor for a group capital, the capital's position plus the escort's
      // offset for an escort), relative to the anchor's motion — the turntable itself (brief §8.1). The hulls' own
      // manoeuvres off their stations by design (a screen leaning in on its lanes, a hull moving up, a group re-forming
      // after a loss) are not the formation turning; each hull's own path is held to 360° below.
      const c = contact.get(f.spec.id);
      const av = fleetMotion(f).anchorVel;
      let num = 0;
      let den = 0;
      for (const s of sim.membersOf(f.spec.id)) {
        if (!stationKeeper(s)) continue;
        const st = stationOf(sim, s, f).pos;
        const prev = prevStation.get(s.id);
        prevStation.set(s.id, { x: st.x, z: st.z, tick: sim.tick });
        if (c === undefined || sim.time < c || !prev || prev.tick !== sim.tick - 1) continue;
        const rx = st.x - f.anchor.x;
        const rz = st.z - f.anchor.z;
        const vx = (st.x - prev.x) / SIM_DT - av.x;
        const vz = (st.z - prev.z) / SIM_DT - av.z;
        num += rz * vx - rx * vz;
        den += rx * rx + rz * rz;
      }
      if (c === undefined || sim.time < c) continue;
      if (den < 1) continue;
      const a = acc.get(f.spec.id) ?? { sum: 0, n: 0, start: sim.time };
      a.sum += num / den;
      a.n++;
      if (sim.time - a.start >= 10) {
        windows.push({ fleet: f.spec.id, t: a.start, omega: a.sum / a.n });
        acc.set(f.spec.id, { sum: 0, n: 0, start: sim.time });
      } else acc.set(f.spec.id, a);
    }
    for (const s of sim.ships) {
      if (!s.alive || s.escaped) continue;
      const sp = Math.hypot(s.vel.x, s.vel.z);
      if (s.role !== 'fighter') {
        // Path turning of a non-fighter (one way) while it flies (≥ 25 % of its top speed); slow repositioning
        // between station points and a reversal through a stop start a new leg rather than continue a turn.
        if (sp < 0.25 * s.maxSpeed) {
          lastYaw.delete(s.id);
          continue;
        }
        const y = yawOf(s.vel.x, s.vel.z);
        const ly = lastYaw.get(s.id);
        if (ly !== undefined) {
          const t = (pathTurn.get(s.id) ?? 0) + wrap(y - ly);
          pathTurn.set(s.id, t);
          maxPathTurn = Math.max(maxPathTurn, Math.abs(t));
        }
        lastYaw.set(s.id, y);
      } else if (s.targetId) {
        // Winding of a fighter round the hull it is attacking (strafing passes, never an orbit).
        const t = sim.getShip(s.targetId);
        if (!t || t.role === 'fighter') continue;
        const ang = Math.atan2(s.pos.x - t.pos.x, s.pos.z - t.pos.z);
        const w = winding.get(s.id);
        if (!w || w.target !== t.id) winding.set(s.id, { target: t.id, angle: ang, acc: 0 });
        else {
          w.acc += wrap(ang - w.angle);
          w.angle = ang;
          maxFighterWinding = Math.max(maxFighterWinding, Math.abs(w.acc));
        }
      }
    }
  }
  return { maxHeadingRate, windows, maxPathTurn, maxFighterWinding, firstContact };
}

const rules = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'movement', name: 'Movement', scenarioId: 'custom', seed, rules, fleets, environment: 'deep_space', maxDuration: 600, perspectiveSide: 'A', objective: 'Test.' });

describe('fleet movement: lines, not wheels (Battle of Earth canon seed 42, 120 s)', () => {
  let trace: Trace;
  it('heading change rate ≤ 0.06 rad/s for every fleet', async () => {
    trace = await traceEarth();
    expect(trace.firstContact).toBeGreaterThan(0);
    expect(trace.maxHeadingRate).toBeLessThanOrEqual(0.06);
    expect(MOVEMENT.headingRateRad).toBeLessThanOrEqual(0.06);
  }, 120_000);

  it('mean angular rate of each formation (its stations) about its anchor < 0.02 rad/s over every 10 s window after its first contact', () => {
    expect(trace.windows.length).toBeGreaterThan(10);
    for (const w of trace.windows) expect(Math.abs(w.omega), `${w.fleet} @ ${w.t.toFixed(0)} s`).toBeLessThan(0.02);
  });

  it('no non-fighter path turns more than 360° one way; no fighter completes an orbit of the hull it attacks', () => {
    expect(trace.maxPathTurn).toBeLessThanOrEqual(2 * Math.PI);
    expect(trace.maxFighterWinding).toBeLessThan(2 * Math.PI);
  });
});

describe('formation cohesion and stable engagement range (owner regression, INTEGRATION_NOTES.md)', () => {
  it('a line holds its stations: the mean slot error stays small and the spacing varies by role and layer', async () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 7, { fleet_scaling: 'fixed' }));
    const f = sim.fleets.get('alliance-tf')!;
    let worst = 0;
    for (let i = 0; i < 1600; i++) {
      sim.step();
      if (i % 200 === 0) await yieldToLoop();
      if (sim.time < 20 || i % 20 !== 0) continue;
      const keepers = sim.membersOf('alliance-tf').filter((s) => stationKeeper(s) && s.role !== 'frigate' && s.role !== 'carrier');
      if (keepers.length < 4) break;
      let err = 0;
      for (const s of keepers) {
        const slot = slotToWorld(f.anchor, f.heading, s.slot);
        err += Math.hypot(s.pos.x - slot.x, s.pos.y - slot.y, s.pos.z - slot.z);
      }
      worst = Math.max(worst, err / keepers.length);
    }
    // Hulls may lean up to the 2 km leash toward a target out of range; the line never dissolves.
    expect(worst).toBeLessThan(2.5);
    // Not a cube: the formation's distinct vertical layers and spacings differ by role.
    const slots = sim.ships.filter((s) => s.fleetId === 'alliance-tf' && s.role !== 'fighter').map((s) => s.slot);
    expect(new Set(slots.map((p) => Math.round(p.y * 10))).size).toBeGreaterThan(2);
  }, 120_000);

  it('a dreadnought line closes to the outer band of its spinal guns and holds it for 60 s once reached', async () => {
    const sim = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 2 }, b: { reaper_capital: 1 }, seed: 1, distanceKm: 80, maxDuration: 400 }));
    mute(sim, 'B');
    sim.issueOrders('custom-b', { order: 'hold_formation' });
    const dns = sim.ships.filter((s) => s.role === 'dreadnought');
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    // A stationary target (it only slews), so the band measures the line's own standoff.
    cap.maxSpeed = 0;
    const spinal = dns[0].weapons.find((w) => w.def.antiCapital && w.def.arc <= 20)!.def.range;
    const [lo, hi] = SPINAL_STANDOFF.band;
    const inBand = (d: ShipState): boolean => {
      const r = Math.hypot(d.pos.x - cap.pos.x, d.pos.y - cap.pos.y, d.pos.z - cap.pos.z) / spinal;
      return r >= lo - 0.05 && r <= hi + 0.05;
    };
    let reached = -1;
    while (sim.time < 300 && cap.alive) {
      sim.step();
      if (sim.tick % 200 === 0) await yieldToLoop();
      if (reached < 0 && dns.every(inBand)) reached = sim.time;
      if (reached >= 0) {
        for (const d of dns) expect(inBand(d), `${d.id} at ${sim.time.toFixed(1)} s`).toBe(true);
        if (sim.time - reached >= 60) break;
      }
    }
    expect(reached).toBeGreaterThan(0);
    expect(sim.time - reached).toBeGreaterThanOrEqual(60);
  }, 120_000);

  it('a broadside line turns its flank to the enemy once locked; a static fleet never turns', () => {
    const line = fleet('line', 'alliance', rules, { counts: { alliance_cruiser: 4 }, name: 'Line', formation: 'broadside_line', position: v3(0, 0, -20), mult: 1 });
    const foe = fleet('foe', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Foe', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([line, foe]));
    // Both sides silent, so the battle runs the full minute: since brief §22 the line's screen leans in on its lanes and
    // its four cruisers killed the lone destroyer 28 s in, which ended the battle before the turn was complete.
    mute(sim, 'B');
    mute(sim, 'A');
    const f = sim.fleets.get('line')!;
    expect(f.doctrineFacing).toBe('broadside');
    for (let i = 0; i < 1600 && !f.headingLocked; i++) sim.step();
    expect(f.headingLocked).toBe(true);
    for (let i = 0; i < 1200; i++) sim.step();
    // The heading is ~90° off the bearing: the fleet's +x side (the escorts' side) faces the enemy.
    const b = f.approachBearing;
    expect(Math.abs(f.heading.x * b.x + f.heading.z * b.z)).toBeLessThan(0.1);
  }, 60_000);
});

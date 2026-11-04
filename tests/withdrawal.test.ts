import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { WEAPONS } from '@/data/weapons';
import { buildScenario, fleet, FLEET_SCALING_KEY } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { WITHDRAWAL } from '@/simulation/movement';
import type { BattleConfig, FleetSpec, Side } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { yieldToLoop } from './support/async';

/**
 * Nobody sits still, nobody runs (brief §8.6, AP §19 8.6; WORK_BREAKDOWN.md T10, §1.6.3) and the owner's regression
 * requirements (INTEGRATION_NOTES.md): non-retreat and sustained combat.
 */

const fixed = { [FLEET_SCALING_KEY]: 'fixed' };
const rules = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'withdrawal', name: 'Withdrawal', scenarioId: 'custom', seed, rules, fleets, environment: 'deep_space', maxDuration: 600, perspectiveSide: 'A', objective: 'Test.' });

interface ReferenceTrace {
  firstContact: number;
  maxIdleFraction: Record<Side, number>;
  escapedNonFighters: number;
  reaperWithdrawals: number;
  /** The longest gap between two weapon_fired events after first contact (until the battle ends). */
  longestSilence: number;
  reason: string;
}

/** The canon reference engagement (seed 7) to its end, traced every step. */
async function traceReference(rulesId: string, seed: number): Promise<ReferenceTrace> {
  const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', rulesId, seed, fixed));
  const lastActive = new Map<string, number>();
  const maxIdleFraction: Record<Side, number> = { A: 0, B: 0 };
  let firstContact = -1;
  let lastFire = -1;
  let longestSilence = 0;
  let reaperWithdrawals = 0;
  let ei = 0;
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 200 === 0) await yieldToLoop();
    for (; ei < sim.events.length; ei++) {
      const e = sim.events[ei];
      if (e.type !== 'weapon_fired') continue;
      if (firstContact < 0 && sim.getShip(e.targetId)) firstContact = e.t;
      if (firstContact >= 0) {
        if (lastFire >= 0) longestSilence = Math.max(longestSilence, e.t - lastFire);
        lastFire = e.t;
      }
      lastActive.set(e.shipId, e.t);
    }
    for (const s of sim.ships) {
      if (!s.alive || s.escaped) continue;
      if (s.faction === 'reaper' && s.withdrawing) reaperWithdrawals++;
      // Active = moving at ≥ 5 % of top speed, or firing (above); a hull just deployed starts active.
      if (!lastActive.has(s.id) || Math.hypot(s.vel.x, s.vel.y, s.vel.z) >= 0.05 * s.maxSpeed) lastActive.set(s.id, sim.time);
    }
    if (firstContact < 0 || sim.time < firstContact + 10) continue;
    for (const side of ['A', 'B'] as Side[]) {
      const live = sim.ships.filter((s) => s.side === side && s.alive && !s.escaped && s.role !== 'fighter');
      const foes = sim.ships.filter((s) => s.side !== side && s.alive && !s.escaped && s.role !== 'fighter').length;
      // A fraction of a handful of survivors is not the measure (one idle hull of two is 50 %), and a mop-up of the
      // enemy's last one or two hulls is not an engagement a whole line can reach: the rule is checked while the side
      // still fields ten hulls and the enemy at least three.
      if (live.length < 10 || foes < 3) continue;
      // Stationary (speed < 5 % of max) and silent (no weapon fired) for the last 10 s.
      const idle = live.filter((s) => sim.time - (lastActive.get(s.id) ?? 0) >= 10).length;
      maxIdleFraction[side] = Math.max(maxIdleFraction[side], idle / live.length);
    }
  }
  return {
    firstContact,
    maxIdleFraction,
    escapedNonFighters: sim.ships.filter((s) => s.escaped && s.role !== 'fighter').length,
    reaperWithdrawals,
    longestSilence,
    reason: sim.result!.reason,
  };
}

describe('nobody sits still, nobody runs (reference engagement)', () => {
  it.each([
    ['canon_me3', 7],
    ['prime_apex', 7],
  ] as const)('%s seed %i: ≤ 10 % of a side idle for 10 s after contact; nobody but recovered craft escapes; no Reaper withdraws; fire never stops for 10 s', async (rulesId, seed) => {
    const t = await traceReference(rulesId, seed);
    expect(t.firstContact).toBeGreaterThan(0);
    expect(t.maxIdleFraction.A).toBeLessThanOrEqual(0.1);
    expect(t.maxIdleFraction.B).toBeLessThanOrEqual(0.1);
    expect(t.escapedNonFighters).toBe(0);
    expect(t.reaperWithdrawals).toBe(0);
    expect(t.longestSilence).toBeLessThan(10);
  }, 120_000);
});

describe('tactical withdrawal', () => {
  it('a withdrawing cruiser falls back to its station behind the line, its barriers rise, and it re-engages', () => {
    const line = fleet('line', 'alliance', rules, { counts: { alliance_cruiser: 2 }, name: 'Line', formation: 'line_abreast', position: v3(0, 0, -20), mult: 1 });
    const foe = fleet('foe', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Foe', side: 'B', position: v3(0, 0, 40), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([line, foe]));
    for (const w of sim.ships.find((s) => s.role === 'reaper_destroyer')!.weapons) w.cooldown = Infinity;
    const c = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
    c.hull = c.maxHull * 0.2;
    c.barriers = c.maxBarriers * 0.1;
    let withdrewAt = -1;
    let barriersAtWithdrawal = 0;
    let reengagedAt = -1;
    let barriersAtReengage = 0;
    while (sim.time < 120 && reengagedAt < 0) {
      sim.step();
      if (withdrewAt < 0 && c.withdrawing) {
        withdrewAt = sim.time;
        barriersAtWithdrawal = c.barriers;
        // The station is behind the line.
        const f = sim.fleets.get('line')!;
        const st = c.recoveryStation!;
        expect((st.x - f.anchor.x) * f.heading.x + (st.z - f.anchor.z) * f.heading.z).toBeLessThan(0);
      }
      if (withdrewAt >= 0 && !c.withdrawing) {
        reengagedAt = sim.time;
        barriersAtReengage = c.barriers;
      }
    }
    expect(withdrewAt).toBeGreaterThanOrEqual(0);
    expect(sim.events.some((e) => e.type === 'ship_withdrawing' && e.shipId === c.id)).toBe(true);
    expect(reengagedAt).toBeGreaterThan(withdrewAt);
    expect(reengagedAt - withdrewAt).toBeGreaterThanOrEqual(WITHDRAWAL.reengageSeconds);
    expect(barriersAtReengage).toBeGreaterThan(barriersAtWithdrawal);
    expect(barriersAtReengage).toBeGreaterThanOrEqual(WITHDRAWAL.reengageBarrierFraction * c.maxBarriers - 1e-6);
    expect(c.escaped).toBe(false);
  });

  it('the fleet-wide withdraw order sends every hull to its station; they recover and return; nobody escapes', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 5, fixed));
    for (let i = 0; i < 600; i++) sim.step();
    expect(sim.issueOrders('alliance-tf', { order: 'withdraw' })).toBe('issued');
    const hulls = sim.ships.filter((s) => s.fleetId === 'alliance-tf' && s.alive && s.role !== 'fighter');
    expect(hulls.every((s) => s.withdrawing)).toBe(true);
    expect(sim.events.filter((e) => e.type === 'ship_withdrawing').length).toBeGreaterThanOrEqual(hulls.length);
    for (let i = 0; i < 1400; i++) sim.step();
    expect(sim.ships.some((s) => s.fleetId === 'alliance-tf' && s.alive && s.role !== 'fighter' && !s.withdrawing)).toBe(true);
    expect(sim.ships.filter((s) => s.escaped && s.role !== 'fighter').length).toBe(0);
  });

  it('the escape mechanic is gone: checkEscapes no longer exists and only recovered craft are ever escaped', () => {
    expect((BattleSimulation.prototype as unknown as Record<string, unknown>).checkEscapes).toBeUndefined();
  });

  it('a side below 5 % of its starting points with no capital hull left is combat-ineffective and the battle ends', () => {
    const a = fleet('a', 'alliance', rules, { counts: { alliance_dreadnought: 2, alliance_frigate: 1 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -20), mult: 1 });
    const b = fleet('b', 'reaper', rules, { counts: { reaper_capital: 1 }, name: 'B', side: 'B', position: v3(0, 0, 40), mult: 1 });
    const sim = new BattleSimulation(config([a, b]));
    sim.step();
    const reaper = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const beam = reaper.weapons.find((w) => w.def.id === WEAPONS.reaper_capital_beam.id)!.def;
    for (const dn of sim.ships.filter((s) => s.role === 'dreadnought')) sim.applyHit(reaper, dn, beam, 1e9, dn.pos);
    expect(sim.finished).toBe(false);
    sim.step();
    expect(sim.finished).toBe(true);
    expect(sim.result!.winner).toBe('B');
    expect(sim.result!.reason).toMatch(/combat-ineffective/);
    // The surviving frigate is still alive: the battle was judged, not fought to the last hull.
    expect(sim.ships.find((s) => s.role === 'frigate')!.alive).toBe(true);
  });
});

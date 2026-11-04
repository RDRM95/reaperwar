import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { WEAPONS } from '@/data/weapons';
import { buildScenario, fleet, FLEET_SCALING_KEY } from '@/scenarios';
import { SLEW_TAU, VERTICAL_SLEW_S, chooseTarget, slewFactor, slewSeconds } from '@/simulation/ai';
import { BattleSimulation, IDLE_RETRY_S } from '@/simulation/battle';
import { WITHDRAWAL } from '@/simulation/movement';
import { detectable } from '@/simulation/stealth';
import type { BattleConfig, FleetSpec, ShipState, Side } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { yieldToLoop } from './support/async';

/**
 * Nobody sits still, nobody runs (brief §8.6, AP §19 8.6; WORK_BREAKDOWN.md T10, §1.6.3) and the owner's regression
 * requirements (INTEGRATION_NOTES.md): non-retreat and sustained combat. The idle rule is read per hull (CORE chunk 4,
 * after the T10 verification: the side-fraction reading with its ten-hull filter hid a Reaper capital silent for 22 s).
 */

const fixed = { [FLEET_SCALING_KEY]: 'fixed' };
const rules = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'withdrawal', name: 'Withdrawal', scenarioId: 'custom', seed, rules, fleets, environment: 'deep_space', maxDuration: 600, perspectiveSide: 'A', objective: 'Test.' });

/** Longest-range anti-ship mount of a hull that still has rounds (its main battery's reach). */
const reachOf = (s: ShipState): number => {
  let r = 0;
  for (const w of s.weapons) if (!w.def.antiSmall && (w.ammo === undefined || w.ammo > 0) && w.def.range > r) r = w.def.range;
  return r;
};

/** A mount in a firing cycle: a beam burning, a charge, or an anti-ship mount still reloading from its last shot. */
const cycling = (s: ShipState): boolean =>
  s.weapons.some((w) => !w.def.antiSmall && (w.ammo === undefined || w.ammo > 0) && (w.beamRemaining > 0 || w.charging !== undefined || w.cooldown > IDLE_RETRY_S + 1e-9));

interface IdleSpan {
  seconds: number;
  ship: string;
  from: number;
}

interface ReferenceTrace {
  firstContact: number;
  /** Longest span any hull with a detectable enemy hull inside its reach stayed stationary and silent, per side. */
  longestIdle: Record<Side, IdleSpan>;
  /** Longest span any Reaper hull stayed stationary and silent with any enemy hull left (Reapers never idle). */
  longestReaperIdle: IdleSpan;
  escapedNonFighters: number;
  reaperWithdrawals: number;
  /** The longest gap between two weapon_fired events after first contact (until the battle ends). */
  longestSilence: number;
  reason: string;
}

/**
 * A battle to its end, traced every step. Idle (brief §8.6: "every unit with a weapon in range is firing or moving to
 * get a solution"): stationary (speed < 5 % of top speed) and silent — no weapon fired this step and no anti-ship
 * mount in a firing cycle — while a detectable enemy hull sits inside the hull's reach. The rule is read per hull, so
 * it means the same for the 12-hull Reaper side, its last three capitals and a 56-hull line (the side-fraction
 * reading with a ten-hull filter checked the Reaper side only in the first 30 s after contact).
 */
async function traceBattle(sim: BattleSimulation): Promise<ReferenceTrace> {
  const idleSince = new Map<string, number>();
  const longestIdle: Record<Side, IdleSpan> = { A: { seconds: 0, ship: '', from: 0 }, B: { seconds: 0, ship: '', from: 0 } };
  const reaperSince = new Map<string, number>();
  let longestReaperIdle: IdleSpan = { seconds: 0, ship: '', from: 0 };
  let firstContact = -1;
  let lastFire = -1;
  let longestSilence = 0;
  let reaperWithdrawals = 0;
  let ei = 0;
  while (!sim.finished) {
    sim.step();
    if (sim.tick % 200 === 0) await yieldToLoop();
    const firedNow = new Set<string>();
    for (; ei < sim.events.length; ei++) {
      const e = sim.events[ei];
      if (e.type !== 'weapon_fired') continue;
      if (firstContact < 0 && sim.getShip(e.targetId)) firstContact = e.t;
      if (firstContact >= 0) {
        if (lastFire >= 0) longestSilence = Math.max(longestSilence, e.t - lastFire);
        lastFire = e.t;
      }
      firedNow.add(e.shipId);
    }
    for (const s of sim.ships) if (s.alive && !s.escaped && s.faction === 'reaper' && s.withdrawing) reaperWithdrawals++;
    if (firstContact < 0) continue;
    for (const s of sim.ships) {
      if (s.role === 'fighter') continue;
      const live = s.alive && !s.escaped;
      const still = live && Math.hypot(s.vel.x, s.vel.y, s.vel.z) < 0.05 * s.maxSpeed && !firedNow.has(s.id) && !cycling(s);
      const foes = live ? sim.enemiesOfShip(s).filter((e) => e.role !== 'fighter') : [];
      const reach = reachOf(s);
      const inReach = still && foes.some((e) => detectable(s, e) && Math.hypot(e.pos.x - s.pos.x, e.pos.y - s.pos.y, e.pos.z - s.pos.z) <= reach);
      const track = (map: Map<string, number>, idle: boolean, record: (span: IdleSpan) => void): void => {
        const since = map.get(s.id);
        if (idle && since === undefined) map.set(s.id, sim.time);
        if (!idle && since !== undefined) map.delete(s.id);
        const from = map.get(s.id);
        if (from !== undefined) record({ seconds: sim.time - from, ship: `${s.name} (${s.classId})`, from });
      };
      track(idleSince, inReach, (span) => {
        if (span.seconds > longestIdle[s.side].seconds) longestIdle[s.side] = span;
      });
      if (s.faction === 'reaper')
        track(reaperSince, still && foes.length > 0, (span) => {
          if (span.seconds > longestReaperIdle.seconds) longestReaperIdle = span;
        });
    }
  }
  return {
    firstContact,
    longestIdle,
    longestReaperIdle,
    escapedNonFighters: sim.ships.filter((s) => s.escaped && s.role !== 'fighter').length,
    reaperWithdrawals,
    longestSilence,
    reason: sim.result!.reason,
  };
}

describe('nobody sits still, nobody runs', () => {
  it.each([
    ['alliance_fleet_engagement', 'canon_me3', 7],
    ['alliance_fleet_engagement', 'prime_apex', 7],
    ['battle_of_earth', 'canon_me3', 42],
  ] as const)('%s %s seed %i: no hull with an enemy in reach sits stationary and silent for 10 s; Reapers never idle; nobody but recovered craft escapes; no Reaper withdraws; fire never stops for 10 s', async (scenario, rulesId, seed) => {
    const t = await traceBattle(new BattleSimulation(buildScenario(scenario, rulesId, seed, scenario === 'alliance_fleet_engagement' ? fixed : {})));
    expect(t.firstContact).toBeGreaterThan(0);
    expect(t.longestIdle.A.seconds, `${t.longestIdle.A.ship} from ${t.longestIdle.A.from.toFixed(1)} s`).toBeLessThan(10);
    expect(t.longestIdle.B.seconds, `${t.longestIdle.B.ship} from ${t.longestIdle.B.from.toFixed(1)} s`).toBeLessThan(10);
    expect(t.longestReaperIdle.seconds, `${t.longestReaperIdle.ship} from ${t.longestReaperIdle.from.toFixed(1)} s`).toBeLessThan(10);
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

describe('slew-aware target choice (brief §8.6: every unit with a weapon in range fires or moves to get a solution)', () => {
  it('a slow-turning hull scores a target its mounts already bear on above an equal one behind it', () => {
    const reaper = fleet('r', 'reaper', rules, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 0), mult: 1, initialOrder: { fightersDeployed: false, order: 'hold_formation' } });
    const line = fleet('a', 'alliance', rules, { counts: { alliance_frigate: 2 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -30), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([line, reaper]));
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const [ahead, behind] = sim.ships.filter((s) => s.role === 'frigate');
    cap.pos = v3(0, 0, 0);
    cap.heading = v3(0, 0, 1);
    ahead.pos = v3(0, 0, 10);
    behind.pos = v3(0, 0, -10);
    // In the ±35° beam arc: no turn. Dead astern: (180° − 35° − 0.05 rad) at 6°/s.
    expect(slewSeconds(cap, ahead, 10)).toBe(0);
    const astern = slewSeconds(cap, behind, 10);
    expect(astern).toBeCloseTo((Math.PI - (35 * Math.PI) / 180 - 0.05) / cap.turnRate, 6);
    expect(slewFactor(cap, behind, 10)).toBeCloseTo(SLEW_TAU / (SLEW_TAU + astern), 9);
    // Steeply above the arc-limited beam: turning cannot help.
    behind.pos = v3(0, 8, 6);
    expect(slewSeconds(cap, behind, Math.hypot(8, 6))).toBeGreaterThanOrEqual(VERTICAL_SLEW_S);
    behind.pos = v3(0, 0, -10);
    // Target candidates come from the spatial grid, which step() rebuilds; the hulls were placed by hand.
    sim.grid.rebuild(sim.ships);
    expect(chooseTarget(sim, cap, sim.fleets.get('r')!)).toBe(ahead.id);
    // Mirror the geometry: the choice follows the bow, not the ship order.
    cap.heading = v3(0, 0, -1);
    expect(chooseTarget(sim, cap, sim.fleets.get('r')!)).toBe(behind.id);
  });
});

import { describe, expect, it } from 'vitest';
import { BattleSimulation, PROJECTILE_RANGE_FACTOR } from '@/simulation/battle';
import { scoreTarget } from '@/simulation/ai';
import { SOLUTION, solutionFor } from '@/simulation/solutions';
import type { BattleEvent, Projectile, ShipState } from '@/simulation/types';
import { duelConfig, mute } from './support/calibration';

/** Misses and firing solutions (brief §8.7, AP §19 8.7; WORK_BREAKDOWN.md T10, §1.6.3). */

interface Shot {
  t: number;
  shooter: string;
  hit: boolean;
}

/** Two dreadnoughts against a muted, stationary Reaper capital at the 40 km duel range; every spinal round classified as it leaves the gun. */
function spinalDuel(seed = 1): { sim: BattleSimulation; shots: Shot[]; step: () => void } {
  const sim = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 2 }, b: { reaper_capital: 1 }, seed, maxDuration: 400 }));
  mute(sim, 'B');
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  sim.ships.find((s) => s.role === 'reaper_capital')!.maxSpeed = 0;
  const dns = new Set(sim.ships.filter((s) => s.role === 'dreadnought').map((s) => s.id));
  const seen = new Set<number>();
  const shots: Shot[] = [];
  const step = (): void => {
    sim.step();
    for (const p of sim.projectiles) {
      if (seen.has(p.id) || !dns.has(p.shooterId) || p.weapon.id !== 'alliance_dn_main') continue;
      seen.add(p.id);
      // A round the hit roll sent wide carries its deliberate miss distance; a hit carries none.
      shots.push({ t: sim.time, shooter: p.shooterId, hit: p.missDistance === undefined });
    }
  };
  return { sim, shots, step };
}

const rate = (shots: Shot[], from: number, to: number): number => {
  const w = shots.filter((s) => s.t >= from && s.t < to);
  return w.filter((s) => s.hit).length / Math.max(1, w.length);
};

describe('firing solutions', () => {
  it('opening salvoes mostly miss (< 25 % over the first 6 s); mature fire hits (> 60 % over seconds 20–40), pooled over seeds 1–5', () => {
    // Pooled over five duels: one duel has 20 rounds in the mature window, so a single seed's rate swings by ±10 % on
    // the hit rolls alone (seed 1 alone: 15/20 before brief §22, 9/20 after, at the same pooled rate, 66–69 %).
    const all: Shot[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { sim, shots, step } = spinalDuel(seed);
      while (sim.time < 40) step();
      expect(shots.filter((s) => s.t < 6).length, `seed ${seed}`).toBeGreaterThan(2);
      // The solution itself: q₀ at first contact, near 1 after 20 s of tracking.
      const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
      expect(solutionFor(dn, dn.targetId!), `seed ${seed}`).toBeGreaterThan(0.85);
      all.push(...shots);
    }
    expect(rate(all, 0, 6)).toBeLessThan(0.25);
    expect(rate(all, 20, 40)).toBeGreaterThan(0.6);
    expect(SOLUTION.q0).toBe(0.1);
    expect(SOLUTION.floor).toBe(0.25);
  });

  it('a hard manoeuvre of the target costs the shooter’s solution at least 0.2', () => {
    // Two identical duels; in one the target starts a hard, sustained manoeuvre at 12 s.
    const run = (manoeuvre: boolean): number => {
      const { sim, step } = spinalDuel(2);
      const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
      while (sim.time < 12) step();
      if (manoeuvre) {
        cap.maxSpeed = 0.4;
        sim.issueOrders('custom-b', { order: 'defend_position', position: { x: cap.pos.x / 0.4 + 60, y: 0, z: cap.pos.z / 0.4 } });
      }
      while (sim.time < 16) step();
      const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
      return solutionFor(dn, cap.id);
    };
    const steady = run(false);
    const jinked = run(true);
    expect(steady - jinked).toBeGreaterThanOrEqual(0.2);
  });

  it('near misses flare the barrier edge (projectile_near_miss within 1.6 radii) and long shots keep flying to 2.2 × range', () => {
    const { sim, step } = spinalDuel(3);
    const flight = new Map<number, { p: Projectile; born: number }>();
    let maxFlight = 0;
    const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
    const gun = dn.weapons.find((w) => w.def.id === 'alliance_dn_main')!.def;
    const range = gun.range;
    while (sim.time < 60) {
      step();
      for (const p of sim.projectiles) if (!flight.has(p.id)) flight.set(p.id, { p, born: sim.time });
      for (const [id, f] of flight) {
        if (sim.projectiles.includes(f.p)) maxFlight = Math.max(maxFlight, (sim.time - f.born) * f.p.weapon.projectileSpeed);
        else flight.delete(id);
      }
    }
    const near = sim.events.filter((e): e is Extract<BattleEvent, { type: 'projectile_near_miss' }> => e.type === 'projectile_near_miss');
    expect(near.length).toBeGreaterThan(0);
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')! as ShipState;
    for (const e of near) {
      expect(e.miss).toBeLessThan(1.6 * cap.radiusKm);
      expect(e.miss).toBeGreaterThan(0);
    }
    // A miss streams past and keeps flying well beyond the gun's range (ttl = 2.2 × range / speed + 0.5 s).
    expect(maxFlight).toBeGreaterThan(1.6 * range);
    expect(maxFlight).toBeLessThanOrEqual(PROJECTILE_RANGE_FACTOR * range + 0.5 * gun.projectileSpeed + 0.1);
  });

  it('a maturing solution concentrates fire (scoreTarget += 0.3·q) and the solutions replay identically', () => {
    const { sim, step } = spinalDuel(4);
    while (sim.time < 25) step();
    const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const fleet = sim.fleets.get(dn.fleetId)!;
    const with_ = scoreTarget(sim, dn, fleet, cap, 16.8);
    const q = solutionFor(dn, cap.id);
    dn.solutions = dn.solutions.filter((s) => s.targetId !== cap.id);
    const without = scoreTarget(sim, dn, fleet, cap, 16.8);
    expect(with_).toBeGreaterThan(without);
    expect(q).toBeGreaterThan(0.5);
    const replay = (): string => {
      const d = spinalDuel(5);
      while (d.sim.time < 30) d.step();
      return JSON.stringify([d.shots, d.sim.ships.map((s) => s.solutions)]);
    };
    expect(replay()).toBe(replay());
  });
});

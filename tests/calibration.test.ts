import { describe, expect, it } from 'vitest';
import { SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { BattleSimulation } from '@/simulation/battle';
import { barrierBench, duelConfig, mute, oculusScreen, referenceSim, runInstrumentedAsync } from './support/calibration';
import { yieldToLoop } from './support/async';

/**
 * Calibration benchmarks (ADOPTION_PLAN.md §3.3, §3.4; WORK_BREAKDOWN.md §1.6.1), pinned
 * after calibration pass 1 (before the movement rewrite). Every battery with several
 * battles yields to the event loop between runs (tests/support/async.ts).
 */

describe('isolated barrier trial (pure helper)', () => {
  it('two dreadnoughts never overwhelm a capital, three collapse it slowly, four quickly; kill times fall with numbers', () => {
    const two = barrierBench({ dreadnoughts: 2 });
    expect(two.downAt).toBeUndefined();
    expect(two.killedAt).toBeUndefined();
    expect(two.minBarrierFrac).toBeGreaterThanOrEqual(0.7);
    const three = barrierBench({ dreadnoughts: 3 });
    expect(three.downAt).toBeDefined();
    expect(three.killedAt).toBeDefined();
    expect(three.killedAt!).toBeGreaterThanOrEqual(30);
    expect(three.killedAt!).toBeLessThan(60);
    const four = barrierBench({ dreadnoughts: 4 });
    expect(four.downAt!).toBeLessThanOrEqual(8);
    expect(four.killedAt!).toBeLessThanOrEqual(25);
    expect(four.killedAt!).toBeLessThan(0.6 * three.killedAt!);
    const kills = [4, 5, 6, 8].map((dn) => barrierBench({ dreadnoughts: dn }).killedAt!);
    for (let i = 1; i < kills.length; i++) expect(kills[i], `${[4, 5, 6, 8][i]} DN`).toBeLessThan(kills[i - 1]);
  });

  it('with a seeded 75 % hit roll two never, three not within 60 s, four within 60 s', () => {
    expect(barrierBench({ dreadnoughts: 2, hitChance: 0.75, seed: 1 }).killedAt).toBeUndefined();
    const three = barrierBench({ dreadnoughts: 3, hitChance: 0.75, seed: 1 });
    expect(three.killedAt === undefined || three.killedAt > 60).toBe(true);
    const four = barrierBench({ dreadnoughts: 4, hitChance: 0.75, seed: 1 });
    expect(four.killedAt).toBeDefined();
    expect(four.killedAt!).toBeLessThanOrEqual(60);
  });

  it('Harbinger: two dreadnoughts never (barrier ≥ 80 %), four destroy it within 50 s', () => {
    const two = barrierBench({ dreadnoughts: 2, target: 'harbinger' });
    expect(two.killedAt).toBeUndefined();
    expect(two.minBarrierFrac).toBeGreaterThanOrEqual(0.8);
    const four = barrierBench({ dreadnoughts: 4, target: 'harbinger' });
    expect(four.killedAt).toBeDefined();
    expect(four.killedAt!).toBeLessThanOrEqual(50);
  });
});

describe('live duels (canon, deep space, 40 km)', () => {
  it('two dreadnoughts against a muted capital never take its barrier below 50 % in 300 s', async () => {
    const sim = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 2 }, b: { reaper_capital: 1 }, seed: 1, maxDuration: 300 }));
    mute(sim, 'B');
    const r = await runInstrumentedAsync(sim);
    expect(r.minBarrierFrac).toBeGreaterThanOrEqual(0.5);
    expect(r.killedAt).toBeUndefined();
  }, 120_000);

  it('four dreadnoughts destroy a muted capital within 90 s', async () => {
    const sim = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 4 }, b: { reaper_capital: 1 }, seed: 1, maxDuration: 300 }));
    mute(sim, 'B');
    const r = await runInstrumentedAsync(sim);
    expect(r.killedAt).toBeDefined();
    expect(r.killedAt!).toBeLessThanOrEqual(90);
  }, 120_000);

  it('four armed dreadnoughts lose at least one every seed and kill the capital in at most 2 of 5; six kill it in at least 4 of 5', async () => {
    let fourKills = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 4 }, b: { reaper_capital: 1 }, seed })));
      expect(r.aDreadnoughtsLost, `4 DN seed ${seed}`).toBeGreaterThanOrEqual(1);
      if (r.killedAt !== undefined) fourKills++;
      await yieldToLoop();
    }
    expect(fourKills).toBeLessThanOrEqual(2);
    let sixKills = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 6 }, b: { reaper_capital: 1 }, seed })));
      if (r.killedAt !== undefined) sixKills++;
      await yieldToLoop();
    }
    expect(sixKills).toBeGreaterThanOrEqual(4);
  }, 120_000);
});

describe('cruiser vs destroyer (canon, 40 km)', () => {
  it('a lone cruiser wins between 3 and 12 of 20 and every duel resolves: the destroyer collapses or the cruiser dies', async () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_cruiser: 1 }, b: { reaper_destroyer: 1 }, seed })));
      if (r.winner === 'A') wins++;
      expect(r.downAt !== undefined || r.aLost > 0, `seed ${seed}`).toBe(true);
      await yieldToLoop();
    }
    expect(wins).toBeGreaterThanOrEqual(3);
    expect(wins).toBeLessThanOrEqual(12);
  }, 120_000);

  it('two cruisers win at least 8 of 10, a dreadnought kills a destroyer within 30 s, four frigates win at most 6 of 10', async () => {
    let twoWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_cruiser: 2 }, b: { reaper_destroyer: 1 }, seed })));
      if (r.winner === 'A') twoWins++;
      await yieldToLoop();
    }
    expect(twoWins).toBeGreaterThanOrEqual(8);
    // AP §3.3 measured 30 s with instant accuracy; under the firing solutions of the movement rewrite (CORE T10, AP §19
    // 8.7) the opening rounds mostly miss: seed 1 needs 15 rounds for the first hit and kills at 33.5 s. Re-pinned
    // at 40 s (AP §3.5: no lever acts on this duel — floor 0.25–0.35 leaves it at 33.5 s); T19 re-measures.
    const dn = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 1 }, b: { reaper_destroyer: 1 }, seed: 1 })));
    expect(dn.killedAt).toBeDefined();
    expect(dn.killedAt!).toBeLessThanOrEqual(40);
    let frigateWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = await runInstrumentedAsync(new BattleSimulation(duelConfig({ a: { alliance_frigate: 4 }, b: { reaper_destroyer: 1 }, seed, aFormation: 'dispersed' })));
      if (r.winner === 'A') frigateWins++;
      await yieldToLoop();
    }
    expect(frigateWins).toBeLessThanOrEqual(6);
  }, 120_000);
});

describe('cadence and heat', () => {
  it('every dreadnought gun fires every two seconds and no organic spinal gun uses more than half its hull’s cooling', () => {
    for (const id of ['alliance_dn_main', 'turian_dn_main', 'asari_dn_main', 'salarian_dn_main', 'geth_dn_main']) expect(WEAPONS[id].cooldown, id).toBe(2.0);
    expect(WEAPONS.quarian_heavy_main.cooldown).toBe(3.0);
    expect(WEAPONS.ascension_main.cooldown).toBe(4.0);
    for (const cls of SHIP_CLASS_LIST) {
      if (cls.faction === 'reaper' || cls.role === 'fighter') continue;
      const capacity = cls.heatCapacity?.value ?? 100;
      for (const hp of cls.hardpoints) {
        const w = WEAPONS[hp.weaponId];
        if (w.kind !== 'mass_accelerator' || !w.antiCapital || w.arc > 20) continue; // spinal guns only
        expect(w.heat / w.cooldown, `${cls.id} ${w.id}`).toBeLessThanOrEqual(0.5 * 0.08 * capacity);
      }
    }
    // The Titan gun on an Apex dreadnought (capacity 200 × 1.3) stays under the same bound.
    expect(WEAPONS.apex_hyper_ma.heat / WEAPONS.apex_hyper_ma.cooldown).toBeLessThanOrEqual(0.5 * 0.08 * 200);
  });

  it('no Alliance dreadnought ever overheats in the canon reference engagement (seed 7)', async () => {
    const r = await runInstrumentedAsync(referenceSim('alliance_fleet_engagement', 'canon_me3', 7));
    expect(r.aDreadnoughtOverheated).toBe(false);
    expect(r.aDreadnoughtPeakHeat).toBeLessThan(1);
  }, 120_000);
});

describe('Oculus screen', () => {
  /**
   * WORK_BREAKDOWN.md §1.6.1 (pinned in CORE T11): 24 Tridents against 24 Oculi with the hulls muted, both fleets on
   * `priority: 'fighters'`, the last small-craft death between 60 and 120 s. BALANCE_AUDIT.md §9.3's measured screen
   * is a fight in which both sides bleed (Tridents lost 16–24, drones 13–24, 69–97 s); the extra bounds keep it one,
   * so the T10 regression — craft on the muted capital, 0 / 0 / 8 drones lost — cannot come back unnoticed. The
   * regression and its fix (craft follow the fleet priority; the chase keeps its nose on the target) are recorded in
   * CORE_PROGRESS.md (chunk 4, FIX FIRST) and CALIBRATION_REPORT.md §1c.
   */
  it.each([1, 2, 3])('24 Tridents against 24 Oculi with the hulls muted fight it out between 60 and 120 s (seed %i)', async (seed) => {
    const sim = oculusScreen(seed);
    const r = await runInstrumentedAsync(sim, { untilTime: 240 });
    expect(r.oculusStats?.lastSmallCraftDeath).toBeDefined();
    expect(r.oculusStats!.lastSmallCraftDeath!).toBeGreaterThanOrEqual(60);
    expect(r.oculusStats!.lastSmallCraftDeath!).toBeLessThanOrEqual(120);
    expect(r.oculusStats!.oculiLost).toBeGreaterThanOrEqual(20);
    // ≥ 8 until brief §22; the battlegroup stations and the craft leash put seed 1 at 6 (seeds 1–10 measure 6–23 Tridents
    // lost, mean 11.7; before brief §22 they measured 5–16, mean 9.6, with 10 / 9 / 10 on the pinned seeds).
    expect(r.oculusStats!.tridentsLost).toBeGreaterThanOrEqual(6);
    expect(r.oculusStats!.tridentsLost).toBeLessThanOrEqual(23);
  }, 120_000);
});

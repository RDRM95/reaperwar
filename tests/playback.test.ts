import { describe, expect, it } from 'vitest';
import { BATCH_EVENT_THRESHOLD, MAX_INTERCEPTS, batchEvents } from '@/rendering/eventBatching';
import { CUSTOM_DEFAULT_DISTANCE, CUSTOM_DEFAULT_DURATION, buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleConfig, BattleEvent, BattleResult } from '@/simulation/types';
import {
  BUDGET_FLOOR_MS,
  FAST_BUDGET_CEILING_MS,
  FRAME_SHARE,
  FrameStats,
  MAX_BACKLOG_S,
  MAX_FRAME_DT_S,
  NORMAL_SPEED_INDEX,
  PACED_BUDGET_MAX_MS,
  PLAYBACK_SPEEDS,
  PlaybackClock,
  SLOW_BUDGET_CEILING_MS,
  runToResult,
  type Stepper,
} from '@/ui/playback';
import { LocalSimDriver } from '@/ui/simDriver';
import { yieldToLoop } from './support/async';

/**
 * The playback clock and Fast-forward to result (brief §19.1, src/ui/playback.ts). Time is injected: a fake clock
 * that only moves when a fake simulation step "costs" time, and frame intervals passed in explicitly, so every
 * budget decision below is exact.
 */

class FakeTime {
  t = 0;
  readonly now = (): number => this.t;
}

/** A stand-in for a battle: each step costs `cost` ms of fake time; it finishes after `limit` steps. */
class FakeSim implements Stepper {
  steps = 0;
  constructor(
    private readonly time: FakeTime,
    public cost = 0,
    private readonly limit = Number.POSITIVE_INFINITY,
  ) {}
  get finished(): boolean {
    return this.steps >= this.limit;
  }
  step(): void {
    this.steps++;
    this.time.t += this.cost;
  }
}

const speedIndex = (s: number): number => PLAYBACK_SPEEDS.indexOf(s);
const FRAME_60 = 1 / 60;

/** Paused frames of `intervalMs` with a reported UI cost: they teach the clock the display frame time and the UI cost. */
function settle(clock: PlaybackClock, sim: Stepper, intervalMs: number, uiMs: number, frames = 40): void {
  const paused = clock.paused;
  clock.paused = true;
  for (let i = 0; i < frames; i++) {
    clock.frame(intervalMs / 1000, sim);
    clock.endFrame(uiMs);
  }
  clock.paused = paused;
}

describe('PlaybackClock: clock maths', () => {
  it('offers 0.25×, 0.5×, 1×, 2×, 4×, 8× and starts at 1×', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    const clock = new PlaybackClock();
    expect(clock.speedIndex).toBe(NORMAL_SPEED_INDEX);
    expect(clock.speed).toBe(1);
    expect(clock.fast).toBe(false);
    clock.setSpeed(99);
    expect(clock.speed).toBe(8);
    expect(clock.fast).toBe(true);
    clock.setSpeed(-3);
    expect(clock.speed).toBe(0.25);
    clock.setSpeed(speedIndex(4));
    expect(clock.fast).toBe(true);
  });

  it('runs exactly speed × 20 ticks per real second when the machine keeps up, carrying the fractions', () => {
    for (const speed of PLAYBACK_SPEEDS) {
      const time = new FakeTime();
      const sim = new FakeSim(time, 0.5);
      const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(speed) });
      let maxPerFrame = 0;
      for (let i = 0; i < 600; i++) {
        const r = clock.frame(FRAME_60, sim);
        clock.endFrame(2);
        maxPerFrame = Math.max(maxPerFrame, r.ran);
        expect(r.cut).toBe(false);
        expect(clock.alpha).toBeGreaterThanOrEqual(0);
        expect(clock.alpha).toBeLessThanOrEqual(1);
      }
      // 10 s of frames: speed × 200 ticks, the last fraction of a tick still owed.
      expect(sim.steps).toBe(Math.floor(speed * 200 + 1e-6));
      expect(clock.backlog).toBeLessThan(SIM_DT);
      expect(maxPerFrame).toBe(Math.ceil(speed / 3 - 1e-9));
      expect(clock.shedTotal).toBe(0);
      expect(clock.achieved).toBeCloseTo(speed, 1);
      expect(clock.fallingShort).toBe(false);
    }
  });

  it('runs nothing while paused or in result mode, and resumes at 1× when result mode ends', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    clock.paused = true;
    for (let i = 0; i < 30; i++) expect(clock.frame(FRAME_60, sim).ran).toBe(0);
    clock.paused = false;
    clock.setMode('result');
    for (let i = 0; i < 30; i++) {
      const r = clock.frame(FRAME_60, sim);
      expect(r.running).toBe(false);
      expect(r.ran).toBe(0);
    }
    expect(sim.steps).toBe(0);
    expect(clock.backlog).toBe(0);
    clock.setMode('normal');
    expect(clock.speed).toBe(1);
    for (let i = 0; i < 60; i++) clock.frame(FRAME_60, sim);
    expect(sim.steps).toBe(20);
  });

  it('owes at most MAX_FRAME_DT_S of real time for a stalled frame', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time);
    const clock = new PlaybackClock({ now: time.now });
    clock.frame(30, sim);
    expect(clock.requested).toBeCloseTo(MAX_FRAME_DT_S, 9);
    expect(sim.steps).toBe(MAX_FRAME_DT_S / SIM_DT);
  });

  it('a speed change sheds the backlog owed at the old speed beyond one tick (counted) and restarts the average', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 20);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    settle(clock, sim, 1000 / 60, 4);
    for (let i = 0; i < 20; i++) clock.frame(0.05, sim);
    expect(clock.backlog).toBeGreaterThan(SIM_DT);
    const before = clock.shedTotal;
    const owed = clock.backlog;
    clock.setSpeed(NORMAL_SPEED_INDEX);
    expect(clock.backlog).toBeCloseTo(SIM_DT, 9);
    expect(clock.shedTotal - before).toBeCloseTo(owed - SIM_DT, 9);
    expect(clock.achieved).toBeNaN();
  });
});

describe('PlaybackClock: the adaptive budget', () => {
  it('targets the display frame time minus the measured UI cost, with a 4 ms floor and a 14 ms ceiling at 4× and above', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time);
    const clock = new PlaybackClock({ now: time.now });
    // A 60 Hz display, 5 ms of render and UI per frame.
    settle(clock, sim, 1000 / 60, 5);
    expect(clock.displayFrameMs).toBeCloseTo(1000 / 60, 6);
    expect(clock.uiCostMs).toBeCloseTo(5, 6);
    const expected = FRAME_SHARE * (1000 / 60) - 5;
    expect(clock.budgetMs()).toBeCloseTo(expected, 6);
    clock.setSpeed(speedIndex(8));
    expect(clock.budgetMs()).toBeCloseTo(expected, 6);
    // A UI that fills the frame leaves the floor.
    settle(clock, sim, 1000 / 60, 30);
    expect(clock.budgetMs()).toBe(BUDGET_FLOOR_MS);
    // Long frames that the loop's own work mostly fills (the main thread paces them): 14 ms at 4× and 8×, 40 ms below.
    settle(clock, sim, 200, 110, 80);
    expect(clock.gpuPaced).toBe(false);
    expect(FRAME_SHARE * clock.displayFrameMs - clock.uiCostMs).toBeGreaterThan(SLOW_BUDGET_CEILING_MS);
    expect(clock.budgetMs()).toBe(FAST_BUDGET_CEILING_MS);
    clock.setSpeed(speedIndex(4));
    expect(clock.budgetMs()).toBe(FAST_BUDGET_CEILING_MS);
    clock.setSpeed(speedIndex(2));
    expect(clock.budgetMs()).toBe(SLOW_BUDGET_CEILING_MS);
  });

  it('enforces the budget against the injected clock: a later tick starts only while its estimated cost still fits', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 6);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    settle(clock, sim, 1000 / 60, 2); // budget = 0.85 × 16.7 − 2 = 12.2 ms
    expect(clock.budgetMs()).toBeCloseTo(FRAME_SHARE * (1000 / 60) - 2, 6);
    let cuts = 0;
    for (let i = 0; i < 120; i++) {
      const r = clock.frame(FRAME_60, sim);
      clock.endFrame(2);
      // 6 ms ticks in a 12.2 ms budget: two ticks (12 ms), never a third.
      expect(r.ran).toBeLessThanOrEqual(2);
      expect(r.simMs).toBeLessThanOrEqual(r.budgetMs);
      if (r.cut) cuts++;
    }
    expect(cuts).toBeGreaterThan(100);
    // 2 ticks a frame at 60 fps is 6× for the 8× asked: the clock knows it fell short.
    expect(clock.achieved).toBeCloseTo(6, 1);
    expect(clock.fallingShort).toBe(true);
  });

  it('always runs the first owed tick, so a tick dearer than the budget slows playback instead of stopping it', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 50);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    settle(clock, sim, 1000 / 60, 3);
    for (let i = 0; i < 60; i++) {
      const r = clock.frame(FRAME_60, sim);
      clock.endFrame(3);
      expect(r.ran).toBe(1);
      expect(r.simMs).toBe(50);
    }
    expect(sim.steps).toBe(60);
  });

  it('bounds the backlog to 0.5 s of simulated time, counts what it sheds, and accounts for every requested second', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 10);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    settle(clock, sim, 1000 / 60, 2);
    let shedFrames = 0;
    for (let i = 0; i < 100; i++) {
      const r = clock.frame(0.1, sim); // 0.8 s owed per frame, one 10 ms tick fits
      clock.endFrame(2);
      expect(r.backlog).toBeLessThanOrEqual(MAX_BACKLOG_S + 1e-9);
      if (r.shed > 0) shedFrames++;
    }
    expect(shedFrames).toBeGreaterThan(90);
    expect(clock.backlog).toBeCloseTo(MAX_BACKLOG_S, 9);
    expect(clock.requested - clock.simulated - clock.shedTotal).toBeCloseTo(clock.backlog, 6);
    expect(clock.fallingShort).toBe(true);
  });

  it('learns the display frame time from frames the simulation did not hold up only', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 8);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    settle(clock, sim, 1000 / 60, 4);
    const display = clock.displayFrameMs;
    // Budget-bound frames that run long (8 ms ticks owed faster than they fit) leave the estimate where it was.
    for (let i = 0; i < 100; i++) {
      const r = clock.frame(0.045, sim);
      clock.endFrame(4);
      expect(r.cut).toBe(true);
    }
    expect(clock.displayFrameMs).toBe(display);
  });

  it('grows the budget into the idle time when something else paces the frames, and stops when the main thread is the bottleneck', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 5);
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    // GPU-paced: 700 ms frames whatever the main thread does, 40 ms of render and UI.
    for (let i = 0; i < 60; i++) {
      clock.frame(0.7, sim);
      clock.endFrame(40);
    }
    expect(clock.gpuPaced).toBe(true);
    expect(clock.budgetMs()).toBe(Math.min(PACED_BUDGET_MAX_MS, 0.5 * clock.frameMs - clock.uiCostMs));
    expect(clock.budgetMs()).toBeGreaterThan(200);
    const r = clock.frame(0.7, sim);
    expect(r.ran).toBeGreaterThan(30); // vs. 3 ticks at the 14 ms ceiling
    // Main-thread bound: each frame lasts exactly as long as the loop's own work, nothing idles.
    for (let i = 0; i < 60; i++) {
      const f = clock.last;
      clock.endFrame(40);
      clock.frame((f.simMs + 40) / 1000, sim);
    }
    expect(clock.gpuPaced).toBe(false);
    expect(clock.budgetMs()).toBeLessThanOrEqual(FAST_BUDGET_CEILING_MS);
  });
});

describe('PlaybackClock: achieved speed', () => {
  it('is an exponential average of simulated over real seconds that follows a shortfall and its recovery', () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 1);
    const clock = new PlaybackClock({ now: time.now });
    settle(clock, sim, 1000 / 60, 2);
    for (let i = 0; i < 180; i++) {
      clock.frame(FRAME_60, sim);
      clock.endFrame(2);
    }
    expect(clock.achieved).toBeCloseTo(1, 1);
    expect(clock.fallingShort).toBe(false);
    // 8× on a machine where a tick costs 8 ms: one tick fits a 14 ms budget after the first, so 1 tick a frame = 3×.
    sim.cost = 8;
    clock.setSpeed(speedIndex(8));
    expect(clock.achieved).toBeNaN();
    for (let i = 0; i < 300; i++) {
      clock.frame(FRAME_60, sim);
      clock.endFrame(2);
    }
    expect(clock.achieved).toBeCloseTo(3, 1);
    expect(clock.fallingShort).toBe(true);
    // Back to 1×: the shortfall clears.
    clock.setSpeed(NORMAL_SPEED_INDEX);
    for (let i = 0; i < 180; i++) {
      clock.frame(FRAME_60, sim);
      clock.endFrame(2);
    }
    expect(clock.achieved).toBeCloseTo(1, 1);
    expect(clock.fallingShort).toBe(false);
    clock.paused = true;
    clock.frame(FRAME_60, sim);
    expect(clock.fallingShort).toBe(false);
  });
});

describe('runToResult', () => {
  it('steps in time slices, yields between them (not after the last) and reports progress', async () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 1, 100);
    let yields = 0;
    const progress: number[] = [];
    const out = await runToResult(sim, {
      now: time.now,
      sliceMs: 10,
      yieldFn: async () => {
        yields++;
      },
      onProgress: (p) => progress.push(p.ticks),
    });
    expect(out).toMatchObject({ finished: true, cancelled: false, ticks: 100, slices: 10 });
    expect(yields).toBe(9);
    expect(progress).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('runs one tick per slice when the slice is shorter than a tick', async () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 3, 25);
    const out = await runToResult(sim, { now: time.now, sliceMs: 1, yieldFn: async () => undefined });
    expect(out.slices).toBe(25);
    expect(out.ticks).toBe(25);
  });

  it('stops at a cancel, between slices, without finishing the battle', async () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 2, 1000);
    let slices = 0;
    const out = await runToResult(sim, { now: time.now, sliceMs: 10, yieldFn: async () => undefined, onProgress: () => slices++, shouldCancel: () => slices >= 3 });
    expect(out).toMatchObject({ finished: false, cancelled: true, ticks: 15, slices: 3 });
    expect(sim.steps).toBe(15);
  });

  it('runs no tick while paused', async () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 1, 20);
    let pausedChecks = 0;
    let waits = 0;
    const out = await runToResult(sim, {
      now: time.now,
      sliceMs: 5,
      yieldFn: async () => undefined,
      isPaused: () => pausedChecks++ < 4,
      pauseFn: async () => {
        waits++;
        expect(sim.steps).toBe(0);
      },
    });
    expect(waits).toBe(4);
    expect(out.ticks).toBe(20);
  });

  it('yields through a MessageChannel by default and lets the process go', async () => {
    const time = new FakeTime();
    const sim = new FakeSim(time, 1, 50);
    const out = await runToResult(sim, { now: time.now, sliceMs: 5 });
    expect(out).toMatchObject({ finished: true, ticks: 50, slices: 10 });
  });

  it('the clock and runToResult touch nothing on the simulation but step() and finished', async () => {
    const time = new FakeTime();
    const inner = new FakeSim(time, 1, 400);
    const touched = new Set<string | symbol>();
    const guarded = new Proxy(inner, {
      get(target, key) {
        touched.add(key);
        if (key !== 'step' && key !== 'finished') throw new Error(`touched ${String(key)}`);
        const v = Reflect.get(target, key);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(_t, key) {
        throw new Error(`wrote ${String(key)}`);
      },
    });
    const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(8) });
    for (let i = 0; i < 60; i++) {
      clock.frame(FRAME_60, guarded);
      clock.endFrame(1);
    }
    await runToResult(guarded, { now: time.now, sliceMs: 3, yieldFn: async () => undefined });
    expect(inner.finished).toBe(true);
    expect([...touched].sort()).toEqual(['finished', 'step']);
  });
});

/** A small custom battle (seed 42) for the driver tests. */
const smallBattle = (maxDuration = 120): BattleConfig =>
  buildCustomBattle({
    seed: 42,
    rulesId: 'canon_me3',
    environment: 'deep_space',
    startingDistanceKm: 30,
    sideA: { faction: 'alliance', name: 'Alliance', formation: 'line_abreast', counts: { alliance_cruiser: 3, alliance_frigate: 4 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { reaper_destroyer: 2 } },
    maxDuration,
  });

describe('LocalSimDriver (the in-thread side of the worker seam)', () => {
  it('step(n) runs up to n ticks and stops at the result', () => {
    const sim = new BattleSimulation(smallBattle(10));
    const driver = new LocalSimDriver(sim);
    expect(driver.step()).toBe(1);
    expect(driver.step(9)).toBe(9);
    expect(driver.tick).toBe(10);
    expect(driver.time).toBeCloseTo(10 * SIM_DT, 9);
    let ran = 0;
    while (!driver.finished) ran += driver.step(50);
    expect(driver.result).toBe(sim.result);
    expect(driver.result).toBeDefined();
    expect(driver.step(5)).toBe(0);
    expect(ran + 10).toBe(sim.tick);
  });

  it('drain() hands over every event after attaching exactly once, in order; the log itself is untouched', () => {
    const sim = new BattleSimulation(smallBattle());
    const atStart = sim.events.length;
    expect(atStart).toBeGreaterThan(0); // battle_start and the opening comms
    const driver = new LocalSimDriver(sim);
    const drained = [];
    expect(driver.drain()).toEqual([]);
    while (!driver.finished) {
      driver.step(7);
      drained.push(...driver.drain());
    }
    expect(driver.drain()).toEqual([]);
    expect(drained.length).toBe(sim.events.length - atStart);
    expect(drained.every((e, i) => e === sim.events[atStart + i])).toBe(true);
    expect(driver.events).toBe(sim.events);
  });

  it('stepping through the driver computes the same battle as stepping the simulation', () => {
    const plain = new BattleSimulation(smallBattle());
    while (!plain.finished) plain.step();
    const sim = new BattleSimulation(smallBattle());
    const driver = new LocalSimDriver(sim);
    let n = 1;
    while (!driver.finished) {
      driver.step(n);
      driver.drain();
      n = (n % 13) + 1;
    }
    expect(sim.time).toBe(plain.time);
    expect(sim.result).toEqual(plain.result);
    expect(JSON.stringify(sim.events)).toBe(JSON.stringify(plain.events));
  });
});

describe('FrameStats (the performance HUD figures)', () => {
  it('averages each bucket exponentially and keeps the worst frame of the last completed window', () => {
    const stats = new FrameStats(0.5, 1000);
    const sample = (frame: number, ticks: number) => ({ frame, sim: frame / 2, events: 1, view: 2, render: 3, overlay: 0.5, hud: 0.25, ticks });
    stats.record(sample(16, 1), 0);
    expect(stats.mean.frame).toBe(16);
    expect(stats.mean.sim).toBe(8);
    expect(stats.mean.ticks).toBe(1);
    expect(stats.fps).toBeCloseTo(62.5, 6);
    stats.record(sample(32, 3), 500);
    expect(stats.mean.frame).toBe(24);
    expect(stats.mean.ticks).toBe(2);
    // The window closes at 1000 ms: the worst frame and the most ticks seen in it.
    expect(stats.worstFrameMs).toBe(0);
    stats.record(sample(20, 2), 1000);
    expect(stats.worstFrameMs).toBe(32);
    expect(stats.maxTicks).toBe(3);
    stats.record(sample(Number.NaN, 0), 1200);
    expect(Number.isFinite(stats.mean.frame)).toBe(true);
    expect(stats.frames).toBe(4);
  });
});

// ---------------------------------------------------------------------------------------- effects batching

const at = { x: 1, y: 2, z: 3 };
const fire = (shipId: string, weaponIndex: number): BattleEvent => ({ t: 1, type: 'weapon_fired', shipId, weaponId: 'w', targetId: 'x', weaponIndex, kind: 'mass_accelerator' });
const impact = (targetId: string, barrierDamage: number, hullDamage: number): BattleEvent => ({ t: 1, type: 'projectile_impact', shipId: 's', targetId, damage: barrierDamage + hullDamage, damageType: 'kinetic', barrierDamage, hullDamage, pos: at });
const intercept = (missileId: number): BattleEvent => ({ t: 1, type: 'missile_intercepted', missileId, interceptorId: 'pd', pos: at });
const destroyed = (shipId: string): BattleEvent => ({ t: 1, type: 'ship_destroyed', shipId, classId: 'alliance_frigate', faction: 'alliance', side: 'A', name: shipId, pos: at, role: 'frigate', cause: 'kinetic' });

/** The Final Battle of Earth, canon, seed 42, the default combined fleet (the briefing's "Default combined fleet", genophage cured). */
const finalBattle = (): BattleConfig => buildScenario('final_battle_of_earth', 'canon_me3', 42, { forces: 'default', genophage: 'cured' });

describe('effects batching at high speed (src/rendering/eventBatching.ts; render only)', () => {
  it('keeps the newest shot per ship, merges impacts per target, bounds intercepts, keeps every destruction, counts the rest, and never writes the events', () => {
    const events: BattleEvent[] = [
      fire('a', 0), impact('t1', 10, 0), fire('b', 1), fire('a', 2), impact('t1', 0, 50), impact('t2', 5, 5),
      ...Array.from({ length: MAX_INTERCEPTS + 8 }, (_, i) => intercept(i)),
      destroyed('d1'), { t: 1, type: 'comms', faction: 'alliance', side: 'A', text: 'Firing.' }, destroyed('d2'), fire('c', 0),
    ];
    const frozen = JSON.stringify(events);
    const batch = batchEvents(events);
    expect(batch.fires.map((e) => [e.shipId, e.weaponIndex])).toEqual([['a', 2], ['b', 1], ['c', 0]]);
    expect(batch.impacts.map((m) => [m.last.targetId, m.barrierDamage, m.hullDamage, m.count])).toEqual([['t1', 10, 50, 2], ['t2', 5, 5, 1]]);
    expect(batch.intercepts.length).toBe(MAX_INTERCEPTS);
    expect(batch.rest.map((e) => e.type)).toEqual(['ship_destroyed', 'comms', 'ship_destroyed']);
    expect(batch.merged).toBe(1 + 1 + 8);
    expect(batch.total).toBe(events.length);
    expect(JSON.stringify(events)).toBe(frozen);
    expect(BATCH_EVENT_THRESHOLD).toBeGreaterThan(100);
  });

  it('a real second of the Final Battle at 8× (160 ticks) spawns one flash per firing ship and one impact per target, every loss kept', () => {
    const sim = new BattleSimulation(finalBattle());
    // The window opens 20 s into the exchange of fire (wherever the pacing puts first contact), when rounds are landing.
    let seen = sim.events.length;
    while (!sim.finished) {
      sim.step();
      if (sim.events.slice(seen).some((e) => e.type === 'weapon_fired')) break;
      seen = sim.events.length;
    }
    sim.skipTo(sim.time + 20);
    const from = sim.events.length;
    for (let i = 0; i < 160; i++) sim.step();
    const frame = sim.events.slice(from);
    const batch = batchEvents(frame);
    const fires = frame.filter((e) => e.type === 'weapon_fired');
    const impacts = frame.filter((e) => e.type === 'projectile_impact');
    const losses = frame.filter((e) => e.type === 'ship_destroyed');
    expect(fires.length).toBeGreaterThan(200);
    expect(impacts.length).toBeGreaterThan(100);
    expect(batch.fires.length).toBe(new Set(fires.map((e) => (e as { shipId: string }).shipId)).size);
    expect(batch.impacts.length).toBe(new Set(impacts.map((e) => (e as { targetId: string }).targetId)).size);
    expect(batch.impacts.reduce((s, m) => s + m.count, 0)).toBe(impacts.length);
    expect(batch.rest.filter((e) => e.type === 'ship_destroyed').length).toBe(losses.length);
    expect(batch.fires.length + batch.impacts.length).toBeLessThan((fires.length + impacts.length) / 2);
    expect(batch.merged + batch.fires.length + batch.impacts.length + batch.intercepts.length + batch.rest.length).toBe(frame.length);
  });
});

// ------------------------------------------------------------------------------- seed-42 determinism (brief §19.3)

/** The 300-vs-300 custom battle of docs/apex/PLAYBACK_PERF.md §1.2: the Custom Battle screen's defaults with these counts, canon, seed 42. */
const c300 = (): BattleConfig =>
  buildCustomBattle({
    seed: 42,
    rulesId: 'canon_me3',
    environment: 'deep_space',
    startingDistanceKm: CUSTOM_DEFAULT_DISTANCE,
    sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 18, alliance_carrier: 6, alliance_cruiser: 96, alliance_frigate: 180 } },
    sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 75, reaper_destroyer: 225 } },
    maxDuration: CUSTOM_DEFAULT_DURATION,
  });

interface Outcome {
  time: number;
  result: BattleResult | undefined;
  /** The complete event log as JSON. */
  events: string;
  count: number;
}

const outcomeOf = (sim: BattleSimulation): Outcome => ({ time: sim.time, result: sim.result, events: JSON.stringify(sim.events), count: sim.events.length });

/**
 * A battle played through the clock at `speed` with simulated 60 fps frames and an injected clock on which each tick
 * costs `tickCostMs`, so every budget decision is exact and independent of the machine. The driver's events are
 * drained once per frame, as the controller does.
 */
async function throughClock(config: BattleConfig, speed: number, tickCostMs: number): Promise<Outcome & { frames: number; cut: number; shed: number; drained: number; atStart: number }> {
  const time = new FakeTime();
  const sim = new BattleSimulation(config);
  const atStart = sim.events.length;
  const driver = new LocalSimDriver(sim);
  const stepper: Stepper = {
    step: () => {
      driver.step(1);
      time.t += tickCostMs;
    },
    get finished() {
      return driver.finished;
    },
  };
  const clock = new PlaybackClock({ now: time.now, speedIndex: speedIndex(speed) });
  settle(clock, stepper, 1000 / 60, 2);
  let frames = 0;
  let drained = 0;
  while (!sim.finished) {
    clock.frame(FRAME_60, stepper);
    clock.endFrame(2);
    drained += driver.drain().length;
    if (++frames % 400 === 0) await yieldToLoop();
  }
  return { ...outcomeOf(sim), frames, cut: clock.cutFrames, shed: clock.shedTotal, drained, atStart };
}

/** Fast-forward to result in the smallest slices: one tick per slice on the injected clock, yielding for real every 64 slices. */
async function throughFastForward(config: BattleConfig): Promise<Outcome & { slices: number; ticks: number }> {
  const time = new FakeTime();
  const sim = new BattleSimulation(config);
  const driver = new LocalSimDriver(sim);
  const stepper: Stepper = {
    step: () => {
      driver.step(1);
      time.t += 1;
    },
    get finished() {
      return driver.finished;
    },
  };
  let n = 0;
  const out = await runToResult(stepper, { now: time.now, sliceMs: 1, yieldFn: () => (++n % 64 === 0 ? yieldToLoop() : Promise.resolve()) });
  driver.drain();
  return { ...outcomeOf(sim), slices: out.slices, ticks: out.ticks };
}

/** (a) 1× at 60 fps, (b) 8× with 6 ms ticks (the 12 ms budget cuts almost every frame and the backlog sheds), (c) runToResult in tiny slices: deep-equal battles. */
async function expectSameBattleAtEverySpeed(config: BattleConfig, atLeastEvents: number): Promise<void> {
  const normal = await throughClock(config, 1, 1);
  expect(normal.result).toBeDefined();
  expect(normal.count).toBeGreaterThan(atLeastEvents);
  // 60 frames per simulated second at 1×, give or take the last fraction; no frame cut; every event drained exactly once.
  expect(normal.frames).toBeGreaterThanOrEqual(Math.floor(normal.time * 60));
  expect(normal.cut).toBe(0);
  expect(normal.drained).toBe(normal.count - normal.atStart);
  const fast = await throughClock(config, 8, 6);
  expect(fast.cut).toBeGreaterThan(fast.frames / 2);
  expect(fast.shed).toBeGreaterThan(1);
  const forwarded = await throughFastForward(config);
  expect(forwarded.slices).toBe(forwarded.ticks);
  for (const other of [fast, forwarded]) {
    expect(other.time).toBe(normal.time);
    expect(other.count).toBe(normal.count);
    expect(other.result).toEqual(normal.result);
    expect(other.events).toBe(normal.events);
  }
}

describe('seed-42 determinism: identical battles at 1×, at 8× under budget cuts and through Fast-forward to result (brief §19.3)', () => {
  it('the Final Battle of Earth (canon)', async () => {
    await expectSameBattleAtEverySpeed(finalBattle(), 10_000);
  }, 600_000);

  it('a 300-vs-300 custom battle (canon)', async () => {
    await expectSameBattleAtEverySpeed(c300(), 10_000);
  }, 900_000);
});

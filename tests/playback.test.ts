import { describe, expect, it } from 'vitest';
import { SIM_DT } from '@/simulation/battle';
import {
  BUDGET_FLOOR_MS,
  FAST_BUDGET_CEILING_MS,
  FRAME_SHARE,
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

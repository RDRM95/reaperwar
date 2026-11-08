import { SIM_DT } from '@/simulation/battle';

/**
 * Playback clock and Fast-forward to result for the battle controller (brief §19.1; measurements and design in
 * docs/apex/PLAYBACK_PERF.md).
 *
 * Pure: no DOM, no Three.js and no clock of its own (the clock is injected), so tests/playback.test.ts drives it in
 * Node. Nothing here touches a simulation except calling its `step()` and reading `finished`: the clock decides how
 * many fixed ticks a display frame runs, and `runToResult` steps a battle to its end in time slices. Neither changes
 * what a tick computes, so a battle's events, result and duration are the same at every speed, frame rate and budget.
 *
 * The honest framing (brief §19.1): eight times as many ticks cost eight times the simulation CPU. The clock keeps
 * the simulation's share of a frame bounded so the view stays smooth, carries what it could not run as a bounded
 * backlog instead of dropping it silently, and measures the speed actually achieved so the HUD can show it.
 */

/** Speed steps available to the player (simulated seconds per real second). */
export const PLAYBACK_SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];
/** Index of 1× in PLAYBACK_SPEEDS. */
export const NORMAL_SPEED_INDEX = 2;
/** From this speed up playback is "fast": the 14 ms ceiling, the 30 Hz overlay, batched effects and HUD feed. */
export const FAST_SPEED = 4;
/** The simulation's budget never drops below this (ms per frame). */
export const BUDGET_FLOOR_MS = 4;
/** Budget ceiling at FAST_SPEED and above (ms per frame), so a frame stays near the display's frame time. */
export const FAST_BUDGET_CEILING_MS = 14;
/** Budget ceiling below FAST_SPEED (ms per frame): the 0.12.1 controller's hard limit, never reached on a fast machine. */
export const SLOW_BUDGET_CEILING_MS = 40;
/** Share of the display's frame time the controller's own work may fill (the rest is the browser's). */
export const FRAME_SHARE = 0.85;
/** Simulated time the clock may carry from one frame to the next (s). */
export const MAX_BACKLOG_S = 0.5;
/** A frame interval longer than this counts as a stall (a background tab, a debugger) and owes only this much (s). */
export const MAX_FRAME_DT_S = 1;
/** Frame intervals longer than this (ms) say nothing about pacing and are left out of the frame-time estimates. */
const STALL_MS = 3000;
/** Upper bound of the budget when the frames are paced by something other than the main thread (ms): input stays within a quarter second. */
export const PACED_BUDGET_MAX_MS = 250;
/** Default slice of `runToResult` (ms of stepping between two yields). */
export const DEFAULT_SLICE_MS = 24;

export type PlaybackMode = 'normal' | 'result';

/** What the clock and `runToResult` need from a battle: a fixed step and its end flag. */
export interface Stepper {
  step(): unknown;
  readonly finished: boolean;
}

export interface PlaybackClockOptions {
  /** Milliseconds, monotonic (default `performance.now`). Tests inject a fake clock. */
  now?: () => number;
  /** Fixed step (s; default SIM_DT). */
  simDt?: number;
  /** Initial speed index into PLAYBACK_SPEEDS (default 1×). */
  speedIndex?: number;
  /** Display frame time assumed until frames have been measured (ms; default 60 Hz). */
  displayFrameMs?: number;
  /** Time constant of the achieved-speed average (real s; default 1). */
  achievedTau?: number;
}

/** What one frame did. */
export interface FrameReport {
  /** The clock was running this frame (not paused, not in result mode, the battle not finished). */
  running: boolean;
  /** Real seconds the frame accounted for (its interval, capped at MAX_FRAME_DT_S). */
  dt: number;
  /** Ticks owed when the frame began: the carried backlog plus this frame's share. */
  due: number;
  /** Ticks run. */
  ran: number;
  /** The frame's simulation budget (ms). */
  budgetMs: number;
  /** Time spent stepping (ms, injected clock). */
  simMs: number;
  /** The budget ended the frame with ticks still owed. */
  cut: boolean;
  /** Simulated seconds owed after the frame (carried to the next, at most MAX_BACKLOG_S). */
  backlog: number;
  /** Simulated seconds dropped this frame because the carried backlog would have exceeded MAX_BACKLOG_S. */
  shed: number;
}

const IDLE_REPORT: FrameReport = { running: false, dt: 0, due: 0, ran: 0, budgetMs: 0, simMs: 0, cut: false, backlog: 0, shed: 0 };
const FREE_FRAMES = 32;
const defaultNow = (): number => globalThis.performance.now();
const ema = (prev: number, x: number, a: number): number => prev + a * (x - prev);

/**
 * Fixed-step playback clock. Each display frame the controller calls `frame(dt, sim)`: the clock adds the frame's
 * real interval times the speed to what it owes, runs as many ticks as that buys within the frame's simulation
 * budget, and carries the remainder (at most MAX_BACKLOG_S) to the next frame. After drawing, the controller reports
 * the frame's non-simulation cost with `endFrame(ms)`; the next budget is computed from it.
 *
 * The budget: target the display's frame time and spend at most what is left after the measured render and UI cost,
 * `clamp(FRAME_SHARE × display frame − ui cost, 4 ms, ceiling)`, with a ceiling of 14 ms at 4× and above and 40 ms
 * below. The display frame time is the 25th percentile of recent frame intervals among frames the simulation did not
 * hold up (frames that ran out of budget are left out, so the estimate never feeds on the simulation's own time).
 * When the main thread idles most of every frame because something else paces the frames (a slow GPU: the
 * SwiftShader profile of PLAYBACK_PERF.md, finding 10), the budget may grow into that idle time, up to half the
 * frame interval minus the UI cost (at most PACED_BUDGET_MAX_MS, so input still gets a turn every quarter second),
 * whatever the ceiling. The first owed tick of a frame always runs, so a tick that costs more than the budget slows
 * playback down instead of stopping it; later ticks start only while their estimated cost still fits.
 */
export class PlaybackClock {
  /** Current speed step (index into PLAYBACK_SPEEDS). */
  speedIndex: number;
  paused = false;
  /** 'result' while Fast-forward to result runs: the clock steps nothing (runToResult does). */
  mode: PlaybackMode = 'normal';
  /** Simulated seconds owed and not yet run. */
  backlog = 0;
  /** Totals in simulated seconds: requested by running frames, run by them, and dropped (by the backlog bound, a speed change or a mode switch). Until the battle ends, `requested − simulated − shedTotal = backlog`. */
  requested = 0;
  simulated = 0;
  shedTotal = 0;
  /** Frames run and frames the budget cut. */
  frames = 0;
  cutFrames = 0;
  /** Exponential average of the cost of one tick inside frames (ms). */
  msPerTick = 0;
  /** Estimated display frame time (ms). */
  displayFrameMs: number;
  /** Exponential average of the controller's non-simulation work per frame (ms): events, view, overlay, HUD. */
  uiCostMs = 0;
  /** Exponential average of the frame interval (ms). */
  frameMs: number;
  /** Exponential average of the share of each frame interval the controller's loop did not use. */
  idleFraction = 0;
  /** Something other than the main thread paces the frames (the budget may grow into the idle time). */
  gpuPaced = false;
  /** The last frame's report. */
  last: FrameReport = IDLE_REPORT;

  private readonly now: () => number;
  private readonly simDt: number;
  private readonly tau: number;
  private achNum = 0;
  private achDen = 0;
  /** Running real time (s) and when the clock last fell behind (a cut or a shed). */
  private realTime = 0;
  private lagAt = Number.NEGATIVE_INFINITY;
  private readonly free = new Float64Array(FREE_FRAMES);
  private readonly sorted = new Float64Array(FREE_FRAMES);
  private freeCount = 0;
  private freeNext = 0;
  /** The previous frame, closed by the next frame's interval. */
  private open?: { cut: boolean; simMs: number; uiMs: number };

  constructor(opts: PlaybackClockOptions = {}) {
    this.now = opts.now ?? defaultNow;
    this.simDt = opts.simDt ?? SIM_DT;
    this.tau = opts.achievedTau ?? 1;
    this.speedIndex = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, opts.speedIndex ?? NORMAL_SPEED_INDEX));
    this.displayFrameMs = opts.displayFrameMs ?? 1000 / 60;
    this.frameMs = this.displayFrameMs;
  }

  get speed(): number {
    return PLAYBACK_SPEEDS[this.speedIndex];
  }

  /** 4× and above. */
  get fast(): boolean {
    return this.speed >= FAST_SPEED;
  }

  /** Interpolation alpha between the last two ticks for the view (the owed fraction of a tick, 0..1). */
  get alpha(): number {
    return Math.min(1, this.backlog / this.simDt);
  }

  /** Exponential average of the achieved speed (simulated s per real s, time constant `achievedTau`); NaN until about 0.3 s of running has been measured since the last reset. */
  get achieved(): number {
    return this.achDen >= 0.25 ? this.achNum / this.achDen : Number.NaN;
  }

  /** The machine is not sustaining the requested speed: the clock is running, it fell behind within the last 1.5 s and the achieved average is below 95 % of the speed. */
  get fallingShort(): boolean {
    const a = this.achieved;
    return this.last.running && Number.isFinite(a) && a < 0.95 * this.speed && this.realTime - this.lagAt < 1.5;
  }

  /** Change speed. The backlog owed at the old speed beyond one tick is shed (counted) and the achieved average restarts. */
  setSpeed(index: number): void {
    const i = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, Math.round(index)));
    if (i === this.speedIndex) return;
    this.speedIndex = i;
    this.dropBacklog(this.simDt);
    this.resetAchieved();
  }

  /** Enter or leave Fast-forward to result. Entering hands the stepping to runToResult; leaving resumes at `speedIndex` (default 1×). */
  setMode(mode: PlaybackMode, speedIndex = NORMAL_SPEED_INDEX): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.dropBacklog(0);
    this.open = undefined;
    if (mode === 'normal') this.speedIndex = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, speedIndex));
    this.resetAchieved();
  }

  resetAchieved(): void {
    this.achNum = 0;
    this.achDen = 0;
  }

  /**
   * The next frame's simulation budget (ms): FRAME_SHARE of the display frame time minus the measured UI cost,
   * clamped to [BUDGET_FLOOR_MS, ceiling]; when the frames are paced by something other than the main thread, at
   * least half the frame interval minus the UI cost (up to PACED_BUDGET_MAX_MS).
   */
  budgetMs(): number {
    const ceiling = this.fast ? FAST_BUDGET_CEILING_MS : SLOW_BUDGET_CEILING_MS;
    const base = Math.min(ceiling, Math.max(BUDGET_FLOOR_MS, FRAME_SHARE * this.displayFrameMs - this.uiCostMs));
    return this.gpuPaced ? Math.max(base, Math.min(PACED_BUDGET_MAX_MS, 0.5 * this.frameMs - this.uiCostMs)) : base;
  }

  /**
   * One display frame: `dtSec` is the real time since the previous frame. Runs the owed ticks on `sim` within the
   * budget and returns what it did. Paused, in result mode or with the battle over, it only measures.
   */
  frame(dtSec: number, sim: Stepper): FrameReport {
    const dtRaw = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;
    this.close(dtRaw * 1000);
    const dt = Math.min(MAX_FRAME_DT_S, dtRaw);
    if (this.mode === 'result') {
      // Fast-forward slices block the main thread at their own rhythm: those intervals say nothing about the display.
      this.open = undefined;
      this.last = { ...IDLE_REPORT, dt };
      return this.last;
    }
    const running = !this.paused && !sim.finished;
    if (!running) {
      this.open = { cut: false, simMs: 0, uiMs: 0 };
      this.last = { ...IDLE_REPORT, dt, backlog: this.backlog };
      return this.last;
    }
    this.realTime += dt;
    const owed = this.backlog + dt * this.speed;
    this.requested += dt * this.speed;
    const due = Math.floor(owed / this.simDt + 1e-9);
    const budget = this.budgetMs();
    const start = this.now();
    let elapsed = 0;
    let ran = 0;
    let cut = false;
    while (ran < due && !sim.finished) {
      // The first owed tick always runs; a later one starts only while its estimated cost still fits the budget.
      if (ran > 0 && (elapsed >= budget || elapsed + this.msPerTick > budget)) {
        cut = true;
        break;
      }
      sim.step();
      ran++;
      elapsed = this.now() - start;
    }
    if (ran > 0) this.msPerTick = this.msPerTick === 0 ? elapsed / ran : ema(this.msPerTick, elapsed / ran, 0.2);
    let backlog = sim.finished ? 0 : owed - ran * this.simDt;
    let shed = 0;
    if (backlog > MAX_BACKLOG_S) {
      shed = backlog - MAX_BACKLOG_S;
      backlog = MAX_BACKLOG_S;
    }
    this.backlog = Math.max(0, backlog);
    this.simulated += ran * this.simDt;
    this.shedTotal += shed;
    this.frames++;
    if (cut) this.cutFrames++;
    if (cut || shed > 0) this.lagAt = this.realTime;
    const w = Math.exp(-dt / this.tau);
    this.achNum = this.achNum * w + ran * this.simDt;
    this.achDen = this.achDen * w + dt;
    this.open = { cut, simMs: elapsed, uiMs: 0 };
    this.last = { running, dt, due, ran, budgetMs: budget, simMs: elapsed, cut, backlog: this.backlog, shed };
    return this.last;
  }

  /** The controller's work this frame outside the simulation (ms): events, view update and render, overlay, HUD. */
  endFrame(uiMs: number): void {
    if (!Number.isFinite(uiMs) || uiMs < 0) return;
    this.uiCostMs = this.uiCostMs === 0 ? uiMs : ema(this.uiCostMs, uiMs, 0.1);
    if (this.open) this.open.uiMs = uiMs;
  }

  /** Close the previous frame with its measured interval: the display frame time, the frame average and the idle share. */
  private close(intervalMs: number): void {
    const f = this.open;
    this.open = undefined;
    if (!f || intervalMs <= 0 || intervalMs > STALL_MS) return;
    this.frameMs = ema(this.frameMs, intervalMs, 0.1);
    if (!f.cut) {
      this.free[this.freeNext] = intervalMs;
      this.freeNext = (this.freeNext + 1) % FREE_FRAMES;
      this.freeCount = Math.min(FREE_FRAMES, this.freeCount + 1);
      const s = this.sorted.subarray(0, this.freeCount);
      s.set(this.free.subarray(0, this.freeCount));
      s.sort();
      this.displayFrameMs = s[Math.floor((this.freeCount - 1) * 0.25)];
    }
    const idle = Math.max(0, intervalMs - f.simMs - f.uiMs) / intervalMs;
    this.idleFraction = ema(this.idleFraction, idle, 0.1);
    this.gpuPaced = this.gpuPaced ? this.idleFraction > 0.35 : this.idleFraction > 0.5;
  }

  private dropBacklog(keep: number): void {
    if (this.backlog > keep) {
      this.shedTotal += this.backlog - keep;
      this.backlog = keep;
    }
  }
}

// ------------------------------------------------------------------------------------------- fast-forward

export interface RunToResultProgress {
  /** Ticks run by this call so far. */
  ticks: number;
  /** Slices run so far. */
  slices: number;
  /** Wall time since the call began (ms, injected clock), pauses included. */
  elapsedMs: number;
}

export interface RunToResultOptions {
  /** Stepping time per slice before yielding (ms; default 24). */
  sliceMs?: number;
  /** Milliseconds (default `performance.now`). */
  now?: () => number;
  /** Called after every slice. */
  onProgress?: (p: RunToResultProgress) => void;
  /** Checked before every slice; true stops the run where it is. */
  shouldCancel?: () => boolean;
  /** Checked before every slice; while true no tick runs and `pauseFn` is awaited instead. */
  isPaused?: () => boolean;
  /** Yield between slices (default: a MessageChannel macrotask where available, else setTimeout 0). */
  yieldFn?: () => Promise<void>;
  /** Wait while paused (default: setTimeout 50 ms). */
  pauseFn?: () => Promise<void>;
}

export interface RunToResultOutcome {
  /** The battle reached its result. */
  finished: boolean;
  /** `shouldCancel` stopped the run first. */
  cancelled: boolean;
  ticks: number;
  slices: number;
  elapsedMs: number;
}

/**
 * Fast-forward to result: step `sim` until it finishes (or `shouldCancel` says stop), in time slices of `sliceMs`,
 * yielding to the event loop between slices so input, menus and the progress display stay live. It never renders
 * and never skips a tick: every tick is the same `step()` that normal playback calls, so the battle computed is the
 * one normal playback computes. A slice runs at least one tick.
 */
export async function runToResult(sim: Stepper, opts: RunToResultOptions = {}): Promise<RunToResultOutcome> {
  const now = opts.now ?? defaultNow;
  const sliceMs = Math.max(0, opts.sliceMs ?? DEFAULT_SLICE_MS);
  const own = opts.yieldFn ? undefined : macrotaskYield();
  const yieldFn = opts.yieldFn ?? own!.yield;
  const pauseFn = opts.pauseFn ?? ((): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50)));
  const t0 = now();
  let ticks = 0;
  let slices = 0;
  let cancelled = false;
  try {
    while (!sim.finished) {
      if (opts.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      if (opts.isPaused?.()) {
        await pauseFn();
        continue;
      }
      const start = now();
      do {
        sim.step();
        ticks++;
      } while (!sim.finished && now() - start < sliceMs);
      slices++;
      opts.onProgress?.({ ticks, slices, elapsedMs: now() - t0 });
      if (!sim.finished) await yieldFn();
    }
  } finally {
    own?.close();
  }
  return { finished: sim.finished, cancelled, ticks, slices, elapsedMs: now() - t0 };
}

/**
 * A yield to the event loop as a macrotask: a MessageChannel message where available (no 4 ms clamp, so a long run
 * keeps nearly all its time while rendering and input still get their turn), else setTimeout 0.
 */
export function macrotaskYield(): { yield: () => Promise<void>; close: () => void } {
  if (typeof MessageChannel !== 'function') return { yield: () => new Promise((resolve) => setTimeout(resolve, 0)), close: () => undefined };
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  return {
    yield: () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
      }),
    close: () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    },
  };
}

// ------------------------------------------------------------------------------------------- frame statistics

/** One frame's main-thread costs (ms) and tick count, as the controller measures them. */
export interface FrameSample {
  /** Interval since the previous presented frame. */
  frame: number;
  /** Inside the simulation's ticks. */
  sim: number;
  /** Draining and dispatching the ticks' events (view queue, HUD feed, audio). */
  events: number;
  /** `view.update` (ship placement, effects, camera). */
  view: number;
  /** `view.render` (the Three.js JavaScript; the GPU's work is not on this thread). */
  render: number;
  /** The 2D tactical overlay. */
  overlay: number;
  /** HUD tick and refresh. */
  hud: number;
  /** Ticks run. */
  ticks: number;
}

export type FrameBucket = keyof FrameSample;
export const FRAME_BUCKETS: readonly FrameBucket[] = ['frame', 'sim', 'events', 'view', 'render', 'overlay', 'hud', 'ticks'];

/**
 * Exponential averages of the per-frame costs for the performance HUD (F3), with the worst frame of each 2 s window.
 * Pure: the controller feeds it one sample per presented frame.
 */
export class FrameStats {
  /** Averages per bucket (ms; `ticks` in ticks per frame). */
  readonly mean: Record<FrameBucket, number> = { frame: 0, sim: 0, events: 0, view: 0, render: 0, overlay: 0, hud: 0, ticks: 0 };
  /** The longest frame interval and the most ticks of the last completed window. */
  worstFrameMs = 0;
  maxTicks = 0;
  frames = 0;
  private readonly alpha: number;
  private readonly windowMs: number;
  private windowStart = 0;
  private windowWorst = 0;
  private windowTicks = 0;

  /** `alpha` weights the newest frame (default 0.1); `windowMs` is the worst-frame window (default 2000). */
  constructor(alpha = 0.1, windowMs = 2000) {
    this.alpha = alpha;
    this.windowMs = windowMs;
  }

  /** Record a frame; `nowMs` closes the worst-frame window. */
  record(s: FrameSample, nowMs: number): void {
    const first = this.frames === 0;
    for (const k of FRAME_BUCKETS) {
      const v = Number.isFinite(s[k]) ? s[k] : 0;
      this.mean[k] = first ? v : this.mean[k] + this.alpha * (v - this.mean[k]);
    }
    this.frames++;
    this.windowWorst = Math.max(this.windowWorst, s.frame);
    this.windowTicks = Math.max(this.windowTicks, s.ticks);
    if (first) this.windowStart = nowMs;
    if (nowMs - this.windowStart >= this.windowMs) {
      this.worstFrameMs = this.windowWorst;
      this.maxTicks = this.windowTicks;
      this.windowWorst = 0;
      this.windowTicks = 0;
      this.windowStart = nowMs;
    }
  }

  /** Frames per second implied by the mean frame interval. */
  get fps(): number {
    return this.mean.frame > 0 ? 1000 / this.mean.frame : 0;
  }
}

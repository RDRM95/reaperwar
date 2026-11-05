import type { BattleSimulation } from '@/simulation/battle';
import type { BattleEvent, BattleResult } from '@/simulation/types';

/**
 * The seam between the battle controller and the simulation it plays (brief §19.1 "Web Worker where beneficial";
 * §17.2 item 2). The controller steps the battle, reads its end and result, and consumes its events only through
 * this interface; the playback clock and Fast-forward to result call nothing else. A worker implementation would run
 * the simulation in a Web Worker and answer the same calls from messages: `step(n)` posts a request, `drain()`
 * returns the events the worker has streamed back (every event is plain JSON, so it crosses the boundary as is).
 *
 * What it does not cover yet is the view: the 3D view, the overlay and the HUD read the live simulation's ships,
 * projectiles and fleets every frame. A worker therefore needs the extreme-scale programme's snapshot protocol
 * (typed-array snapshots, versioned schema) before the live battle can move off the main thread; until then the only
 * implementation is LocalSimDriver, in-thread. docs/apex/PLAYBACK_PERF.md §6 sets out what a worker would and would
 * not buy.
 */
export interface SimDriver {
  /** Run up to `n` fixed ticks (default 1), fewer when the battle ends first; returns the number run. */
  step(n?: number): number;
  /** The battle has its result; `step` does nothing more. */
  readonly finished: boolean;
  readonly result: BattleResult | undefined;
  /** Simulated time (s) and tick of the last step. */
  readonly time: number;
  readonly tick: number;
  /** The complete event log so far, in emission order. */
  readonly events: readonly BattleEvent[];
  /** The events emitted since the previous drain, in order (the controller's feed for the view, HUD and audio). */
  drain(): BattleEvent[];
}

const NONE: BattleEvent[] = [];

/** In-thread driver: the simulation runs on the main thread, stepped synchronously; events are read from its log. */
export class LocalSimDriver implements SimDriver {
  private cursor: number;

  /** Events already in the log when the driver attaches (the constructor's battle start) are not drained. */
  constructor(readonly sim: BattleSimulation) {
    this.cursor = sim.events.length;
  }

  step(n = 1): number {
    const sim = this.sim;
    let ran = 0;
    while (ran < n && !sim.finished) {
      sim.step();
      ran++;
    }
    return ran;
  }

  get finished(): boolean {
    return this.sim.finished;
  }
  get result(): BattleResult | undefined {
    return this.sim.result;
  }
  get time(): number {
    return this.sim.time;
  }
  get tick(): number {
    return this.sim.tick;
  }
  get events(): readonly BattleEvent[] {
    return this.sim.events;
  }

  drain(): BattleEvent[] {
    const log = this.sim.events;
    if (this.cursor >= log.length) return NONE;
    const out = log.slice(this.cursor);
    this.cursor = log.length;
    return out;
  }
}

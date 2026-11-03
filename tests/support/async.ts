/**
 * Event-loop helpers for long-running headless tests.
 *
 * Vitest runs each test file in a worker that reports task updates to the
 * main process over an RPC with a 60 s timeout, and the runner never yields
 * the worker's event loop between `it`s. A file whose consecutive synchronous
 * work exceeds roughly 60 s therefore fails the whole run with
 * "[vitest-worker]: Timeout calling onTaskUpdate" even though every test
 * passes (measured 3 Nov 2026: three synchronous 25 s tests in one file
 * reproduce it; one async test with a `setTimeout(0)` between the same three
 * blocks does not). Splitting a battery into `it.each` does not help on its
 * own; long campaign and battle loops yield through these helpers instead.
 * The yields change nothing about the simulation, which stays synchronous
 * and deterministic between them.
 */
import { advanceTick } from '@/campaign/engine';
import type { CampaignState } from '@/campaign/state';
import type { BattleSimulation } from '@/simulation/battle';

/** Lets the worker's event loop turn once (a macrotask boundary). */
export const yieldToLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Advances an AI-run campaign until it has an outcome or `state.tick` reaches
 * `maxTick`, yielding after every tick. Equivalent to
 * `while (!state.outcome && state.tick < maxTick) advanceTick(state, { interactive: false })`.
 */
export async function runCampaignAsync(state: CampaignState, maxTick = 160): Promise<void> {
  while (!state.outcome && state.tick < maxTick) {
    advanceTick(state, { interactive: false });
    await yieldToLoop();
  }
}

/**
 * Steps a battle until it finishes or `sim.time` reaches `untilTime`, yielding
 * every `chunkSteps` steps. With no `untilTime` it steps exactly as `sim.run()`
 * does, except that `run()`'s 200,000-step safety cap (a 'draw' end) is not
 * replicated: every configured battle ends by its `maxDuration`.
 */
export async function runSimAsync(sim: BattleSimulation, opts: { untilTime?: number; chunkSteps?: number } = {}): Promise<void> {
  const chunk = Math.max(1, opts.chunkSteps ?? 200);
  const limit = opts.untilTime ?? Infinity;
  while (!sim.finished && sim.time < limit) {
    for (let i = 0; i < chunk && !sim.finished && sim.time < limit; i++) sim.step();
    await yieldToLoop();
  }
}

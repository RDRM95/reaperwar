import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { yieldToLoop } from './support/async';

/**
 * Results never depend on how many ticks a frame runs (owner dev note, brief §19; INTEGRATION_NOTES.md): the Battle
 * of Earth, seed 42, stepped one tick at a time, in batches of 160 ticks and in uneven batches, gives deep-equal
 * events, result and time. The simulation has no wall clock, so a batch is only a loop of `step()`; this pins that
 * nothing (caches, timers, per-tick memos) ever keys on the caller's batching.
 */

async function run(batch: (i: number) => number): Promise<BattleSimulation> {
  const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 42));
  let i = 0;
  while (!sim.finished) {
    const n = batch(i++);
    for (let k = 0; k < n && !sim.finished; k++) sim.step();
    if (i % 20 === 0) await yieldToLoop();
  }
  return sim;
}

describe('batching determinism (seed 42)', () => {
  it('one tick at a time, batches of 160 and uneven batches give identical battles', async () => {
    const single = await run(() => 1);
    const even = await run(() => 160);
    const uneven = await run((i) => [1, 7, 160, 3, 41, 99, 2][i % 7]);
    expect(single.finished).toBe(true);
    for (const other of [even, uneven]) {
      expect(other.time).toBe(single.time);
      expect(other.result).toEqual(single.result);
      expect(other.events.length).toBe(single.events.length);
      expect(JSON.stringify(other.events)).toBe(JSON.stringify(single.events));
    }
  }, 120_000);
});

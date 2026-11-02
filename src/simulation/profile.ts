/**
 * Per-phase step profiler for the headless simulation.
 *
 * The profiler is a plain accumulator with an injected clock. In the
 * simulation directories nothing may read a wall clock (determinism rule,
 * ADOPTION_PLAN.md §0.1 rule 4), so the clock defaults to a constant-zero
 * no-op and the profiler stays disabled: every phase reads 0 and no time is
 * ever sampled. Only `scripts/perf-sim.ts` and the battle controller inject a
 * real clock, and only for measurement; the simulation never reads the values
 * it records, so a profile can never change a battle.
 */
export const PROFILE_PHASES = ['reinforcements', 'fleets', 'ai', 'movement', 'housekeeping', 'carriers', 'weapons', 'projectiles', 'missiles', 'end'] as const;

export type ProfilePhase = (typeof PROFILE_PHASES)[number];

export type ProfilePhases = Record<ProfilePhase, number>;

const zeroPhases = (): ProfilePhases => {
  const out = {} as ProfilePhases;
  for (const p of PROFILE_PHASES) out[p] = 0;
  return out;
};

export class SimProfile {
  /** When false (the default) every method is a no-op and no clock is read. */
  enabled = false;
  /** Injected clock in milliseconds. The headless default `() => 0` costs nothing and reads no clock. */
  now: () => number = () => 0; // injection point: only scripts/perf-sim.ts and the battle controller set this to performance.now
  /** Milliseconds accumulated per phase since the last reset. */
  readonly phases: ProfilePhases = zeroPhases();
  /** Milliseconds accumulated across whole steps since the last reset. */
  totalMs = 0;
  /** Steps measured since the last reset. */
  steps = 0;

  /** Timestamp for the start of a phase or step; 0 while disabled. */
  mark(): number {
    return this.enabled ? this.now() : 0;
  }

  /** Credit the time since `t0` to `phase` and return a fresh timestamp for chaining. */
  lap(phase: ProfilePhase, t0: number): number {
    if (!this.enabled) return 0;
    const t = this.now();
    this.phases[phase] += t - t0;
    return t;
  }

  /** Credit a whole step started at `t0`. */
  endStep(t0: number): void {
    if (!this.enabled) return;
    this.totalMs += this.now() - t0;
    this.steps++;
  }

  reset(): void {
    for (const p of PROFILE_PHASES) this.phases[p] = 0;
    this.totalMs = 0;
    this.steps = 0;
  }

  /** Sum of every phase; never above `totalMs` when the clock is monotone. */
  get phaseSum(): number {
    let s = 0;
    for (const p of PROFILE_PHASES) s += this.phases[p];
    return s;
  }

  /** Each phase as a fraction of the step total (all 0 when nothing was measured). */
  split(): ProfilePhases {
    const out = zeroPhases();
    if (this.totalMs <= 0) return out;
    for (const p of PROFILE_PHASES) out[p] = this.phases[p] / this.totalMs;
    return out;
  }

  /** One-line report for scripts (`npm run sim`, `npm run perf:sim`). */
  report(): string {
    if (this.steps === 0) return 'profile: disabled';
    const ms = this.totalMs / this.steps;
    const parts = PROFILE_PHASES.filter((p) => this.phases[p] > 0).map((p) => `${p} ${((100 * this.phases[p]) / Math.max(1e-9, this.totalMs)).toFixed(0)}%`);
    return `profile: ${ms.toFixed(3)} ms/step over ${this.steps} steps (${parts.join(', ')})`;
  }
}

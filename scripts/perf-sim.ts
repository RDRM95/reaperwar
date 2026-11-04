/**
 * Headless performance ladder (ADOPTION_PLAN.md §21.5; WORK_BREAKDOWN.md T8/T19):
 *   node --import tsx/esm scripts/perf-sim.ts [--rows 100,300v100,300,600,1000] [--warmup 200] [--steps 1200] [--split] [--windows 400]
 *
 * For every row a mixed canon custom battle is built (per side: dreadnoughts 6 %,
 * carriers 2 %, cruisers 32 %, frigates 60 % for the coalition; capitals 25 % /
 * destroyers 75 % for the Reaper side; seed 11; deep space 80 km), stepped for a
 * warm-up and then timed. The timing pass runs with the profiler off (the gate is
 * the real cost); `--split` runs a second, profiled pass of the same row for the
 * phase split. `--windows n` also prints the mean step cost per window of n steps
 * so the pre-contact and firing phases can be told apart.
 *
 * This script is the only place besides the battle controller that injects a wall
 * clock into `SimProfile` (ADOPTION_PLAN.md §0.1 rule 4); the simulation itself
 * never reads one.
 */
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { buildCustomBattle } from '../src/scenarios/index';
import { BattleSimulation } from '../src/simulation/battle';
import { PROFILE_PHASES } from '../src/simulation/profile';

/** The brief's headless gate: the 300-vs-100 row at this many simulation steps per 16.7 ms frame (AP §21.5). */
export const HEADLESS_GATE = { stepsPerFrame: 20 } as const;
export const FRAME_MS = 16.7;

export interface LadderRow {
  a: number;
  b: number;
}

/** "300" → 300 vs 300; "300v100" → 300 coalition hulls vs 100 Reaper hulls. */
export function parseRow(s: string): LadderRow {
  const m = /^(\d+)(?:v(\d+))?$/.exec(s.trim());
  if (!m) throw new Error(`bad ladder row "${s}" (use 300 or 300v100)`);
  return { a: Number(m[1]), b: Number(m[2] ?? m[1]) };
}

/** Coalition mix of AP §21.5 (dreadnoughts 6 %, carriers 2 %, cruisers 32 %, the rest frigates). */
export function coalitionCounts(n: number): Record<string, number> {
  const dn = Math.round(n * 0.06);
  const cv = Math.round(n * 0.02);
  const ca = Math.round(n * 0.32);
  return { alliance_dreadnought: dn, alliance_carrier: cv, alliance_cruiser: ca, alliance_frigate: Math.max(0, n - dn - cv - ca) };
}

/** Reaper mix of AP §21.5 (capitals 25 %, destroyers 75 %). */
export function reaperCounts(n: number): Record<string, number> {
  const caps = Math.round(n * 0.25);
  return { reaper_capital: caps, reaper_destroyer: Math.max(0, n - caps) };
}

export function ladderBattle(row: LadderRow, seed = 11): BattleSimulation {
  return new BattleSimulation(
    buildCustomBattle({
      seed,
      rulesId: 'canon_me3',
      environment: 'deep_space',
      startingDistanceKm: 80,
      maxDuration: 1200,
      sideA: { faction: 'alliance', name: 'Coalition', formation: 'line_abreast', counts: coalitionCounts(row.a) },
      sideB: { faction: 'reaper', name: 'Reapers', formation: 'dispersed', counts: reaperCounts(row.b) },
    }),
  );
}

export interface LadderMeasure {
  row: LadderRow;
  hulls: number;
  msPerStep: number;
  stepsPerSecond: number;
  stepsPerFrame: number;
  projectilesEnd: number;
  projectilesPeak: number;
  missilesPeak: number;
  gridCells: number | undefined;
  /** Mean ms/step per window of `windowSteps` steps. */
  windows: number[];
  finishedAt?: number;
}

/** Steps a battle `steps` times after `warmup` warm-up steps; wall time through `performance.now()`. */
export function measure(sim: BattleSimulation, warmup: number, steps: number, windowSteps = 0): LadderMeasure {
  for (let i = 0; i < warmup && !sim.finished; i++) sim.step();
  let projectilesPeak = 0;
  let missilesPeak = 0;
  const windows: number[] = [];
  let wStart = performance.now();
  const t0 = wStart;
  let done = 0;
  for (let i = 0; i < steps && !sim.finished; i++) {
    sim.step();
    done++;
    if (sim.projectiles.length > projectilesPeak) projectilesPeak = sim.projectiles.length;
    if (sim.missiles.length > missilesPeak) missilesPeak = sim.missiles.length;
    if (windowSteps > 0 && done % windowSteps === 0) {
      const now = performance.now();
      windows.push((now - wStart) / windowSteps);
      wStart = now;
    }
  }
  const ms = (performance.now() - t0) / Math.max(1, done);
  const grid = (sim as unknown as { grid?: { cellCount: number } }).grid;
  return {
    row: { a: 0, b: 0 },
    hulls: sim.ships.filter((s) => s.alive && s.role !== 'fighter').length,
    msPerStep: ms,
    stepsPerSecond: 1000 / ms,
    stepsPerFrame: FRAME_MS / ms,
    projectilesEnd: sim.projectiles.length,
    projectilesPeak,
    missilesPeak,
    gridCells: grid?.cellCount,
    windows,
    finishedAt: sim.finished ? sim.time : undefined,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1]?.endsWith('perf-sim.ts');
if (isMain) {
  const rows = (arg('rows') ?? '100,300v100,300,600,1000').split(',').map(parseRow);
  const warmup = Number(arg('warmup') ?? 200);
  const steps = Number(arg('steps') ?? 1200);
  const windowSteps = Number(arg('windows') ?? 0);
  const split = process.argv.includes('--split');
  const machine = `${process.platform} ${process.arch}, node ${process.version}, ${cpus().length} CPUs (${cpus()[0]?.model ?? 'unknown CPU'})`;
  console.log(`# Headless performance ladder (${machine})\n`);
  console.log(`warm-up ${warmup} steps, measured ${steps} steps, seed 11, canon, deep space 80 km; gate: ${HEADLESS_GATE.stepsPerFrame} steps per ${FRAME_MS} ms frame on the 300 vs 100 row\n`);
  console.log('| row | live hulls | ms/step | steps/s | steps per frame | projectiles (end / peak) | missiles peak | grid cells | gate |');
  console.log('| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |');
  const splits: string[] = [];
  for (const row of rows) {
    const label = row.a === row.b ? `${row.a} vs ${row.a}` : `${row.a} vs ${row.b}`;
    const m = measure(ladderBattle(row), warmup, steps, windowSteps);
    const gate = m.stepsPerFrame >= HEADLESS_GATE.stepsPerFrame ? 'met' : 'missed';
    console.log(`| ${label} | ${m.hulls} | ${m.msPerStep.toFixed(2)} | ${m.stepsPerSecond.toFixed(0)} | ${m.stepsPerFrame.toFixed(1)} | ${m.projectilesEnd} / ${m.projectilesPeak} | ${m.missilesPeak} | ${m.gridCells ?? '—'} | ${gate}${m.finishedAt !== undefined ? ` (battle ended at ${m.finishedAt.toFixed(0)} s)` : ''} |`);
    if (windowSteps > 0) splits.push(`${label}: ms/step per ${windowSteps}-step window — ${m.windows.map((w) => w.toFixed(2)).join(', ')}`);
    if (split) {
      const sim = ladderBattle(row);
      sim.profile.enabled = true;
      sim.profile.now = () => performance.now();
      for (let i = 0; i < warmup && !sim.finished; i++) sim.step();
      sim.profile.reset();
      for (let i = 0; i < steps && !sim.finished; i++) sim.step();
      const s = sim.profile.split();
      splits.push(`${label}: ${sim.profile.report()}; share — ${PROFILE_PHASES.map((p) => `${p} ${(100 * s[p]).toFixed(0)} %`).join(', ')}`);
    }
  }
  if (splits.length > 0) {
    console.log('');
    for (const s of splits) console.log(`- ${s}`);
  }
}

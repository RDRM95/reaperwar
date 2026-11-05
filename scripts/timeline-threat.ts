/**
 * Threat to the Reapers: measures every timeline on the threat reference
 * engagement and writes the generated table (docs/apex/TIMELINES_V2.md §1, §4.7).
 *
 *   npm run timeline:threat                     # the probe ladder first (re-basing when §1.8 says so), then every preset and each new timeline's lever at both ends; writes the table and the report
 *   npm run timeline:threat -- --check          # the release gate: ladder and every preset; fails on a due re-base, a changed tier or index, a stale fingerprint, a missed declared tier or too many time-limit endings; writes nothing
 *   npm run timeline:threat -- --only a,b       # a subset (and its levers) on the committed scale, merged into the committed table (retuning, §1.8)
 *   npm run timeline:threat -- --no-probes      # skip the ladder and keep the committed scale (local runs; --check always runs it)
 *   npm run timeline:threat -- --no-levers      # skip the lever measurements (the committed ones are kept)
 *   npm run timeline:threat -- --probes         # the probe ladder only: prints it, the thresholds it derives and whether a re-base is due
 *   npm run timeline:threat -- --file sets.json # measure rule sets from a JSON file (one RuleSet or an array); prints only
 *   npm run timeline:threat -- --jobs 4         # worker processes (default min(4, available CPUs))
 *
 * Every battle is deterministic; results are keyed by task and assembled in
 * PRESETS order (the ladder in m order), so the output never depends on
 * scheduling. Wall times go to stdout only, never into a committed file.
 */
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ALTERNATE_META, ALTERNATE_PRESETS, getLever, withLever } from '../src/timelines/alternates';
import { PRESETS, getPreset } from '../src/timelines/presets';
import type { RuleSet } from '../src/timelines/rules';
import { normaliseRules } from '../src/timelines/schema';
import {
  REAPER_THREAT,
  THREAT_FINGERPRINT,
  THREAT_FORMULA_VERSION,
  THREAT_INDEX_TOLERANCE,
  THREAT_LABELS,
  THREAT_LEVERS,
  THREAT_PROBE_GRID,
  THREAT_PROBE_KEYS,
  THREAT_PROBE_GAP,
  THREAT_PROBE_MAX_ROUNDS,
  THREAT_PROBE_RATIO,
  THREAT_REBASE_DRIFT,
  THREAT_RUNGS,
  THREAT_SCALE,
  THREAT_TIME_LIMIT_BOUND,
  nextProbeValues,
  probeOf,
  rebaseReasons,
  summariseThreat,
  thresholdsFromProbes,
  threatHoldsText,
  threatTiers,
  tierForIndex,
  type DerivedThresholds,
  type MeasuredThreat,
  type ThreatFingerprint,
  type ThreatLeverMeasure,
  type ThreatProbe,
  type ThreatRun,
  type ThreatScale,
} from '../src/timelines/threat';
import {
  THREAT_LONGEST_RANGE,
  THREAT_MAX_DURATION,
  THREAT_SEEDS,
  THREAT_STANDOFF,
  runThreatReference,
  threatFingerprint,
  threatProbeRules,
  threatRungGroups,
} from '../src/scenarios/threatReference';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SCRIPT), '..');
const TABLE = join(ROOT, 'src/timelines/threatMeasured.ts');
const REPORT = join(ROOT, 'docs/apex/TIMELINE_THREAT.md');

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const option = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

interface Task {
  id: number;
  key: string;
  rules: RuleSet;
  rung: number;
  seed: number;
}

// ------------------------------------------------------------------ pool

async function runTasks(tasks: Task[], jobs: number, onDone: (t: Task, r: ThreatRun, ms: number) => void): Promise<void> {
  if (jobs <= 1) {
    for (const t of tasks) {
      const t0 = performance.now();
      const r = runThreatReference(t.rules, t.rung, t.seed);
      onDone(t, r, performance.now() - t0);
    }
    return;
  }
  const queue = [...tasks];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  await new Promise<void>((resolve, reject) => {
    let open = 0;
    const workers: ChildProcessWithoutNullStreams[] = [];
    const feed = (w: ChildProcessWithoutNullStreams): void => {
      const t = queue.shift();
      if (t) w.stdin.write(`${JSON.stringify({ id: t.id, rules: t.rules, rung: t.rung, seed: t.seed })}\n`);
      else w.stdin.end();
    };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) {
      const w = spawn(process.execPath, ['--import', 'tsx/esm', SCRIPT, '--worker'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
      workers.push(w);
      open++;
      w.stderr.on('data', (d: Buffer) => process.stderr.write(d));
      createInterface({ input: w.stdout }).on('line', (line) => {
        if (!line.trim()) return;
        const msg = JSON.parse(line) as { id: number; run: ThreatRun; ms: number };
        onDone(byId.get(msg.id)!, msg.run, msg.ms);
        feed(w);
      });
      w.on('exit', (code) => {
        if (code !== 0) reject(new Error(`worker exited with code ${code}`));
        if (--open === 0) resolve();
      });
      feed(w);
    }
  });
}

// ------------------------------------------------------------------ helpers

const git = (cmd: string): string | undefined => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
};

const measuredOn = (): string => {
  const sha = git('git rev-parse --short HEAD');
  if (!sha) return 'unknown';
  const dirty = git('git status --porcelain -- src scripts/timeline-threat.ts');
  const lines = (dirty ?? '').split('\n').filter((l) => l.trim() && !l.endsWith('src/timelines/threatMeasured.ts'));
  return lines.length > 0 ? `${sha}+dirty` : sha;
};

const fmt1 = (x: number): string => x.toFixed(1);
const pct = (x: number): string => `${Math.round(100 * x)} %`;
const labelOf = (index: number, th: readonly number[]): string => {
  const t = tierForIndex(index, th);
  return `${t} ${THREAT_LABELS[t - 1]}`;
};
const tierName = (t: number): string => `${t} ${THREAT_LABELS[t - 1]}`;
const NEW_IDS = new Set(ALTERNATE_PRESETS.map((p) => p.id));

/** Index points to the nearest tier boundary (positive inside the band). */
const margin = (index: number, th: readonly number[]): number => {
  const t = tierForIndex(index, th);
  const tiers = threatTiers(th);
  const lo = tiers[t - 1].min;
  const hi = tiers[t - 1].max;
  return Math.min(t === 1 ? Infinity : index - lo, t === 6 ? Infinity : hi - index);
};

function tasksFor(key: string, rules: RuleSet, startId: number): Task[] {
  const out: Task[] = [];
  let id = startId;
  for (let rung = 0; rung < THREAT_RUNGS.length; rung++) for (const seed of THREAT_SEEDS) out.push({ id: id++, key, rules, rung, seed });
  return out;
}

async function measure(sets: { key: string; rules: RuleSet }[], jobs: number, th: readonly number[] = THREAT_SCALE.thresholds, quiet = false): Promise<Map<string, MeasuredThreat>> {
  const tasks: Task[] = [];
  for (const s of sets) tasks.push(...tasksFor(s.key, s.rules, tasks.length));
  const runs = new Map<string, ThreatRun[]>(sets.map((s) => [s.key, []]));
  const cpu = new Map<string, number[]>(sets.map((s) => [s.key, []]));
  const t0 = performance.now();
  const out = new Map<string, MeasuredThreat>();
  const per = THREAT_RUNGS.length * THREAT_SEEDS.length;
  const all: number[] = [];
  await runTasks(tasks, jobs, (t, r, ms) => {
    const list = runs.get(t.key)!;
    list.push(r);
    cpu.get(t.key)!.push(ms);
    all.push(ms);
    if (list.length === per) {
      list.sort((a, b) => a.rung - b.rung || a.seed - b.seed);
      const m = summariseThreat(list, threatRungGroups(t.rules));
      out.set(t.key, m);
      if (!quiet) {
        const ms = cpu.get(t.key)!;
        const sum = ms.reduce((a, b) => a + b, 0) / 1000;
        console.log(`  ${t.key.padEnd(44)} index ${fmt1(m.index).padStart(5)}  tier ${labelOf(m.index, th).padEnd(14)} rungs ${m.rungs.map((g) => `${Math.round(g.index)}(${g.wins})`).join(' ')}  time-limit ${m.rungs.reduce((a, g) => a + g.timeLimit, 0)}/${per}  [${sum.toFixed(1)} s CPU, max ${(Math.max(...ms) / 1000).toFixed(2)} s/battle]`);
      }
    }
  });
  if (!quiet && all.length) console.log(`  … ${tasks.length} battles in ${((performance.now() - t0) / 1000).toFixed(1)} s with ${jobs} job(s); per battle mean ${(all.reduce((a, b) => a + b, 0) / all.length / 1000).toFixed(2)} s, max ${(Math.max(...all) / 1000).toFixed(2)} s`);
  return out;
}

// ------------------------------------------------------------------ the probe ladder (§1.3, §1.8)

interface Ladder {
  probes: ThreatProbe[];
  derived: DerivedThresholds;
  rounds: number;
  /** The refinement ran out of rounds before every bracket was closed. */
  unfinished: boolean;
}

const probeKey = (m: number): string => `probe ×${m}`;

/** The grid, then deterministic refinement rounds (`nextProbeValues`) until no bracket needs another probe. */
async function runLadder(jobs: number): Promise<Ladder> {
  console.log(`Probe ladder: canon with every organic faction's ${THREAT_PROBE_KEYS.join(', ')} × m (§1.3)`);
  const probes: ThreatProbe[] = [];
  let next: number[] = [...THREAT_PROBE_GRID];
  let rounds = 0;
  while (next.length > 0 && rounds <= THREAT_PROBE_MAX_ROUNDS) {
    console.log(` ${rounds === 0 ? 'grid' : `refinement ${rounds}`}: m = ${next.join(', ')}`);
    const batch = next;
    const res = await measure(batch.map((m) => ({ key: probeKey(m), rules: threatProbeRules(m) })), jobs, THREAT_SCALE.thresholds);
    for (const m of batch) probes.push(probeOf(m, res.get(probeKey(m))!));
    probes.sort((a, b) => a.m - b.m);
    next = nextProbeValues(probes);
    rounds++;
  }
  const derived = thresholdsFromProbes(probes);
  printLadder(probes, derived);
  return { probes, derived, rounds, unfinished: next.length > 0 };
}

function printLadder(probes: readonly ThreatProbe[], d: DerivedThresholds): void {
  console.log(' m        index  holds  wins  time-limit');
  for (const p of probes) console.log(`  ×${String(p.m).padEnd(6)} ${fmt1(p.index).padStart(5)}  ${String(p.holdsRungs).padStart(5)}  ${String(p.wins).padStart(2)}/${p.battles}  ${p.timeLimit}`);
  console.log(` counts of groups held produced: ${d.holdCounts.join(', ')}`);
  for (const s of d.splits) console.log(`  tier ${s.tier} floor (${s.rule}): below ${s.below ? `${fmt1(s.below.index)} at ×${s.below.m}` : '—'}, above ${s.above ? `${fmt1(s.above.index)} at ×${s.above.m}` : '—'} → ${s.threshold ?? '—'}`);
  console.log(` derived thresholds: ${d.thresholds ? d.thresholds.join(' / ') : 'none'}${d.problems.length ? ` (${d.problems.join('; ')})` : ''}`);
}

const currentRef = () => ({ formulaVersion: THREAT_FORMULA_VERSION, standoffKm: THREAT_STANDOFF, maxDuration: THREAT_MAX_DURATION });

// ------------------------------------------------------------------ writers

/** A single-quoted TypeScript string literal (the repository's style). */
const q = (x: string): string => `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const tsMeasure = (m: MeasuredThreat): string => {
  const rungs = m.rungs
    .map((g) => `      { name: ${q(g.name)}, capitals: ${g.capitals}, destroyers: ${g.destroyers}, index: ${fmt1(g.index)}, reaperLoss: ${g.reaperLoss.toFixed(3)}, organicSurvival: ${g.organicSurvival.toFixed(3)}, wins: ${g.wins}, battles: ${g.battles}, timeLimit: ${g.timeLimit} },`)
    .join('\n');
  return `{\n    index: ${fmt1(m.index)},\n    reaperLoss: ${m.reaperLoss.toFixed(3)},\n    organicSurvival: ${m.organicSurvival.toFixed(3)},\n    holdsRungs: ${m.holdsRungs},\n    holdsUpTo: ${m.holdsUpTo},\n    timeLimitShare: ${m.timeLimitShare.toFixed(3)},\n    rungs: [\n${rungs}\n    ],\n  }`;
};

const tsProbe = (p: ThreatProbe): string =>
  `    { m: ${p.m}, index: ${fmt1(p.index)}, reaperLoss: ${p.reaperLoss.toFixed(3)}, organicSurvival: ${p.organicSurvival.toFixed(3)}, holdsRungs: ${p.holdsRungs}, wins: ${p.wins}, battles: ${p.battles}, timeLimit: ${p.timeLimit} },`;

interface Output {
  table: Map<string, MeasuredThreat>;
  levers: Map<string, ThreatLeverMeasure>;
  scale: ThreatScale;
  fingerprint: ThreatFingerprint;
  sha: string;
  timeLimitShare: number;
  /** What this run did about the scale, for the report. */
  scaleNote: string;
  /** The ladder measured in this run, when it was not adopted (the report prints its thresholds). */
  freshLadder?: Ladder;
}

function writeTable(o: Output): void {
  const ids = PRESETS.map((p) => p.id).filter((id) => o.table.has(id));
  const leverIds = ALTERNATE_PRESETS.map((p) => p.id).filter((id) => o.levers.has(id));
  const fpIds = PRESETS.map((p) => p.id).filter((id) => o.fingerprint.presets[id]);
  const src = `// GENERATED by scripts/timeline-threat.ts. Do not edit by hand; regenerate with \`npm run timeline:threat\`.
// Threat reference engagement: ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds per preset (docs/apex/TIMELINES_V2.md §1).
import type { MeasuredThreat, ThreatFingerprint, ThreatLeverMeasure, ThreatReferenceMeta, ThreatScale } from './threat';

export const THREAT_REFERENCE_META: ThreatReferenceMeta = {
  reference: 'threat_reference',
  formulaVersion: ${THREAT_FORMULA_VERSION},
  seeds: [${THREAT_SEEDS.join(', ')}],
  rungs: [
${THREAT_RUNGS.map((g) => `    { name: ${q(g.name)}, capitals: ${g.capitals}, destroyers: ${g.destroyers} },`).join('\n')}
  ],
  standoffKm: ${THREAT_STANDOFF},
  maxDuration: ${THREAT_MAX_DURATION},
  battles: ${ids.length * THREAT_RUNGS.length * THREAT_SEEDS.length},
  timeLimitShare: ${o.timeLimitShare.toFixed(3)},
  measuredOn: ${q(o.sha)},
};

export const REAPER_THREAT: Readonly<Record<string, MeasuredThreat>> = {
${ids.map((id) => `  ${id}: ${tsMeasure(o.table.get(id)!)},`).join('\n')}
};

export const THREAT_LEVERS: Readonly<Record<string, ThreatLeverMeasure>> = {
${leverIds
  .map((id) => {
    const l = o.levers.get(id)!;
    return `  ${id}: { key: ${q(l.key)}, current: ${l.current}, min: { value: ${l.min.value}, index: ${fmt1(l.min.index)} }, max: { value: ${l.max.value}, index: ${fmt1(l.max.index)} } },`;
  })
  .join('\n')}
};

/** The thresholds and the probe ladder they were derived from at the last re-base (§1.3, §1.8). */
export const THREAT_SCALE: ThreatScale = {
  formulaVersion: ${o.scale.formulaVersion},
  rebasedOn: ${q(o.scale.rebasedOn)},
  standoffKm: ${o.scale.standoffKm},
  maxDuration: ${o.scale.maxDuration},
  thresholds: [${o.scale.thresholds.join(', ')}],
  probes: [
${o.scale.probes.map(tsProbe).join('\n')}
  ],
};

/** What the table was measured from (§1.8): tests/alternateTimelines.test.ts and \`--check\` compare it with the current catalogue and presets. */
export const THREAT_FINGERPRINT: ThreatFingerprint = {
  catalogue: ${q(o.fingerprint.catalogue)},
  presets: {
${fpIds.map((id) => `    ${id}: ${q(o.fingerprint.presets[id])},`).join('\n')}
  },
};
`;
  writeFileSync(TABLE, src);
}

function writeReport(o: Output): void {
  const th = o.scale.thresholds;
  const tiers = threatTiers(th);
  const presets = PRESETS.filter((p) => o.table.has(p.id));
  const battles = presets.length * THREAT_RUNGS.length * THREAT_SEEDS.length;
  const limited = presets.reduce((a, p) => a + o.table.get(p.id)!.rungs.reduce((b, g) => b + g.timeLimit, 0), 0);
  const sorted = [...presets].sort((a, b) => o.table.get(a.id)!.index - o.table.get(b.id)!.index || a.id.localeCompare(b.id));
  const name = (p: RuleSet): string => (p.category === 'au' ? `${p.name} (ALTERNATE UNIVERSE)` : p.name);
  const derived = thresholdsFromProbes(o.scale.probes);
  const lines: string[] = [];
  lines.push('# Threat to the Reapers — measured table');
  lines.push('');
  lines.push('GENERATED by `scripts/timeline-threat.ts` (`npm run timeline:threat`). Do not edit by hand. Design and definitions: [TIMELINES_V2.md](TIMELINES_V2.md) §1.');
  lines.push('');
  lines.push(`- Measured on \`${o.sha}\`, formula version ${THREAT_FORMULA_VERSION}. Every figure is a SIMULATION_ESTIMATE measured in conventional battle; the tier is computed from the stored index.`);
  lines.push(`- Index = 50 × (mean Reaper hull lost + mean organic survival) over ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds (${THREAT_SEEDS.join(', ')}) per timeline, equal weights.`);
  lines.push(`- Reference: the coalition line and the Reaper group start ${THREAT_STANDOFF} nominal km apart (1.07 × ${THREAT_LONGEST_RANGE} km, the longest weapon range in the catalogue); time limit ${THREAT_MAX_DURATION} s (3.2 × the time a Reaper capital at top speed needs to cross that gap).`);
  lines.push(`- Thresholds ${th.join(' / ')} (derived from the probe ladder on \`${o.scale.rebasedOn}\`, below): ${tiers.map((t) => `${t.tier} ${t.label}`).join(', ')}.`);
  lines.push(`- Battles ending on the time limit: ${limited} of ${battles} (${(100 * o.timeLimitShare).toFixed(1)} %); \`--check\` fails above ${Math.round(100 * THREAT_TIME_LIMIT_BOUND)} %.`);
  lines.push('- "Holds" is the breaking point: consecutive Reaper groups, from the Raid up, that the coalition wins in at least 3 of 4 seeds, named with the group as this timeline deploys it.');
  lines.push(`- Fingerprint of what was measured (catalogue \`${o.fingerprint.catalogue}\` and one per preset, in \`threatMeasured.ts\`): a unit test and \`--check\` fail when the catalogue or a preset changes without a new measurement.`);
  lines.push('');
  lines.push('## Ratings, by index');
  lines.push('');
  lines.push('| Tier | Timeline | id | Index | Reaper losses | Organic survival | Holds |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const p of sorted) {
    const m = o.table.get(p.id)!;
    lines.push(`| ${labelOf(m.index, th)} | ${name(p)} | \`${p.id}\` | ${fmt1(m.index)} | ${pct(m.reaperLoss)} | ${pct(m.organicSurvival)} | ${threatHoldsText(m)} |`);
  }
  lines.push('');
  lines.push('## Per Reaper group');
  lines.push('');
  lines.push('Each cell: index of the group, coalition wins of 4 in brackets, and the group as this timeline deploys it (capitals/destroyers).');
  lines.push('');
  lines.push(`| id | ${THREAT_RUNGS.map((g) => `${g.name} (base ${g.capitals}/${g.destroyers})`).join(' | ')} | Time limit |`);
  lines.push(`| --- | ${THREAT_RUNGS.map(() => '---:').join(' | ')} | ---: |`);
  for (const p of presets) {
    const m = o.table.get(p.id)!;
    lines.push(`| \`${p.id}\` | ${m.rungs.map((g) => `${Math.round(g.index)} (${g.wins}) ${g.capitals}/${g.destroyers}`).join(' | ')} | ${m.rungs.reduce((a, g) => a + g.timeLimit, 0)} |`);
  }
  lines.push('');
  lines.push('## New timelines: declared and measured tier');
  lines.push('');
  lines.push('| Timeline | Declared | Measured | Index | Points inside the band | Status |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const p of ALTERNATE_PRESETS.filter((x) => o.table.has(x.id))) {
    const m = o.table.get(p.id)!;
    const d = ALTERNATE_META[p.id].declaredTier;
    const t = tierForIndex(m.index, th);
    const mg = margin(m.index, th);
    lines.push(`| ${p.name} | ${tierName(d)} | ${tierName(t)} | ${fmt1(m.index)} | ${Number.isFinite(mg) ? fmt1(mg) : 'open band'} | ${d === t ? 'agrees' : '**differs: retune by §1.8**'} |`);
  }
  if (o.levers.size > 0) {
    lines.push('');
    lines.push('## Tuning levers (§1.8)');
    lines.push('');
    lines.push('Each new timeline measured with its lever at the two ends of the documented, story-safe range; every other value as committed.');
    lines.push('');
    lines.push('| Timeline | Lever | Range | Current | Index at min | Index at max | Tier at min | Tier at max |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const p of ALTERNATE_PRESETS.filter((x) => o.levers.has(x.id))) {
      const l = o.levers.get(p.id)!;
      const meta = ALTERNATE_META[p.id].lever;
      lines.push(`| ${p.name} | \`${l.key}\` | ${meta.min} – ${meta.max} | ${l.current} | ${fmt1(l.min.index)} | ${fmt1(l.max.index)} | ${labelOf(l.min.index, th)} | ${labelOf(l.max.index, th)} |`);
    }
  }
  lines.push('');
  lines.push('## Probe ladder and thresholds (§1.3, §1.8)');
  lines.push('');
  lines.push(`Thresholds derived on \`${o.scale.rebasedOn}\` (formula version ${o.scale.formulaVersion}, standoff ${o.scale.standoffKm} km, time limit ${o.scale.maxDuration} s) from the probe ladder: canon with every organic faction’s ${THREAT_PROBE_KEYS.map((k) => `\`${k}\``).join(', ')} × m, measured on the same reference, groups and seeds as a timeline. It is built from canon alone and looks at no other preset. Each threshold is the midpoint, rounded to a whole index point, between the highest index among the probes that fail its rule and the lowest index among the probes that meet it. The ladder starts on the grid ×${THREAT_PROBE_GRID.join(', ×')} and bisects every transition (geometric midpoint) until its two probes lie within ×${THREAT_PROBE_RATIO} of each other or ${THREAT_PROBE_GAP} index points apart; a transition that skips a count of groups held is bisected to ×${THREAT_PROBE_RATIO} regardless. \`npm run timeline:threat -- --probes\` on that commit reproduces this section.`);
  lines.push('');
  lines.push('| Floor of tier | A probe at or above it … | Highest index below (m) | Lowest index at or above (m) | Threshold |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  for (const s of derived.splits) lines.push(`| ${tierName(s.tier)} | ${s.rule} | ${s.below ? `${fmt1(s.below.index)} (×${s.below.m})` : '—'} | ${s.above ? `${fmt1(s.above.index)} (×${s.above.m})` : '—'} | ${s.threshold ?? '—'} |`);
  lines.push('');
  lines.push(`Counts of groups held that the ladder produced: ${derived.holdCounts.join(', ')}.`);
  lines.push('');
  if (o.scale.probes.length > 0) {
    lines.push('| m | Index | Reaper losses | Organic survival | Holds | Wins | Time limit |');
    lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const p of o.scale.probes) lines.push(`| ×${p.m} | ${fmt1(p.index)} | ${pct(p.reaperLoss)} | ${pct(p.organicSurvival)} | ${p.holdsRungs} | ${p.wins} of ${p.battles} | ${p.timeLimit} |`);
    lines.push('');
  }
  lines.push(`Re-base check in this run: ${o.scaleNote}`);
  if (o.freshLadder?.derived.thresholds) lines.push(`The ladder measured in this run derives ${o.freshLadder.derived.thresholds.join(' / ')} (counts held ${o.freshLadder.derived.holdCounts.join(', ')}).`);
  lines.push('');
  writeFileSync(REPORT, lines.join('\n'));
}

// ------------------------------------------------------------------ main

const sameFingerprint = (a: ThreatFingerprint, b: ThreatFingerprint, ids: readonly string[]): string[] => {
  const out: string[] = [];
  if (a.catalogue !== b.catalogue) out.push(`the battle-relevant catalogue changed (fingerprint ${a.catalogue} → ${b.catalogue})`);
  for (const id of ids) if (a.presets[id] !== b.presets[id]) out.push(`${id}: the preset or the reference fleets it builds changed (fingerprint ${a.presets[id] ?? 'none'} → ${b.presets[id]})`);
  return out;
};

async function main(): Promise<void> {
  const jobs = Math.max(1, Number(option('--jobs') ?? Math.min(4, availableParallelism())));
  const check = flag('--check');

  if (flag('--file')) {
    const raw = JSON.parse(readFileSync(option('--file')!, 'utf8')) as RuleSet | RuleSet[];
    const sets = (Array.isArray(raw) ? raw : [raw]).map((r) => normaliseRules(r));
    console.log(`Measuring ${sets.length} rule set(s) from ${option('--file')} (prints only):`);
    await measure(sets.map((r) => ({ key: r.id, rules: r })), jobs);
    return;
  }

  if (flag('--probes')) {
    const ladder = await runLadder(jobs);
    const reasons = rebaseReasons(THREAT_SCALE, { ...currentRef(), thresholds: ladder.derived.thresholds });
    console.log(`\nCommitted thresholds ${THREAT_SCALE.thresholds.join(' / ')} (re-based on ${THREAT_SCALE.rebasedOn}).`);
    if (ladder.derived.problems.length || ladder.unfinished) console.log(`The ladder is incomplete${ladder.unfinished ? ' (refinement rounds ran out)' : ''}: ${ladder.derived.problems.join('; ')}`);
    console.log(reasons.length ? `A re-base is due (§1.8): ${reasons.join('; ')}.` : `No re-base is due: every derived threshold lies within ${THREAT_REBASE_DRIFT} points of the committed one.`);
    return;
  }

  const only = option('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of only ?? []) if (!PRESETS.some((p) => p.id === id)) throw new Error(`--only: unknown preset ${id}`);
  if (check && only) throw new Error('--check measures every preset; it does not take --only');
  const useProbes = check || (!only && !flag('--no-probes'));
  const problems: string[] = [];
  const sha = only ? `${measuredOn()} (partial: ${only.join(',')})` : measuredOn();

  // 1. The scale first, before any preset is measured (§1.8).
  let scale: ThreatScale = THREAT_SCALE;
  let scaleNote = only ? `not run (\`--only\`); the committed scale is kept.` : 'not run (`--no-probes`); the committed scale is kept.';
  let freshLadder: Ladder | undefined;
  if (useProbes) {
    const ladder = await runLadder(jobs);
    const reasons = rebaseReasons(THREAT_SCALE, { ...currentRef(), thresholds: ladder.derived.thresholds });
    if (!ladder.derived.thresholds || ladder.unfinished) {
      problems.push(`the probe ladder is incomplete${ladder.unfinished ? ' (refinement rounds ran out)' : ''}: ${ladder.derived.problems.join('; ') || 'no thresholds'}; the committed scale is kept (§1.8).`);
      scaleNote = `the ladder was incomplete (${ladder.derived.problems.join('; ')}); the committed scale is kept.`;
      freshLadder = ladder;
    } else if (reasons.length > 0) {
      if (check) {
        problems.push(`a re-base is due (§1.8): ${reasons.join('; ')}. Run \`npm run timeline:threat\`.`);
        scaleNote = `a re-base is due (${reasons.join('; ')}).`;
        freshLadder = ladder;
      } else {
        scale = { ...currentRef(), rebasedOn: sha, thresholds: ladder.derived.thresholds, probes: ladder.probes };
        scaleNote = `re-based in this run (${reasons.join('; ')}): thresholds ${THREAT_SCALE.thresholds.join(' / ')} → ${scale.thresholds.join(' / ')}.`;
        console.log(`\nRE-BASED (§1.8): ${reasons.join('; ')}.\n  thresholds ${THREAT_SCALE.thresholds.join(' / ')} → ${scale.thresholds.join(' / ')}`);
      }
    } else {
      scaleNote = `kept: every threshold the ladder derives on \`${sha}\` lies within ${THREAT_REBASE_DRIFT} points of the committed one, and the formula version, standoff and time limit are unchanged.`;
      freshLadder = ladder;
      console.log(`\nScale kept: the ladder derives ${ladder.derived.thresholds.join(' / ')}, within ${THREAT_REBASE_DRIFT} points of ${THREAT_SCALE.thresholds.join(' / ')}.`);
    }
  }
  const th = scale.thresholds;

  // 2. The presets.
  const targets = PRESETS.filter((p) => !only || only.includes(p.id));
  console.log(`\nThreat reference: ${targets.length} preset(s) × ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds, standoff ${THREAT_STANDOFF} km, time limit ${THREAT_MAX_DURATION} s, thresholds ${th.join(' / ')}, ${jobs} job(s)`);
  const measured = await measure(targets.map((p) => ({ key: p.id, rules: getPreset(p.id) })), jobs, th);

  const table = new Map<string, MeasuredThreat>();
  for (const p of PRESETS) {
    const m = measured.get(p.id) ?? (check ? undefined : REAPER_THREAT[p.id]);
    if (m) table.set(p.id, m);
  }
  const presentIds = PRESETS.map((p) => p.id).filter((id) => table.has(id));
  const perPreset = THREAT_RUNGS.length * THREAT_SEEDS.length;
  const limited = presentIds.reduce((a, id) => a + table.get(id)!.rungs.reduce((b, g) => b + g.timeLimit, 0), 0);
  const timeLimitShare = presentIds.length ? limited / (presentIds.length * perPreset) : 0;

  if (timeLimitShare > THREAT_TIME_LIMIT_BOUND) problems.push(`${(100 * timeLimitShare).toFixed(1)} % of the reference battles end on the time limit (bound ${Math.round(100 * THREAT_TIME_LIMIT_BOUND)} %): re-base the reference (§1.8).`);
  for (const p of ALTERNATE_PRESETS) {
    const m = table.get(p.id);
    if (!m) continue;
    const d = ALTERNATE_META[p.id].declaredTier;
    const t = tierForIndex(m.index, th);
    if (d !== t) problems.push(`${p.id}: declared tier ${d}, measured ${t} (index ${fmt1(m.index)}): move its lever by §1.8.`);
  }

  const fresh = threatFingerprint(PRESETS);
  if (check) {
    problems.push(...sameFingerprint(THREAT_FINGERPRINT, fresh, PRESETS.map((p) => p.id)).map((s) => `${s}: the table is out of date; run \`npm run timeline:threat\`.`));
    for (const p of PRESETS) {
      const committed = REAPER_THREAT[p.id];
      const now = measured.get(p.id)!;
      if (!committed) problems.push(`${p.id}: missing from the committed table.`);
      else {
        if (tierForIndex(committed.index, THREAT_SCALE.thresholds) !== tierForIndex(now.index, th)) problems.push(`${p.id}: committed tier ${tierForIndex(committed.index, THREAT_SCALE.thresholds)} (index ${fmt1(committed.index)}), measured ${tierForIndex(now.index, th)} (index ${fmt1(now.index)}).`);
        else if (Math.abs(committed.index - now.index) > THREAT_INDEX_TOLERANCE) problems.push(`${p.id}: committed index ${fmt1(committed.index)}, measured ${fmt1(now.index)} (tolerance ${THREAT_INDEX_TOLERANCE}): the table is out of date.`);
      }
    }
    console.log(problems.length ? `\nCHECK FAILED:\n- ${problems.join('\n- ')}` : '\nCheck passed: the scale holds, and every tier, index and fingerprint matches the committed table.');
    process.exit(problems.length ? 1 : 0);
  }

  // 3. The levers.
  const levers = new Map<string, ThreatLeverMeasure>(Object.entries(THREAT_LEVERS));
  if (!flag('--no-levers')) {
    const leverTargets = ALTERNATE_PRESETS.filter((p) => !only || only.includes(p.id));
    console.log(`\nLevers: ${leverTargets.length} timeline(s) at the two ends of the lever range`);
    const sets: { key: string; rules: RuleSet }[] = [];
    for (const p of leverTargets) {
      const lv = ALTERNATE_META[p.id].lever;
      sets.push({ key: `${p.id}@min`, rules: withLever(getPreset(p.id), lv.key, lv.min) });
      sets.push({ key: `${p.id}@max`, rules: withLever(getPreset(p.id), lv.key, lv.max) });
    }
    const res = await measure(sets, jobs, th);
    for (const p of leverTargets) {
      const lv = ALTERNATE_META[p.id].lever;
      levers.set(p.id, { key: lv.key, current: getLever(getPreset(p.id), lv.key), min: { value: lv.min, index: res.get(`${p.id}@min`)!.index }, max: { value: lv.max, index: res.get(`${p.id}@max`)!.index } });
    }
  }
  for (const id of [...levers.keys()]) if (!NEW_IDS.has(id)) levers.delete(id);

  // 4. The fingerprint of what was measured: a full run takes the current one; a partial run updates only what it measured.
  const fingerprint: ThreatFingerprint = only
    ? { catalogue: THREAT_FINGERPRINT.catalogue, presets: Object.fromEntries(PRESETS.map((p) => [p.id, only.includes(p.id) ? fresh.presets[p.id] : THREAT_FINGERPRINT.presets[p.id]]).filter(([, v]) => v)) }
    : fresh;

  const out: Output = { table, levers, scale, fingerprint, sha, timeLimitShare, scaleNote, freshLadder };
  writeTable(out);
  writeReport(out);
  console.log(`\nWrote ${TABLE.replace(`${ROOT}/`, '')} and ${REPORT.replace(`${ROOT}/`, '')} (measured on ${sha}; thresholds ${th.join(' / ')}).`);
  if (problems.length) {
    console.log(`\nATTENTION:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------ entry (last, after every declaration above)

if (flag('--worker')) {
  // Worker: one task per stdin line, one result per stdout line.
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return;
    const t = JSON.parse(line) as Task;
    const t0 = performance.now();
    const run = runThreatReference(t.rules, t.rung, t.seed);
    process.stdout.write(`${JSON.stringify({ id: t.id, run, ms: performance.now() - t0 })}\n`);
  });
} else {
  await main();
}

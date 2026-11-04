/**
 * Threat to the Reapers: measures every timeline on the threat reference
 * engagement and writes the generated table (docs/apex/TIMELINES_V2.md §1, §4.7).
 *
 *   npm run timeline:threat                     # every preset, plus each new timeline's lever at both ends; writes the table and the report
 *   npm run timeline:threat -- --only a,b       # a subset (and its levers), merged into the committed table (retuning, §1.8)
 *   npm run timeline:threat -- --check          # every preset; compare tiers with the committed table; writes nothing
 *   npm run timeline:threat -- --no-levers      # skip the lever measurements (the committed ones are kept)
 *   npm run timeline:threat -- --probes         # the preset-blind probe ladder of the re-basing rule (§1.8); prints only
 *   npm run timeline:threat -- --file sets.json # measure rule sets from a JSON file (one RuleSet or an array); prints only
 *   npm run timeline:threat -- --jobs 4         # worker processes (default min(4, available CPUs))
 *
 * Every battle is deterministic; results are keyed by task and assembled in
 * PRESETS order, so the output never depends on scheduling. Wall times go to
 * stdout only, never into a committed file.
 */
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ALTERNATE_META, ALTERNATE_PRESETS, getLever, withLever } from '../src/timelines/alternates';
import { PRESETS, getPreset } from '../src/timelines/presets';
import { cloneRules, type RuleSet } from '../src/timelines/rules';
import { normaliseRules } from '../src/timelines/schema';
import {
  REAPER_THREAT,
  THREAT_FORMULA_VERSION,
  THREAT_LEVERS,
  THREAT_RUNGS,
  THREAT_THRESHOLDS,
  THREAT_TIERS,
  THREAT_TIME_LIMIT_BOUND,
  summariseThreat,
  threatHoldsText,
  tierForIndex,
  type MeasuredThreat,
  type ThreatLeverMeasure,
  type ThreatRun,
} from '../src/timelines/threat';
import { THREAT_LONGEST_RANGE, THREAT_MAX_DURATION, THREAT_SEEDS, THREAT_STANDOFF, runThreatReference, threatRungGroups } from '../src/scenarios/threatReference';

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
const label = (index: number): string => {
  const t = tierForIndex(index);
  return `${t} ${THREAT_TIERS[t - 1].label}`;
};
const NEW_IDS = new Set(ALTERNATE_PRESETS.map((p) => p.id));

/** Index points to the nearest tier boundary (positive inside the band). */
const margin = (index: number): number => {
  const t = tierForIndex(index);
  const lo = THREAT_TIERS[t - 1].min;
  const hi = THREAT_TIERS[t - 1].max;
  return Math.min(t === 1 ? Infinity : index - lo, t === 6 ? Infinity : hi - index);
};

function tasksFor(key: string, rules: RuleSet, startId: number): Task[] {
  const out: Task[] = [];
  let id = startId;
  for (let rung = 0; rung < THREAT_RUNGS.length; rung++) for (const seed of THREAT_SEEDS) out.push({ id: id++, key, rules, rung, seed });
  return out;
}

async function measure(sets: { key: string; rules: RuleSet }[], jobs: number, quiet = false): Promise<Map<string, MeasuredThreat>> {
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
        console.log(`  ${t.key.padEnd(44)} index ${fmt1(m.index).padStart(5)}  tier ${label(m.index).padEnd(14)} rungs ${m.rungs.map((g) => `${Math.round(g.index)}(${g.wins})`).join(' ')}  time-limit ${m.rungs.reduce((a, g) => a + g.timeLimit, 0)}/${per}  [${sum.toFixed(1)} s CPU, max ${(Math.max(...ms) / 1000).toFixed(2)} s/battle]`);
      }
    }
  });
  if (!quiet && all.length) console.log(`  … ${tasks.length} battles in ${((performance.now() - t0) / 1000).toFixed(1)} s with ${jobs} job(s); per battle mean ${(all.reduce((a, b) => a + b, 0) / all.length / 1000).toFixed(2)} s, max ${(Math.max(...all) / 1000).toFixed(2)} s`);
  return out;
}

// ------------------------------------------------------------------ writers

/** A single-quoted TypeScript string literal (the repository's style). */
const q = (x: string): string => `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const tsMeasure = (m: MeasuredThreat): string => {
  const rungs = m.rungs
    .map((g) => `      { name: ${q(g.name)}, capitals: ${g.capitals}, destroyers: ${g.destroyers}, index: ${fmt1(g.index)}, reaperLoss: ${g.reaperLoss.toFixed(3)}, organicSurvival: ${g.organicSurvival.toFixed(3)}, wins: ${g.wins}, battles: ${g.battles}, timeLimit: ${g.timeLimit} },`)
    .join('\n');
  return `{\n    index: ${fmt1(m.index)},\n    reaperLoss: ${m.reaperLoss.toFixed(3)},\n    organicSurvival: ${m.organicSurvival.toFixed(3)},\n    holdsRungs: ${m.holdsRungs},\n    holdsUpTo: ${m.holdsUpTo},\n    timeLimitShare: ${m.timeLimitShare.toFixed(3)},\n    rungs: [\n${rungs}\n    ],\n  }`;
};

function writeTable(table: Map<string, MeasuredThreat>, levers: Map<string, ThreatLeverMeasure>, sha: string, timeLimitShare: number): void {
  const ids = PRESETS.map((p) => p.id).filter((id) => table.has(id));
  const leverIds = ALTERNATE_PRESETS.map((p) => p.id).filter((id) => levers.has(id));
  const src = `// GENERATED by scripts/timeline-threat.ts. Do not edit by hand; regenerate with \`npm run timeline:threat\`.
// Threat reference engagement: ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds per preset (docs/apex/TIMELINES_V2.md §1).
import type { MeasuredThreat, ThreatLeverMeasure, ThreatReferenceMeta } from './threat';

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
  timeLimitShare: ${timeLimitShare.toFixed(3)},
  measuredOn: ${q(sha)},
};

export const REAPER_THREAT: Readonly<Record<string, MeasuredThreat>> = {
${ids.map((id) => `  ${id}: ${tsMeasure(table.get(id)!)},`).join('\n')}
};

export const THREAT_LEVERS: Readonly<Record<string, ThreatLeverMeasure>> = {
${leverIds
  .map((id) => {
    const l = levers.get(id)!;
    return `  ${id}: { key: ${q(l.key)}, current: ${l.current}, min: { value: ${l.min.value}, index: ${fmt1(l.min.index)} }, max: { value: ${l.max.value}, index: ${fmt1(l.max.index)} } },`;
  })
  .join('\n')}
};
`;
  writeFileSync(TABLE, src);
}

function writeReport(table: Map<string, MeasuredThreat>, levers: Map<string, ThreatLeverMeasure>, sha: string, timeLimitShare: number): void {
  const presets = PRESETS.filter((p) => table.has(p.id));
  const battles = presets.length * THREAT_RUNGS.length * THREAT_SEEDS.length;
  const limited = presets.reduce((a, p) => a + table.get(p.id)!.rungs.reduce((b, g) => b + g.timeLimit, 0), 0);
  const sorted = [...presets].sort((a, b) => table.get(a.id)!.index - table.get(b.id)!.index || a.id.localeCompare(b.id));
  const name = (p: RuleSet): string => (p.category === 'au' ? `${p.name} (ALTERNATE UNIVERSE)` : p.name);
  const lines: string[] = [];
  lines.push('# Threat to the Reapers — measured table');
  lines.push('');
  lines.push('GENERATED by `scripts/timeline-threat.ts` (`npm run timeline:threat`). Do not edit by hand. Design and definitions: [TIMELINES_V2.md](TIMELINES_V2.md) §1.');
  lines.push('');
  lines.push(`- Measured on \`${sha}\`, formula version ${THREAT_FORMULA_VERSION}. Every figure is a SIMULATION_ESTIMATE measured in conventional battle; the tier is computed from the stored index.`);
  lines.push(`- Index = 50 × (mean Reaper hull lost + mean organic survival) over ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds (${THREAT_SEEDS.join(', ')}) per timeline, equal weights.`);
  lines.push(`- Reference: the coalition line and the Reaper group start ${THREAT_STANDOFF} nominal km apart (1.07 × ${THREAT_LONGEST_RANGE} km, the longest weapon range in the catalogue); time limit ${THREAT_MAX_DURATION} s (3.2 × the time a Reaper capital at top speed needs to cross that gap).`);
  lines.push(`- Thresholds ${THREAT_THRESHOLDS.join(' / ')}: ${THREAT_TIERS.map((t) => `${t.tier} ${t.label}`).join(', ')}.`);
  lines.push(`- Battles ending on the time limit: ${limited} of ${battles} (${(100 * timeLimitShare).toFixed(1)} %); \`--check\` fails above ${Math.round(100 * THREAT_TIME_LIMIT_BOUND)} %.`);
  lines.push('- "Holds" is the breaking point: consecutive Reaper groups, from the Raid up, that the coalition wins in at least 3 of 4 seeds, named with the group as this timeline deploys it.');
  lines.push('');
  lines.push('## Ratings, by index');
  lines.push('');
  lines.push('| Tier | Timeline | id | Index | Reaper losses | Organic survival | Holds |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const p of sorted) {
    const m = table.get(p.id)!;
    lines.push(`| ${label(m.index)} | ${name(p)} | \`${p.id}\` | ${fmt1(m.index)} | ${pct(m.reaperLoss)} | ${pct(m.organicSurvival)} | ${threatHoldsText(m)} |`);
  }
  lines.push('');
  lines.push('## Per Reaper group');
  lines.push('');
  lines.push('Each cell: index of the group, coalition wins of 4 in brackets, and the group as this timeline deploys it (capitals/destroyers).');
  lines.push('');
  lines.push(`| id | ${THREAT_RUNGS.map((g) => `${g.name} (base ${g.capitals}/${g.destroyers})`).join(' | ')} | Time limit |`);
  lines.push(`| --- | ${THREAT_RUNGS.map(() => '---:').join(' | ')} | ---: |`);
  for (const p of presets) {
    const m = table.get(p.id)!;
    lines.push(`| \`${p.id}\` | ${m.rungs.map((g) => `${Math.round(g.index)} (${g.wins}) ${g.capitals}/${g.destroyers}`).join(' | ')} | ${m.rungs.reduce((a, g) => a + g.timeLimit, 0)} |`);
  }
  lines.push('');
  lines.push('## New timelines: declared and measured tier');
  lines.push('');
  lines.push('| Timeline | Declared | Measured | Index | Points inside the band | Status |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const p of ALTERNATE_PRESETS.filter((x) => table.has(x.id))) {
    const m = table.get(p.id)!;
    const d = ALTERNATE_META[p.id].declaredTier;
    const t = tierForIndex(m.index);
    const mg = margin(m.index);
    lines.push(`| ${p.name} | ${d} ${THREAT_TIERS[d - 1].label} | ${t} ${THREAT_TIERS[t - 1].label} | ${fmt1(m.index)} | ${Number.isFinite(mg) ? fmt1(mg) : 'open band'} | ${d === t ? 'agrees' : '**differs: retune by §1.8**'} |`);
  }
  if (levers.size > 0) {
    lines.push('');
    lines.push('## Tuning levers (§1.8)');
    lines.push('');
    lines.push('Each new timeline measured with its lever at the two ends of the documented, story-safe range; every other value as committed.');
    lines.push('');
    lines.push('| Timeline | Lever | Range | Current | Index at min | Index at max | Tier at min | Tier at max |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const p of ALTERNATE_PRESETS.filter((x) => levers.has(x.id))) {
      const l = levers.get(p.id)!;
      const meta = ALTERNATE_META[p.id].lever;
      lines.push(`| ${p.name} | \`${l.key}\` | ${meta.min} – ${meta.max} | ${l.current} | ${fmt1(l.min.index)} | ${fmt1(l.max.index)} | ${label(l.min.index)} | ${label(l.max.index)} |`);
    }
  }
  lines.push('');
  writeFileSync(REPORT, lines.join('\n'));
}

// ------------------------------------------------------------------ main

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
    // Preset-blind probe ladder (§1.8 re-basing rule): canon with every organic fleet scaled uniformly.
    const ms = [0.4, 0.6, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const sets = ms.map((m) => {
      const r = cloneRules(getPreset('canon_me3'));
      r.id = `probe_x${m}`;
      for (const f of ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth'] as const) r.fleetStrength[f] = m;
      return { key: r.id, rules: r };
    });
    console.log('Probe ladder: canon with every organic fleet × m (prints only; §1.8 re-basing rule)');
    const res = await measure(sets, jobs);
    const byHeld = new Map<number, number[]>();
    for (const s of sets) {
      const m = res.get(s.key)!;
      if (!byHeld.has(m.holdsRungs)) byHeld.set(m.holdsRungs, []);
      byHeld.get(m.holdsRungs)!.push(m.index);
    }
    const levels = [...byHeld.entries()].sort((a, b) => a[0] - b[0]).map(([k, xs]) => ({ k, lo: Math.min(...xs), hi: Math.max(...xs) }));
    console.log('Index by rungs held:');
    for (const l of levels) console.log(`  holds ${l.k}: ${fmt1(l.lo)}–${fmt1(l.hi)}`);
    console.log('Midpoints between consecutive groups (candidate thresholds):');
    for (let i = 1; i < levels.length; i++) console.log(`  ${levels[i - 1].k}→${levels[i].k}: ${fmt1((levels[i - 1].hi + levels[i].lo) / 2)}`);
    return;
  }

  const only = option('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of only ?? []) if (!PRESETS.some((p) => p.id === id)) throw new Error(`--only: unknown preset ${id}`);
  const targets = PRESETS.filter((p) => !only || only.includes(p.id));
  console.log(`Threat reference: ${targets.length} preset(s) × ${THREAT_RUNGS.length} Reaper groups × ${THREAT_SEEDS.length} seeds, standoff ${THREAT_STANDOFF} km, time limit ${THREAT_MAX_DURATION} s, ${jobs} job(s)`);
  const measured = await measure(targets.map((p) => ({ key: p.id, rules: getPreset(p.id) })), jobs);

  const table = new Map<string, MeasuredThreat>();
  for (const p of PRESETS) {
    const m = measured.get(p.id) ?? (check ? undefined : REAPER_THREAT[p.id]);
    if (m) table.set(p.id, m);
  }
  const presentIds = PRESETS.map((p) => p.id).filter((id) => table.has(id));
  const perPreset = THREAT_RUNGS.length * THREAT_SEEDS.length;
  const limited = presentIds.reduce((a, id) => a + table.get(id)!.rungs.reduce((b, g) => b + g.timeLimit, 0), 0);
  const timeLimitShare = presentIds.length ? limited / (presentIds.length * perPreset) : 0;

  const problems: string[] = [];
  if (timeLimitShare > THREAT_TIME_LIMIT_BOUND) problems.push(`${(100 * timeLimitShare).toFixed(1)} % of the reference battles end on the time limit (bound ${Math.round(100 * THREAT_TIME_LIMIT_BOUND)} %): re-base the reference (§1.8).`);
  for (const p of ALTERNATE_PRESETS) {
    const m = table.get(p.id);
    if (!m) continue;
    const d = ALTERNATE_META[p.id].declaredTier;
    const t = tierForIndex(m.index);
    if (d !== t) problems.push(`${p.id}: declared tier ${d}, measured ${t} (index ${fmt1(m.index)}): move its lever by §1.8.`);
  }

  if (check) {
    for (const p of PRESETS) {
      const committed = REAPER_THREAT[p.id];
      const now = measured.get(p.id)!;
      if (!committed) problems.push(`${p.id}: missing from the committed table.`);
      else if (tierForIndex(committed.index) !== tierForIndex(now.index)) problems.push(`${p.id}: committed tier ${tierForIndex(committed.index)} (index ${fmt1(committed.index)}), measured ${tierForIndex(now.index)} (index ${fmt1(now.index)}).`);
    }
    console.log(problems.length ? `\nCHECK FAILED:\n- ${problems.join('\n- ')}` : '\nCheck passed: every tier matches the committed table.');
    process.exit(problems.length ? 1 : 0);
  }

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
    const res = await measure(sets, jobs);
    for (const p of leverTargets) {
      const lv = ALTERNATE_META[p.id].lever;
      levers.set(p.id, { key: lv.key, current: getLever(getPreset(p.id), lv.key), min: { value: lv.min, index: res.get(`${p.id}@min`)!.index }, max: { value: lv.max, index: res.get(`${p.id}@max`)!.index } });
    }
  }
  for (const id of [...levers.keys()]) if (!NEW_IDS.has(id)) levers.delete(id);

  const sha = only ? `${measuredOn()} (partial: ${only.join(',')})` : measuredOn();
  writeTable(table, levers, sha, timeLimitShare);
  writeReport(table, levers, sha, timeLimitShare);
  console.log(`\nWrote ${TABLE.replace(`${ROOT}/`, '')} and ${REPORT.replace(`${ROOT}/`, '')} (measured on ${sha}).`);
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

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenWording, hadesWordingOk } from '@/core/lint';

/**
 * Determinism lint (ADOPTION_PLAN.md §0.1 rule 4): nothing under the
 * simulation-affecting directories may read a wall clock or an unseeded
 * random source. Exactly three sites are allowed, each matched by path AND
 * pattern, and each must still exist so that a deleted exception is noticed.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src/simulation', 'src/data', 'src/timelines', 'src/scenarios', 'src/campaign', 'src/core', 'src/showcase/scenes'];
const FORBIDDEN = /\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b/;

const ALLOW: { path: string; pattern: RegExp; why: string }[] = [
  {
    path: 'src/core/saves.ts',
    pattern: /id: id \?\? `s\$\{Date\.now\(\)\.toString\(36\)\}\$\{Math\.floor\(Math\.random\(\) \* 1e4\)\.toString\(36\)\}`/,
    why: 'save-slot id: an identifier that never reaches the simulation',
  },
  {
    path: 'src/campaign/engine.ts',
    pattern: /id: `campaign-\$\{seed\}-\$\{Date\.now\(\)\.toString\(36\)\}`/,
    why: 'campaign id: an identifier that never reaches the simulation',
  },
  {
    path: 'src/simulation/profile.ts',
    pattern: /^\s*now: \(\) => number = \(\) => 0; \/\/ injection point:.*performance\.now$/,
    why: 'the injected profiler clock: headless default () => 0, set by scripts/perf-sim.ts and the controller only',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const posix = (p: string): string => p.split(sep).join('/');

describe('determinism lint', () => {
  const files = DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('walks the simulation directories', () => {
    expect(files.length).toBeGreaterThan(20);
    for (const d of DIRS.slice(0, 6)) expect(files.some((f) => posix(relative(ROOT, f)).startsWith(d + '/'))).toBe(true);
  });

  it('allows no Math.random, Date.now or performance.now outside the three allow-listed sites', () => {
    const violations: string[] = [];
    const allowHits = ALLOW.map(() => 0);
    for (const file of files) {
      const rel = posix(relative(ROOT, file));
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!FORBIDDEN.test(line)) return;
        const a = ALLOW.findIndex((e) => e.path === rel && e.pattern.test(line));
        if (a >= 0) allowHits[a]++;
        else violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(violations, `simulation-affecting code reads a clock or Math.random:\n${violations.join('\n')}`).toEqual([]);
    ALLOW.forEach((e, i) => expect(allowHits[i], `allow-list entry missing or duplicated: ${e.path} (${e.why})`).toBe(1));
  });
});

describe('HADES wording lint helpers', () => {
  it('forbiddenWording catches the forbidden phrase in every listed spelling', () => {
    // The variants are spelled out here only: the documentation lint walks the
    // planning documents and the source tree, never this test file.
    const forbidden = [
      'nuclear mass rounds',
      'nuclear mass round',
      'nuclear-tipped mass rounds',
      'nuclear tipped rounds',
      'nuclear mass accelerator rounds',
      'nuclear kinetic rounds',
      'nuclear slugs',
      'nuclear mass slugs',
      'nuclear shells',
      'NUCLEAR MASS ROUNDS',
      'fires nuclear-mass-accelerator-slugs at range',
    ];
    for (const s of forbidden) expect(forbiddenWording(s), s).toBe(true);
  });

  it('forbiddenWording accepts the approved wording', () => {
    const ok = [
      'penetrator with a nuclear warhead',
      'HADES penetrators',
      'a nuclear warhead fused to detonate after penetration',
      'kinetic rounds',
      'dreadnought rounds',
      'nuclear option',
    ];
    for (const s of ok) expect(forbiddenWording(s), s).toBe(false);
  });

  it('hadesWordingOk requires both "penetrator" and "warhead"', () => {
    expect(hadesWordingOk('Project Titan heavy accelerator (HADES penetrators): a penetrator with a nuclear warhead')).toBe(true);
    expect(hadesWordingOk('HADES penetrators enabled; the warhead detonates only after penetration')).toBe(true);
    expect(hadesWordingOk('HADES penetrators enabled')).toBe(false);
    expect(hadesWordingOk('a nuclear warhead')).toBe(false);
    expect(hadesWordingOk('')).toBe(false);
  });
});

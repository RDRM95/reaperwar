import type { RuleSet } from './rules';
import { REAPER_THREAT, THREAT_FINGERPRINT, THREAT_LEVERS, THREAT_REFERENCE_META, THREAT_SCALE } from './threatMeasured';

export { REAPER_THREAT, THREAT_FINGERPRINT, THREAT_LEVERS, THREAT_REFERENCE_META, THREAT_SCALE };

/**
 * "Threat to the Reapers": a 0–100 index measured on one fixed engagement
 * (docs/apex/TIMELINES_V2.md §1). Pure data and arithmetic: no DOM, no
 * simulation import and no clock (this file sits under the determinism lint).
 * The numbers come from the generated `threatMeasured.ts`, the thresholds
 * included (they are derived from the probe ladder recorded there, §1.3);
 * nothing here asserts a tier for any timeline.
 */

export type ThreatTier = 1 | 2 | 3 | 4 | 5 | 6;
export type ThreatLabel = 'Negligible' | 'Low' | 'Moderate' | 'Serious' | 'Severe' | 'Existential';

/**
 * Bumped whenever the reference engagement, the formula or the probe ladder changes meaning (TIMELINES_V2.md §1.8).
 * A bump forces a re-base: the recorded ladder no longer matches. 2: the continuous probe ladder and derived thresholds.
 */
export const THREAT_FORMULA_VERSION = 2;

export const THREAT_LABELS: readonly ThreatLabel[] = ['Negligible', 'Low', 'Moderate', 'Serious', 'Severe', 'Existential'];

/** Lower bounds of tiers 2–6 on the 0–100 index, derived from the probe ladder at the last re-base (§1.3, §1.8). */
export const THREAT_THRESHOLDS: readonly number[] = THREAT_SCALE.thresholds;

/** Largest share of the reference battles that may end on the time limit before `--check` fails (TIMELINES_V2.md §1.8). */
export const THREAT_TIME_LIMIT_BOUND = 0.25;

/** A re-base is due when a threshold the current ladder derives differs from the committed one by more than this (index points, §1.8). */
export const THREAT_REBASE_DRIFT = 2;

/** `--check` fails when a re-measured index differs from the committed one by more than this (index points; runs are deterministic, §1.8). */
export const THREAT_INDEX_TOLERANCE = 0.5;

export interface ThreatTierInfo {
  tier: ThreatTier;
  label: ThreatLabel;
  min: number;
  max: number;
  /** What the index band means, stated about the two measured quantities only (true by construction). */
  summary: string;
}

/**
 * What a band of the index implies about the two measured fractions alone (index = 50 × (L + S), L and S in 0–1).
 * Each bound follows from the band: L + S ≥ min/50 gives max(L, S) ≥ min/100 and, since neither exceeds 1,
 * min(L, S) ≥ min/50 − 1; L + S < max/50 gives max(L, S) < max/50 and min(L, S) < max/100.
 * Only the bounds that say something are kept. Fractions, 0–1.
 */
export interface BandClaims {
  sumAtLeast?: number;
  sumUnder?: number;
  /** Both the Reaper losses and the organic survival are at least this. */
  bothAtLeast?: number;
  /** The larger of the two is at least this. */
  largerAtLeast?: number;
  /** Both are under this. */
  bothUnder?: number;
  /** The smaller of the two is under this. */
  smallerUnder?: number;
}

export function bandClaims(min: number, max: number): BandClaims {
  const c: BandClaims = {};
  if (min > 0) {
    c.sumAtLeast = min / 50;
    c.largerAtLeast = min / 100;
    if (min > 50) c.bothAtLeast = min / 50 - 1;
  }
  if (max < 100) {
    c.sumUnder = max / 50;
    c.smallerUnder = max / 100;
    if (max < 50) c.bothUnder = max / 50;
  }
  return c;
}

const pctOf = (x: number): string => `${Math.round(x * 1000) / 10} %`;
const frac = (x: number): string => x.toFixed(2);

/** The band statement of `THREAT_TIERS[].summary`, rendered from `bandClaims` (exact bounds, never a rung). */
export function bandStatement(min: number, max: number): string {
  const c = bandClaims(min, max);
  const range = min <= 0 ? `Index under ${max}` : max >= 100 ? `Index ${min} and above` : `Index ${min} to ${max}`;
  const sum = c.sumAtLeast === undefined ? `less than ${frac(c.sumUnder!)}` : c.sumUnder === undefined ? `at least ${frac(c.sumAtLeast)}` : `${frac(c.sumAtLeast)} to ${frac(c.sumUnder)}`;
  const clauses: string[] = [];
  if (c.bothAtLeast !== undefined) clauses.push(`the Reapers lose at least ${pctOf(c.bothAtLeast)} of the hull value they commit and at least ${pctOf(c.bothAtLeast)} of the coalition survives`);
  if (c.largerAtLeast !== undefined) clauses.push(`at least one of the two reaches ${pctOf(c.largerAtLeast)}`);
  if (c.bothUnder !== undefined) clauses.push(`the Reapers lose less than ${pctOf(c.bothUnder)} of the hull value they commit and less than ${pctOf(c.bothUnder)} of the coalition survives`);
  if (c.smallerUnder !== undefined) clauses.push(`the smaller of the two stays under ${pctOf(c.smallerUnder)}`);
  const body = clauses.length > 1 ? `${clauses.slice(0, -1).join('; ')}; and ${clauses[clauses.length - 1]}` : clauses[0];
  return `${range}: Reaper losses and organic survival add up to ${sum}, so ${body}.`;
}

/** The six tiers for a set of five thresholds (lower bounds of tiers 2–6). */
export const threatTiers = (thresholds: readonly number[]): ThreatTierInfo[] =>
  THREAT_LABELS.map((label, i) => {
    const min = i === 0 ? 0 : thresholds[i - 1];
    const max = i === THREAT_LABELS.length - 1 ? 100 : thresholds[i];
    return { tier: (i + 1) as ThreatTier, label, min, max, summary: bandStatement(min, max) };
  });

/** One row per tier, from the committed thresholds. Each summary follows from the band itself: index = 50 × (Reaper hull lost + organic survival). */
export const THREAT_TIERS: readonly ThreatTierInfo[] = threatTiers(THREAT_THRESHOLDS);

/** The five Reaper groups of the reference before a timeline's `fleetStrength.reaper` scales them (TIMELINES_V2.md §1.1). */
export const THREAT_RUNGS = [
  { name: 'Raid', capitals: 2, destroyers: 5 },
  { name: 'Strike group', capitals: 3, destroyers: 7 },
  { name: 'Battlegroup', capitals: 4, destroyers: 10 },
  { name: 'Assault fleet', capitals: 5, destroyers: 12 },
  { name: 'Harvest fleet', capitals: 6, destroyers: 14 },
] as const;

/** A Reaper group as a timeline actually deploys it in the reference. */
export interface RungGroup {
  name: string;
  capitals: number;
  destroyers: number;
}

/** One reference battle, as src/scenarios/threatReference.ts reports it. */
export interface ThreatRun {
  /** 0-based rung (0 = Raid … 4 = Harvest fleet). */
  rung: number;
  seed: number;
  /** Point-value-weighted Reaper hull lost, 0–1 (partial damage counts). */
  reaperLoss: number;
  /** Point value of the surviving coalition hulls over the value deployed, 0–1. */
  organicSurvival: number;
  winner: 'A' | 'B' | 'draw';
  duration: number;
  /** The battle ended on the attrition judgement at the time limit. */
  timeLimit: boolean;
}

export interface RungMeasure extends RungGroup {
  index: number;
  reaperLoss: number;
  organicSurvival: number;
  /** Battles won by the coalition. */
  wins: number;
  battles: number;
  /** Battles that ended on the time limit. */
  timeLimit: number;
}

export interface MeasuredThreat {
  index: number;
  reaperLoss: number;
  organicSurvival: number;
  /** Consecutive rungs, from the Raid up, that the coalition wins in at least 3 of 4 seeds (0–5). */
  holdsRungs: number;
  /** Capital ships in the largest held group as this timeline deploys it (0 when it holds none). */
  holdsUpTo: number;
  /** Share of the battles that ended on the time limit. */
  timeLimitShare: number;
  rungs: RungMeasure[];
}

export interface ThreatRating extends MeasuredThreat {
  tier: ThreatTier;
  label: ThreatLabel;
  summary: string;
}

export interface ThreatReferenceMeta {
  reference: string;
  formulaVersion: number;
  seeds: readonly number[];
  rungs: readonly RungGroup[];
  /** Distance between the two lines at the start, nominal km (§1.1). */
  standoffKm: number;
  /** Time limit of every reference battle, s (§1.1). */
  maxDuration: number;
  /** Battles measured for the table (presets × rungs × seeds). */
  battles: number;
  /** Share of those battles that ended on the time limit. */
  timeLimitShare: number;
  /** Short commit the table was measured on ('unknown' without git; '+dirty' when src differed from it). */
  measuredOn: string;
}

/** A new timeline's tuning lever measured at both ends of its documented range (§1.8, `--levers`). */
export interface ThreatLeverMeasure {
  key: string;
  current: number;
  min: { value: number; index: number };
  max: { value: number; index: number };
}

/**
 * What the table was measured from (§1.8): a hash of the battle-relevant catalogue (weapons, ship classes,
 * faction doctrine, the data and simulation constants) and, per preset, of its battle-relevant knobs and the
 * reference fleets it builds. A unit test and `--check` fail when either no longer matches.
 */
export interface ThreatFingerprint {
  catalogue: string;
  presets: Readonly<Record<string, string>>;
}

// ------------------------------------------------------------------ the probe ladder (§1.3, §1.8)

/**
 * One probe of the ladder: canon with every organic faction's fire rate, heat capacity and hull integrity × m,
 * measured on the same reference, rungs and seeds as a timeline. It has the total firepower and total hull of
 * m times the canon ships without `scaleCount`'s rounding, so the ladder is continuous in m.
 */
export interface ThreatProbe {
  m: number;
  index: number;
  reaperLoss: number;
  organicSurvival: number;
  holdsRungs: number;
  /** Coalition wins over the probe's battles (rungs × seeds). */
  wins: number;
  battles: number;
  timeLimit: number;
}

/** The thresholds and the ladder they were derived from, as recorded at the last re-base (generated). */
export interface ThreatScale {
  formulaVersion: number;
  /** Short commit of the re-base ('design-time' for the formula-1 thresholds, which no ladder produced). */
  rebasedOn: string;
  standoffKm: number;
  maxDuration: number;
  thresholds: readonly number[];
  probes: readonly ThreatProbe[];
}

/** The probe knobs, each × m on `organic` (canon sets no faction override, so every organic faction follows). */
export const THREAT_PROBE_KEYS = ['fireRate', 'heatCapacity', 'hullIntegrity'] as const;

/** The ladder's starting grid of m (about ×1.25 apart, canon at 1); refinement and extension add to it. */
export const THREAT_PROBE_GRID: readonly number[] = [0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.55, 1.95, 2.45, 3.05];

/** A bracket is refined until its two probes are this close in m (ratio) or in index (points), whichever comes first. */
export const THREAT_PROBE_RATIO = 1.03;
export const THREAT_PROBE_GAP = 2;
/** Safety bounds of the ladder: refinement rounds, and how far it may extend beyond the grid to span every split. */
export const THREAT_PROBE_MAX_ROUNDS = 6;
export const THREAT_PROBE_RANGE: readonly [number, number] = [0.1, 8];

/**
 * The split rules, one per tier floor (tiers 2–6): a probe that meets the rule stands at or above that tier.
 * Tier 1 against 2 splits the probes that hold nothing by whether they win anything at all; tier 5 spans
 * three and four groups held (no split between them).
 */
export const THREAT_SPLIT_RULES: readonly { tier: ThreatTier; rule: string; meets: (p: Pick<ThreatProbe, 'holdsRungs' | 'wins'>) => boolean }[] = [
  { tier: 2, rule: 'wins at least one of its battles', meets: (p) => p.wins >= 1 },
  { tier: 3, rule: 'holds at least one group (the Raid)', meets: (p) => p.holdsRungs >= 1 },
  { tier: 4, rule: 'holds at least two groups', meets: (p) => p.holdsRungs >= 2 },
  { tier: 5, rule: 'holds at least three groups', meets: (p) => p.holdsRungs >= 3 },
  { tier: 6, rule: 'holds all five groups', meets: (p) => p.holdsRungs >= 5 },
];

export interface ThreatSplit {
  tier: ThreatTier;
  rule: string;
  /** The highest index among the probes that fail the rule, and its m. */
  below?: { m: number; index: number };
  /** The lowest index among the probes that meet the rule, and its m. */
  above?: { m: number; index: number };
  /** The midpoint of the two, rounded to a whole index point. */
  threshold?: number;
}

export interface DerivedThresholds {
  splits: ThreatSplit[];
  /** The five thresholds, or undefined when the ladder does not span every split or they do not increase. */
  thresholds?: number[];
  problems: string[];
  /** The counts of groups held that the ladder produced (0–5). */
  holdCounts: number[];
}

/** §1.3: each threshold is the midpoint between the probes either side of its split rule, rounded to a whole point. */
export function thresholdsFromProbes(probes: readonly ThreatProbe[]): DerivedThresholds {
  const problems: string[] = [];
  const splits = THREAT_SPLIT_RULES.map((s): ThreatSplit => {
    const fail = probes.filter((p) => !s.meets(p));
    const meet = probes.filter((p) => s.meets(p));
    const below = fail.reduce<ThreatProbe | undefined>((a, p) => (!a || p.index > a.index ? p : a), undefined);
    const above = meet.reduce<ThreatProbe | undefined>((a, p) => (!a || p.index < a.index ? p : a), undefined);
    if (!below || !above) {
      problems.push(`no probe ${below ? 'meets' : 'fails'} the tier-${s.tier} rule (${s.rule}): the ladder does not span it`);
      return { tier: s.tier, rule: s.rule, below: below && { m: below.m, index: below.index }, above: above && { m: above.m, index: above.index } };
    }
    return { tier: s.tier, rule: s.rule, below: { m: below.m, index: below.index }, above: { m: above.m, index: above.index }, threshold: Math.round((below.index + above.index) / 2) };
  });
  let thresholds: number[] | undefined = splits.every((s) => s.threshold !== undefined) ? splits.map((s) => s.threshold!) : undefined;
  if (thresholds) {
    for (let i = 0; i < thresholds.length; i++) {
      const lo = i === 0 ? 0 : thresholds[i - 1];
      if (!(thresholds[i] > lo) || thresholds[i] >= 100) problems.push(`the tier-${i + 2} threshold ${thresholds[i]} does not lie between ${lo} and 100`);
    }
    if (problems.length) thresholds = undefined;
  }
  const holdCounts = [...new Set(probes.map((p) => p.holdsRungs))].sort((a, b) => a - b);
  return { splits, thresholds, problems, holdCounts };
}

const r3m = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * The next probe values to measure (§1.8), sorted; empty when the ladder is complete. Deterministic: it reads only
 * the probes measured so far. Extends the ladder below or above when a split has probes on one side only; then, for
 * every split rule and every count of groups held, bisects (geometric midpoint, 3 decimals) the bracket between the
 * strongest probe below the transition and the weakest at or above it while its probes are more than
 * `THREAT_PROBE_RATIO` apart in m and `THREAT_PROBE_GAP` apart in index, ignoring the index gap where the bracket
 * skips a count of groups held, so that every count that exists between two probes is found.
 */
export function nextProbeValues(probes: readonly ThreatProbe[]): number[] {
  const out = new Set<number>();
  const seen = new Set(probes.map((p) => p.m));
  const sorted = [...probes].sort((a, b) => a.m - b.m);
  if (sorted.length === 0) return [...THREAT_PROBE_GRID];
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const rules = [...THREAT_SPLIT_RULES.map((s) => s.meets), ...[1, 2, 3, 4, 5].map((k) => (p: Pick<ThreatProbe, 'holdsRungs' | 'wins'>) => p.holdsRungs >= k)];
  for (const meets of rules) {
    const firstMeet = sorted.findIndex((p) => meets(p));
    if (firstMeet < 0) {
      if (highest.m * 1.25 <= THREAT_PROBE_RANGE[1]) out.add(r3m(highest.m * 1.25));
      continue;
    }
    if (firstMeet === 0) {
      if (lowest.m / 1.25 >= THREAT_PROBE_RANGE[0]) out.add(r3m(lowest.m / 1.25));
      continue;
    }
    const lo = sorted[firstMeet - 1];
    const hi = sorted[firstMeet];
    const skips = hi.holdsRungs - lo.holdsRungs > 1;
    if (hi.m / lo.m <= THREAT_PROBE_RATIO) continue;
    if (!skips && Math.abs(hi.index - lo.index) <= THREAT_PROBE_GAP) continue;
    const mid = r3m(Math.sqrt(lo.m * hi.m));
    if (mid > lo.m && mid < hi.m) out.add(mid);
  }
  return [...out].filter((m) => !seen.has(m)).sort((a, b) => a - b);
}

/** Whether the committed scale must be re-based for a ladder measured now (§1.8): the reasons, empty when it holds. */
export function rebaseReasons(
  committed: Pick<ThreatScale, 'formulaVersion' | 'standoffKm' | 'maxDuration' | 'thresholds' | 'probes'>,
  now: { formulaVersion: number; standoffKm: number; maxDuration: number; thresholds?: readonly number[] },
): string[] {
  const out: string[] = [];
  if (committed.probes.length === 0) out.push('no probe ladder is recorded for the committed thresholds');
  if (committed.formulaVersion !== now.formulaVersion) out.push(`formula version ${committed.formulaVersion} → ${now.formulaVersion}`);
  if (committed.standoffKm !== now.standoffKm) out.push(`standoff ${committed.standoffKm} → ${now.standoffKm} km`);
  if (committed.maxDuration !== now.maxDuration) out.push(`time limit ${committed.maxDuration} → ${now.maxDuration} s`);
  if (now.thresholds) {
    now.thresholds.forEach((t, i) => {
      const c = committed.thresholds[i];
      if (c === undefined || Math.abs(t - c) > THREAT_REBASE_DRIFT) out.push(`tier-${i + 2} threshold ${c ?? '—'} → ${t} (more than ${THREAT_REBASE_DRIFT} points)`);
    });
  }
  return out;
}

// ------------------------------------------------------------------ arithmetic

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The battle or timeline index: 50 × (Reaper hull lost + organic survival), both 0–1. */
export const threatIndex = (reaperLoss: number, organicSurvival: number): number => 50 * (clamp01(reaperLoss) + clamp01(organicSurvival));

export function tierForIndex(index: number, thresholds: readonly number[] = THREAT_THRESHOLDS): ThreatTier {
  let tier = 1;
  for (const t of thresholds) if (index >= t) tier++;
  return tier as ThreatTier;
}

export const tierInfo = (tier: ThreatTier): ThreatTierInfo => THREAT_TIERS[tier - 1];

/** A rung holds when the coalition wins at least 3 of its 4 battles. */
const holds = (p: RungMeasure): boolean => p.battles > 0 && p.wins * 4 >= p.battles * 3;

/**
 * Aggregates the runs of one timeline (rungs × seeds, equal weights) and
 * rounds as the generated table stores it. `groups` are the Reaper groups the
 * timeline actually deploys (after `fleetStrength.reaper`), so the breaking
 * point names the group the coalition really fought.
 */
export function summariseThreat(runs: readonly ThreatRun[], groups: readonly RungGroup[]): MeasuredThreat {
  const per: RungMeasure[] = groups.map((g, k) => {
    const rs = runs.filter((r) => r.rung === k);
    const L = mean(rs.map((r) => r.reaperLoss));
    const S = mean(rs.map((r) => r.organicSurvival));
    return {
      name: g.name,
      capitals: g.capitals,
      destroyers: g.destroyers,
      index: r1(threatIndex(L, S)),
      reaperLoss: r3(L),
      organicSurvival: r3(S),
      wins: rs.filter((r) => r.winner === 'A').length,
      battles: rs.length,
      timeLimit: rs.filter((r) => r.timeLimit).length,
    };
  });
  let holdsRungs = 0;
  for (const p of per) {
    if (!holds(p)) break;
    holdsRungs++;
  }
  const L = mean(runs.map((r) => r.reaperLoss));
  const S = mean(runs.map((r) => r.organicSurvival));
  return {
    index: r1(threatIndex(L, S)),
    reaperLoss: r3(L),
    organicSurvival: r3(S),
    holdsRungs,
    holdsUpTo: holdsRungs > 0 ? per[holdsRungs - 1].capitals : 0,
    timeLimitShare: r3(runs.length ? runs.filter((r) => r.timeLimit).length / runs.length : 0),
    rungs: per,
  };
}

/** A probe's ladder row from its measurement (§1.3). */
export const probeOf = (m: number, t: MeasuredThreat): ThreatProbe => ({
  m,
  index: t.index,
  reaperLoss: t.reaperLoss,
  organicSurvival: t.organicSurvival,
  holdsRungs: t.holdsRungs,
  wins: t.rungs.reduce((a, g) => a + g.wins, 0),
  battles: t.rungs.reduce((a, g) => a + g.battles, 0),
  timeLimit: t.rungs.reduce((a, g) => a + g.timeLimit, 0),
});

/** The rating the UI shows; undefined ("Unrated") for custom timelines and anything the table does not cover. */
export function threatRating(rules: Pick<RuleSet, 'id' | 'category'>): ThreatRating | undefined {
  if (rules.category === 'custom') return undefined;
  const m = REAPER_THREAT[rules.id];
  if (!m) return undefined;
  const info = tierInfo(tierForIndex(m.index));
  return { ...m, tier: info.tier, label: info.label, summary: info.summary };
}

export const UNRATED = 'Unrated';

const pct = (x: number): string => `${Math.round(100 * x)} %`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const groupText = (g: RungGroup): string => `${plural(g.capitals, 'capital', 'capitals')}, ${plural(g.destroyers, 'destroyer', 'destroyers')} in this timeline`;

/** The breaking point in one sentence, naming the Reaper group the timeline really fought (§1.4). */
export function threatHoldsText(m: Pick<MeasuredThreat, 'holdsRungs' | 'rungs'>): string {
  const k = m.holdsRungs;
  if (k <= 0 || m.rungs.length === 0) return 'Holds none of the reference Reaper groups.';
  const g = m.rungs[k - 1];
  if (k >= m.rungs.length) return `Holds all ${m.rungs.length} reference Reaper groups, up to the ${g.name} (${groupText(g)}).`;
  if (k === 1) return `Holds the ${g.name} (${groupText(g)}) and no larger reference group.`;
  return `Holds every reference Reaper group up to the ${g.name} (${groupText(g)}) and none above it.`;
}

/** One line per rung for the detail panel and the codex: group, index and wins. */
export const threatRungLines = (m: Pick<MeasuredThreat, 'rungs'>): string[] =>
  m.rungs.map((g) => `${g.name} (${g.capitals}/${g.destroyers}): index ${g.index.toFixed(1)}, won ${g.wins} of ${g.battles}`);

/** Tooltip text: the measured losses and survival, the breaking point, and how it was measured. */
export function threatTooltip(r: ThreatRating | undefined): string {
  if (!r) return 'Threat to the Reapers: unrated. Custom timelines are not measured; tiers are measured for the built-in timelines on the threat reference engagement.';
  const meta = THREAT_REFERENCE_META;
  return [
    `Threat to the Reapers ${r.tier}/6 — ${r.label} (index ${Math.round(r.index)}).`,
    `Reaper losses ${pct(r.reaperLoss)}, organic survival ${pct(r.organicSurvival)}.`,
    threatHoldsText(r),
    `Measured in conventional battle: threat reference engagement, ${meta.rungs.length} Reaper group sizes × ${meta.seeds.length} seeds (${meta.measuredOn}).`,
    'Simulation estimate.',
  ].join(' ');
}

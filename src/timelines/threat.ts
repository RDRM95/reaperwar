import type { RuleSet } from './rules';
import { REAPER_THREAT, THREAT_LEVERS, THREAT_REFERENCE_META } from './threatMeasured';

export { REAPER_THREAT, THREAT_LEVERS, THREAT_REFERENCE_META };

/**
 * "Threat to the Reapers": a 0–100 index measured on one fixed engagement
 * (docs/apex/TIMELINES_V2.md §1). Pure data and arithmetic: no DOM, no
 * simulation import and no clock (this file sits under the determinism lint).
 * The numbers come from the generated `threatMeasured.ts`; nothing here asserts
 * a tier for any timeline.
 */

export type ThreatTier = 1 | 2 | 3 | 4 | 5 | 6;
export type ThreatLabel = 'Negligible' | 'Low' | 'Moderate' | 'Serious' | 'Severe' | 'Existential';

/** Bumped whenever the reference engagement or the formula changes meaning (TIMELINES_V2.md §1.8). */
export const THREAT_FORMULA_VERSION = 1;

/** Lower bounds of tiers 2–6 on the 0–100 index (TIMELINES_V2.md §1.3). Fixed: never tuned to a preset. */
export const THREAT_THRESHOLDS = [17, 30, 48, 62, 87] as const;

/** Largest share of the reference battles that may end on the time limit before `--check` fails (TIMELINES_V2.md §1.8). */
export const THREAT_TIME_LIMIT_BOUND = 0.25;

export interface ThreatTierInfo {
  tier: ThreatTier;
  label: ThreatLabel;
  min: number;
  max: number;
  /** What the index band means, stated about the two measured quantities only (true by construction). */
  summary: string;
}

/** One row per tier. Each summary follows from the band itself: index = 50 × (Reaper hull lost + organic survival). */
export const THREAT_TIERS: readonly ThreatTierInfo[] = [
  { tier: 1, label: 'Negligible', min: 0, max: 17, summary: 'Index under 17: on average the Reapers lose less than a third of the hull value they commit, and less than a third of the coalition survives.' },
  { tier: 2, label: 'Low', min: 17, max: 30, summary: 'Index 17 to 30: on average the Reapers lose less than 60 % of the hull value they commit and less than 60 % of the coalition survives, but the two together reach at least a third.' },
  { tier: 3, label: 'Moderate', min: 30, max: 48, summary: 'Index 30 to 48: Reaper losses and organic survival average 0.60 to 0.96 together, so at least one of them reaches 30 % and at most one reaches half.' },
  { tier: 4, label: 'Serious', min: 48, max: 62, summary: 'Index 48 to 62: Reaper losses and organic survival average 0.96 to 1.24 together, so at least one of them reaches 48 % and the smaller stays under 62 %.' },
  { tier: 5, label: 'Severe', min: 62, max: 87, summary: 'Index 62 to 87: on average the Reapers lose at least a quarter of the hull value they commit and at least a quarter of the coalition survives, and one of the two reaches 62 %.' },
  { tier: 6, label: 'Existential', min: 87, max: 100, summary: 'Index 87 and above: on average the Reapers lose at least three quarters of the hull value they commit and at least three quarters of the coalition survives.' },
];

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

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The battle or timeline index: 50 × (Reaper hull lost + organic survival), both 0–1. */
export const threatIndex = (reaperLoss: number, organicSurvival: number): number => 50 * (clamp01(reaperLoss) + clamp01(organicSurvival));

export function tierForIndex(index: number): ThreatTier {
  let tier = 1;
  for (const t of THREAT_THRESHOLDS) if (index >= t) tier++;
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

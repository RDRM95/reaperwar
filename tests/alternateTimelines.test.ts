import { describe, expect, it } from 'vitest';
import { advanceTick, createCampaign } from '@/campaign/engine';
import { CODEX, CODEX_CATEGORIES } from '@/codex/entries';
import { forbiddenWording } from '@/core/lint';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPON_LIST } from '@/data/weapons';
import { SCENARIOS, defaultWorldState, type ScenarioDef } from '@/scenarios';
import { THREAT_COALITION, THREAT_LONGEST_RANGE, THREAT_MAX_DURATION, THREAT_SEEDS, THREAT_STANDOFF, buildThreatReference, threatFingerprint, threatProbeRules, threatRungGroups, threatRunOf } from '@/scenarios/threatReference';
import { BattleSimulation } from '@/simulation/battle';
import { ALTERNATE_META, ALTERNATE_PRESETS, CAMPAIGN_WORLD_STATE_CHOICES, CAMPAIGN_WORLD_STATE_DEFAULTS, auPrefix, getLever, lockWorldState, timelineTag, timelineTagById, timelineTitle, withLever } from '@/timelines/alternates';
import { PRESETS, getPreset, makeCustom } from '@/timelines/presets';
import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, TECH_KEYS, type FleetStrength, type RuleSet } from '@/timelines/rules';
import { exportRuleSet, normaliseRules, validateRuleSet } from '@/timelines/schema';
import {
  REAPER_THREAT,
  THREAT_FINGERPRINT,
  THREAT_FORMULA_VERSION,
  THREAT_LEVERS,
  THREAT_PROBE_GAP,
  THREAT_PROBE_GRID,
  THREAT_PROBE_KEYS,
  THREAT_PROBE_RATIO,
  THREAT_REBASE_DRIFT,
  THREAT_REFERENCE_META,
  THREAT_RUNGS,
  THREAT_SCALE,
  THREAT_SPLIT_RULES,
  THREAT_THRESHOLDS,
  THREAT_TIERS,
  THREAT_TIME_LIMIT_BOUND,
  bandClaims,
  bandStatement,
  nextProbeValues,
  rebaseReasons,
  summariseThreat,
  thresholdsFromProbes,
  threatHoldsText,
  threatIndex,
  threatRating,
  threatTiers,
  threatTooltip,
  tierForIndex,
  type ThreatProbe,
  type ThreatRun,
} from '@/timelines/threat';
import { runSimAsync, yieldToLoop } from './support/async';

/**
 * The ten alternate timelines and the measured "Threat to the Reapers" scale
 * (docs/apex/TIMELINES_V2.md §4.11). No test pins a measured number: the
 * generated table is checked for coverage, consistency and agreement with the
 * declared tiers, and the runtime test only checks an ordering.
 */

const EXISTING = ['canon_me3', 'prepared_galaxy', 'humanity_ascendant', 'cerberus_reformed', 'reaper_escalation', 'prime_apex', 'apex_legacy', 'cerberus_ascendant'];
const ORGANIC = ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth', 'cerberus'] as const;

const textsOf = (p: RuleSet): string[] => [p.name, p.tagline, p.description, ...p.historyChanges];
const metaTexts = (id: string): string[] => {
  const m = ALTERNATE_META[id];
  return [m.divergence.event, m.canonBasis, m.campaignNote ?? '', ...Object.values(m.worldState ?? {}).map((l) => l.why)].filter(Boolean);
};
const wordingOk = (t: string): void => {
  expect(forbiddenWording(t), t).toBe(false);
  expect(t, t).not.toMatch(/near-c|near light/i);
  expect(t, t).not.toMatch(/3× canon slug|3x canon slug/);
};
const choicesOf = (s: ScenarioDef): Record<string, string[]> => Object.fromEntries((s.worldState ?? []).map((o) => [o.id, o.choices.map((c) => c.id)]));

/** Every knob a preset changes from canon, as [path, value, canon]. */
function changedKnobs(p: RuleSet): { path: string; v: unknown; canon: unknown }[] {
  const out: { path: string; v: unknown; canon: unknown }[] = [];
  for (const k of TECH_KEYS) {
    if (p.organic[k] !== CANON_TECH[k]) out.push({ path: `organic.${k}`, v: p.organic[k], canon: CANON_TECH[k] });
    if (p.reaper[k] !== CANON_TECH[k]) out.push({ path: `reaper.${k}`, v: p.reaper[k], canon: CANON_TECH[k] });
  }
  for (const [f, o] of Object.entries(p.factionOverrides)) for (const [k, v] of Object.entries(o ?? {})) out.push({ path: `factionOverrides.${f}.${k}`, v, canon: CANON_TECH[k as keyof typeof CANON_TECH] });
  for (const [k, v] of Object.entries(p.special)) if (v !== CANON_SPECIAL[k as keyof typeof CANON_SPECIAL]) out.push({ path: `special.${k}`, v, canon: CANON_SPECIAL[k as keyof typeof CANON_SPECIAL] });
  for (const [k, v] of Object.entries(p.fleetStrength)) if (v !== CANON_FLEETS[k as keyof FleetStrength]) out.push({ path: `fleetStrength.${k}`, v, canon: CANON_FLEETS[k as keyof FleetStrength] });
  for (const [k, v] of Object.entries(p.strategic)) if (v !== CANON_STRATEGIC[k as keyof typeof CANON_STRATEGIC]) out.push({ path: `strategic.${k}`, v, canon: CANON_STRATEGIC[k as keyof typeof CANON_STRATEGIC] });
  return out;
}

/** Which side a changed knob favours ('reapers', 'organics', or 'neutral' for knobs that favour neither). */
function favours(path: string, v: unknown, canon: unknown): 'reapers' | 'organics' | 'neutral' {
  const up = typeof v === 'number' && typeof canon === 'number' ? v > canon : false;
  const [head, a, b] = path.split('.');
  if (head === 'organic') return up ? 'organics' : 'reapers';
  if (head === 'reaper') return up ? 'reapers' : 'organics';
  if (head === 'factionOverrides') {
    if (a === 'reaper') return up ? 'reapers' : 'organics';
    return up ? 'organics' : 'reapers';
  }
  if (head === 'fleetStrength') return a === 'reaper' ? (up ? 'reapers' : 'organics') : up ? 'organics' : 'reapers';
  if (head === 'special') {
    if (a === 'thanixAvailability') return v === 'none' ? 'reapers' : 'organics';
    if (a === 'driveAttacks' || a === 'reaperDoctrine') return 'organics';
    if (a === 'readinessScale') return 'neutral';
    return v === true ? 'organics' : 'reapers';
  }
  // strategic
  switch (a) {
    case 'alliedCoordination':
    case 'shepardEffectiveness':
      return up ? 'organics' : 'reapers';
    case 'reaperCompetence':
    case 'indoctrinationEffectiveness':
    case 'reaperReinforcements':
      return up ? 'reapers' : 'organics';
    case 'shepardAlive':
    case 'crucibleAvailable':
    case 'conventionalVictoryPossible':
    case 'homeworldIndependence':
      return v === true ? 'organics' : 'reapers';
    case 'cerberusStance':
      return v === 'cooperative' || v === 'controls_reapers' ? 'organics' : 'reapers';
    case 'illusiveManIndoctrinated':
    case 'harbingerOperational':
    case 'catalystOperational':
      return v === true ? 'reapers' : 'organics';
    default:
      return b === undefined ? 'neutral' : 'neutral';
  }
}

const run = (rung: number, seed: number, over: Partial<ThreatRun> = {}): ThreatRun => ({ rung, seed, reaperLoss: 0.5, organicSurvival: 0, winner: 'B', duration: 100, timeLimit: false, ...over });
const probe = (m: number, index: number, holdsRungs: number, wins = holdsRungs * 4): ThreatProbe => ({ m, index, reaperLoss: 0, organicSurvival: 0, holdsRungs, wins, battles: 20, timeLimit: 0 });

describe('alternate timelines: data', () => {
  it('are appended to PRESETS, in order, after the eight existing presets', () => {
    expect(PRESETS.slice(0, 8).map((p) => p.id)).toEqual(EXISTING);
    expect(PRESETS.slice(8)).toEqual(ALTERNATE_PRESETS);
    expect(ALTERNATE_PRESETS).toHaveLength(10);
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ALTERNATE_PRESETS) {
      expect(p.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(['custom', 'canon_me3']).not.toContain(p.id);
      expect(getPreset(p.id)).toEqual(p);
    }
    // Declared-tier order, then divergence year.
    const keys = ALTERNATE_PRESETS.map((p) => [ALTERNATE_META[p.id].declaredTier, ALTERNATE_META[p.id].divergence.year] as const);
    for (let i = 1; i < keys.length; i++) expect(keys[i][0] > keys[i - 1][0] || (keys[i][0] === keys[i - 1][0] && keys[i][1] >= keys[i - 1][1]), ALTERNATE_PRESETS[i].id).toBe(true);
  });

  it('are frozen all the way down, so nothing changes a built-in timeline in place', () => {
    const frozenThroughout = (o: unknown, path: string): void => {
      if (o === null || typeof o !== 'object') return;
      expect(Object.isFrozen(o), path).toBe(true);
      for (const [k, v] of Object.entries(o)) frozenThroughout(v, `${path}.${k}`);
    };
    for (const p of ALTERNATE_PRESETS) {
      frozenThroughout(p, p.id);
      expect(() => {
        (p.fleetStrength as { reaper: number }).reaper = 9;
      }, p.id).toThrow(TypeError);
      // Copies stay editable: the timelines editor and the levers work on them.
      const copy = getPreset(p.id);
      copy.fleetStrength.reaper = 2;
      expect(copy.fleetStrength.reaper).toBe(2);
      expect(withLever(p, ALTERNATE_META[p.id].lever.key, ALTERNATE_META[p.id].lever.min)).not.toBe(p);
    }
  });

  it('round-trip through the schema with no warnings and pass normaliseRules unchanged', () => {
    for (const p of ALTERNATE_PRESETS) {
      const res = validateRuleSet(JSON.parse(exportRuleSet(p)));
      expect(res.ok, p.id).toBe(true);
      expect(res.warnings, p.id).toEqual([]);
      expect(res.rules, p.id).toEqual(p);
      expect(normaliseRules(p), p.id).toEqual(p);
    }
  });

  it('are labelled ALTERNATE UNIVERSE and keep the project wording rules', () => {
    for (const p of ALTERNATE_PRESETS) {
      expect(p.category, p.id).toBe('au');
      expect(p.description.startsWith('ALTERNATE UNIVERSE. '), p.id).toBe(true);
      expect(p.historyChanges.length, p.id).toBeGreaterThanOrEqual(4);
      expect(p.tagline.length, p.id).toBeLessThanOrEqual(160);
      for (const h of p.historyChanges) expect(h.length, h).toBeLessThanOrEqual(300);
      for (const t of [...textsOf(p), ...metaTexts(p.id)]) wordingOk(t);
      // None of the ten uses the Apex signature.
      expect(p.special.hyperMassAccelerators || p.special.hadesRounds || p.special.valkyrieAvailable || p.special.superDreadnoughts, p.id).toBe(false);
    }
    expect(auPrefix('X')).toBe('ALTERNATE UNIVERSE (X): ');
    // Away from its own card and AU notes (pickers, headers, toasts, lists) every non-canon name carries a label; canon stays bare.
    for (const p of [...PRESETS, makeCustom()]) {
      expect(timelineTag(p), p.id).toBe(p.category === 'canon' ? '' : ` [${p.category.toUpperCase()}]`);
      expect(timelineTitle(p).startsWith(p.name), p.id).toBe(true);
      expect(timelineTitle(p).endsWith('ALTERNATE UNIVERSE)'), p.id).toBe(p.category !== 'canon');
      // A battle-history record knows the timeline only by id.
      expect(timelineTagById(p.id, [...PRESETS, makeCustom()]), p.id).toBe(timelineTag(p));
    }
    // A timeline deleted since the battle is still marked: a player-made id as custom, any other non-canon id as AU.
    expect(timelineTagById('canon_me3', [])).toBe('');
    expect(timelineTagById('custom_k3x9', [])).toBe(' [CUSTOM]');
    expect(timelineTagById('custom', [])).toBe(' [CUSTOM]');
    expect(timelineTagById('a_removed_preset', [])).toBe(' [AU]');
  });

  it('metadata: divergence inside established history, provenance, canon basis, a lever that is a knob of the preset', () => {
    expect(Object.keys(ALTERNATE_META).sort()).toEqual(ALTERNATE_PRESETS.map((p) => p.id).sort());
    for (const p of ALTERNATE_PRESETS) {
      const m = ALTERNATE_META[p.id];
      expect(m.divergence.year, p.id).toBeGreaterThanOrEqual(1800);
      expect(m.divergence.year, p.id).toBeLessThanOrEqual(2186);
      expect(m.divergence.event.length, p.id).toBeGreaterThan(20);
      expect(m.canonBasis.length, p.id).toBeGreaterThan(40);
      expect(m.provenance).toBe('AU_MODIFIED');
      const { key, min, max, step } = m.lever;
      expect(min, p.id).toBeLessThan(max);
      const current = getLever(p, key);
      expect(current, `${p.id} ${key}`).toBeGreaterThanOrEqual(min);
      expect(current, `${p.id} ${key}`).toBeLessThanOrEqual(max);
      if (step === 'count') expect(key.startsWith('fleetStrength.'), p.id).toBe(true);
      else {
        expect(key.startsWith('fleetStrength.'), p.id).toBe(false);
        expect([0.02, 0.05]).toContain(step);
      }
      expect(getLever(withLever(p, key, min), key)).toBe(min);
      expect(getLever(p, key), 'withLever must not mutate').toBe(current);
    }
  });

  it('world-state locks name real options with offered values and follow the stories', () => {
    const exposed = new Map<string, Set<string>>();
    for (const [k, vs] of Object.entries(CAMPAIGN_WORLD_STATE_CHOICES)) exposed.set(k, new Set(vs));
    for (const s of SCENARIOS) for (const o of s.worldState ?? []) for (const c of o.choices) exposed.set(o.id, (exposed.get(o.id) ?? new Set()).add(c.id));
    for (const p of ALTERNATE_PRESETS) {
      const locks = ALTERNATE_META[p.id].worldState ?? {};
      for (const [k, l] of Object.entries(locks)) {
        expect(exposed.has(k), `${p.id}: ${k}`).toBe(true);
        expect(exposed.get(k)!.has(l.value), `${p.id}: ${k}=${l.value}`).toBe(true);
        expect(l.why.length, `${p.id}: ${k}`).toBeGreaterThan(15);
      }
      if (!p.strategic.shepardAlive) expect(locks.normandy?.value, p.id).toBe('no');
    }
    expect(ALTERNATE_META.geth_quarian_concord.worldState?.rannoch.value).toBe('peace');
    expect(ALTERNATE_META.sovereigns_triumph.worldState?.ascension.value).toBe('absent');
    expect(ALTERNATE_META.collectors_harvest.worldState?.rannoch.value).toBe('war');
    // The campaign defaults are the setup screen's choices.
    for (const [k, v] of Object.entries(CAMPAIGN_WORLD_STATE_DEFAULTS)) expect(CAMPAIGN_WORLD_STATE_CHOICES[k]).toContain(v);
  });

  it('lockWorldState sets offered values only, applies hidden keys only when asked, and leaves other timelines alone', () => {
    const st = getPreset('sovereigns_triumph');
    const camp = lockWorldState(st, { ...CAMPAIGN_WORLD_STATE_DEFAULTS }, CAMPAIGN_WORLD_STATE_CHOICES, false);
    expect(camp.ws).toMatchObject({ ascension: 'absent', rannoch: 'war', genophage: 'sabotaged', rachni: 'saved', crucible: 'use' });
    expect(camp.ws.normandy).toBeUndefined();
    expect(Object.keys(camp.locked).sort()).toEqual(['ascension', 'genophage', 'rannoch']);
    expect(camp.hidden).toEqual({});
    // Battle of the Citadel offers ascension save/sovereign: the lock's value is not offered there, so it is not applied.
    const citadel = SCENARIOS.find((s) => s.id === 'battle_of_the_citadel')!;
    const b = lockWorldState(st, defaultWorldState(citadel), choicesOf(citadel));
    expect(b.ws.ascension).toBe(defaultWorldState(citadel).ascension);
    expect(b.locked.ascension).toBeUndefined();
    expect(b.hidden.normandy?.value).toBe('no');
    // Canon and the existing presets have no locks.
    for (const id of EXISTING) {
      const r = lockWorldState(getPreset(id), { ascension: 'present' }, CAMPAIGN_WORLD_STATE_CHOICES);
      expect(r.ws).toEqual({ ascension: 'present' });
      expect(r.locked).toEqual({});
    }
  });

  it('span every tier; tiers 1–2 change only knobs in the Reapers’ favour', () => {
    expect(new Set(Object.values(ALTERNATE_META).map((m) => m.declaredTier))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    for (const p of ALTERNATE_PRESETS) {
      const knobs = changedKnobs(p);
      expect(knobs.length, p.id).toBeGreaterThan(0);
      if (ALTERNATE_META[p.id].declaredTier > 2) continue;
      for (const k of knobs) expect(favours(k.path, k.v, k.canon), `${p.id} ${k.path}=${String(k.v)}`).not.toBe('organics');
    }
    // A divergence changes what the organics know, not what the Reapers are: only the Covenant's active interference sets the command vulnerability.
    expect(ALTERNATE_PRESETS.filter((p) => p.special.reaperCommandVulnerability).map((p) => p.id)).toEqual(['leviathans_covenant']);
  });
});

describe('alternate timelines: codex', () => {
  it('has one Timelines entry per new timeline, every alternate line AU-prefixed and every line clean', () => {
    expect(CODEX_CATEGORIES.indexOf('Timelines')).toBe(CODEX_CATEGORIES.indexOf('Reaper War') + 1);
    for (const p of ALTERNATE_PRESETS) {
      const entries = CODEX.filter((e) => e.id === `timeline_${p.id}`);
      expect(entries, p.id).toHaveLength(1);
      const e = entries[0];
      expect(e.category).toBe('Timelines');
      expect(e.title).toBe(`${p.name} (AU)`);
      expect(e.canon).toEqual([ALTERNATE_META[p.id].canonBasis]);
      expect(e.alternate!.length).toBeGreaterThanOrEqual(p.historyChanges.length + 3);
      for (const line of e.alternate!) expect(line.startsWith(auPrefix(p.name)), line).toBe(true);
      for (const line of [...e.canon, ...(e.estimate ?? []), ...e.alternate!]) wordingOk(line);
      expect(e.alternate!.some((l) => l.includes(`${REAPER_THREAT[p.id].index.toFixed(1)}`)), p.id).toBe(true);
    }
  });

  it('explains the scale, with every alternate-universe preset line AU-prefixed', () => {
    const scale = CODEX.find((e) => e.id === 'threat_scale')!;
    expect(scale.category).toBe('Timelines');
    expect(scale.canon).toEqual([]);
    const lines = scale.estimate ?? [];
    for (const line of lines) wordingOk(line);
    for (const p of PRESETS) {
      const mine = lines.filter((l) => l.startsWith(auPrefix(p.name)) || l.startsWith(`${p.name}: `));
      expect(mine, p.id).toHaveLength(1);
      expect(mine[0].startsWith(p.category === 'au' ? auPrefix(p.name) : `${p.name}: `), p.id).toBe(true);
    }
    for (const t of THREAT_TIERS) expect(lines.some((l) => l.includes(t.summary))).toBe(true);
    expect(lines.join(' ')).toContain('measured, not asserted');
  });
});

describe('threat scale: arithmetic', () => {
  it('thresholds, tiers and the index', () => {
    expect(THREAT_THRESHOLDS).toHaveLength(5);
    for (const t of THREAT_THRESHOLDS) {
      expect(Number.isInteger(t), String(t)).toBe(true);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(100);
    }
    for (let i = 1; i < THREAT_THRESHOLDS.length; i++) expect(THREAT_THRESHOLDS[i]).toBeGreaterThan(THREAT_THRESHOLDS[i - 1]);
    expect(THREAT_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(THREAT_TIERS.map((t) => t.min)).toEqual([0, ...THREAT_THRESHOLDS]);
    expect(THREAT_TIERS.map((t) => t.max)).toEqual([...THREAT_THRESHOLDS, 100]);
    for (const t of THREAT_TIERS) {
      expect(t.summary.length).toBeGreaterThan(40);
      expect(t.summary, 'a tier sentence never names a rung').not.toMatch(/Raid|Strike group|Battlegroup|Assault fleet|Harvest fleet|capital/);
    }
    expect(tierForIndex(0)).toBe(1);
    expect(tierForIndex(100)).toBe(6);
    THREAT_THRESHOLDS.forEach((t, i) => {
      expect(tierForIndex(t - 0.01), String(t - 0.01)).toBe(i + 1);
      expect(tierForIndex(t), String(t)).toBe(i + 2);
    });
    // An explicit threshold set (the script rates a re-based run before it is committed).
    expect([0, 16.99, 17, 29.99, 30, 47.99, 48, 61.99, 62, 86.99, 87, 100].map((x) => tierForIndex(x, [17, 30, 48, 62, 87]))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(threatIndex(0, 0)).toBe(0);
    expect(threatIndex(1, 1)).toBe(100);
    expect(threatIndex(0.5, 0.2)).toBeCloseTo(35, 10);
    expect(threatIndex(1.4, -0.2)).toBe(50);
  });

  it('every band statement holds for every Reaper loss and organic survival its band admits', () => {
    // The statements are claims about L and S alone (index = 50 × (L + S)); check them on a 0.005 grid,
    // for the committed thresholds and for the formula-1 ones, so the renderer is checked away from today's values too.
    const eps = 1e-9;
    for (const th of [THREAT_THRESHOLDS, [17, 30, 48, 62, 87]]) {
      const tiers = threatTiers(th);
      const seen = new Set<number>();
      for (let i = 0; i <= 200; i++) {
        for (let j = 0; j <= 200; j++) {
          const L = i / 200;
          const S = j / 200;
          const tier = tierForIndex(threatIndex(L, S), th);
          seen.add(tier);
          const c = bandClaims(tiers[tier - 1].min, tiers[tier - 1].max);
          const at = `tier ${tier} at L ${L}, S ${S} (${th.join('/')})`;
          if (c.sumAtLeast !== undefined) expect(L + S >= c.sumAtLeast - eps, at).toBe(true);
          if (c.sumUnder !== undefined) expect(L + S < c.sumUnder + eps, at).toBe(true);
          if (c.bothAtLeast !== undefined) expect(Math.min(L, S) >= c.bothAtLeast - eps, at).toBe(true);
          if (c.largerAtLeast !== undefined) expect(Math.max(L, S) >= c.largerAtLeast - eps, at).toBe(true);
          if (c.bothUnder !== undefined) expect(Math.max(L, S) < c.bothUnder + eps, at).toBe(true);
          if (c.smallerUnder !== undefined) expect(Math.min(L, S) < c.smallerUnder + eps, at).toBe(true);
        }
      }
      expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
      // Every sentence states its bounds, and only the bounds that say something.
      for (const t of tiers) {
        const c = bandClaims(t.min, t.max);
        expect(t.summary).toBe(bandStatement(t.min, t.max));
        for (const x of [c.bothAtLeast, c.largerAtLeast, c.bothUnder, c.smallerUnder]) if (x !== undefined) expect(t.summary, t.summary).toContain(`${Math.round(x * 1000) / 10} %`);
        if (t.min === 0) expect(c.largerAtLeast).toBeUndefined();
        if (t.max === 100) expect(c.smallerUnder).toBeUndefined();
      }
    }
    // The formula-1 bands read as they did, with the exact bounds.
    const old = threatTiers([17, 30, 48, 62, 87]).map((t) => t.summary);
    expect(old[0]).toMatch(/less than 0\.34.*less than 34 %.*less than 34 %/);
    expect(old[2]).toMatch(/0\.60 to 0\.96.*reaches 30 %.*under 48 %/);
    expect(old[4]).toMatch(/1\.24 to 1\.74.*at least 24 %.*at least 24 %.*reaches 62 %/);
    expect(old[5]).toMatch(/at least 1\.74.*at least 74 %.*at least 74 %/);
  });

  it('summariseThreat weighs every battle equally, rounds as the table stores, and stops the breaking point at the first rung won fewer than 3 of 4', () => {
    const groups = [
      { name: 'Raid', capitals: 3, destroyers: 7 },
      { name: 'Strike group', capitals: 4, destroyers: 9 },
      { name: 'Battlegroup', capitals: 5, destroyers: 13 },
    ];
    const runs: ThreatRun[] = [];
    for (const seed of [1, 2, 3, 4]) runs.push(run(0, seed, { reaperLoss: 1, organicSurvival: 0.8, winner: 'A' }));
    for (const seed of [1, 2, 3, 4]) runs.push(run(1, seed, seed === 4 ? { reaperLoss: 0.6, winner: 'B', timeLimit: true } : { reaperLoss: 1, organicSurvival: 0.5, winner: 'A' }));
    for (const seed of [1, 2, 3, 4]) runs.push(run(2, seed, seed <= 2 ? { reaperLoss: 1, organicSurvival: 0.3, winner: 'A' } : { reaperLoss: 0.25 }));
    const m = summariseThreat(runs, groups);
    expect(m.rungs.map((g) => g.wins)).toEqual([4, 3, 2]);
    expect(m.holdsRungs).toBe(2);
    expect(m.holdsUpTo).toBe(4); // the deployed Strike group, not the base one
    expect(m.rungs[0].index).toBe(90);
    expect(m.rungs[1].timeLimit).toBe(1);
    expect(m.timeLimitShare).toBe(0.083);
    const L = (4 * 1 + 3 * 1 + 0.6 + 2 * 1 + 2 * 0.25) / 12;
    const S = (4 * 0.8 + 3 * 0.5 + 2 * 0.3) / 12;
    expect(m.reaperLoss).toBe(Math.round(L * 1000) / 1000);
    expect(m.organicSurvival).toBe(Math.round(S * 1000) / 1000);
    expect(m.index).toBe(Math.round(threatIndex(L, S) * 10) / 10);
    expect(m.rungs[0]).toMatchObject({ name: 'Raid', capitals: 3, destroyers: 7, battles: 4 });
    // A first rung lost breaks the chain at once.
    const none = summariseThreat([run(0, 1), run(0, 2), run(0, 3, { winner: 'A' }), run(0, 4, { winner: 'A' })], groups.slice(0, 1));
    expect(none.holdsRungs).toBe(0);
    expect(none.holdsUpTo).toBe(0);
  });

  it('the breaking-point sentence names the deployed group', () => {
    const r = (k: number) => ({ holdsRungs: k, rungs: THREAT_RUNGS.map((g, i) => ({ name: g.name, capitals: i === 0 ? 1 : g.capitals, destroyers: g.destroyers, index: 0, reaperLoss: 0, organicSurvival: 0, wins: 0, battles: 4, timeLimit: 0 })) });
    expect(threatHoldsText(r(0))).toBe('Holds none of the reference Reaper groups.');
    expect(threatHoldsText(r(1))).toBe('Holds the Raid (1 capital, 5 destroyers in this timeline) and no larger reference group.');
    expect(threatHoldsText(r(3))).toBe('Holds every reference Reaper group up to the Battlegroup (4 capitals, 10 destroyers in this timeline) and none above it.');
    expect(threatHoldsText(r(5))).toBe('Holds all 5 reference Reaper groups, up to the Harvest fleet (6 capitals, 14 destroyers in this timeline).');
  });

  it('custom and unknown timelines are unrated', () => {
    expect(threatRating(makeCustom())).toBeUndefined();
    expect(threatRating({ id: 'custom_abc123', category: 'custom' })).toBeUndefined();
    expect(threatRating({ id: 'no_such_timeline', category: 'au' })).toBeUndefined();
    expect(threatRating({ id: 'canon_me3', category: 'custom' })).toBeUndefined();
    expect(threatTooltip(undefined)).toMatch(/unrated/);
    expect(threatTooltip(undefined)).toMatch(/not measured/);
  });
});

describe('threat scale: the probe ladder', () => {
  it('a probe is canon with the organic fire rate, heat capacity and hull integrity × m, and nothing else', () => {
    const canon = getPreset('canon_me3');
    for (const m of [0.5, 1, 2.45]) {
      const r = threatProbeRules(m);
      expect(r.id).not.toBe(canon.id);
      for (const k of TECH_KEYS) expect(r.organic[k], k).toBe((THREAT_PROBE_KEYS as readonly string[]).includes(k) ? m : canon.organic[k]);
      expect({ ...r, id: canon.id, name: canon.name, organic: canon.organic }).toEqual(canon);
    }
    expect(canon.factionOverrides).toEqual({});
    expect(THREAT_PROBE_GRID).toContain(1);
  });

  it('derives each threshold as the rounded midpoint between the probes either side of its rule', () => {
    // wins nothing / wins something / holds 1 / 2 / 3 / 4 / 5
    const probes = [probe(0.4, 12, 0, 0), probe(0.5, 20.4, 0, 2), probe(0.6, 27, 1), probe(0.7, 33, 1), probe(0.8, 41, 2), probe(1, 52, 3), probe(1.2, 70, 4), probe(1.5, 90, 5)];
    const d = thresholdsFromProbes(probes);
    expect(d.problems).toEqual([]);
    expect(d.splits.map((x) => x.tier)).toEqual([2, 3, 4, 5, 6]);
    expect(d.thresholds).toEqual([Math.round((12 + 20.4) / 2), Math.round((20.4 + 27) / 2), Math.round((33 + 41) / 2), Math.round((41 + 52) / 2), Math.round((70 + 90) / 2)]);
    expect(d.splits[0]).toMatchObject({ below: { m: 0.4, index: 12 }, above: { m: 0.5, index: 20.4 } });
    expect(d.holdCounts).toEqual([0, 1, 2, 3, 4, 5]);
    // A probe out of order (noise) counts on its side of the rule: the highest index below and the lowest above.
    const noisy = thresholdsFromProbes([...probes, probe(0.75, 43, 1)]);
    expect(noisy.splits[2]).toMatchObject({ below: { m: 0.75, index: 43 }, above: { m: 0.8, index: 41 }, threshold: 42 });
    // A rule with probes on one side only leaves the scale undefined.
    const short = thresholdsFromProbes(probes.filter((p) => p.holdsRungs < 5));
    expect(short.thresholds).toBeUndefined();
    expect(short.problems.join(' ')).toMatch(/tier-6/);
    // Thresholds that do not increase leave it undefined too.
    const flat = thresholdsFromProbes([probe(0.4, 30, 0, 0), probe(0.5, 32, 1), probe(0.8, 40, 2), probe(1, 50, 3), probe(1.5, 90, 5)]);
    expect(flat.splits.map((x) => x.threshold)).toEqual([31, 31, 36, 45, 70]);
    expect(flat.thresholds).toBeUndefined();
    expect(flat.problems.join(' ')).toMatch(/tier-3 threshold 31/);
    expect(THREAT_SPLIT_RULES.map((r) => r.meets({ holdsRungs: 0, wins: 1 }))).toEqual([true, false, false, false, false]);
    expect(THREAT_SPLIT_RULES.map((r) => r.meets({ holdsRungs: 4, wins: 16 }))).toEqual([true, true, true, true, false]);
  });

  it('refines deterministically until every transition is pinned, and extends past an unspanned end', () => {
    expect(nextProbeValues([])).toEqual([...THREAT_PROBE_GRID]);
    // A wide bracket with a large index gap is bisected (geometric midpoint, 3 decimals).
    const a = [probe(0.5, 10, 0, 0), probe(0.8, 30, 0, 3), probe(1, 50, 2), probe(2, 95, 5)];
    const next = nextProbeValues(a);
    expect(next).toEqual([...next].sort((x, y) => x - y));
    expect(next).toContain(Math.round(Math.sqrt(0.5 * 0.8) * 1000) / 1000);
    expect(next).toContain(Math.round(Math.sqrt(0.8 * 1) * 1000) / 1000);
    expect(next).toContain(Math.round(Math.sqrt(1 * 2) * 1000) / 1000);
    expect(nextProbeValues(a)).toEqual(next);
    // Closed brackets need nothing more: within the ratio, or within the index gap when no count is skipped.
    const closed = [
      probe(0.5, 10, 0, 0),
      probe(0.51, 17, 0, 1), // wins: closed by the ratio (gap 7)
      probe(0.99, 49, 0, 3),
      probe(1, 50, 1), // holds 1: ratio
      probe(1.02, 52, 2), // holds 2: ratio
      probe(1.58, 79, 2),
      probe(1.6, 80, 3), // holds 3: ratio
      probe(1.62, 81, 4), // holds 4: ratio
      probe(2, 94, 4),
      probe(2.3, 94 + THREAT_PROBE_GAP - 0.5, 5), // holds 5: closed by the index gap (×1.15 apart)
    ];
    expect(nextProbeValues(closed)).toEqual([]);
    // A bracket that skips a count of groups held is bisected whatever its index gap.
    const skip = [probe(0.5, 10, 0, 0), probe(0.6, 12, 0, 1), probe(1, 50, 1), probe(1.2, 51, 3), probe(2, 95, 5), probe(2.04, 95.5, 4)];
    expect(nextProbeValues(skip)).toContain(Math.round(Math.sqrt(1.2) * 1000) / 1000);
    // Nothing below the first win, or nothing that holds all five: the ladder extends by ×1.25.
    expect(nextProbeValues([probe(0.5, 20, 0, 1), probe(1, 50, 2), probe(2, 95, 5)])).toContain(0.4);
    expect(nextProbeValues([probe(0.4, 10, 0, 0), probe(1, 50, 2), probe(2, 80, 4)])).toContain(2.5);
  });

  it('re-bases only on the stated triggers', () => {
    const committed = { formulaVersion: THREAT_FORMULA_VERSION, standoffKm: THREAT_STANDOFF, maxDuration: THREAT_MAX_DURATION, thresholds: [20, 30, 45, 60, 85], probes: [probe(1, 40, 1)] };
    const now = { formulaVersion: THREAT_FORMULA_VERSION, standoffKm: THREAT_STANDOFF, maxDuration: THREAT_MAX_DURATION };
    expect(rebaseReasons(committed, { ...now, thresholds: [20 + THREAT_REBASE_DRIFT, 30 - THREAT_REBASE_DRIFT, 45, 60, 85] })).toEqual([]);
    expect(rebaseReasons(committed, { ...now, thresholds: [20, 30, 45 + THREAT_REBASE_DRIFT + 1, 60, 85] })).toHaveLength(1);
    expect(rebaseReasons({ ...committed, probes: [] }, { ...now, thresholds: committed.thresholds })).toHaveLength(1);
    expect(rebaseReasons({ ...committed, formulaVersion: THREAT_FORMULA_VERSION - 1 }, now)).toHaveLength(1);
    expect(rebaseReasons({ ...committed, standoffKm: THREAT_STANDOFF + 1 }, now)).toHaveLength(1);
    expect(rebaseReasons({ ...committed, maxDuration: THREAT_MAX_DURATION + 1 }, now)).toHaveLength(1);
  });
});

describe('threat scale: the generated table', () => {
  it('covers every preset, in PRESETS order, with consistent values and the deployed groups', () => {
    expect(Object.keys(REAPER_THREAT)).toEqual(PRESETS.map((p) => p.id));
    for (const p of PRESETS) {
      const m = REAPER_THREAT[p.id];
      expect(m.index, p.id).toBeGreaterThanOrEqual(0);
      expect(m.index, p.id).toBeLessThanOrEqual(100);
      for (const x of [m.reaperLoss, m.organicSurvival, m.timeLimitShare]) {
        expect(x, p.id).toBeGreaterThanOrEqual(0);
        expect(x, p.id).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(threatIndex(m.reaperLoss, m.organicSurvival) - m.index), p.id).toBeLessThanOrEqual(0.15);
      expect(m.rungs, p.id).toHaveLength(5);
      const groups = threatRungGroups(getPreset(p.id));
      m.rungs.forEach((g, k) => {
        expect(g.battles, `${p.id} rung ${k}`).toBe(THREAT_SEEDS.length);
        expect(g.wins).toBeLessThanOrEqual(g.battles);
        expect({ name: g.name, capitals: g.capitals, destroyers: g.destroyers }, `${p.id} rung ${k}`).toEqual(groups[k]);
      });
      expect(m.holdsUpTo, p.id).toBe(m.holdsRungs > 0 ? m.rungs[m.holdsRungs - 1].capitals : 0);
      const r = threatRating(p)!;
      expect(r.tier).toBe(tierForIndex(m.index));
      expect(threatTooltip(r)).toContain(`${r.tier}/6`);
      expect(threatTooltip(r)).toContain('Measured in conventional battle');
    }
  });

  it('describes the reference it was measured on, within the time-limit bound', () => {
    expect([...THREAT_REFERENCE_META.seeds]).toEqual([...THREAT_SEEDS]);
    expect(THREAT_REFERENCE_META.rungs.map((g) => ({ ...g }))).toEqual(THREAT_RUNGS.map((g) => ({ ...g })));
    expect(THREAT_REFERENCE_META.standoffKm).toBe(THREAT_STANDOFF);
    expect(THREAT_REFERENCE_META.maxDuration).toBe(THREAT_MAX_DURATION);
    expect(THREAT_REFERENCE_META.battles).toBe(PRESETS.length * THREAT_RUNGS.length * THREAT_SEEDS.length);
    expect(THREAT_REFERENCE_META.timeLimitShare).toBeLessThanOrEqual(THREAT_TIME_LIMIT_BOUND);
    expect(THREAT_REFERENCE_META.measuredOn).not.toMatch(/unmeasured|partial/);
    expect(THREAT_REFERENCE_META.formulaVersion).toBe(THREAT_FORMULA_VERSION);
  });

  it('its thresholds are the ones the recorded probe ladder derives, on this reference and formula', () => {
    expect([...THREAT_THRESHOLDS]).toEqual([...THREAT_SCALE.thresholds]);
    expect(THREAT_SCALE.formulaVersion, 'formula version changed: re-base with npm run timeline:threat (TIMELINES_V2.md §1.8)').toBe(THREAT_FORMULA_VERSION);
    expect(THREAT_SCALE.standoffKm, 'standoff changed: re-base (§1.8)').toBe(THREAT_STANDOFF);
    expect(THREAT_SCALE.maxDuration, 'time limit changed: re-base (§1.8)').toBe(THREAT_MAX_DURATION);
    expect(THREAT_SCALE.rebasedOn).not.toMatch(/partial|design-time/);
    expect(THREAT_SCALE.probes.length).toBeGreaterThanOrEqual(THREAT_PROBE_GRID.length);
    const ms = THREAT_SCALE.probes.map((p) => p.m);
    expect(ms).toEqual([...ms].sort((a, b) => a - b));
    for (const m of THREAT_PROBE_GRID) expect(ms).toContain(m);
    for (const p of THREAT_SCALE.probes) {
      expect(p.battles, `×${p.m}`).toBe(THREAT_RUNGS.length * THREAT_SEEDS.length);
      expect(p.wins).toBeLessThanOrEqual(p.battles);
      expect(Math.abs(threatIndex(p.reaperLoss, p.organicSurvival) - p.index), `×${p.m}`).toBeLessThanOrEqual(0.15);
    }
    const d = thresholdsFromProbes(THREAT_SCALE.probes);
    expect(d.problems).toEqual([]);
    expect(d.thresholds).toEqual([...THREAT_THRESHOLDS]);
    // The recorded ladder is complete: no bracket would get another probe.
    expect(nextProbeValues(THREAT_SCALE.probes)).toEqual([]);
  });

  it('was measured from the current catalogue and presets (fingerprint)', () => {
    const now = threatFingerprint(PRESETS);
    const how = `the threat table is out of date (measured on ${THREAT_REFERENCE_META.measuredOn}): regenerate it with npm run timeline:threat and commit src/timelines/threatMeasured.ts and docs/apex/TIMELINE_THREAT.md (TIMELINES_V2.md §4.14)`;
    expect(now.catalogue, `the battle-relevant catalogue changed; ${how}`).toBe(THREAT_FINGERPRINT.catalogue);
    expect(Object.keys(THREAT_FINGERPRINT.presets)).toEqual(PRESETS.map((p) => p.id));
    for (const p of PRESETS) expect(now.presets[p.id], `${p.id} or the reference fleets it builds changed; ${how}`).toBe(THREAT_FINGERPRINT.presets[p.id]);
  });

  it('every new timeline measures in its declared tier', () => {
    for (const p of ALTERNATE_PRESETS) expect(tierForIndex(REAPER_THREAT[p.id].index), `${p.id} (index ${REAPER_THREAT[p.id].index})`).toBe(ALTERNATE_META[p.id].declaredTier);
  });

  it('every new timeline’s lever was measured at both ends of its documented range', () => {
    expect(Object.keys(THREAT_LEVERS)).toEqual(ALTERNATE_PRESETS.map((p) => p.id));
    for (const p of ALTERNATE_PRESETS) {
      const l = THREAT_LEVERS[p.id];
      const meta = ALTERNATE_META[p.id].lever;
      expect(l.key, p.id).toBe(meta.key);
      expect(l.current, p.id).toBe(getLever(p, meta.key));
      expect(l.min.value, p.id).toBe(meta.min);
      expect(l.max.value, p.id).toBe(meta.max);
      for (const e of [l.min, l.max]) {
        expect(e.index, p.id).toBeGreaterThanOrEqual(0);
        expect(e.index, p.id).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('the threat reference engagement', () => {
  it('derives its geometry and clock from the catalogue', () => {
    expect(THREAT_LONGEST_RANGE).toBe(Math.max(...WEAPON_LIST.map((w) => w.range)));
    expect(THREAT_STANDOFF).toBeCloseTo(1.07 * THREAT_LONGEST_RANGE, 1);
    expect(THREAT_MAX_DURATION).toBe(Math.round((3.2 * THREAT_STANDOFF) / SHIP_CLASSES.reaper_capital.maxSpeed.value));
    const cfg = buildThreatReference(getPreset('canon_me3'), 0, 1);
    expect(cfg.maxDuration).toBe(THREAT_MAX_DURATION);
    expect(cfg.environment).toBe('deep_space');
    const reapers = cfg.fleets.find((f) => f.side === 'B')!;
    expect(reapers.position.z).toBeCloseTo(THREAT_STANDOFF / 2, 6);
    for (const f of cfg.fleets.filter((x) => x.side === 'A' && x.faction !== 'cerberus')) expect(f.position.z).toBeCloseTo(-THREAT_STANDOFF / 2, 6);
  });

  it('builds for every preset and rung, scales with the rules, and fields only what the story allows', () => {
    for (const p of PRESETS) {
      const groups = threatRungGroups(p);
      for (let rung = 0; rung < THREAT_RUNGS.length; rung++) {
        const cfg = buildThreatReference(p, rung, 1);
        const classes = cfg.fleets.flatMap((f) => f.ships.map((s) => s.classId));
        expect(classes, p.id).not.toContain('harbinger');
        expect(classes, p.id).not.toContain('destiny_ascension');
        const b = cfg.fleets.filter((f) => f.side === 'B');
        expect(b).toHaveLength(1);
        expect(b[0].ships.find((s) => s.classId === 'reaper_capital')?.count).toBe(groups[rung].capitals);
        // A contingent appears only when its faction is present (fleetStrength > 0); Cerberus only when allied.
        for (const c of THREAT_COALITION) {
          const present = cfg.fleets.some((f) => f.id === c.id);
          const allied = p.strategic.cerberusStance === 'cooperative' || p.strategic.cerberusStance === 'controls_reapers';
          expect(present, `${p.id} ${c.id}`).toBe(p.fleetStrength[c.faction] > 0 && (c.faction !== 'cerberus' || allied));
        }
        expect(classes.includes('normandy_sr2'), p.id).toBe(p.strategic.shepardAlive);
      }
    }
    expect(threatRungGroups(getPreset('sovereigns_triumph'))[0].capitals).toBe(3);
    expect(threatRungGroups(getPreset('conduit_protocol'))[0].capitals).toBe(1);
    const st = buildThreatReference(getPreset('sovereigns_triumph'), 0, 1);
    expect(st.fleets.some((f) => f.faction === 'geth')).toBe(false);
    const ch = buildThreatReference(getPreset('collectors_harvest'), 0, 1);
    expect(ch.fleets.some((f) => f.faction === 'geth' || f.faction === 'quarian')).toBe(false);
    expect(buildThreatReference(getPreset('canon_me3'), 0, 1).fleets.some((f) => f.faction === 'cerberus')).toBe(false);
    expect(buildThreatReference(getPreset('cerberus_reformed'), 0, 1).fleets.some((f) => f.faction === 'cerberus')).toBe(true);
  });

  it('orders the lowest-declared new timeline, canon and the highest-declared one on the Battlegroup', async () => {
    const byTier = [...ALTERNATE_PRESETS].sort((a, b) => ALTERNATE_META[a.id].declaredTier - ALTERNATE_META[b.id].declaredTier);
    const indexOf = async (rules: RuleSet): Promise<number> => {
      const runs: ThreatRun[] = [];
      for (const seed of [1, 2]) {
        const sim = new BattleSimulation(buildThreatReference(rules, 2, seed));
        await runSimAsync(sim);
        runs.push(threatRunOf(sim, 2, seed));
        await yieldToLoop();
      }
      const L = runs.reduce((a, r) => a + r.reaperLoss, 0) / runs.length;
      const S = runs.reduce((a, r) => a + r.organicSurvival, 0) / runs.length;
      return threatIndex(L, S);
    };
    const lo = await indexOf(byTier[0]);
    const canon = await indexOf(getPreset('canon_me3'));
    const hi = await indexOf(byTier[byTier.length - 1]);
    expect(lo).toBeLessThan(canon);
    expect(canon).toBeLessThan(hi);
  }, 120_000);
});

describe('alternate timelines in play', () => {
  it('every scenario builds and runs under every new timeline with its world-state locks', async () => {
    for (const p of ALTERNATE_PRESETS) {
      for (const s of SCENARIOS.filter((x) => x.id !== 'custom')) {
        const { ws } = lockWorldState(p, defaultWorldState(s), choicesOf(s));
        const cfg = s.build(getPreset(p.id), 1, ws);
        const sim = new BattleSimulation(cfg);
        for (let i = 0; i < 40; i++) sim.step();
        expect(sim.ships.length, `${p.id} ${s.id}`).toBeGreaterThan(0);
        const classes = cfg.fleets.flatMap((f) => f.ships.filter((x) => x.count > 0).map((x) => x.classId));
        // Prime/Apex Sol Defence fields its Normandy unconditionally (a known limitation, AU_RULES.md).
        if (!p.strategic.shepardAlive && s.id !== 'prime_apex_sol_defence') expect(classes, `${p.id} ${s.id}`).not.toContain('normandy_sr2');
        if (p.id === 'sovereigns_triumph' && (s.id === 'fall_of_thessia' || s.id === 'final_battle_of_earth')) expect(classes, s.id).not.toContain('destiny_ascension');
      }
      await yieldToLoop();
    }
  }, 120_000);

  it('a campaign starts and runs a few turns under every new timeline with its locked world state', async () => {
    for (const p of ALTERNATE_PRESETS) {
      const { ws } = lockWorldState(p, { ...CAMPAIGN_WORLD_STATE_DEFAULTS }, CAMPAIGN_WORLD_STATE_CHOICES, false);
      const st = createCampaign({ seed: 5, rules: getPreset(p.id), worldState: ws });
      const allied = st.fleets.filter((f) => f.allegiance === 'allied');
      if (p.id === 'geth_quarian_concord') {
        expect(allied.some((f) => f.faction === 'quarian')).toBe(true);
        expect(allied.some((f) => f.faction === 'geth')).toBe(true);
      }
      if (p.id === 'sovereigns_triumph') expect(st.fleets.some((f) => (f.counts.destiny_ascension ?? 0) > 0)).toBe(false);
      if (p.id === 'collectors_harvest') expect(allied.some((f) => f.faction === 'quarian' || f.faction === 'geth')).toBe(false);
      for (let i = 0; i < 3; i++) {
        advanceTick(st, { interactive: false });
        await yieldToLoop();
      }
      expect(st.tick, p.id).toBe(3);
      for (const id of ORGANIC) expect(st.factions[id], `${p.id} ${id}`).toBeDefined();
    }
  }, 120_000);
});

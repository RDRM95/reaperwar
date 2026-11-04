import { describe, expect, it } from 'vitest';
import { advanceTick, createCampaign } from '@/campaign/engine';
import { CODEX, CODEX_CATEGORIES } from '@/codex/entries';
import { forbiddenWording } from '@/core/lint';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPON_LIST } from '@/data/weapons';
import { SCENARIOS, defaultWorldState, type ScenarioDef } from '@/scenarios';
import { THREAT_COALITION, THREAT_LONGEST_RANGE, THREAT_MAX_DURATION, THREAT_SEEDS, THREAT_STANDOFF, buildThreatReference, threatRungGroups, threatRunOf } from '@/scenarios/threatReference';
import { BattleSimulation } from '@/simulation/battle';
import { ALTERNATE_META, ALTERNATE_PRESETS, CAMPAIGN_WORLD_STATE_CHOICES, CAMPAIGN_WORLD_STATE_DEFAULTS, auPrefix, getLever, lockWorldState, withLever } from '@/timelines/alternates';
import { PRESETS, getPreset, makeCustom } from '@/timelines/presets';
import { CANON_FLEETS, CANON_SPECIAL, CANON_STRATEGIC, CANON_TECH, TECH_KEYS, type FleetStrength, type RuleSet } from '@/timelines/rules';
import { exportRuleSet, normaliseRules, validateRuleSet } from '@/timelines/schema';
import {
  REAPER_THREAT,
  THREAT_LEVERS,
  THREAT_REFERENCE_META,
  THREAT_RUNGS,
  THREAT_THRESHOLDS,
  THREAT_TIERS,
  THREAT_TIME_LIMIT_BOUND,
  summariseThreat,
  threatHoldsText,
  threatIndex,
  threatRating,
  threatTooltip,
  tierForIndex,
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
      expect(e.title).toBe(p.name);
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
    expect([...THREAT_THRESHOLDS]).toEqual([17, 30, 48, 62, 87]);
    for (let i = 1; i < THREAT_THRESHOLDS.length; i++) expect(THREAT_THRESHOLDS[i]).toBeGreaterThan(THREAT_THRESHOLDS[i - 1]);
    expect(THREAT_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(THREAT_TIERS.slice(1).map((t) => t.min)).toEqual([...THREAT_THRESHOLDS]);
    for (const t of THREAT_TIERS) {
      expect(t.summary.length).toBeGreaterThan(40);
      expect(t.summary, 'a tier sentence never names a rung').not.toMatch(/Raid|Strike group|Battlegroup|Assault fleet|Harvest fleet|capital/);
    }
    const cases: [number, number][] = [[0, 1], [16.99, 1], [17, 2], [29.99, 2], [30, 3], [47.99, 3], [48, 4], [61.99, 4], [62, 5], [86.99, 5], [87, 6], [100, 6]];
    for (const [i, t] of cases) expect(tierForIndex(i), String(i)).toBe(t);
    expect(threatIndex(0, 0)).toBe(0);
    expect(threatIndex(1, 1)).toBe(100);
    expect(threatIndex(0.5, 0.2)).toBeCloseTo(35, 10);
    expect(threatIndex(1.4, -0.2)).toBe(50);
  });

  it('every band statement holds for every Reaper loss and organic survival its band admits', () => {
    // The statements are claims about L and S alone (index = 50 × (L + S)); check them on a 0.005 grid.
    const eps = 1e-9;
    const claims: Record<number, (L: number, S: number) => boolean> = {
      1: (L, S) => L + S < 0.34 + eps && Math.max(L, S) < 0.34 + eps,
      2: (L, S) => L + S >= 0.34 - eps && L + S < 0.6 + eps && Math.max(L, S) < 0.6 + eps,
      3: (L, S) => L + S >= 0.6 - eps && L + S < 0.96 + eps && Math.max(L, S) >= 0.3 - eps && Math.min(L, S) < 0.5 + eps,
      4: (L, S) => L + S >= 0.96 - eps && L + S < 1.24 + eps && Math.max(L, S) >= 0.48 - eps && Math.min(L, S) < 0.62 + eps,
      5: (L, S) => L + S >= 1.24 - eps && L + S < 1.74 + eps && Math.min(L, S) >= 0.24 - eps && Math.max(L, S) >= 0.62 - eps,
      6: (L, S) => L + S >= 1.74 - eps && Math.min(L, S) >= 0.74 - eps,
    };
    const seen = new Set<number>();
    for (let i = 0; i <= 200; i++) {
      for (let j = 0; j <= 200; j++) {
        const L = i / 200;
        const S = j / 200;
        const tier = tierForIndex(threatIndex(L, S));
        seen.add(tier);
        expect(claims[tier](L, S), `tier ${tier} at L ${L}, S ${S}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // The sentences state exactly those bounds.
    expect(THREAT_TIERS[0].summary).toMatch(/under 0\.34 together.*less than 34 %.*less than 34 %/);
    expect(THREAT_TIERS[1].summary).toMatch(/0\.34 to 0\.60 together.*less than 60 %.*less than 60 %/);
    expect(THREAT_TIERS[2].summary).toMatch(/0\.60 to 0\.96 together.*reaches 30 %.*at most one reaches half/);
    expect(THREAT_TIERS[3].summary).toMatch(/0\.96 to 1\.24 together.*reaches 48 %.*under 62 %/);
    expect(THREAT_TIERS[4].summary).toMatch(/1\.24 to 1\.74 together.*at least 24 %.*at least 24 %.*reaches 62 %/);
    expect(THREAT_TIERS[5].summary).toMatch(/at least 1\.74 together.*at least 74 %.*at least 74 %/);
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

import { v3 } from '@/core/vec3';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPON_LIST } from '@/data/weapons';
import type { FactionId } from '@/data/types';
import { BattleSimulation } from '@/simulation/battle';
import { summarise } from '@/simulation/results';
import type { BattleConfig, FleetSpec, FormationType } from '@/simulation/types';
import { isApexRules, type RuleSet } from '@/timelines/rules';
import { THREAT_RUNGS, type RungGroup, type ThreatRun } from '@/timelines/threat';
import { fleet } from './index';

/**
 * The threat reference engagement (docs/apex/TIMELINES_V2.md §1.1): a
 * Council-era coalition in one battle line against five Reaper groups of
 * growing size, four seeds each. SIMULATION_ESTIMATE: a compressed stand-in
 * like every scenario fleet, not a canon battle. Deterministic (every draw
 * comes from the seeded Rng inside BattleSimulation); not registered as a
 * Quick Battle scenario.
 */

export const THREAT_REFERENCE_ID = 'threat_reference';
export const THREAT_SEEDS = [1, 2, 3, 4] as const;

/** The longest weapon range in the catalogue, before any rule multiplier (nominal km). */
export const THREAT_LONGEST_RANGE = Math.max(...WEAPON_LIST.map((w) => w.range));
/** The two lines start 7 % beyond that range, so nobody opens fire before the first move (nominal km, 0.1 km steps). */
export const THREAT_STANDOFF = Math.round(10 * 1.07 * THREAT_LONGEST_RANGE) / 10;
/** The time limit: 3.2 × the time a canon Reaper capital at top speed needs to cross the standoff (whole seconds). */
export const THREAT_MAX_DURATION = Math.round((3.2 * THREAT_STANDOFF) / SHIP_CLASSES.reaper_capital.maxSpeed.value);

const cerberusAllied = (r: RuleSet): boolean => r.strategic.cerberusStance === 'cooperative' || r.strategic.cerberusStance === 'controls_reapers';

interface Contingent {
  id: string;
  faction: Exclude<FactionId, 'reaper'>;
  name: string;
  /** Anchor x (nominal km); every contingent stands on the coalition line, Cerberus 12 km behind it. */
  x: number;
  behind?: number;
  formation: FormationType;
  /** Extra predicate on top of "fleetStrength of the faction > 0" (0 = absent). */
  when?: (r: RuleSet) => boolean;
  counts: (r: RuleSet) => Record<string, number>;
}

/** §1.1, in this order: the order of the contingents and of the classes inside each fixes the random draws. */
export const THREAT_COALITION: readonly Contingent[] = [
  { id: 'ref-alliance', faction: 'alliance', name: 'Systems Alliance', x: -5, formation: 'line_abreast', counts: (r) => ({ alliance_dreadnought: 2, alliance_carrier: 1, alliance_cruiser: 3, alliance_frigate: 3, normandy_sr2: r.strategic.shepardAlive ? 1 : 0, normandy_valkyrie: r.special.valkyrieAvailable ? 1 : 0, alliance_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-turian', faction: 'turian', name: 'Turian Hierarchy', x: -15, formation: 'line_abreast', counts: (r) => ({ turian_dreadnought: 2, turian_cruiser: 3, turian_frigate: 3, turian_super_dreadnought: r.special.superDreadnoughts ? 1 : 0 }) },
  { id: 'ref-asari', faction: 'asari', name: 'Asari Republics', x: 5, formation: 'defensive_screen', counts: () => ({ asari_dreadnought: 1, asari_cruiser: 3 }) },
  { id: 'ref-salarian', faction: 'salarian', name: 'Salarian Union', x: 15, formation: 'line_abreast', counts: () => ({ salarian_dreadnought: 1, salarian_cruiser: 2, salarian_frigate: 2 }) },
  { id: 'ref-quarian', faction: 'quarian', name: 'Quarian fleet', x: 25, formation: 'defensive_screen', counts: () => ({ quarian_heavy: 1, quarian_cruiser: 3 }) },
  { id: 'ref-geth', faction: 'geth', name: 'Geth fleet', x: -25, formation: 'strike_wedge', counts: () => ({ geth_dreadnought: 1, geth_cruiser: 2, geth_frigate: 2 }) },
  { id: 'ref-cerberus', faction: 'cerberus', name: 'Cerberus', x: 0, behind: 12, formation: 'strike_wedge', when: cerberusAllied, counts: (r) => ({ cerberus_cruiser: 2, cerberus_frigate: 3, cerberus_dreadnought: isApexRules(r) ? 1 : 0 }) },
];

/** Whether a contingent fights under these rules: its faction is present (fleetStrength > 0) and its own predicate holds. */
export const contingentFields = (c: Contingent, rules: RuleSet): boolean => rules.fleetStrength[c.faction] > 0 && (!c.when || c.when(rules));

const reaperGroup = (rules: RuleSet, rung: number): FleetSpec => {
  const g = THREAT_RUNGS[rung];
  return fleet('ref-reapers', 'reaper', rules, {
    counts: { reaper_capital: g.capitals, reaper_destroyer: g.destroyers },
    name: `Reaper ${g.name.toLowerCase()}`,
    side: 'B',
    formation: 'strike_wedge',
    position: v3(0, 0, THREAT_STANDOFF / 2),
    heading: v3(0, 0, -1),
    playerControlled: false,
  });
};

const countOf = (f: FleetSpec, classId: string): number => f.ships.filter((s) => s.classId === classId).reduce((a, s) => a + s.count, 0);

/** The five Reaper groups as this timeline deploys them (after `fleetStrength.reaper`). */
export const threatRungGroups = (rules: RuleSet): RungGroup[] =>
  THREAT_RUNGS.map((g, k) => {
    const f = reaperGroup(rules, k);
    return { name: g.name, capitals: countOf(f, 'reaper_capital'), destroyers: countOf(f, 'reaper_destroyer') };
  });

/** `rung` is 0-based (0 = Raid … 4 = Harvest fleet). Fleet scaling is on: every faction's fleetStrength and factionOverrides act. */
export function buildThreatReference(rules: RuleSet, rung: number, seed: number): BattleConfig {
  const g = THREAT_RUNGS[rung];
  const line = -THREAT_STANDOFF / 2;
  const fleets: FleetSpec[] = THREAT_COALITION.filter((c) => contingentFields(c, rules)).map((c) =>
    fleet(c.id, c.faction, rules, { counts: c.counts(rules), name: c.name, formation: c.formation, position: v3(c.x, 0, line - (c.behind ?? 0)), heading: v3(0, 0, 1) }),
  );
  fleets.push(reaperGroup(rules, rung));
  return {
    id: `${THREAT_REFERENCE_ID}-${rules.id}-r${rung + 1}-${seed}`,
    name: `Threat reference: ${g.name}`,
    scenarioId: THREAT_REFERENCE_ID,
    seed,
    rules,
    environment: 'deep_space',
    maxDuration: THREAT_MAX_DURATION,
    perspectiveSide: 'A',
    objective: 'Destroy the Reaper group.',
    fleets: fleets.filter((f) => f.ships.length > 0),
  };
}

/** The §1.2 metrics of a finished battle. */
export function threatRunOf(sim: BattleSimulation, rung: number, seed: number): ThreatRun {
  const result = sim.result ?? summarise(sim);
  let value = 0;
  let lost = 0;
  for (const s of sim.ships) {
    if (s.side !== 'B' || s.role === 'fighter') continue;
    value += s.pointValue;
    lost += s.pointValue * (s.alive ? Math.max(0, 1 - s.hull / s.maxHull) : 1);
  }
  return {
    rung,
    seed,
    reaperLoss: value > 0 ? lost / value : 0,
    organicSurvival: result.sides.A.survivalPercent / 100,
    winner: result.winner,
    duration: sim.time,
    timeLimit: sim.time >= sim.config.maxDuration,
  };
}

/** Synchronous: the script's path. Tests step with tests/support/async.ts `runSimAsync` and call `threatRunOf`. */
export function runThreatReference(rules: RuleSet, rung: number, seed: number): ThreatRun {
  const sim = new BattleSimulation(buildThreatReference(rules, rung, seed));
  sim.run();
  return threatRunOf(sim, rung, seed);
}

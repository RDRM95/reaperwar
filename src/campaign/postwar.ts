import { Rng } from '@/core/rng';
import type { RuleSet } from '@/timelines/rules';

/**
 * Cerberus Ascendant post-war strategic simulation, 2186–2206.
 *
 * ALTERNATE CONTINUITY. Shepard died at the Collector Base; the Catalyst is
 * destroyed; the Illusive Man alone controls the captured Reaper fleet and
 * runs a twenty-year plan to replace Reaper superiority with human
 * conventional fleets, then dismantle the Reapers. One turn is a quarter.
 * Nothing here is presented as canon.
 */

export type Programme =
  | 'rebuild_earth'
  | 'reinforce_sol'
  | 'infrastructure'
  | 'assist_alliance'
  | 'colonies'
  | 'council_reconstruction'
  | 'reverse_engineer'
  | 'shipbuilding'
  | 'conventional_fleets'
  | 'political_influence'
  | 'negotiate_council'
  | 'dismantlement_prep';

export const PROGRAMMES: { id: Programme; label: string; description: string }[] = [
  { id: 'rebuild_earth', label: 'Rebuild Earth', description: 'Reconstruction of Earth’s cities and population centres.' },
  { id: 'reinforce_sol', label: 'Reinforce Sol', description: 'Orbital defence platforms and garrison fleets in the home system.' },
  { id: 'infrastructure', label: 'Restore infrastructure', description: 'Relays, shipyards, food and medical systems across human space.' },
  { id: 'assist_alliance', label: 'Assist the Systems Alliance', description: 'Fleet transfers and logistics to the Alliance Navy. Raises Alliance trust; Cerberus loses direct leverage.' },
  { id: 'colonies', label: 'Reconstruct colonies', description: 'Horizon, Eden Prime, Benning and the Terminus holdings.' },
  { id: 'council_reconstruction', label: 'Support Council reconstruction', description: 'Selected aid to Palaven, Thessia and Sur’Kesh. Improves Council relations; costs human-first credibility.' },
  { id: 'reverse_engineer', label: 'Reverse-engineer Reaper technology', description: 'Research programmes on captured hulls. Raises technology; raises Council alarm.' },
  { id: 'shipbuilding', label: 'Expand shipbuilding', description: 'Yard capacity: the ceiling on how fast conventional fleets can grow.' },
  { id: 'conventional_fleets', label: 'Develop conventional fleets', description: 'Lay down human dreadnoughts, cruisers and carriers to replace the Reapers.' },
  { id: 'political_influence', label: 'Increase Cerberus influence', description: 'Media, parliament, Alliance command. Stability under Cerberus direction.' },
  { id: 'negotiate_council', label: 'Negotiate with the Council', description: 'Diplomacy over the control interface, borders and the Reapers’ future.' },
  { id: 'dismantlement_prep', label: 'Prepare Reaper dismantlement', description: 'Engineering and security work needed to take captured Reapers apart safely.' },
];

export interface PostWarState {
  version: number;
  rulesId: string;
  seed: number;
  quarter: number; // 0..80
  year: number;
  metrics: {
    earthRecovery: number;
    solDefence: number;
    infrastructure: number;
    colonies: number;
    allianceRelations: number;
    councilRelations: number;
    cerberusInfluence: number;
    stability: number;
    reaperTech: number;
    shipyardCapacity: number;
    dismantlementReadiness: number;
  };
  /** Conventional human fleet strength (abstract points). */
  conventionalFleet: number;
  /** Controlled Reapers remaining. */
  controlledReapers: number;
  reapersAtStart: number;
  reapersDismantled: number;
  allocation: Record<Programme, number>;
  events: { quarter: number; text: string; kind: 'info' | 'warning' | 'crisis' | 'milestone' }[];
  outcome?: { kind: 'victory' | 'defeat'; reason: string; quarter: number };
}

export const POSTWAR_VERSION = 1;

const defaultAllocation = (): Record<Programme, number> => {
  const a = {} as Record<Programme, number>;
  for (const p of PROGRAMMES) a[p.id] = 100 / PROGRAMMES.length;
  return a;
};

export function createPostWar(rules: RuleSet, seed: number): PostWarState {
  const state: PostWarState = {
    version: POSTWAR_VERSION,
    rulesId: rules.id,
    seed,
    quarter: 0,
    year: 2186,
    metrics: {
      earthRecovery: 0.2,
      solDefence: 0.3,
      infrastructure: 0.25,
      colonies: 0.3,
      allianceRelations: 0.45,
      councilRelations: 0.25,
      cerberusInfluence: 0.6,
      stability: 0.5,
      reaperTech: 0.1,
      shipyardCapacity: 0.3,
      dismantlementReadiness: 0.05,
    },
    conventionalFleet: 6000,
    controlledReapers: 60,
    reapersAtStart: 60,
    reapersDismantled: 0,
    allocation: defaultAllocation(),
    events: [{ quarter: 0, text: 'The Catalyst is gone. Harbinger is destroyed. The Illusive Man holds exclusive control of the Reaper fleet and begins the twenty-year plan.', kind: 'milestone' }],
  };
  return state;
}

export function setAllocation(state: PostWarState, alloc: Partial<Record<Programme, number>>): void {
  const merged = { ...state.allocation, ...alloc };
  const total = PROGRAMMES.reduce((a, p) => a + Math.max(0, merged[p.id] ?? 0), 0) || 1;
  for (const p of PROGRAMMES) state.allocation[p.id] = (Math.max(0, merged[p.id] ?? 0) / total) * 100;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Reaper fleet value equivalent used to judge self-sufficiency. */
export const REAPER_UNIT_VALUE = 1800;
/** Fleet strength humanity needs to stand without the Reapers. Council security guarantees (relations ≥ 0.6) lower it. */
export const requiredConventionalFleet = (state: PostWarState): number =>
  Math.round(state.reapersAtStart * REAPER_UNIT_VALUE * 0.6 * (state.metrics.councilRelations >= 0.6 ? 0.85 : 1));
/** Orbital defence contributes to self-sufficiency alongside the mobile fleet. */
const defensiveStrength = (state: PostWarState): number => state.conventionalFleet + state.metrics.solDefence * 6000;

/** Dismantle up to n Reapers this quarter. Refused when readiness or fleets are insufficient. */
export function dismantle(state: PostWarState, n: number): { ok: boolean; reason?: string; dismantled: number } {
  if (state.outcome) return { ok: false, reason: 'The plan has concluded.', dismantled: 0 };
  const m = state.metrics;
  const maxPerQuarter = Math.max(1, Math.floor(m.dismantlementReadiness * 6));
  const count = Math.min(n, maxPerQuarter, state.controlledReapers);
  if (count <= 0) return { ok: false, reason: 'No Reapers available to dismantle.', dismantled: 0 };
  if (m.dismantlementReadiness < 0.3) return { ok: false, reason: 'Dismantlement engineering is not ready (needs 30% readiness).', dismantled: 0 };
  // Progressive replacement: the share of Reapers taken apart must be matched by conventional strength.
  const share = (state.reapersDismantled + count) / state.reapersAtStart;
  if (defensiveStrength(state) < share * requiredConventionalFleet(state)) {
    return { ok: false, reason: 'Humanity cannot yet defend itself without these Reapers. Build fleets, fortify Sol or secure Council guarantees first.', dismantled: 0 };
  }
  if (state.controlledReapers - count === 0 && m.solDefence < 0.5) {
    return { ok: false, reason: 'Sol’s own defences (50%) must be in place before the last Reapers leave orbit.', dismantled: 0 };
  }
  state.controlledReapers -= count;
  state.reapersDismantled += count;
  m.reaperTech = clamp01(m.reaperTech + 0.01 * count);
  m.councilRelations = clamp01(m.councilRelations + 0.006 * count);
  state.events.push({ quarter: state.quarter, text: `${count} Reaper${count > 1 ? 's' : ''} dismantled under Cerberus engineering supervision.`, kind: 'milestone' });
  return { ok: true, dismantled: count };
}

export function advanceQuarter(state: PostWarState): void {
  if (state.outcome) return;
  const rng = new Rng(state.seed + state.quarter * 7919);
  state.quarter++;
  state.year = 2186 + state.quarter / 4;
  const a = state.allocation;
  const m = state.metrics;
  const budget = 1 + m.infrastructure * 0.8 + m.earthRecovery * 0.5 + m.colonies * 0.3; // economic capacity
  const f = (p: Programme) => (a[p] / 100) * budget;

  m.earthRecovery = clamp01(m.earthRecovery + 0.035 * f('rebuild_earth') + 0.005 * m.infrastructure);
  m.solDefence = clamp01(m.solDefence + 0.05 * f('reinforce_sol') - 0.003);
  m.infrastructure = clamp01(m.infrastructure + 0.03 * f('infrastructure') + 0.004 * m.earthRecovery);
  m.colonies = clamp01(m.colonies + 0.035 * f('colonies'));
  m.allianceRelations = clamp01(m.allianceRelations + 0.05 * f('assist_alliance') + 0.01 * f('rebuild_earth') - 0.01 * f('political_influence') - 0.006);
  m.councilRelations = clamp01(m.councilRelations + 0.05 * f('council_reconstruction') + 0.06 * f('negotiate_council') - 0.03 * f('reverse_engineer') - 0.004 * (state.controlledReapers / state.reapersAtStart));
  m.cerberusInfluence = clamp01(m.cerberusInfluence + 0.04 * f('political_influence') - 0.02 * f('assist_alliance') - 0.015 * f('council_reconstruction') - 0.003);
  m.reaperTech = clamp01(m.reaperTech + 0.045 * f('reverse_engineer'));
  m.shipyardCapacity = clamp01(m.shipyardCapacity + 0.04 * f('shipbuilding') + 0.01 * m.infrastructure);
  m.dismantlementReadiness = clamp01(m.dismantlementReadiness + 0.05 * f('dismantlement_prep') + 0.01 * m.reaperTech);
  // Conventional fleets: capped by shipyard capacity, boosted by Reaper tech.
  const build = 1400 * m.shipyardCapacity * (1 + m.reaperTech * 0.8) * (0.3 + f('conventional_fleets')) * (0.6 + 0.4 * m.stability);
  state.conventionalFleet += Math.round(build);
  // Stability: Earth recovery, influence and a visible home defence raise it; a Reaper fleet in orbit lowers it.
  const reaperFear = 0.012 * (state.controlledReapers / state.reapersAtStart);
  m.stability = clamp01(m.stability + 0.015 * m.earthRecovery + 0.01 * m.cerberusInfluence + 0.008 * m.allianceRelations + 0.006 * m.solDefence - reaperFear - 0.003);

  // Events.
  const ev = (text: string, kind: PostWarState['events'][number]['kind']) => state.events.push({ quarter: state.quarter, text, kind });
  if (state.quarter % 8 === 0 && m.councilRelations < 0.35 && state.controlledReapers > 30) {
    m.councilRelations = clamp01(m.councilRelations - 0.06);
    ev('Council ultimatum: the Hierarchy and Republics demand oversight of the Reaper control interface. The Illusive Man refuses. Relations deteriorate.', 'warning');
  }
  if (state.quarter % 8 === 4 && m.cerberusInfluence < 0.35) {
    m.stability = clamp01(m.stability - 0.1);
    ev('Alliance Parliament moves to nationalise Cerberus assets. Unrest across Sol.', 'warning');
  }
  if (rng.chance(0.08) && m.reaperTech > 0.4) {
    m.reaperTech = clamp01(m.reaperTech + 0.05);
    ev('Breakthrough: captured Reaper drive cores yield a working eezo-synthesis process. Shipbuilding accelerates.', 'milestone');
  }
  if (rng.chance(0.06) && m.solDefence < 0.4) {
    m.colonies = clamp01(m.colonies - 0.08);
    ev('Terminus raiders strike an outer colony while the Sol garrison is thin.', 'warning');
  }
  if (state.quarter === 20) ev('2191: five years in. Human shipyards now outbuild the pre-war Alliance.', 'info');
  if (state.quarter === 40) ev('2196: halfway. The question is no longer whether the Reapers can be dismantled, but when.', 'info');

  // Outcomes.
  const required = requiredConventionalFleet(state);
  if (state.controlledReapers === 0) {
    const ready = defensiveStrength(state) >= required && m.solDefence >= 0.5;
    state.outcome = ready
      ? { kind: 'victory', reason: `All ${state.reapersAtStart} captured Reapers have been dismantled. Humanity’s conventional fleets (${state.conventionalFleet.toLocaleString()} points) defend Sol without them. The Illusive Man’s plan is complete.`, quarter: state.quarter }
      : { kind: 'defeat', reason: 'The Reapers are gone but humanity cannot yet defend itself. The Council moves to impose terms on a weakened Cerberus.', quarter: state.quarter };
  } else if (m.stability < 0.08) {
    state.outcome = { kind: 'defeat', reason: 'Sol collapses into unrest. The Illusive Man loses control of the situation on the ground, and with it the project.', quarter: state.quarter };
  } else if (m.councilRelations < 0.05 && m.cerberusInfluence < 0.3) {
    state.outcome = { kind: 'defeat', reason: 'A Council coalition, backed by an Alliance faction, moves against Cerberus. The control interface is seized in the fighting.', quarter: state.quarter };
  } else if (state.quarter >= 80) {
    const dismantledFrac = state.reapersDismantled / state.reapersAtStart;
    state.outcome = dismantledFrac >= 0.8 && defensiveStrength(state) >= required * 0.8 && m.solDefence >= 0.4
      ? { kind: 'victory', reason: `2206: ${state.reapersDismantled} of ${state.reapersAtStart} Reapers dismantled; human fleets stand on their own. The plan succeeds, late.`, quarter: state.quarter }
      : { kind: 'defeat', reason: `2206: the twenty-year plan ends with ${state.controlledReapers} Reapers still in Cerberus hands. Humanity remains dependent on them.`, quarter: state.quarter };
  }
  if (state.outcome) state.events.push({ quarter: state.quarter, text: state.outcome.reason, kind: 'milestone' });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

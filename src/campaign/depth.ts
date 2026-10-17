import { Rng } from '@/core/rng';
import { FACTIONS } from '@/data/factions';
import type { FactionId } from '@/data/types';
import type { TechModifiers } from '@/timelines/rules';
import { SYSTEMS, getSystem, neighbours, type SystemId } from './galaxy';
import type { CampaignEvent, CampaignState } from './state';

/**
 * Campaign depth: ground war, research projects, refugee pressure and
 * political events. Pure functions over CampaignState so they stay testable
 * and deterministic (per-tick seeded RNG).
 */

// ------------------------------------------------------------ research

export interface ResearchProject {
  id: string;
  name: string;
  cost: number;
  description: string;
  /** Multipliers applied to the allied organic technology table. */
  tech?: Partial<Record<keyof TechModifiers, number>>;
}

export const RESEARCH_PROJECTS: ResearchProject[] = [
  { id: 'reaper_armour_analysis', name: 'Reaper armour analysis', cost: 70, description: 'Autopsy of destroyer wreckage: mass accelerator rounds penetrate Reaper plating more reliably (+20 % penetration).', tech: { massAcceleratorPenetration: 1.2 } },
  { id: 'barrier_overcharge', name: 'Barrier overcharge', cost: 80, description: 'Cycling kinetic barriers at higher field strength (+15 % barrier capacity).', tech: { kineticBarrierStrength: 1.15 } },
  { id: 'targeting_vi', name: 'Predictive targeting VI', cost: 60, description: 'Fleet targeting VIs trained on Reaper manoeuvre data (+10 % accuracy).', tech: { accuracy: 1.1 } },
  { id: 'gardian_upgrade', name: 'GARDIAN power upgrade', cost: 55, description: 'Higher-output point-defence lasers against Reaper fighters and oculi (+30 % GARDIAN effectiveness).', tech: { gardianEffectiveness: 1.3 } },
  { id: 'ground_defence_doctrine', name: 'Ground defence doctrine', cost: 50, description: 'Dispersed garrisons and hardened shelters: ground forces attrit half as fast under harvest and recover faster.' },
  { id: 'indoctrination_screening', name: 'Indoctrination screening', cost: 65, description: 'Neural scans for command staff: indoctrination pressure grows half as fast and exposed officials cost less trust.' },
  { id: 'crucible_schematics', name: 'Crucible schematic refinement', cost: 90, description: 'Prothean archive cross-referencing: Crucible construction 25 % faster.' },
  { id: 'thanix_refit', name: 'Thanix refit programme', cost: 110, description: 'Thanix streams fitted across cruiser lines (+25 % Thanix damage, +10 % mass accelerator damage).', tech: { beamDamage: 1.25, massAcceleratorDamage: 1.1 } },
];

export const getProject = (id: string): ResearchProject | undefined => RESEARCH_PROJECTS.find((p) => p.id === id);

export function hasResearch(state: CampaignState, id: string): boolean {
  return state.research.completed.includes(id);
}

/** Research points per week from intact allied industry; Sur'Kesh counts double. */
export function researchOutput(state: CampaignState): number {
  let out = 0;
  for (const s of SYSTEMS) {
    const st = state.systems[s.id];
    if (st.controller !== 'allied') continue;
    out += s.industry * st.industry * (s.homeworldOf === 'salarian' ? 2 : 1);
  }
  return out * 0.1 * (0.8 + 0.4 * state.rules.strategic.alliedCoordination);
}

export function setResearch(state: CampaignState, id: string | undefined): { ok: boolean; reason?: string } {
  if (id === undefined) {
    state.research.active = undefined;
    return { ok: true };
  }
  const p = getProject(id);
  if (!p) return { ok: false, reason: 'Unknown project' };
  if (hasResearch(state, id)) return { ok: false, reason: 'Already completed' };
  if (state.research.active !== id) state.research.progress = 0;
  state.research.active = id;
  return { ok: true };
}

/** Absolute technology overrides for allied fleets from completed research. */
export function researchTech(state: CampaignState): Partial<TechModifiers> | undefined {
  const out: Partial<TechModifiers> = {};
  let any = false;
  for (const id of state.research.completed) {
    const p = getProject(id);
    if (!p?.tech) continue;
    for (const [k, mult] of Object.entries(p.tech) as [keyof TechModifiers, number][]) {
      out[k] = (out[k] ?? state.rules.organic[k]) * mult;
      any = true;
    }
  }
  return any ? out : undefined;
}

export function researchPhase(state: CampaignState, log: Logger): void {
  const r = state.research;
  if (!r.active) {
    // Auto-pick the next project so AI-run and non-interactive campaigns still progress.
    const next = RESEARCH_PROJECTS.find((p) => !r.completed.includes(p.id));
    if (!next) return;
    r.active = next.id;
    r.progress = 0;
  }
  const p = getProject(r.active);
  if (!p) {
    r.active = undefined;
    return;
  }
  r.progress += researchOutput(state);
  if (r.progress >= p.cost) {
    r.completed.push(p.id);
    r.progress = 0;
    r.active = undefined;
    log('research', `Research complete: ${p.name}. ${p.description}`);
  }
}

// ------------------------------------------------------------ ground war

/** Effective ground strength including krogan reinforcement of Earth and Palaven. */
export function effectiveGround(state: CampaignState, id: SystemId): number {
  const g = state.systems[id].ground;
  const krogan = state.flags.krogan_muster ? (id === 'sol' || id === 'trebia' ? 0.25 : id === 'krogan_dmz' ? 0.3 : 0) : 0;
  return Math.min(1, g + krogan);
}

/**
 * Ground war for one system this week. `orbitPower` is the Reaper fleet power
 * in orbit (0 when none). Returns the population loss so refugees can be
 * tracked.
 */
export function groundWar(state: CampaignState, id: SystemId, orbitPower: number, alliedInOrbit: boolean): number {
  const st = state.systems[id];
  const doctrine = hasResearch(state, 'ground_defence_doctrine');
  const g = effectiveGround(state, id);
  // Competent Reapers land husks and processing forces faster.
  const landing = state.reaper.competence * (doctrine ? 0.5 : 1);
  let popLoss = 0;
  if (orbitPower > 0 && !alliedInOrbit) {
    // Harvest from orbit: ground forces slow the landings and the processing.
    const resist = 1 - 0.3 * g;
    popLoss = 0.03 * orbitPower * resist;
    st.reaperPresence = Math.min(1, st.reaperPresence + 0.15 * orbitPower * (1 - 0.2 * g));
    st.industry = Math.max(0, st.industry - 0.06 * orbitPower); // orbital bombardment of industry is not slowed by ground forces
    st.defence = Math.max(0, st.defence - 0.3);
    st.ground = Math.max(0, st.ground - 0.1 * orbitPower * landing);
  } else if (st.controller === 'reaper' && orbitPower === 0 && !alliedInOrbit) {
    // Occupation: the ground war continues without a fleet overhead.
    popLoss = 0.012 * st.reaperPresence * (1 - 0.4 * g);
    st.industry = Math.max(0, st.industry - 0.01);
    st.ground = Math.max(0, st.ground - 0.03 * st.reaperPresence * landing);
  } else if (st.controller === 'allied') {
    const near = neighbours(id).some((n) => state.fleets.some((f) => f.allegiance === 'reaper' && f.location === n));
    st.ground = Math.min(1, st.ground + (near ? 0.01 : doctrine ? 0.06 : 0.04));
  }
  st.population = Math.max(0, st.population - popLoss);
  return popLoss;
}

/** How much Reaper presence a liberating fleet clears: more when the ground is still held. */
export const liberationClear = (state: CampaignState, id: SystemId): number => 0.3 + 0.4 * effectiveGround(state, id);

// ------------------------------------------------------------- refugees

export function refugeePhase(state: CampaignState, popLossIndexWeighted: number, log: Logger): void {
  const citadelAllied = state.systems.widow.controller === 'allied';
  state.refugees = Math.max(0, Math.min(1, state.refugees + popLossIndexWeighted * 0.05 - (citadelAllied ? 0.015 : 0.005)));
  if (state.refugees > 0.5) {
    for (const f of Object.values(state.factions)) if (f.faction !== 'alliance') f.cooperation = Math.max(0.1, f.cooperation - 0.004);
  }
  if (state.refugees > 0.7 && cooldownReady(state, 'refugee_crisis', 8)) {
    state.flags.refugee_crisis = state.tick;
    state.systems.widow.industry = Math.max(0, state.systems.widow.industry - 0.1);
    for (const f of Object.values(state.factions)) if (f.faction !== 'alliance') f.cooperation = Math.max(0.1, f.cooperation - 0.05);
    log('political', 'Refugee crisis: the Citadel docks are overwhelmed. Industry on the wards slows and the Council governments turn inward.', 'widow');
  }
}

/** Crucible construction multiplier from research and refugee pressure. */
export const crucibleRateModifier = (state: CampaignState): number => (hasResearch(state, 'crucible_schematics') ? 1.25 : 1) * (1 - 0.3 * state.refugees);

/** Indoctrination growth multiplier from research. */
export const indoctrinationModifier = (state: CampaignState): number => (hasResearch(state, 'indoctrination_screening') ? 0.5 : 1);

// ------------------------------------------------------- political events

type Logger = (kind: CampaignEvent['kind'], text: string, system?: SystemId) => void;

const cooldownReady = (state: CampaignState, flag: string, ticks: number): boolean => state.flags[flag] === undefined || state.tick - state.flags[flag] >= ticks;

export function politicalPhase(state: CampaignState, log: Logger): void {
  const rng = new Rng(state.seed * 31 + state.tick * 17 + 5);
  const ws = state.worldState;
  // Krogan muster: the genophage decision decides the ground war on two homeworlds.
  if (state.tick >= 3 && state.flags.krogan_decided === undefined) {
    state.flags.krogan_decided = state.tick;
    if (ws.genophage === 'sabotaged') {
      log('political', 'The genophage cure was sabotaged. The krogan clans stay on Tuchanka; the Salarian First Fleet is the price the Dalatrass paid.');
    } else {
      state.flags.krogan_muster = state.tick;
      log('ground', 'The genophage is cured. Urdnot Wrex ships krogan clans to Palaven and Earth: ground forces on both homeworlds are reinforced.');
    }
  }
  // Council summit: shared command when the Citadel is secure.
  if (state.tick % 12 === 0 && state.tick > 0 && state.systems.widow.controller === 'allied') {
    for (const f of Object.values(state.factions)) f.cooperation = Math.min(1, f.cooperation + 0.06);
    log('political', 'Council war summit on the Citadel: the member governments agree to broader fleet commitments.', 'widow');
  }
  // Indoctrinated officials.
  for (const s of SYSTEMS) {
    const st = state.systems[s.id];
    if (st.controller !== 'allied' || st.indoctrination < 0.6 || !s.homeworldOf) continue;
    if (!cooldownReady(state, `indoct_${s.id}`, 10)) continue;
    state.flags[`indoct_${s.id}`] = state.tick;
    const screened = hasResearch(state, 'indoctrination_screening');
    const fs = state.factions[s.homeworldOf];
    fs.cooperation = Math.max(0.1, fs.cooperation - (screened ? 0.04 : 0.12));
    fs.morale = Math.max(0.1, fs.morale - 0.05);
    st.indoctrination = Math.max(0, st.indoctrination - 0.3);
    log('political', screened ? `Indoctrination screening exposes a compromised ${FACTIONS[s.homeworldOf].shortName} official on ${s.world} before any damage is done.` : `A senior ${FACTIONS[s.homeworldOf].shortName} official on ${s.world} is exposed as indoctrinated after months of sabotaged orders. Trust in joint command falls.`, s.id);
  }
  // Shipyard sabotage by indoctrinated staff.
  for (const f of Object.keys(FACTIONS) as FactionId[]) {
    const home = SYSTEMS.find((s) => s.homeworldOf === f);
    if (!home) continue;
    const st = state.systems[home.id];
    if (st.controller === 'allied' && st.indoctrination > 0.4 && cooldownReady(state, `sabotage_${f}`, 6) && rng.chance(0.06 * indoctrinationModifier(state))) {
      state.flags[`sabotage_${f}`] = state.tick;
      state.factions[f].productionPool *= 0.5;
      log('political', `Sabotage at the ${home.world} yards: half the ${FACTIONS[f].shortName} production backlog is lost to indoctrinated workers.`, home.id);
    }
  }
  // Terminus mercenaries throw in with the alliance when the war goes well enough.
  if (state.flags.aria_fleet === undefined && state.tick >= 8 && state.systems.omega.controller !== 'reaper' && state.reaper.lostValue > 2000 && rng.chance(0.2)) {
    state.flags.aria_fleet = state.tick;
    state.fleets.push({ id: `f${state.nextFleetId++}`, name: 'Terminus mercenary fleet', faction: 'alliance', allegiance: 'allied', location: 'omega', counts: { alliance_cruiser: 3, alliance_frigate: 8 }, readiness: 0.8, playerControlled: true, posture: 'defend' });
    state.systems.omega.controller = 'allied';
    log('political', 'Aria T’Loak’s Terminus fleet joins the war from Omega (simulation estimate: represented with Alliance-pattern hulls).', 'omega');
  }
  // STG intelligence degrades Reaper coordination.
  if (state.tick % 10 === 0 && state.tick > 0 && state.factions.salarian.cooperation >= 0.5 && state.systems.annos.controller === 'allied') {
    state.reaper.competence = Math.max(0.4, state.reaper.competence - 0.03);
    log('intel', 'STG intercepts Reaper movement orders. Their fleet coordination degrades.', 'annos');
  }
}

// ----------------------------------------------------------- migration

/** Fill fields added after the first campaign build so old saves keep working. */
export function normaliseCampaign(state: CampaignState): CampaignState {
  state.research ??= { progress: 0, completed: [] };
  state.refugees ??= 0;
  state.flags ??= {};
  for (const s of SYSTEMS) {
    const st = state.systems[s.id];
    if (st && st.ground === undefined) st.ground = st.controller === 'allied' ? 1 : st.controller === 'reaper' ? 0.3 : 0.6;
  }
  return state;
}

export const systemLabel = (id: SystemId): string => getSystem(id).world;

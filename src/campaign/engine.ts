import { Rng } from '@/core/rng';
import { v3 } from '@/core/vec3';
import { FACTIONS } from '@/data/factions';
import { getShipClass } from '@/data/ships';
import type { FactionId } from '@/data/types';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig, BattleResult, FleetSpec } from '@/simulation/types';
import type { RuleSet } from '@/timelines/rules';
import { getSystem, neighbours, relayPath, SYSTEMS, type SystemId } from './galaxy';
import type { Allegiance, CampaignEvent, CampaignFleet, CampaignState, FactionStatus, PendingEngagement, SystemState } from './state';

/**
 * Strategic campaign engine. One tick ≈ one week of the war. Fleets move
 * along relays, Reapers harvest and advance, factions produce hulls from
 * intact industry, and engagements are resolved by the headless battle
 * simulation (or by the player in 3D). Everything derives from the rule
 * set: fleet strength, production, Reaper competence and reinforcements,
 * Crucible availability and the conventional-victory flag.
 */

export const CAMPAIGN_VERSION = 1;
const MAX_SHIPS_PER_SIDE = 70;

/** Classes each faction produces, with relative weights and point costs. */
const PRODUCTION: Partial<Record<FactionId, { classId: string; weight: number }[]>> = {
  alliance: [
    { classId: 'alliance_frigate', weight: 6 },
    { classId: 'alliance_cruiser', weight: 3 },
    { classId: 'alliance_dreadnought', weight: 1 },
  ],
  turian: [
    { classId: 'turian_frigate', weight: 6 },
    { classId: 'turian_cruiser', weight: 3 },
    { classId: 'turian_dreadnought', weight: 1 },
  ],
  asari: [
    { classId: 'asari_cruiser', weight: 5 },
    { classId: 'asari_dreadnought', weight: 1 },
  ],
  salarian: [
    { classId: 'salarian_frigate', weight: 6 },
    { classId: 'salarian_cruiser', weight: 3 },
    { classId: 'salarian_dreadnought', weight: 1 },
  ],
  cerberus: [
    { classId: 'cerberus_frigate', weight: 5 },
    { classId: 'cerberus_cruiser', weight: 3 },
  ],
  geth: [
    { classId: 'geth_frigate', weight: 5 },
    { classId: 'geth_cruiser', weight: 3 },
  ],
  quarian: [
    { classId: 'quarian_cruiser', weight: 4 },
    { classId: 'quarian_heavy', weight: 1 },
  ],
};

/** Orbital defence platforms are represented by the owner's escort hulls. */
const DEFENCE_CLASSES: Partial<Record<FactionId, { cruiser: string; frigate: string }>> = {
  alliance: { cruiser: 'alliance_cruiser', frigate: 'alliance_frigate' },
  turian: { cruiser: 'turian_cruiser', frigate: 'turian_frigate' },
  asari: { cruiser: 'asari_cruiser', frigate: 'asari_cruiser' },
  geth: { cruiser: 'geth_cruiser', frigate: 'geth_frigate' },
  quarian: { cruiser: 'quarian_cruiser', frigate: 'quarian_cruiser' },
  cerberus: { cruiser: 'cerberus_cruiser', frigate: 'cerberus_frigate' },
  salarian: { cruiser: 'salarian_cruiser', frigate: 'salarian_frigate' },
};

export const fleetPoints = (counts: Record<string, number>): number =>
  Object.entries(counts).reduce((a, [c, n]) => a + (n > 0 ? getShipClass(c).pointValue * n : 0), 0);

export const fleetShipCount = (counts: Record<string, number>): number => Object.values(counts).reduce((a, n) => a + Math.max(0, n), 0);

const scaleCounts = (counts: Record<string, number>, k: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [c, n] of Object.entries(counts)) if (n > 0) out[c] = Math.max(1, Math.round(n * k));
  return out;
};

const sideLabel = (a: Allegiance): string => (a === 'reaper' ? 'Reaper' : a === 'cerberus' ? 'Cerberus' : a === 'allied' ? 'Allied' : 'Neutral');

// ------------------------------------------------------------------ create

export interface CampaignOptions {
  seed: number;
  rules: RuleSet;
  name?: string;
  worldState: Record<string, string>;
}

export function createCampaign(opts: CampaignOptions): CampaignState {
  const { rules, seed } = opts;
  const ws = opts.worldState;
  const rannochPeace = ws.rannoch === 'peace';
  const cerberusAllied = rules.strategic.cerberusStance === 'cooperative' || rules.strategic.cerberusStance === 'controls_reapers';
  const systems = {} as Record<SystemId, SystemState>;
  for (const s of SYSTEMS) {
    let controller: Allegiance = 'allied';
    if (s.owner === 'terminus' || s.owner === 'batarian') controller = 'neutral';
    if (s.owner === 'geth') controller = rannochPeace ? 'allied' : 'neutral';
    if (s.id === 'omega') controller = cerberusAllied ? 'allied' : 'cerberus';
    systems[s.id] = { id: s.id, controller, population: 1, industry: 1, defence: 1, reaperPresence: 0, indoctrination: 0 };
  }
  // The invasion has begun: batarian space is already under harvest.
  systems.kite_nest.controller = 'reaper';
  systems.kite_nest.reaperPresence = 0.7;
  systems.kite_nest.population = 0.5;
  systems.hades_gamma.controller = 'reaper';
  systems.hades_gamma.reaperPresence = 1;

  const factions = {} as Record<FactionId, FactionStatus>;
  for (const f of Object.keys(FACTIONS) as FactionId[]) {
    factions[f] = { faction: f, morale: 0.7, productionPool: 0, lost: 0, built: 0, cooperation: Math.min(1, 0.35 + rules.strategic.alliedCoordination * 0.6) };
  }
  factions.alliance.cooperation = 1;

  const fs = rules.fleetStrength;
  const k = (base: Record<string, number>, mult: number): Record<string, number> => scaleCounts(base, mult);
  let nextId = 1;
  const mk = (name: string, faction: FactionId, allegiance: Allegiance, location: SystemId, counts: Record<string, number>, player = allegiance === 'allied', posture: CampaignFleet['posture'] = 'defend'): CampaignFleet => ({
    id: `f${nextId++}`,
    name,
    faction,
    allegiance,
    location,
    counts,
    readiness: 1,
    playerControlled: player,
    posture,
  });
  const fleets: CampaignFleet[] = [
    mk('Alliance Fifth Fleet', 'alliance', 'allied', 'sol', k({ alliance_dreadnought: 6, alliance_carrier: 1, alliance_cruiser: 14, alliance_frigate: 24, alliance_frigate_thanix: rules.strategic.shepardAlive ? 1 : 0 }, fs.alliance)),
    mk('Alliance Third Fleet', 'alliance', 'allied', 'arcturus', k({ alliance_dreadnought: 3, alliance_cruiser: 8, alliance_frigate: 14 }, fs.alliance)),
    mk('Alliance Second Fleet', 'alliance', 'allied', 'exodus', k({ alliance_dreadnought: 1, alliance_cruiser: 5, alliance_frigate: 10 }, fs.alliance)),
    mk('Hierarchy Palaven Fleet', 'turian', 'allied', 'trebia', k({ turian_dreadnought: 7, turian_cruiser: 14, turian_frigate: 22 }, fs.turian)),
    mk('Citadel Fleet (Hierarchy)', 'turian', 'allied', 'widow', k({ turian_dreadnought: 3, turian_cruiser: 8, turian_frigate: 12 }, fs.turian)),
    mk('Republics Home Fleet', 'asari', 'allied', 'athena', { ...k({ asari_dreadnought: 3, asari_cruiser: 14 }, fs.asari), destiny_ascension: ws.ascension === 'absent' ? 0 : 1 }),
    mk('Citadel Fleet (Republics)', 'asari', 'allied', 'widow', k({ asari_cruiser: 6 }, fs.asari)),
    mk('Salarian Third Fleet', 'salarian', 'allied', 'annos', k({ salarian_dreadnought: 2, salarian_cruiser: 10, salarian_frigate: 16 }, fs.salarian)),
  ];
  // Canon: the Dalatrass commits the First Fleet only when the genophage cure is sabotaged.
  if (ws.genophage === 'sabotaged') fleets.push(mk('Salarian First Fleet', 'salarian', 'allied', 'annos', k({ salarian_dreadnought: 3, salarian_cruiser: 12, salarian_frigate: 18 }, fs.salarian)));
  else factions.salarian.cooperation = Math.min(factions.salarian.cooperation, 0.4);
  if (rannochPeace) {
    fleets.push(mk('Migrant Fleet', 'quarian', 'allied', 'tikkun', k({ quarian_liveship: 2, quarian_heavy: 4, quarian_cruiser: 18 }, fs.quarian)));
    fleets.push(mk('Geth Consensus Fleet', 'geth', 'allied', 'tikkun', k({ geth_dreadnought: 1, geth_cruiser: 10, geth_frigate: 16 }, fs.geth)));
  }
  fleets.push(mk('Cerberus Horizon Group', 'cerberus', cerberusAllied ? 'allied' : 'cerberus', 'horizon', k({ cerberus_cruiser: 6, cerberus_frigate: 10 }, fs.cerberus), cerberusAllied, cerberusAllied ? 'defend' : 'offensive'));
  fleets.push(mk('Cerberus Omega Group', 'cerberus', cerberusAllied ? 'allied' : 'cerberus', 'omega', k({ cerberus_cruiser: 8, cerberus_frigate: 12, cerberus_dreadnought: rules.id === 'prime_apex' ? 2 : 0 }, fs.cerberus), cerberusAllied, cerberusAllied ? 'defend' : 'offensive'));
  fleets.push(mk('Reaper vanguard', 'reaper', 'reaper', 'kite_nest', k({ reaper_capital: 4, reaper_destroyer: 10 }, fs.reaper), false, 'offensive'));
  fleets.push(mk('Reaper harvest fleet', 'reaper', 'reaper', 'hades_gamma', { ...k({ reaper_capital: 6, reaper_destroyer: 14 }, fs.reaper), harbinger: rules.strategic.harbingerOperational ? 1 : 0 }, false, 'offensive'));

  const state: CampaignState = {
    id: `campaign-${seed}-${Date.now().toString(36)}`,
    name: opts.name ?? `Reaper War — ${rules.name}`,
    version: CAMPAIGN_VERSION,
    rulesId: rules.id,
    rules: JSON.parse(JSON.stringify(rules)) as RuleSet,
    seed,
    tick: 0,
    startDate: '2186',
    systems,
    fleets,
    factions,
    crucible: { progress: 0, available: rules.strategic.crucibleAvailable && rules.strategic.catalystOperational && ws.crucible !== 'refuse', complete: false, docked: false },
    reaper: { strength: 1, competence: rules.strategic.reaperCompetence, reinforcementPool: Math.round(6 * rules.strategic.reaperReinforcements), lostValue: 0, killedValue: 0 },
    warAssets: 0,
    events: [{ tick: 0, kind: 'intel', text: ws.crucible === 'refuse' ? 'The Reapers have entered the galaxy through batarian space. The Crucible will not be used: this war must be won by the fleets.' : 'The Reapers have entered the galaxy through batarian space. Arcturus and Earth are next.' }],
    worldState: ws,
    nextFleetId: nextId,
  };
  state.warAssets = computeWarAssets(state);
  return state;
}

// ------------------------------------------------------------- utilities

export const fleetsAt = (state: CampaignState, system: SystemId): CampaignFleet[] => state.fleets.filter((f) => f.location === system && fleetShipCount(f.counts) > 0);
export const getFleet = (state: CampaignState, id: string): CampaignFleet | undefined => state.fleets.find((f) => f.id === id);
const isHostile = (a: Allegiance, b: Allegiance): boolean => a !== b && a !== 'neutral' && b !== 'neutral';

export function computeWarAssets(state: CampaignState): number {
  let total = 0;
  for (const f of state.fleets) if (f.allegiance === 'allied') total += fleetPoints(f.counts) * f.readiness;
  for (const s of SYSTEMS) {
    const st = state.systems[s.id];
    if (st.controller === 'allied') total += s.industry * 40 * st.industry + s.defence * 30 * st.defence;
  }
  return Math.round(total);
}

export function reaperFleetValue(state: CampaignState): number {
  return state.fleets.filter((f) => f.allegiance === 'reaper').reduce((a, f) => a + fleetPoints(f.counts), 0);
}

function log(state: CampaignState, kind: CampaignEvent['kind'], text: string, system?: SystemId): void {
  state.events.push({ tick: state.tick, kind, text, system });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

/** Issue a move order; returns false when refused (cooperation / adjacency). */
export function orderMove(state: CampaignState, fleetId: string, to: SystemId): { ok: boolean; reason?: string } {
  const f = getFleet(state, fleetId);
  if (!f) return { ok: false, reason: 'No such fleet' };
  if (!f.playerControlled) return { ok: false, reason: 'Fleet is not under your command' };
  if (to === f.location) {
    f.route = undefined;
    f.destination = undefined;
    return { ok: true };
  }
  const path = relayPath(f.location, to);
  if (path.length < 2) return { ok: false, reason: 'No relay route' };
  const home = SYSTEMS.find((s) => s.homeworldOf === f.faction)?.id;
  const coop = state.factions[f.faction].cooperation;
  if (f.faction !== 'alliance' && home && to !== home && coop < 0.5) {
    return { ok: false, reason: `${FACTIONS[f.faction].shortName} command will not commit this fleet away from ${getSystem(home).world} (cooperation ${(coop * 100).toFixed(0)}%)` };
  }
  f.route = path.slice(1);
  f.destination = f.route[0];
  log(state, 'move', `${f.name} ordered to ${getSystem(to).name}.`, f.location);
  return { ok: true };
}

export function setPosture(state: CampaignState, fleetId: string, posture: CampaignFleet['posture']): void {
  const f = getFleet(state, fleetId);
  if (f && f.playerControlled) f.posture = posture;
}

// -------------------------------------------------------------- battles

/** Build the BattleConfig for an engagement at a system. */
export function buildEngagement(state: CampaignState, pending: PendingEngagement): BattleConfig {
  const sys = getSystem(pending.system);
  const st = state.systems[pending.system];
  const rng = new Rng(state.seed * 7919 + state.tick * 131 + pending.system.length);
  const allied = pending.alliedFleetIds.map((id) => getFleet(state, id)!).filter(Boolean);
  const reapers = pending.reaperFleetIds.map((id) => getFleet(state, id)!).filter(Boolean);
  const alliedTotal = allied.reduce((a, f) => a + fleetShipCount(f.counts), 0);
  const reaperTotal = reapers.reduce((a, f) => a + fleetShipCount(f.counts), 0);
  const kA = Math.min(1, MAX_SHIPS_PER_SIDE / Math.max(1, alliedTotal));
  const kB = Math.min(1, MAX_SHIPS_PER_SIDE / Math.max(1, reaperTotal));
  const fleets: FleetSpec[] = [];
  allied.forEach((f, i) => {
    fleets.push({
      id: f.id,
      name: f.name,
      faction: f.faction,
      side: 'A',
      ships: Object.entries(scaleCounts(f.counts, kA)).map(([classId, count]) => ({ classId, count })),
      formation: f.faction === 'reaper' ? 'strike_wedge' : i === 0 ? 'line_abreast' : 'defensive_screen',
      position: v3(-18 + i * 18, 0, -36 - i * 4),
      heading: v3(0, 0, 1),
      playerControlled: f.playerControlled,
      techOverride: f.readiness < 0.95 ? { crewQuality: 0.7 + 0.3 * f.readiness } : undefined,
    });
  });
  // Orbital defence as a static escort group of the system owner's hulls.
  if (st.controller === 'allied' && st.defence > 0.1 && sys.defence > 0) {
    const ownerFaction = (SYSTEMS.find((s) => s.id === sys.id)?.owner ?? 'alliance') as FactionId | 'council' | 'terminus' | 'batarian';
    const fac: FactionId = ownerFaction === 'council' ? 'turian' : ownerFaction === 'terminus' || ownerFaction === 'batarian' ? 'alliance' : ownerFaction;
    const cls = DEFENCE_CLASSES[fac];
    if (cls) {
      const n = Math.max(1, Math.round(sys.defence * st.defence));
      fleets.push({ id: `defence-${sys.id}`, name: `${sys.world} orbital defence`, faction: fac, side: 'A', ships: [{ classId: cls.cruiser, count: Math.ceil(n / 2) }, { classId: cls.frigate, count: n }], formation: 'defensive_screen', position: v3(0, -4, -24), heading: v3(0, 0, 1), initialOrder: { order: 'defend_position' } });
    }
  }
  reapers.forEach((f, i) => {
    fleets.push({
      id: f.id,
      name: f.name,
      faction: f.faction,
      side: 'B',
      ships: Object.entries(scaleCounts(f.counts, kB)).map(([classId, count]) => ({ classId, count })),
      formation: 'strike_wedge',
      position: v3(-12 + i * 24, 0, 42 + i * 6),
      heading: v3(0, 0, -1),
      arrivalTime: i === 0 ? 0 : 20 * i,
    });
  });
  const alliedFactions = [...new Set(allied.map((f) => f.faction))];
  return {
    id: `campaign-${state.id}-${state.tick}-${sys.id}`,
    name: `${sys.world}: ${sideLabel(reapers[0]?.allegiance ?? 'reaper')} assault, week ${state.tick}`,
    scenarioId: 'campaign',
    seed: rng.int(1, 1_000_000),
    rules: state.rules,
    environment: sys.environment,
    maxDuration: 420,
    perspectiveSide: 'A',
    objective: `Hold ${sys.world}.`,
    worldState: { ...state.worldState, campaignSystem: sys.id, alliedFactions: alliedFactions.join(',') },
    fleets,
  };
}

/** Apply a battle result to the campaign (losses, retreats, control). */
export function applyEngagementResult(state: CampaignState, pending: PendingEngagement, result: BattleResult): void {
  const sys = getSystem(pending.system);
  const st = state.systems[pending.system];
  const apply = (fleetIds: string[], side: 'A' | 'B') => {
    const summary = result.sides[side];
    for (const id of fleetIds) {
      const f = getFleet(state, id);
      if (!f) continue;
      for (const [classId, n] of Object.entries(f.counts)) {
        if (n <= 0) continue;
        const e = summary.lossesByClass[classId];
        const frac = e && e.deployed > 0 ? e.lost / e.deployed : summary.deployed > 0 ? summary.destroyed / summary.deployed : 0;
        const lost = Math.min(n, Math.round(n * frac + (frac > 0 && n * frac < 1 ? 0.5 : 0)));
        f.counts[classId] = n - lost;
        state.factions[f.faction].lost += lost;
        if (f.allegiance === 'reaper') state.reaper.lostValue += lost * getShipClass(classId).pointValue;
        else state.reaper.killedValue += 0;
      }
      f.readiness = Math.max(0.4, f.readiness - 0.25);
    }
  };
  apply(pending.alliedFleetIds, 'A');
  apply(pending.reaperFleetIds, 'B');
  // Defence attrition.
  const defenceSummary = result.sides.A.lossesByClass;
  const defLost = Object.values(defenceSummary).reduce((a, e) => a + e.lost, 0);
  if (defLost > 0) st.defence = Math.max(0, st.defence - 0.25);

  const alliedWon = result.winner === 'A';
  const reaperWon = result.winner === 'B';
  const retreat = (fleetIds: string[], allegiance: Allegiance) => {
    for (const id of fleetIds) {
      const f = getFleet(state, id);
      if (!f) continue;
      if (fleetShipCount(f.counts) === 0) continue;
      const escape = neighbours(pending.system).find((n) => state.systems[n].controller === allegiance) ?? neighbours(pending.system).find((n) => state.systems[n].controller !== (allegiance === 'allied' ? 'reaper' : 'allied'));
      if (escape) {
        f.location = escape;
        f.route = undefined;
        f.destination = undefined;
        log(state, 'move', `${f.name} withdraws to ${getSystem(escape).name}.`, escape);
      }
    }
  };
  if (reaperWon) retreat(pending.alliedFleetIds, 'allied');
  if (alliedWon) retreat(pending.reaperFleetIds, 'reaper');
  // Remove empty fleets.
  state.fleets = state.fleets.filter((f) => fleetShipCount(f.counts) > 0);
  const a = result.sides.A;
  const b = result.sides.B;
  const winner: Allegiance | 'draw' = alliedWon ? 'allied' : reaperWon ? 'reaper' : 'draw';
  const summary = `${alliedWon ? 'Allied victory' : reaperWon ? 'Reaper victory' : 'Inconclusive'}: allied losses ${a.destroyed}/${a.deployed}, Reaper losses ${b.destroyed}/${b.deployed}.`;
  st.lastBattle = { tick: state.tick, winner, summary };
  log(state, 'battle', `Battle of ${sys.world}. ${summary}`, sys.id);
  // Morale.
  for (const id of pending.alliedFleetIds) {
    const f = getFleet(state, id);
    if (!f) continue;
    const fs = state.factions[f.faction];
    fs.morale = Math.max(0.1, Math.min(1, fs.morale + (alliedWon ? 0.08 : reaperWon ? -0.1 : -0.02)));
  }
  if (b.reaperCapitalLost > 0) for (const fs of Object.values(state.factions)) fs.morale = Math.min(1, fs.morale + 0.03 * b.reaperCapitalLost);
  state.pending = undefined;
  state.warAssets = computeWarAssets(state);
}

/** Resolve an engagement with the headless simulation. */
export function autoResolve(state: CampaignState, pending: PendingEngagement): BattleResult {
  const cfg = buildEngagement(state, pending);
  const sim = new BattleSimulation(cfg);
  const result = sim.run();
  applyEngagementResult(state, pending, result);
  return result;
}

function detectEngagement(state: CampaignState): PendingEngagement | undefined {
  for (const s of SYSTEMS) {
    const here = fleetsAt(state, s.id);
    const allied = here.filter((f) => f.allegiance === 'allied');
    const hostile = here.filter((f) => f.allegiance === 'reaper' || f.allegiance === 'cerberus');
    if (allied.length === 0 || hostile.length === 0) continue;
    // Cerberus (hostile) and Reapers do not cooperate; Reapers take precedence.
    const reapers = hostile.filter((f) => f.allegiance === 'reaper');
    const enemy = reapers.length > 0 ? reapers : hostile;
    return { system: s.id, alliedFleetIds: allied.map((f) => f.id), reaperFleetIds: enemy.map((f) => f.id), playerInvolved: allied.some((f) => f.playerControlled) };
  }
  // Cerberus vs Reapers when hostile to both? Treated as mutual avoidance in v1.
  return undefined;
}

// ----------------------------------------------------------------- AI

function reaperAi(state: CampaignState, rng: Rng): void {
  const competence = state.reaper.competence;
  for (const f of state.fleets) {
    if (f.allegiance !== 'reaper' || f.destination) continue;
    const here = state.systems[f.location];
    const sys = getSystem(f.location);
    // Keep harvesting a populated system until it is broken.
    if (here.controller !== 'reaper' || (here.reaperPresence < 1 && sys.population > 2)) {
      if (fleetsAt(state, f.location).some((x) => x.allegiance === 'allied')) continue; // engagement will resolve
      if (here.reaperPresence < 1 && sys.population > 1) continue;
    }
    // Pick the most valuable reachable target: population weighted by distance, homeworlds first.
    let best: SystemId | undefined;
    let bestScore = -Infinity;
    for (const t of SYSTEMS) {
      if (t.id === f.location) continue;
      const ts = state.systems[t.id];
      if (ts.controller === 'reaper' && ts.reaperPresence >= 1) continue;
      const path = relayPath(f.location, t.id);
      if (path.length < 2) continue;
      const defenders = fleetsAt(state, t.id).filter((x) => x.allegiance === 'allied').reduce((a, x) => a + fleetPoints(x.counts), 0);
      const own = fleetPoints(f.counts);
      const value = t.population * ts.population * (t.homeworldOf ? 1.6 : 1) + t.industry * 0.5;
      // Competent Reapers avoid engagements they would lose; less competent ones blunder in.
      const risk = defenders > own * (0.6 + competence * 0.5) ? 0.25 : 1;
      const score = (value * risk) / Math.pow(path.length - 1, 1.2) + rng.next() * (1.5 - competence);
      if (score > bestScore) {
        bestScore = score;
        best = t.id;
      }
    }
    if (best) {
      const path = relayPath(f.location, best);
      f.route = path.slice(1);
      f.destination = f.route[0];
    }
  }
}

function alliedAi(state: CampaignState, includePlayer: boolean): void {
  const citadelBlocked = state.crucible.complete && (state.systems.widow.controller === 'reaper' || fleetsAt(state, 'widow').some((f) => f.allegiance === 'reaper'));
  if (citadelBlocked && !state.events.some((e) => e.kind === 'crucible' && e.text.includes('final'))) {
    log(state, 'crucible', 'The Crucible is ready but the Citadel is in Reaper hands. All fleets: converge on the Citadel for the final battle.', 'widow');
  }
  for (const f of state.fleets) {
    if (f.allegiance !== 'allied' || f.destination) continue;
    if (citadelBlocked && (includePlayer || !f.playerControlled) && f.location !== 'widow') {
      const path = relayPath(f.location, 'widow');
      if (path.length > 1) {
        f.route = path.slice(1);
        f.destination = f.route[0];
      }
      continue;
    }
    if (f.playerControlled && f.posture === 'defend') continue;
    const home = SYSTEMS.find((s) => s.homeworldOf === f.faction)?.id;
    if (!home) continue;
    const threatened = neighbours(home).some((n) => fleetsAt(state, n).some((x) => x.allegiance === 'reaper')) || fleetsAt(state, home).some((x) => x.allegiance === 'reaper');
    if (f.posture === 'reinforce' && threatened && f.location !== home) {
      const path = relayPath(f.location, home);
      if (path.length > 1) {
        f.route = path.slice(1);
        f.destination = f.route[0];
        log(state, 'move', `${f.name} returns to defend ${getSystem(home).world}.`, home);
      }
    }
  }
  // Hostile Cerberus raids weakly defended allied colonies.
  for (const f of state.fleets) {
    if (f.allegiance !== 'cerberus' || f.destination) continue;
    const candidates = neighbours(f.location).filter((n) => state.systems[n].controller === 'allied' && !fleetsAt(state, n).some((x) => x.allegiance === 'allied' && fleetPoints(x.counts) > fleetPoints(f.counts) * 0.8));
    if (candidates.length > 0 && state.tick % 4 === 0) {
      f.route = [candidates[0]];
      f.destination = candidates[0];
    }
  }
}

// --------------------------------------------------------------- tick

export interface TickResult {
  /** An engagement needs the player's decision before the tick can finish. */
  pending?: PendingEngagement;
  autoResolved: BattleResult[];
}

/**
 * Advance one week. If `fightInteractively` returns true for an engagement,
 * the tick pauses with `state.pending` set; call `resumeTick` after the
 * battle has been applied.
 */
export function advanceTick(state: CampaignState, opts: { interactive: boolean }): TickResult {
  if (state.outcome) return { autoResolved: [] };
  const rng = new Rng(state.seed + state.tick * 1000003);
  state.tick++;
  // Movement.
  for (const f of state.fleets) {
    if (!f.destination) continue;
    f.location = f.destination;
    f.route = f.route?.slice(1);
    f.destination = f.route && f.route.length > 0 ? f.route[0] : undefined;
    if (!f.destination) log(state, 'arrival', `${f.name} arrives at ${getSystem(f.location).name}.`, f.location);
  }
  reaperAi(state, rng);
  alliedAi(state, !opts.interactive);
  return resolvePhase(state, opts);
}

/** Withdraw the player's fleets from a pending engagement instead of fighting. */
export function withdrawFromEngagement(state: CampaignState, pending: PendingEngagement): void {
  for (const id of pending.alliedFleetIds) {
    const f = getFleet(state, id);
    if (!f || !f.playerControlled) continue;
    const escape = neighbours(pending.system).find((n) => state.systems[n].controller === 'allied' && !fleetsAt(state, n).some((x) => x.allegiance === 'reaper')) ?? neighbours(pending.system).find((n) => !fleetsAt(state, n).some((x) => x.allegiance === 'reaper'));
    if (escape) {
      f.location = escape;
      f.route = undefined;
      f.destination = undefined;
      f.readiness = Math.max(0.5, f.readiness - 0.1);
      log(state, 'move', `${f.name} withdraws from ${getSystem(pending.system).world} to ${getSystem(escape).name}.`, escape);
    }
  }
  state.pending = undefined;
}

/** AI fleet preservation: AI-run fleets refuse hopeless engagements. */
function preservationWithdrawals(state: CampaignState, includePlayer: boolean): void {
  // Once the Crucible is complete the fleets stand and fight for the Citadel.
  const finalPush = state.crucible.complete;
  for (const s of SYSTEMS) {
    if (finalPush && s.id === 'widow') continue;
    const here = fleetsAt(state, s.id);
    const reapers = here.filter((f) => f.allegiance === 'reaper');
    if (reapers.length === 0) continue;
    const allied = here.filter((f) => f.allegiance === 'allied' && (includePlayer || !f.playerControlled));
    if (allied.length === 0) continue;
    const reaperPower = reapers.reduce((a, f) => a + fleetPoints(f.counts), 0);
    const alliedPower = here.filter((f) => f.allegiance === 'allied').reduce((a, f) => a + fleetPoints(f.counts), 0) + s.defence * state.systems[s.id].defence * 100;
    const competence = 0.8 + 0.4 * state.rules.strategic.alliedCoordination;
    // Technology changes what a point of fleet value is worth against Reapers.
    const t = state.rules.organic;
    const techFactor = t.massAcceleratorDamage * t.kineticBarrierStrength * t.armourStrength * (state.rules.special.hyperMassAccelerators ? 2 : 1) * (state.rules.special.hadesRounds ? 1.5 : 1);
    if (reaperPower > alliedPower * techFactor * 2.2 * competence) {
      for (const f of allied) {
        const escape = neighbours(s.id).find((n) => state.systems[n].controller === 'allied' && !fleetsAt(state, n).some((x) => x.allegiance === 'reaper'));
        if (!escape) continue;
        f.location = escape;
        f.route = undefined;
        f.destination = undefined;
        log(state, 'move', `${f.name} falls back from ${s.world} to ${getSystem(escape).name} rather than face the harvest fleet.`, escape);
      }
    }
  }
}

/** Resolve engagements, then run the economy. Re-entered after a player battle. */
export function resolvePhase(state: CampaignState, opts: { interactive: boolean }): TickResult {
  const autoResolved: BattleResult[] = [];
  preservationWithdrawals(state, !opts.interactive);
  for (let guard = 0; guard < 12; guard++) {
    const eng = detectEngagement(state);
    if (!eng) break;
    if (opts.interactive && eng.playerInvolved) {
      state.pending = eng;
      return { pending: eng, autoResolved };
    }
    autoResolved.push(autoResolve(state, eng));
  }
  economyPhase(state);
  checkOutcome(state);
  return { autoResolved };
}

function economyPhase(state: CampaignState): void {
  const rules = state.rules;
  // Harvest.
  for (const s of SYSTEMS) {
    const st = state.systems[s.id];
    const reapersHere = fleetsAt(state, s.id).filter((f) => f.allegiance === 'reaper');
    if (reapersHere.length > 0 && !fleetsAt(state, s.id).some((f) => f.allegiance === 'allied')) {
      const power = Math.min(2, reapersHere.reduce((a, f) => a + fleetPoints(f.counts), 0) / 8000);
      st.reaperPresence = Math.min(1, st.reaperPresence + 0.15 * power);
      st.population = Math.max(0, st.population - 0.03 * power);
      st.industry = Math.max(0, st.industry - 0.06 * power);
      st.defence = Math.max(0, st.defence - 0.3);
      if (st.controller !== 'reaper' && st.reaperPresence >= 0.5) {
        st.controller = 'reaper';
        log(state, 'harvest', `${s.world} has fallen under Reaper occupation.`, s.id);
        if (s.homeworldOf) state.factions[s.homeworldOf].morale = Math.max(0.1, state.factions[s.homeworldOf].morale - 0.25);
      }
    } else if (st.controller === 'reaper' && reapersHere.length === 0 && !fleetsAt(state, s.id).some((f) => f.allegiance === 'allied')) {
      // Ground harvest continues under occupation even without a fleet in orbit.
      st.population = Math.max(0, st.population - 0.012 * st.reaperPresence);
      st.industry = Math.max(0, st.industry - 0.01);
    } else if (st.controller === 'reaper' && reapersHere.length === 0 && fleetsAt(state, s.id).some((f) => f.allegiance === 'allied')) {
      st.controller = 'allied';
      st.reaperPresence = Math.max(0, st.reaperPresence - 0.5);
      log(state, 'political', `${s.world} liberated.`, s.id);
    }
    // Indoctrination pressure near Reapers.
    const near = reapersHere.length > 0 || neighbours(s.id).some((n) => fleetsAt(state, n).some((f) => f.allegiance === 'reaper'));
    const indoct = rules.special.indoctrinationDisabled ? 0 : rules.strategic.indoctrinationEffectiveness;
    st.indoctrination = Math.max(0, Math.min(1, st.indoctrination + (near ? 0.04 * indoct : -0.02)));
    // Slow repair when safe.
    if (st.controller === 'allied' && !near) {
      st.industry = Math.min(1, st.industry + 0.02);
      st.defence = Math.min(1, st.defence + 0.03);
    }
  }
  // Production.
  for (const f of Object.keys(FACTIONS) as FactionId[]) {
    const table = PRODUCTION[f];
    if (!table) continue;
    const fs = state.factions[f];
    const owns = SYSTEMS.filter((s) => (s.owner === f || (f === 'turian' && s.owner === 'council')) && state.systems[s.id].controller === 'allied');
    const output = owns.reduce((a, s) => a + s.industry * state.systems[s.id].industry, 0);
    const mult = rules.fleetStrength[f] * (0.6 + 0.4 * fs.morale) * 3.2;
    fs.productionPool += output * mult;
    const hasFleet = state.fleets.some((x) => x.faction === f && x.allegiance === 'allied');
    if (!hasFleet && f !== 'cerberus') continue;
    let built = 0;
    for (let guard = 0; guard < 6; guard++) {
      const total = table.reduce((a, t) => a + t.weight, 0);
      let pick = (fs.built * 7919) % total;
      let chosen = table[0];
      for (const t of table) {
        if (pick < t.weight) {
          chosen = t;
          break;
        }
        pick -= t.weight;
      }
      const cost = getShipClass(chosen.classId).pointValue * 4;
      if (fs.productionPool < cost) break;
      fs.productionPool -= cost;
      // Deliver to the faction's fleet at its homeworld, else its strongest fleet.
      const home = SYSTEMS.find((s) => s.homeworldOf === f)?.id;
      const target = state.fleets.filter((x) => x.faction === f && x.allegiance === 'allied').sort((a, b) => (a.location === home ? -1 : 1) - (b.location === home ? -1 : 1) || fleetPoints(b.counts) - fleetPoints(a.counts))[0];
      if (!target) break;
      target.counts[chosen.classId] = (target.counts[chosen.classId] ?? 0) + 1;
      fs.built++;
      built++;
    }
    if (built > 0) log(state, 'production', `${FACTIONS[f].shortName} shipyards deliver ${built} new hull${built > 1 ? 's' : ''}.`);
  }
  // Readiness recovery.
  for (const f of state.fleets) f.readiness = Math.min(1, f.readiness + (f.destination ? 0.05 : 0.12));
  // Reaper reinforcements.
  if (state.reaper.reinforcementPool > 0 && state.tick % 6 === 0) {
    state.reaper.reinforcementPool--;
    const n = state.rules.strategic.reaperReinforcements;
    state.fleets.push({ id: `f${state.nextFleetId++}`, name: `Reaper reinforcement group ${state.tick / 6}`, faction: 'reaper', allegiance: 'reaper', location: 'hades_gamma', counts: { reaper_capital: Math.max(1, Math.round(2 * n)), reaper_destroyer: Math.max(2, Math.round(5 * n)) }, readiness: 1, playerControlled: false, posture: 'offensive' });
    log(state, 'arrival', 'Reaper reinforcements arrive from dark space.', 'hades_gamma');
  }
  // Crucible.
  if (state.crucible.available && !state.crucible.complete) {
    const industry = SYSTEMS.filter((s) => state.systems[s.id].controller === 'allied').reduce((a, s) => a + s.industry * state.systems[s.id].industry, 0);
    const rate = (industry / 60) * 0.052 * (0.7 + 0.3 * rules.strategic.alliedCoordination) * (0.9 + 0.1 * rules.strategic.shepardEffectiveness);
    state.crucible.progress = Math.min(1, state.crucible.progress + rate);
    if (state.crucible.progress >= 1) {
      state.crucible.complete = true;
      log(state, 'crucible', 'The Crucible is complete. It must reach the Citadel.', 'widow');
    }
  }
  // Cooperation grows with shared victories and time.
  for (const f of Object.values(state.factions)) f.cooperation = Math.min(1, f.cooperation + 0.01 * rules.strategic.alliedCoordination);
  state.warAssets = computeWarAssets(state);
}

function checkOutcome(state: CampaignState): void {
  if (state.outcome) return;
  const rules = state.rules;
  const reaperValue = reaperFleetValue(state);
  const alliedValue = state.fleets.filter((f) => f.allegiance === 'allied').reduce((a, f) => a + fleetPoints(f.counts), 0);
  // Crucible victory: Crucible complete and the Citadel in allied hands (or no Reaper fleet there).
  if (state.crucible.complete && !state.crucible.docked) {
    const citadel = state.systems.widow;
    const reapersAtCitadel = fleetsAt(state, 'widow').some((f) => f.allegiance === 'reaper');
    if (citadel.controller !== 'reaper' && !reapersAtCitadel) {
      state.crucible.docked = true;
      state.outcome = { kind: 'victory', reason: 'The Crucible docked with the Citadel and fired. The Reaper War is over — on the Crucible’s terms.', tick: state.tick };
      log(state, 'victory', state.outcome.reason, 'widow');
      return;
    }
  }
  // Conventional victory.
  if (reaperValue === 0 && state.reaper.reinforcementPool === 0) {
    state.outcome = { kind: 'victory', reason: rules.strategic.conventionalVictoryPossible ? 'Every Reaper committed to the galaxy has been destroyed by conventional force. The Refuse is successful.' : 'The committed Reaper fleets have been destroyed.', tick: state.tick };
    log(state, 'victory', state.outcome.reason);
    return;
  }
  // Defeat: both major homeworlds harvested, or allied fleets gone.
  const earth = state.systems.sol;
  const palaven = state.systems.trebia;
  if ((earth.population < 0.12 && palaven.population < 0.12) || (alliedValue < 200 && state.tick > 4)) {
    state.outcome = { kind: 'defeat', reason: earth.population < 0.15 && palaven.population < 0.15 ? 'Earth and Palaven have been harvested. The cycle continues.' : 'The allied fleets have been annihilated.', tick: state.tick };
    log(state, 'defeat', state.outcome.reason);
    return;
  }
  if (state.tick >= 160) {
    const harvested = SYSTEMS.filter((s) => state.systems[s.id].controller === 'reaper').reduce((a, s) => a + s.population, 0);
    const total = SYSTEMS.reduce((a, s) => a + s.population, 0);
    state.outcome = harvested > total * 0.5 ? { kind: 'defeat', reason: 'Three years of war: the harvest is beyond recovery.', tick: state.tick } : { kind: 'victory', reason: 'Three years of war: the Reapers have failed to complete the harvest and withdraw to regroup.', tick: state.tick };
    log(state, state.outcome.kind, state.outcome.reason);
  }
}

/** Reaper strategic assessment derived from campaign state. */
export function campaignReaperAssessment(state: CampaignState): { headline: string; lines: string[]; threat: string } {
  const reaperValue = reaperFleetValue(state);
  const lost = state.reaper.lostValue;
  const frac = lost / Math.max(1, lost + reaperValue);
  const harvested = SYSTEMS.filter((s) => state.systems[s.id].controller === 'reaper').length;
  let threat = 'NEGLIGIBLE';
  if (frac > 0.6) threat = 'CRITICAL';
  else if (frac > 0.4) threat = 'SEVERE';
  else if (frac > 0.25) threat = 'ELEVATED';
  else if (frac > 0.1) threat = 'MODERATE';
  else if (frac > 0.03) threat = 'LOW';
  const headline = frac < 0.05 ? 'HARVEST PROCEEDING WITHIN EXPECTED PARAMETERS.' : frac < 0.25 ? 'UNIT LOSSES RECORDED. HARVEST CONTINUES.' : frac < 0.5 ? 'CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS.' : 'ORGANIC MILITARY DEVELOPMENT REQUIRES STRATEGIC RE-EVALUATION.';
  const lines = [
    `Systems under harvest: ${harvested} of ${SYSTEMS.length}.`,
    `Committed force lost: ${(frac * 100).toFixed(0)}%.`,
    `Reinforcement groups remaining: ${state.reaper.reinforcementPool}.`,
    state.crucible.available ? `Organic superweapon construction detected: ${(state.crucible.progress * 100).toFixed(0)}%.` : 'No organic superweapon detected.',
  ];
  return { headline, lines, threat };
}

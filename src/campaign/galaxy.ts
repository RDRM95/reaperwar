import type { FactionId } from '@/data/types';
import type { Environment } from '@/simulation/types';

/**
 * Galaxy map for the 2186 campaign. Positions are map coordinates (0..100)
 * laid out to resemble the trilogy's galaxy map; relay links follow the
 * established corridors where the games make them explicit and are
 * labelled SIMULATION_ESTIMATE where they do not. Figures for industry and
 * population are abstract indices, not canon numbers.
 */

export type SystemId =
  | 'sol'
  | 'arcturus'
  | 'exodus'
  | 'horizon'
  | 'trebia'
  | 'widow'
  | 'athena'
  | 'annos'
  | 'krogan_dmz'
  | 'tikkun'
  | 'omega'
  | 'tasale'
  | 'kite_nest'
  | 'pax'
  | 'hades_gamma';

export interface StarSystem {
  id: SystemId;
  name: string;
  region: string;
  /** Prominent world in the system. */
  world: string;
  owner: FactionId | 'council' | 'terminus' | 'batarian';
  homeworldOf?: FactionId;
  x: number;
  y: number;
  /** Industrial output index (ship production per tick scales with it). */
  industry: number;
  /** Population index (harvest value for the Reapers). */
  population: number;
  /** Orbital defence strength index (adds static defence to battles). */
  defence: number;
  environment: Environment;
  /** Provenance note shown in the UI. */
  note: string;
  canonRole: string;
}

export const SYSTEMS: StarSystem[] = [
  { id: 'sol', name: 'Sol', region: 'Local Cluster', world: 'Earth', owner: 'alliance', homeworldOf: 'alliance', x: 50, y: 62, industry: 10, population: 10, defence: 6, environment: 'earth_orbit', note: 'Canon: first major Reaper target after the batarians; Alliance fleets withdraw.', canonRole: 'Invaded in the opening of the war.' },
  { id: 'arcturus', name: 'Arcturus', region: 'Arcturus Stream', world: 'Arcturus Station', owner: 'alliance', x: 42, y: 54, industry: 6, population: 2, defence: 5, environment: 'deep_space', note: 'Canon: Alliance Parliament and fleet headquarters, destroyed by the Reapers.', canonRole: 'Falls before Earth.' },
  { id: 'exodus', name: 'Utopia', region: 'Exodus Cluster', world: 'Eden Prime', owner: 'alliance', x: 36, y: 66, industry: 3, population: 3, defence: 2, environment: 'deep_space', note: 'Canon colony; Prothean discovery site.', canonRole: 'Colony under Cerberus and Reaper pressure.' },
  { id: 'horizon', name: 'Iera', region: 'Shadow Sea', world: 'Horizon', owner: 'alliance', x: 30, y: 46, industry: 2, population: 2, defence: 1, environment: 'deep_space', note: 'Canon colony; Sanctuary facility.', canonRole: 'Cerberus operations.' },
  { id: 'trebia', name: 'Trebia', region: 'Apien Crest', world: 'Palaven', owner: 'turian', homeworldOf: 'turian', x: 60, y: 40, industry: 9, population: 9, defence: 7, environment: 'palaven_orbit', note: 'Canon: under full Reaper assault; Menae holds.', canonRole: 'Invaded early in the war.' },
  { id: 'widow', name: 'Widow', region: 'Serpent Nebula', world: 'The Citadel', owner: 'council', x: 52, y: 48, industry: 7, population: 8, defence: 8, environment: 'citadel', note: 'Canon: seat of the Council; the Reapers seize it late in the war.', canonRole: 'Political centre; Crucible docking point.' },
  { id: 'athena', name: 'Athena Nebula', region: 'Athena Nebula', world: 'Thessia', owner: 'asari', homeworldOf: 'asari', x: 66, y: 56, industry: 8, population: 9, defence: 6, environment: 'thessia_orbit', note: 'Canon: falls to the Reapers mid-war.', canonRole: 'Invaded mid-war.' },
  { id: 'annos', name: 'Annos Basin', region: 'Annos Basin', world: "Sur'Kesh", owner: 'salarian', homeworldOf: 'salarian', x: 74, y: 44, industry: 7, population: 7, defence: 5, environment: 'surkesh_orbit', note: 'Canon: salarian homeworld; spared heavy assault in the game timeframe.', canonRole: 'Intelligence and R&D.' },
  { id: 'krogan_dmz', name: 'Aralakh', region: 'Krogan DMZ', world: 'Tuchanka', owner: 'council', x: 62, y: 72, industry: 2, population: 5, defence: 2, environment: 'deep_space', note: 'Canon: krogan homeworld; Reaper ground forces present.', canonRole: 'Genophage cure; krogan ground armies.' },
  { id: 'tikkun', name: 'Tikkun', region: 'Perseus Veil', world: 'Rannoch', owner: 'geth', homeworldOf: 'quarian', x: 82, y: 58, industry: 6, population: 3, defence: 4, environment: 'rannoch_orbit', note: 'Canon: geth–quarian war; outcome player dependent.', canonRole: 'Geth and quarian fleets.' },
  { id: 'omega', name: 'Sahrabarik', region: 'Omega Nebula', world: 'Omega', owner: 'terminus', x: 78, y: 76, industry: 4, population: 5, defence: 3, environment: 'deep_space', note: 'Canon: Terminus hub; Cerberus occupation.', canonRole: 'Terminus Systems.' },
  { id: 'tasale', name: 'Tasale', region: 'Crescent Nebula', world: 'Illium', owner: 'asari', x: 72, y: 66, industry: 5, population: 5, defence: 2, environment: 'deep_space', note: 'Canon: asari trade world outside Council space.', canonRole: 'Commerce.' },
  { id: 'kite_nest', name: "Kite's Nest", region: 'Batarian space', world: "Khar'shan", owner: 'batarian', x: 44, y: 34, industry: 3, population: 6, defence: 2, environment: 'deep_space', note: 'Canon: first systems hit by the Reapers in 2186.', canonRole: 'Entry point of the invasion.' },
  { id: 'pax', name: 'Pax', region: 'Horse Head Nebula', world: 'Noveria', owner: 'council', x: 36, y: 38, industry: 4, population: 1, defence: 1, environment: 'deep_space', note: 'Canon corporate research world.', canonRole: 'Research.' },
  { id: 'hades_gamma', name: 'Hades Gamma', region: 'Hades Gamma', world: 'Relay corridor', owner: 'council', x: 56, y: 30, industry: 1, population: 1, defence: 1, environment: 'relay', note: 'SIMULATION_ESTIMATE: relay corridor used as the Reaper staging route.', canonRole: 'Staging corridor (simulation).' },
];

/** Relay links. Each pair is a corridor fleets move along in one tick. */
export const RELAYS: [SystemId, SystemId][] = [
  ['sol', 'arcturus'],
  ['arcturus', 'exodus'],
  ['arcturus', 'widow'],
  ['arcturus', 'horizon'],
  ['exodus', 'horizon'],
  ['horizon', 'pax'],
  ['pax', 'kite_nest'],
  ['kite_nest', 'hades_gamma'],
  ['hades_gamma', 'trebia'],
  ['hades_gamma', 'widow'],
  ['trebia', 'widow'],
  ['trebia', 'annos'],
  ['widow', 'athena'],
  ['widow', 'sol'],
  ['athena', 'annos'],
  ['athena', 'tasale'],
  ['athena', 'krogan_dmz'],
  ['sol', 'krogan_dmz'],
  ['tasale', 'tikkun'],
  ['tasale', 'omega'],
  ['annos', 'tikkun'],
  ['krogan_dmz', 'omega'],
];

export const getSystem = (id: SystemId): StarSystem => {
  const s = SYSTEMS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system ${id}`);
  return s;
};

export const neighbours = (id: SystemId): SystemId[] =>
  RELAYS.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));

/** Breadth-first relay path between two systems. */
export function relayPath(from: SystemId, to: SystemId): SystemId[] {
  if (from === to) return [from];
  const prev = new Map<SystemId, SystemId>();
  const queue: SystemId[] = [from];
  const seen = new Set<SystemId>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbours(cur)) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path: SystemId[] = [to];
        let p: SystemId | undefined = to;
        while ((p = prev.get(p)) !== undefined) path.unshift(p);
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

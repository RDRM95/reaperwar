/**
 * Apex scenario scale figures (ADOPTION_PLAN.md §13.2; PACK_ADOPTION.md §3e).
 *
 * Captions and strategic counters only — never simulated hulls, never canon.
 * Only Apex scenarios (`isApexScenario(rules)`) reference these numbers, and
 * every caption that carries one ends in `· AU SCENARIO VALUE`.
 */
export interface ScaleFigure {
  value: number;
  label: string;
  provenance: 'AU_MODIFIED';
  note: string;
}

export const APEX_SCALE = {
  coalition: {
    mobileWarships: 38420,
    fixedPlatforms: 612,
    heavyMobileCombatants: 1287,
    embarkedCraftNominal: 25536,
    /** Class columns: dreadnoughts, carriers, heavy cruisers, cruisers, frigates, corvettes. */
    classColumns: ['dreadnoughts', 'carriers', 'heavyCruisers', 'cruisers', 'frigates', 'corvettes'] as const,
    byCommand: [
      { id: 'alliance', name: 'Systems Alliance', counts: [48, 144, 240, 1360, 7008, 4000], warships: 12800 },
      { id: 'turian', name: 'Turian Hierarchy', counts: [120, 80, 280, 920, 4000, 1800], warships: 7200 },
      { id: 'asari', name: 'Asari commands', counts: [60, 40, 120, 680, 2600, 1400], warships: 4900 },
      { id: 'salarian', name: 'Salarian Union', counts: [32, 80, 64, 424, 1800, 1200], warships: 3600 },
      { id: 'quarian_geth', name: 'Quarian and geth joint command', counts: [48, 96, 110, 546, 2000, 1000], warships: 3800 },
      { id: 'krogan', name: 'Krogan assault and escort command', counts: [0, 40, 20, 180, 1200, 960], warships: 2400 },
      { id: 'batarian', name: 'Batarian survivor commands', counts: [20, 20, 50, 310, 1000, 500], warships: 1900 },
      { id: 'other', name: 'Other coalition members', counts: [7, 20, 30, 243, 600, 500], warships: 1400 },
      { id: 'cerberus', name: 'Cerberus Black Fleet', counts: [12, 12, 26, 70, 200, 100], warships: 420 },
    ],
    classTotals: [347, 532, 940, 4733, 20408, 11460],
    alliance: { allHulls: 15292, warships: 13292, support: 2000, committedToSol: 12800, elsewhere: 492, administrativeFleets: 16 },
  },
  reaper: {
    initial: { capital: 2000, destroyer: 40000, transport: 8000, processor: 3000 }, // 53,000
    alphaLossFraction: 0.25,
    postAlpha: { capital: 1500, destroyer: 30000, transport: 6000, processor: 2250 }, // 39,750
    regionalLossesBeforeSol: { capital: 420, destroyer: 8500, transport: 500, processor: 200 },
    committedToSol: { capital: 480, destroyer: 12000, transport: 1800, processor: 750 }, // 12,480 combat + 2,550
    activeElsewhere: { capital: 600, destroyer: 9500, transport: 3700, processor: 1300 },
  },
  storyTargets: { coalitionLossFraction: [0.15, 0.35], breakOrbitalControlDays: [1, 3], liberation: 'weeks', pursuit: 'months' },
  provenance: 'AU_MODIFIED' as const,
  note: 'Apex scenario values from the user-supplied reference pack. Captions and strategic counters only; never simulated hulls. Not canon.',
} as const;

export const AU_SCENARIO_SUFFIX = '· AU SCENARIO VALUE';

/** Deterministic thousands separator (no locale dependency). */
export const formatCount = (n: number): string => {
  const s = Math.round(Math.abs(n)).toString();
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${out}` : out;
};

/** Reaper combat units committed to Sol (capitals + destroyers; transports and processors are not warships). */
export const APEX_REAPER_COMBAT_AT_SOL = APEX_SCALE.reaper.committedToSol.capital + APEX_SCALE.reaper.committedToSol.destroyer;

/**
 * The AP §15 caption strings. Every one ends in `· AU SCENARIO VALUE`; the
 * simulated count is the live-hull count the caller passes in.
 */
export function apexCaption(kind: 'warships' | 'platforms' | 'reapers', simulated: number): string {
  const n = formatCount(Math.max(0, Math.round(simulated)));
  switch (kind) {
    case 'warships':
      return `${formatCount(APEX_SCALE.coalition.mobileWarships)} WARSHIPS COMMITTED TO SOL · ${n} SIMULATED, REST STATISTICAL ${AU_SCENARIO_SUFFIX}`;
    case 'platforms':
      return `${formatCount(APEX_SCALE.coalition.fixedPlatforms)} DEFENCE PLATFORMS — SOL NETWORK · ${n} SIMULATED ${AU_SCENARIO_SUFFIX}`;
    case 'reapers':
      return `${formatCount(APEX_REAPER_COMBAT_AT_SOL)} REAPER COMBAT UNITS COMMITTED TO SOL · ${n} SIMULATED, REST STATISTICAL ${AU_SCENARIO_SUFFIX}`;
  }
}

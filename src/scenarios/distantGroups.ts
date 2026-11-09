import { APEX_SCALE } from '@/data/apexScale';
import { SHIP_CLASSES } from '@/data/ships';
import { isCapitalRole, type FactionId } from '@/data/types';
import { isApexScenario, type RuleSet } from '@/timelines/rules';
import type { DistantGroup, DistantLayerConfig, FleetSpec, Side } from '@/simulation/types';

/**
 * Distant-layer groups (ADOPTION_PLAN.md §13.3, §21.4; CINEMATIC_DESIGN.md §5.1; WORK_BREAKDOWN.md §1.3.9, T15): what
 * the live battle does not field, by group. Under the Apex scenarios (`isApexScenario`, never `isApexRules`: a
 * player-made rule set with the Apex flags does not inherit the Apex figures) the coalition commands and the Reaper
 * forces committed to Sol come from `APEX_SCALE` minus the simulated hulls; under every other rule set each real
 * fleet gets an extrapolated echelon of `12 ×` its simulated hulls, shown as percentages only (no canon source gives a
 * hull count); the campaign remainder (`remainderGroups`) carries the hulls `buildEngagement` compresses away. Pure and
 * deterministic: geometry from indices, no randomness.
 *
 * Geometry (compressed km, the battlespace frame): `bearingDeg` 0 = +z (towards side B's start), 90 = +x; each side's
 * groups fan out ±70° behind its real line at 60–160 km.
 */

/** Simulated non-fighter hulls per side and faction (the subtrahend of the Apex groups). */
export type SimulatedBySide = Record<Side, Partial<Record<FactionId, number>>>;

/** The extrapolation factor of the non-Apex layer: each real fleet stands for this many times its hulls (AP §13.3). */
export const CANON_DISTANT_FACTOR = 12;

const FAN_DEG = 70;
const MIN_KM = 60;
const MAX_KM = 160;
const GOLDEN = 0.6180339887;

/** Bearing and distance of the i-th of n groups of a side (deterministic fan behind the side's line). */
function placement(side: Side, i: number, n: number): { bearingDeg: number; distanceKm: number } {
  const behind = side === 'A' ? 180 : 0;
  const off = n <= 1 ? 0 : -FAN_DEG + (2 * FAN_DEG * (i + 0.5)) / n;
  const bearingDeg = (((behind + off) % 360) + 360) % 360;
  const distanceKm = MIN_KM + (MAX_KM - MIN_KM) * ((i * GOLDEN) % 1);
  return { bearingDeg, distanceKm };
}

/** A group's visual spread grows with its count (compressed km, 6–30). */
const spreadFor = (count: number): number => Math.min(30, Math.max(6, 6 + Math.cbrt(Math.max(0, count)) * 0.8));

type Mix = DistantGroup['classMix'];
const normalise = (m: Mix): Mix => {
  const t = m.capital + m.heavy + m.line + m.light;
  return t > 0 ? { capital: m.capital / t, heavy: m.heavy / t, line: m.line / t, light: m.light / t } : { capital: 0, heavy: 0, line: 1, light: 0 };
};

/** Class mix of a composition by class id: capitals (and carriers), heavy cruisers, the line, the light hulls. */
export function classMixOf(counts: Record<string, number>): Mix {
  const m: Mix = { capital: 0, heavy: 0, line: 0, light: 0 };
  for (const [id, n] of Object.entries(counts)) {
    const cls = SHIP_CLASSES[id];
    if (!cls || n <= 0 || cls.role === 'fighter' || cls.role === 'fixed_platform') continue;
    if (isCapitalRole(cls.role) || cls.role === 'carrier') m.capital += n;
    else if (cls.role === 'cruiser' && id.includes('heavy')) m.heavy += n;
    else if (cls.role === 'cruiser' || cls.role === 'reaper_destroyer') m.line += n;
    else m.light += n;
  }
  return normalise(m);
}

/** Non-fighter hulls of a fleet spec (platforms included: they are simulated hulls of the side). */
const hullsOf = (f: FleetSpec): number => f.ships.reduce((a, s) => (SHIP_CLASSES[s.classId]?.role === 'fighter' ? a : a + s.count), 0);

/** Simulated non-fighter hulls per side and faction of a list of fleet specs. */
export function simulatedBySide(fleets: readonly FleetSpec[]): SimulatedBySide {
  const out: SimulatedBySide = { A: {}, B: {} };
  for (const f of fleets) out[f.side][f.faction] = (out[f.side][f.faction] ?? 0) + hullsOf(f);
  return out;
}

/** The coalition commands of `APEX_SCALE` and the simulated factions each one stands behind. */
const COMMAND_FACTIONS: Record<string, { faction: FactionId; simulated: FactionId[] }> = {
  alliance: { faction: 'alliance', simulated: ['alliance'] },
  turian: { faction: 'turian', simulated: ['turian'] },
  asari: { faction: 'asari', simulated: ['asari'] },
  salarian: { faction: 'salarian', simulated: ['salarian'] },
  quarian_geth: { faction: 'quarian', simulated: ['quarian', 'geth'] },
  // No simulated counterpart: drawn with a neutral organic drive colour; the label carries the identity.
  krogan: { faction: 'alliance', simulated: [] },
  batarian: { faction: 'alliance', simulated: [] },
  other: { faction: 'alliance', simulated: [] },
  cerberus: { faction: 'cerberus', simulated: ['cerberus'] },
};

/** The Reaper remainder is split into this many echelons (visual spread only; the totals are the AU figures). */
export const APEX_REAPER_ECHELONS = 4;

/**
 * The Apex Sol groups (AU scenario values): one per coalition command — `warships` minus the simulated hulls of its
 * factions on side A, class mix from the command's columns — and the Reaper combat units committed to Sol (480
 * capitals + 12,000 destroyers; transports and processors are not combatants and stay in the caption) minus the
 * simulated Reaper hulls on side B, in four echelons. Counts never go below zero.
 */
export function apexDistantGroups(simulated: SimulatedBySide): DistantGroup[] {
  const groups: DistantGroup[] = [];
  const commands = APEX_SCALE.coalition.byCommand;
  commands.forEach((c, i) => {
    const map = COMMAND_FACTIONS[c.id];
    const sim = map.simulated.reduce((a, f) => a + (simulated.A[f] ?? 0), 0);
    const [dn, cv, hc, ca, ff, cor] = c.counts;
    groups.push({
      id: `apex-${c.id}`,
      side: 'A',
      faction: map.faction,
      label: c.name,
      count: Math.max(0, c.warships - sim),
      ...placement('A', i, commands.length),
      spreadKm: spreadFor(c.warships),
      classMix: normalise({ capital: dn + cv, heavy: hc, line: ca, light: ff + cor }),
    });
  });
  const sol = APEX_SCALE.reaper.committedToSol;
  const total = Math.max(0, sol.capital + sol.destroyer - (simulated.B.reaper ?? 0));
  const mix = normalise({ capital: sol.capital, heavy: 0, line: sol.destroyer, light: 0 });
  for (let i = 0; i < APEX_REAPER_ECHELONS; i++) {
    const share = Math.floor(total / APEX_REAPER_ECHELONS) + (i < total % APEX_REAPER_ECHELONS ? 1 : 0);
    groups.push({ id: `apex-reaper-${i + 1}`, side: 'B', faction: 'reaper', label: `Reaper forces committed to Sol, echelon ${i + 1}`, count: share, ...placement('B', i, APEX_REAPER_ECHELONS), spreadKm: spreadFor(share), classMix: mix });
  }
  return groups;
}

/**
 * The non-Apex layer: one extrapolated echelon per real fleet, `factor ×` its simulated hulls (default 12), behind
 * that fleet's side. Shown as percentages only. Static fleets (platforms) and rogue groups have no distant echelon.
 */
export function canonDistantGroups(fleets: readonly FleetSpec[], factor = CANON_DISTANT_FACTOR): DistantGroup[] {
  const groups: DistantGroup[] = [];
  for (const side of ['A', 'B'] as const) {
    // Platforms have no distant echelon, and neither has a rogue group (hostile to both sides, AP §4.1: it is no
    // vanguard of a larger force on either side).
    const own = fleets.filter((f) => f.side === side && !f.static && !f.rogue && hullsOf(f) > 0 && !f.ships.every((s) => SHIP_CLASSES[s.classId]?.role === 'fixed_platform'));
    own.forEach((f, i) => {
      const count = Math.max(0, Math.round(factor * hullsOf(f)));
      const counts = Object.fromEntries(f.ships.map((s) => [s.classId, s.count]));
      groups.push({ id: `echelon-${f.id}`, side, faction: f.faction, label: `${f.name} — distant echelons`, count, ...placement(side, i, own.length), spreadKm: spreadFor(count), classMix: classMixOf(counts) });
    });
  }
  return groups;
}

/**
 * The campaign remainder (AP §21.4): the hulls `buildEngagement` compressed away from one campaign fleet, as one group
 * (`count = total − simulated`, class mix from the fleet's counts). Empty when nothing was compressed away.
 */
export function remainderGroups(side: Side, faction: FactionId, label: string, total: number, simulated: number, counts: Record<string, number>, index = 0, of = 1): DistantGroup[] {
  const count = Math.max(0, Math.round(total - simulated));
  if (count <= 0) return [];
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [{ id: `remainder-${side}-${faction}-${slug || index}`, side, faction, label: `${label} (beyond the engagement)`, count, ...placement(side, index, Math.max(1, of)), spreadKm: spreadFor(count), classMix: classMixOf(counts) }];
}

/**
 * The layer a scenario fields (AP §4.4: on by default under every preset): the Apex figures under the Apex scenarios
 * (`captions: 'apex'`), the extrapolated echelons with percentages only otherwise (`captions: 'canon'`).
 */
export function distantLayerFor(rules: RuleSet, fleets: readonly FleetSpec[]): DistantLayerConfig {
  return isApexScenario(rules)
    ? { enabled: true, groups: apexDistantGroups(simulatedBySide(fleets)), captions: 'apex', firstLossAfter: 30 }
    : { enabled: true, groups: canonDistantGroups(fleets), captions: 'canon', firstLossAfter: 30 };
}

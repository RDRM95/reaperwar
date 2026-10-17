import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig, BattleResult } from '@/simulation/types';
import { CANON_ME3 } from '@/timelines/presets';
import { TECH_KEYS, type RuleSet } from '@/timelines/rules';

/**
 * Canon vs AU comparison: run the same scenario, seed and fleets under two
 * rule sets and explain which modifiers materially changed the outcome.
 */

export interface ComparisonMetric {
  key: string;
  label: string;
  a: string | number;
  b: string | number;
  /** Positive when B is better for the perspective side. */
  delta?: number;
}

export interface ComparisonReport {
  a: { rules: RuleSet; result: BattleResult; config: BattleConfig };
  b: { rules: RuleSet; result: BattleResult; config: BattleConfig };
  metrics: ComparisonMetric[];
  explanation: string[];
}

export function runBattle(config: BattleConfig): { sim: BattleSimulation; result: BattleResult } {
  const sim = new BattleSimulation(config);
  const result = sim.run();
  return { sim, result };
}

const fmt = (n: number, d = 0): string => n.toLocaleString(undefined, { maximumFractionDigits: d });

export function compareBattles(configA: BattleConfig, configB: BattleConfig): ComparisonReport {
  const ra = runBattle(configA).result;
  const rb = runBattle(configB).result;
  const ps = configA.perspectiveSide;
  const es = ps === 'A' ? 'B' : 'A';
  const sa = ra.sides[ps];
  const sb = rb.sides[ps];
  const ea = ra.sides[es];
  const eb = rb.sides[es];

  const metrics: ComparisonMetric[] = [
    { key: 'outcome', label: 'Outcome', a: ra.outcome.toUpperCase(), b: rb.outcome.toUpperCase() },
    { key: 'duration', label: 'Battle duration (s)', a: fmt(ra.duration), b: fmt(rb.duration) },
    { key: 'deployed', label: 'Ships deployed', a: sa.deployed, b: sb.deployed },
    { key: 'destroyed', label: 'Ships destroyed (ours)', a: sa.destroyed, b: sb.destroyed, delta: sa.destroyed - sb.destroyed },
    { key: 'capital_losses', label: 'Capital ship losses (ours)', a: sa.capitalLost, b: sb.capitalLost, delta: sa.capitalLost - sb.capitalLost },
    { key: 'enemy_destroyed', label: 'Enemy ships destroyed', a: ea.destroyed, b: eb.destroyed, delta: eb.destroyed - ea.destroyed },
    { key: 'reaper_capital_losses', label: 'Reaper capital ships destroyed', a: ea.reaperCapitalLost + sa.reaperCapitalLost, b: eb.reaperCapitalLost + sb.reaperCapitalLost },
    { key: 'reaper_destroyer_losses', label: 'Reaper destroyers destroyed', a: ea.reaperDestroyersLost + sa.reaperDestroyersLost, b: eb.reaperDestroyersLost + sb.reaperDestroyersLost },
    { key: 'damage_dealt', label: 'Damage inflicted', a: fmt(sa.damageDealt), b: fmt(sb.damageDealt), delta: sb.damageDealt - sa.damageDealt },
    { key: 'damage_taken', label: 'Damage received (hull)', a: fmt(sa.damageTaken), b: fmt(sb.damageTaken), delta: sa.damageTaken - sb.damageTaken },
    { key: 'shots', label: 'Rounds / bursts expended', a: fmt(sa.shotsFired), b: fmt(sb.shotsFired) },
    { key: 'accuracy', label: 'Hit rate', a: `${fmt((100 * sa.hits) / Math.max(1, sa.shotsFired))}%`, b: `${fmt((100 * sb.hits) / Math.max(1, sb.shotsFired))}%` },
    { key: 'effectiveness', label: 'Tactical effectiveness (damage per point lost)', a: fmt(sa.tacticalEffectiveness, 1), b: fmt(sb.tacticalEffectiveness, 1), delta: sb.tacticalEffectiveness - sa.tacticalEffectiveness },
    { key: 'objective', label: 'Objective completed', a: ra.objectiveCompleted ? 'YES' : 'NO', b: rb.objectiveCompleted ? 'YES' : 'NO' },
    { key: 'survival', label: 'Fleet survival', a: `${fmt(sa.survivalPercent)}%`, b: `${fmt(sb.survivalPercent)}%`, delta: sb.survivalPercent - sa.survivalPercent },
  ];

  return { a: { rules: configA.rules, result: ra, config: configA }, b: { rules: configB.rules, result: rb, config: configB }, metrics, explanation: explainDifferences(configA.rules, configB.rules, ra, rb) };
}

const TECH_LABEL: Record<string, string> = {
  massAcceleratorDamage: 'mass accelerator damage',
  massAcceleratorPenetration: 'mass accelerator penetration',
  massAcceleratorRange: 'mass accelerator range',
  fireRate: 'rate of fire',
  heatCapacity: 'heat capacity',
  kineticBarrierStrength: 'kinetic barrier strength',
  barrierRegen: 'barrier regeneration',
  armourStrength: 'armour',
  hullIntegrity: 'hull integrity',
  speed: 'speed',
  sensors: 'sensors',
  electronicWarfare: 'electronic warfare',
  accuracy: 'accuracy',
  fighterStrength: 'fighter strength',
  torpedoDamage: 'torpedo damage',
  gardianEffectiveness: 'GARDIAN effectiveness',
  beamDamage: 'beam / stream weapon damage',
  crewQuality: 'crew quality',
};

/** Identify which modifiers differ and rank them by likely impact. */
export function explainDifferences(a: RuleSet, b: RuleSet, ra: BattleResult, rb: BattleResult): string[] {
  const out: string[] = [];
  const changed: { label: string; impact: number; text: string }[] = [];
  const pushTech = (group: 'organic' | 'reaper', key: keyof typeof a.organic) => {
    const va = a[group][key];
    const vb = b[group][key];
    if (Math.abs(va - vb) > 1e-6) {
      const impactWeights: Record<string, number> = { massAcceleratorDamage: 3, massAcceleratorPenetration: 2.5, kineticBarrierStrength: 2.5, armourStrength: 2, hullIntegrity: 2, beamDamage: 2.5, fireRate: 2, accuracy: 1.8, torpedoDamage: 1, gardianEffectiveness: 0.6, fighterStrength: 0.6, speed: 0.5, sensors: 0.5, electronicWarfare: 0.8, barrierRegen: 0.8, heatCapacity: 0.6, crewQuality: 1.2, massAcceleratorRange: 0.8 };
      const impact = Math.abs(vb - va) * (impactWeights[key] ?? 1);
      changed.push({ label: key, impact, text: `${group === 'reaper' ? 'Reaper' : 'Organic'} ${TECH_LABEL[key] ?? key}: ×${va.toFixed(2)} → ×${vb.toFixed(2)}` });
    }
  };
  for (const k of TECH_KEYS) {
    pushTech('organic', k);
    pushTech('reaper', k);
  }
  for (const f of Object.keys({ ...a.factionOverrides, ...b.factionOverrides }) as (keyof typeof a.factionOverrides)[]) {
    const oa = a.factionOverrides[f] ?? {};
    const ob = b.factionOverrides[f] ?? {};
    for (const k of TECH_KEYS) {
      const va = oa[k] ?? a.organic[k];
      const vb = ob[k] ?? b.organic[k];
      if (Math.abs(va - vb) > 1e-6) changed.push({ label: `${f}.${k}`, impact: Math.abs(vb - va) * 1.5, text: `${f} ${TECH_LABEL[k] ?? k}: ×${va.toFixed(2)} → ×${vb.toFixed(2)}` });
    }
  }
  if (a.special.hyperMassAccelerators !== b.special.hyperMassAccelerators) changed.push({ label: 'hyperMA', impact: 4, text: `Hyper-mass accelerators ${b.special.hyperMassAccelerators ? 'enabled: dreadnought spinal guns replaced with ~3× yield AU weapons' : 'disabled'}` });
  if (a.special.hadesRounds !== b.special.hadesRounds) changed.push({ label: 'hades', impact: 3.5, text: `HADES rounds ${b.special.hadesRounds ? 'enabled: kinetic rounds bypass 50% of armour and pierce barriers more efficiently' : 'disabled'}` });
  if (a.special.thanixAvailability !== b.special.thanixAvailability) changed.push({ label: 'thanix', impact: 1.5, text: `Thanix availability: ${a.special.thanixAvailability} → ${b.special.thanixAvailability}` });
  if (a.special.reaperCommandVulnerability !== b.special.reaperCommandVulnerability) changed.push({ label: 'cmd', impact: 1, text: `Reaper command vulnerability ${b.special.reaperCommandVulnerability ? 'enabled: capital losses degrade Reaper coordination' : 'disabled'}` });
  if (a.strategic.alliedCoordination !== b.strategic.alliedCoordination) changed.push({ label: 'coord', impact: Math.abs(a.strategic.alliedCoordination - b.strategic.alliedCoordination) * 1.2, text: `Allied coordination ${a.strategic.alliedCoordination} → ${b.strategic.alliedCoordination} (crew effectiveness)` });
  if (a.strategic.indoctrinationEffectiveness !== b.strategic.indoctrinationEffectiveness) changed.push({ label: 'indoc', impact: 0.5, text: `Indoctrination effectiveness ${a.strategic.indoctrinationEffectiveness} → ${b.strategic.indoctrinationEffectiveness}` });
  if (a.strategic.reaperCompetence !== b.strategic.reaperCompetence) changed.push({ label: 'rcomp', impact: Math.abs(a.strategic.reaperCompetence - b.strategic.reaperCompetence) * 2, text: `Reaper strategic competence ×${a.strategic.reaperCompetence} → ×${b.strategic.reaperCompetence}` });
  for (const f of Object.keys(a.fleetStrength) as (keyof typeof a.fleetStrength)[]) {
    if (a.fleetStrength[f] !== b.fleetStrength[f]) changed.push({ label: `fleet.${f}`, impact: Math.abs(a.fleetStrength[f] - b.fleetStrength[f]) * 2, text: `${f} fleet strength ×${a.fleetStrength[f]} → ×${b.fleetStrength[f]} (changes ship counts when the scenario scales with fleet strength)` });
  }

  changed.sort((x, y) => y.impact - x.impact);
  const ps = ra.perspectiveSide;
  if (ra.outcome !== rb.outcome) out.push(`The outcome changed from ${ra.outcome.toUpperCase()} to ${rb.outcome.toUpperCase()} for the ${ps === 'A' ? 'allied' : 'enemy'} side.`);
  else out.push(`The outcome (${ra.outcome.toUpperCase()}) did not change, but the cost did.`);
  const sa = ra.sides[ps];
  const sb = rb.sides[ps];
  const ea = ra.sides[ps === 'A' ? 'B' : 'A'];
  const eb = rb.sides[ps === 'A' ? 'B' : 'A'];
  out.push(`Own losses: ${sa.destroyed} → ${sb.destroyed} ships (${sa.capitalLost} → ${sb.capitalLost} capital ships). Enemy losses: ${ea.destroyed} → ${eb.destroyed} ships.`);
  if (changed.length === 0) out.push('The two rule sets are identical: any difference is impossible with the same seed, so results match exactly.');
  else {
    out.push('Modifiers that materially changed the engagement, ranked by estimated impact:');
    for (const c of changed.slice(0, 8)) out.push(`• ${c.text}`);
    if (changed.length > 8) out.push(`• …and ${changed.length - 8} further changes with smaller effect.`);
  }
  if (a.id === CANON_ME3.id && b.special.hyperMassAccelerators) {
    out.push('Under canon rules Alliance mass accelerators mostly feed Reaper barriers; the AU hyper-mass accelerator and HADES rounds let dreadnought salvoes reach Reaper hulls, which is what converts attrition into kills.');
  }
  return out;
}

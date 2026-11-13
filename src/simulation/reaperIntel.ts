import type { BattleSimulation } from './battle';

/**
 * Reaper strategic assessment, derived from actual simulation state. The
 * Reapers begin every engagement confident: their projections are based on
 * previous harvest cycles. The assessment moves only when the data does.
 */
export interface ReaperAssessment {
  organicTechCapability: number; // 0..1
  organicFleetStrength: number; // fraction of starting value
  reaperLossesFraction: number; // fraction of Reaper value lost
  reaperCapitalLosses: number;
  unexpectedTechnologies: string[];
  militaryCoordination: number; // 0..1
  threatLevel: 'NEGLIGIBLE' | 'LOW' | 'MODERATE' | 'ELEVATED' | 'SEVERE' | 'CRITICAL';
  projectedResistance: string;
  harvestCompletionEstimate: string;
  headline: string;
  lines: string[];
}

export function assessReapers(sim: BattleSimulation): ReaperAssessment {
  const reaperShips = sim.ships.filter((s) => s.faction === 'reaper');
  const organicShips = sim.ships.filter((s) => s.faction !== 'reaper' && s.role !== 'fighter');
  const reaperStart = reaperShips.reduce((a, s) => a + s.pointValue, 0);
  const reaperLost = reaperShips.filter((s) => !s.alive).reduce((a, s) => a + s.pointValue, 0);
  const reaperLossesFraction = reaperStart > 0 ? reaperLost / reaperStart : 0;
  const reaperCapitals = reaperShips.filter((s) => s.role === 'reaper_capital');
  const reaperCapitalLosses = reaperCapitals.filter((s) => !s.alive).length;
  const capitalLossFraction = reaperCapitals.length > 0 ? reaperCapitalLosses / reaperCapitals.length : 0;
  const organicStart = organicShips.reduce((a, s) => a + s.pointValue, 0);
  const organicRemaining = organicShips.filter((s) => s.alive && !s.escaped).reduce((a, s) => a + s.pointValue, 0);
  const organicFleetStrength = organicStart > 0 ? organicRemaining / organicStart : 0;

  // Technology: ratio of hull damage inflicted on Reapers per shot vs canon expectations.
  const organicDamage = organicShips.reduce((a, s) => a + s.stats.damageDealt, 0);
  const organicShots = Math.max(1, organicShips.reduce((a, s) => a + s.stats.shotsFired, 0));
  const dmgPerShot = organicDamage / organicShots;
  const organicTechCapability = Math.max(0, Math.min(1, dmgPerShot / 900));

  const unexpected: string[] = [];
  const rules = sim.rules;
  if (rules.special.hyperMassAccelerators) unexpected.push('Project Titan accelerator signatures exceeding all archived organic weapon yields.');
  if (rules.special.hadesRounds) unexpected.push('Penetrator rounds detonating inside hull plating at anomalous rates.');
  if (rules.special.thanixAvailability === 'fleetwide') unexpected.push('Widespread deployment of weapons derived from our own technology.');
  if (rules.organic.kineticBarrierStrength > 1.3) unexpected.push('Barrier capacity above projected organic capability.');
  if (rules.special.reaperCommandVulnerability) unexpected.push('Command network degradation following capital unit loss.');
  if (unexpected.length === 0 && organicTechCapability > 0.5) unexpected.push('Weapon effectiveness above archived projections.');

  const coordination = Math.max(0, Math.min(1, rules.strategic.alliedCoordination * 0.6 + (organicShots > 50 ? 0.3 : 0.1)));

  let threatLevel: ReaperAssessment['threatLevel'] = 'NEGLIGIBLE';
  // ADOPTION_PLAN.md §3.2 re-base (BALANCE_AUDIT.md §8): the 1.2 term is "the Reapers lost the engagement" — a finished
  // battle the Reaper side did not win — so a canon fleet that trades two capitals for its own destruction reads ELEVATED,
  // not CRITICAL; thresholds unchanged.
  const reaperSideId = reaperShips[0]?.side;
  const reapersLostEngagement = sim.finished && sim.result !== undefined && reaperSideId !== undefined && sim.result.winner !== reaperSideId;
  // A capital unit lost counts for what it is of the capitals committed. The count alone was used here: fifteen
  // capitals lost of fifteen hundred scored as the loss of fifteen in a ten-ship force (6 where 3.2 is CRITICAL),
  // and an engagement the harvest fleet won without a survivor on the other side concluded "organic fleets capable
  // of defeating harvest forces in open engagement". Unchanged where a tenth or more of the capitals are lost.
  const capitalLossScore = Math.min(reaperCapitalLosses * 0.4, capitalLossFraction * 4);
  const score = reaperLossesFraction * 2 + capitalLossScore + organicTechCapability * 0.8 + (organicFleetStrength > 0.6 && sim.time > 60 ? 0.6 : 0) + (reapersLostEngagement ? 1.2 : 0);
  if (score > 3.2) threatLevel = 'CRITICAL';
  else if (score > 2.2) threatLevel = 'SEVERE';
  else if (score > 1.3) threatLevel = 'ELEVATED';
  else if (score > 0.7) threatLevel = 'MODERATE';
  else if (score > 0.3) threatLevel = 'LOW';

  const lines: string[] = [];
  const harbingerDestroyed = sim.events.some((e) => e.type === 'flagship_destroyed' && e.tier === 'harbinger');
  let headline: string;
  if (harbingerDestroyed) {
    headline = 'HARVEST COMMAND VESSEL DESTROYED. THE CYCLE CONTINUES WITHOUT IT.';
  } else if (reaperCapitalLosses === 0 && reaperLossesFraction < 0.05) {
    headline = 'HARVEST RESISTANCE WITHIN EXPECTED PARAMETERS.';
  } else if (reaperCapitalLosses === 0) {
    headline = 'MINOR UNIT LOSSES RECORDED. HARVEST PROCEEDING.';
  } else if (reaperCapitalLosses < 2) {
    headline = 'CAPITAL UNIT LOSS RECORDED. ANOMALY UNDER EVALUATION.';
  } else if (capitalLossFraction < 0.05 && reaperLossesFraction < 0.05) {
    headline = 'CAPITAL UNIT LOSSES RECORDED. ATTRITION WITHIN COMMITTED RESERVES.';
  } else if (reaperLossesFraction < 0.5) {
    headline = 'CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS.';
  } else {
    headline = 'ORGANIC MILITARY DEVELOPMENT REQUIRES STRATEGIC RE-EVALUATION.';
  }
  lines.push(`Organic fleet strength: ${(organicFleetStrength * 100).toFixed(0)}% of initial deployment.`);
  lines.push(`Harvest fleet losses: ${(reaperLossesFraction * 100).toFixed(0)}% of committed force value.`);
  if (reaperCapitalLosses > 0) lines.push(`Capital units destroyed: ${reaperCapitalLosses}.`);
  if (harbingerDestroyed && rules.special.reaperCommandVulnerability) lines.push('Coordination penalty active.');
  lines.push(`Organic weapon effectiveness index: ${(organicTechCapability * 100).toFixed(0)}.`);
  if (sim.finished && sim.result) {
    const reaperSide = reaperShips[0]?.side;
    if (reaperSide && sim.result.winner === reaperSide) lines.push('Engagement concluded. Resistance eliminated.');
    else if (sim.result.winner === 'draw') lines.push('Engagement inconclusive. Reassessment required.');
    else lines.push('Engagement lost. This outcome has no precedent in archived cycles.');
  }

  let projectedResistance: string;
  if (threatLevel === 'NEGLIGIBLE' || threatLevel === 'LOW') projectedResistance = 'Organic fleets will be eliminated within projected timeframe.';
  else if (threatLevel === 'MODERATE') projectedResistance = 'Organic fleets inflict measurable attrition. Additional units may be required.';
  else if (threatLevel === 'ELEVATED') projectedResistance = 'Organic fleets threaten capital units. Tactical adaptation initiated.';
  else projectedResistance = 'Organic fleets capable of defeating harvest forces in open engagement.';

  let harvest: string;
  if (threatLevel === 'NEGLIGIBLE') harvest = 'Harvest of this system: within one cycle-standard interval.';
  else if (threatLevel === 'LOW' || threatLevel === 'MODERATE') harvest = 'Harvest of this system: delayed. Reinforcement unnecessary.';
  else if (threatLevel === 'ELEVATED') harvest = 'Harvest of this system: delayed. Reinforcement advisable.';
  else harvest = 'Harvest of this system: cannot be completed with committed forces.';

  // The projections above are for an engagement still being fought. Once it is over they give way to what
  // happened: a force that has been destroyed is not "capable of defeating harvest forces", whatever it cost.
  if (sim.finished && sim.result && reaperSideId !== undefined && sim.result.winner === reaperSideId) {
    const costly = threatLevel === 'ELEVATED' || threatLevel === 'SEVERE' || threatLevel === 'CRITICAL';
    projectedResistance = organicFleetStrength <= 0.001
      ? `Organic fleet destroyed${costly ? ' at a cost above projections' : ''}. No resistance remains in this engagement.`
      : `Organic fleet defeated${costly ? ' at a cost above projections' : ''}. Its remnants will be eliminated within projected timeframe.`;
    harvest = costly ? 'Harvest of this system: proceeding. Replacement of lost units advisable.' : 'Harvest of this system: proceeding.';
  } else if (reapersLostEngagement && sim.result!.winner !== 'draw') {
    projectedResistance = 'Organic fleets defeated the committed harvest force in open engagement.';
    harvest = 'Harvest of this system: cannot be completed with committed forces.';
  }

  return {
    organicTechCapability,
    organicFleetStrength,
    reaperLossesFraction,
    reaperCapitalLosses,
    unexpectedTechnologies: unexpected,
    militaryCoordination: coordination,
    threatLevel,
    projectedResistance,
    harvestCompletionEstimate: harvest,
    headline,
    lines,
  };
}

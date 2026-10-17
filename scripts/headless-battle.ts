/**
 * Headless battle runner for balance work:
 *   npm run sim -- battle_of_earth canon_me3 42
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildScenario } from '../src/scenarios/index';
import { assessReapers } from '../src/simulation/reaperIntel';

const [scenario = 'battle_of_earth', rules = 'canon_me3', seedStr = '42', scaling = 'rules'] = process.argv.slice(2);
const config = buildScenario(scenario, rules, Number(seedStr), { fleet_scaling: scaling });
const sim = new BattleSimulation(config);
const t0 = Date.now();
const result = sim.run();
const ms = Date.now() - t0;
console.log(`${config.name} [${config.rules.name}] seed=${config.seed}`);
console.log(`winner=${result.winner} outcome=${result.outcome} reason="${result.reason}" duration=${result.duration.toFixed(1)}s events=${result.eventCount} wall=${ms}ms`);
for (const side of ['A', 'B'] as const) {
  const s = result.sides[side];
  console.log(`  side ${side} [${s.factions.join(',')}] deployed=${s.deployed} destroyed=${s.destroyed} caps=${s.capitalLost}/${s.capitalDeployed} dmgDealt=${s.damageDealt.toFixed(0)} shots=${s.shotsFired} hits=${s.hits} survival=${s.survivalPercent.toFixed(0)}%`);
  for (const [cls, v] of Object.entries(s.lossesByClass)) console.log(`     ${v.name}: ${v.lost}/${v.deployed}`);
}
const intel = assessReapers(sim);
console.log(`Reaper assessment: ${intel.threatLevel} — ${intel.headline}`);
const kills = sim.events.filter((e) => e.type === 'ship_destroyed').slice(0, 12);
for (const k of kills) if (k.type === 'ship_destroyed') console.log(`  t=${k.t.toFixed(1)} ${k.name} destroyed by ${k.killerId ?? '?'}`);

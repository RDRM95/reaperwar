/**
 * Calibration tables (ADOPTION_PLAN.md §3.3, §3.5; BALANCE_AUDIT.md §7 re-measured):
 *   node --import tsx/esm scripts/calibration.ts [--quick]
 * Prints the isolated barrier bench, the live duels, cruiser vs destroyer, the
 * reference engagements (canon and Apex, with the HADES counters and Reaper
 * losses by cause), the Battle of Earth, the heat check and the Oculus screen.
 * Everything is deterministic; the numbers go into docs/apex/CALIBRATION_REPORT.md.
 */
import { WEAPONS } from '../src/data/weapons';
import { SHIP_CLASS_LIST, getShipClass } from '../src/data/ships';
import { BattleSimulation } from '../src/simulation/battle';
import { barrierBench, duelConfig, mute, oculusScreen, referenceSim, runInstrumented, type DuelRecord } from '../tests/support/calibration';

const quick = process.argv.includes('--quick');
const fmt = (n: number | undefined, d = 0): string => (n === undefined ? '—' : n.toFixed(d));
const pct = (f: number): string => `${(100 * f).toFixed(0)} %`;

console.log('# Calibration pass (ADOPTION_PLAN.md §3.3)\n');

// 1. Isolated barrier bench.
console.log('## 1. Isolated barrier trial (synchronised 2 s volleys of 1,000-point rounds, M1 recovery)\n');
console.log('| target | DN | hits | barrier down (s) | killed (s) | min barrier |');
console.log('| --- | ---: | --- | ---: | ---: | ---: |');
for (const target of ['reaper_capital', 'harbinger'] as const) {
  for (const hitChance of [1, 0.75]) {
    for (const dn of [2, 3, 4, 5, 6, 8]) {
      const r = barrierBench({ dreadnoughts: dn, target, hitChance, seed: 1 });
      console.log(`| ${target} | ${dn} | ${hitChance === 1 ? 'all' : '75 % (seed 1)'} | ${fmt(r.downAt, 1)} | ${fmt(r.killedAt, 1)} | ${pct(r.minBarrierFrac)} |`);
    }
  }
}

// 2. Live duels.
const duelRow = (label: string, r: DuelRecord): void => {
  console.log(`| ${label} | ${r.winner} | ${fmt(r.duration)} | ${fmt(r.downAt)} | ${fmt(r.killedAt)} | ${pct(r.minBarrierFrac)} | ${r.aLost} | ${pct(r.spinalHitFrac)} |`);
};
console.log('\n## 2. Live duels (canon, deep space, 40 km)\n');
console.log('| duel | winner | duration (s) | barrier down (s) | killed (s) | min barrier | A lost | spinal hits |');
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
{
  const s = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 2 }, b: { reaper_capital: 1 }, seed: 1, maxDuration: 300 }));
  mute(s, 'B');
  duelRow('2 DN vs capital, muted, 300 s', runInstrumented(s));
  const s4 = new BattleSimulation(duelConfig({ a: { alliance_dreadnought: 4 }, b: { reaper_capital: 1 }, seed: 1, maxDuration: 300 }));
  mute(s4, 'B');
  duelRow('4 DN vs capital, muted', runInstrumented(s4));
  for (const dn of [4, 6]) {
    for (const seed of quick ? [1, 2] : [1, 2, 3, 4, 5]) {
      duelRow(`${dn} DN vs capital, armed, seed ${seed}`, runInstrumented(new BattleSimulation(duelConfig({ a: { alliance_dreadnought: dn }, b: { reaper_capital: 1 }, seed }))));
    }
  }
}

// 3. Cruiser vs destroyer.
console.log('\n## 3. Cruiser vs destroyer (canon, 40 km)\n');
console.log('| duel | wins | collapsed or cruiser died | mean kill (s) |');
console.log('| --- | ---: | ---: | ---: |');
{
  const sweep = (label: string, a: Record<string, number>, seeds: number[], formation: 'line_abreast' | 'dispersed' = 'line_abreast') => {
    let wins = 0;
    let resolved = 0;
    const kills: number[] = [];
    for (const seed of seeds) {
      const r = runInstrumented(new BattleSimulation(duelConfig({ a, b: { reaper_destroyer: 1 }, seed, aFormation: formation })));
      if (r.winner === 'A') wins++;
      if (r.downAt !== undefined || r.aLost > 0) resolved++;
      if (r.killedAt !== undefined) kills.push(r.killedAt);
    }
    console.log(`| ${label} | ${wins}/${seeds.length} | ${resolved}/${seeds.length} | ${kills.length ? fmt(kills.reduce((x, y) => x + y, 0) / kills.length) : '—'} |`);
  };
  const twenty = Array.from({ length: quick ? 6 : 20 }, (_, i) => i + 1);
  const ten = Array.from({ length: quick ? 4 : 10 }, (_, i) => i + 1);
  sweep('1 CA vs DD', { alliance_cruiser: 1 }, twenty);
  sweep('2 CA vs DD', { alliance_cruiser: 2 }, ten);
  sweep('1 DN vs DD', { alliance_dreadnought: 1 }, [1]);
  sweep('4 FF vs DD', { alliance_frigate: 4 }, ten, 'dispersed');
}

// 4. Reference engagements.
console.log('\n## 4. Reference engagements (fixed fleets) and the Battle of Earth\n');
console.log('| run | winner | duration (s) | A survival | A lost | A DN lost | Reaper capitals lost | DN overheated / peak heat | spinal hits | HADES fired / held / detonated | Reaper losses by cause |');
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |');
const refRow = (label: string, sim: BattleSimulation): void => {
  const r = runInstrumented(sim);
  const res = sim.result!;
  console.log(`| ${label} | ${r.winner} | ${fmt(r.duration)} | ${fmt(res.sides.A.survivalPercent)} % | ${res.sides.A.destroyed}/${res.sides.A.deployed} | ${r.aDreadnoughtsLost} | ${r.bCapitalsLost} | ${r.aDreadnoughtOverheated ? 'yes' : 'no'} / ${pct(r.aDreadnoughtPeakHeat)} | ${pct(r.spinalHitFrac)} | ${r.hades.fired} / ${r.hades.held} / ${r.hades.detonated} | ${JSON.stringify(r.reaperLossesByCause)} |`);
};
for (const seed of [7, 8, 9]) refRow(`Reference canon seed ${seed}`, referenceSim('alliance_fleet_engagement', 'canon_me3', seed));
for (const seed of [7, 8, 9]) refRow(`Reference Apex core seed ${seed}`, referenceSim('alliance_fleet_engagement', 'prime_apex', seed));
refRow('Battle of Earth canon seed 42', referenceSim('battle_of_earth', 'canon_me3', 42));
refRow('Battle of Earth canon seed 7', referenceSim('battle_of_earth', 'canon_me3', 7));
if (!quick) {
  refRow('Apex Sol Defence seed 1', referenceSim('prime_apex_sol_defence', 'prime_apex', 1));
  refRow('Final Battle canon seed 1', referenceSim('final_battle_of_earth', 'canon_me3', 1));
  refRow('Final Battle Apex core seed 1', referenceSim('final_battle_of_earth', 'prime_apex', 1));
}

// 5. Cadence and heat.
console.log('\n## 5. Cadence and heat\n');
console.log('| gun | cooldown (s) | heat | heat / s | hull | capacity | share of cooling |');
console.log('| --- | ---: | ---: | ---: | --- | ---: | ---: |');
for (const cls of SHIP_CLASS_LIST) {
  if (cls.faction === 'reaper' || cls.role === 'fighter') continue;
  for (const hp of cls.hardpoints) {
    const w = WEAPONS[hp.weaponId];
    if (w.kind !== 'mass_accelerator' || !w.antiCapital || w.arc > 20) continue;
    const cap = cls.heatCapacity?.value ?? 100;
    console.log(`| ${w.id} | ${w.cooldown} | ${w.heat} | ${(w.heat / w.cooldown).toFixed(2)} | ${cls.id} | ${cap} | ${pct(w.heat / w.cooldown / (0.08 * cap))} |`);
  }
}
console.log(`\nTitan gun under Apex: ${getShipClass('alliance_dreadnought').heatCapacity?.value} × 1.3 capacity, ${WEAPONS.apex_hyper_ma.heat} heat / ${WEAPONS.apex_hyper_ma.cooldown} s.`);

// 6. Oculus screen.
console.log('\n## 6. Oculus screen (1 carrier with 24 Tridents vs 1 capital with 24 Oculi, hulls muted, both on fighters)\n');
console.log('| seed | last small-craft death (s) | Tridents lost | Oculi lost |');
console.log('| ---: | ---: | ---: | ---: |');
for (const seed of [1, 2, 3]) {
  const sim = oculusScreen(seed);
  const r = runInstrumented(sim, { untilTime: 240 });
  console.log(`| ${seed} | ${fmt(r.oculusStats?.lastSmallCraftDeath)} | ${r.oculusStats?.tridentsLost ?? 0} | ${r.oculusStats?.oculiLost ?? 0} |`);
}

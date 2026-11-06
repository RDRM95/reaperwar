import { describe, expect, it } from 'vitest';
import { exportBattlePreset, parseBattlePreset, BATTLE_PRESET_FORMAT } from '../src/scenarios/battlePreset';
import { buildCustomBattle } from '../src/scenarios';

const rules = ['canon_me3', 'cerberus_reformed'];
const sample = {
  format: BATTLE_PRESET_FORMAT,
  rulesId: 'cerberus_reformed',
  environment: 'earth_orbit',
  seed: 2186,
  startingDistanceKm: 122,
  maxDuration: 900,
  sideA: [
    { faction: 'alliance', name: 'Sword Fleet', formation: 'line_abreast', arrivalTime: 0, ships: { alliance_frigate: 20, normandy_sr2: 1 } },
    { faction: 'cerberus', name: 'Black Fleet', formation: 'strike_wedge', arrivalTime: 45, ships: { cerberus_cruiser: 18 } },
  ],
  sideB: [
    { faction: 'reaper', name: 'Reaper blockade', formation: 'swarm_descent', arrivalTime: 0, ships: { reaper_capital: 50, reaper_destroyer: 100, harbinger: 1 } },
  ],
};

describe('shareable battle preset', () => {
  it('imports all allies, arrival times and Reaper strengths', () => {
    const parsed = parseBattlePreset(JSON.stringify(sample), rules);
    expect(parsed.sideA.counts.normandy_sr2).toBe(1);
    expect(parsed.extraA?.[0].arrivalTime).toBe(45);
    expect(parsed.sideB.counts.reaper_destroyer).toBe(100);
    expect(parsed.rulesId).toBe('cerberus_reformed');
    expect(parsed.reinforcementTime).toBe(0);
    expect(buildCustomBattle(parsed).fleets.length).toBe(3);
  });

  it('accepts fenced JSON copied from ChatGPT', () => {
    const block = String.fromCharCode(96).repeat(3);
    const parsed = parseBattlePreset(block + 'json\n' + JSON.stringify(sample) + '\n' + block, rules);
    expect(parsed.extraA).toHaveLength(1);
  });

  it('round-trips the native Custom Battle setup', () => {
    const parsed = parseBattlePreset(JSON.stringify(sample), rules);
    const copy = parseBattlePreset(exportBattlePreset(parsed), rules);
    expect(copy).toEqual(parsed);
  });

  it('rejects invented ship types and ships under the wrong faction', () => {
    const invented = structuredClone(sample);
    invented.sideA[0].ships = { mystery_ship: 99 } as unknown as typeof invented.sideA[0]['ships'];
    expect(() => parseBattlePreset(JSON.stringify(invented), rules)).toThrow('unknown ship class');

    const wrong = structuredClone(sample);
    wrong.sideA[0].ships = { reaper_capital: 1 } as unknown as typeof wrong.sideA[0]['ships'];
    expect(() => parseBattlePreset(JSON.stringify(wrong), rules)).toThrow('belongs to reaper');
  });

  it('rejects duplicate named flagships and invalid numbers', () => {
    const repeated = structuredClone(sample);
    repeated.sideB[0].ships.harbinger = 2;
    expect(() => parseBattlePreset(JSON.stringify(repeated), rules)).toThrow('only once');

    const negative = structuredClone(sample);
    negative.sideB[0].ships.reaper_destroyer = -1;
    expect(() => parseBattlePreset(JSON.stringify(negative), rules)).toThrow('must be an integer');
  });

  it('rejects unsupported fields instead of silently ignoring imagined features', () => {
    const unsupported = { ...sample, teleportReapers: true };
    expect(() => parseBattlePreset(JSON.stringify(unsupported), rules)).toThrow('unsupported field');
  });
});

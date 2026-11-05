import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { TRANSMISSIONS } from '@/data/transmissions';
import { NAMED_FLAGSHIPS } from '@/data/types';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle, fleet } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { FINAL_SALVO_SECONDS, flagshipTier } from '@/simulation/flagships';
import { assessReapers } from '@/simulation/reaperIntel';
import type { BattleConfig, BattleEvent, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/**
 * The flagship events (ADOPTION_PLAN.md §22.2; WORK_BREAKDOWN.md T13, §1.6.3 `tests/flagship.test.ts`):
 * `flagship_destroyed` with timestamp, killer and weapon, damage type, final-salvo hits and an original final
 * transmission; `flagship_mission_kill`; the other Reapers fight on.
 */

type Destroyed = Extract<BattleEvent, { type: 'flagship_destroyed' }>;
type MissionKill = Extract<BattleEvent, { type: 'flagship_mission_kill' }>;
const destroyedEvents = (sim: BattleSimulation): Destroyed[] => sim.events.filter((e): e is Destroyed => e.type === 'flagship_destroyed');
const config = (fleets: FleetSpec[], seed = 6): BattleConfig => ({ id: 'flagship', name: 'Flagship', scenarioId: 'custom', seed, rules: getPreset('canon_me3'), fleets, environment: 'deep_space', maxDuration: 600, perspectiveSide: 'A', objective: 'Test.' });

/** AP §22.2's check: 8 Kilimanjaro-class and 8 cruisers against Harbinger alone, canon, seed 3, 40 km. */
const harbingerDuel = (): BattleSimulation =>
  new BattleSimulation(
    buildCustomBattle({
      seed: 3,
      rulesId: 'canon_me3',
      environment: 'deep_space',
      startingDistanceKm: 40,
      maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Kilimanjaro group', formation: 'line_abreast', counts: { alliance_dreadnought_k: 8, alliance_cruiser: 8 } },
      sideB: { faction: 'reaper', name: 'Harbinger', formation: 'capital_column', counts: { harbinger: 1 } },
    }),
  );

describe('flagship_destroyed', () => {
  it('Harbinger killed in battle: exactly one event right after its ship_destroyed, naming killer, weapon, damage type, final salvo and an original transmission', () => {
    const sim = harbingerDuel();
    sim.run();
    const harbinger = sim.ships.find((s) => s.classId === 'harbinger')!;
    expect(harbinger.alive).toBe(false);
    const fd = destroyedEvents(sim);
    expect(fd).toHaveLength(1);
    const e = fd[0];
    expect(e).toMatchObject({ shipId: harbinger.id, name: 'Harbinger', classId: 'harbinger', faction: 'reaper', side: 'B', tier: 'harbinger' });
    expect(e.t).toBeCloseTo(harbinger.destroyedAt!, 9);
    expect(e.killer?.name).toBeTruthy();
    expect(e.killer?.weaponName).toBeTruthy();
    const killer = sim.getShip(e.killer!.shipId)!;
    expect(killer.side).toBe('A');
    expect(e.killer!.weaponName).toBe(killer.weapons.find((w) => w.def.id === e.killer!.weaponId)!.def.name);
    expect(e.damageType).toBeDefined();
    expect(e.finalSalvoHits).toBeGreaterThanOrEqual(1);
    expect(e.finalSalvoHits).toBe(harbinger.recentHitTimes.filter((t) => t >= e.t - FINAL_SALVO_SECONDS - 1e-9).length);
    expect(TRANSMISSIONS.harbinger.destroyed).toContain(e.transmission);
    expect(TRANSMISSIONS.harbinger.reaction).toContain(e.reaction);
    // It follows the ship_destroyed of the same ship, immediately.
    const sd = sim.events.findIndex((x) => x.type === 'ship_destroyed' && x.shipId === harbinger.id);
    expect(sd).toBeGreaterThanOrEqual(0);
    expect(sim.events.indexOf(e)).toBe(sd + 1);
    // Reaper intelligence headlines the command vessel's loss.
    expect(assessReapers(sim).headline).toContain('HARVEST COMMAND VESSEL DESTROYED');
  });

  it('the narrative never changes the battle: the same duel without the flagship layer logs the same events minus the banner', () => {
    const a = harbingerDuel();
    a.run();
    const b = harbingerDuel();
    for (const s of b.ships) s.flagship = false;
    b.run();
    const strip = (sim: BattleSimulation): string => JSON.stringify(sim.events.filter((e) => e.type !== 'flagship_destroyed' && e.type !== 'flagship_mission_kill'));
    expect(destroyedEvents(a)).toHaveLength(1);
    expect(destroyedEvents(b)).toHaveLength(0);
    expect(strip(a)).toBe(strip(b));
    // The results agree except for the event count, which includes the banner itself.
    expect({ ...a.result!, eventCount: 0 }).toEqual({ ...b.result!, eventCount: 0 });
    expect(a.result!.eventCount).toBe(b.result!.eventCount + 1);
  });

  it('Destiny Ascension is a flagship tier; a plain Reaper capital is no flagship; the Normandy and a capital named Sovereign are', () => {
    const canon = getPreset('canon_me3');
    const asari = fleet('asari', 'asari', canon, { counts: { destiny_ascension: 1, asari_cruiser: 1 }, name: 'Citadel Fleet', fixedClasses: ['destiny_ascension'], position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const alliance = fleet('alliance', 'alliance', canon, { counts: { normandy_sr2: 1, alliance_frigate: 1 }, name: 'Alliance', position: v3(10, 0, -24), mult: 1, initialOrder: { order: 'hold_formation' } });
    const reapers: FleetSpec = {
      ...fleet('r', 'reaper', canon, { counts: { reaper_capital: 2 }, name: 'R', side: 'B', position: v3(0, 0, 30), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } }),
      ships: [{ classId: 'reaper_capital', count: 2, names: ['Sovereign'] }],
    };
    const sim = new BattleSimulation(config([asari, alliance, reapers]));
    for (const s of sim.ships) for (const w of s.weapons) w.cooldown = Infinity;
    const by = (pred: (s: ShipState) => boolean): ShipState => sim.ships.find(pred)!;
    const ascension = by((s) => s.classId === 'destiny_ascension');
    const sovereign = by((s) => s.name === 'Sovereign');
    const plain = by((s) => s.classId === 'reaper_capital' && s.name !== 'Sovereign');
    const normandy = by((s) => s.classId === 'normandy_sr2');
    expect(getShipClass('normandy_sr2').flagship).toBe(true);
    expect(normandy.flagship).toBe(true);
    expect(flagshipTier(normandy)).toBe('flagship');
    expect(NAMED_FLAGSHIPS).toContain('Sovereign');
    expect(sovereign.flagship).toBe(true);
    expect(plain.flagship).toBe(false);
    expect(flagshipTier(plain)).toBeUndefined();
    sim.step();
    const killer = by((s) => s.classId === 'alliance_frigate');
    sim.special.destroy(plain.id, { killerId: killer.id, cause: 'kinetic' });
    expect(destroyedEvents(sim)).toHaveLength(0);
    sim.special.destroy(ascension.id, { killerId: plain.id, cause: 'reaper_beam' });
    sim.special.destroy(sovereign.id, { killerId: killer.id, cause: 'kinetic' });
    sim.special.destroy(normandy.id);
    const fd = destroyedEvents(sim);
    expect(fd.map((e) => [e.name, e.tier])).toEqual([
      ['Destiny Ascension', 'flagship'],
      ['Sovereign', 'flagship'],
      ['SSV Normandy SR-2', 'flagship'],
    ]);
    expect(TRANSMISSIONS.destiny_ascension.destroyed).toContain(fd[0].transmission);
    expect(fd[0].damageType).toBe('reaper_beam');
    expect(fd[0].killer?.weaponName).toBe(WEAPONS.reaper_capital_beam.name);
    expect(TRANSMISSIONS.sovereign.destroyed).toContain(fd[1].transmission);
    expect(TRANSMISSIONS.normandy_sr2.destroyed).toContain(fd[2].transmission);
    // A scripted destruction without a killer or a weapon cause carries neither.
    expect(fd[2].killer).toBeUndefined();
    expect(fd[2].damageType).toBeUndefined();
  });
});

describe('flagship_mission_kill', () => {
  it("special.missionKill on Harbinger emits one flagship_mission_kill ('This cycle is not concluded.'); a later destruction still emits exactly one flagship_destroyed", () => {
    const sim = harbingerDuel();
    sim.step();
    const harbinger = sim.ships.find((s) => s.classId === 'harbinger')!;
    expect(sim.special.missionKill(harbinger.id)).toBe('applied');
    expect(sim.special.missionKill(harbinger.id)).toBe('applied');
    const mk = sim.events.filter((e): e is MissionKill => e.type === 'flagship_mission_kill');
    expect(mk).toHaveLength(1);
    expect(mk[0]).toMatchObject({ shipId: harbinger.id, tier: 'harbinger', transmission: 'This cycle is not concluded.' });
    expect(TRANSMISSIONS.harbinger.reaction).toContain(mk[0].reaction);
    expect(sim.events.filter((e) => e.type === 'mission_kill')).toHaveLength(2);
    sim.run();
    expect(harbinger.alive).toBe(false);
    expect(destroyedEvents(sim)).toHaveLength(1);
  });
});

describe('others continue after Harbinger falls (AP §10, §22.2)', () => {
  it('on the tick after Harbinger’s destruction no other Reaper’s subsystems changed, and a Reaper fires within 10 s', () => {
    const canon = getPreset('canon_me3');
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 2, alliance_cruiser: 6 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -16), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { harbinger: 1, reaper_capital: 2 }, fixedClasses: ['harbinger'], name: 'R', side: 'B', position: v3(0, 0, 16), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const sim = new BattleSimulation(config([a, r], 9));
    sim.skipTo(12);
    const harbinger = sim.ships.find((s) => s.classId === 'harbinger')!;
    const others = sim.ships.filter((s) => s.faction === 'reaper' && s !== harbinger && s.alive);
    expect(others).toHaveLength(2);
    const killer = sim.ships.find((s) => s.classId === 'alliance_dreadnought' && s.alive)!;
    expect(sim.special.destroy(harbinger.id, { killerId: killer.id, cause: 'kinetic' })).toBe('applied');
    const before = others.map((s) => ({ ...s.subsystems }));
    const at = sim.time;
    sim.step();
    others.forEach((s, i) => expect(s.subsystems).toEqual(before[i]));
    expect(destroyedEvents(sim)).toHaveLength(1);
    sim.skipTo(at + 10);
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.t > at && others.some((s) => s.id === e.shipId))).toBe(true);
  });
});

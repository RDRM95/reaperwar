import { describe, expect, it } from 'vitest';
import { v3 } from '@/core/vec3';
import { WEAPONS } from '@/data/weapons';
import { fleet } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { FLIGHT_SIZE, FLIGHT_THRESHOLD, craftCount, isFlight, launchUnits, liveCraft, memberHull, membersLeft } from '@/simulation/flights';
import { summariseSide } from '@/simulation/results';
import type { BattleConfig, BattleEvent, FleetSpec, ShipState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import type { EffectiveWeapon } from '@/timelines/rules';

/** Flights of small craft above the per-side threshold (ADOPTION_PLAN.md §21.3; WORK_BREAKDOWN.md T11, §1.6.3). */

const rules = getPreset('canon_me3');
const config = (fleets: FleetSpec[], seed = 1): BattleConfig => ({ id: 'flights', name: 'Flights', scenarioId: 'custom', seed, rules, fleets, environment: 'deep_space', maxDuration: 900, perspectiveSide: 'A', objective: 'Test.' });

/** Four Alliance carriers (96 Tridents) far from a lone Reaper destroyer that never fires and launches nothing. */
function carrierDeck(seed = 1): BattleSimulation {
  const deck = fleet('deck', 'alliance', rules, { counts: { alliance_carrier: 4 }, name: 'Deck', formation: 'line_abreast', position: v3(0, 0, -60), mult: 1, initialOrder: { order: 'hold_formation' } });
  const foe = fleet('foe', 'reaper', rules, { counts: { reaper_destroyer: 1 }, name: 'Foe', side: 'B', position: v3(0, 0, 200), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
  const sim = new BattleSimulation(config([deck, foe], seed));
  for (const w of sim.ships.find((s) => s.role === 'reaper_destroyer')!.weapons) w.cooldown = Infinity;
  return sim;
}

const craftOf = (sim: BattleSimulation): ShipState[] => sim.ships.filter((s) => s.role === 'fighter' && s.side === 'A');

/** A laser that ignores barriers and armour: exact hull damage for the member-loss checks. */
const exact: EffectiveWeapon = { ...WEAPONS.gardian, damageType: 'laser', penetration: 5, armourBypass: 1, barrierEfficiencyMultiplier: 0 };

describe('flights (AP §21.3)', () => {
  it('launch units: single craft up to the threshold, flights of four beyond it', () => {
    expect(launchUnits(0, 2)).toEqual([1, 1]);
    expect(launchUnits(FLIGHT_THRESHOLD - 2, 2)).toEqual([1, 1]);
    expect(launchUnits(FLIGHT_THRESHOLD - 1, 2)).toEqual([2]);
    expect(launchUnits(FLIGHT_THRESHOLD, FLIGHT_SIZE)).toEqual([4]);
    expect(launchUnits(FLIGHT_THRESHOLD, 10)).toEqual([4, 4, 2]);
  });

  it('below 64 craft per side every launch is a single craft; above, launches are flights of four counted as craft', () => {
    const sim = carrierDeck();
    const launched: BattleEvent[] = [];
    sim.onEvent = (e) => {
      if (e.type === 'fighters_launched') launched.push(e);
    };
    while (sim.time < 30) sim.step();
    const craft = craftOf(sim);
    const singles = craft.filter((s) => !isFlight(s));
    const flights = craft.filter(isFlight);
    // Every craft launched before the side reached the threshold is single; every later launch is a flight of four.
    expect(singles.length).toBe(FLIGHT_THRESHOLD);
    expect(flights.length).toBe((96 - FLIGHT_THRESHOLD) / FLIGHT_SIZE);
    for (const f of flights) {
      expect(f.flight).toEqual({ classId: 'alliance_fighter', craft: 4, maxCraft: 4 });
      expect(f.name).toMatch(/flight/);
      expect(f.maxHull).toBeCloseTo(4 * singles[0].maxHull, 9);
      expect(f.maxBarriers).toBe(singles[0].maxBarriers);
      expect(f.armour).toBe(singles[0].armour);
      expect(f.pointValue).toBe(4 * singles[0].pointValue);
      expect(f.maxSpeed).toBe(singles[0].maxSpeed);
    }
    const firstFlight = Math.min(...flights.map((f) => sim.events.find((e) => e.type === 'ship_deployed' && e.shipId === f.id)!.t));
    const lastSingle = Math.max(...singles.map((f) => sim.events.find((e) => e.type === 'ship_deployed' && e.shipId === f.id)!.t));
    expect(firstFlight).toBeGreaterThanOrEqual(lastSingle);
    expect(liveCraft(sim.ships, 'A')).toBe(96);
    expect(craft.reduce((n, s) => n + craftCount(s), 0)).toBe(96);
    // fighters_launched counts craft, never flights.
    for (const e of launched) if (e.type === 'fighters_launched') expect([2, 4]).toContain(e.count);
    expect(launched.some((e) => e.type === 'fighters_launched' && e.count === 4)).toBe(true);
    expect(sim.ships.filter((s) => s.role === 'carrier').every((c) => c.hangar!.remaining === 0)).toBe(true);
  });

  it('a flight sheds one member per craft hull (flight_member_lost) and dies with its fourth; results count craft', () => {
    const sim = carrierDeck();
    while (sim.time < 30) sim.step();
    const [a, b] = craftOf(sim).filter(isFlight);
    const shooter = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    const per = memberHull(a);
    // One member at a time: remaining 3, 2, 1, 0 and then destroyed.
    for (let k = 0; k < 4; k++) {
      a.barriers = 0;
      sim.applyHit(shooter, a, exact, per, a.pos);
      expect(membersLeft(a)).toBe(3 - k);
    }
    const lostA = sim.events.filter((e) => e.type === 'flight_member_lost' && e.shipId === a.id);
    expect(lostA.map((e) => (e.type === 'flight_member_lost' ? e.remaining : -1))).toEqual([3, 2, 1, 0]);
    expect(a.alive).toBe(false);
    expect(sim.events.filter((e) => e.type === 'ship_destroyed' && e.shipId === a.id)).toHaveLength(1);
    // All at once: four member losses in one hit.
    b.barriers = 0;
    sim.applyHit(shooter, b, exact, 4 * per, b.pos);
    const lostB = sim.events.filter((e) => e.type === 'flight_member_lost' && e.shipId === b.id);
    expect(lostB.map((e) => (e.type === 'flight_member_lost' ? e.remaining : -1))).toEqual([3, 2, 1, 0]);
    expect(b.alive).toBe(false);
    // Results count craft: 96 Tridents deployed, the two flights' eight craft lost.
    const summary = summariseSide(sim, 'A');
    expect(summary.lossesByClass.alliance_fighter.deployed).toBe(96);
    expect(summary.lossesByClass.alliance_fighter.lost).toBe(8);
    // Small craft never count as hulls in the side totals.
    expect(summary.deployed).toBe(4);
  });

  it('a flight fires one shot per member in one weapon_fired event (shots)', () => {
    const sim = carrierDeck();
    while (sim.time < 30) sim.step();
    const f = craftOf(sim).find(isFlight)!;
    const target = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    // Bring the flight onto the destroyer's tail and let its guns bear.
    target.pos = v3(f.pos.x, f.pos.y, f.pos.z + 1);
    target.prevPos = v3(target.pos.x, target.pos.y, target.pos.z);
    f.heading = v3(0, 0, 1);
    f.targetId = target.id;
    sim.issueOrders('deck', { order: 'attack', priority: 'reaper_destroyers' });
    const fired: BattleEvent[] = [];
    sim.onEvent = (e) => {
      if (e.type === 'weapon_fired' && e.shipId === f.id) fired.push(e);
    };
    const shots0 = f.stats.shotsFired;
    for (let i = 0; i < 40 && fired.length === 0; i++) sim.step();
    expect(fired.length).toBeGreaterThan(0);
    const e = fired[0];
    expect(e.type === 'weapon_fired' ? e.shots : undefined).toBe(f.flight!.craft * (WEAPONS[e.type === 'weapon_fired' ? e.weaponId : 'fighter_gun'].salvo ?? 1));
    expect(f.stats.shotsFired - shots0).toBeGreaterThanOrEqual(f.flight!.craft);
  });

  it('carrier recovery returns the surviving members of a flight to the hangar', () => {
    const sim = carrierDeck();
    while (sim.time < 30) sim.step();
    const shooter = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    const f = craftOf(sim).find(isFlight)!;
    f.barriers = 0;
    sim.applyHit(shooter, f, exact, memberHull(f), f.pos);
    expect(f.flight!.craft).toBe(3);
    expect(sim.issueOrders('deck', { fightersDeployed: false })).toBe('issued');
    while (sim.time < 150 && craftOf(sim).some((s) => s.alive && !s.escaped)) sim.step();
    expect(craftOf(sim).every((s) => !s.alive || s.escaped)).toBe(true);
    const hangars = sim.ships.filter((s) => s.role === 'carrier').reduce((n, c) => n + c.hangar!.remaining, 0);
    expect(hangars).toBe(96 - 1);
    expect(f.escaped).toBe(true);
  });

  it('replays identically', () => {
    const a = carrierDeck(3);
    const b = carrierDeck(3);
    for (let i = 0; i < 700; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.ships.map((s) => [s.id, s.flight?.craft ?? 1, s.pos])).toEqual(b.ships.map((s) => [s.id, s.flight?.craft ?? 1, s.pos]));
  });
});

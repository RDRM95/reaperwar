import { describe, expect, it } from 'vitest';
import { BATTLESPACE_SCALE as S } from '@/simulation/constants';
import { BattleSimulation } from '@/simulation/battle';
import { distantCaptions } from '@/simulation/distant';
import type { ShipRole } from '@/data/types';
import type { BattleConfig, BattleEvent } from '@/simulation/types';
import { FINAL_BATTLE_BEATS, FINAL_BATTLE_FLEET_IDS, SCENARIO_SPACING, buildScenario, finalBattlePreview, openingDepthScale, scaleCount } from '@/scenarios';
import { getPreset } from '@/timelines/presets';
import { yieldToLoop } from './support/async';

/**
 * The Final Battle of Earth (ADOPTION_PLAN.md §4; WORK_BREAKDOWN.md §1.6.3 `tests/finalBattle.test.ts`): the cinematic
 * opening's order of events and its volley (fired, landed — rounds and Thanix beams that hit a Reaper hull), the
 * Reaper answer on the line, a dreadnought that takes a beam and holds, the Reaper line's climb, the volley anchor;
 * the pace variants; the Cerberus world state; campaign waves; the preview; platforms and the Apex composition.
 */

const BIG: ReadonlySet<ShipRole> = new Set(['cruiser', 'carrier', 'dreadnought', 'super_dreadnought', 'fixed_platform', 'reaper_capital']);
const HEAVY: ReadonlySet<ShipRole> = new Set(['dreadnought', 'super_dreadnought']);

interface Opening {
  sim: BattleSimulation;
  events: BattleEvent[];
  /** Volley rounds and beams that hit a Reaper hull by `at + window + 3`. */
  landed: number;
  /** Side-A heavy hulls a Reaper beam hit before 60 s × pace. */
  beamHitHeavy: Set<string>;
  yAt20: number;
  yAt36: number;
}

/** Runs the opening, sampling what the events do not carry (beam hits, the Reaper line's height). */
async function runOpening(config: BattleConfig, until: number): Promise<Opening> {
  const sim = new BattleSimulation(config);
  const pace = config.beats?.beatScale ?? 1;
  const events: BattleEvent[] = [];
  const pendingBeams: { shipId: string; idx: number; t: number }[] = [];
  const volleyRounds = new Set<number>();
  const beamHitHeavy = new Set<string>();
  let beamLanded = 0;
  let yAt20 = NaN;
  let yAt36 = NaN;
  sim.onEvent = (e) => {
    events.push(e);
    if (e.type === 'weapon_fired' && e.volley && sim.getShip(e.shipId)?.side === 'A') {
      if (e.projectileId !== undefined) for (let k = 0; k < (e.shots ?? 1); k++) volleyRounds.add(e.projectileId + k);
      else pendingBeams.push({ shipId: e.shipId, idx: e.weaponIndex, t: e.t });
    }
  };
  const reaperY = (): number => {
    const r = sim.ships.filter((s) => s.alive && s.fleetId === FINAL_BATTLE_FLEET_IDS.blockade && s.role !== 'fighter');
    return r.reduce((a, s) => a + s.pos.y, 0) / Math.max(1, r.length);
  };
  let windowEnd = Infinity;
  while (!sim.finished && sim.time < until) {
    sim.step();
    const ordered = events.find((e) => e.type === 'fleet_volley_ordered' && sim.fleets.get(e.fleetId)?.spec.side === 'A');
    if (ordered && ordered.type === 'fleet_volley_ordered') windowEnd = ordered.at + ordered.window + 3;
    for (const b of pendingBeams.splice(0)) {
      const w = sim.getShip(b.shipId)!.weapons[b.idx];
      const t = w.beamTargetId ? sim.getShip(w.beamTargetId) : undefined;
      if (w.beamHit && t?.faction === 'reaper' && b.t <= windowEnd) beamLanded++;
    }
    if (Math.abs(sim.time - 20 * pace) < 0.026) yAt20 = reaperY();
    if (Math.abs(sim.time - 36 * pace) < 0.026) yAt36 = reaperY();
    if (sim.time < 60 * pace) {
      for (const s of sim.ships) {
        if (s.faction !== 'reaper' || !s.alive) continue;
        for (const w of s.weapons) {
          if (w.def.kind !== 'reaper_beam' || !w.beamHit || w.beamRemaining <= 0 || !w.beamTargetId) continue;
          const t = sim.getShip(w.beamTargetId);
          if (t && t.side === 'A' && HEAVY.has(t.role)) beamHitHeavy.add(t.id);
        }
      }
    }
    if (sim.tick % 200 === 0) await yieldToLoop();
  }
  const roundsLanded = events.filter((e) => e.type === 'projectile_impact' && e.projectileId !== undefined && volleyRounds.has(e.projectileId) && sim.getShip(e.targetId)?.faction === 'reaper' && e.t <= windowEnd).length;
  return { sim, events, landed: roundsLanded + beamLanded, beamHitHeavy, yAt20, yAt36 };
}

const of = <T extends BattleEvent['type']>(events: BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const sideAFleet = (sim: BattleSimulation, fleetId: string): boolean => sim.fleets.get(fleetId)?.spec.side === 'A';
type BeatLogged = Extract<BattleEvent, { beatId: string; kind: string }>;
const beatsFired = (events: BattleEvent[]): BeatLogged[] => events.filter((e): e is BeatLogged => e.type === 'beat_fired');

/** The volley rows: fired ≥ 0.7 × ordered, landed ≥ 0.3 × fired (AP §4.3; Thanix beams of the Apex cruisers count as landing). */
function volleyRows(o: Opening): { ordered: number; fired: number } {
  const ordered = of(o.events, 'fleet_volley_ordered').filter((e) => sideAFleet(o.sim, e.fleetId));
  const fired = of(o.events, 'fleet_volley_fired').filter((e) => sideAFleet(o.sim, e.fleetId));
  const mounts = ordered.reduce((a, e) => a + e.mountsOrdered, 0);
  const shots = fired.reduce((a, e) => a + e.fired, 0);
  expect(mounts).toBeGreaterThan(0);
  expect(shots, `fired ${shots} of ${mounts}`).toBeGreaterThanOrEqual(0.7 * mounts);
  expect(o.landed, `landed ${o.landed} of ${shots}`).toBeGreaterThanOrEqual(0.3 * shots);
  return { ordered: mounts, fired: shots };
}

/** Per preset: did a side-A dreadnought take a Reaper beam before 60 s and live to 70 s (AP §4.3, "≥ 2 of 3 seeds")? */
const heldBeam = new Map<string, boolean[]>();

describe.each([1, 2, 3])('the cinematic opening, seed %i', (seed) => {
  it.each(['canon_me3', 'prime_apex'])('%s: arrivals, the Reaper advance, the marked volley, the answer, then the first losses — in that order', async (rulesId) => {
    const config = buildScenario('final_battle_of_earth', rulesId, seed, { forces: 'default' });
    expect(config.worldState?.cinematic_arrival).toBe('on');
    expect(config.beats?.lockPlayerUntil).toBe(80);
    const o = await runOpening(config, 70);
    const { sim, events } = o;
    // Event order, all before 70 s.
    const firstFlash = of(events, 'ship_arrival_flash')[0].t;
    const openingWaves = of(events, 'fleet_arrived').filter((e) => sim.fleets.get(e.fleetId)?.spec.arrivalMode === 'beat');
    const lastArrived = Math.max(...openingWaves.map((e) => e.t));
    const reaperAdvance = of(events, 'order_issued').find((e) => e.fleetId === FINAL_BATTLE_FLEET_IDS.blockade && e.order.includes('order=advance'))!.t;
    const volleyOrdered = of(events, 'fleet_volley_ordered').find((e) => sideAFleet(sim, e.fleetId))!;
    const volleyFired = of(events, 'fleet_volley_fired').find((e) => sideAFleet(sim, e.fleetId))!;
    const firstBig = of(events, 'ship_destroyed').find((e) => BIG.has(e.role))!;
    expect(firstBig, 'a cruiser or larger is destroyed before 70 s').toBeDefined();
    expect(firstFlash).toBeLessThan(lastArrived);
    expect(lastArrived).toBeLessThan(reaperAdvance);
    expect(reaperAdvance).toBeLessThan(volleyOrdered.t);
    expect(volleyOrdered.t).toBeLessThan(volleyFired.t);
    expect(volleyFired.t).toBeLessThan(firstBig.t);
    expect(firstBig.t).toBeLessThan(70);
    // The volley fires and lands; it is anchored on SSV Kilimanjaro (the K-class pair is in the Sword line).
    volleyRows(o);
    expect(sim.ships.filter((s) => s.classId === 'alliance_dreadnought_k').map((s) => s.name).sort()).toEqual(['SSV Kilimanjaro', 'SSV Orizaba']);
    expect(sim.getShip(volleyOrdered.anchorShipId!)!.name).toBe('SSV Kilimanjaro');
    // The Reaper answer lands on the line, not on the platforms.
    const answer = of(events, 'weapon_fired').filter((e) => e.volley && sim.getShip(e.shipId)?.faction === 'reaper' && e.kind === 'reaper_beam');
    expect(answer.length).toBeGreaterThan(0);
    expect(answer.filter((e) => sim.getShip(e.targetId)?.role !== 'fixed_platform').length).toBeGreaterThanOrEqual(0.5 * answer.length);
    // The first side-A loss of cruiser size or larger is a line hull, not a platform.
    const firstBigA = of(events, 'ship_destroyed').find((e) => e.side === 'A' && BIG.has(e.role));
    if (firstBigA) expect(firstBigA.role).not.toBe('fixed_platform');
    // A dreadnought takes a beam and holds (asserted over the seeds below).
    const holds = [...o.beamHitHeavy].some((id) => sim.getShip(id)?.alive);
    heldBeam.set(rulesId, [...(heldBeam.get(rulesId) ?? []), holds]);
    // The Reaper line climbs at least 8 km (nominal) between 20 s and 36 s.
    expect((o.yAt36 - o.yAt20) / S).toBeGreaterThanOrEqual(8);
    // The Oculi are out before 30 s.
    const drones = of(events, 'ship_deployed').filter((e) => e.classId === 'reaper_oculus');
    expect(drones.length).toBeGreaterThan(0);
    expect(drones[0].t).toBeLessThan(30);
    // Nothing anti-ship speaks before the volley: no hull is lost before its release.
    expect(of(events, 'ship_destroyed').filter((e) => e.role !== 'fighter' && e.t < volleyOrdered.at)).toEqual([]);
  }, 120_000);
});

describe('a dreadnought takes a beam and holds (AP §4.3)', () => {
  it.each(['canon_me3', 'prime_apex'])('%s: in at least two of the three seeds', (rulesId) => {
    const seeds = heldBeam.get(rulesId) ?? [];
    expect(seeds).toHaveLength(3);
    expect(seeds.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the pace knob (beatScale; AP §4.2)', () => {
  it.each(['0.5', '2'])('beat_scale %s, canon seed 1: the volley fires and lands', async (beatScale) => {
    const config = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', beat_scale: beatScale });
    expect(config.beats?.beatScale).toBe(Number(beatScale));
    const o = await runOpening(config, 46 * Number(beatScale));
    const ordered = of(o.events, 'fleet_volley_ordered').find((e) => sideAFleet(o.sim, e.fleetId))!;
    expect(ordered.t).toBeCloseTo(36 * Number(beatScale), 6);
    volleyRows(o);
  }, 120_000);

  it('the opening starts the lines nearer for a faster pace and farther for a slower one', () => {
    expect([0.5, 0.75, 1, 1.25, 1.5, 2].map(openingDepthScale)).toEqual([0.7, 0.75, 1, 1.25, 1.25, 1.25]);
    const z = (bs: string): number => buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', beat_scale: bs }).fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.blockade)!.position.z;
    expect(z('0.5')).toBeCloseTo(0.7 * z('1'), 9);
    expect(z('2')).toBeCloseTo(1.25 * z('1'), 9);
  });
});

describe('the Cerberus world state (AP §4.1)', () => {
  it('allied: a side-A fleet by beat — Black Fleet dreadnoughts under the Apex mechanics, canon Cerberus hulls otherwise; at 12 s without the opening', () => {
    const apex = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default', cerberus: 'allied' });
    const black = apex.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.cerberus)!;
    expect(black.side).toBe('A');
    expect(black.arrivalMode).toBe('beat');
    expect(black.ships.find((s) => s.classId === 'cerberus_dreadnought')?.count).toBe(2);
    expect(apex.beats!.beats.find((b) => b.id === 'arrive_cerberus')?.when).toEqual({ cerberus: ['allied'] });
    const reformed = buildScenario('final_battle_of_earth', 'cerberus_reformed', 1, { forces: 'default' });
    expect(reformed.worldState?.cerberus).toBe('allied');
    const exp = reformed.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.cerberus)!;
    expect(exp.side).toBe('A');
    expect(exp.ships.some((s) => s.classId === 'cerberus_dreadnought' || s.classId === 'cerberus_heavy_cruiser')).toBe(false);
    const off = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default', cinematic_arrival: 'off' });
    expect(off.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.cerberus)?.arrivalTime).toBe(12);
  });

  it('hostile: a rogue strike group on side B at 150 s with priority capitals; absent: none', () => {
    const canon = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' });
    expect(canon.worldState?.cerberus).toBe('hostile');
    const g = canon.fleets.find((f) => f.faction === 'cerberus')!;
    expect(g).toMatchObject({ side: 'B', arrivalTime: 150, rogue: true });
    expect(g.initialOrder?.priority).toBe('capitals');
    expect(g.ships.map((s) => [s.classId, s.count])).toEqual([['cerberus_cruiser', 8], ['cerberus_frigate', 12]]);
    expect(canon.notes!.some((n) => n.startsWith('CERBERUS (HOSTILE)'))).toBe(true);
    // A rogue group is no vanguard of either side: it has no distant echelon.
    expect(canon.distant!.groups.some((d) => d.id === `echelon-${g.id}`)).toBe(false);
    const absent = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', cerberus: 'absent' });
    expect(absent.fleets.some((f) => f.faction === 'cerberus')).toBe(false);
  });

  it('hostile in battle: after it arrives the Reapers fire on it and it fires at both sides', async () => {
    const config = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default', cerberus: 'hostile' });
    const sim = new BattleSimulation(config);
    const g = config.fleets.find((f) => f.rogue)!;
    let reaperOnCerberus = 0;
    const cerberusOn = { A: 0, B: 0 };
    sim.onEvent = (e) => {
      if (e.type !== 'weapon_fired') return;
      const s = sim.getShip(e.shipId);
      const t = sim.getShip(e.targetId);
      if (!s || !t) return;
      if (s.faction === 'reaper' && t.fleetId === g.id) reaperOnCerberus++;
      if (s.fleetId === g.id) cerberusOn[t.side]++;
    };
    while (!sim.finished && sim.time < 200) {
      sim.step();
      if (sim.tick % 200 === 0) await yieldToLoop();
    }
    expect(of(sim.events, 'reinforcement_arrival').some((e) => e.fleetId === g.id && e.t >= 150)).toBe(true);
    expect(reaperOnCerberus).toBeGreaterThan(0);
    expect(cerberusOn.A).toBeGreaterThan(0);
    expect(cerberusOn.B).toBeGreaterThan(0);
  }, 120_000);
});

describe('campaign forces with the opening on (AP §4.3)', () => {
  it('the waves fill by faction order and the volley fires, anchored on the largest Alliance capital when no Kilimanjaro sails', async () => {
    const allied = [
      { name: 'Fifth Fleet', faction: 'alliance', counts: { alliance_dreadnought: 3, alliance_cruiser: 8, alliance_frigate: 10, normandy_sr2: 1 } },
      { name: 'Hierarchy Seventh', faction: 'turian', counts: { turian_dreadnought: 3, turian_cruiser: 6 } },
      { name: 'Second Fleet', faction: 'alliance', counts: { alliance_dreadnought: 2, alliance_cruiser: 6 } },
      { name: 'Migrant Fleet', faction: 'quarian', counts: { quarian_heavy: 2, quarian_cruiser: 6 } },
    ];
    const config = buildScenario('final_battle_of_earth', 'canon_me3', 1, {
      forces: 'campaign',
      cinematic_arrival: 'on',
      campaignAllied: JSON.stringify(allied),
      campaignReaper: JSON.stringify({ harbinger: 1, reaper_capital: 4, reaper_destroyer: 10 }),
    });
    expect(config.worldState).toMatchObject({ forces: 'campaign', cinematic_arrival: 'on', cerberus: 'absent' });
    const o = await runOpening(config, 42);
    const { sim } = o;
    expect([0, 1, 2, 3].map((n) => sim.resolveFleetSel({ side: 'A', wave: n })[0]?.spec.name)).toEqual(['Fifth Fleet', 'Second Fleet', 'Hierarchy Seventh', 'Migrant Fleet']);
    const arrivals = beatsFired(o.events).filter((e) => e.kind === 'spawn_wave').map((e) => e.beatId);
    expect(arrivals).toEqual(['arrive_alliance', 'arrive_alliance_2', 'arrive_turian', 'arrive_quarian']);
    const ordered = of(o.events, 'fleet_volley_ordered').filter((e) => sideAFleet(sim, e.fleetId));
    expect(ordered.length).toBeGreaterThan(0);
    const anchor = sim.getShip(ordered[0].anchorShipId!)!;
    expect(anchor.faction).toBe('alliance');
    expect(anchor.role).toBe('dreadnought');
    expect(beatsFired(o.events).find((e) => e.beatId === 'volley')?.note).toBe('anchor unresolved');
    expect(of(o.events, 'fleet_volley_fired').filter((e) => sideAFleet(sim, e.fleetId)).reduce((a, e) => a + e.fired, 0)).toBeGreaterThan(0);
  }, 120_000);
});

describe('the script, the preview and the order of battle', () => {
  it('the default table keeps the plan’s ids; the Apex captions only under the Apex scenarios; the AU tag under every alternate preset', () => {
    const ids = FINAL_BATTLE_BEATS.map((b) => b.id);
    for (const id of ['title', 'arrive_alliance', 'arrive_turian', 'arrive_asari', 'arrive_salarian', 'arrive_quarian', 'arrive_geth', 'arrive_cerberus', 'form_up', 'reapers_advance', 'oculus_launch', 'scale_caption', 'platforms', 'mark', 'line_holds', 'volley', 'reaper_answer', 'fighters', 'free_play']) expect(ids, id).toContain(id);
    const canon = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' }).beats!;
    const apex = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default' }).beats!;
    expect(canon.beats.some((b) => b.id === 'scale_caption' || b.id === 'platforms' || b.id === 'title_tag')).toBe(false);
    const caption = apex.beats.find((b) => b.id === 'scale_caption')!.event;
    expect(caption.kind === 'caption' && caption.text.endsWith('· AU SCENARIO VALUE')).toBe(true);
    expect(caption.kind === 'caption' && caption.text).toMatch(/^38,420 WARSHIPS COMMITTED TO SOL · \d+ SIMULATED/);
    const tag = apex.beats.find((b) => b.id === 'title_tag')!.event;
    expect(tag.kind === 'caption' && tag.text).toBe('ALTERNATE UNIVERSE · PRIME/APEX — APEX CORE');
    const volley = apex.beats.find((b) => b.id === 'volley')!.event;
    expect(volley).toMatchObject({ kind: 'fleet_volley', window: 1.5, lead: 2, mounts: 'spinal', anchor: { name: 'SSV Kilimanjaro' } });
    expect(apex.beats.find((b) => b.id === 'reaper_answer')!.event).toMatchObject({ kind: 'fleet_volley', mounts: 'beams', target: { query: 'nearest', side: 'A', roles: ['cruiser', 'dreadnought', 'super_dreadnought'] }, spread: true });
    expect(apex.beats.find((b) => b.id === 'form_up')!.event).toMatchObject({ patch: { holdSpecialAmmo: true } });
    expect(apex.beats.find((b) => b.id === 'free_play_hades')!.event).toMatchObject({ patch: { holdSpecialAmmo: false } });
    expect(apex.beats.find((b) => b.id === 'reapers_advance')!.event).toMatchObject({ patch: { order: 'advance', holdFire: 'beams', anchorGoal: { y: 0 } } });
  });

  it('beatPreview: beat_scale 2 doubles the times and an absent Cerberus has no arrival row', () => {
    const rules = getPreset('canon_me3');
    const one = finalBattlePreview(rules, { cerberus: 'absent', genophage: 'cured', beat_scale: '1' });
    const two = finalBattlePreview(rules, { cerberus: 'absent', genophage: 'cured', beat_scale: '2' });
    expect(two.map((r) => r.id)).toEqual(one.map((r) => r.id));
    for (let i = 0; i < one.length; i++) expect(two[i].at).toBeCloseTo(2 * one[i].at, 9);
    expect(one.some((r) => r.id === 'arrive_cerberus' || r.id === 'arrive_salarian')).toBe(false);
    expect(finalBattlePreview(getPreset('prime_apex'), { cerberus: 'allied', genophage: 'sabotaged', beat_scale: '1' }).some((r) => r.id === 'arrive_cerberus')).toBe(true);
    expect(one.find((r) => r.id === 'free_play')!.at).toBe(80);
  });

  it('platforms: two under canon, four under Apex (two heavy), static, defending their positions', () => {
    for (const [rulesId, standard, heavy] of [['canon_me3', 2, 0], ['prime_apex', 2, 2], ['apex_legacy', 2, 2]] as const) {
      for (const cinematic of ['on', 'off']) {
        const cfg = buildScenario('final_battle_of_earth', rulesId, 1, { forces: 'default', cinematic_arrival: cinematic });
        const p = cfg.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.platforms)!;
        expect(p.static, rulesId).toBe(true);
        expect(p.formation).toBe('static');
        expect(p.initialOrder?.order).toBe('defend_position');
        expect(p.ships.find((s) => s.classId === 'sol_defence_platform')?.count ?? 0, `${rulesId} ${cinematic}`).toBe(standard);
        expect(p.ships.find((s) => s.classId === 'sol_platform_heavy')?.count ?? 0, `${rulesId} ${cinematic}`).toBe(heavy);
      }
    }
  });

  it('the distant layer: present under canon with percentages only, switchable off; the AU figures under Apex', () => {
    const canon = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' });
    expect(canon.distant?.captions).toBe('canon');
    const captions = distantCaptions(new BattleSimulation(canon));
    expect(captions.length).toBeGreaterThan(0);
    for (const c of captions) expect(c).not.toMatch(/\d/);
    expect(buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', distant_layer: 'off' }).distant).toBeUndefined();
    expect(buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default' }).distant?.captions).toBe('apex');
  });

  it('compositions: the K-class pair and the pattern frigates; under Apex the heavy line (one SSV Omaha), the Praetor, readiness tiers', () => {
    const count = (cfg: BattleConfig, cls: string): number => cfg.fleets.reduce((a, f) => a + f.ships.filter((s) => s.classId === cls).reduce((b, s) => b + s.count, 0), 0);
    const canon = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' });
    expect(count(canon, 'alliance_dreadnought_k')).toBe(2);
    expect(count(canon, 'alliance_dreadnought')).toBe(4);
    expect(count(canon, 'alliance_frigate_thanix')).toBe(2);
    expect(count(canon, 'normandy_sr2')).toBe(1);
    for (const cls of ['normandy_valkyrie', 'alliance_super_dreadnought', 'turian_super_dreadnought', 'sol_platform_heavy', 'cerberus_dreadnought']) expect(count(canon, cls), cls).toBe(0);
    expect(canon.fleets.some((f) => f.readiness !== undefined)).toBe(false);
    expect(canon.auContent).toBeUndefined();
    const apex = buildScenario('final_battle_of_earth', 'prime_apex', 1, { forces: 'default' });
    expect(count(apex, 'alliance_dreadnought_k')).toBe(2);
    expect(count(apex, 'alliance_super_dreadnought')).toBe(1);
    expect(count(apex, 'normandy_valkyrie')).toBe(1);
    expect(count(apex, 'turian_super_dreadnought')).toBe(1);
    expect(count(apex, 'normandy_sr2')).toBe(1);
    expect(count(apex, 'alliance_frigate_thanix')).toBe(scaleCount(3, getPreset('prime_apex').fleetStrength.alliance));
    expect(count(apex, 'alliance_frigate_thanix')).toBeGreaterThan(3);
    expect(apex.auContent).toBe(true);
    const heavy = apex.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.heavy)!;
    expect(heavy.ships.map((s) => s.classId).sort()).toEqual(['alliance_super_dreadnought', 'normandy_valkyrie']);
    expect(apex.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.alliance)!.readiness).toBe('veteran');
    expect(apex.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.asari)!.readiness).toBe('regular');
    // The waves deploy by beat: every one is in by 13 s.
    const sim = new BattleSimulation(apex);
    sim.skipTo(13);
    expect(sim.ships.filter((s) => s.name === 'SSV Omaha').map((s) => s.classId)).toEqual(['alliance_super_dreadnought']);
    const names = sim.ships.filter((s) => s.role !== 'fighter').map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    // A regular fleet's crews are 0.85 × the preset's (AP §1.6); a veteran fleet's are unchanged.
    const asari = sim.ships.find((s) => s.classId === 'asari_cruiser')!;
    const untiered = new BattleSimulation({ ...apex, fleets: apex.fleets.map((f) => ({ ...f, readiness: undefined })) });
    untiered.skipTo(13);
    const alone = untiered.ships.find((s) => s.classId === 'asari_cruiser')!;
    expect(asari.crewQuality).toBeCloseTo(0.85 * alone.crewQuality, 9);
  });

  it('without the opening: today’s geometry and orders, with the platforms and the K-class pair; no beats, no lock', () => {
    const off = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default', cinematic_arrival: 'off' });
    expect(off.beats).toBeUndefined();
    const sword = off.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.alliance)!;
    // Today's anchors at the scenarios' §22 spacing (release 0.12.3, `SCENARIO_SPACING`).
    expect(sword.position).toEqual({ x: -20 * SCENARIO_SPACING, y: 0, z: -34 * SCENARIO_SPACING });
    expect(sword.arrivalMode).toBeUndefined();
    expect(sword.initialOrder).toBeUndefined();
    expect(off.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.blockade)!.position).toEqual({ x: 0, y: 0, z: 46 * SCENARIO_SPACING });
    expect(off.fleets.find((f) => f.id === FINAL_BATTLE_FLEET_IDS.reserve)!.arrivalTime).toBe(Math.round(90 * SCENARIO_SPACING));
    expect(sword.ships.find((s) => s.classId === 'alliance_dreadnought_k')?.count).toBe(2);
    expect(new BattleSimulation(off).playerLocked).toBe(false);
  });
});

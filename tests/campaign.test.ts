import { describe, expect, it } from 'vitest';
import { advanceTick, applyEngagementResult, buildEngagement, createCampaign, fleetShipCount, fleetsAt, orderMove, reaperFleetValue, withdrawFromEngagement } from '@/campaign/engine';
import { RELAYS, SYSTEMS, neighbours, relayPath } from '@/campaign/galaxy';
import { BattleSimulation } from '@/simulation/battle';
import { getPreset } from '@/timelines/presets';
import { advanceQuarter, createPostWar, dismantle, setAllocation, requiredConventionalFleet } from '@/campaign/postwar';
import { buildScenario } from '@/scenarios';
import { effectiveGround, normaliseCampaign, researchTech, setResearch } from '@/campaign/depth';

describe('galaxy', () => {
  it('every system is reachable from Sol', () => {
    for (const s of SYSTEMS) expect(relayPath('sol', s.id).length).toBeGreaterThan(0);
  });
  it('relays reference known systems', () => {
    const ids = new Set(SYSTEMS.map((s) => s.id));
    for (const [a, b] of RELAYS) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
    expect(neighbours('sol')).toContain('arcturus');
  });
});

describe('campaign engine', () => {
  it('creates a canon campaign with the invasion already in batarian space', () => {
    const st = createCampaign({ seed: 1, rules: getPreset('canon_me3'), worldState: {} });
    expect(st.systems.kite_nest.controller).toBe('reaper');
    expect(st.systems.sol.controller).toBe('allied');
    expect(st.fleets.some((f) => f.faction === 'reaper')).toBe(true);
    expect(st.fleets.find((f) => f.name === 'Alliance Fifth Fleet')?.playerControlled).toBe(true);
    expect(st.crucible.available).toBe(true);
    // Hostile Cerberus in canon; cooperative under Cerberus Reformed.
    expect(st.fleets.find((f) => f.faction === 'cerberus')?.allegiance).toBe('cerberus');
    const reformed = createCampaign({ seed: 1, rules: getPreset('cerberus_reformed'), worldState: {} });
    expect(reformed.fleets.find((f) => f.faction === 'cerberus')?.allegiance).toBe('allied');
  });

  it('world state adds the quarian and geth fleets only with peace', () => {
    const war = createCampaign({ seed: 1, rules: getPreset('canon_me3'), worldState: { rannoch: 'war' } });
    const peace = createCampaign({ seed: 1, rules: getPreset('canon_me3'), worldState: { rannoch: 'peace' } });
    expect(war.fleets.some((f) => f.faction === 'quarian')).toBe(false);
    expect(peace.fleets.some((f) => f.faction === 'quarian')).toBe(true);
    expect(peace.fleets.some((f) => f.faction === 'geth' && f.allegiance === 'allied')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const st = createCampaign({ seed: 9, rules: getPreset('canon_me3'), worldState: {} });
      for (let i = 0; i < 6; i++) advanceTick(st, { interactive: false });
      return JSON.stringify({ tick: st.tick, fleets: st.fleets.map((f) => [f.id, f.location, f.counts]), systems: st.systems });
    };
    expect(run()).toBe(run());
  });

  it('moves fleets along relays and refuses uncooperative orders', () => {
    const st = createCampaign({ seed: 2, rules: getPreset('canon_me3'), worldState: {} });
    const fifth = st.fleets.find((f) => f.name === 'Alliance Fifth Fleet')!;
    expect(orderMove(st, fifth.id, 'athena').ok).toBe(true);
    expect(fifth.destination).toBe('widow'); // Sol–Citadel relay, then on to the Athena Nebula
    expect(fifth.route).toEqual(['widow', 'athena']);
    advanceTick(st, { interactive: false });
    expect(fifth.location).toBe('widow');
    expect(fifth.destination).toBe('athena');
    const palaven = st.fleets.find((f) => f.name === 'Hierarchy Palaven Fleet')!;
    st.factions.turian.cooperation = 0.2;
    expect(orderMove(st, palaven.id, 'sol').ok).toBe(false);
    st.factions.turian.cooperation = 0.9;
    expect(orderMove(st, palaven.id, 'sol').ok).toBe(true);
  });

  it('pauses on an engagement involving player fleets and resolves it through the battle simulation', () => {
    const st = createCampaign({ seed: 3, rules: getPreset('canon_me3'), worldState: {} });
    // Put the Reaper vanguard on Earth.
    const vanguard = st.fleets.find((f) => f.name === 'Reaper vanguard')!;
    vanguard.location = 'sol';
    const r = advanceTick(st, { interactive: true });
    expect(r.pending?.system).toBe('sol');
    expect(st.pending).toBeDefined();
    const cfg = buildEngagement(st, st.pending!);
    expect(cfg.environment).toBe('earth_orbit');
    expect(cfg.fleets.some((f) => f.side === 'B' && f.faction === 'reaper')).toBe(true);
    expect(cfg.fleets.some((f) => f.name.includes('orbital defence'))).toBe(true);
    const before = fleetShipCount(st.fleets.find((f) => f.name === 'Alliance Fifth Fleet')!.counts);
    const result = new BattleSimulation(cfg).run();
    applyEngagementResult(st, st.pending!, result);
    expect(st.pending).toBeUndefined();
    const fifth = st.fleets.find((f) => f.name === 'Alliance Fifth Fleet');
    expect(!fifth || fleetShipCount(fifth.counts) < before).toBe(true);
    expect(st.systems.sol.lastBattle).toBeDefined();
  });

  it('withdrawal moves player fleets out of the contested system', () => {
    const st = createCampaign({ seed: 4, rules: getPreset('canon_me3'), worldState: {} });
    st.fleets.find((f) => f.name === 'Reaper vanguard')!.location = 'sol';
    advanceTick(st, { interactive: true });
    expect(st.pending).toBeDefined();
    withdrawFromEngagement(st, st.pending!);
    expect(fleetsAt(st, 'sol').some((f) => f.playerControlled)).toBe(false);
  });

  it('canon campaigns end in defeat or a Crucible decision; Prime/Apex can win conventionally', () => {
    const canon = createCampaign({ seed: 5, rules: getPreset('canon_me3'), worldState: {} });
    while (!canon.outcome && canon.tick < 160) advanceTick(canon, { interactive: false });
    expect(canon.outcome).toBeDefined();
    const apex = createCampaign({ seed: 5, rules: getPreset('prime_apex'), worldState: {} });
    while (!apex.outcome && apex.tick < 160) advanceTick(apex, { interactive: false });
    expect(apex.outcome?.kind).toBe('victory');
    expect(reaperFleetValue(apex)).toBeLessThan(reaperFleetValue(canon) + 1);
  });

  it('timelines without a Crucible cannot win through it', () => {
    const st = createCampaign({ seed: 6, rules: getPreset('cerberus_ascendant'), worldState: {} });
    expect(st.crucible.available).toBe(false);
    for (let i = 0; i < 20; i++) advanceTick(st, { interactive: false });
    expect(st.crucible.progress).toBe(0);
  });

  it('refusing the Crucible forces a conventional outcome; Prime/Apex can still win that way', () => {
    const st = createCampaign({ seed: 5, rules: getPreset('prime_apex'), worldState: { crucible: 'refuse' } });
    expect(st.crucible.available).toBe(false);
    while (!st.outcome && st.tick < 160) advanceTick(st, { interactive: false });
    expect(st.outcome?.kind).toBe('victory');
    expect(st.outcome?.reason).toMatch(/conventional|Refuse/);
    expect(reaperFleetValue(st)).toBe(0);
  });

  it('round-trips through JSON (save format)', () => {
    const st = createCampaign({ seed: 7, rules: getPreset('prepared_galaxy'), worldState: {} });
    advanceTick(st, { interactive: false });
    const copy = JSON.parse(JSON.stringify(st));
    advanceTick(st, { interactive: false });
    advanceTick(copy, { interactive: false });
    expect(copy.tick).toBe(st.tick);
    expect(copy.fleets.map((f: { location: string }) => f.location)).toEqual(st.fleets.map((f) => f.location));
  });
});

describe('campaign depth', () => {
  it('ground forces slow the harvest and krogan reinforce the homeworlds when the genophage is cured', () => {
    const mk = (ground: number) => {
      const st = createCampaign({ seed: 12, rules: getPreset('canon_me3'), worldState: { genophage: 'sabotaged' } });
      st.fleets = st.fleets.filter((f) => f.allegiance !== 'allied' || f.location !== 'exodus');
      st.fleets.find((f) => f.name === 'Reaper vanguard')!.location = 'exodus';
      st.systems.exodus.ground = ground;
      for (let i = 0; i < 4; i++) advanceTick(st, { interactive: false });
      return st.systems.exodus.population;
    };
    expect(mk(1)).toBeGreaterThan(mk(0));
    const cured = createCampaign({ seed: 12, rules: getPreset('canon_me3'), worldState: { genophage: 'cured' } });
    for (let i = 0; i < 4; i++) advanceTick(cured, { interactive: false });
    expect(cured.flags.krogan_muster).toBeDefined();
    expect(effectiveGround(cured, 'trebia')).toBeGreaterThanOrEqual(cured.systems.trebia.ground);
    expect(cured.events.some((e) => e.kind === 'ground')).toBe(true);
  });

  it('research completes projects that change allied fleet technology in engagements', () => {
    const st = createCampaign({ seed: 13, rules: getPreset('canon_me3'), worldState: {} });
    expect(setResearch(st, 'barrier_overcharge').ok).toBe(true);
    expect(setResearch(st, 'nope').ok).toBe(false);
    let guard = 0;
    while (!st.research.completed.includes('barrier_overcharge') && guard++ < 60) advanceTick(st, { interactive: false });
    expect(st.research.completed).toContain('barrier_overcharge');
    expect(researchTech(st)?.kineticBarrierStrength).toBeCloseTo(st.rules.organic.kineticBarrierStrength * 1.15, 5);
    st.fleets.find((f) => f.name === 'Reaper vanguard')!.location = 'sol';
    advanceTick(st, { interactive: true });
    const cfg = buildEngagement(st, st.pending!);
    expect(cfg.fleets.find((f) => f.side === 'A' && f.name === 'Alliance Fifth Fleet')?.techOverride?.kineticBarrierStrength).toBeCloseTo(st.rules.organic.kineticBarrierStrength * 1.15, 5);
  });

  it('refugees rise with the harvest and political events fire', () => {
    const st = createCampaign({ seed: 14, rules: getPreset('reaper_escalation'), worldState: {} });
    for (let i = 0; i < 30 && !st.outcome; i++) advanceTick(st, { interactive: false });
    expect(st.refugees).toBeGreaterThan(0);
    expect(st.events.some((e) => e.kind === 'political')).toBe(true);
  });

  it('normalises campaign saves from the first build', () => {
    const st = createCampaign({ seed: 15, rules: getPreset('canon_me3'), worldState: {} });
    const old = JSON.parse(JSON.stringify(st)) as Record<string, unknown>;
    delete old.research;
    delete old.refugees;
    delete old.flags;
    for (const s of Object.values(old.systems as Record<string, Record<string, unknown>>)) delete s.ground;
    const fixed = normaliseCampaign(old as unknown as typeof st);
    expect(fixed.research.completed).toEqual([]);
    expect(fixed.systems.sol.ground).toBe(1);
    advanceTick(fixed, { interactive: false });
    expect(fixed.tick).toBe(1);
  });
});

describe('Cerberus Ascendant post-war plan', () => {
  it('runs twenty years deterministically and ends with an outcome', () => {
    const run = () => {
      const st = createPostWar(getPreset('cerberus_ascendant'), 11);
      setAllocation(st, { conventional_fleets: 30, shipbuilding: 20, dismantlement_prep: 15, reinforce_sol: 10, negotiate_council: 10 });
      while (!st.outcome) {
        advanceQuarter(st);
        if (st.quarter % 2 === 0) dismantle(st, 6);
      }
      return st;
    };
    const a = run();
    const b = run();
    expect(a.outcome).toBeDefined();
    expect(a.quarter).toBeLessThanOrEqual(80);
    expect(JSON.stringify(a.metrics)).toBe(JSON.stringify(b.metrics));
    expect(a.outcome?.kind).toBe(b.outcome?.kind);
  });
  it('refuses dismantlement before readiness and allows it later', () => {
    const st = createPostWar(getPreset('cerberus_ascendant'), 3);
    expect(dismantle(st, 3).ok).toBe(false);
    setAllocation(st, { dismantlement_prep: 40, conventional_fleets: 30, shipbuilding: 30 });
    for (let i = 0; i < 24; i++) advanceQuarter(st);
    expect(st.metrics.dismantlementReadiness).toBeGreaterThan(0.3);
    const r = dismantle(st, 2);
    expect(r.ok || r.reason?.includes('defend')).toBe(true);
    expect(requiredConventionalFleet(st)).toBeGreaterThan(0);
  });
  it('a fleet-first plan can complete the dismantlement with a victory', () => {
    const st = createPostWar(getPreset('cerberus_ascendant'), 21);
    setAllocation(st, { conventional_fleets: 28, shipbuilding: 22, dismantlement_prep: 14, reinforce_sol: 12, infrastructure: 10, negotiate_council: 8, rebuild_earth: 6 });
    while (!st.outcome) {
      advanceQuarter(st);
      dismantle(st, 6);
    }
    expect(st.outcome?.kind).toBe('victory');
    expect(st.controlledReapers).toBe(0);
  });
});

describe('Final Battle of Earth', () => {
  it('uses campaign fleets when provided and defaults otherwise', () => {
    const def = buildScenario('final_battle_of_earth', 'canon_me3', 1, { forces: 'default' });
    expect(def.fleets.some((f) => f.ships.some((s) => s.classId === 'harbinger'))).toBe(true);
    const linked = buildScenario('final_battle_of_earth', 'canon_me3', 1, {
      campaignAllied: JSON.stringify([{ name: 'Survivors', faction: 'alliance', counts: { alliance_dreadnought: 2, alliance_cruiser: 5 } }]),
      campaignReaper: JSON.stringify({ reaper_capital: 2, reaper_destroyer: 3 }),
    });
    expect(linked.fleets.find((f) => f.side === 'A')?.name).toBe('Survivors');
    expect(linked.fleets.find((f) => f.side === 'B')?.ships.find((s) => s.classId === 'reaper_capital')?.count).toBe(2);
  });
});

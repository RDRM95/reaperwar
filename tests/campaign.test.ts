import { describe, expect, it } from 'vitest';
import { advanceTick, applyEngagementResult, buildEngagement, createCampaign, fleetShipCount, fleetsAt, orderMove, reaperFleetValue, withdrawFromEngagement } from '@/campaign/engine';
import { RELAYS, SYSTEMS, neighbours, relayPath } from '@/campaign/galaxy';
import { BattleSimulation } from '@/simulation/battle';
import { getPreset } from '@/timelines/presets';

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

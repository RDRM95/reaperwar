import { describe, expect, it } from 'vitest';
import { v3, type Vec3 } from '@/core/vec3';
import { fleet } from '@/scenarios';
import { PLATFORM_WEIGHT, ROGUE_PREFERENCE, scoreTarget } from '@/simulation/ai';
import { BattleSimulation, IDLE_RETRY_S, SIM_DT } from '@/simulation/battle';
import { slotToWorld } from '@/simulation/formations';
import { REAPER_AI } from '@/simulation/reaperAi';
import type { BattleConfig, BattleEvent, FleetSpec, ShipState, VolleyState } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';

/** Reaper AI behaviours (ADOPTION_PLAN.md §10, D10; WORK_BREAKDOWN.md T12, §1.6.3). Every run is deterministic. */

const config = (fleets: FleetSpec[], rulesId = 'canon_me3', seed = 1): BattleConfig => ({ id: 'reaper-ai', name: 'Reaper AI', scenarioId: 'custom', seed, rules: getPreset(rulesId), fleets, environment: 'deep_space', maxDuration: 900, perspectiveSide: 'A', objective: 'Test.' });
const dist = (a: ShipState, p: Vec3): number => Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z);
const muteAll = (ships: ShipState[]): void => {
  for (const s of ships) for (const w of s.weapons) w.cooldown = Infinity;
};

describe('rotate protection (all presets)', () => {
  it('a capital below 35 % barriers trades slots with the healthiest capital; both fly to the new slots, no teleport', () => {
    const canon = getPreset('canon_me3');
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 2 }, name: 'R', side: 'B', formation: 'capital_column', position: v3(0, 0, 16), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, -8), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    muteAll(sim.ships);
    sim.step();
    const enemy = sim.ships.find((s) => s.role === 'dreadnought')!;
    const [front, back] = sim.ships.filter((s) => s.role === 'reaper_capital').sort((x, y) => dist(x, enemy.pos) - dist(y, enemy.pos));
    const frontSlot = { ...front.slot };
    const backSlot = { ...back.slot };
    expect(dist(front, enemy.pos)).toBeLessThan(dist(back, enemy.pos) - 0.5);
    // The front capital's field is down and stays down (its regeneration is suppressed for the test).
    front.barriers = 0.2 * front.maxBarriers;
    front.regenSuppressedUntil = 1e9;
    let swappedAt = -1;
    const prev = new Map<string, Vec3>([front, back].map((s) => [s.id, { ...s.pos }]));
    for (let i = 0; i < 1200; i++) {
      sim.step();
      for (const s of [front, back]) {
        const p = prev.get(s.id)!;
        // Position continuity: no step moves a hull further than its top speed allows.
        expect(dist(s, p)).toBeLessThanOrEqual(s.maxSpeed * SIM_DT + 1e-9);
        prev.set(s.id, { ...s.pos });
      }
      if (swappedAt < 0 && front.slot.z === backSlot.z && front.slot.x === backSlot.x) swappedAt = sim.time;
    }
    expect(swappedAt).toBeGreaterThan(0);
    expect(swappedAt).toBeLessThan(3);
    expect(front.slot).toEqual(backSlot);
    expect(back.slot).toEqual(frontSlot);
    // Each hull has flown to its new slot: the fresh barrier now holds the exposed slot.
    const f = sim.fleets.get('r')!;
    expect(dist(front, slotToWorld(f.anchor, f.heading, front.slot))).toBeLessThan(1.5);
    expect(dist(back, slotToWorld(f.anchor, f.heading, back.slot))).toBeLessThan(1.5);
    expect(dist(back, enemy.pos)).toBeLessThan(dist(front, enemy.pos));
  });
});

describe('kill the active gun platform (all presets)', () => {
  it('the enemy with the highest recent damage scores ×1.4; a silent stealth frigate is never the platform, a revealed one is', () => {
    const canon = getPreset('canon_me3');
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 30), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_cruiser: 2, alliance_frigate_thanix: 1 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -30), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    muteAll(sim.ships);
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const [x, y] = sim.ships.filter((s) => s.classId === 'alliance_cruiser');
    const hunter = sim.ships.find((s) => s.classId === 'alliance_frigate_thanix')!;
    x.stats.recentDamage = 800;
    y.stats.recentDamage = 0;
    hunter.stats.recentDamage = 5000;
    sim.step();
    expect(hunter.stealth!.state).toBe('silent');
    expect(sim.activeGunPlatform('B')).toBe(x);
    // Symmetric geometry: everything but the recent damage equal.
    cap.pos = v3(0, 0, 0);
    cap.heading = v3(0, 0, 1);
    x.pos = v3(-3, 0, 12);
    y.pos = v3(3, 0, 12);
    cap.targetId = undefined;
    cap.solutions = [];
    const rf = sim.fleets.get('r')!;
    rf.focusTargetId = undefined;
    const range = Math.max(...cap.weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range));
    expect(scoreTarget(sim, cap, rf, x, range) / scoreTarget(sim, cap, rf, y, range)).toBeCloseTo(REAPER_AI.gunPlatformBonus, 9);
    // Revealed, the stealth frigate becomes the platform (it out-damages the cruiser); silent again, it never is.
    hunter.stealth!.state = 'revealed';
    hunter.stealth!.revealedUntil = sim.time + 10;
    sim.step();
    expect(sim.activeGunPlatform('B')).toBe(hunter);
    hunter.stealth!.state = 'silent';
    hunter.stealth!.revealedUntil = 0;
    sim.step();
    expect(sim.activeGunPlatform('B')).not.toBe(hunter);
    expect(cap.targetId).not.toBe(hunter.id);
  });
});

describe('cover a damaged capital (all presets)', () => {
  it('below 50 % hull the two nearest destroyers interpose on the line to its attacker; the cover lapses once it recovers', () => {
    const canon = getPreset('canon_me3');
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 3 }, name: 'R', side: 'B', position: v3(0, 0, 18), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, -18), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    muteAll(sim.ships);
    sim.step();
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
    const destroyers = sim.ships.filter((s) => s.role === 'reaper_destroyer');
    cap.hull = 0.4 * cap.maxHull;
    const nearest = [...destroyers].sort((p, q) => dist(p, cap.pos) - dist(q, cap.pos)).slice(0, 2).map((s) => s.id);
    while (!destroyers.some((d) => d.interpose)) sim.step();
    const covering = destroyers.filter((d) => d.interpose?.protectId === cap.id);
    expect(covering.map((d) => d.id).sort()).toEqual([...nearest].sort());
    expect(covering.every((d) => d.interpose!.againstId === dn.id)).toBe(true);
    // Within 10 s each covering destroyer sits on the capital–attacker segment, just outside the capital.
    const t0 = sim.time;
    while (sim.time < t0 + 10) sim.step();
    for (const d of covering) {
      const ax = dn.pos.x - cap.pos.x;
      const ay = dn.pos.y - cap.pos.y;
      const az = dn.pos.z - cap.pos.z;
      const len = Math.hypot(ax, ay, az);
      const u = ((d.pos.x - cap.pos.x) * ax + (d.pos.y - cap.pos.y) * ay + (d.pos.z - cap.pos.z) * az) / (len * len);
      const off = Math.hypot(d.pos.x - (cap.pos.x + ax * u), d.pos.y - (cap.pos.y + ay * u), d.pos.z - (cap.pos.z + az * u));
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(0.5);
      expect(off).toBeLessThan(0.5);
    }
    expect(destroyers.filter((d) => d.interpose).length).toBe(2);
    // Repaired, the capital releases its cover at its next decision.
    cap.hull = cap.maxHull;
    const t1 = sim.time;
    while (sim.time < t1 + 2) sim.step();
    expect(destroyers.some((d) => d.interpose)).toBe(false);
  });

  it('the AI never releases a scripted interpose (the state Specials.interpose sets), only the covers it set itself', () => {
    const canon = getPreset('canon_me3');
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1, reaper_destroyer: 2 }, name: 'R', side: 'B', position: v3(0, 0, 18), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, -18), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    muteAll(sim.ships);
    sim.step();
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const [scripted] = sim.ships.filter((s) => s.role === 'reaper_destroyer');
    // A healthy capital: the AI would release any cover of its own on it at the next decision.
    scripted.interpose = { protectId: cap.id, until: sim.time + 20 };
    const state = scripted.interpose;
    const t0 = sim.time;
    while (sim.time < t0 + 8) sim.step();
    expect(scripted.interpose).toBe(state);
  });
});

describe('abandon a damaged harvest ship (Apex doctrine only)', () => {
  it.each(['canon_me3', 'prime_apex'])('%s: a capital below 20 %% hull is covered under canon, abandoned under the Apex doctrine (no cover, no slot exchange)', (rulesId) => {
    const rules = getPreset(rulesId);
    const r = fleet('r', 'reaper', rules, { counts: { reaper_capital: 2, reaper_destroyer: 2 }, name: 'R', side: 'B', formation: 'capital_column', position: v3(0, 0, 16), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', rules, { counts: { alliance_dreadnought: 1 }, name: 'A', position: v3(0, 0, -8), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r], rulesId));
    muteAll(sim.ships);
    sim.step();
    const enemy = sim.ships.find((s) => s.role === 'dreadnought')!;
    const [front, back] = sim.ships.filter((s) => s.role === 'reaper_capital').sort((x, y) => dist(x, enemy.pos) - dist(y, enemy.pos));
    const frontSlot = { ...front.slot };
    // The exposed capital is a wreck: 15 % hull, barriers down and held down.
    front.hull = 0.15 * front.maxHull;
    front.barriers = 0.1 * front.maxBarriers;
    front.regenSuppressedUntil = 1e9;
    const destroyers = sim.ships.filter((s) => s.role === 'reaper_destroyer');
    for (let i = 0; i < 200; i++) sim.step();
    const covered = destroyers.filter((d) => d.interpose?.protectId === front.id).length;
    if (rulesId === 'canon_me3') {
      expect(covered).toBe(2);
      expect(front.slot).not.toEqual(frontSlot);
    } else {
      expect(getPreset(rulesId).special.reaperDoctrine).toBe('apex');
      expect(covered).toBe(0);
      expect(front.slot).toEqual(frontSlot);
      expect(back.slot).not.toEqual(frontSlot);
    }
  });
});

describe('the threatened group (Apex doctrine only)', () => {
  /** One capital and four destroyers; the capital is destroyed, which leaves the group below 30 % of its points with no capital. */
  const broken = (rulesId: string): { sim: BattleSimulation; destroyers: ShipState[] } => {
    const rules = getPreset(rulesId);
    const r = fleet('r', 'reaper', rules, { counts: { reaper_capital: 1, reaper_destroyer: 4 }, name: 'R', side: 'B', position: v3(0, 0, 40), mult: 1, initialOrder: { order: 'attack', fightersDeployed: false } });
    const a = fleet('a', 'alliance', rules, { counts: { alliance_frigate: 2 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -120), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r], rulesId));
    muteAll(sim.ships);
    for (let i = 0; i < 100; i++) sim.step();
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const shooter = sim.ships.find((s) => s.role === 'frigate')!;
    sim.applyHit(shooter, cap, shooter.weapons[0].def, 1e9, cap.pos);
    expect(cap.alive).toBe(false);
    return { sim, destroyers: sim.ships.filter((s) => s.role === 'reaper_destroyer') };
  };

  it('under canon no Reaper ever withdraws, even below 30 % with no capital', () => {
    const { sim, destroyers } = broken('canon_me3');
    for (let i = 0; i < 1200; i++) {
      sim.step();
      expect(destroyers.some((d) => d.withdrawing)).toBe(false);
    }
    expect(sim.events.some((e) => e.type === 'ship_withdrawing' && sim.getShip(e.shipId)?.faction === 'reaper')).toBe(false);
  });

  it('under reaperDoctrine apex the group falls back to its stations and returns; nothing escapes', () => {
    const { sim, destroyers } = broken('prime_apex');
    expect(getPreset('prime_apex').special.reaperDoctrine).toBe('apex');
    let fellBack = -1;
    let returned = -1;
    for (let i = 0; i < 1600 && returned < 0; i++) {
      sim.step();
      if (fellBack < 0 && destroyers.every((d) => d.withdrawing)) fellBack = sim.time;
      if (fellBack >= 0 && destroyers.every((d) => !d.withdrawing)) returned = sim.time;
      for (const d of destroyers) expect(d.escaped).toBe(false);
    }
    expect(fellBack).toBeGreaterThan(0);
    expect(fellBack).toBeLessThan(5 + 1);
    expect(sim.events.filter((e) => e.type === 'ship_withdrawing' && sim.getShip(e.shipId)?.role === 'reaper_destroyer').length).toBeGreaterThanOrEqual(4);
    // Each fell back to a station behind its fleet's anchor and came back.
    expect(returned).toBeGreaterThan(fellBack);
    expect(returned - fellBack).toBeGreaterThanOrEqual(20 - 1);
    expect(destroyers.every((d) => d.alive && !d.escaped)).toBe(true);
  });
});

describe('never idle, platforms first, rogue hulls', () => {
  it('a Reaper with nothing in range closes on the nearest enemy group', () => {
    const canon = getPreset('canon_me3');
    const r = fleet('r', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'R', side: 'B', position: v3(0, 0, 70), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', canon, { counts: { alliance_frigate: 1 }, name: 'A', position: v3(0, 0, -70), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r]));
    muteAll(sim.ships);
    const cap = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const f = sim.ships.find((s) => s.role === 'frigate')!;
    const range = Math.max(...cap.weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range));
    const d0 = dist(cap, f.pos);
    expect(d0).toBeGreaterThan(range * 1.5);
    for (let i = 0; i < 600; i++) sim.step();
    expect(dist(cap, f.pos)).toBeLessThan(d0 - 3);
    expect(Math.hypot(cap.vel.x, cap.vel.y, cap.vel.z)).toBeGreaterThan(0.3 * cap.maxSpeed);
  });

  it('a Reaper in range of a platform and a cruiser takes the platform first — except while its fleet holds a pending volley', () => {
    const canon = getPreset('canon_me3');
    const build = (): BattleSimulation => {
      const line = fleet('line', 'alliance', canon, { counts: { alliance_cruiser: 1 }, name: 'Line', formation: 'line_abreast', position: v3(0, 0, -4), mult: 1 });
      const plat = fleet('sol-platforms', 'alliance', canon, { counts: { sol_defence_platform: 1 }, name: 'Platform', formation: 'static', position: v3(0, 0, -23), mult: 1 });
      const reaper = fleet('reapers', 'reaper', canon, { counts: { reaper_capital: 1 }, name: 'Reaper', side: 'B', position: v3(0, 0, 14), mult: 1 });
      const sim = new BattleSimulation(config([plat, line, reaper]));
      const cruiser = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
      cruiser.hull = cruiser.maxHull * 0.3;
      cruiser.barriers = 0;
      return sim;
    };
    const sim = build();
    const reaper = sim.ships.find((s) => s.role === 'reaper_capital')!;
    const platform = sim.ships.find((s) => s.role === 'fixed_platform')!;
    const cruiser = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
    const rf = sim.fleets.get('reapers')!;
    const range = Math.max(...reaper.weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range));
    const platScore = scoreTarget(sim, reaper, rf, platform, range);
    const cruScore = scoreTarget(sim, reaper, rf, cruiser, range);
    expect(platScore).toBeGreaterThan(cruScore);
    expect(platScore / PLATFORM_WEIGHT).toBeLessThan(cruScore);
    while (reaper.targetId === undefined) sim.step();
    expect(reaper.targetId).toBe(platform.id);
    const held = build();
    const volley: VolleyState = { at: 1000, window: 2, mounts: 'beams', syncArrival: false, offsets: new Map(), fired: 0, held: 0, silent: 0 };
    held.fleets.get('reapers')!.volley = volley;
    const heldReaper = held.ships.find((s) => s.role === 'reaper_capital')!;
    while (heldReaper.targetId === undefined) held.step();
    expect(heldReaper.targetId).toBe(held.ships.find((s) => s.classId === 'alliance_cruiser')!.id);
  });

  it('Reapers fire at a rogue Cerberus hull, and the rogue hull fires at both sides (preferring the other side)', () => {
    const canon = getPreset('canon_me3');
    // On one line: the Reapers, 8 km on the hostile Cerberus group, 8 km on the Alliance — the rogue group sits in reach
    // of both sides, the two sides out of each other's reach.
    const a = fleet('a', 'alliance', canon, { counts: { alliance_cruiser: 2 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 2 }, name: 'R', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const c = { ...fleet('c', 'cerberus', canon, { counts: { cerberus_frigate: 2 }, name: 'Cerberus (hostile)', side: 'B', position: v3(0, 0, 0), mult: 1, initialOrder: { order: 'hold_formation' } }), rogue: true };
    const sim = new BattleSimulation(config([a, r, c]));
    const cerberus = sim.ships.filter((s) => s.faction === 'cerberus');
    expect(cerberus.every((s) => s.rogue && s.side === 'B')).toBe(true);
    // Rogue hulls are enemies of both sides for targeting; bookkeeping stays with side B.
    const reaperHull = sim.ships.find((s) => s.role === 'reaper_destroyer')!;
    expect(sim.enemiesOfShip(reaperHull).some((s) => s.faction === 'cerberus')).toBe(true);
    expect(sim.enemiesOfShip(cerberus[0]).some((s) => s.faction === 'reaper')).toBe(true);
    expect(sim.enemiesOfShip(cerberus[0]).some((s) => s.faction === 'alliance')).toBe(true);
    const range = Math.max(...cerberus[0].weapons.filter((w) => !w.def.antiSmall).map((w) => w.def.range));
    const fa = sim.fleets.get('c')!;
    const alliance = sim.ships.find((s) => s.faction === 'alliance')!;
    // The rogue preference: the same hull scored as an enemy of the rogue's bookkeeping side weighs ×1.5.
    const rogueScore = scoreTarget(sim, cerberus[0], fa, alliance, range);
    cerberus[0].rogue = false;
    const plainScore = scoreTarget(sim, cerberus[0], fa, alliance, range);
    cerberus[0].rogue = true;
    expect(rogueScore / plainScore).toBeCloseTo(ROGUE_PREFERENCE, 9);
    expect(scoreTarget(sim, cerberus[0], fa, reaperHull, range)).toBeGreaterThan(0);
    const fired: BattleEvent[] = [];
    sim.onEvent = (e) => {
      if (e.type === 'weapon_fired') fired.push(e);
    };
    while (sim.time < 60 && !sim.finished) sim.step();
    const factionOf = (id: string): string | undefined => sim.getShip(id)?.faction;
    const impacts = (from: string, to: string): boolean => sim.events.some((e) => e.type === 'projectile_impact' && factionOf(e.shipId) === from && factionOf(e.targetId) === to);
    // Left to themselves: the Reapers engage the rogue group and it goes for the Alliance (its preference).
    expect(fired.some((e) => e.type === 'weapon_fired' && factionOf(e.shipId) === 'reaper' && factionOf(e.targetId) === 'cerberus')).toBe(true);
    expect(fired.some((e) => e.type === 'weapon_fired' && factionOf(e.shipId) === 'cerberus' && factionOf(e.targetId) === 'alliance')).toBe(true);
    expect(impacts('cerberus', 'alliance')).toBe(true);
    // And it fires on the Reapers too — its rounds hit a hull of its own bookkeeping side (the sweep uses the
    // shooter's targeting set, not its side).
    const rogue = cerberus.find((s) => s.alive)!;
    const prey = sim.ships.find((s) => s.role === 'reaper_destroyer' && s.alive)!;
    expect(sim.issueOrders('c', { order: 'attack_target', targetId: prey.id })).toBe('issued');
    const t0 = sim.time;
    while (sim.time < t0 + 120 && !sim.finished && rogue.alive && prey.alive && !impacts('cerberus', 'reaper')) sim.step();
    expect(fired.some((e) => e.type === 'weapon_fired' && e.shipId === rogue.id && e.targetId === prey.id)).toBe(true);
    expect(impacts('cerberus', 'reaper')).toBe(true);
    // The hostile group fights both sides, never itself: no rogue hull fires at, or hits, a hull of its own group.
    expect(fired.some((e) => e.type === 'weapon_fired' && factionOf(e.shipId) === 'cerberus' && factionOf(e.targetId) === 'cerberus')).toBe(false);
    expect(impacts('cerberus', 'cerberus')).toBe(false);
  });

  it('a rogue hull dealing the most damage is the Reapers’ active gun platform', () => {
    const canon = getPreset('canon_me3');
    const a = fleet('a', 'alliance', canon, { counts: { alliance_cruiser: 1 }, name: 'A', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const r = fleet('r', 'reaper', canon, { counts: { reaper_destroyer: 1 }, name: 'R', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const c = { ...fleet('c', 'cerberus', canon, { counts: { cerberus_cruiser: 1 }, name: 'Cerberus (hostile)', side: 'B', position: v3(0, 0, 0), mult: 1, initialOrder: { order: 'hold_formation' } }), rogue: true };
    const sim = new BattleSimulation(config([a, r, c]));
    muteAll(sim.ships);
    const cruiser = sim.ships.find((s) => s.faction === 'alliance')!;
    const rogue = sim.ships.find((s) => s.faction === 'cerberus')!;
    cruiser.stats.recentDamage = 500;
    rogue.stats.recentDamage = 900;
    sim.step();
    expect(sim.activeGunPlatform('B')).toBe(rogue);
    // Below the Alliance cruiser's recent damage it is not.
    rogue.stats.recentDamage = 100;
    sim.step();
    expect(sim.activeGunPlatform('B')).toBe(cruiser);
  });
});

describe('others continue after Harbinger falls (AP §10 regression)', () => {
  it.each(['canon_me3', 'prime_apex'])('%s: Harbinger’s death changes no other Reaper’s subsystems or cooldowns, and the others fire within 10 s', (rulesId) => {
    const rules = getPreset(rulesId);
    const r = fleet('r', 'reaper', rules, { counts: { reaper_capital: 2, harbinger: 1 }, name: 'R', side: 'B', position: v3(0, 0, 20), mult: 1, initialOrder: { order: 'hold_formation', fightersDeployed: false } });
    const a = fleet('a', 'alliance', rules, { counts: { alliance_dreadnought: 4 }, name: 'A', formation: 'line_abreast', position: v3(0, 0, -20), mult: 1, initialOrder: { order: 'hold_formation' } });
    const sim = new BattleSimulation(config([a, r], rulesId));
    muteAll(sim.ships.filter((s) => s.side === 'A'));
    while (!sim.events.some((e) => e.type === 'weapon_fired' && sim.getShip(e.shipId)?.faction === 'reaper') && sim.time < 30) sim.step();
    const harbinger = sim.ships.find((s) => s.classId === 'harbinger')!;
    const others = sim.ships.filter((s) => s.role === 'reaper_capital' && s !== harbinger);
    const dn = sim.ships.find((s) => s.role === 'dreadnought')!;
    const subsystems = others.map((s) => ({ ...s.subsystems }));
    const cooldowns = others.map((s) => s.weapons.map((w) => w.cooldown));
    sim.applyHit(dn, harbinger, dn.weapons[0].def, 1e9, harbinger.pos);
    expect(harbinger.alive).toBe(false);
    const killedAt = sim.time;
    const before = sim.events.length;
    sim.step();
    const firedNow = new Set(sim.events.slice(before).filter((e) => e.type === 'weapon_fired').map((e) => (e.type === 'weapon_fired' ? `${e.shipId}:${e.weaponIndex}` : '')));
    // No stun, no shutdown: subsystems untouched, every mount either fired or kept counting down (a mount with nothing
    // to shoot at takes the ordinary 0.25 s idle retry).
    others.forEach((s, i) => {
      expect(s.subsystems).toEqual(subsystems[i]);
      s.weapons.forEach((w, k) => {
        if (!firedNow.has(`${s.id}:${w.index}`)) expect(w.cooldown).toBeLessThanOrEqual(Math.max(cooldowns[i][k], IDLE_RETRY_S) + 1e-9);
      });
    });
    while (sim.time < killedAt + 10) sim.step();
    expect(sim.events.some((e) => e.type === 'weapon_fired' && e.t > killedAt && others.some((o) => o.id === e.shipId))).toBe(true);
  });
});

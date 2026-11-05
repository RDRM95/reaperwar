import { describe, expect, it } from 'vitest';
import { HADES_FUSE, HADES_GATE } from '@/data/types';
import { HADES_WARHEAD } from '@/data/weapons';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, SIM_DT, hadesGateOpen } from '@/simulation/battle';
import type { BattleEvent, ShipState, WeaponState } from '@/simulation/types';

/**
 * Project Titan and HADES (ADOPTION_PLAN.md §7; WORK_BREAKDOWN.md §1.6.3 `tests/hades.test.ts`):
 * the residual fuse, the magazine, the AI gate and the hold order; the scripted strikes
 * (`special.hadesStrike`, with and without `force`) since the Specials of T13.
 */

/** A Titan-armed dreadnought and a muted Reaper target, far enough apart that nothing else happens for a while. */
function duel(targetClass: 'reaper_capital' | 'reaper_destroyer', distanceKm: number, rulesId = 'prime_apex', seed = 1) {
  const sim = new BattleSimulation(
    buildCustomBattle({
      seed,
      rulesId,
      environment: 'deep_space',
      startingDistanceKm: distanceKm,
      maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Titan group', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Target', formation: 'capital_column', counts: { [targetClass]: 1 } },
    }),
  );
  const dn = sim.ships.find((s) => s.classId === 'alliance_dreadnought')!;
  const target = sim.ships.find((s) => s.classId === targetClass)!;
  for (const w of target.weapons) w.cooldown = Infinity; // muted: the target never shoots back
  const titan = dn.weapons.find((w) => w.def.id === 'apex_hyper_ma')!;
  return { sim, dn, target, titan };
}

const titanShots = (sim: BattleSimulation, dn: ShipState) => sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === dn.id && e.weaponId === 'apex_hyper_ma');

/** Steps until the mount fires once more; returns the new weapon_fired event. */
function nextTitanShot(sim: BattleSimulation, dn: ShipState, maxSteps = 600) {
  const before = titanShots(sim, dn).length;
  for (let i = 0; i < maxSteps; i++) {
    sim.step();
    const shots = titanShots(sim, dn);
    if (shots.length > before) return shots[shots.length - 1];
  }
  throw new Error('the Titan mount did not fire');
}

describe('the HADES fuse', () => {
  it('a HADES round against a full-barrier capital is absorbed like a slug: hull unchanged, no detonation, residual below the fuse', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 200);
    const impacts = () => sim.events.filter((e) => e.type === 'projectile_impact' && e.targetId === target.id);
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true });
    expect(target.hull).toBe(target.maxHull);
    expect(sim.events.some((e) => e.type === 'hades_detonation')).toBe(false);
    const impact = impacts()[0];
    expect(impact.type === 'projectile_impact' && impact.hullDamage).toBe(0);
    expect(impact.type === 'projectile_impact' && impact.barrierDamage).toBe(titan.def.damage); // ≥ the 1,000-point threshold: full load
    expect(target.barriers).toBeCloseTo(target.maxBarriers - titan.def.damage, 6);
    expect(target.outageUntil).toBeUndefined();
    expect(target.regenSuppressedUntil).toBe(0);
  });

  it('against a capital with collapsed barriers the warhead fires: kinetic step plus 2,260 inside, one outage, regen suppressed, exactly one event', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 200);
    target.barriers = 0;
    const hullBefore = target.hull;
    const t0 = sim.time;
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true });
    const detonations = sim.events.filter((e) => e.type === 'hades_detonation');
    expect(detonations.length).toBe(1);
    const d = detonations[0];
    if (d.type !== 'hades_detonation') throw new Error('unreachable');
    expect(d.shipId).toBe(dn.id);
    expect(d.targetId).toBe(target.id);
    expect(d.damage).toBe(HADES_WARHEAD.damage);
    expect(['weapons', 'engines']).toContain(d.outage);
    // Hull: the kinetic step (half the armour ignored) plus the whole warhead, barriers and armour ignored.
    const kinetic = sim.events.filter((e) => e.type === 'projectile_impact' && e.targetId === target.id)[0];
    const kineticHull = kinetic.type === 'projectile_impact' ? kinetic.hullDamage : 0;
    expect(kineticHull).toBeGreaterThan(0.5 * titan.def.damage);
    expect(hullBefore - target.hull).toBeCloseTo(kineticHull + 2260, 6);
    // The outage drops the subsystem by 0.3 and the regen suppression lasts 6 s.
    expect(target.subsystems[d.outage]).toBeCloseTo(0.7, 6);
    expect(target.outageUntil).toEqual({ subsystem: d.outage, until: t0 + HADES_WARHEAD.subsystemOutage.seconds, amount: expect.closeTo(0.3, 6) });
    expect(target.regenSuppressedUntil).toBeCloseTo(t0 + HADES_WARHEAD.regenSuppressSeconds, 6);
    // M1 would restore 1,000 barrier points per second; nothing comes back for 6 s, then recovery resumes.
    for (let i = 0; i < Math.round(5.9 / SIM_DT); i++) sim.step();
    expect(target.barriers).toBe(0);
    for (let i = 0; i < Math.round(0.5 / SIM_DT); i++) sim.step();
    expect(target.barriers).toBeGreaterThan(0);
    // The outage is restored 8 s after the burst.
    for (let i = 0; i < Math.round(2 / SIM_DT); i++) sim.step();
    expect(sim.time).toBeGreaterThanOrEqual(t0 + 8);
    expect(target.subsystems[d.outage]).toBeCloseTo(1, 6);
    expect(target.outageUntil).toBeUndefined();
    expect(sim.events.filter((e) => e.type === 'hades_detonation').length).toBe(1);
  });

  it('flips at the boundary: a barrier holding just under half the round arms the warhead, just over does not', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 200);
    const raw = titan.def.damage;
    target.barriers = HADES_FUSE.residualFraction * raw + 1;
    sim.applyHit(dn, target, titan.def, raw, target.pos, { special: true });
    expect(sim.events.filter((e) => e.type === 'hades_detonation').length).toBe(0);
    target.barriers = HADES_FUSE.residualFraction * raw - 1;
    sim.applyHit(dn, target, titan.def, raw, target.pos, { special: true });
    expect(sim.events.filter((e) => e.type === 'hades_detonation').length).toBe(1);
  });

  it('a forced penetrating strike detonates against an intact barrier and honours the named outage', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 200);
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true, forcePenetrate: true, outage: 'weapons' });
    const d = sim.events.find((e) => e.type === 'hades_detonation');
    expect(d && d.type === 'hades_detonation' && d.outage).toBe('weapons');
    expect(target.subsystems.weapons).toBeCloseTo(0.7, 6);
    expect(target.hull).toBeLessThan(target.maxHull);
  });

  it('a second burst on the same subsystem deepens and extends the outage; one on another subsystem restores the first', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 200);
    target.barriers = 0;
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true, outage: 'engines' });
    for (let i = 0; i < 40; i++) sim.step();
    target.barriers = 0;
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true, outage: 'engines' });
    expect(target.subsystems.engines).toBeCloseTo(0.4, 6);
    expect(target.outageUntil?.amount).toBeCloseTo(0.6, 6);
    expect(target.outageUntil?.until).toBeCloseTo(sim.time + 8, 6);
    target.barriers = 0;
    sim.applyHit(dn, target, titan.def, titan.def.damage, target.pos, { special: true, outage: 'weapons' });
    expect(target.subsystems.engines).toBeCloseTo(1, 6);
    expect(target.subsystems.weapons).toBeCloseTo(0.7, 6);
    expect(target.outageUntil?.subsystem).toBe('weapons');
  });
});

describe('an intercepted penetrator', () => {
  it('a destroyer with collapsed barriers on the line intercepts a gated HADES round: kinetic damage only, no internal effect, one round spent', () => {
    // The geometry T12's cover behaviour creates on purpose: a degraded capital (gate open) with a destroyer parked on the
    // capital–attacker line. The destroyer's hull pool is raised so it survives the kinetic step — a stock destroyer
    // dies to it, and a destroyed hull never takes a warhead, which would hide the question this test asks.
    const sim = new BattleSimulation(
      buildCustomBattle({
        seed: 1,
        rulesId: 'prime_apex',
        environment: 'deep_space',
        startingDistanceKm: 12,
        maxDuration: 600,
        sideA: { faction: 'alliance', name: 'Titan group', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
        sideB: { faction: 'reaper', name: 'Target', formation: 'capital_column', counts: { reaper_capital: 1, reaper_destroyer: 1 } },
      }),
    );
    const dn = sim.ships.find((s) => s.classId === 'alliance_dreadnought')!;
    const capital = sim.ships.find((s) => s.classId === 'reaper_capital')!;
    const destroyer = sim.ships.find((s) => s.classId === 'reaper_destroyer')!;
    const titan = dn.weapons.find((w) => w.def.id === 'apex_hyper_ma')!;
    for (const s of [dn, capital, destroyer]) {
      s.maxSpeed = 0; // held in place (slew only), so the line stays a line
      if (s.side === 'B') for (const w of s.weapons) w.cooldown = Infinity;
      if (s.hangar) s.hangar.remaining = 0;
    }
    dn.pos = { x: 0, y: 0, z: -6 };
    dn.heading = { x: 0, y: 0, z: 1 };
    capital.pos = { x: 0, y: 0, z: 6 };
    capital.heading = { x: 0, y: 0, z: -1 };
    destroyer.pos = { x: 0, y: 0, z: 4.5 };
    capital.barriers = 0.05 * capital.maxBarriers;
    capital.barrierRegen = 0;
    capital.regenSuppressedUntil = 1e9;
    destroyer.barriers = 0;
    destroyer.barrierRegen = 0;
    destroyer.maxHull = destroyer.hull = 1e6;
    expect(hadesGateOpen(capital)).toBe(true);
    sim.orderShipsAttack([dn.id], capital.id);

    // The first penetrator whose hit roll succeeded (it flies at the capital's centre, through the destroyer); a round
    // rolled as a miss is offset by more than a capital's radius and passes the destroyer.
    let shot: BattleEvent | undefined;
    let specialShots = 0;
    let ammoAfterShot = -1;
    while (!shot && sim.time < 90) {
      const n = sim.events.length;
      sim.step();
      for (const e of sim.events.slice(n)) {
        if (e.type !== 'weapon_fired' || e.shipId !== dn.id || !e.special) continue;
        specialShots++;
        const round = sim.projectiles.find((p) => p.id === e.projectileId);
        expect(round?.special).toBe(true);
        if (round && !round.rolledMiss && !shot) {
          shot = e;
          ammoAfterShot = titan.specialAmmo ?? -1;
        }
      }
    }
    if (shot?.type !== 'weapon_fired') throw new Error('no penetrator fired on a successful roll');
    expect(shot.targetId).toBe(capital.id);
    expect(ammoAfterShot).toBe(12 - specialShots); // one round per penetrator, spent when it leaves the gun
    // It strikes the destroyer on the line, not the capital behind it.
    const projectileId = shot.projectileId;
    const impactOf = () => sim.events.find((e) => e.type === 'projectile_impact' && e.projectileId === projectileId);
    const hullBefore = destroyer.hull;
    const end = sim.time + 3;
    while (!impactOf() && sim.time < end) sim.step();
    const impact = impactOf()!;
    if (impact?.type !== 'projectile_impact') throw new Error('the penetrator struck nothing');
    expect(impact.targetId).toBe(destroyer.id);
    expect(impact.special).toBeUndefined();
    expect(impact.penetrated).toBe(true); // the round got through the collapsed field: only the warhead is withheld
    expect(sim.events.some((e) => e.type === 'hades_detonation')).toBe(false);
    expect(destroyer.hull).toBeCloseTo(hullBefore - impact.hullDamage, 6); // kinetic damage only
    expect(destroyer.outageUntil).toBeUndefined();
    expect(destroyer.regenSuppressedUntil).toBe(0);
    expect(capital.hull).toBe(capital.maxHull);
    expect(titan.specialAmmo).toBe(ammoAfterShot); // the interception refunds nothing and spends nothing more
    // Every penetrator that struck the destroyer so far (rolled misses included) was a slug there.
    const special = new Set(titanShots(sim, dn).flatMap((e) => (e.type === 'weapon_fired' && e.special && e.projectileId !== undefined ? [e.projectileId] : [])));
    const onDestroyer = sim.events.filter((e) => e.type === 'projectile_impact' && e.targetId === destroyer.id && e.projectileId !== undefined && special.has(e.projectileId));
    expect(onDestroyer.length).toBeGreaterThanOrEqual(1);
    expect(onDestroyer.every((e) => e.type === 'projectile_impact' && e.special === undefined)).toBe(true);
  });
});

describe('the HADES gate and magazine', () => {
  it('a Titan mount facing an intact capital fires an ordinary slug and keeps its twelve penetrators', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    expect(titan.specialAmmo).toBe(12);
    expect(titan.def.hadesRound).toBeDefined();
    expect(hadesGateOpen(target)).toBe(false);
    const shot = nextTitanShot(sim, dn);
    expect(shot.type === 'weapon_fired' && shot.special).toBeUndefined();
    expect(shot.type === 'weapon_fired' && shot.targetId).toBe(target.id);
    expect(titan.specialAmmo).toBe(12);
    expect(sim.projectiles.filter((p) => p.shooterId === dn.id).every((p) => !p.special)).toBe(true);
  });

  it('with the capital degraded below the gate fraction the mount fires a HADES round and reads 11', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    target.barrierRegen = 0; // keep the field down for the test (M1 would refill a tenth of it in 0.7 s)
    target.barriers = target.maxBarriers * (HADES_GATE.barrierFractionBelow - 0.05);
    expect(hadesGateOpen(target)).toBe(true);
    const shot = nextTitanShot(sim, dn);
    expect(shot.type === 'weapon_fired' && shot.special).toBe(true);
    expect(titan.specialAmmo).toBe(11);
    const round = sim.projectiles.find((p) => p.shooterId === dn.id && p.weapon.id === 'apex_hyper_ma');
    expect(round?.special).toBe(true);
    // Just above the gate the field is still "intact" to the AI.
    target.barriers = target.maxBarriers * (HADES_GATE.barrierFractionBelow + 0.05);
    expect(hadesGateOpen(target)).toBe(false);
    target.barriers = 0;
    expect(hadesGateOpen(target)).toBe(true);
  });

  it('never spends a penetrator on a destroyer, even with its barriers down', () => {
    const { sim, dn, target, titan } = duel('reaper_destroyer', 40);
    target.barriers = 0;
    target.barrierRegen = 0;
    expect(hadesGateOpen(target)).toBe(false);
    const shot = nextTitanShot(sim, dn);
    expect(shot.type === 'weapon_fired' && shot.special).toBeUndefined();
    expect(titan.specialAmmo).toBe(12);
  });

  it('holdSpecialAmmo keeps the magazine full against a collapsed capital; an empty magazine fires slugs', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    target.barrierRegen = 0;
    target.barriers = 0;
    sim.issueOrders('custom-a', { holdSpecialAmmo: true });
    expect(sim.useSpecialAmmo(dn, titan, target)).toBe(false);
    let shot = nextTitanShot(sim, dn);
    expect(shot.type === 'weapon_fired' && shot.special).toBeUndefined();
    expect(titan.specialAmmo).toBe(12);
    sim.issueOrders('custom-a', { holdSpecialAmmo: false });
    expect(sim.useSpecialAmmo(dn, titan, target)).toBe(true);
    titan.specialAmmo = 0;
    expect(sim.useSpecialAmmo(dn, titan, target)).toBe(false);
    shot = nextTitanShot(sim, dn);
    expect(shot.type === 'weapon_fired' && shot.special).toBeUndefined();
    expect(titan.specialAmmo).toBe(0);
    // Without hadesRounds there is no magazine at all (canon never carries one).
    const canon = duel('reaper_capital', 40, 'canon_me3');
    expect(canon.dn.weapons.find((w: WeaponState) => w.def.id === 'apex_hyper_ma')).toBeUndefined();
    expect(canon.dn.weapons[0].specialAmmo).toBeUndefined();
  });

  it('the magazine is spent when the round leaves the gun and the battle stays deterministic with HADES events in it', () => {
    const run = (steps: number) => {
      const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 7, { fleet_scaling: 'fixed' }));
      for (let i = 0; i < steps; i++) sim.step();
      return sim;
    };
    const a = run(1600);
    const b = run(1600);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    const full = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 7, { fleet_scaling: 'fixed' }));
    full.run();
    const fired = full.events.filter((e) => e.type === 'weapon_fired' && e.special).length;
    const detonations = full.events.filter((e) => e.type === 'hades_detonation').length;
    expect(fired).toBeGreaterThan(0);
    expect(detonations).toBeGreaterThan(0);
    expect(detonations).toBeLessThanOrEqual(fired);
    const titanMounts = full.ships.flatMap((s) => s.weapons.filter((w) => w.def.id === 'apex_hyper_ma'));
    const remaining = titanMounts.reduce((a, w) => a + (w.specialAmmo ?? 0), 0);
    expect(fired + remaining).toBe(12 * titanMounts.length);
    // Every penetrator that detonated killed through the warhead or was followed by kinetic work: at least one Reaper loss by cause 'warhead' or 'kinetic'.
    expect(full.events.some((e) => e.type === 'ship_destroyed' && e.faction === 'reaper' && (e.cause === 'warhead' || e.cause === 'kinetic'))).toBe(true);
  }, 120_000);
});

describe('scripted strikes (Specials.hadesStrike, T13)', () => {
  /** Steps until a `hades_detonation` (or a Titan shot, with `untilShot`) appears; fails after `seconds`. */
  const stepUntil = (sim: BattleSimulation, pred: () => boolean, seconds = 10): void => {
    const end = sim.time + seconds;
    while (!pred() && sim.time < end) sim.step();
    expect(pred()).toBe(true);
  };

  it("force 'hit_penetrating' detonates against an intact barrier, honours outage 'weapons' and is logged as forced", () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    sim.step();
    expect(target.barriers).toBe(target.maxBarriers);
    expect(sim.special.hadesStrike(dn.id, target.id, { force: 'hit_penetrating', outage: 'weapons', beatId: 'strike' })).toBe('applied');
    expect(sim.events.some((e) => e.type === 'scripted_event' && e.special === 'hades_strike' && e.forced && e.beatId === 'strike')).toBe(true);
    expect(sim.events.some((e) => e.type === 'strike_scheduled' && e.shipId === dn.id && e.kind === 'hades')).toBe(true);
    stepUntil(sim, () => sim.events.some((e) => e.type === 'hades_detonation'));
    const shot = titanShots(sim, dn).at(-1)!;
    expect(shot.type === 'weapon_fired' && shot.special && shot.forced).toBe(true);
    const det = sim.events.find((e) => e.type === 'hades_detonation')!;
    expect(det.type === 'hades_detonation' && det.outage).toBe('weapons');
    expect(det.type === 'hades_detonation' && shot.type === 'weapon_fired' && det.projectileId).toBe(shot.type === 'weapon_fired' ? shot.projectileId : -1);
    expect(titan.specialAmmo).toBe(11);
    expect(target.subsystems.weapons).toBeLessThan(1);
  });

  it('without force the gate and the fuse still decide: an intact capital draws a slug and the magazine stays full', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    sim.step();
    expect(sim.special.hadesStrike(dn.id, target.id)).toBe('applied');
    expect(sim.events.some((e) => e.type === 'scripted_event' && e.special === 'hades_strike' && !e.forced)).toBe(true);
    const shot = nextTitanShot(sim, dn, 200);
    expect(shot.type === 'weapon_fired' && shot.special).toBeUndefined();
    expect(shot.type === 'weapon_fired' && shot.forced).toBe(true);
    expect(titan.specialAmmo).toBe(12);
    sim.skipTo(sim.time + 3);
    expect(sim.events.some((e) => e.type === 'hades_detonation')).toBe(false);
  });

  it('without force, against a gated capital the order sends a penetrator even under holdSpecialAmmo (the order lifts the hold)', () => {
    const { sim, dn, target, titan } = duel('reaper_capital', 40);
    sim.issueOrders(dn.fleetId, { holdSpecialAmmo: true });
    target.barriers = 0.1 * target.maxBarriers;
    target.regenSuppressedUntil = 1e9;
    expect(hadesGateOpen(target)).toBe(true);
    sim.step();
    expect(sim.special.hadesStrike(dn.id, target.id, { rounds: 2 })).toBe('applied');
    const first = nextTitanShot(sim, dn, 200);
    expect(first.type === 'weapon_fired' && first.special).toBe(true);
    expect(titan.specialAmmo).toBe(11);
    // The second round is queued on the mount and leaves once the gun has reloaded.
    const second = nextTitanShot(sim, dn, 400);
    expect(second.type === 'weapon_fired' && second.special && second.forced).toBe(true);
    expect(second.t - first.t).toBeGreaterThanOrEqual(0.95 * titan.def.cooldown - 1e-9);
    expect(titan.specialAmmo).toBe(10);
    expect(titan.forcedShot).toBeUndefined();
  });

  it('a hull without penetrators cannot be ordered to strike', () => {
    const canon = duel('reaper_capital', 40, 'canon_me3');
    expect(canon.sim.special.hadesStrike(canon.dn.id, canon.target.id, { force: 'hit_penetrating' })).toBe('skipped');
  });
});

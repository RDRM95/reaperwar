import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, MOUNT_HEAT_CAPACITY, SIM_DT } from '@/simulation/battle';
import type { ShipState } from '@/simulation/types';

/**
 * The remaining T6 mechanics (WORK_BREAKDOWN.md T6; ADOPTION_PLAN.md §8, §14.3; brief §15.2):
 * per-mount heat, the legacy Nova charge, torpedo salvos, the Valkyrie's degraded-target bonus and
 * the stealth heat rule (a silent hull radiates nothing; venting is forced at capacity).
 */

function custom(rulesId: string, a: Record<string, number>, b: Record<string, number>, distanceKm: number, seed = 1) {
  return new BattleSimulation(
    buildCustomBattle({
      seed,
      rulesId,
      environment: 'deep_space',
      startingDistanceKm: distanceKm,
      maxDuration: 600,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: a },
      sideB: { faction: 'reaper', name: 'B', formation: 'capital_column', counts: b },
    }),
  );
}

const mute = (ship: ShipState) => {
  for (const w of ship.weapons) w.cooldown = Infinity;
};

describe('per-mount heat (heavy Thanix channels)', () => {
  it('a heavy Thanix channel keeps its own heat pool, never warms the hull, and locks out at capacity', () => {
    const sim = custom('prime_apex', { normandy_valkyrie: 1 }, { reaper_capital: 1 }, 30); // 12 km apart in the compressed battlespace: inside the 13.6 km heavy-Thanix range
    const valkyrie = sim.ships.find((s) => s.classId === 'normandy_valkyrie')!;
    const capital = sim.ships.find((s) => s.classId === 'reaper_capital')!;
    mute(capital);
    const channels = valkyrie.weapons.filter((w) => w.def.id === 'thanix_heavy');
    expect(channels.length).toBe(3);
    for (const w of channels) expect(w.heat).toBe(0);
    for (const w of valkyrie.weapons) if (!w.def.perMountHeat) w.cooldown = Infinity; // only the channels fire
    for (let i = 0; i < 400; i++) sim.step();
    const fired = sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === valkyrie.id && e.weaponId === 'thanix_heavy');
    expect(fired.length).toBeGreaterThan(0);
    expect(valkyrie.heat).toBe(0);
    expect(channels.some((w) => (w.heat ?? 0) > 0)).toBe(true);
    // Lockout: a channel whose next burst would exceed the capacity waits until it has cooled (8 %/s).
    const hot = channels[0];
    const shotsOf = (w: typeof hot) => sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === valkyrie.id && e.weaponIndex === w.index).length;
    hot.beamRemaining = 0;
    hot.heat = MOUNT_HEAT_CAPACITY - 1;
    hot.cooldown = 0;
    const atLock = shotsOf(hot);
    for (let i = 0; i < Math.round(1 / SIM_DT); i++) sim.step();
    expect(shotsOf(hot)).toBe(atLock); // still too hot after 1 s (99 → 91: a 30-heat burst does not fit)
    for (let i = 0; i < Math.round(5 / SIM_DT); i++) sim.step();
    expect(shotsOf(hot)).toBeGreaterThan(atLock); // cooled under 70: the burst fits again
    expect(valkyrie.heat).toBe(0);
  });
});

describe('the legacy Nova charge (apex_legacy only)', () => {
  it('is fitted only under legacyNova, charges visibly for six seconds without turning, then fires', () => {
    const core = custom('prime_apex', { normandy_valkyrie: 1 }, { reaper_capital: 1 }, 40);
    expect(core.ships.find((s) => s.classId === 'normandy_valkyrie')!.weapons.some((w) => w.def.id === 'nova_legacy')).toBe(false);
    const sim = custom('apex_legacy', { normandy_valkyrie: 1 }, { reaper_capital: 1 }, 40);
    const valkyrie = sim.ships.find((s) => s.classId === 'normandy_valkyrie')!;
    mute(sim.ships.find((s) => s.classId === 'reaper_capital')!);
    const nova = valkyrie.weapons.find((w) => w.def.id === 'nova_legacy')!;
    expect(nova.def.chargeTime).toBe(6);
    expect(nova.ammo).toBe(12);
    let charging: { t: number } | undefined;
    for (let i = 0; i < 1200 && !charging; i++) {
      sim.step();
      const e = sim.events.find((ev) => ev.type === 'weapon_charging' && ev.shipId === valkyrie.id && ev.weaponIndex === nova.index);
      if (e) charging = { t: e.t };
    }
    expect(charging).toBeDefined();
    expect(nova.charging).toBeCloseTo(6, 6);
    const heading = { ...valkyrie.heading };
    const novaShots = () => sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === valkyrie.id && e.weaponId === 'nova_legacy');
    for (let i = 0; i < Math.round(5.9 / SIM_DT); i++) {
      sim.step();
      expect(valkyrie.heading).toEqual(heading); // no turn during the charge
      expect(novaShots().length).toBe(0);
    }
    for (let i = 0; i < 4; i++) sim.step();
    expect(novaShots().length).toBe(1);
    expect(novaShots()[0].t).toBeGreaterThanOrEqual(charging!.t + 6 - 1e-6);
    expect(nova.charging).toBeUndefined();
    expect(nova.ammo).toBe(11);
  });
});

describe('torpedo salvos and the degraded-target bonus', () => {
  it('a Javelin rack launches four torpedoes per salvo and spends one magazine round', () => {
    const duel = new BattleSimulation(
      buildCustomBattle({
        seed: 2,
        rulesId: 'prime_apex',
        environment: 'deep_space',
        startingDistanceKm: 12, // 4.8 km apart: inside the 6.4 km Javelin range from the start
        maxDuration: 600,
        sideA: { faction: 'cerberus', name: 'Black Fleet', formation: 'line_abreast', counts: { cerberus_heavy_cruiser: 1 } },
        sideB: { faction: 'reaper', name: 'B', formation: 'capital_column', counts: { reaper_capital: 1 } },
      }),
    );
    const cruiser = duel.ships.find((s) => s.classId === 'cerberus_heavy_cruiser')!;
    mute(duel.ships.find((s) => s.classId === 'reaper_capital')!);
    const rack = cruiser.weapons.find((w) => w.def.id === 'javelin_rack')!;
    expect(rack.ammo).toBe(4);
    let salvo: { t: number; shots?: number } | undefined;
    for (let i = 0; i < 2400 && !salvo; i++) {
      duel.step();
      const e = duel.events.find((ev) => ev.type === 'weapon_fired' && ev.shipId === cruiser.id && ev.weaponId === 'javelin_rack');
      if (e && e.type === 'weapon_fired') {
        salvo = { t: e.t, shots: e.shots };
        expect(duel.missiles.filter((m) => m.shooterId === cruiser.id && m.weapon.id === 'javelin_rack').length).toBe(4);
      }
    }
    expect(salvo?.shots).toBe(4);
    expect(rack.ammo).toBe(3);
    expect(cruiser.stats.shotsFired).toBeGreaterThanOrEqual(4);
  });

  it('the Nova Array does ×1.5 against a target whose barriers are below half', () => {
    const sim = custom('prime_apex', { normandy_valkyrie: 1 }, { reaper_capital: 2 }, 200);
    const valkyrie = sim.ships.find((s) => s.classId === 'normandy_valkyrie')!;
    const nova = valkyrie.weapons.find((w) => w.def.id === 'nova_array')!.def;
    expect(nova.degradedTargetBonus).toEqual({ barrierFractionBelow: 0.5, multiplier: 1.5 });
    const [intact, degraded] = sim.ships.filter((s) => s.classId === 'reaper_capital');
    sim.applyHit(valkyrie, intact, nova, nova.damage, intact.pos);
    degraded.barriers = degraded.maxBarriers * 0.4;
    sim.applyHit(valkyrie, degraded, nova, nova.damage, degraded.pos);
    const impacts = sim.events.filter((e) => e.type === 'projectile_impact' && e.shipId === valkyrie.id);
    expect(impacts.length).toBe(2);
    expect(impacts[0].type === 'projectile_impact' && impacts[0].damage).toBeCloseTo(nova.damage, 6);
    expect(impacts[1].type === 'projectile_impact' && impacts[1].damage).toBeCloseTo(nova.damage * 1.5, 6);
    // Without the bonus a plain slug of the same size does the plain amount.
    const plain = { ...nova, degradedTargetBonus: undefined };
    sim.applyHit(valkyrie, degraded, plain, nova.damage, degraded.pos);
    const last = sim.events.filter((e) => e.type === 'projectile_impact' && e.shipId === valkyrie.id).pop()!;
    expect(last.type === 'projectile_impact' && last.damage).toBeCloseTo(nova.damage, 6);
  });
});

describe('the stealth heat rule (brief §15.2)', () => {
  it('a silent hull radiates nothing: its heat does not decay and the sink fills; an ordinary frigate cools', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'canon_me3', 1));
    const normandy = sim.ships.find((s) => s.classId === 'normandy_sr2')!;
    const frigate = sim.ships.find((s) => s.classId === 'alliance_frigate')!;
    expect(normandy.stealth?.state).toBe('silent');
    normandy.heat = 50;
    frigate.heat = 50;
    for (let i = 0; i < 20; i++) sim.step();
    expect(normandy.heat).toBe(50);
    expect(normandy.stealth?.sinkHeat).toBeCloseTo(1, 6);
    expect(frigate.heat).toBeLessThan(50);
    expect(frigate.stealth).toBeUndefined();
    expect(sim.events.some((e) => e.type === 'stealth_engaged' || e.type === 'stealth_revealed' || e.type === 'stealth_venting')).toBe(false);
  });

  it('venting is forced at capacity: the hull is revealed, sheds heat for the vent time and runs silent again with an empty sink', () => {
    const sim = custom('canon_me3', { normandy_sr2: 1 }, { reaper_destroyer: 1 }, 240);
    const normandy = sim.ships.find((s) => s.classId === 'normandy_sr2')!;
    const st = normandy.stealth!;
    normandy.heat = 80;
    st.sinkHeat = st.capacity - 0.5;
    for (let i = 0; i < 12; i++) sim.step();
    expect(st.state).toBe('venting');
    const ventStart = sim.events.find((e) => e.type === 'stealth_venting' && e.shipId === normandy.id);
    expect(ventStart).toBeDefined();
    const revealed = sim.events.find((e) => e.type === 'stealth_revealed' && e.shipId === normandy.id);
    expect(revealed && revealed.type === 'stealth_revealed' && revealed.reason).toBe('venting');
    expect(st.ventingUntil).toBeCloseTo(ventStart!.t + st.ventTime, 6);
    const heatAtVent = normandy.heat;
    for (let i = 0; i < Math.round(17 / SIM_DT); i++) sim.step();
    expect(st.state).toBe('venting');
    expect(normandy.heat).toBeLessThan(heatAtVent); // cooling resumed while venting
    expect(st.sinkHeat).toBeLessThan(st.capacity * 0.1);
    for (let i = 0; i < Math.round(1.2 / SIM_DT); i++) sim.step();
    expect(st.state).toBe('silent');
    expect(st.sinkHeat).toBeLessThan(1); // emptied at the end of the vent, refilling again while silent
    expect(sim.events.filter((e) => e.type === 'stealth_engaged' && e.shipId === normandy.id).length).toBe(1);
    expect(normandy.heat).toBe(0); // 18 s of a 110-capacity hull's cooling clears 80 heat
  });

  it('firing reveals a silent hull for revealOnFire seconds, taking a hit reveals it too, and nothing else emits stealth events', () => {
    const sim = custom('canon_me3', { normandy_sr2: 1 }, { reaper_destroyer: 1 }, 20);
    const normandy = sim.ships.find((s) => s.classId === 'normandy_sr2')!;
    const destroyer = sim.ships.find((s) => s.classId === 'reaper_destroyer')!;
    mute(destroyer);
    const st = normandy.stealth!;
    let firstShot: number | undefined;
    for (let i = 0; i < 1200 && firstShot === undefined; i++) {
      sim.step();
      const e = sim.events.find((ev) => ev.type === 'weapon_fired' && ev.shipId === normandy.id);
      if (e) firstShot = e.t;
    }
    expect(firstShot).toBeDefined();
    expect(st.state).toBe('revealed');
    const reveal = sim.events.find((e) => e.type === 'stealth_revealed' && e.shipId === normandy.id);
    expect(reveal && reveal.type === 'stealth_revealed' && reveal.reason).toBe('fired');
    expect(reveal!.t).toBeCloseTo(firstShot!, 6);
    expect(st.revealedUntil).toBeCloseTo(firstShot! + st.revealOnFire, 6);
    // Silence the guns: ten seconds after the last shot the hull runs silent again.
    mute(normandy);
    while (sim.time < st.revealedUntil - 0.1) sim.step();
    expect(st.state).toBe('revealed');
    for (let i = 0; i < 4; i++) sim.step();
    expect(st.state).toBe('silent');
    expect(sim.events.filter((e) => e.type === 'stealth_engaged' && e.shipId === normandy.id).length).toBe(1);
    // A hit reveals it again.
    sim.applyHit(destroyer, normandy, destroyer.weapons[0].def, 10, normandy.pos);
    expect(st.state).toBe('revealed');
    const hits = sim.events.filter((e) => e.type === 'stealth_revealed' && e.shipId === normandy.id);
    const lastReveal = hits[hits.length - 1];
    expect(lastReveal.type === 'stealth_revealed' && lastReveal.reason).toBe('hit');
    // Only stealth hulls ever emit stealth events.
    const earth = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 42));
    for (let i = 0; i < 600; i++) earth.step();
    const stealthEvents = earth.events.filter((e) => e.type === 'stealth_engaged' || e.type === 'stealth_revealed' || e.type === 'stealth_venting');
    for (const e of stealthEvents) expect(earth.getShip((e as { shipId: string }).shipId)?.classId).toBe('normandy_sr2');
  });
});

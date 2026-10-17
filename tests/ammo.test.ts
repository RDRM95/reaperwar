import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { getWeapon } from '@/data/weapons';

describe('finite ammunition and heat-limited point defence', () => {
  it('torpedo tubes carry a magazine and stop firing when it is spent', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 3, {}));
    const frigate = sim.ships.find((s) => s.classId === 'alliance_frigate')!;
    const tubes = frigate.weapons.filter((w) => w.def.kind === 'disruptor_torpedo');
    expect(tubes.length).toBeGreaterThan(0);
    for (const t of tubes) expect(t.ammo).toBe(getWeapon('disruptor_torpedo').magazine);
    // Drain one frigate's tubes directly and confirm the simulation refuses to fire them.
    for (const t of tubes) t.ammo = 0;
    const fired = frigate.stats.shotsFired;
    const torpedoEvents = () => sim.events.filter((e) => e.type === 'weapon_fired' && e.shipId === frigate.id && e.kind === 'disruptor_torpedo').length;
    const before = torpedoEvents();
    for (let i = 0; i < 400 && !sim.finished; i++) sim.step();
    expect(torpedoEvents()).toBe(before);
    expect(frigate.stats.shotsFired).toBeGreaterThanOrEqual(fired);
  });

  it('reports depleted magazines once the last round in a battery is fired', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 5, {}));
    for (const s of sim.ships) for (const w of s.weapons) if (w.def.kind === 'disruptor_torpedo') w.ammo = 1;
    for (let i = 0; i < 2400 && !sim.finished; i++) sim.step();
    const depleted = sim.events.filter((e) => e.type === 'ammunition_depleted');
    expect(depleted.length).toBeGreaterThan(0);
    const ship = sim.getShip((depleted[0] as { shipId: string }).shipId)!;
    expect(ship.weapons.filter((w) => w.def.kind === 'disruptor_torpedo').every((w) => w.ammo === 0)).toBe(true);
  });

  it('fighters with empty tubes return to the carrier and rearm after hangar time', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 5, {}));
    let fighter;
    for (let i = 0; i < 1200 && !fighter; i++) {
      sim.step();
      fighter = sim.ships.find((s) => s.role === 'fighter' && s.alive && s.carrierId);
    }
    expect(fighter).toBeDefined();
    const carrier = sim.getShip(fighter!.carrierId!)!;
    for (const w of fighter!.weapons) if (w.ammo !== undefined) w.ammo = 0;
    fighter!.rearming = true;
    // Park the fighter alongside its carrier; the hangar reloads it after REARM time.
    for (let i = 0; i < 400 && fighter!.rearming; i++) {
      fighter!.pos = { ...carrier.pos };
      sim.step();
    }
    expect(fighter!.rearming).toBe(false);
    expect(fighter!.weapons.filter((w) => w.def.magazine !== undefined).every((w) => w.ammo === w.def.magazine)).toBe(true);
    expect(sim.events.some((e) => e.type === 'fighter_rearmed' && e.shipId === fighter!.id)).toBe(true);
  });

  it('point-defence mounts pause to recover after a burst', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 7, {}));
    const cruiser = sim.ships.find((s) => s.classId === 'alliance_cruiser')!;
    for (const w of cruiser.weapons.filter((w) => w.def.kind === 'gardian')) expect(w.burstLeft).toBe(getWeapon('gardian').burst?.shots);
    let sawRecovery = false;
    for (let i = 0; i < 4000 && !sim.finished && !sawRecovery; i++) {
      sim.step();
      if (sim.ships.some((s) => s.weapons.some((w) => w.def.burst && (w.burstLeft ?? 1) <= 0 && w.burstRecover > 0))) sawRecovery = true;
    }
    expect(sawRecovery).toBe(true);
  });

  it('is still deterministic with ammunition and bursts', () => {
    const run = () => new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 8, {})).run();
    const a = run();
    const b = run();
    expect(a.sides.A.destroyed).toBe(b.sides.A.destroyed);
    expect(a.sides.B.destroyed).toBe(b.sides.B.destroyed);
    expect(a.duration).toBe(b.duration);
  });
});
